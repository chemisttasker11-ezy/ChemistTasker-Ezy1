"""Synchronise delegated pharmacy-manager relationships with a user's personal worker profile.

Organisation email onboarding deliberately creates a CONTACT membership plus a full MANAGER
PharmacyAdmin assignment before the invited person has chosen a worker account type. Once that
personal type is known, keep the pharmacy membership/staff_role aligned without changing the
MANAGER authority or creating organisation-admin authority.
"""
from django.db import transaction

from memberships.models import Membership
from organizations.models import PharmacyAdmin
from onboarding.models import OtherStaffOnboarding


OTHER_STAFF_MEMBERSHIP_ROLES = {"INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT"}


def personal_pharmacy_role(user) -> str | None:
    """Return the concrete pharmacy workforce role implied by the user's personal profile."""
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


def sync_managed_pharmacy_memberships(user, *, explicit_role: str | None = None) -> int:
    """Align accepted pharmacy memberships linked to full delegated MANAGER assignments.

    OWNER and other non-worker base roles are intentionally ignored. For OTHER_STAFF before a
    concrete role_type is chosen, CONTACT remains the safe temporary membership and staff_role is
    cleared. The MANAGER assignment itself is never downgraded.
    """
    base_role = str(getattr(user, "role", "") or "").upper()
    if base_role not in {"PHARMACIST", "OTHER_STAFF"}:
        return 0

    target_role = str(explicit_role or personal_pharmacy_role(user) or "").upper()
    if base_role == "PHARMACIST":
        target_role = "PHARMACIST"
    elif target_role not in OTHER_STAFF_MEMBERSHIP_ROLES:
        target_role = ""

    changed = 0
    with transaction.atomic():
        memberships = list(
            Membership.objects.select_for_update()
            .select_related("pharmacy", "admin_assignment")
            .filter(
                user=user,
                is_active=True,
                status=Membership.Status.ACCEPTED,
                pharmacy__organization__isnull=False,
                admin_assignment__is_active=True,
                admin_assignment__admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            )
        )

        for membership in memberships:
            assignment = membership.admin_assignment
            if target_role:
                membership_updates = []
                if membership.role != target_role:
                    membership.role = target_role
                    membership_updates.append("role")
                if membership_updates:
                    membership.save(update_fields=membership_updates + ["updated_at"])

                if assignment.staff_role != target_role:
                    assignment.staff_role = target_role
                    assignment.save(update_fields=["staff_role", "updated_at"])
                    changed += 1
                elif membership_updates:
                    changed += 1
            else:
                # OTHER_STAFF has not selected its concrete pharmacy role yet.
                if membership.role != "CONTACT":
                    membership.role = "CONTACT"
                    membership.save(update_fields=["role", "updated_at"])
                    changed += 1
                if assignment.staff_role:
                    assignment.staff_role = None
                    assignment.save(update_fields=["staff_role", "updated_at"])
                    changed += 1
    return changed
