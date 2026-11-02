"""Role-scoped checkout return navigation."""
from .checkout_urls import frontend_base_url as _frontend_base_url, mobile_bridge_url as _mobile_bridge_url


def _shift_dashboard_context(user, pharmacy):
    from organizations.models import PharmacyAdmin
    from users.models import OrganizationMembership

    organization_id = getattr(pharmacy, 'organization_id', None)
    if organization_id and OrganizationMembership.objects.filter(
        user=user,
        organization_id=organization_id,
        role__in=['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN'],
    ).exists():
        return {'scope': 'organization'}

    admin_assignment = PharmacyAdmin.objects.filter(
        user=user,
        pharmacy=pharmacy,
        is_active=True,
    ).first()
    if admin_assignment and admin_assignment.admin_level != PharmacyAdmin.AdminLevel.OWNER:
        return {'scope': 'admin', 'pharmacy_id': pharmacy.id}

    return {'scope': 'owner'}


def _shift_checkout_return_urls(shift, *, acting_user, platform='web', query_key='payment'):
    context = _shift_dashboard_context(acting_user, shift.pharmacy)
    success_value = 'success'
    cancel_value = 'cancel'

    if platform == 'mobile':
        if context['scope'] == 'organization':
            path = f"organization/shifts/{shift.id}"
        elif context['scope'] == 'admin':
            path = "admin/shifts"
        else:
            path = f"owner/shifts/{shift.id}"
        return (
            _mobile_bridge_url(path, **{query_key: success_value}),
            _mobile_bridge_url(path, **{query_key: cancel_value}),
        )

    base = _frontend_base_url()
    if context['scope'] == 'organization':
        route = f"{base}/dashboard/organization/shifts/{shift.id}"
    elif context['scope'] == 'admin':
        route = f"{base}/dashboard/admin/{context['pharmacy_id']}/shifts/{shift.id}"
    else:
        route = f"{base}/dashboard/owner/shifts/{shift.id}"
    return (
        f"{route}?{query_key}={success_value}",
        f"{route}?{query_key}={cancel_value}",
    )
