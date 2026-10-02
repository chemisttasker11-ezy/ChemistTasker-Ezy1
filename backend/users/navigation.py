"""Frontend navigation helpers derived from user identity and role."""
from django.conf import settings


def get_frontend_dashboard_url(user):
    """
    Return the established frontend dashboard URL for the user's role.
    """
    if not user or not hasattr(user, "role"):
        return f"{settings.FRONTEND_BASE_URL}/dashboard/"

    role_slug = user.role.lower()
    if role_slug == "other_staff":
        role_slug = "otherstaff"
    elif role_slug == "owner":
        if hasattr(user, "organization_memberships") and user.organization_memberships.filter(
            role__in=["ORG_ADMIN", "CHIEF_ADMIN", "REGION_ADMIN"]
        ).exists():
            return f"{settings.FRONTEND_BASE_URL}/dashboard/organization/"
        return f"{settings.FRONTEND_BASE_URL}/dashboard/owner/"

    return f"{settings.FRONTEND_BASE_URL}/dashboard/{role_slug}/"
