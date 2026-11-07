"""A consumed pitch key never creates another pitch, even after its receipt is gone."""
from datetime import timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import mock, skipUnless
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
from talent.models import ExplorerPost

URL = '/api/v1/explorer-posts/'
PAYLOAD = {'headline': 'Available', 'body': 'Original pitch', 'role_category': 'OTHER_STAFF'}
User = get_user_model()


def worker(role='OTHER_STAFF'):
    user = User.objects.create_user(email=f'{uuid4()}@example.test', password='test',
                                    role=role, is_mobile_verified=True, is_otp_verified=True)
    model = {'OTHER_STAFF': OtherStaffOnboarding, 'PHARMACIST': PharmacistOnboarding,
             'EXPLORER': ExplorerOnboarding}[role]
    extra = {'ahpra_verified': True, 'ahpra_expiry_date': timezone.localdate() + timedelta(days=30)} if role == 'PHARMACIST' else {}
    model.objects.create(user=user, verified=True, **extra)
    return user


def submit(user, key, payload=None):
    client = APIClient()
    client.force_authenticate(user)
    return client.post(URL, PAYLOAD if payload is None else payload, format='json',
                       **({'HTTP_IDEMPOTENCY_KEY': key} if key is not None else {}))


class PitchReceiptTests(TestCase):
    def setUp(self):
        self.user, self.key = worker(), str(uuid4())

    def ledger(self):
        from talent.models import PitchCreateRequest
        return PitchCreateRequest.objects

    def test_key_required_including_malformed_uuid(self):
        for key in (None, '', 'invalid'):
            response = submit(self.user, key)
            self.assertEqual((response.status_code, response.data.get('code')), (400, 'IDEMPOTENCY_KEY_REQUIRED'))
        self.assertFalse(ExplorerPost.objects.exists())

    def test_fresh_client_replays_original_after_edit_and_hide(self):
        first = submit(self.user, self.key)
        self.assertEqual(first.status_code, 201, first.data)
        client = APIClient()
        client.force_authenticate(self.user)
        self.assertEqual(client.patch(f"{URL}{first.data['id']}/", {'body': 'Edited'}, format='json').status_code, 200)
        ExplorerPost.objects.filter(pk=first.data['id']).update(hidden_at=timezone.now())
        replay = submit(User.objects.get(pk=self.user.pk), self.key)
        self.assertEqual((replay.status_code, replay.data), (201, first.data))
        self.assertEqual(ExplorerPost.objects.get().body, 'Edited')
        self.assertIsNotNone(ExplorerPost.objects.get().hidden_at)
        self.assertEqual(self.ledger().count(), 1)

    def test_payload_mismatch_precedes_validation_deletion_and_expiry(self):
        first = submit(self.user, self.key)
        ExplorerPost.objects.all().delete()
        self.ledger().update(replay_expires_at=timezone.now() - timedelta(days=1))
        response = submit(self.user, self.key, {'headline': None})
        self.assertEqual((response.status_code, response.data['code'], response.data['post_id']),
                         (409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', first.data['id']))

    def test_replay_precedes_unique_reference_validation(self):
        from talent.views.explorer import ExplorerPostViewSet
        payload = {**PAYLOAD, 'reference_code': 'FIXED-REFERENCE'}
        with mock.patch.object(ExplorerPostViewSet, 'get_success_headers', return_value={'Location': '/original-pitch/'}):
            first = submit(self.user, self.key, payload)
        self.assertEqual(first.status_code, 201, first.data)
        replay = submit(self.user, self.key, payload)
        self.assertEqual(replay.data, first.data)
        self.assertEqual(replay['Location'], first['Location'])

    def test_all_pitch_deletion_routes_leave_tombstones(self):
        from talent.account_cleanup import remove_newcomer_posts
        for route in ('api', 'bulk', 'conversion', 'cascade'):
            user, key = worker('EXPLORER'), str(uuid4())
            payload = {**PAYLOAD, 'role_category': 'EXPLORER'}
            first = submit(user, key, payload)
            self.assertEqual(first.status_code, 201, first.data)
            if route == 'api':
                client = APIClient(); client.force_authenticate(user)
                self.assertEqual(client.delete(f"{URL}{first.data['id']}/").status_code, 204)
            elif route == 'bulk':
                ExplorerPost.objects.filter(pk=first.data['id']).delete()
            elif route == 'conversion':
                remove_newcomer_posts(user)
            else:
                ExplorerOnboarding.objects.filter(user=user).delete()
                ExplorerOnboarding.objects.create(user=user, verified=True)
            response = submit(user, key, payload)
            self.assertEqual((response.status_code, response.data['code']), (410, 'PITCH_DELETED'), route)
        self.assertEqual(self.ledger().count(), 4)
        self.assertFalse(ExplorerPost.objects.exists())

    def test_expiry_boundary_and_cleanup_keep_key(self):
        first = submit(self.user, self.key)
        receipt = self.ledger().get()
        self.assertEqual(receipt.replay_expires_at - receipt.created_at, timedelta(days=30))
        with mock.patch('talent.views.explorer.timezone.now', return_value=receipt.replay_expires_at - timedelta(microseconds=1)):
            self.assertEqual(submit(self.user, self.key).status_code, 201)
        with mock.patch('talent.views.explorer.timezone.now', return_value=receipt.replay_expires_at):
            response = submit(self.user, self.key)
            self.assertEqual((response.status_code, response.data['code']), (410, 'IDEMPOTENCY_REPLAY_EXPIRED'))
        self.ledger().update(replay_expires_at=timezone.now() - timedelta(seconds=1))
        call_command('cleanup_pitch_receipts', verbosity=0)
        receipt.refresh_from_db()
        self.assertIsNone(receipt.response_body)
        self.assertEqual(receipt.response_headers, {})
        self.assertTrue(receipt.fingerprint)
        self.assertEqual(submit(self.user, self.key).status_code, 410)
        self.assertEqual(ExplorerPost.objects.count(), 1)

    def test_account_soft_deletion_purges_receipts(self):
        from users.account_deletion import _anonymize_user
        submit(self.user, self.key)
        with mock.patch('users.account_deletion.transaction.on_commit'):
            _anonymize_user(self.user)
        self.assertFalse(self.ledger().exists())
        self.assertFalse(ExplorerPost.objects.exists())

    def test_failure_after_pitch_save_rolls_back_and_retry_succeeds(self):
        from talent.views.explorer import ExplorerPostViewSet
        with mock.patch.object(ExplorerPostViewSet, 'get_success_headers', side_effect=RuntimeError('receipt failed')):
            with self.assertRaisesMessage(RuntimeError, 'receipt failed'):
                submit(self.user, self.key)
        self.assertFalse(ExplorerPost.objects.exists())
        self.assertFalse(self.ledger().exists())
        self.assertEqual(submit(self.user, self.key).status_code, 201)

    def test_validation_failure_does_not_consume_key(self):
        self.assertEqual(submit(self.user, self.key, {'headline': ''}).status_code, 400)
        self.assertFalse(self.ledger().exists())
        self.assertEqual(submit(self.user, self.key).status_code, 201)

    def test_eligible_roles_and_author_scopes_and_new_intentions(self):
        for role in ('PHARMACIST', 'OTHER_STAFF', 'EXPLORER'):
            user = worker(role)
            payload = {**PAYLOAD, 'role_category': role}
            first = submit(user, self.key, payload)
            self.assertEqual(first.status_code, 201, first.data)
            self.assertEqual(submit(user, self.key, payload).data, first.data)
            self.assertEqual(submit(user, str(uuid4()), payload).status_code, 400 if role == 'EXPLORER' else 201)
        self.assertEqual(ExplorerPost.objects.count(), 5)

    def test_replay_still_requires_current_access(self):
        submit(self.user, self.key)
        OtherStaffOnboarding.objects.filter(user=self.user).update(verified=False)
        self.assertEqual(submit(self.user, self.key).status_code, 403)
        self.assertIn(submit(None, self.key).status_code, (401, 403))
        pharmacist = worker('PHARMACIST')
        PharmacistOnboarding.objects.filter(user=pharmacist).update(ahpra_expiry_date=timezone.localdate() - timedelta(days=1))
        self.assertEqual(submit(pharmacist, str(uuid4())).status_code, 403)
        OtherStaffOnboarding.objects.filter(user=self.user).update(verified=True)
        stranger = worker('EXPLORER')
        response = submit(self.user, str(uuid4()), {**PAYLOAD, 'explorer_profile': ExplorerOnboarding.objects.get(user=stranger).pk})
        self.assertEqual(response.status_code, 400)  # Existing serializer ownership validation.
        self.assertIn('You can only post from your own explorer profile.', str(response.data))
        self.assertEqual(ExplorerPost.objects.count(), 1)
        self.assertEqual(self.ledger().count(), 1)

    def test_fingerprint_preserves_types_array_order_and_omitted_null(self):
        for changed in ({**PAYLOAD, 'availability_mode': None}, {**PAYLOAD, 'open_to_travel': False}):
            key = str(uuid4())
            self.assertEqual(submit(self.user, key).status_code, 201)
            self.assertEqual(submit(self.user, key, changed).status_code, 409)
        key = str(uuid4())
        payload = {**PAYLOAD, 'work_types': ['CASUAL', 'PART_TIME']}
        first = submit(self.user, key, payload)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(submit(self.user, key, dict(reversed(list(payload.items())))).data, first.data)
        self.assertEqual(submit(self.user, key, {**payload, 'work_types': ['PART_TIME', 'CASUAL']}).status_code, 409)

    def test_multipart_replays_without_revalidation(self):
        client = APIClient(); client.force_authenticate(self.user)
        first = client.post(URL, PAYLOAD, HTTP_IDEMPOTENCY_KEY=self.key)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(client.post(URL, PAYLOAD, HTTP_IDEMPOTENCY_KEY=self.key).data, first.data)


@skipUnless(connection.vendor == 'postgresql', 'PostgreSQL constraint/lock semantics required')
class PitchPostgresConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.user, self.key = worker(), str(uuid4())

    def race(self, requests):
        barrier, results = Barrier(2), Queue()
        def run(user, key, payload):
            close_old_connections()
            try:
                user = User.objects.get(pk=user.pk)
                barrier.wait(timeout=10)  # Before reservation; never wait while holding its lock.
                response = submit(user, key, payload)
                results.put((response.status_code, response.data))
            except Exception as exc:
                results.put(('exception', repr(exc)))
            finally:
                close_old_connections()
        threads = [Thread(target=run, args=args) for args in requests]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=30)
        self.assertFalse(any(thread.is_alive() for thread in threads), 'pitch race timed out')
        outcomes = [results.get(timeout=5) for _ in threads]
        self.assertNotIn('exception', [status for status, _ in outcomes], outcomes)
        return outcomes

    def test_same_key_race_and_lost_response(self):
        outcomes = self.race([(self.user, self.key, PAYLOAD)] * 2)
        self.assertEqual([s for s, _ in outcomes], [201, 201], outcomes)
        self.assertEqual(outcomes[0][1], outcomes[1][1])
        self.assertEqual(submit(self.user, self.key).data, outcomes[0][1])
        self.assertEqual(ExplorerPost.objects.count(), 1)
        from talent.models import PitchCreateRequest
        self.assertEqual(PitchCreateRequest.objects.count(), 1)

    def test_changed_payload_race(self):
        outcomes = self.race([(self.user, self.key, PAYLOAD), (self.user, self.key, {**PAYLOAD, 'body': 'Different'})])
        self.assertEqual(sorted(s for s, _ in outcomes), [201, 409], outcomes)
        self.assertEqual(ExplorerPost.objects.count(), 1)

    def test_different_authors_same_key_are_private(self):
        other = worker()
        outcomes = self.race([(self.user, self.key, PAYLOAD), (other, self.key, PAYLOAD)])
        self.assertEqual([s for s, _ in outcomes], [201, 201], outcomes)
        self.assertNotEqual(outcomes[0][1]['id'], outcomes[1][1]['id'])
        self.assertEqual(ExplorerPost.objects.count(), 2)

    def test_newcomer_different_keys_still_create_once(self):
        user = worker('EXPLORER')
        outcomes = self.race([(user, str(uuid4()), {**PAYLOAD, 'role_category': 'EXPLORER'}) for _ in range(2)])
        self.assertEqual(sorted(s for s, _ in outcomes), [201, 400], outcomes)
        self.assertEqual(ExplorerPost.objects.count(), 1)

    def test_professional_different_keys_still_create_twice(self):
        outcomes = self.race([(self.user, str(uuid4()), PAYLOAD) for _ in range(2)])
        self.assertEqual([s for s, _ in outcomes], [201, 201], outcomes)
        self.assertEqual(ExplorerPost.objects.count(), 2)

    def race_with_replay(self, command):
        submit(self.user, self.key)
        barrier, results = Barrier(2), Queue()
        def run(action):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                results.put(action())
            except Exception as exc:
                results.put(('exception', repr(exc)))
            finally:
                close_old_connections()
        def replay():
            response = submit(User.objects.get(pk=self.user.pk), self.key)
            return ('replay', response.status_code)
        threads = [Thread(target=run, args=(replay,)), Thread(target=run, args=(command,))]
        for thread in threads: thread.start()
        for thread in threads: thread.join(timeout=30)
        self.assertFalse(any(thread.is_alive() for thread in threads))
        outcomes = dict(results.get(timeout=5) for _ in threads)
        self.assertNotIn('exception', outcomes, outcomes)
        return outcomes

    def test_delete_racing_replay_never_resurrects(self):
        def delete():
            ExplorerPost.objects.all().delete()
            return ('deleted', True)
        outcomes = self.race_with_replay(delete)
        self.assertIn(outcomes['replay'], (201, 410))
        self.assertEqual(submit(self.user, self.key).status_code, 410)
        self.assertFalse(ExplorerPost.objects.exists())

    def test_expired_cleanup_racing_replay_never_reopens_key(self):
        from talent.models import PitchCreateRequest
        submit(self.user, self.key)
        PitchCreateRequest.objects.update(replay_expires_at=timezone.now() - timedelta(seconds=1))
        def cleanup():
            call_command('cleanup_pitch_receipts', verbosity=0)
            return ('cleaned', True)
        outcomes = self.race_with_replay(cleanup)
        self.assertEqual(outcomes['replay'], 410)
        self.assertEqual(ExplorerPost.objects.count(), 1)
