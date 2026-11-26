"""Authenticated sessions: browser vs native clients, the httpOnly JWT cookies and the signed-in user
payload."""
from users.feature_port import user_features
from users.membership_port import membership_services
from users.organization_port import organization_reads
from users.models import OrganizationMembership
from django.conf import settings
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.state import token_backend
from users.tokens import RefreshToken


def is_web_client(request):
    if request is None:
        return False
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


_is_web_client = is_web_client
TRUSTED_DEVICE_COOKIE = "ct_trusted_device"


def issue_session_tokens(request, refresh, *, remember_me=False):
    session_kind = 'web' if is_web_client(request) else 'native'
    return refresh.session_pair(session_kind=session_kind, remember_me=remember_me)


def refresh_session_policy(request, refresh):
    request_kind = 'web' if is_web_client(request) else 'native'
    token_kind = refresh.get('session_kind')
    if token_kind == 'native' and request_kind == 'web':
        raise TokenError('Token is invalid or expired.')

    session_kind = token_kind or request_kind
    remember_me = session_kind == 'web' and refresh.get('remember_me') is True
    deadline = int(refresh['exp']) if session_kind == 'web' and (token_kind == 'web' or remember_me) else None
    return {'session_kind': session_kind, 'remember_me': remember_me, 'deadline': deadline}


def reissue_session_tokens(request, user):
    previous = request.auth
    previous_kind = previous.get('session_kind') if previous else None
    sid = previous.get('sid') if previous else None
    session_kind = 'web' if previous_kind == 'web' or is_web_client(request) else 'native'
    remember_me = False
    deadline = None

    if session_kind == 'web' and previous_kind != 'native':
        remember_me = bool(previous and previous.get('remember_me') is True)
        deadline = previous.get('session_exp') if previous else None
        cookie_refresh = request.COOKIES.get(getattr(settings, 'JWT_REFRESH_COOKIE', 'ct_refresh'))
        if deadline is None and cookie_refresh:
            try:
                cookie = RefreshToken(cookie_refresh)
                if (
                    cookie.get('session_kind') != 'native'
                    and str(cookie['user_id']) == str(user.pk)
                    and (not sid or cookie['sid'] == sid)
                ):
                    remember_me = cookie.get('remember_me') is True
                    deadline = cookie['exp']
                    previous_kind = cookie.get('session_kind')
            except TokenError:
                pass

    refresh = RefreshToken.for_user(user)
    if sid:
        refresh['sid'] = sid
    if deadline is not None:
        deadline = int(deadline)
        if previous_kind != 'web' and not remember_me:
            deadline = min(deadline, int(refresh['iat']) + int(refresh.lifetime.total_seconds()))
    return refresh.session_pair(session_kind=session_kind, remember_me=remember_me, deadline=deadline)


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


def set_auth_cookies(response, *, access_token, refresh_token):
    # Both tokens were issued by this response, even if their deadline has just passed.
    refresh = token_backend.decode(refresh_token, verify=False)
    persistent = refresh.get('session_kind') == 'native' or refresh.get('remember_me') is True
    now = int(timezone.now().timestamp())
    response.set_cookie(
        getattr(settings, "JWT_AUTH_COOKIE", "ct_access"),
        access_token,
        max_age=max(0, token_backend.decode(access_token, verify=False)['exp'] - now) if persistent else None,
        **_cookie_kwargs(),
    )
    response.set_cookie(
        getattr(settings, "JWT_REFRESH_COOKIE", "ct_refresh"),
        refresh_token,
        max_age=max(0, refresh['exp'] - now) if persistent else None,
        **_cookie_kwargs(),
    )


def set_trusted_device_cookie(response, token, max_age):
    response.set_cookie(TRUSTED_DEVICE_COOKIE, token, max_age=max_age, **_cookie_kwargs())


def clear_trusted_device_cookie(response):
    kwargs = _cookie_kwargs()
    response.delete_cookie(
        TRUSTED_DEVICE_COOKIE, path=kwargs["path"], domain=kwargs.get("domain"), samesite=kwargs["samesite"],
    )


def clear_auth_cookies(response):
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


def build_authenticated_user_payload(user, *, current_user=False):
    from users.serializers import serialize_org_memberships

    org_memberships = OrganizationMembership.objects.filter(user=user)
    org_payload = serialize_org_memberships(org_memberships)

    pharm_memberships = membership_services().accepted_for_user(user)
    pharm_payload = [
        {
            "id": pm.id,
            "pharmacy_id": pm.pharmacy_id,
            "pharmacy_name": pm.pharmacy.name if pm.pharmacy else None,
            "role": pm.role,
            "employment_type": pm.employment_type,
        }
        for pm in pharm_memberships
    ]
    owned_pharmacies = organization_reads().owned_pharmacies(user)
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

    admin_assignments = organization_reads().admin_assignments_for(user).select_related("pharmacy")
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

    is_billing_active = user_features().is_billing_active
    is_in_free_trial = user_features().is_in_free_trial
    # Onboarding models depend on the users app: resolve this helper at call time,
    # so importing users.sessions cannot form a module-level app dependency cycle.
    from onboarding.services.work_profile import newcomer_type
    extra = {}
    if current_user:
        extra = {
            "content_capabilities": user_features().content_capabilities(user),
            "eligible_hubs": user_features().member_hubs(user),
            "public_community_enabled": bool(getattr(settings, "PUBLIC_COMMUNITY_ENABLED", False)),
        }

    return {
        **extra,
        "id": user.id,
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
        "mobile_check_skipped": bool(getattr(user, "mobile_check_skipped", False)),
        "newcomer_type": newcomer_type(user),
        "billing_active": is_billing_active(),
        "in_free_trial": is_in_free_trial(user),
    }


_set_auth_cookies = set_auth_cookies
_clear_auth_cookies = clear_auth_cookies


def _build_authenticated_user_payload(user):
    return build_authenticated_user_payload(user, current_user=True)
