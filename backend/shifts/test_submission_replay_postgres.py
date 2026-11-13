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

    def test_leave_creation_and_keyed_counter_offer_both_finish(self):
        from shifts.models import ShiftSlotAssignment
        from shifts.base import request_fingerprint
        from workforce.leave_service import assignment_interval, create_leave
        from workforce.models import WorkforceLeaveRequest

        worker = self.worker()
        shift = self.shift(single_user_only=False, rate_type='FLEXIBLE')
        slot = shift.slots.get()
        assignment = ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=slot.date, user=worker)
        payload = {'request_travel': False, 'slots': [{'slot_id': slot.pk, 'slot_date': str(slot.date),
            'proposed_start_time': '09:00:00', 'proposed_end_time': '17:00:00', 'proposed_rate': '75.00'}]}
        barrier = Barrier(2)

        def fingerprint(value):
            barrier.wait(timeout=10)
            return request_fingerprint(value)

        def interval(value):
            barrier.wait(timeout=10)
            return assignment_interval(value)

        def offer():
            close_old_connections()
            try:
                response = client_for(type(worker).objects.get(pk=worker.pk)).post(
                    f'/api/v1/shifts/{shift.pk}/counter-offers/', payload, format='json', HTTP_IDEMPOTENCY_KEY=replay.KEY)
                return response.status_code
            finally:
                connections.close_all()

        def leave():
            close_old_connections()
            try:
                return create_leave(type(worker).objects.get(pk=worker.pk),
                    {'slot_assignment_id': assignment.pk, 'leave_type': 'SICK'}).pk
            finally:
                connections.close_all()

        with actions.queued_emails(), mock.patch('shifts.base.request_fingerprint', side_effect=fingerprint), \
                mock.patch('workforce.leave_service.assignment_interval', side_effect=interval), \
                ThreadPoolExecutor(max_workers=2) as pool:
            offer_future, leave_future = pool.submit(offer), pool.submit(leave)
            self.assertEqual(offer_future.result(timeout=30), 201)
            self.assertTrue(leave_future.result(timeout=30))
        self.assertEqual(ShiftCounterOffer.objects.count(), 1)
        self.assertEqual(WorkforceLeaveRequest.objects.count(), 1)
