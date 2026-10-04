"""Frontend navigation helpers derived from user identity and role."""
from django.conf import settings


def get_frontend_dashboard_url(user):
    """
    Return the established frontend dashboard URL for the user's role.
    """
    if not user or not hasattr(user, "role"):
        return f"{settings.FRONTEND_BASE_URL}/dashboard/"

    if user.role == "PHARMACY_MANAGER":
        return _pharmacy_manager_dashboard_url(user)

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


def _pharmacy_manager_dashboard_url(user):
    """A PHARMACY_MANAGER has no dashboard of its own: it lands on the admin dashboard of the pharmacy it manages."""
    from organizations.models import PharmacyAdmin

    pharmacy_id = (
        PharmacyAdmin.objects.filter(user=user, is_active=True)
        .order_by("id")
        .values_list("pharmacy_id", flat=True)
        .first()
    )
    if pharmacy_id is None:
        return f"{settings.FRONTEND_BASE_URL}/dashboard/"
    return f"{settings.FRONTEND_BASE_URL}/dashboard/admin/{pharmacy_id}"
