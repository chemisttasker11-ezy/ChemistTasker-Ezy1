"""Bounded outage evidence. Known policy limitations are characterized, not certified safe."""
from datetime import timedelta
from unittest.mock import patch
from django.test import override_settings
from notifications.models import Notification
from shifts.models import ShiftInterest, ShiftOffer, ShiftProfileAccessAudit
from shifts.test_shift_actions_contract import ShiftActionFixture, DAY
from workforce.models import RosterPeriod
from workforce.roster.publication import _notify_roster_publication


class OperationalOutageContracts(ShiftActionFixture):
    def test_roster_recipient_failure_does_not_suppress_the_next_worker(self):
        workers = [self.worker(), self.worker()]
        monday = DAY - timedelta(days=DAY.weekday())
        period = RosterPeriod.objects.create(pharmacy=self.pharmacy, week_start=monday,
            created_by=self.owner)
        from notifications.services import notify_users
        def deliver(ids, **kwargs):
            if ids == [workers[0].pk]:
                raise RuntimeError('first recipient unavailable')
            return notify_users(ids, **kwargs)
        with patch('notifications.services.notify_users', side_effect=deliver) as notify, patch(
                'notifications.services._broadcast'), patch('notifications.services._send_expo_push'):
            _notify_roster_publication(period.pk, [worker.pk for worker in workers], 3)
        self.assertEqual(notify.call_count, 2)
        self.assertTrue(Notification.objects.filter(user=workers[1], payload__revision_number=3).exists())

    def test_buzz_uncertain_queue_failure_keeps_existing_cooldown_for_decision(self):
        shift = self.shift()
        worker = self.worker()
        offer = ShiftOffer.objects.create(shift=shift, user=worker, status=ShiftOffer.Status.PENDING)
        self.owner_client.raise_request_exception = False
        with patch('shifts.offers.async_task', side_effect=RuntimeError('queue acknowledgement lost')) as queue, patch(
                'notifications.services._broadcast'), patch('notifications.services._send_expo_push'):
            response = self.owner_client.post(f'/api/v1/shift-offers/{offer.pk}/buzz/', {}, format='json')
            self.assertEqual(response.status_code, 500)
            offer.refresh_from_db()
            self.assertIsNotNone(offer.last_buzzed_at)
            retry = self.owner_client.post(f'/api/v1/shift-offers/{offer.pk}/buzz/', {}, format='json')
            self.assertEqual(retry.status_code, 429)
            queue.assert_called_once()
        self.assertEqual(Notification.objects.filter(user=worker, payload__notification_kind='shift_offer_buzz').count(), 1)

    def test_reveal_queue_failure_preserves_quota_and_audit_but_retry_does_not_resend(self):
        shift = self.shift(reveal_quota=1)
        worker = self.worker()
        interest = ShiftInterest.objects.create(shift=shift, user=worker)
        self.owner_client.raise_request_exception = False
        url = f'/api/v1/shifts/{shift.pk}/reveal_profile/'
        with patch('shifts.candidates.async_task', side_effect=RuntimeError('queue acknowledgement lost')) as queue, patch(
                'notifications.services._broadcast'), patch('notifications.services._send_expo_push'):
            self.assertEqual(self.owner_client.post(url, {'user_id': worker.pk}, format='json').status_code, 500)
            shift.refresh_from_db()
            interest.refresh_from_db()
            self.assertEqual(shift.reveal_count, 1)
            self.assertTrue(interest.revealed)
            self.assertTrue(ShiftProfileAccessAudit.objects.filter(shift=shift, target_user=worker).exists())
            self.assertEqual(self.owner_client.post(url, {'user_id': worker.pk}, format='json').status_code, 200)
            queue.assert_called_once()
