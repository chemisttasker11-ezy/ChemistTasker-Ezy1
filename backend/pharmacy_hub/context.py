"""The hub context a user's dashboard loads: their pharmacies, organizations, community groups and
platform hubs, with what they may do in each."""
from django.db.models import Count, Q
from users.models import OrganizationMembership
from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from organizations.models import Organization
from pharmacy_hub.models import PharmacyCommunityGroup, PharmacyCommunityGroupMembership
from pharmacy_hub.serializers import (
    HubCommunityGroupSerializer,
    HubOrganizationSerializer,
    HubPharmacySerializer,
)
from pharmacy_hub.access import get_user_chemisttasker_hubs, get_user_pharmacy_permissions
from pharmacy_hub.selectors import STAFF_GROUP_MEMBER_FILTER, staff_group_members_prefetch


class HubContextBuilder:
    def __init__(self, user):
        self.user = user

    def build(self, request):
        (
            pharmacies,
            pharmacy_permissions,
            membership_by_pharmacy,
            org_admin_org_ids,
        ) = get_user_pharmacy_permissions(self.user)
        pharmacy_list = list(pharmacies.values())
        pharmacy_data = HubPharmacySerializer(
            pharmacy_list,
            many=True,
            context={
                "request": request,
                "pharmacy_permissions": pharmacy_permissions,
            },
        ).data
        (
            organizations,
            organization_permissions,
            organization_member_counts,
        ) = self._organizations(
            pharmacy_list, pharmacy_permissions, org_admin_org_ids
        )
        organization_data = HubOrganizationSerializer(
            organizations,
            many=True,
            context={
                "request": request,
                "organization_permissions": organization_permissions,
                "organization_member_counts": organization_member_counts,
            },
        ).data
        community_groups, org_groups = self._groups(
            request,
            pharmacy_list,
            pharmacy_permissions,
            membership_by_pharmacy,
        )
        return {
            "pharmacies": pharmacy_data,
            "organizations": organization_data,
            "community_groups": community_groups,
            "organization_groups": org_groups,
            "chemisttasker_hubs": get_user_chemisttasker_hubs(self.user),
            "default_pharmacy_id": pharmacy_data[0]["id"] if pharmacy_data else None,
            "default_organization_id": organization_data[0]["id"] if organization_data else None,
        }

    def _organizations(self, pharmacy_list, pharmacy_permissions, org_admin_org_ids):
        lookup = {}
        for pharmacy in pharmacy_list:
            if not pharmacy.organization:
                continue
            entry = lookup.setdefault(
                pharmacy.organization.id,
                {
                    "organization": pharmacy.organization,
                    "can_manage_profile": False,
                    "is_org_admin": False,
                },
            )
        for org_id in org_admin_org_ids:
            if org_id in lookup:
                lookup[org_id]["can_manage_profile"] = True
                lookup[org_id]["is_org_admin"] = True
                continue
            organization = Organization.objects.filter(pk=org_id).first()
            if not organization:
                continue
            lookup[org_id] = {
                "organization": organization,
                "can_manage_profile": True,
                "is_org_admin": True,
            }
        organizations = [entry["organization"] for entry in lookup.values()]
        permissions = {
            org_id: {
                "can_manage_profile": entry["can_manage_profile"],
                "is_org_admin": entry.get("is_org_admin", False),
            }
            for org_id, entry in lookup.items()
        }

        # Compute member counts per organization (distinct users across org staff + all pharmacies in the org)
        member_counts = {}
        if organizations:
            org_ids = [org.id for org in organizations]
            # distinct users from org memberships
            org_staff = (
                OrganizationMembership.objects.filter(organization_id__in=org_ids)
                .values_list("user_id", flat=True)
            )
            # distinct users from pharmacy memberships under those orgs
            pharm_members = (
                Membership.objects.filter(
                    is_active=True,
                    pharmacy__organization_id__in=org_ids,
                )
                .values_list("user_id", flat=True)
            )
            # Build per-org user sets to avoid double counting
            staff_by_org = {}
            for org_id, user_id in OrganizationMembership.objects.filter(
                organization_id__in=org_ids
            ).values_list("organization_id", "user_id"):
                staff_by_org.setdefault(org_id, set()).add(user_id)
            members_by_org = {}
            for org_id, user_id in Membership.objects.filter(
                is_active=True,
                pharmacy__organization_id__in=org_ids,
            ).values_list("pharmacy__organization_id", "user_id"):
                members_by_org.setdefault(org_id, set()).add(user_id)
            for org_id in org_ids:
                users = set()
                users.update(staff_by_org.get(org_id, set()))
                users.update(members_by_org.get(org_id, set()))
                member_counts[org_id] = len(users)

        return organizations, permissions, member_counts

    def _groups(self, request, pharmacy_list, pharmacy_permissions, membership_by_pharmacy):
        pharmacy_ids = [pharmacy.id for pharmacy in pharmacy_list]
        member_group_ids = list(
            PharmacyCommunityGroupMembership.objects.filter(
                membership__user=self.user,
                membership__is_active=True,
                membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).values_list("group_id", flat=True)
        )
        filters = Q()
        if pharmacy_ids:
            filters |= Q(pharmacy_id__in=pharmacy_ids)
        if member_group_ids:
            filters |= Q(id__in=member_group_ids)
        if not filters:
            return [], []
        groups = list(
            PharmacyCommunityGroup.objects.filter(filters)
            .select_related("pharmacy", "pharmacy__organization")
            .prefetch_related(staff_group_members_prefetch())
            .annotate(staff_member_count=Count("memberships", filter=STAFF_GROUP_MEMBER_FILTER))
            .order_by("name")
            .distinct()
        )
        group_ids = [group.id for group in groups]
        membership_ids = [m.id for m in membership_by_pharmacy.values() if m]
        member_links = []
        if group_ids and membership_ids:
            member_links = list(
                PharmacyCommunityGroupMembership.objects.filter(
                    group_id__in=group_ids,
                    membership_id__in=membership_ids,
                )
            )
        member_map = {link.group_id: True for link in member_links}
        admin_map = {
            link.group_id: True
            for link in member_links
            if link.is_admin
        }
        for group in groups:
            perms = pharmacy_permissions.get(group.pharmacy_id, {})
            if perms.get("has_admin_permissions"):
                admin_map[group.id] = True
        serializer = HubCommunityGroupSerializer(
            groups,
            many=True,
            context={
                "request": request,
                "group_member_map": member_map,
                "group_admin_map": admin_map,
                "include_members": False,
            },
        )
        data = serializer.data
        org_groups = [item for item in data if item.get("organization_id")]
        return data, org_groups
