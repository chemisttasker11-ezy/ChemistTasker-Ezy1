from django.core.exceptions import PermissionDenied


def _is_owner_or_superuser(user, pharmacy) -> bool:
    if not user or not getattr(user, "is_active", False) or not pharmacy:
        return False
    if getattr(user, "is_superuser", False):
        return True
    owner = getattr(pharmacy, "owner", None)
    return bool(owner and getattr(owner, "user_id", None) == getattr(user, "id", None))


def _org_has_capability(user, pharmacy, capability: str) -> bool:
    if not user or not pharmacy or not getattr(pharmacy, "organization_id", None):
        return False

    from users.models import OrganizationMembership
    from users.org_roles import OrgCapability, membership_capabilities, membership_visible_pharmacy_ids

    memberships = (
        OrganizationMembership.objects.filter(
            user=user,
            organization_id=pharmacy.organization_id,
        )
        .prefetch_related("pharmacies")
    )
    for membership in memberships:
        capabilities = membership_capabilities(membership)
        if capability not in capabilities:
            continue
        if OrgCapability.VIEW_ALL_PHARMACIES in capabilities:
            return True
        if pharmacy.id in membership_visible_pharmacy_ids(membership):
            return True
    return False


def can_manage_roster_pharmacy(user, pharmacy) -> bool:
    if _is_owner_or_superuser(user, pharmacy):
        return True
    from client_profile.admin_helpers import can_manage_roster
    from users.org_roles import OrgCapability

    return bool(
        can_manage_roster(user, pharmacy)
        or _org_has_capability(user, pharmacy, OrgCapability.MANAGE_ROSTER)
    )


def can_manage_staff_pharmacy(user, pharmacy) -> bool:
    if _is_owner_or_superuser(user, pharmacy):
        return True
    from client_profile.admin_helpers import can_manage_staff
    from users.org_roles import OrgCapability

    return bool(
        can_manage_staff(user, pharmacy)
        or _org_has_capability(user, pharmacy, OrgCapability.MANAGE_STAFF)
    )


def can_manage_workforce_pharmacy(user, pharmacy) -> bool:
    # Preserve the existing MANAGE_ROSTER pathway while allowing staff managers
    # to maintain employment/pay records that belong to their delegated staff scope.
    return can_manage_staff_pharmacy(user, pharmacy) or can_manage_roster_pharmacy(user, pharmacy)


def require_manage_roster_pharmacy(user, pharmacy):
    if not can_manage_roster_pharmacy(user, pharmacy):
        raise PermissionDenied("You are not authorized to manage roster/workforce operations for this pharmacy.")


def require_manage_workforce_pharmacy(user, pharmacy):
    if not can_manage_workforce_pharmacy(user, pharmacy):
        raise PermissionDenied("You are not authorized to manage staff employment/pay records for this pharmacy.")


# Backwards-compatible aliases for roster/timesheet callers outside this module.
def can_manage_pharmacy(user, pharmacy) -> bool:
    return can_manage_roster_pharmacy(user, pharmacy)


def require_manage_pharmacy(user, pharmacy):
    require_manage_roster_pharmacy(user, pharmacy)


def can_view_worker_timesheet(user, timesheet) -> bool:
    if user and user.is_authenticated and user.pk == timesheet.user_id:
        return True
    return can_manage_roster_pharmacy(user, timesheet.period.pharmacy)
