"""Who may see and act in which hub: the ChemistTasker platform hubs per user role, a user's pharmacy
permissions behind the hub context, and the scope resolver every hub endpoint (and team_calendar and
public_hub) uses for pharmacy, group, organization and platform scopes."""
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from users.models import OrganizationMembership
from users.org_roles import OrgCapability, membership_capabilities, membership_visible_pharmacy_ids
from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from onboarding.models import OtherStaffOnboarding
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from pharmacy_hub.models import PharmacyCommunityGroup, PharmacyCommunityGroupMembership, PharmacyHubPost


CHEMISTTASKER_HUB_DEFINITIONS = {
    PharmacyHubPost.PlatformHub.EXPLORER: {"key": "explorer", "label": "Explorer Hub", "audience_type": "EXPLORER"},
    PharmacyHubPost.PlatformHub.PUBLIC: {
        "key": PharmacyHubPost.PlatformHub.PUBLIC,
        "label": "Public Hub",
        "audience_type": "PUBLIC",
    },
    PharmacyHubPost.PlatformHub.OWNER: {
        "key": PharmacyHubPost.PlatformHub.OWNER,
        "label": "Owner Hub",
        "audience_type": "OWNER",
    },
    PharmacyHubPost.PlatformHub.PHARMACIST: {
        "key": PharmacyHubPost.PlatformHub.PHARMACIST,
        "label": "Pharmacist Hub",
        "audience_type": "PHARMACIST",
    },
    PharmacyHubPost.PlatformHub.INTERN: {
        "key": PharmacyHubPost.PlatformHub.INTERN,
        "label": "Intern Hub",
        "audience_type": "INTERN",
    },
    PharmacyHubPost.PlatformHub.STAFF: {
        "key": PharmacyHubPost.PlatformHub.STAFF,
        "label": "Other Staff Hub",
        "audience_type": "STAFF",
    },
}


def _org_hub_memberships(user, organization_id=None):
    """Yield canonical hub-management scope for the user's organization memberships.

    Hub administration follows the same capability model as the rest of the backend:
    MANAGE_COMMS grants hub-management capability, while VIEW_ALL_PHARMACIES or the
    membership's explicit pharmacy assignments determine where that capability applies.
    Unknown/legacy roles therefore grant no implicit hub authority.
    """
    qs = OrganizationMembership.objects.filter(user=user)
    if organization_id is not None:
        qs = qs.filter(organization_id=organization_id)
    qs = qs.select_related("organization").prefetch_related("pharmacies")

    for membership in qs:
        capabilities = membership_capabilities(membership)
        if OrgCapability.MANAGE_COMMS not in capabilities:
            continue
        full_access = OrgCapability.VIEW_ALL_PHARMACIES in capabilities
        visible_ids = set() if full_access else set(membership_visible_pharmacy_ids(membership))
        yield membership, full_access, visible_ids


def get_user_chemisttasker_hubs(user):
    hubs = [CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.PUBLIC]]
    top_role = (getattr(user, "role", "") or "").upper()
    if top_role == "OWNER":
        hubs.append(CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.OWNER])
    elif top_role == "PHARMACIST":
        hubs.append(CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.PHARMACIST])
    elif top_role == "EXPLORER":
        hubs.append(CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.EXPLORER])
    elif top_role == "OTHER_STAFF":
        other_staff_role = (
            OtherStaffOnboarding.objects.filter(user=user)
            .values_list("role_type", flat=True)
            .first()
        )
        if (other_staff_role or "").upper() == "INTERN":
            hubs.append(CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.INTERN])
        else:
            hubs.append(CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.STAFF])
    return hubs


