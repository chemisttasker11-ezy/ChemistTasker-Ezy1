"""Local subscription account selection, persistence and response projection.

Read selection may use an active owner subscription for an organization whose
own plan is inactive. Creating a subscription always targets the primary
account. HTTP authorization, provider operations and transaction ownership stay
with the caller.
"""

from .models import OwnerSubscription


def subscription_lookup_from_account(account):
    if account['scope'] == 'organization' and account.get('organization') is not None:
        return {'organization': account['organization']}
    owner_user = account.get('owner_user')
    if owner_user is None:
        raise ValueError('No billing owner found for this pharmacy.')
    return {'owner': owner_user}


def get_subscription_for_account(account):
    lookup = subscription_lookup_from_account(account)
    primary = OwnerSubscription.objects.filter(**lookup).first()
    if account['scope'] != 'organization':
        return primary

    if primary and primary.status == 'active':
        return primary

    owner_user = account.get('owner_user')
    if owner_user is not None:
        owner_subscription = OwnerSubscription.objects.filter(owner=owner_user).first()
        if owner_subscription and owner_subscription.status == 'active':
            return owner_subscription

    return primary


def get_or_create_subscription_for_account(account):
    lookup = subscription_lookup_from_account(account)
    defaults = {
        'billing_contact': account.get('billing_contact') or account.get('owner_user'),
    }
    subscription, _created = OwnerSubscription.objects.get_or_create(
        defaults=defaults,
        **lookup,
    )
    updated_fields = []
    if account.get('billing_contact') and subscription.billing_contact_id != account['billing_contact'].id:
        subscription.billing_contact = account['billing_contact']
        updated_fields.append('billing_contact')
    if updated_fields:
        subscription.save(update_fields=updated_fields)
    return subscription


def serialize_subscription(subscription):
    if not subscription:
        return {
            'exists': False,
            'active': False,
            'status': 'inactive',
            'staffCount': 5,
            'extraSeatCount': 0,
            'stripeCustomerId': None,
            'stripeSubscriptionId': None,
            'currentPeriodEnd': None,
        }

    staff_count = max(subscription.staff_count or 5, 5)
    return {
        'exists': True,
        'active': subscription.status == 'active',
        'status': subscription.status,
        'staffCount': staff_count,
        'extraSeatCount': max(0, staff_count - 5),
        'stripeCustomerId': subscription.stripe_customer_id,
        'stripeSubscriptionId': subscription.stripe_subscription_id,
        'stripeExtraSeatSubscriptionId': subscription.stripe_extra_seat_subscription_id,
        'currentPeriodEnd': subscription.current_period_end.isoformat() if subscription.current_period_end else None,
    }
