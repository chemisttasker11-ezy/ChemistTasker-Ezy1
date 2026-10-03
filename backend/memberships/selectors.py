"""Which memberships, invite links and applications a user may see."""
from django.db.models import Q

from memberships.models import Membership, MembershipApplication, MembershipInviteLink
from onboarding.models import OwnerOnboarding
from organizations.access import (
    CAPABILITY_MANAGE_STAFF,
    _collect_org_access_scope,
    _get_org_pharmacies_queryset,
    has_admin_capability,
    pharmacies_user_admins,
)
from organizations.models import Pharmacy
from users.org_roles import OrgCapability, membership_capabilities, membership_visible_pharmacy_ids


def visible_memberships(user, query_params):
    """Memberships of the pharmacies the user owns, administers, is an organization member over or is an
    accepted member of (accepted-active or pending), narrowed by the pharmacy / chain / organization filters."""
    
    # 1. Determine ALL pharmacies where the user should be able to see the member list.
    
    # Pharmacies they own
    owned_pharmacies = Pharmacy.objects.none()
    if hasattr(user, 'owneronboarding'):
        owned_pharmacies = Pharmacy.objects.filter(owner=user.owneronboarding)

    full_org_ids, scoped_org_map = _collect_org_access_scope(user)
    org_pharmacies = Pharmacy.objects.none()
    if full_org_ids:
        org_pharmacies |= Pharmacy.objects.filter(organization_id__in=full_org_ids)
    scoped_ids = set()
    for ids in scoped_org_map.values():
        scoped_ids.update(ids)
    if scoped_ids:
        org_pharmacies |= Pharmacy.objects.filter(id__in=scoped_ids)

    # Pharmacies they are a PHARMACY_ADMIN in
    admin_pharmacies = Pharmacy.objects.filter(
        admin_assignments__user=user,
        admin_assignments__is_active=True
    )
    
    # NEW RULE: Pharmacies they are a regular, active member of
    member_pharmacies = Pharmacy.objects.filter(
        memberships__user=user,
        memberships__is_active=True,
        memberships__status=Membership.Status.ACCEPTED,
    )

    # Combine all visible pharmacies into one master queryset
    visible_pharmacies = (owned_pharmacies | org_pharmacies | admin_pharmacies | member_pharmacies).distinct()

    # 2. Base the Membership query on these visible pharmacies.
    qs = (
        Membership.objects.filter(pharmacy__in=visible_pharmacies)
        .filter(
            Q(is_active=True, status=Membership.Status.ACCEPTED)
            | Q(status=Membership.Status.PENDING)
        )
        .select_related(
            "user",
            "invited_by",
            "pharmacy",
            "pharmacy__owner",
            "pharmacy__organization",
        )
        .prefetch_related(
            "pharmacy__chains",
            "pharmacy__claims",
        )
    )

    # 3. Apply the optional query filters from the request.
    pharmacy_id = (
        query_params.get('pharmacy_id')
        or query_params.get('pharmacy')
        or query_params.get('pharmacy_pk')
    )
    chain_id = query_params.get('chain_id')
    organization_id = query_params.get('organization')
    
    if pharmacy_id:
        try:
            pharmacy_id_int = int(pharmacy_id)
        except (TypeError, ValueError):
            qs = qs.none()
        else:
            allowed = visible_pharmacies.filter(id=pharmacy_id_int).exists()
            if not allowed:
                if pharmacy_id_int in scoped_ids:
                    allowed = True
                else:
                    pharmacy = Pharmacy.objects.filter(id=pharmacy_id_int).only('organization_id').first()
                    if pharmacy and pharmacy.organization_id in full_org_ids:
                        allowed = True
            if allowed:
                qs = qs.filter(pharmacy_id=pharmacy_id_int)
            else:
                qs = qs.none()
    elif chain_id:
        # --- THIS IS THE FIX ---
        # Correctly filter by pharmacies belonging to a chain using the proper relationship
        qs = qs.filter(pharmacy__chains__id=chain_id)
        # ---------------------
    elif organization_id:
        try:
            organization_id_int = int(organization_id)
        except (TypeError, ValueError):
            qs = qs.none()
        else:
            # Filtering must only narrow the caller's already-authorized
            # pharmacy set. An ordinary member of one pharmacy in an
            # organization must not gain visibility of sibling pharmacies just
            # by supplying the organization query parameter.
            if visible_pharmacies.filter(organization_id=organization_id_int).exists():
                qs = qs.filter(pharmacy__organization_id=organization_id_int)
            else:
                qs = qs.none()

    return qs.distinct()


