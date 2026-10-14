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


# Owner decision 2026-10-14: inside its own team a pharmacy may give a Pharmacy team member, or a pharmacist, an
# assistant, technician or student role, whatever their profile role. Pharmacist and intern memberships need the
# matching registered profile (AHPRA). Membership roles only drive internal/community shifts (shifts.access); the public
# profile always shows the person's own profile role.
FLEXIBLE_MEMBERSHIP_ROLES = {"ASSISTANT", "TECHNICIAN", "STUDENT"}


def membership_role_refusal(user, role) -> str | None:
    """Why this existing account cannot hold the membership role, or None when it can."""
    account = str(getattr(user, "role", "") or "").upper()
    role = str(role or "").upper()
    if role in FLEXIBLE_MEMBERSHIP_ROLES:
        if account in ("PHARMACIST", "OTHER_STAFF"):
            return None
        return "Only pharmacists and Pharmacy team accounts can be added with this role."
    if role == "PHARMACIST" and account != "PHARMACIST":
        return "Only a registered pharmacist account can be added as a pharmacist."
    if role == "INTERN" and personal_pharmacy_role(user) != "INTERN":
        return "Only an account registered as an intern pharmacist can be added as an intern."
    return None
