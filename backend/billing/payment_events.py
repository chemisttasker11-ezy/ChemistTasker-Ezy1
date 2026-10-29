"""Payment and refund handlers invoked within the webhook delivery transaction."""
from decimal import Decimal
import logging

from django.db import transaction
from django.utils import timezone

from .fulfillment import _finalize_pending_offers_for_shift
from .models import ShiftPayment
from .stripe_support import _stripe_object_value, stripe


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
        if not created:
            # A duplicate checkout completion must not re-finalize
            # offers or turn a refunded payment back into paid.
            return

        if shift_obj is None:
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
            unbookable_offers = []
            finalized_count, finalized_offers = _finalize_pending_offers_for_shift(
                shift_obj,
                candidate_id=metadata.get('candidate_id'),
                slot_id=metadata.get('slot_id'),
                slot_ids=metadata.get('slot_ids'),
                offer_ids=metadata.get('offer_ids'),
                return_offers=True,
                unbookable=unbookable_offers,
            )
            if unbookable_offers or not finalized_count:
                # The payment stays recorded; a lost occurrence needs a refund, not a Stripe retry.
                lost_ids = [offer.id for offer in unbookable_offers]
                logger.error(
                    'Paid shift checkout %s could not book offers %s: refund or manual action required.',
                    payment.pk, lost_ids,
                )
                from shifts.notifications import notify_shift_managers
                # The unique payment intent gates alert creation in this transaction too.
                notify_shift_managers(
                    shift_obj,
                    title='Shift payment needs a refund',
                    body='A paid shift offer could not be booked because it is no longer available. '
                         'The payment needs a refund or manual follow-up.',
                    kind='shift_payment_refund_required',
                    payload={'payment_id': payment.pk, 'offer_ids': lost_ids},
                    deliver_on_commit=True,
                )
            from shifts.emails import (
                send_shift_payment_finalized_notifications,
            )
            from users.models import User
            paid_by_user = User.objects.filter(id=metadata.get('actor_user_id')).first()
            # Notifications must see committed payment and offer changes.
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
        payment.save(update_fields=['refunded_amount_aud', 'status'])
