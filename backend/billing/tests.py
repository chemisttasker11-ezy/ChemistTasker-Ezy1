from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse

from .models import StripeWebhookEvent


class StripeWebhookIdempotencyTests(TestCase):
    def _event(self, event_id='evt_replay_safe'):
        return SimpleNamespace(id=event_id, type='test.event')

    @patch('billing.views.stripe.Webhook.construct_event')
    @patch('billing.views._process_stripe_event')
    def test_duplicate_delivery_is_processed_once(self, process_event, construct_event):
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
        self.assertEqual(StripeWebhookEvent.objects.count(), 1)
        delivery = StripeWebhookEvent.objects.get(event_id='evt_replay_safe')
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.PROCESSED)
        self.assertIsNotNone(delivery.processed_at)

    @patch('billing.views.stripe.Webhook.construct_event')
    @patch('billing.views._process_stripe_event')
    def test_failed_delivery_can_be_retried(self, process_event, construct_event):
        construct_event.return_value = self._event('evt_retry')
        process_event.side_effect = [RuntimeError('provider processing failed'), None]

        first = self.client.post(
            reverse('billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        self.assertEqual(first.status_code, 500)
        failed = StripeWebhookEvent.objects.get(event_id='evt_retry')
        self.assertEqual(failed.status, StripeWebhookEvent.Status.FAILED)
        self.assertIsNotNone(failed.failed_at)

        second = self.client.post(
            reverse('billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(process_event.call_count, 2)

        failed.refresh_from_db()
        self.assertEqual(failed.status, StripeWebhookEvent.Status.PROCESSED)
        self.assertIsNotNone(failed.processed_at)