def visible_invite_links(user, query_params):
    """Active invite links of the pharmacies the user owns or administers (organization scope, else owned
    pharmacies; plus pharmacies where they hold the manage-staff capability)."""
    # Owners see own pharmacies; Org-Admins see org; Pharmacy Admins see their pharmacies
    # mirror visibility logic from MembershipViewSet.get_queryset
    visible_pharmacies = _get_org_pharmacies_queryset(user)
    if not visible_pharmacies.exists():
        try:
            owner = OwnerOnboarding.objects.get(user=user)
            visible_pharmacies = Pharmacy.objects.filter(owner=owner)
        except OwnerOnboarding.DoesNotExist:
            visible_pharmacies = Pharmacy.objects.none()
    admin_scoped_ids = [
        pharm.id
        for pharm in pharmacies_user_admins(user)
        if has_admin_capability(user, pharm, CAPABILITY_MANAGE_STAFF)
    ]
    if admin_scoped_ids:
        visible_pharmacies |= Pharmacy.objects.filter(id__in=admin_scoped_ids)
    visible_pharmacies = visible_pharmacies.distinct()
    qs = MembershipInviteLink.objects.filter(pharmacy__in=visible_pharmacies, is_active=True)
    pid = query_params.get('pharmacy')
    return qs.filter(pharmacy_id=pid) if pid else qs


def visible_applications(user, query_params):
    """Applications visible through any independent staff-management scope.

    Organization management, pharmacy ownership and pharmacy-level MANAGE_STAFF
    authority are additive. Scoped organization roles only see their assigned
    pharmacies; full organization admins see the whole organization.
    """
    visible_pharmacies = Pharmacy.objects.none()

    full_org_ids = set()
    scoped_pharmacy_ids = set()
    for org_membership in user.organization_memberships.prefetch_related("pharmacies"):
        caps = membership_capabilities(org_membership)
        if not (
            OrgCapability.MANAGE_STAFF in caps
            or OrgCapability.MANAGE_ADMINS in caps
        ):
            continue
        if OrgCapability.VIEW_ALL_PHARMACIES in caps:
            full_org_ids.add(org_membership.organization_id)
        else:
            scoped_pharmacy_ids.update(membership_visible_pharmacy_ids(org_membership))

    if full_org_ids:
        visible_pharmacies |= Pharmacy.objects.filter(organization_id__in=full_org_ids)
    if scoped_pharmacy_ids:
        visible_pharmacies |= Pharmacy.objects.filter(id__in=scoped_pharmacy_ids)

    try:
        owner = OwnerOnboarding.objects.get(user=user)
    except OwnerOnboarding.DoesNotExist:
        owner = None
    if owner is not None:
        visible_pharmacies |= Pharmacy.objects.filter(owner=owner)

    admin_staff_ids = [
        pharm.id
        for pharm in pharmacies_user_admins(user)
        if has_admin_capability(user, pharm, CAPABILITY_MANAGE_STAFF)
    ]
    if admin_staff_ids:
        visible_pharmacies |= Pharmacy.objects.filter(id__in=admin_staff_ids)

    visible_pharmacies = visible_pharmacies.distinct()
    qs = MembershipApplication.objects.filter(pharmacy__in=visible_pharmacies).order_by('-submitted_at')
    status_q = query_params.get('status')
    return qs.filter(status=status_q) if status_q else qs


def own_memberships(user):
    """A worker's pending and accepted memberships, newest first.

    CURRENT BEHAVIOUR kept: listing also makes sure an owner has an active OWNER membership at each pharmacy
    they own (created or repaired on read)."""
    # Ensure owners always retain an active OWNER membership for their pharmacies.
    if hasattr(user, 'owneronboarding'):
        owned_pharmacies = Pharmacy.objects.filter(owner=user.owneronboarding)
        for pharmacy in owned_pharmacies:
            membership, created = Membership.objects.get_or_create(
                user=user,
                pharmacy=pharmacy,
                defaults={
                    'role': 'OWNER',
                    'employment_type': 'FULL_TIME',
                    'is_active': True,
                    'status': Membership.Status.ACCEPTED,
                    'invited_by': user,
                }
            )
            if not created:
                updated = False
                if membership.role != 'OWNER':
                    membership.role = 'OWNER'
                    updated = True
                if not membership.is_active:
                    membership.is_active = True
                    updated = True
                if membership.status != Membership.Status.ACCEPTED:
                    membership.status = Membership.Status.ACCEPTED
                    updated = True
                if updated:
                    membership.save(update_fields=['role', 'is_active', 'status'])
    return (
        Membership.objects.filter(user=user)
        .filter(status__in=[Membership.Status.PENDING, Membership.Status.ACCEPTED])
        .select_related('pharmacy', 'user', 'invited_by', 'pharmacy__organization')
        .order_by('-created_at')
    )
