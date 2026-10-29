"""Stripe configuration, metadata and local provider identity contracts."""
from django.conf import settings
import stripe

from .models import OwnerSubscription


stripe.api_key = settings.STRIPE_SECRET_KEY
BASE_SUB_PRICE = 'price_1T52ikBQXaySV5ukpVrv7EcZ'
EXTRA_SEAT_PRICE = 'price_1T52ilBQXaySV5uk2fmUWXlw'


def _build_subscription_metadata(account, *, actor_user, staff_count=None, pharmacy=None):
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


def _build_extra_seat_metadata(account, *, actor_user, extra_seat_count, pharmacy=None):
    metadata = _build_subscription_metadata(
        account,
        actor_user=actor_user,
        staff_count=5 + max(extra_seat_count, 0),
        pharmacy=pharmacy,
    )
    metadata['subscription_kind'] = 'extra_seats'
    metadata['extra_seat_count'] = max(extra_seat_count, 0)
    return metadata


def _get_subscription_from_metadata(metadata):
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


def _get_subscription_from_customer(customer_id):
    if not customer_id:
        return None
    return OwnerSubscription.objects.filter(stripe_customer_id=customer_id).first()


def _stripe_object_value(obj, key, default=None):
    """Read StripeObject/dict safely; Stripe returns both shapes in adapters."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)
