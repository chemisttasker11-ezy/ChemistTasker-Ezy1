from __future__ import annotations

from typing import Iterable, Optional

from django.contrib.auth import get_user_model
from django.db.models import QuerySet

from organizations.models import PharmacyAdmin, Pharmacy
from users.org_roles import membership_capabilities, membership_visible_pharmacy_ids, OrgCapability


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


def _collect_org_access_scope(user):
    """Return organization-wide access plus explicitly scoped pharmacy ids."""
    if not user or not getattr(user, "is_authenticated", False):
        return set(), {}

    memberships = user.organization_memberships.select_related("organization").prefetch_related("pharmacies")
    full_access_org_ids = set()
    scoped_by_org = {}

    for membership in memberships:
        caps = membership_capabilities(membership)
        if OrgCapability.VIEW_ALL_PHARMACIES in caps:
            full_access_org_ids.add(membership.organization_id)
            continue

        visible_ids = membership_visible_pharmacy_ids(membership)
        if visible_ids:
            scoped = scoped_by_org.setdefault(membership.organization_id, set())
            scoped.update(visible_ids)

    return full_access_org_ids, scoped_by_org


def _get_org_pharmacies_queryset(user):
    full_access_org_ids, scoped_by_org = _collect_org_access_scope(user)
    qs = Pharmacy.objects.none()

    if full_access_org_ids:
        qs = qs | Pharmacy.objects.filter(organization_id__in=full_access_org_ids)

    scoped_ids = set()
    for ids in scoped_by_org.values():
        scoped_ids.update(ids)
    if scoped_ids:
        qs = qs | Pharmacy.objects.filter(id__in=scoped_ids)

    return qs.distinct()
