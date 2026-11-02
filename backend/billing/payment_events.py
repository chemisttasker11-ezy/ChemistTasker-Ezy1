"""Payment and refund handlers invoked within the webhook delivery transaction."""
from decimal import Decimal
import logging

from django.db import transaction
from django.utils import timezone

from .fulfillment import _finalize_pending_offers_for_shift
from .paid_fulfillment import finalize_paid_selection, PAYROLL_CORRECTION_PENDING
from .models import ShiftPayment
from .stripe_support import _stripe_object_value, stripe
from .checkout_reservations import bind_paid_checkout


logger = logging.getLogger(__name__)


def handle_payment_checkout(session, metadata):
    shift_id = metadata.get('shift_id')
    payment_type = metadata.get('type')
    if shift_id and payment_type in ('fulfillment', 'cancellation'):
        amount_aud = Decimal('0')
        if session.amount_total is not None:
            amount_aud = Decimal(session.amount_total) / Decimal('100')

        owner_id = metadata.get('owner_user_id') or metadata.get('billing_contact_user_id') or metadata.get('actor_user_id')

        if not session.get('payment_intent'):
            raise ValueError('Paid Stripe checkout missing required payment_intent.')

        from shifts.models import Shift as ShiftModel, ShiftOffer
        shift_obj = ShiftModel.objects.select_for_update().filter(id=shift_id).first()
        # Distinct Stripe webhook event IDs may describe the same
        # payment intent. Never create a second local paid ledger debit.
        payment, created = ShiftPayment.objects.get_or_create(
            stripe_payment_intent_id=session.payment_intent,
            defaults={
                'owner_id': owner_id,
                'shift': shift_obj,
                'amount_aud': amount_aud,
                'payment_type': payment_type,
                'payment_method': 'card',
                'status': 'paid',
                'paid_at': timezone.now(),
            },
        )
        if not created and not (
            payment.status == 'paid' and payment.reconciliation_required
            and payment.reconciliation_reason == 'locked_payroll_period'
            and metadata.get('fulfillment_checkout_id')
        ):
            # Ordinary paid/refunded replay remains a no-op. A known frozen-payroll
            # refusal may retry the same bound payment after the existing correction.
            return

        attempt, binding_error = bind_paid_checkout(session, metadata, payment)
        if binding_error:
            if not created:
                return PAYROLL_CORRECTION_PENDING
            payment.reconciliation_required = True
            payment.reconciliation_reason = binding_error
            payment.save(update_fields=["reconciliation_required", "reconciliation_reason"])
            from notifications.services import notify_users
            notify_users(
                [payment.owner_id], title="Shift payment needs reconciliation",
                body="A paid checkout did not match its reserved work. Check the payment before retrying or refunding.",
                payload={"notification_kind": "shift_payment_refund_required", "payment_id": payment.pk,
                         "reason": binding_error}, deliver_on_commit=True,
            )
            return

        if shift_obj is None:
            payment.reconciliation_required = True
            payment.reconciliation_reason = "deleted_shift"
            payment.save(update_fields=["reconciliation_required", "reconciliation_reason"])
            from notifications.services import notify_users
            logger.error('Paid shift checkout %s refers to deleted shift %s: refund required.', payment.pk, shift_id)
            notify_users(
                [payment.owner_id],
                title='Shift payment needs a refund',
                body='The paid shift no longer exists. The payment needs a refund or manual follow-up.',
                payload={'notification_kind': 'shift_payment_refund_required',
                         'payment_id': payment.pk, 'shift_id': shift_id},
                deliver_on_commit=True,
            )
            return

        # Cancellation penalty payment must not finalize worker offers.
        if payment_type != 'fulfillment':
            return

        # Mark shift paid, then finalize pending offers waiting on payment.
        try:
            finalized_count, finalized_offers, correction_pending = finalize_paid_selection(
                shift_obj, payment, attempt, metadata, created=created, finalize=_finalize_pending_offers_for_shift, log=logger,
            )
            from shifts.emails import (
                send_shift_payment_finalized_notifications,
            )
            from users.models import User
            paid_by_user = User.objects.filter(id=metadata.get('actor_user_id')).first()
            # Notifications must see committed payment and offer changes.
            if finalized_count:
                transaction.on_commit(lambda: send_shift_payment_finalized_notifications(
                    shift=shift_obj,
                    offers=finalized_offers,
                    paid_by=paid_by_user or getattr(shift_obj, 'created_by', None),
                    payment_method='stripe',
                ), robust=True)
            has_pending_payment = ShiftOffer.objects.filter(
                shift=shift_obj,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            ).exists()
            shift_obj.payment_status = 'PENDING' if has_pending_payment else 'PAID'
            shift_obj.save(update_fields=['payment_status'])
            if correction_pending:
                return PAYROLL_CORRECTION_PENDING
        except Exception as e:
            logger.warning('Could not finalize paid shift offers: %s', e)
            # Roll back payment and offer changes together so Stripe can
            # retry instead of permanently acknowledging partial work.
            raise


def handle_charge_refunded(event):
    charge = event.data.object
    payment_intent_id = charge.get('payment_intent')
    if not payment_intent_id:
        logger.warning('Stripe refund event does not include a payment intent.')
        return
    # Stripe amount_refunded is cumulative in cents for this charge.
    # Never mark a partially reversed payment as fully refunded.
    refunded_cents = charge.get('amount_refunded') or 0
    try:
        refunded_cents = int(refunded_cents)
    except (ValueError, TypeError):
        logger.warning('Stripe refund callback has invalid amount_refunded.')
        return
    if refunded_cents < 0:
        return
    payments = list(ShiftPayment.objects.select_for_update().filter(
        stripe_payment_intent_id=payment_intent_id, payment_method='card'
    ))
    if not payments:
        # Retry only shift checkout refunds that beat checkout; other charges (e.g. invoices) are not ours.
        sessions = stripe.checkout.Session.list(payment_intent=payment_intent_id, limit=1)
        session = next(iter(_stripe_object_value(sessions, 'data', None) or []), None)
        if _stripe_object_value(_stripe_object_value(session, 'metadata', None) or {}, 'type') in ('fulfillment', 'cancellation'):
            raise ValueError('Stripe refund payment is not recorded yet.')
        logger.info('Ignoring refund for a charge without a shift payment.')
        return
    for payment in payments:
        cumulative = min(payment.amount_aud, Decimal(refunded_cents) / Decimal(100))
        if cumulative <= payment.refunded_amount_aud:
            continue
        payment.refunded_amount_aud = cumulative
        payment.status = (
            'refunded' if cumulative >= payment.amount_aud
            else 'partially_refunded'
        )
        if payment.status == 'refunded':
            payment.reconciliation_required = False
        payment.save(update_fields=['refunded_amount_aud', 'status', 'reconciliation_required'])
