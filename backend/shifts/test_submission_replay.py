"""Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
409 payload mismatch includes existing shift_id; replay rechecks current authorization.
"""
from copy import deepcopy
from unittest import mock

from django.test import TestCase, TransactionTestCase
from django.db import transaction
from django.db.models.signals import post_save

from client_profile.characterization_support import client_for, make_user
from memberships.models import Membership
from notifications.models import Notification
from onboarding.models import PharmacistOnboarding
from organizations.models import PharmacyAdmin
from shifts.models import Shift, ShiftSlot, ShiftCounterOffer, ShiftInterest
from shifts import test_shift_posting_contract as posting
from shifts import test_shift_actions_contract as actions

ROUTES = (
    'shifts/', 'community-shifts/', 'public-shifts/', 'shifts/active/',
    'shifts/confirmed/', 'shifts/history/', 'my-confirmed-shifts/', 'my-history-shifts/',
)
KEY = '165416cf-c485-4aad-8914-d7580f831843'
NEW_KEY = '265416cf-c485-4aad-8914-d7580f831843'


class ShiftSubmissionReplayTests(TransactionTestCase):
    setUp = posting.ShiftPostingFixture.setUp
    payload = posting.ShiftPostingFixture.payload
    member = posting.ShiftPostingFixture.member

    def manager(self):
        user = make_user('PHARMACY_MANAGER')
        PharmacyAdmin.objects.create(user=user, pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER, is_active=True)
        return user

    def send(self, route='shifts/', *, user=None, key=KEY, payload=None):
        if user is None and route.startswith('my-'):
            # These inherited create routes require a worker persona as well as
            # roster authority; an OWNER alone is not an authorized control.
            if not hasattr(self, 'worker_poster'):
                self.worker_poster = self.member('FULL_TIME')
                PharmacyAdmin.objects.create(user=self.worker_poster, pharmacy=self.pharmacy,
                    admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER, is_active=True)
            user = self.worker_poster
        headers = {'HTTP_IDEMPOTENCY_KEY': key} if key else {}
        # Real TransactionTestCase commits; capture also supports implementations
        # that register their announcements at an outer transaction boundary.
        with posting.queued_emails(), TestCase.captureOnCommitCallbacks(execute=True):
            client = client_for(user or self.owner)
            # A broken inherited serializer is an HTTP contract failure, not a
            # test-runner exception. Keep the required 201 assertion below.
            client.raise_request_exception = False
            response = client.post(
                '/api/v1/' + route, payload or self.payload(), format='json', **headers,
            )
        return response

    def lost_response(self, route='shifts/', **kwargs):
        audit = self.send(route, **kwargs)
        self.assertEqual(audit.status_code, 201, getattr(audit, 'data', audit.reason_phrase))
        self.assertTrue(Shift.objects.filter(pk=audit.data['id']).exists())
        # Request completed and committed. Only this test's audit retains its reply.
        expected = (audit.status_code, deepcopy(audit.data))
        del audit
        return expected

    def test_every_inherited_create_route_replays_one_shift_and_exact_response(self):
        for route in ROUTES:
            with self.subTest(route=route):
                key = route.replace('/', '-') + KEY
                before = Shift.objects.count()
                expected = self.lost_response(route, key=key)
                retry = self.send(route, key=key)
                self.assertEqual(Shift.objects.count() - before, 1, 'retry created a second shift')
                self.assertEqual((retry.status_code, retry.data), expected)

    def test_primary_routes_replay_one_slot_set(self):
        for route in ROUTES[:3]:
            with self.subTest(route=route):
                before = ShiftSlot.objects.count()
                self.lost_response(route, key=route + KEY)
                self.send(route, key=route + KEY)
                self.assertEqual(ShiftSlot.objects.count() - before, 2, 'retry created a second slot set')

    def test_primary_routes_announce_once_after_commit(self):
        for route in ROUTES[:3]:
            with self.subTest(route=route), mock.patch('shifts.posting.announce_posted_shift') as announce:
                self.lost_response(route, key=route + KEY)
                self.assertEqual(announce.call_count, 1, 'first request must announce after commit')
                self.send(route, key=route + KEY)
                self.assertEqual(announce.call_count, 1, 'retry announced a second shift')

    def test_replay_does_not_send_second_notification(self):
        worker = self.member('FULL_TIME')
        payload = self.payload(notify_pharmacy_staff=True)
        self.lost_response(payload=payload)
        self.send(payload=payload)
        self.assertEqual(Notification.objects.filter(user=worker, title='New shift available').count(), 1)

    def test_keyed_shift_announcement_waits_for_commit(self):
        with posting.queued_emails(), mock.patch('shifts.posting.announce_posted_shift') as announce:
            with transaction.atomic():
                response = client_for(self.owner).post('/api/v1/shifts/', self.payload(),
                    format='json', HTTP_IDEMPOTENCY_KEY=KEY)
                self.assertEqual(response.status_code, 201, response.data)
                announce.assert_not_called()
            announce.assert_called_once()

    def test_mismatch_returns_conflict_and_original_shift_without_writes(self):
        _, body = self.lost_response()
        before = (Shift.objects.count(), ShiftSlot.objects.count(), Notification.objects.count())
        response = self.send(payload=self.payload(description='Changed after timeout'))
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data.get('code'), 'IDEMPOTENCY_PAYLOAD_MISMATCH')
        self.assertEqual(response.data.get('shift_id'), body['id'])
        self.assertEqual((Shift.objects.count(), ShiftSlot.objects.count(), Notification.objects.count()), before)

    def test_revoked_pharmacy_access_refuses_replay_without_saved_outcome(self):
        manager = self.manager()
        _, body = self.lost_response(user=manager)
        PharmacyAdmin.objects.filter(user=manager).update(is_active=False)
        response = self.send(user=manager)
        self.assertIn(response.status_code, (403, 404), response.data)
        self.assertNotIn('shift_id', response.data)
        self.assertNotIn('id', response.data)
        self.assertEqual(Shift.objects.count(), 1)
        self.assertTrue(Shift.objects.filter(pk=body['id']).exists())

    def test_unkeyed_authorized_web_creates_still_return_201_on_every_route(self):
        for route in ROUTES:
            with self.subTest(route=route):
                before = Shift.objects.count()
                for _ in range(2):
                    response = self.send(route, key=None)
                    self.assertEqual(response.status_code, 201, getattr(response, 'data', response.reason_phrase))
                self.assertEqual(Shift.objects.count() - before, 2)

    def test_new_key_allows_second_intent_with_identical_payload(self):
        self.lost_response()
        response = self.send(key=NEW_KEY)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Shift.objects.count(), 2)

    def test_same_key_for_two_authorized_users_is_independent(self):
        manager = self.manager()
        first = self.send()
        second = self.send(user=manager)
        self.assertEqual((first.status_code, second.status_code), (201, 201), second.data)
        self.assertNotEqual(first.data['id'], second.data['id'])
        self.assertEqual(Shift.objects.count(), 2)


