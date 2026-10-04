"""Authenticated sessions: browser vs native clients, the httpOnly JWT cookies and the signed-in user
payload."""
from users.models import OrganizationMembership
from organizations.access import admin_assignments_for
from memberships.models import Membership
from organizations.models import Pharmacy
from django.conf import settings
from users.serializers import serialize_org_memberships


def _is_web_client(request):
    # A browser's Origin/Referer takes precedence over a caller-supplied
    # platform label. Browser responses must never expose the refresh token.
    if request.headers.get("Origin") or request.headers.get("Referer"):
        return True
    platform = (
        request.headers.get("X-Client-Platform")
        or request.headers.get("x-client-platform")
        or ""
    ).strip().lower()
    if platform in {"mobile", "app", "expo"}:
        return False
    if platform in {"web", "browser"}:
        return True
    # Legacy API clients without a browser origin retain the token response.
    return False


def _cookie_kwargs():
    kwargs = {
        "httponly": True,
        "secure": bool(getattr(settings, "JWT_COOKIE_SECURE", not settings.DEBUG)),
        "samesite": getattr(settings, "JWT_COOKIE_SAMESITE", "None" if not settings.DEBUG else "Lax"),
        "path": getattr(settings, "JWT_COOKIE_PATH", "/"),
    }
    cookie_domain = getattr(settings, "JWT_COOKIE_DOMAIN", None)
    if cookie_domain:
        kwargs["domain"] = cookie_domain
    return kwargs


def _set_auth_cookies(response, *, access_token, refresh_token, remember_me=None):
    persistent = remember_me is not False
    response.set_cookie(
        getattr(settings, "JWT_AUTH_COOKIE", "ct_access"),
        access_token,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()) if persistent else None,
        **_cookie_kwargs(),
    )
    response.set_cookie(
        getattr(settings, "JWT_REFRESH_COOKIE", "ct_refresh"),
        refresh_token,
        max_age=int(settings.JWT_REMEMBER_ME_REFRESH_TOKEN_LIFETIME.total_seconds())
        if remember_me is True
        else int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
        if persistent
        else None,
        **_cookie_kwargs(),
    )


def _clear_auth_cookies(response):
    cookie_kwargs = _cookie_kwargs()
    domain = cookie_kwargs.get("domain")
    path = cookie_kwargs.get("path", "/")
    samesite = cookie_kwargs.get("samesite")
    response.delete_cookie(
        getattr(settings, "JWT_AUTH_COOKIE", "ct_access"),
        path=path,
        domain=domain,
        samesite=samesite,
    )
    response.delete_cookie(
        getattr(settings, "JWT_REFRESH_COOKIE", "ct_refresh"),
        path=path,
        domain=domain,
        samesite=samesite,
    )


def _build_authenticated_user_payload(user):
    org_memberships = OrganizationMembership.objects.filter(user=user)
    org_payload = serialize_org_memberships(org_memberships)

    pharm_memberships = Membership.objects.filter(
        user=user,
        is_active=True,
        status=Membership.Status.ACCEPTED,
    ).select_related("pharmacy")
    pharm_payload = [
        {
            "pharmacy_id": pm.pharmacy_id,
            "pharmacy_name": pm.pharmacy.name if pm.pharmacy else None,
            "role": pm.role,
            "employment_type": pm.employment_type,
        }
        for pm in pharm_memberships
    ]
    owned_pharmacies = Pharmacy.objects.filter(owner__user=user)
    for pharmacy in owned_pharmacies:
        pharm_payload.append(
            {
                "pharmacy_id": pharmacy.id,
                "pharmacy_name": pharmacy.name,
                "role": "OWNER",
            }
        )
    deduped_pharmacy_memberships = list(
        {entry["pharmacy_id"]: entry for entry in pharm_payload}.values()
    )

    admin_assignments = admin_assignments_for(user).select_related("pharmacy")
    admin_payload = [
        {
            "id": assignment.id,
            "pharmacy_id": assignment.pharmacy_id,
            "pharmacy_name": assignment.pharmacy.name if assignment.pharmacy else None,
            "admin_level": assignment.admin_level,
            "capabilities": sorted(list(assignment.capabilities)),
            "staff_role": assignment.staff_role,
            "job_title": assignment.job_title,
            "is_active": assignment.is_active,
        }
        for assignment in admin_assignments
    ]

    from billing.utils import is_billing_active, is_in_free_trial
    from public_hub.permissions import capabilities, member_hubs

    return {
        "id": user.id,
        "content_capabilities": capabilities(user),
        "eligible_hubs": member_hubs(user),
        "public_community_enabled": bool(getattr(settings, "PUBLIC_COMMUNITY_ENABLED", False)),
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "mobile_number": user.mobile_number,
        "memberships": org_payload + deduped_pharmacy_memberships,
        "admin_assignments": admin_payload,
        "is_pharmacy_admin": bool(admin_payload),
        "is_mobile_verified": bool(getattr(user, "is_mobile_verified", False)),
        "billing_active": is_billing_active(),
        "in_free_trial": is_in_free_trial(user),
    }
