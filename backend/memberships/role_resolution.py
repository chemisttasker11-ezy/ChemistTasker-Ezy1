"""Resolve the concrete workforce role represented by a user's personal profile."""
from onboarding.models import OtherStaffOnboarding


OTHER_STAFF_MEMBERSHIP_ROLES = {"INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT"}


def personal_pharmacy_role(user) -> str | None:
    """Return the concrete pharmacy workforce role implied by an existing personal account."""
    role = str(getattr(user, "role", "") or "").upper()
    if role == "PHARMACIST":
        return "PHARMACIST"
    if role == "OTHER_STAFF":
        role_type = (
            OtherStaffOnboarding.objects.filter(user=user)
            .values_list("role_type", flat=True)
            .first()
        )
        normalized = str(role_type or "").upper()
        return normalized if normalized in OTHER_STAFF_MEMBERSHIP_ROLES else None
    return None