def get_user_pharmacy_permissions(user):
    memberships = (
        Membership.objects.filter(
            user=user,
            is_active=True,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        )
        .select_related("pharmacy", "pharmacy__organization", "pharmacy__owner__user")
    )
    pharmacies = {}
    permissions = {}
    membership_by_pharmacy = {}

    def ensure_entry(pharmacy_id):
        entry = permissions.get(pharmacy_id)
        if entry is None:
            entry = {
                "can_create_post": False,
                "can_manage_profile": False,
                "can_create_group": False,
                "has_admin_permissions": False,
            }
            permissions[pharmacy_id] = entry
        return entry

    for membership in memberships:
        pharmacy = membership.pharmacy
        pharmacies[pharmacy.id] = pharmacy
        membership_by_pharmacy[pharmacy.id] = membership
        entry = ensure_entry(pharmacy.id)
        entry["membership_id"] = membership.id
        entry["can_create_post"] = True
        if membership.is_pharmacy_admin:
            entry.update(
                {
                    "can_manage_profile": True,
                    "can_create_group": True,
                    "has_admin_permissions": True,
                }
            )

    owner_pharmacies = (
        Pharmacy.objects.filter(owner__user_id=user.id)
        .select_related("organization", "owner__user")
    )
    for pharmacy in owner_pharmacies:
        pharmacies[pharmacy.id] = pharmacy
        entry = ensure_entry(pharmacy.id)
        entry.update(
            {
                "can_create_post": True,
                "can_manage_profile": True,
                "can_create_group": True,
                "has_admin_permissions": True,
                "is_owner": True,
            }
        )

    org_admin_org_ids = set()
    for org_membership, full_access, visible_ids in _org_hub_memberships(user):
        if full_access:
            org_admin_org_ids.add(org_membership.organization_id)
            admin_pharmacies = Pharmacy.objects.filter(
                organization_id=org_membership.organization_id
            )
        elif visible_ids:
            admin_pharmacies = Pharmacy.objects.filter(id__in=visible_ids)
        else:
            continue

        for pharmacy in admin_pharmacies.select_related("organization", "owner__user"):
            pharmacies[pharmacy.id] = pharmacy
            entry = ensure_entry(pharmacy.id)
            entry.update(
                {
                    "can_create_post": True,
                    "can_manage_profile": True,
                    "can_create_group": True,
                    "has_admin_permissions": True,
                    "is_org_admin": bool(full_access),
                }
            )

    return pharmacies, permissions, membership_by_pharmacy, org_admin_org_ids


