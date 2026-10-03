from datetime import date, timedelta
from django.conf import settings
from organizations.access import CAPABILITY_MANAGE_ROSTER, has_admin_capability
from users.models import OrganizationMembership

BILLING_STATE_PRE_LIVE = "PRE_LIVE"
BILLING_STATE_FREE_TRIAL = "FREE_TRIAL"
BILLING_STATE_PAYMENT_REQUIRED = "PAYMENT_REQUIRED"


def is_billing_active() -> bool:
    """Returns True if today is on or after the global billing live date."""
    live_date = getattr(settings, 'BILLING_LIVE_DATE', None)
    if live_date is None:
        return True  # no date set → billing is on
    return date.today() >= live_date


def is_in_free_trial(user) -> bool:
    """
    Returns True if the user registered within the FREE_TRIAL_DAYS window.
    Uses Django's built-in user.date_joined field.
    """
    if not is_billing_active():
        return False  # billing not started yet — trial concept irrelevant
    trial_days = getattr(settings, 'FREE_TRIAL_DAYS', 30)
    if not hasattr(user, 'date_joined') or not user.date_joined:
        return False
    cutoff = date.today() - timedelta(days=trial_days)
    return user.date_joined.date() > cutoff


def user_can_manage_billing_for_pharmacy(user, pharmacy) -> bool:
    if pharmacy.owner and getattr(pharmacy.owner, 'user', None) == user:
        return True
    if OrganizationMembership.objects.filter(
        user=user,
        role='ORG_ADMIN',
        organization_id=pharmacy.organization_id,
    ).exists():
        return True
    if OrganizationMembership.objects.filter(
        user=user,
        role__in=['CHIEF_ADMIN', 'REGION_ADMIN'],
        pharmacies=pharmacy,
    ).exists():
        return True
    return has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ROSTER)


def resolve_billing_account(pharmacy, acting_user=None) -> dict:
    owner_user = getattr(getattr(pharmacy, 'owner', None), 'user', None)
    organization = getattr(pharmacy, 'organization', None)

    if organization is not None:
        org_admin_membership = (
            OrganizationMembership.objects.filter(
                organization=organization,
                role='ORG_ADMIN',
            )
            .select_related('user')
            .order_by('id')
            .first()
        )
        if (
            acting_user
            and OrganizationMembership.objects.filter(
                user=acting_user,
                organization=organization,
            ).exists()
        ):
            billing_contact = acting_user
        elif org_admin_membership and org_admin_membership.user_id:
            billing_contact = org_admin_membership.user
        elif owner_user is not None:
            billing_contact = owner_user
        else:
            billing_contact = acting_user
        return {
            'scope': 'organization',
            'organization': organization,
            'owner_user': owner_user,
            'billing_contact': billing_contact,
        }

    return {
        'scope': 'owner',
        'organization': None,
        'owner_user': owner_user,
        'billing_contact': owner_user or acting_user,
    }


def billing_account_display_name(account: dict) -> str:
    if account['scope'] == 'organization' and account.get('organization') is not None:
        return account['organization'].name
    owner_user = account.get('owner_user')
    if owner_user is not None:
        return owner_user.get_full_name() or owner_user.email
    contact = account.get('billing_contact')
    if contact is not None:
        return contact.get_full_name() or contact.email
    return 'Unknown billing account'


def get_billing_state_for_account(account: dict) -> str:
    if not is_billing_active():
        return BILLING_STATE_PRE_LIVE
    billing_contact = account.get('billing_contact') or account.get('owner_user')
    if billing_contact and is_in_free_trial(billing_contact):
        return BILLING_STATE_FREE_TRIAL
    return BILLING_STATE_PAYMENT_REQUIRED


def get_billing_state_for_pharmacy(pharmacy, acting_user=None) -> str:
    account = resolve_billing_account(pharmacy, acting_user=acting_user)
    return get_billing_state_for_account(account)


def get_billing_state(user) -> str:
    """
    Returns one of:
      - PRE_LIVE
      - FREE_TRIAL
      - PAYMENT_REQUIRED
    """
    if not is_billing_active():
        return BILLING_STATE_PRE_LIVE
    if is_in_free_trial(user):
        return BILLING_STATE_FREE_TRIAL
    return BILLING_STATE_PAYMENT_REQUIRED
