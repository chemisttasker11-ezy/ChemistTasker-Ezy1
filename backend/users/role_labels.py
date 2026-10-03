"""Display labels derived from user/work roles."""
from onboarding.models import OtherStaffOnboarding


OTHER_STAFF_ROLE_LABELS = {
    "INTERN": "Intern Pharmacist",
    "TECHNICIAN": "Dispensary Technician",
    "ASSISTANT": "Pharmacy Assistant",
    "STUDENT": "Pharmacy Student",
}


def other_staff_role_label(role_type, fallback="Other Staff"):
    normalized = str(role_type or "").strip().upper()
    return OTHER_STAFF_ROLE_LABELS.get(normalized, fallback)


def user_work_role_label(user, fallback="candidate"):
    role = str(getattr(user, "role", "") or "").strip().upper()
    if role == "PHARMACIST":
        return "Pharmacist"
    if role == "OTHER_STAFF":
        role_type = None
        profile = getattr(user, "otherstaffonboarding", None)
        if profile:
            role_type = getattr(profile, "role_type", None)
        if not role_type and getattr(user, "id", None):
            role_type = (
                OtherStaffOnboarding.objects.filter(user=user)
                .values_list("role_type", flat=True)
                .first()
            )
        return other_staff_role_label(role_type, "Other Staff")
    if role == "EXPLORER":
        return "Candidate"
    return fallback
