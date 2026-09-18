from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse

from .models import StripeWebhookEvent


class _StripeObject(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


@override_settings(STRIPE_WEBHOOK_SECRET='whsec-test')
class StripeWebhookIdempotencyTests(TestCase):
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
