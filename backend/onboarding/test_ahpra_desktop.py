import copy
import hashlib
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.admin.sites import AdminSite
from django.core import mail
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import make_user
from onboarding.admin import AhpraCheckAdmin
from onboarding.models import AhpraCheck, PharmacistOnboarding
from onboarding.routing import websocket_urlpatterns
from onboarding.tasks import alert_overdue_ahpra_checks, recheck_ahpra_registrations, verify_ahpra_task
from onboarding.verification.desktop import apply_ahpra_result, claim_checks, enqueue_check, valid_result
from users.jwt_ws import JWTAuthMiddlewareStack

NUMBER = 'PHA0001234567'
TOKEN = 'test-desktop-secret'
DIGEST = hashlib.sha256(TOKEN.encode()).hexdigest()


def profile_fixture():
    user = make_user('PHARMACIST', first_name='Jane', last_name='Doe')
    return PharmacistOnboarding.objects.create(user=user, ahpra_number=NUMBER)


def check_fixture(profile, **kwargs):
    return AhpraCheck.objects.create(model_name='PharmacistOnboarding', object_pk=profile.pk,
                                     registration_number=NUMBER, reason='onboarding', **kwargs)


def result(check_id, outcome='found', **record):
    return {'type': 'result', 'check_id': check_id, 'outcome': outcome,
            'checked_at': timezone.now().isoformat(), 'error': '',
            'register': dict(name='Jane Doe', profession='Pharmacy', registration_status='Registered',
                             registration_type='General', expiry_date='2099-01-02', conditions=False,
                             undertakings=False, reprimands=False) | record if outcome == 'found' else None}


