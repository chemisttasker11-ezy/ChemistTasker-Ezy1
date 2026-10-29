"""Authorized subscription checkout, reads and seat adjustment workflows."""
import logging

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from .checkout_urls import (
    extra_seat_return_urls as _extra_seat_return_urls,
    subscription_return_urls as _subscription_return_urls,
)
from .models import OwnerSubscription
from .stripe_support import (
    BASE_SUB_PRICE,
    EXTRA_SEAT_PRICE,
    _build_extra_seat_metadata,
    _build_subscription_metadata,
    _stripe_object_value,
    stripe,
)
from .subscriptions import (
    get_or_create_subscription_for_account as _get_or_create_subscription_for_account,
    get_subscription_for_account as _get_subscription_for_account,
    serialize_subscription as _serialize_subscription,
)
from .utils import billing_account_display_name


logger = logging.getLogger(__name__)


def create_subscription_checkout(user, account, pharmacy, staff_count, payment_method_input, platform):
    try:
        subscription = _get_or_create_subscription_for_account(account)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if subscription.status == 'active' and subscription.stripe_subscription_id:
        return Response({'error': 'An active subscription already exists for this billing account.'}, status=status.HTTP_400_BAD_REQUEST)

    success_url, cancel_url = _subscription_return_urls(account, platform=platform)

    billing_contact = account.get('billing_contact') or user
    customer_email = getattr(billing_contact, 'email', None) or user.email
    customer_name = billing_account_display_name(account)
    if not subscription.stripe_customer_id:
        try:
            customer = stripe.Customer.create(
                email=customer_email,
                name=customer_name
            )
            subscription.stripe_customer_id = customer.id
            subscription.save()
        except Exception:
            logger.exception('Stripe customer creation failed')
            return Response({'error': 'Unable to initialise billing with the payment provider.'}, status=status.HTTP_400_BAD_REQUEST)

    # 2. Line Items Configuration
    line_items = [
        {'price': BASE_SUB_PRICE, 'quantity': 1}
    ]

    try:
        # 3. IF INVOICE: Create subscription directly without checkout, set to send_invoice
        if payment_method_input == 'invoice':
            sub = stripe.Subscription.create(
                customer=subscription.stripe_customer_id,
                items=line_items,
                collection_method='send_invoice',
                days_until_due=7,
                metadata=_build_subscription_metadata(
                    account,
                    actor_user=user,
                    staff_count=staff_count,
                    pharmacy=pharmacy,
                ),
            )
            # Sync to local DB
            subscription.stripe_subscription_id = sub.id
            subscription.staff_count = staff_count
            subscription.status = 'inactive' # remains inactive until invoice is paid
            subscription.save()
            return Response({
                'message': 'Invoice sent. Check your email.',
                'subscription_id': sub.id
            })

        # 4. IF CARD: Create a Stripe Checkout Session for collection
        else:
            checkout_session = stripe.checkout.Session.create(
                customer=subscription.stripe_customer_id,
                payment_method_types=['card'],
                line_items=line_items,
                mode='subscription',
                success_url=success_url,
                cancel_url=cancel_url,
                metadata=_build_subscription_metadata(
                    account,
                    actor_user=user,
                    staff_count=staff_count,
                    pharmacy=pharmacy,
                ),
            )
            return Response({'url': checkout_session.url})

    except Exception:
        logger.exception('Billing request failed')
        return Response({'error': 'Unable to complete the billing request.'}, status=status.HTTP_400_BAD_REQUEST)


def current_subscription(account):
    subscription = _get_subscription_for_account(account)
    payload = _serialize_subscription(subscription)
    payload.update({
        'billingScope': account['scope'],
        'accountName': billing_account_display_name(account),
    })
    return Response(payload)


