from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse

from .models import StripeWebhookEvent
from .models import ShiftPayment
from django.contrib.auth import get_user_model
from django.utils import timezone
from client_profile.models import Pharmacy, Shift


class _StripeObject(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


@override_settings(STRIPE_WEBHOOK_SECRET='whsec-test')
class StripeWebhookIdempotencyTests(TestCase):
    @patch('billing.views.stripe.Webhook.construct_event')
    @patch('billing.views._finalize_pending_offers_for_shift')
    def test_failed_fulfillment_rolls_back_payment_and_allows_retry(self, finalize, construct_event):
        owner = get_user_model().objects.create_user(email='billing-owner@example.test', role='OWNER')
        pharmacy = Pharmacy.objects.create(name='Billing test pharmacy')
        shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST', employment_type='LOCUM', payment_status='PENDING')
        construct_event.return_value = _StripeObject(
            id='evt_fulfillment_retry', type='checkout.session.completed',
            data=_StripeObject(object=_StripeObject(
                mode='payment', payment_status='paid', amount_total=12345,
                payment_intent='pi_retry', metadata={'shift_id': str(shift.pk), 'type': 'fulfillment', 'owner_user_id': str(owner.pk)},
            )),
        )
        finalize.side_effect = [RuntimeError('temporary assignment failure'), (0, [])]
        with patch('client_profile.utils.send_shift_payment_finalized_notifications'):
            first = self.client.post(reverse('billing:stripe_webhook'), b'{}', content_type='application/json')
            self.assertEqual(first.status_code, 500)
            self.assertFalse(ShiftPayment.objects.exists())
            shift.refresh_from_db()
            self.assertEqual(shift.payment_status, 'PENDING')
            second = self.client.post(reverse('billing:stripe_webhook'), b'{}', content_type='application/json')
            self.assertEqual(second.status_code, 200)
            replay = self.client.post(reverse('billing:stripe_webhook'), b'{}', content_type='application/json')
            self.assertEqual(replay.status_code, 200)
        self.assertEqual(ShiftPayment.objects.count(), 1)
        self.assertEqual(finalize.call_count, 2)
        shift.refresh_from_db()
        self.assertEqual(shift.payment_status, 'PAID')

    @patch('billing.views.logger.exception')
    @patch('billing.views._process_stripe_event', side_effect=RuntimeError('failed attempt'))
    @patch('billing.views.stripe.Webhook.construct_event')
    def test_failed_attempt_cannot_downgrade_a_completed_retry(self, construct_event, process, log):
        construct_event.return_value = self._event('evt_interleaved')
        # Reproduce the interleaving after rollback but before recording failure.
        def completed_retry(*args, **kwargs):
            StripeWebhookEvent.objects.create(event_id='evt_interleaved', event_type='test.event', status=StripeWebhookEvent.Status.PROCESSED, processed_at=timezone.now())
        log.side_effect = completed_retry
        response = self.client.post(reverse('billing:stripe_webhook'), b'{}', content_type='application/json')
        self.assertEqual(response.status_code, 500)
        delivery = StripeWebhookEvent.objects.get(event_id='evt_interleaved')
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.PROCESSED)
        replay = self.client.post(reverse('billing:stripe_webhook'), b'{}', content_type='application/json')
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(process.call_count, 1)

    def _event(self, event_id='evt_test_1', event_type='test.event'):
        return _StripeObject(
            id=event_id,
            type=event_type,
            data=_StripeObject(object=_StripeObject()),
        )

    @patch('billing.views._process_stripe_event')
    @patch('billing.views.stripe.Webhook.construct_event')
    def test_replayed_processed_event_is_not_processed_twice(self, construct_event, process_event):
        construct_event.return_value = self._event()

        first = self.client.post(
            reverse('billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        second = self.client.post(
            reverse('billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(process_event.call_count, 1)
        delivery = StripeWebhookEvent.objects.get(event_id='evt_test_1')
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.PROCESSED)
        self.assertIsNotNone(delivery.processed_at)

    @patch('billing.views._process_stripe_event')
    @patch('billing.views.stripe.Webhook.construct_event')
    def test_failed_event_can_be_retried_and_then_marked_processed(self, construct_event, process_event):
        construct_event.return_value = self._event(event_id='evt_retry')
        process_event.side_effect = [RuntimeError('synthetic failure'), None]

        first = self.client.post(
            reverse('billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        delivery = StripeWebhookEvent.objects.get(event_id='evt_retry')
        self.assertEqual(first.status_code, 500)
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.FAILED)
        self.assertIsNotNone(delivery.failed_at)

        second = self.client.post(
            reverse('billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        delivery.refresh_from_db()

        self.assertEqual(second.status_code, 200)
        self.assertEqual(process_event.call_count, 2)
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.PROCESSED)
        self.assertIsNotNone(delivery.processed_at)
