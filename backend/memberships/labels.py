"""Display labels owned by the membership domain."""
from memberships.models import Membership


OTHER_STAFF_ROLE_LABELS = {
    "INTERN": "Intern Pharmacist",
    "TECHNICIAN": "Dispensary Technician",
    "ASSISTANT": "Pharmacy Assistant",
    "STUDENT": "Pharmacy Student",
}


def membership_role_label(role):
    if not role:
        return ""
    normalized = str(role or "").strip().upper()
    fallback = OTHER_STAFF_ROLE_LABELS.get(normalized, str(role).replace("_", " ").title())
    return dict(Membership.ROLE_CHOICES).get(role, fallback)
