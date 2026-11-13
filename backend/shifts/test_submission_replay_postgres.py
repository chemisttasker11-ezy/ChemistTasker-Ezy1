"""Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
409 payload mismatch includes existing shift_id; replay rechecks current authorization.
"""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import mock, skipUnless

from django.db import close_old_connections, connection, connections
from django.test import TransactionTestCase

from client_profile.characterization_support import client_for
from shifts.models import Shift, ShiftSlot, ShiftCounterOffer, ShiftInterest
from shifts import test_submission_replay as replay
from shifts import test_shift_actions_contract as actions
from shifts import test_shift_posting_contract as posting


@skipUnless(connection.vendor == 'postgresql', 'PostgreSQL separate-connection replay races')
class SubmissionReplayPostgresTests(TransactionTestCase):
    worker = actions.ShiftActionFixture.worker
    shift = actions.ShiftActionFixture.shift
    payload = posting.ShiftPostingFixture.payload

    def setUp(self):
        posting.ShiftPostingFixture.setUp(self)

    def race(self, user, url, payload):
        barrier = Barrier(2)

        def send():
            close_old_connections()
            try:
                fresh_user = type(user).objects.get(pk=user.pk)
                client = client_for(fresh_user)
                barrier.wait(timeout=10)
                response = client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=replay.KEY)
                return response.status_code, response.data
            finally:
                connections.close_all()

        with posting.queued_emails(), ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(send) for _ in range(2)]
            return [future.result(timeout=30) for future in futures]

    def test_identical_keys_parallel_create_one_shift(self):
        with mock.patch('shifts.posting.announce_posted_shift') as announce:
            replies = self.race(self.owner, '/api/v1/shifts/', self.payload())
        self.assertEqual(Shift.objects.count(), 1, 'parallel retries created two shifts')
        self.assertEqual(ShiftSlot.objects.count(), 2)
        self.assertEqual([status for status, _ in replies], [201, 201])
        self.assertEqual(replies[0], replies[1])
        self.assertEqual(announce.call_count, 1)

    def test_identical_keys_parallel_create_one_counter_offer(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, rate_type='FLEXIBLE')
        slot = shift.slots.get()
        payload = {'request_travel': False, 'slots': [{
            'slot_id': slot.pk, 'slot_date': str(slot.date), 'proposed_start_time': '09:00:00',
            'proposed_end_time': '17:00:00', 'proposed_rate': '75.00',
        }]}
        replies = self.race(worker, f'/api/v1/shifts/{shift.pk}/counter-offers/', payload)
        self.assertEqual(ShiftCounterOffer.objects.count(), 1, 'parallel retries created two offers')
        self.assertEqual(ShiftInterest.objects.count(), 1)
        self.assertEqual(len(actions.notifications_for(self.owner, 'shift_counter_offer_received')), 1)
        self.assertEqual([status for status, _ in replies], [201, 201])
        self.assertEqual(replies[0], replies[1])
