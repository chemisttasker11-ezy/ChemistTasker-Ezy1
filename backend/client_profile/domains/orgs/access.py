from __future__ import annotations

from typing import Iterable, Optional

from django.contrib.auth import get_user_model
from django.db.models import QuerySet

from client_profile.models import PharmacyAdmin, Pharmacy


AdminCapability = str

CAPABILITY_MANAGE_ADMINS = PharmacyAdmin.CAPABILITY_MANAGE_ADMINS
CAPABILITY_MANAGE_STAFF = PharmacyAdmin.CAPABILITY_MANAGE_STAFF
CAPABILITY_MANAGE_ROSTER = PharmacyAdmin.CAPABILITY_MANAGE_ROSTER
CAPABILITY_MANAGE_COMMS = PharmacyAdmin.CAPABILITY_MANAGE_COMMS


def admin_assignments_for(user) -> QuerySet[PharmacyAdmin]:
    if user is None:
        return PharmacyAdmin.objects.none()
    return PharmacyAdmin.objects.filter(user=user, is_active=True)


def pharmacies_user_admins(user) -> QuerySet[Pharmacy]:
    return Pharmacy.objects.filter(
        admin_assignments__user=user,
        admin_assignments__is_active=True,
    )


def assignment_for(user, pharmacy) -> Optional[PharmacyAdmin]:
    if user is None or pharmacy is None:
        return None
    return (
        PharmacyAdmin.objects.filter(
            user=user,
            pharmacy=pharmacy,
            is_active=True,
        )
        .select_related("pharmacy", "user")
        .first()
    )


def is_admin_of(user, pharmacy_id: int) -> bool:
    if user is None or pharmacy_id is None:
        return False
    return PharmacyAdmin.objects.filter(
        user=user,
        pharmacy_id=pharmacy_id,
        is_active=True,
    ).exists()


def has_admin_capability(user, pharmacy, capability: AdminCapability) -> bool:
    assignment = assignment_for(user, pharmacy)
    if not assignment:
        return False
    return assignment.has_capability(capability)


def is_owner_admin(user, pharmacy) -> bool:
    assignment = assignment_for(user, pharmacy)
    return bool(assignment and assignment.admin_level == PharmacyAdmin.AdminLevel.OWNER)


def is_any_admin(user) -> bool:
    return admin_assignments_for(user).exists()


def can_manage_admins(user, pharmacy) -> bool:
    return has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ADMINS)


def can_manage_roster(user, pharmacy) -> bool:
    return has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ROSTER)


def can_manage_staff(user, pharmacy) -> bool:
    return has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_STAFF)


def can_manage_comms(user, pharmacy) -> bool:
    return has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_COMMS)
