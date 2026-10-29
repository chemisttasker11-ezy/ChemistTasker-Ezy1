"""Billing subscription-account operations shared by HTTP endpoints and webhook handlers."""

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


def build_subscription_metadata(account, *, actor_user, staff_count=None, pharmacy=None):
    metadata = {
        'billing_scope': account['scope'],
        'actor_user_id': actor_user.id,
    }
    if staff_count is not None:
        metadata['staff_count'] = staff_count
    if pharmacy is not None:
        metadata['pharmacy_id'] = pharmacy.id
    if account.get('owner_user') is not None:
        metadata['owner_user_id'] = account['owner_user'].id
    if account.get('organization') is not None:
        metadata['organization_id'] = account['organization'].id
    if account.get('billing_contact') is not None:
        metadata['billing_contact_user_id'] = account['billing_contact'].id
    return metadata


def build_extra_seat_metadata(account, *, actor_user, extra_seat_count, pharmacy=None):
    metadata = build_subscription_metadata(
        account,
        actor_user=actor_user,
        staff_count=5 + max(extra_seat_count, 0),
        pharmacy=pharmacy,
    )
    metadata['subscription_kind'] = 'extra_seats'
    metadata['extra_seat_count'] = max(extra_seat_count, 0)
    return metadata


def get_subscription_from_metadata(metadata):
    organization_id = metadata.get('organization_id')
    owner_user_id = metadata.get('owner_user_id')
    if organization_id:
        return OwnerSubscription.objects.filter(organization_id=organization_id).first()
    if owner_user_id:
        return OwnerSubscription.objects.filter(owner_id=owner_user_id).first()
    actor_user_id = metadata.get('actor_user_id')
    if actor_user_id:
        return OwnerSubscription.objects.filter(owner_id=actor_user_id).first()
    return None


def get_subscription_from_customer(customer_id):
    if not customer_id:
        return None
    return OwnerSubscription.objects.filter(stripe_customer_id=customer_id).first()


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
