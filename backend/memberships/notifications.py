"""Dashboard links used by the membership-application notifications, per recipient role."""
from django.conf import settings


def _frontend_base_url() -> str:
    """
    Returns the FE base URL for building absolute links.
    Falls back to localhost:5174 for dev if not set.
    """
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    return base or "http://localhost:5174"


def _manage_path_for_role(recipient_role: str) -> str:
    """
    Map the recipient's role to the correct dashboard route.
    - Owner & Pharmacy Admin use the Owner dashboard area
    - Org Admin uses the Organization dashboard area
    """
    if recipient_role in ("OWNER", "PHARMACY_ADMIN"):
        return "/dashboard/owner/manage-pharmacies"
    if recipient_role == "ORG_ADMIN":
        return "/dashboard/organization/manage-pharmacies"
    # Fallback to owner area if something unexpected slips through
    return "/dashboard/owner/manage-pharmacies"


def _manage_detail_url_for_role(recipient_role: str, pharmacy_id: int | str) -> str:
    base_path = _manage_path_for_role(recipient_role)
    return f"{base_path}?workspace=internal&pharmacy_id={pharmacy_id}&view=detail&pharmacyId={pharmacy_id}"
