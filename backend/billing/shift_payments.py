"""Authorized shift fulfillment and cancellation checkout workflows."""
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
import json
import logging

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from shifts.finalize import offer_occurrence_key
from shifts.models import ShiftOffer, ShiftSlotAssignment

from .checkout_context import _shift_checkout_return_urls
from .fulfillment import _finalize_pending_offers_for_shift, _normalize_offer_ids, _normalize_slot_ids
from .stripe_support import stripe
from .subscriptions import get_subscription_for_account as _get_subscription_for_account
from .utils import BILLING_STATE_FREE_TRIAL, BILLING_STATE_PRE_LIVE


logger = logging.getLogger(__name__)


def charge_shift_fulfillment(user, shift, shift_id, account, billing_state, data):
    platform = data.get('platform', 'web')

    candidate_id = data.get('candidate_id')
    slot_id = data.get('slot_id')
    slot_ids = _normalize_slot_ids(data.get('slot_ids') or data.get('slotIds'), slot_id)
    offer_ids = _normalize_offer_ids(data.get('offer_ids') or data.get('offerIds'), data.get('offer_id') or data.get('offerId'))

    # No selector is only legitimate for the free PRE_LIVE/FREE_TRIAL whole-shift confirmation below.
    if offer_ids or slot_ids or candidate_id:
        offers = ShiftOffer.objects.filter(shift=shift, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        if candidate_id:  # match the webhook's finalize filter so we never charge for offers it won't finalize
            offers = offers.filter(user_id=candidate_id)
        if offer_ids:
            offers = offers.filter(id__in=offer_ids)
        if slot_ids:
            offers = offers.filter(slot_id__in=slot_ids)
        selected_offers = list(offers.order_by('id'))
        if not selected_offers:
            return Response({'error': 'No selected offers require payment.'}, status=status.HTTP_400_BAD_REQUEST)
        if offer_ids and len(selected_offers) != len(offer_ids):
            return Response({'error': 'One or more selected offers do not require payment.'}, status=status.HTTP_400_BAD_REQUEST)
        selected_slot_ids = [offer.slot_id for offer in selected_offers if offer.slot_id]
        if slot_ids and set(selected_slot_ids) != set(slot_ids):
            return Response({'error': 'One or more selected slots do not require payment.'}, status=status.HTTP_400_BAD_REQUEST)
        selected_occurrences = [offer_occurrence_key(offer) for offer in selected_offers if offer.slot_id]
        if len(selected_occurrences) != len(set(selected_occurrences)):
            return Response({'error': 'Select only one candidate per slot.'}, status=status.HTTP_400_BAD_REQUEST)
        offer_ids = [offer.id for offer in selected_offers]
        slot_ids = sorted(set(selected_slot_ids)) if len(selected_slot_ids) == len(selected_offers) else []

    # --- Honeymoon period / free trial: finalize for free ---
    if billing_state in [BILLING_STATE_PRE_LIVE, BILLING_STATE_FREE_TRIAL]:
        with transaction.atomic():
            finalized_count, finalized_offers = _finalize_pending_offers_for_shift(
                shift,
                candidate_id=candidate_id,
                slot_ids=slot_ids,
                offer_ids=offer_ids,
                return_offers=True,
            )
            from shifts.emails import send_shift_payment_finalized_notifications
            has_pending_payment = ShiftOffer.objects.filter(
                shift=shift,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            ).exists()
            shift.payment_status = 'PENDING' if has_pending_payment else 'PAID'
            shift.save(update_fields=['payment_status'])
            transaction.on_commit(lambda: send_shift_payment_finalized_notifications(
                shift=shift,
                offers=finalized_offers,
                paid_by=user,
                payment_method="free",
            ), robust=True)
        if billing_state == BILLING_STATE_PRE_LIVE:
            return Response({
                'free': True,
                'billing_state': billing_state,
                'finalized_offers': finalized_count,
                'message': 'Payments not active yet - shift confirmed for free.',
            })
        return Response({
            'free': True,
            'billing_state': billing_state,
            'finalized_offers': finalized_count,
            'message': 'Free trial applied - shift confirmed for free.',
        })


    # The legacy PRE_LIVE/FREE_TRIAL flow legitimately confirms a whole
    # shift without a selector; paid Stripe checkout must have a bounded
    # selection so one charged unit cannot finalize an unselected group.
    if not offer_ids and not slot_ids and not candidate_id:
        return Response(
            {'error': 'Select a pending offer or slot before checkout.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Price Logic
    # We could also use `shared-core` logic if we had a node backend,
    # but since this is Django, we map it internally here for the Stripe Price IDs.

    is_subscriber = False
    sub = _get_subscription_for_account(account)
    if sub and sub.status == 'active':
        is_subscriber = True

    # Determine base price based on shift type
    # PT/FT standard: price_1T52ilBQXaySV5uksvQy2RTk ($80)
    # PT/FT subscriber: price_1T52imBQXaySV5ukuwLH3ikI ($40)
    # Locum standard: price_1T52jFBQXaySV5ukezd5JmzS ($30)
    # Locum subscriber: price_1T52jFBQXaySV5ukkXOKPHSV ($15)

    is_locum = shift.employment_type == 'LOCUM'

    if is_locum:
        price_id = (
            'price_1T52jFBQXaySV5ukkXOKPHSV'
            if is_subscriber else 'price_1T52jFBQXaySV5ukezd5JmzS'
        )
    else:
        price_id = (
            'price_1T52imBQXaySV5ukuwLH3ikI'
            if is_subscriber else 'price_1T52ilBQXaySV5uksvQy2RTk'
        )

    success_url, cancel_url = _shift_checkout_return_urls(
        shift,
        acting_user=user,
        platform=platform,
        query_key='payment',
    )

    try:
        session_kwargs = {
            'payment_method_types': ['card'],
            'line_items': [{
                'price': price_id,
                'quantity': len(offer_ids),
            }],
            'mode': 'payment',
            'success_url': success_url,
            'cancel_url': cancel_url,
            'metadata': {
                'shift_id': shift.id,
                'actor_user_id': user.id,
                'owner_user_id': account['owner_user'].id if account.get('owner_user') else '',
                'organization_id': account['organization'].id if account.get('organization') else '',
                'billing_contact_user_id': account['billing_contact'].id if account.get('billing_contact') else '',
                'billing_scope': account['scope'],
                'type': 'fulfillment',
                'candidate_id': candidate_id,
                'slot_id': slot_ids[0] if len(slot_ids) == 1 else '',
                'slot_ids': ','.join(str(value) for value in slot_ids),
                'offer_ids': ','.join(str(value) for value in offer_ids),
            }
        }
        if sub and sub.stripe_customer_id:
            session_kwargs['customer'] = sub.stripe_customer_id
        else:
            billing_contact = account.get('billing_contact') or user
            session_kwargs['customer_email'] = getattr(billing_contact, 'email', None) or user.email
        # Key on every param (Stripe rejects a reused key with other params) and the UTC day (the 24h session stays open while reused).
        request_key = sha256(json.dumps([session_kwargs, str(timezone.now().date())], sort_keys=True, default=str).encode()).hexdigest()
        checkout_session = stripe.checkout.Session.create(
            **session_kwargs, idempotency_key=f'shift-fulfillment:{shift.id}:{request_key}',
        )
        return Response({'url': checkout_session.url})
    except Exception:
        logger.exception('Billing request failed')
        return Response({'error': 'Unable to complete the billing request.'}, status=status.HTTP_400_BAD_REQUEST)


def charge_penalty(user, shift, shift_id, account, sub, data):
    platform = data.get('platform', 'web')

    # Calculate expected wage
    assignments = ShiftSlotAssignment.objects.filter(shift=shift)
    total_wage = Decimal('0')

    now = timezone.now()
    earliest_start = None

    for assignment in assignments:
        slot = assignment.slot
        slot_date = assignment.slot_date or slot.date

        # Combine date and time
        start_dt = timezone.make_aware(datetime.combine(slot_date, slot.start_time))
        end_dt = timezone.make_aware(datetime.combine(slot_date, slot.end_time))
        if slot.end_time <= slot.start_time:
            end_dt += timedelta(days=1)

        if not earliest_start or start_dt < earliest_start:
            earliest_start = start_dt

        hours = Decimal(str((end_dt - start_dt).total_seconds())) / Decimal('3600')
        rate = assignment.unit_rate or Decimal('0')
        total_wage += (hours * rate)

    if not earliest_start or total_wage <= 0:
        return Response({'message': 'No penalty required, shift had no value or assignments.'})

    # Calculate Penalty Percentage
    hours_until_shift = (earliest_start - now).total_seconds() / 3600.0

    penalty_percentage = Decimal('0')
    if hours_until_shift <= 24:
        penalty_percentage = Decimal('0.20')
    elif hours_until_shift <= 72:
        penalty_percentage = Decimal('0.10')

    if penalty_percentage == 0:
        return Response({'message': 'No penalty required, cancelled > 72 hours in advance.'})

    penalty_amount_aud = total_wage * penalty_percentage
    # Round once at the Stripe boundary so half cents are not truncated.
    penalty_amount_cents = int((penalty_amount_aud * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    success_url, cancel_url = _shift_checkout_return_urls(
        shift,
        acting_user=user,
        platform=platform,
        query_key='penalty',
    )

    try:
        session_kwargs = {
            'payment_method_types': ['card'],
            'line_items': [{
                'price_data': {
                    'currency': 'aud',
                    'product_data': {
                        'name': f'Cancellation Penalty for Shift #{shift.id}',
                    },
                    'unit_amount': penalty_amount_cents,
                },
                'quantity': 1,
            }],
            'mode': 'payment',
            'success_url': success_url,
            'cancel_url': cancel_url,
            'metadata': {
                'shift_id': shift.id,
                'actor_user_id': user.id,
                'owner_user_id': account['owner_user'].id if account.get('owner_user') else '',
                'organization_id': account['organization'].id if account.get('organization') else '',
                'billing_contact_user_id': account['billing_contact'].id if account.get('billing_contact') else '',
                'billing_scope': account['scope'],
                'type': 'cancellation',
            }
        }
        if sub and sub.stripe_customer_id:
            session_kwargs['customer'] = sub.stripe_customer_id
        else:
            billing_contact = account.get('billing_contact') or user
            session_kwargs['customer_email'] = getattr(billing_contact, 'email', None) or user.email
        checkout_session = stripe.checkout.Session.create(**session_kwargs)
        return Response({'url': checkout_session.url})
    except Exception:
        logger.exception('Billing request failed')
        return Response({'error': 'Unable to complete the billing request.'}, status=status.HTTP_400_BAD_REQUEST)
