"""Who may act on a pharmacy's memberships: invite, change a membership, decide applications.

These are the rules the membership endpoints already applied; each endpoint keeps its own rule (they differ, see the
docstrings) and they live here once instead of inline in the views.
"""
from organizations.access import CAPABILITY_MANAGE_STAFF, has_admin_capability
from organizations.models import Pharmacy
from users.models import OrganizationMembership
from users.org_roles import OrgCapability, membership_capabilities, membership_visible_pharmacy_ids


def user_can_invite_members_to_pharmacy(user, pharmacy):
    """Platform staff, the owner, a pharmacy admin with the manage-staff capability, or an organization member whose
    role can invite, manage staff or manage admins over this pharmacy."""
    if not user or not getattr(user, "is_authenticated", False) or not pharmacy:
        return False

    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True

    if getattr(pharmacy.owner, "user", None) == user:
        return True

    if has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_STAFF):
        return True

    org_memberships = user.organization_memberships.filter(
        organization_id=pharmacy.organization_id
    ).prefetch_related('pharmacies')
    for membership in org_memberships:
        caps = membership_capabilities(membership)
        can_invite = (
            OrgCapability.INVITE_STAFF in caps
            or OrgCapability.MANAGE_STAFF in caps
            or OrgCapability.MANAGE_ADMINS in caps
        )
        if not can_invite:
            continue
        if OrgCapability.VIEW_ALL_PHARMACIES in caps:
            return True
        if pharmacy.id in membership_visible_pharmacy_ids(membership):
            return True

    return False


def user_can_change_membership(user, membership):
    """Who may change an ordinary staff membership.

    The pharmacy owner's derived OWNER membership is a system/control-plane
    invariant and is not mutable through the generic membership endpoint.
    Ordinary staff memberships may be managed by the pharmacy owner, a scoped
    organization staff/admin manager, or a PharmacyAdmin with MANAGE_STAFF.
    """
    pharm = membership.pharmacy

    if (
        pharm
        and getattr(getattr(pharm, "owner", None), "user_id", None) == membership.user_id
    ):
        return False

    # Owner of this pharmacy
    if pharm and pharm.owner and pharm.owner.user == user:
        return True

    if pharm:
        org_memberships = user.organization_memberships.filter(
            organization_id=pharm.organization_id
        ).prefetch_related('pharmacies')
        for org_membership in org_memberships:
            caps = membership_capabilities(org_membership)
            if OrgCapability.MANAGE_STAFF in caps or OrgCapability.MANAGE_ADMINS in caps:
                if OrgCapability.VIEW_ALL_PHARMACIES in caps:
                    return True
                if pharm.id in membership_visible_pharmacy_ids(org_membership):
                    return True

    # Pharmacy Admin of THIS pharmacy
    if pharm and has_admin_capability(user, pharm, CAPABILITY_MANAGE_STAFF):
        return True

    return False


def user_can_decide_applications(user, pharmacy):
    """Who may approve or reject applications for this pharmacy.

    This follows the canonical staff-management authority: the pharmacy owner,
    a pharmacy admin with MANAGE_STAFF, or an organization role with
    MANAGE_STAFF / MANAGE_ADMINS whose pharmacy scope includes this pharmacy.
    """
    if not user or not getattr(user, "is_authenticated", False) or not pharmacy:
        return False

    if Pharmacy.objects.filter(id=pharmacy.id, owner__user=user).exists():
        return True

    if has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_STAFF):
        return True

    org_memberships = user.organization_memberships.filter(
        organization_id=pharmacy.organization_id
    ).prefetch_related("pharmacies")
    for membership in org_memberships:
        caps = membership_capabilities(membership)
        if not (
            OrgCapability.MANAGE_STAFF in caps
            or OrgCapability.MANAGE_ADMINS in caps
        ):
            continue
        if OrgCapability.VIEW_ALL_PHARMACIES in caps:
            return True
        if pharmacy.id in membership_visible_pharmacy_ids(membership):
            return True

    return False
