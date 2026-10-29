"""Subscription lifecycle handlers invoked within the webhook delivery transaction."""
from datetime import datetime, timezone as dt_timezone
import logging

from django.db.models import Q

from .models import OwnerSubscription
from .stripe_support import (
    EXTRA_SEAT_PRICE,
    _get_subscription_from_customer,
    _get_subscription_from_metadata,
    _stripe_object_value,
    stripe,
)


logger = logging.getLogger(__name__)


def handle_subscription_checkout(session, metadata, subscription_kind):
    try:
        sub = _get_subscription_from_metadata(metadata)
        if not sub:
            sub = _get_subscription_from_customer(session.customer)
        if not sub:
            logger.warning('Stripe subscription checkout completed but no local subscription matched.')
            raise OwnerSubscription.DoesNotExist
        # Metadata cannot authorize a different Stripe customer.
        sub = OwnerSubscription.objects.select_for_update().get(pk=sub.pk)
        if sub.stripe_customer_id != session.get('customer'):
            logger.warning('Ignoring subscription checkout for mismatched account.')
            return
        if sub.status == 'canceled':
            # Only a new, paid base plan can replace a canceled subscription.
            if (subscription_kind == 'extra_seats'
                    or not session.get('subscription')
                    or session.subscription == sub.stripe_subscription_id
                    or session.get('payment_status') != 'paid'):
                return
        # A completed checkout may arrive after the subscription became unpaid.
        current = stripe.Subscription.retrieve(session.subscription)
        if (_stripe_object_value(current, 'id') != session.subscription
                or _stripe_object_value(current, 'customer') != sub.stripe_customer_id):
            return
        is_active = _stripe_object_value(current, 'status') in ('active', 'trialing')
        if sub.status == 'canceled' and not is_active:
            return
        if subscription_kind == 'extra_seats':
            sub.stripe_extra_seat_subscription_id = session.subscription
            if not is_active:
                sub.staff_count = 5
            elif 'extra_seat_count' in metadata:
                sub.staff_count = 5 + int(metadata['extra_seat_count'])
            updated_fields = ['stripe_extra_seat_subscription_id', 'staff_count', 'updated_at']
        else:
            sub.stripe_subscription_id = session.subscription
            sub.status = 'active' if is_active else 'inactive'
            sub.staff_count = 5
            updated_fields = ['stripe_subscription_id', 'status', 'staff_count', 'updated_at']
        sub.save(update_fields=updated_fields)
    except OwnerSubscription.DoesNotExist:
        logger.warning(
            'Stripe checkout.session.completed subscription event ignored because no matching OwnerSubscription was found.'
        )


def handle_subscription_updated(event):
    provider = event.data.object
    sub_id = provider.get('id')
    customer_id = provider.get('customer')
    # A billing event may only affect the exact local provider subscription.
    base = OwnerSubscription.objects.select_for_update().filter(
        stripe_subscription_id=sub_id, stripe_customer_id=customer_id,
    ).first()
    addon = None if base else OwnerSubscription.objects.select_for_update().filter(
        stripe_extra_seat_subscription_id=sub_id, stripe_customer_id=customer_id,
    ).first()
    sub = base or addon
    if not sub or sub.status == 'canceled':
        return
    # Stripe events can arrive out of order; read current state while holding the row lock.
    provider = stripe.Subscription.retrieve(sub_id)
    if (_stripe_object_value(provider, 'id') != sub_id
            or _stripe_object_value(provider, 'customer') != customer_id):
        return
    sub_status = _stripe_object_value(provider, 'status')
    if base:
        base.status = 'active' if sub_status in ('active', 'trialing') else 'inactive'
        base.save(update_fields=['status', 'updated_at'])
        return
    if addon:
        items = _stripe_object_value(_stripe_object_value(provider, 'items', {}), 'data', [])
        matched = [
            item for item in items
            if _stripe_object_value(_stripe_object_value(item, 'price', {}), 'id') == EXTRA_SEAT_PRICE
        ]
        if len(matched) != 1:
            logger.warning('Stripe extra-seat update contains no unique recognized price.')
            return
        quantity = int(_stripe_object_value(matched[0], 'quantity', 0))
        addon.staff_count = 5 + quantity if sub_status in ('active', 'trialing') else 5
        addon.save(update_fields=['staff_count', 'updated_at'])
        return


def handle_invoice_paid(event):
    invoice = event.data.object
    sub_id = invoice.get('subscription')
    customer_id = invoice.get('customer')
    if sub_id:
        try:
            sub = OwnerSubscription.objects.select_for_update().filter(
                stripe_subscription_id=sub_id, stripe_customer_id=customer_id,
            ).first()
            if not sub:
                sub = OwnerSubscription.objects.select_for_update().filter(
                    stripe_extra_seat_subscription_id=sub_id,
                    stripe_customer_id=customer_id,
                ).first()
            # The first invoice can precede checkout; canceled plans retain their old ID.
            if not sub and customer_id:
                sub = OwnerSubscription.objects.select_for_update().filter(
                    Q(stripe_subscription_id__isnull=True) | Q(stripe_subscription_id=''),
                    stripe_customer_id=customer_id,
                ).first()
            if not sub:
                raise OwnerSubscription.DoesNotExist
            if sub.status == 'canceled':
                logger.info('Ignoring paid invoice for canceled Stripe subscription %s', sub_id)
                return
            # Paid invoices can arrive after Stripe has withdrawn entitlement.
            current = stripe.Subscription.retrieve(sub_id)
            if (_stripe_object_value(current, 'id') != sub_id
                    or _stripe_object_value(current, 'customer') != customer_id):
                return
            if sub_id != sub.stripe_extra_seat_subscription_id:
                sub.status = 'active' if _stripe_object_value(current, 'status') in ('active', 'trialing') else 'inactive'
            period_end = invoice.get('lines', {}).get('data', [])
            if period_end:
                period_end_ts = period_end[0].get('period', {}).get('end')
                if period_end_ts:
                    sub.current_period_end = datetime.fromtimestamp(period_end_ts, tz=dt_timezone.utc)
            sub.save(update_fields=['status', 'current_period_end', 'updated_at'])
        except OwnerSubscription.DoesNotExist:
            logger.warning(
                'Stripe invoice.paid could not find matching local subscription.',
            )


def handle_subscription_deleted(event):
    sub_id = event.data.object.id
    customer_id = event.data.object.get('customer')
    lookup = {'stripe_subscription_id': sub_id}
    if customer_id:
        lookup['stripe_customer_id'] = customer_id
    try:
        sub = OwnerSubscription.objects.select_for_update().filter(**lookup).first()
        if sub:
            sub.status = 'canceled'
            sub.save(update_fields=['status'])
        else:
            addon_lookup = {'stripe_extra_seat_subscription_id': sub_id}
            if customer_id:
                addon_lookup['stripe_customer_id'] = customer_id
            sub = OwnerSubscription.objects.select_for_update().filter(**addon_lookup).first()
            if not sub:
                raise OwnerSubscription.DoesNotExist
            sub.stripe_extra_seat_subscription_id = None
            sub.staff_count = 5
            sub.save(update_fields=['stripe_extra_seat_subscription_id', 'staff_count'])
    except OwnerSubscription.DoesNotExist:
        logger.warning(
            'Stripe customer.subscription.deleted could not find matching local subscription.',
        )
