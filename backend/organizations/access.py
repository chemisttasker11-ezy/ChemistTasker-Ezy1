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


def _is_active_actor(user) -> bool:
    return bool(user and getattr(user, "is_authenticated", False)
                and getattr(user, "is_active", False))


def admin_assignments_for(user) -> QuerySet[PharmacyAdmin]:
    if not _is_active_actor(user):
        return PharmacyAdmin.objects.none()
    return PharmacyAdmin.objects.filter(user=user, is_active=True)


def pharmacies_user_admins(user) -> QuerySet[Pharmacy]:
    if not _is_active_actor(user):
        return Pharmacy.objects.none()
    return Pharmacy.objects.filter(
        admin_assignments__user=user,
        admin_assignments__is_active=True,
    )


def assignment_for(user, pharmacy) -> Optional[PharmacyAdmin]:
    if not _is_active_actor(user) or pharmacy is None:
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
    if not _is_active_actor(user) or pharmacy_id is None:
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
    if not _is_active_actor(user):
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


def org_wide_admin_organization_ids(user) -> set:
    if not _is_active_actor(user):
        return set()
    from users.models import OrganizationMembership
    from users.org_roles import ORG_WIDE_ADMIN_ROLES

    return set(
        OrganizationMembership.objects.filter(user=user, role__in=ORG_WIDE_ADMIN_ROLES).values_list(
            "organization_id", flat=True
        )
    )


def user_can_edit_pharmacy_record(user, pharmacy, admin_organization_ids=None) -> bool:
    """Only the owner or an organization-wide admin may edit the pharmacy record. Callers checking many pharmacies pass
    org_wide_admin_organization_ids(user) once."""
    if not _is_active_actor(user) or pharmacy is None:
        return False

    owner = getattr(pharmacy, "owner", None)
    if owner and owner.user_id == user.id:
        return True

    if admin_organization_ids is None:
        admin_organization_ids = org_wide_admin_organization_ids(user)
    return pharmacy.organization_id is not None and pharmacy.organization_id in admin_organization_ids


def user_can_manage_pharmacy(user, pharmacy) -> bool:
    """Who manages a pharmacy's shifts and sees its full details: the owner, an org admin of its organization, a
    chief/region admin assigned to it, or a pharmacy admin with the roster capability."""
    if not _is_active_actor(user) or pharmacy is None:
        return False

    # A Region Admin's M2M assignment alone cannot grant roster authority.
    # Workforce remains the sole capability/organization boundary.
    from workforce.permissions import can_manage_roster_pharmacy
    return can_manage_roster_pharmacy(user, pharmacy)


def managed_pharmacies(user):
    """
    Pharmacies the user can manage because they own them, are an org admin
    over them, or hold an active PharmacyAdmin assignment.
    """
    if not _is_active_actor(user):
        return Pharmacy.objects.none()

    from users.models import OrganizationMembership
    from users.org_roles import ORG_WIDE_ADMIN_ROLES

    pharmacies = Pharmacy.objects.none()

    if hasattr(user, "owneronboarding"):
        pharmacies |= Pharmacy.objects.filter(owner=user.owneronboarding)

    org_ids = list(
        OrganizationMembership.objects.filter(user=user, role__in=ORG_WIDE_ADMIN_ROLES).values_list(
            "organization_id", flat=True
        )
    )
    if org_ids:
        pharmacies |= Pharmacy.objects.filter(
            organization_id__in=org_ids
        )

    managed_admin_pharmacies = [
        pharm.id
        for pharm in pharmacies_user_admins(user)
        if has_admin_capability(user, pharm, CAPABILITY_MANAGE_ROSTER)
    ]
    if managed_admin_pharmacies:
        pharmacies |= Pharmacy.objects.filter(id__in=managed_admin_pharmacies)

    # Region visibility mirrors write authority, including level and
    # organization scope. Never display another organization's pharmacy.
    region_ids = set()
    for membership in user.organization_memberships.filter(role='REGION_ADMIN'):
        if OrgCapability.MANAGE_ROSTER in membership_capabilities(membership):
            region_ids.update(membership_visible_pharmacy_ids(membership))
    if region_ids:
        pharmacies |= Pharmacy.objects.filter(id__in=region_ids)

    return pharmacies.distinct()