class CounterOfferSubmissionReplayTests(TransactionTestCase):
    worker = actions.ShiftActionFixture.worker
    shift = actions.ShiftActionFixture.shift

    def setUp(self):
        actions.ShiftActionFixture.setUp(self)
        self.candidate = self.worker()
        self.target = self.shift(single_user_only=False, slots=2, rate_type='FLEXIBLE')
        self.slot, self.other_slot = list(self.target.slots.order_by('id'))

    def payload(self, *, slot=None, rate='75.00'):
        slot = slot or self.slot
        return {'request_travel': False, 'slots': [{
            'slot_id': slot.pk, 'slot_date': str(slot.date), 'proposed_start_time': '09:00:00',
            'proposed_end_time': '17:00:00', 'proposed_rate': rate,
        }]}

    def send(self, *, user=None, key=KEY, payload=None, shift=None, route='shifts'):
        headers = {'HTTP_IDEMPOTENCY_KEY': key} if key else {}
        with actions.queued_emails(), TestCase.captureOnCommitCallbacks(execute=True):
            return client_for(user or self.candidate).post(
                f'/api/v1/{route}/{(shift or self.target).pk}/counter-offers/',
                payload or self.payload(), format='json', **headers,
            )

    def lost_response(self, **kwargs):
        audit = self.send(**kwargs)
        self.assertEqual(audit.status_code, 201, audit.data)
        self.assertTrue(ShiftCounterOffer.objects.filter(pk=audit.data['id']).exists())
        expected = (audit.status_code, deepcopy(audit.data))
        del audit
        return expected

    def test_committed_lost_response_replays_one_offer_interest_and_response(self):
        expected = self.lost_response()
        retry = self.send()
        self.assertEqual(ShiftCounterOffer.objects.count(), 1, 'retry created a second counter-offer')
        self.assertEqual(ShiftInterest.objects.filter(shift=self.target, user=self.candidate).count(), 1)
        self.assertEqual(self.target.counter_offers.get().slots.count(), 1)
        self.assertEqual((retry.status_code, retry.data), expected)

    def test_replay_does_not_repeat_interest_work(self):
        writes = []

        def recorded_write(sender, instance, **kwargs):
            writes.append(instance.pk)

        post_save.connect(recorded_write, sender=ShiftInterest, weak=False)
        self.addCleanup(post_save.disconnect, recorded_write, sender=ShiftInterest)
        self.lost_response()
        self.send()
        self.assertEqual(len(writes), 1, 'retry repeated an interest database write')
        self.assertEqual(ShiftInterest.objects.count(), 1)

    def test_replay_does_not_send_second_notification(self):
        self.lost_response()
        self.send()
        self.assertEqual(len(actions.notifications_for(self.owner, 'shift_counter_offer_received')), 1)

    def test_counter_offer_interest_is_atomic_and_email_waits_for_commit(self):
        with actions.queued_emails(), mock.patch('shifts.counter_offers.async_task') as email:
            with transaction.atomic():
                response = client_for(self.candidate).post(
                    f'/api/v1/shifts/{self.target.pk}/counter-offers/', self.payload(),
                    format='json', HTTP_IDEMPOTENCY_KEY=KEY)
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(ShiftCounterOffer.objects.count(), 1)
                self.assertEqual(ShiftInterest.objects.count(), 1)
                self.assertEqual(email.call_count, 0, 'counter-offer announced before commit')
            self.assertEqual(email.call_count, 1)

    def test_mismatch_in_rate_slot_or_target_returns_409_without_writes(self):
        self.lost_response()
        other_shift = self.shift(single_user_only=False, rate_type='FLEXIBLE')
        for kwargs in ({'payload': self.payload(rate='90.00')},
                       {'payload': self.payload(slot=self.other_slot)},
                       {'shift': other_shift, 'payload': self.payload(slot=other_shift.slots.get())}):
            with self.subTest(change=kwargs):
                before = (ShiftCounterOffer.objects.count(), ShiftInterest.objects.count(), Notification.objects.count())
                response = self.send(**kwargs)
                self.assertEqual(response.status_code, 409, response.data)
                self.assertEqual(response.data.get('code'), 'IDEMPOTENCY_PAYLOAD_MISMATCH')
                self.assertEqual(response.data.get('shift_id'), self.target.pk)
                self.assertEqual((ShiftCounterOffer.objects.count(), ShiftInterest.objects.count(), Notification.objects.count()), before)

    def test_current_role_eligibility_is_rechecked_before_replay(self):
        self.lost_response()
        type(self.candidate).objects.filter(pk=self.candidate.pk).update(role='EXPLORER')
        self.candidate.refresh_from_db()
        response = self.send()
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        self.assertNotIn('id', response.data)
        self.assertNotIn('shift_id', response.data)
        self.assertEqual(ShiftCounterOffer.objects.count(), 1)

    def test_revoked_membership_is_rechecked_before_replay(self):
        self.lost_response(route='community-shifts')
        Membership.objects.filter(user=self.candidate).update(is_active=False)
        response = self.send(route='community-shifts')
        self.assertIn(response.status_code, (403, 404), response.data)
        self.assertNotIn('id', response.data)
        self.assertNotIn('shift_id', response.data)
        self.assertEqual(ShiftCounterOffer.objects.count(), 1)

    def test_public_verification_is_rechecked_before_replay(self):
        Membership.objects.filter(user=self.candidate).delete()
        self.target.visibility = 'PLATFORM'
        self.target.save(update_fields=['visibility'])
        self.lost_response()
        PharmacistOnboarding.objects.filter(user=self.candidate).update(verified=False)
        response = self.send()
        self.assertIn(response.status_code, (400, 403), response.data)
        self.assertNotIn('id', response.data)
        self.assertNotIn('shift_id', response.data)
        self.assertEqual(ShiftCounterOffer.objects.count(), 1)

    def test_new_keys_allow_another_slot_and_second_intentional_offer(self):
        self.lost_response()
        for key, payload in ((NEW_KEY, self.payload(slot=self.other_slot)),
                             ('365416cf-c485-4aad-8914-d7580f831843', self.payload(rate='80.00'))):
            response = self.send(key=key, payload=payload)
            self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ShiftCounterOffer.objects.count(), 3)
        self.assertEqual(ShiftInterest.objects.count(), 2)

    def test_same_key_for_two_workers_is_independent(self):
        self.lost_response()
        response = self.send(user=self.worker())
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ShiftCounterOffer.objects.count(), 2)

    def test_unkeyed_offers_remain_repeatable(self):
        for _ in range(2):
            self.assertEqual(self.send(key=None).status_code, 201)
        self.assertEqual(ShiftCounterOffer.objects.count(), 2)

    def test_same_user_key_is_independent_between_create_and_counter_offer(self):
        PharmacyAdmin.objects.create(user=self.candidate, pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER, is_active=True)
        with posting.queued_emails():
            created = client_for(self.candidate).post('/api/v1/shifts/',
                posting.ShiftPostingFixture.payload(self), format='json', HTTP_IDEMPOTENCY_KEY=KEY)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(self.send().status_code, 201)