def update_subscription_seats(user, account, desired_staff_count, platform):
    scope = {'owner': account['owner_user']} if account['scope'] == 'owner' else {
        'organization': account['organization'],
    }
    try:
        with transaction.atomic():
            subscription = OwnerSubscription.objects.select_for_update().filter(**scope).first()
            if not subscription or subscription.status != 'active' or not subscription.stripe_subscription_id:
                return Response({'error': 'No active subscription found for this billing account.'}, status=400)
            desired_extra = desired_staff_count - 5
            current_extra = max(0, (subscription.staff_count or 5) - 5)

            if subscription.stripe_extra_seat_subscription_id:
                if desired_extra == current_extra:
                    payload = _serialize_subscription(subscription)
                    payload.update({
                        'message': 'No seat change detected.',
                        'billingScope': account['scope'],
                        'accountName': billing_account_display_name(account),
                    })
                    return Response(payload)

                # Verify the existing subscription and its item at Stripe:
                # never mutate a different customer's or unrelated price item.
                provider = stripe.Subscription.retrieve(subscription.stripe_extra_seat_subscription_id)
                if _stripe_object_value(provider, 'customer') != subscription.stripe_customer_id:
                    return Response({'error': 'Stripe subscription customer does not match this billing account.'}, status=409)
                if _stripe_object_value(provider, 'status') not in ('active', 'trialing'):
                    return Response({'error': 'Extra-seat subscription is not active at Stripe.'}, status=409)
                items = _stripe_object_value(_stripe_object_value(provider, 'items', {}), 'data', [])
                matching = [
                    item for item in items
                    if _stripe_object_value(_stripe_object_value(item, 'price', {}), 'id') == EXTRA_SEAT_PRICE
                ]
                if len(matching) != 1 or len(items) != 1:
                    return Response({'error': 'Cannot safely identify the single extra-seat price item.'}, status=409)

                # Stripe creates the appropriate next-invoice proration for
                # additions/downgrades; base subscription remains untouched.
                updated = stripe.Subscription.modify(
                    subscription.stripe_extra_seat_subscription_id,
                    items=[{'id': _stripe_object_value(matching[0], 'id'),
                            'quantity': desired_extra}],
                    proration_behavior='create_prorations',
                    payment_behavior='error_if_incomplete',
                )
                updated_items = _stripe_object_value(_stripe_object_value(updated, 'items', {}), 'data', [])
                matching_updated = [
                    item for item in updated_items
                    if _stripe_object_value(_stripe_object_value(item, 'price', {}), 'id') == EXTRA_SEAT_PRICE
                ]
                if (_stripe_object_value(updated, 'status') not in ('active', 'trialing')
                        or len(matching_updated) != 1
                        or int(_stripe_object_value(matching_updated[0], 'quantity', -1)) != desired_extra):
                    raise ValueError('Stripe did not confirm the requested seat quantity.')
                subscription.staff_count = desired_staff_count
                subscription.save(update_fields=['staff_count', 'updated_at'])
                payload = _serialize_subscription(subscription)
                payload.update({
                    'message': 'Existing extra-seat subscription quantity updated at Stripe.',
                    'billingScope': account['scope'],
                    'accountName': billing_account_display_name(account),
                })
                return Response(payload)

            if desired_extra == current_extra:
                return Response({
                    **_serialize_subscription(subscription),
                    'message': 'No seat change detected.',
                    'billingScope': account['scope'],
                    'accountName': billing_account_display_name(account),
                })
            if desired_extra < 1:
                return Response({'error': 'No purchased extra-seat subscription exists to resize.'}, status=409)
            success_url, cancel_url = _extra_seat_return_urls(account, platform=platform)
            checkout_session = stripe.checkout.Session.create(
                customer=subscription.stripe_customer_id,
                payment_method_types=['card'],
                line_items=[{'price': EXTRA_SEAT_PRICE, 'quantity': desired_extra}],
                mode='subscription',
                success_url=success_url, cancel_url=cancel_url,
                metadata=_build_extra_seat_metadata(
                    account, actor_user=user, extra_seat_count=desired_extra,
                ),
            )
            return Response({
                'url': checkout_session.url,
                'message': 'Redirecting to Stripe to purchase extra seats.',
            })
    except stripe.error.StripeError:
        logger.exception('Stripe extra-seat quantity adjustment failed')
        return Response({'error': 'Stripe could not update the extra-seat subscription.'}, status=400)
    except Exception:
        logger.exception('Unexpected extra-seat billing reconciliation error')
        return Response({'error': 'Unable to confirm the seat adjustment.'}, status=409)