@override_settings(AHPRA_SOURCE='desktop', AHPRA_RECHECK_DAYS=30,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', ADMINS=[('Admin', 'admin@example.test')])
class DesktopTests(TestCase):
    def setUp(self):
        self.profile = profile_fixture()

    def test_found_outcomes_and_duplicate_result(self):
        for changes, expected in [({}, 'verified'), ({'name': 'Other Person'}, 'review'),
                                  ({'registration_status': 'Suspended'}, 'rejected')]:
            with self.subTest(outcome=expected):
                check = check_fixture(self.profile)
                self.assertTrue(apply_ahpra_result(check, result(check.pk, **changes)))
                check.refresh_from_db()
                self.profile.refresh_from_db()
                self.assertEqual(check.outcome, expected)
                self.assertEqual(check.status, 'done')
                self.assertEqual(self.profile.ahpra_verified, expected == 'verified')
                self.assertEqual(self.profile.ahpra_expiry_date.isoformat(), '2099-01-02')
                self.assertFalse(apply_ahpra_result(check, result(check.pk, 'not_found')))

    def test_not_found_blocked_error(self):
        for outcome in ('not_found', 'blocked', 'error'):
            with self.subTest(outcome=outcome):
                self.profile.ahpra_verified = True
                self.profile.ahpra_verification_note = 'Previously verified'
                self.profile.save()
                check = check_fixture(self.profile)
                self.assertTrue(apply_ahpra_result(check, result(check.pk, outcome)))
                check.refresh_from_db()
                self.profile.refresh_from_db()
                self.assertEqual(check.outcome, outcome)
                self.assertEqual(self.profile.ahpra_verified, outcome != 'not_found')
                if outcome == 'not_found':
                    self.assertEqual(self.profile.ahpra_verification_note, 'Registration number not found on the AHPRA register')
                else:
                    self.assertEqual(self.profile.ahpra_verification_note, 'Previously verified')

    def test_found_without_name_or_status_is_error_and_leaves_profile_unchanged(self):
        self.profile.ahpra_verified = True
        self.profile.ahpra_verification_note = 'Previously verified'
        self.profile.ahpra_registration_status = 'Registered'
        self.profile.save()
        before = PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get()
        for field in ('name', 'registration_status'):
            for blank in ('', '   '):
                with self.subTest(field=field, blank=blank):
                    check = check_fixture(self.profile)
                    self.assertTrue(apply_ahpra_result(check, result(check.pk, **{field: blank})))
                    check.refresh_from_db()
                    self.assertEqual(check.outcome, 'error')
                    self.assertEqual(PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get(), before)

    def test_shape_validation(self):
        good = result(1)
        self.assertTrue(valid_result(good))
        for key, value in [('check_id', True), ('checked_at', 'bad'), ('outcome', 'verified'), ('register', None)]:
            bad = dict(good, **{key: value})
            self.assertFalse(valid_result(bad))
        for key, value in [('conditions', 'false'), ('expiry_date', '2099-02-30'), ('name', 123)]:
            bad = copy.deepcopy(good)
            bad['register'][key] = value
            self.assertFalse(valid_result(bad))
        self.assertFalse(valid_result(dict(good, unexpected=True)))

    def test_stale_profile_result_does_not_update(self):
        check = check_fixture(self.profile)
        self.profile.ahpra_number = 'PHA9991234567'
        self.profile.save()
        apply_ahpra_result(check, result(check.pk))
        check.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(check.outcome, 'error')
        self.assertFalse(self.profile.ahpra_verified)

    def test_enqueue_deduplicates_and_pushes_after_commit(self):
        with patch('onboarding.verification.desktop.get_channel_layer') as layer:
            from unittest.mock import AsyncMock
            layer.return_value.group_send = AsyncMock()
            with self.captureOnCommitCallbacks(execute=True):
                one = enqueue_check(self.profile, NUMBER, 'onboarding')
                two = enqueue_check(self.profile, NUMBER, 'recheck')
            self.assertEqual(one.pk, two.pk)
            layer.return_value.group_send.assert_awaited_once_with('ahpra_verifiers', {'type': 'ahpra.check', 'check_id': one.pk})

    def test_claim_pending_and_stale_sent_only(self):
        check = check_fixture(self.profile)
        self.assertEqual(len(claim_checks()), 1)
        self.assertEqual(claim_checks(), [])
        AhpraCheck.objects.filter(pk=check.pk).update(sent_at=timezone.now() - timedelta(minutes=6))
        self.assertEqual(len(claim_checks()), 1)
        AhpraCheck.objects.filter(pk=check.pk).update(status='done')
        self.assertEqual(claim_checks(), [])

    def test_admin_actions(self):
        check = check_fixture(self.profile)
        admin = AhpraCheckAdmin(AhpraCheck, AdminSite())
        request = SimpleNamespace(user=self.profile.user)
        for action, expected in [(admin.mark_verified, True), (admin.mark_rejected, False)]:
            action(request, AhpraCheck.objects.filter(pk=check.pk))
            check.refresh_from_db()
            self.profile.refresh_from_db()
            self.assertEqual(self.profile.ahpra_verified, expected)
            self.assertEqual(check.reviewed_by, request.user)
            self.assertEqual(check.status, 'done')
            self.assertIsNotNone(check.reviewed_at)
            self.assertIn('Manually ', self.profile.ahpra_verification_note)
        self.assertIn('Open AHPRA register', admin.open_register(check))

    def test_recheck_due_and_no_duplicates(self):
        self.profile.ahpra_verified = True
        self.profile.save()
        recheck_ahpra_registrations()
        recheck_ahpra_registrations()
        self.assertEqual(AhpraCheck.objects.count(), 1)
        check = AhpraCheck.objects.get()
        self.assertEqual(check.reason, 'recheck')
        check.status, check.completed_at = 'done', timezone.now()
        check.save()
        recheck_ahpra_registrations()
        self.assertEqual(AhpraCheck.objects.count(), 1)
        self.profile.ahpra_expiry_date = timezone.now().date() + timedelta(days=20)
        self.profile.save()
        recheck_ahpra_registrations()
        self.assertEqual(AhpraCheck.objects.count(), 2)

    def test_recheck_last_done_old(self):
        self.profile.ahpra_verified = True
        self.profile.save()
        check_fixture(self.profile, status='done', completed_at=timezone.now() - timedelta(days=31))
        recheck_ahpra_registrations()
        self.assertEqual(AhpraCheck.objects.filter(status='pending').count(), 1)

    def test_overdue_once_and_excludes_done_and_fresh(self):
        check = check_fixture(self.profile)
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 0)
        AhpraCheck.objects.filter(pk=check.pk).update(created_at=timezone.now() - timedelta(minutes=16))
        alert_overdue_ahpra_checks()
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 1)
        check.refresh_from_db()
        self.assertIsNotNone(check.alerted_at)
        AhpraCheck.objects.filter(pk=check.pk).update(status='done', alerted_at=None)
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(AHPRA_SOURCE='scrapingbee')
    def test_beat_noop_for_scrapingbee(self):
        check_fixture(self.profile)
        recheck_ahpra_registrations()
        alert_overdue_ahpra_checks()
        self.assertEqual(AhpraCheck.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(ADMINS=[])
    def test_no_recipients_does_not_mark_alert_delivered(self):
        check = check_fixture(self.profile)
        AhpraCheck.objects.filter(pk=check.pk).update(created_at=timezone.now() - timedelta(minutes=16))
        alert_overdue_ahpra_checks()
        check.refresh_from_db()
        self.assertIsNone(check.alerted_at)

    @patch('onboarding.tasks.ahpra_lookup')
    def test_desktop_switch_and_skip_rules(self, lookup):
        args = ('PharmacistOnboarding', self.profile.pk, NUMBER, 'Jane', 'Doe', self.profile.user.email)
        verify_ahpra_task(*args)
        verify_ahpra_task(*args)
        self.assertEqual(AhpraCheck.objects.count(), 1)
        lookup.assert_not_called()
        AhpraCheck.objects.all().delete()
        verify_ahpra_task(*args, role='student')
        verify_ahpra_task(*args[:2], 'invalid', *args[3:])
        self.profile.ahpra_verified = True
        self.profile.save()
        verify_ahpra_task(*args)
        self.assertFalse(AhpraCheck.objects.exists())

    @override_settings(AHPRA_SOURCE='scrapingbee')
    @patch('onboarding.tasks.parse_ahpra_html')
    @patch('onboarding.tasks.ahpra_lookup')
    def test_scrapingbee_switch(self, lookup, parse):
        parse.return_value = dict(result(1)['register'], practitioner_name='Jane Doe')
        verify_ahpra_task('PharmacistOnboarding', self.profile.pk, NUMBER, 'Jane', 'Doe', self.profile.user.email)
        lookup.assert_called_once()
        self.assertFalse(AhpraCheck.objects.exists())


@override_settings(AHPRA_VERIFIER_TOKEN_SHA256=DIGEST,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class VerifierSocketTests(TransactionTestCase):
    def setUp(self):
        self.profile = profile_fixture()
        self.check = check_fixture(self.profile)

    def communicator(self, headers=None):
        return WebsocketCommunicator(JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
                                     '/ws/ahpra-verifier/', headers=headers or [])

    async def test_header_and_hello_auth_replay_without_names(self):
        for headers in ([], [(b'authorization', f'Bearer {TOKEN}'.encode())]):
            socket = self.communicator(headers)
            self.assertTrue((await socket.connect())[0])
            await socket.send_json_to({'type': 'hello', 'agent': 'bridge', **({} if headers else {'token': TOKEN})})
            self.assertEqual(await socket.receive_json_from(), {'type': 'ready'})
            self.assertEqual(await socket.receive_json_from(), {'type': 'check', 'check_id': self.check.pk, 'registration_number': NUMBER})
            await socket.disconnect()
            await database_sync_to_async(AhpraCheck.objects.filter(pk=self.check.pk).update)(sent_at=timezone.now() - timedelta(minutes=6))

    async def test_bad_header(self):
        socket = self.communicator([(b'authorization', b'Bearer bad')])
        self.assertEqual(await socket.connect(), (False, 4401))
        await socket.disconnect()

    async def test_bad_and_missing_hello_token(self):
        for token in ('bad', None):
            socket = self.communicator()
            await socket.connect()
            await socket.send_json_to({'type': 'hello', 'agent': 'bridge', 'token': token})
            self.assertEqual((await socket.receive_output())['code'], 4401)
            await socket.disconnect()

    @override_settings(AHPRA_VERIFIER_TOKEN_SHA256='')
    async def test_disabled(self):
        socket = self.communicator()
        self.assertEqual(await socket.connect(), (False, 4401))
        await socket.disconnect()

    async def test_result_ack_unknown_done_and_malformed_ignored(self):
        socket = self.communicator()
        await socket.connect()
        await socket.send_json_to({'type': 'hello', 'agent': 'bridge', 'token': TOKEN})
        await socket.receive_json_from()
        await socket.receive_json_from()
        await socket.send_json_to(result(999999))
        self.assertTrue(await socket.receive_nothing())
        await socket.send_json_to({'type': 'result', 'check_id': self.check.pk})
        self.assertTrue(await socket.receive_nothing())
        await socket.send_json_to(result(self.check.pk))
        self.assertEqual(await socket.receive_json_from(), {'type': 'ack', 'check_id': self.check.pk})
        await socket.send_json_to(result(self.check.pk))
        self.assertTrue(await socket.receive_nothing())
        await socket.disconnect()
        await database_sync_to_async(self.profile.refresh_from_db)()
        self.assertTrue(self.profile.ahpra_verified)

    async def test_live_push_and_all_result_outcomes(self):
        socket = self.communicator()
        await socket.connect()
        await socket.send_json_to({'type': 'hello', 'agent': 'bridge', 'token': TOKEN})
        await socket.receive_json_from()
        await socket.receive_json_from()
        await socket.send_json_to(result(self.check.pk))
        await socket.receive_json_from()
        for outcome, record, expected in [
            ('found', {'conditions': True}, 'review'),
            ('found', {'registration_status': 'Cancelled'}, 'rejected'),
            ('not_found', {}, 'not_found'), ('blocked', {}, 'blocked'), ('error', {}, 'error'),
        ]:
            check = await database_sync_to_async(enqueue_check)(self.profile, NUMBER, 'recheck')
            self.assertEqual(await socket.receive_json_from(), {'type': 'check', 'check_id': check.pk, 'registration_number': NUMBER})
            await socket.send_json_to(result(check.pk, outcome, **record))
            self.assertEqual(await socket.receive_json_from(), {'type': 'ack', 'check_id': check.pk})
            await database_sync_to_async(check.refresh_from_db)()
            self.assertEqual(check.outcome, expected)
        await socket.send_json_to({'type': 'pong'})
        self.assertTrue(await socket.receive_nothing())
        await socket.disconnect()
