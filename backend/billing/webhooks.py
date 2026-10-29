"""Stripe signature verification, delivery deduplication, event routing and atomic retry handling."""
import logging

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone

from .models import StripeWebhookEvent
from .payment_events import handle_charge_refunded, handle_payment_checkout
from .stripe_support import stripe
from .subscription_events import (
    handle_invoice_paid,
    handle_subscription_checkout,
    handle_subscription_deleted,
    handle_subscription_updated,
)


logger = logging.getLogger(__name__)


def _process_stripe_event(event):
    if event.type == 'checkout.session.completed':
        session = event.data.object
        metadata = session.get('metadata', {})
        subscription_kind = metadata.get('subscription_kind', 'base')
        if session.mode == 'subscription':
            handle_subscription_checkout(session, metadata, subscription_kind)
        elif session.mode == 'payment' and session.payment_status == 'paid':
            handle_payment_checkout(session, metadata)
    elif event.type == 'customer.subscription.updated':
        handle_subscription_updated(event)
    elif event.type == 'invoice.paid':
        handle_invoice_paid(event)
    elif event.type == 'charge.refunded':
        handle_charge_refunded(event)
    elif event.type == 'customer.subscription.deleted':
        handle_subscription_deleted(event)



def receive_stripe_webhook(payload, sig_header):
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        logger.warning('Stripe webhook rejected due to invalid payload.')
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        logger.warning('Stripe webhook signature verification failed.')
        return HttpResponse(status=400)

    event_id = str(getattr(event, 'id', '') or '')
    event_type = str(getattr(event, 'type', '') or '')
    if not event_id or not event_type:
        logger.warning('Stripe webhook rejected because event identity was missing.')
        return HttpResponse(status=400)

    try:
        with transaction.atomic():
            delivery, created = StripeWebhookEvent.objects.select_for_update().get_or_create(
                event_id=event_id,
                defaults={
                    'event_type': event_type,
                    'status': StripeWebhookEvent.Status.PROCESSING,
                },
            )
            if not created and delivery.status == StripeWebhookEvent.Status.PROCESSED:
                return HttpResponse(status=200)

            delivery.event_type = event_type
            delivery.status = StripeWebhookEvent.Status.PROCESSING
            delivery.failed_at = None
            delivery.save(update_fields=['event_type', 'status', 'failed_at'])

            _process_stripe_event(event)

            delivery.status = StripeWebhookEvent.Status.PROCESSED
            delivery.processed_at = timezone.now()
            delivery.save(update_fields=['status', 'processed_at'])
    except Exception:
        logger.exception(
            'Stripe webhook processing failed for event_id=%s event_type=%s',
            event_id,
            event_type,
        )
        with transaction.atomic():
            delivery, _ = StripeWebhookEvent.objects.select_for_update().get_or_create(
                event_id=event_id,
                defaults={'event_type': event_type},
            )
            # Another delivery may have succeeded after this transaction rolled
            # back. Never downgrade its processed marker and enable a replay.
            if delivery.status != StripeWebhookEvent.Status.PROCESSED:
                delivery.status = StripeWebhookEvent.Status.FAILED
                delivery.failed_at = timezone.now()
                delivery.save(update_fields=['status', 'failed_at'])
        return HttpResponse(status=500)

    return HttpResponse(status=200)