class HubScopeResolver:
    # Kept for compatibility/introspection only; authorization below is capability-based.
    org_access_roles = ("ORG_ADMIN", "CHIEF_ADMIN", "REGION_ADMIN")
    org_admin_roles = ("ORG_ADMIN",)

    def __init__(self, user):
        self.user = user

    def pharmacy_scope(self, pharmacy_id, pharmacy=None):
        pharmacy = pharmacy or get_object_or_404(Pharmacy, pk=pharmacy_id)
        membership = (
            Membership.objects.filter(
                user=self.user,
                pharmacy=pharmacy,
                is_active=True,
                employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            )
            .select_related("user")
            .first()
        )
        is_owner = bool(pharmacy.owner and pharmacy.owner.user_id == self.user.id)
        org_membership = None
        full_org_admin = False
        if pharmacy.organization_id:
            for candidate, full_access, visible_ids in _org_hub_memberships(
                self.user,
                pharmacy.organization_id,
            ):
                if full_access or pharmacy.id in visible_ids:
                    org_membership = candidate
                    full_org_admin = full_access
                    break
        if not any([membership, is_owner, org_membership]):
            raise PermissionDenied("You do not have access to this pharmacy hub.")
        has_admin = bool(
            org_membership
            or is_owner
            or (membership and membership.is_pharmacy_admin)
        )
        return {
            "scope_type": "pharmacy",
            "pharmacy": pharmacy,
            "organization": pharmacy.organization,
            "community_group": None,
            "request_membership": membership,
            "has_admin_permissions": has_admin,
            "has_group_admin_permissions": False,
            "is_owner": is_owner,
            "is_org_admin": full_org_admin,
        }

    def group_scope(self, group_id, group=None):
        group = group or get_object_or_404(
            PharmacyCommunityGroup.objects.select_related("pharmacy", "pharmacy__organization"),
            pk=group_id,
        )
        try:
            scope = self.pharmacy_scope(group.pharmacy_id, pharmacy=group.pharmacy)
        except PermissionDenied:
            scope = {
                "scope_type": "pharmacy",
                "pharmacy": group.pharmacy,
                "organization": group.pharmacy.organization,
                "community_group": None,
                "request_membership": None,
                "has_admin_permissions": False,
                "has_group_admin_permissions": False,
                "is_owner": False,
                "is_org_admin": False,
            }
        membership = scope.get("request_membership")
        group_membership = None
        membership_query = PharmacyCommunityGroupMembership.objects.select_related(
            "membership",
            "membership__user",
            "membership__pharmacy",
        ).filter(
            membership__is_active=True,
            membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        )
        if membership:
            group_membership = membership_query.filter(
                group=group,
                membership=membership,
            ).first()
        if not group_membership:
            group_membership = membership_query.filter(
                group=group,
                membership__user=self.user,
            ).first()
            if group_membership and not membership:
                scope["request_membership"] = group_membership.membership
        is_group_creator = bool(group.created_by_id == self.user.id)
        has_group_admin = bool(
            scope["has_admin_permissions"]
            or (group_membership and group_membership.is_admin)
        )
        if not group_membership and not scope.get("has_admin_permissions"):
            raise PermissionDenied("You must be a member of this group.")
        scope.update(
            {
                "scope_type": "group",
                "community_group": group,
                "group_membership": group_membership,
                "is_group_creator": is_group_creator,
                "has_group_admin_permissions": has_group_admin,
            }
        )
        return scope

    def organization_scope(self, organization_id, organization=None):
        organization = organization or get_object_or_404(Organization, pk=organization_id)
        memberships = (
            Membership.objects.filter(
                user=self.user,
                is_active=True,
                employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                pharmacy__organization=organization,
            )
            .select_related("pharmacy", "user")
            .order_by("id")
        )
        membership = memberships.first()
        is_owner = Pharmacy.objects.filter(
            organization=organization,
            owner__user_id=self.user.id,
        ).exists()
        org_admin = any(
            full_access
            for _org_membership, full_access, _visible_ids in _org_hub_memberships(
                self.user,
                organization.id,
            )
        )
        if not any([membership, is_owner, org_admin]):
            raise PermissionDenied("You do not have access to this organization hub.")
        # A pharmacy-level admin may participate in the organization hub
        # through their staff membership, but pharmacy-scoped authority does
        # not grant organization-wide administration.
        has_admin = bool(org_admin or is_owner)
        return {
            "scope_type": "organization",
            "organization": organization,
            "pharmacy": None,
            "community_group": None,
            "platform_hub": None,
            "request_membership": membership,
            "organization_memberships": memberships,
            "has_admin_permissions": has_admin,
            "has_group_admin_permissions": False,
            "is_owner": is_owner,
            "is_org_admin": org_admin,
        }

    def platform_scope(self, platform_hub):
        if not self.user.is_active or not getattr(self.user, "is_otp_verified", False):
            raise PermissionDenied("Verify your email before accessing community interactions.")
        if platform_hub not in CHEMISTTASKER_HUB_DEFINITIONS:
            raise PermissionDenied("Unknown ChemistTasker hub.")
        allowed_hubs = {
            item["key"] for item in get_user_chemisttasker_hubs(self.user)
        }
        if platform_hub not in allowed_hubs:
            raise PermissionDenied("You do not have access to this ChemistTasker hub.")
        membership = (
            Membership.objects.filter(user=self.user, is_active=True)
            .select_related("pharmacy", "pharmacy__organization", "user")
            .order_by("id")
            .first()
        )
        return {
            "scope_type": "platform",
            "platform_hub": platform_hub,
            "organization": None,
            "pharmacy": None,
            "community_group": None,
            "request_membership": membership,
            "has_admin_permissions": False,
            "has_group_admin_permissions": False,
            "is_owner": False,
            "is_org_admin": False,
        }

    def from_post(self, post):
        if post.platform_hub:
            return self.platform_scope(post.platform_hub)
        if post.community_group_id:
            return self.group_scope(post.community_group_id, group=post.community_group)
        if post.pharmacy_id:
            return self.pharmacy_scope(post.pharmacy_id, pharmacy=post.pharmacy)
        if post.organization_id:
            return self.organization_scope(post.organization_id, organization=post.organization)
        raise PermissionDenied("Post scope is not configured.")

    def from_poll(self, poll):
        if poll.platform_hub:
            return self.platform_scope(poll.platform_hub)
        if poll.community_group_id:
            return self.group_scope(poll.community_group_id, group=poll.community_group)
        if poll.pharmacy_id:
            return self.pharmacy_scope(poll.pharmacy_id, pharmacy=poll.pharmacy)
        if poll.organization_id:
            return self.organization_scope(poll.organization_id, organization=poll.organization)
        raise PermissionDenied("Poll scope is not configured.")

    def ensure_author_membership(self, scope):
        membership = scope.get("request_membership")
        if membership:
            return membership

        # Control-plane authority already identifies the actor. Hub models
        # carry an explicit user author/creator as well as the optional legacy
        # Membership FK, so never manufacture or reactivate Membership /
        # PharmacyAdmin state merely to populate author_membership. Apart from
        # privilege widening for scoped admins, the old helper could turn a
        # LEFT/REJECTED membership active again while leaving its status
        # unchanged. Ordinary staff still arrive here with request_membership
        # already resolved from their real active pharmacy membership.
        if (
            scope.get("has_admin_permissions")
            or scope.get("has_group_admin_permissions")
            or scope.get("is_owner")
            or scope.get("is_org_admin")
        ):
            return None

        if scope["scope_type"] in {"pharmacy", "group"}:
            return self._ensure_pharmacy_membership(scope)
        if scope["scope_type"] == "organization":
            return self._ensure_organization_membership(scope)
        if scope["scope_type"] == "platform":
            return self._ensure_platform_membership(scope)
        raise PermissionDenied("Unable to resolve membership for this scope.")

    def _activate_or_create_membership(self, pharmacy):
        membership, _ = Membership.objects.get_or_create(
            user=self.user,
            pharmacy=pharmacy,
            defaults={
                "role": "CONTACT",
                "employment_type": "FULL_TIME",
                "is_active": True,
            },
        )
        if not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=["is_active"])
        PharmacyAdmin.objects.update_or_create(
            user=self.user,
            pharmacy=pharmacy,
            defaults={
                "membership": membership,
                "admin_level": PharmacyAdmin.AdminLevel.MANAGER,
                "staff_role": "OTHER",
                "is_active": True,
            },
        )
        return membership

    def _ensure_pharmacy_membership(self, scope):
        pharmacy = scope.get("pharmacy")
        if not pharmacy:
            raise PermissionDenied("Join this pharmacy before posting.")
        if not (scope.get("is_owner") or scope.get("is_org_admin")):
            raise PermissionDenied("Join this pharmacy before posting.")
        membership = self._activate_or_create_membership(pharmacy)
        scope["request_membership"] = membership
        return membership

    def _ensure_organization_membership(self, scope):
        organization = scope.get("organization")
        membership = (
            Membership.objects.filter(
                user=self.user,
                is_active=True,
                employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
                pharmacy__organization=organization,
            )
            .select_related("pharmacy")
            .first()
        )
        if membership:
            scope["request_membership"] = membership
            return membership
        primary_pharmacy = organization.pharmacies.order_by("id").first()
        if not primary_pharmacy:
            raise PermissionDenied("This organization has no pharmacies configured.")
        membership = self._activate_or_create_membership(primary_pharmacy)
        scope["request_membership"] = membership
        return membership

    def _ensure_platform_membership(self, scope):
        membership = (
            Membership.objects.filter(user=self.user, is_active=True)
            .select_related("pharmacy")
            .order_by("id")
            .first()
        )
        if membership:
            scope["request_membership"] = membership
            return membership
        owned_pharmacy = (
            Pharmacy.objects.filter(owner__user_id=self.user.id)
            .select_related("organization")
            .order_by("id")
            .first()
        )
        if owned_pharmacy:
            membership = self._activate_or_create_membership(owned_pharmacy)
            scope["request_membership"] = membership
            return membership
        for org_membership, full_access, visible_ids in _org_hub_memberships(self.user):
            if full_access:
                org_admin_pharmacy = (
                    Pharmacy.objects.filter(organization_id=org_membership.organization_id)
                    .select_related("organization")
                    .order_by("id")
                    .first()
                )
            else:
                org_admin_pharmacy = (
                    Pharmacy.objects.filter(id__in=visible_ids)
                    .select_related("organization")
                    .order_by("id")
                    .first()
                )
            if org_admin_pharmacy:
                membership = self._activate_or_create_membership(org_admin_pharmacy)
                scope["request_membership"] = membership
                return membership
        raise PermissionDenied("Join a pharmacy before posting in ChemistTasker Hub.")
