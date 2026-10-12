"""Viewer-specific published pay policy; agreed assignment terms remain separate."""
from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from organizations.access import user_can_manage_pharmacy
from organizations.chains import active_owner_chains_for_pharmacy


PUBLISHED_PAY_FIELDS = {
    'rate_type', 'fixed_rate', 'owner_adjusted_rate', 'min_hourly_rate',
    'max_hourly_rate', 'min_annual_salary', 'max_annual_salary',
    'super_percent', 'payment_preference',
}


def published_rates_visible(user, pharmacy):
    if not user or not getattr(user, 'is_authenticated', False):
        return True
    if user_can_manage_pharmacy(user, pharmacy):
        return True
    staff = Membership.objects.filter(
        user=user, is_active=True, status=Membership.Status.ACCEPTED,
        employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
    )
    if staff.filter(pharmacy=pharmacy).exists():
        return False
    chains = active_owner_chains_for_pharmacy(pharmacy)
    return not staff.filter(pharmacy__chains__in=chains).exists()


def project_published_rates(data, *, user, pharmacy):
    """Remove published pay, including nested defaults that could reconstruct it."""
    visible = data.get('published_rates_visible')
    if visible is None:
        visible = published_rates_visible(user, pharmacy)
    data['published_rates_visible'] = visible
    if visible:
        return data
    for field in PUBLISHED_PAY_FIELDS:
        data.pop(field, None)
    data['ui_is_negotiable'] = False
    for slot in data.get('slots') or []:
        slot.pop('rate', None)
    detail = data.get('pharmacy_detail')
    if isinstance(detail, dict):
        for field in list(detail):
            if field.startswith('rate_') or field.startswith('default_') or field in PUBLISHED_PAY_FIELDS:
                detail.pop(field, None)
    return data
