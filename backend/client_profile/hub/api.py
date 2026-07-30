"""Unified Pharmacy/Organization hub API views."""

import json
import mimetypes
from collections.abc import Mapping
from urllib.parse import urlencode
from django.http import QueryDict

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, F
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_q.tasks import async_task

from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import OrganizationMembership
from client_profile.notifications import notify_users

from ..models import (
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
    Membership,
    OtherStaffOnboarding,
    Organization,
    Pharmacy,
    PharmacyAdmin,
    PharmacyCommunityGroup,
    PharmacyCommunityGroupMembership,
    PharmacyHubAttachment,
    PharmacyHubComment,
    PharmacyHubCommentReaction,
    PharmacyHubPost,
    PharmacyHubReaction,
    PharmacyHubPoll,
    PharmacyHubPollComment,
    PharmacyHubPollOption,
    PharmacyHubPollReaction,
    PharmacyHubPollVote,
)
from ..serializers import (
    HubCommentSerializer,
    HubCommunityGroupSerializer,
    HubOrganizationProfileSerializer,
    HubOrganizationSerializer,
    HubPharmacyProfileSerializer,
    HubPharmacySerializer,
    HubPostSerializer,
    HubReactionSerializer,
    HubPollSerializer,
    HubPollCommentSerializer,
)
from ..file_validation import ATTACHMENT_UPLOAD_POLICY, validate_uploaded_file


CHEMISTTASKER_HUB_DEFINITIONS = {
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
        "label": "Pharmacists Hub",
        "audience_type": "PHARMACIST",
    },
    PharmacyHubPost.PlatformHub.INTERN: {
        "key": PharmacyHubPost.PlatformHub.INTERN,
        "label": "Interns Hub",
        "audience_type": "INTERN",
    },
    PharmacyHubPost.PlatformHub.STAFF: {
        "key": PharmacyHubPost.PlatformHub.STAFF,
        "label": "Staff Hub",
        "audience_type": "STAFF",
    },
}


def _get_user_display_name(user):
    if not user:
        return "A user"
    full_name = user.get_full_name().strip() if hasattr(user, "get_full_name") else ""
    return full_name or getattr(user, "username", "") or getattr(user, "email", "") or "A user"


def _build_hub_post_action_url(post):
    params = {"post": post.id}
    if post.platform_hub:
        params.update(
            {
                "scope": "platform",
                "platform_hub": post.platform_hub,
            }
        )
    elif post.community_group_id:
        params.update(
            {
                "scope": "group",
                "group_id": post.community_group_id,
            }
        )
    elif post.organization_id:
        params.update(
            {
                "scope": "organization",
                "organization_id": post.organization_id,
            }
        )
    elif post.pharmacy_id:
        params.update(
            {
                "scope": "pharmacy",
                "pharmacy_id": post.pharmacy_id,
            }
        )
    return f"/dashboard/pharmacy-hub?{urlencode(params)}"


def _notify_hub_post_owner(*, post, actor_user, title, body="", payload=None):
    post_author = getattr(getattr(post, "author_membership", None), "user", None)
    if not post_author:
        post_author = getattr(post, "author_user", None)
    if not post_author or not post_author.is_active:
        return
    if actor_user and post_author.id == actor_user.id:
        return
    final_payload = {
        "post_id": post.id,
        **(payload or {}),
    }
    notify_users(
        [post_author.id],
        title=title,
        body=body,
        notification_type="alert",
        action_url=_build_hub_post_action_url(post),
        payload=final_payload,
    )


def get_user_chemisttasker_hubs(user):
    hubs = [CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.PUBLIC]]
    top_role = (getattr(user, "role", "") or "").upper()
    if top_role == "OWNER":
        hubs.append(CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.OWNER])
    elif top_role == "PHARMACIST":
        hubs.append(CHEMISTTASKER_HUB_DEFINITIONS[PharmacyHubPost.PlatformHub.PHARMACIST])
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


class HubAttachmentMixin:
    def _attachment_kind(self, uploaded):
        content_type = getattr(uploaded, "content_type", None)
        if not content_type:
            content_type, _ = mimetypes.guess_type(uploaded.name)
        if content_type:
            if content_type == "image/gif":
                return PharmacyHubAttachment.Kind.GIF
            if content_type.startswith("image/"):
                return PharmacyHubAttachment.Kind.IMAGE
        return PharmacyHubAttachment.Kind.FILE

    def _add_attachments(self, post, files):
        for uploaded in files or []:
            if not uploaded:
                continue
            validate_uploaded_file(uploaded, ATTACHMENT_UPLOAD_POLICY, "attachment")
            PharmacyHubAttachment.objects.create(
                post=post,
                file=uploaded,
                kind=self._attachment_kind(uploaded),
            )

    def _remove_attachments(self, post, request):
        raw_ids = request.data.get("remove_attachment_ids", [])
        if isinstance(raw_ids, str):
            raw_ids = [raw_ids]
        ids = []
        for raw in raw_ids:
            try:
                ids.append(int(raw))
            except (TypeError, ValueError):
                continue
        if ids:
            PharmacyHubAttachment.objects.filter(post=post, id__in=ids).delete()


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

    org_admin_org_ids = set(
        OrganizationMembership.objects.filter(
            user=user,
            role__in=HubScopeResolver.org_admin_roles,
        ).values_list("organization_id", flat=True)
    )
    if org_admin_org_ids:
        admin_pharmacies = (
            Pharmacy.objects.filter(organization_id__in=org_admin_org_ids)
            .select_related("organization", "owner__user")
        )
        for pharmacy in admin_pharmacies:
            pharmacies[pharmacy.id] = pharmacy
            entry = ensure_entry(pharmacy.id)
            entry.update(
                {
                    "can_create_post": True,
                    "can_manage_profile": True,
                    "can_create_group": True,
                    "has_admin_permissions": True,
                    "is_org_admin": True,
                }
            )

    return pharmacies, permissions, membership_by_pharmacy, org_admin_org_ids


class HubScopeResolver:
    org_access_roles = ("ORG_ADMIN", "REGION_ADMIN", "SHIFT_MANAGER")
    # Only true organization admins should be treated as org admins
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
        org_admin = False
        if pharmacy.organization_id:
            org_admin = OrganizationMembership.objects.filter(
                user=self.user,
                organization_id=pharmacy.organization_id,
                role__in=self.org_access_roles,
            ).exists()
        if not any([membership, is_owner, org_admin]):
            raise PermissionDenied("You do not have access to this pharmacy hub.")
        has_admin = bool(
            org_admin
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
            "is_org_admin": org_admin,
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
            or is_group_creator
            or (group_membership and group_membership.is_admin)
        )
        if (
            not group_membership
            and not scope.get("has_admin_permissions")
            and not is_group_creator
        ):
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
        org_admin = OrganizationMembership.objects.filter(
            user=self.user,
            organization=organization,
            role__in=self.org_access_roles,
        ).exists()
        if not any([membership, is_owner, org_admin]):
            raise PermissionDenied("You do not have access to this organization hub.")
        has_admin = bool(
            org_admin
            or is_owner
            or (membership and membership.is_pharmacy_admin)
        )
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
        org_admin_pharmacy = (
            Pharmacy.objects.filter(
                organization__memberships__user=self.user,
                organization__memberships__role__in=self.org_access_roles,
            )
            .select_related("organization")
            .order_by("id")
            .first()
        )
        if org_admin_pharmacy:
            membership = self._activate_or_create_membership(org_admin_pharmacy)
            scope["request_membership"] = membership
            return membership
        raise PermissionDenied("Join a pharmacy before posting in ChemistTasker Hub.")


class HubScopedViewSetMixin:
    """Shared scope resolution helpers for hub viewsets."""

    def _normalize_params(self, params):
        if isinstance(params, QueryDict):
            normalized = {}
            for key, values in params.lists():
                norm_key = key[:-2] if key.endswith("[]") else key
                normalized[norm_key] = values if len(values) > 1 else values[0]
            return normalized
        if isinstance(params, Mapping):
            return params
        if isinstance(params, str):
            try:
                parsed = json.loads(params)
            except Exception:
                raise ValidationError({"non_field_errors": ["Invalid JSON body."]})
            if not isinstance(parsed, Mapping):
                raise ValidationError({"non_field_errors": ["Invalid data. Expected an object."]})
            return parsed
        raise ValidationError({"non_field_errors": ["Invalid data. Expected an object."]})

    def _resolve_scope_from_params(self, params):
        params = self._normalize_params(params)
        scope_type = params.get("scope") or params.get("scope_type")
        if not scope_type:
            raise ValidationError(
                {"scope": "Provide a scope (pharmacy, group, organization, or platform)."}
            )
        resolver = HubScopeResolver(self.request.user)
        if scope_type == "pharmacy":
            pharmacy_id = params.get("pharmacy_id") or params.get("scope_id")
            if not pharmacy_id:
                raise ValidationError({"pharmacy_id": "This field is required."})
            return resolver.pharmacy_scope(pharmacy_id)
        if scope_type == "group":
            group_id = params.get("group_id") or params.get("scope_id")
            if not group_id:
                raise ValidationError({"group_id": "This field is required."})
            return resolver.group_scope(group_id)
        if scope_type == "organization":
            organization_id = params.get("organization_id") or params.get("scope_id")
            if not organization_id:
                raise ValidationError({"organization_id": "This field is required."})
            return resolver.organization_scope(organization_id)
        if scope_type == "platform":
            platform_hub = params.get("platform_hub") or params.get("scope_id")
            if not platform_hub:
                raise ValidationError({"platform_hub": "This field is required."})
            return resolver.platform_scope(platform_hub)
        raise ValidationError({"scope": "Invalid scope type."})

    def _apply_scope_filter(self, queryset, scope):
        if scope["scope_type"] == "platform":
            return queryset.filter(platform_hub=scope["platform_hub"])
        if scope["scope_type"] == "group":
            return queryset.filter(community_group=scope["community_group"])
        if scope["scope_type"] == "pharmacy":
            return queryset.filter(
                pharmacy=scope["pharmacy"],
                community_group__isnull=True,
                organization__isnull=True,
            )
        # Organization scope: only org-tagged posts (organization set, pharmacy NULL), exclude group posts
        org = scope.get("organization")
        return queryset.filter(
            organization=org,
            pharmacy__isnull=True,
            community_group__isnull=True,
        )

    def _prepare_serializer_context(self, scope, extra_context=None):
        context = {
            "pharmacy": scope.get("pharmacy"),
            "organization": scope.get("organization"),
            "community_group": scope.get("community_group"),
            "platform_hub": scope.get("platform_hub"),
            "request_membership": scope.get("request_membership"),
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
        }
        if extra_context:
            context.update(extra_context)
        self.extra_serializer_context = context


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
                membership__user=self.user
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
            .prefetch_related("memberships__membership__user", "memberships__membership__pharmacy")
            .annotate(member_count=Count("memberships"))
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
        request_user = getattr(request, "user", None)
        for group in groups:
            perms = pharmacy_permissions.get(group.pharmacy_id, {})
            if perms.get("has_admin_permissions"):
                admin_map[group.id] = True
            if request_user and group.created_by_id == request_user.id:
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


class HubContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        builder = HubContextBuilder(request.user)
        payload = builder.build(request)
        return Response(payload)


class HubCommunityGroupViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubCommunityGroupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _load_permissions(self):
        if not hasattr(self, "_pharmacy_context"):
            self._pharmacy_context = get_user_pharmacy_permissions(self.request.user)
        return self._pharmacy_context

    def get_queryset(self):
        queryset = (
            PharmacyCommunityGroup.objects.all()
            .select_related("pharmacy", "pharmacy__organization")
            .prefetch_related("memberships__membership__user", "memberships__membership__pharmacy")
            .annotate(member_count=Count("memberships"))
            .order_by("name")
        )
        pharmacy_id = self.request.query_params.get("pharmacy_id")
        if pharmacy_id:
            resolver = HubScopeResolver(self.request.user)
            scope = resolver.pharmacy_scope(pharmacy_id)
            self.scope_context = scope
            return queryset.filter(pharmacy=scope["pharmacy"])
        pharmacies, _, _, _ = self._load_permissions()
        member_group_ids = list(
            PharmacyCommunityGroupMembership.objects.filter(
                membership__user=self.request.user
            ).values_list("group_id", flat=True)
        )
        filters = Q()
        if pharmacies:
            filters |= Q(pharmacy_id__in=list(pharmacies.keys()))
        if member_group_ids:
            filters |= Q(id__in=member_group_ids)
        if filters:
            queryset = queryset.filter(filters).distinct()
        else:
            queryset = queryset.none()
        return queryset

    def _hydrate_group_permissions(self, groups):
        if not groups:
            self.group_member_map = {}
            self.group_admin_map = {}
            return
        _, pharmacy_permissions, membership_by_pharmacy, _ = self._load_permissions()
        group_ids = [group.id for group in groups]
        membership_ids = [
            membership.id
            for membership in membership_by_pharmacy.values()
            if membership is not None
        ]
        member_links = []
        if group_ids and membership_ids:
            member_links = list(
                PharmacyCommunityGroupMembership.objects.filter(
                    group_id__in=group_ids,
                    membership_id__in=membership_ids,
                )
            )
        member_map = {link.group_id: True for link in member_links}
        admin_map = {link.group_id: True for link in member_links if link.is_admin}
        for group in groups:
            perms = pharmacy_permissions.get(group.pharmacy_id, {})
            if perms.get("has_admin_permissions"):
                admin_map[group.id] = True
        self.group_member_map = member_map
        self.group_admin_map = admin_map

    def get_serializer_context(self):
        context = super().get_serializer_context()
        pharmacies, _, _, _ = self._load_permissions()
        context.update(
            {
                "request_membership": getattr(self, "scope_context", {}).get(
                    "request_membership"
                ),
                "group_member_map": getattr(self, "group_member_map", {}),
                "group_admin_map": getattr(self, "group_admin_map", {}),
                "include_members": self.request.query_params.get("include_members")
                == "true",
                "allowed_pharmacy_ids": list(pharmacies.keys()),
            }
        )
        return context

    def list(self, request, *args, **kwargs):
        queryset = list(self.filter_queryset(self.get_queryset()))
        self._hydrate_group_permissions(queryset)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        self._hydrate_group_permissions([instance])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        pharmacy_id = request.data.get("pharmacy_id") or request.query_params.get(
            "pharmacy_id"
        )
        if not pharmacy_id:
            raise ValidationError({"pharmacy_id": "This field is required."})
        resolver = HubScopeResolver(request.user)
        scope = resolver.pharmacy_scope(pharmacy_id)
        if not scope.get("has_admin_permissions"):
            raise PermissionDenied("You cannot create groups for this pharmacy.")
        self.scope_context = scope
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = serializer.save(pharmacy=scope["pharmacy"], created_by=request.user)
        self._hydrate_group_permissions([group])
        output = self.get_serializer(group)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = self.get_object()
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.group_scope(instance.id, group=instance)
        if not scope.get("has_group_admin_permissions"):
            raise PermissionDenied("You cannot update this group.")
        self.scope_context = scope
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.group_scope(instance.id, group=instance)
        if not scope.get("has_group_admin_permissions"):
            raise PermissionDenied("You cannot delete this group.")
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HubPostViewSet(HubAttachmentMixin, HubScopedViewSetMixin, viewsets.ModelViewSet):
    serializer_class = HubPostSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return (
            PharmacyHubPost.objects.filter(deleted_at__isnull=True)
            .select_related(
                "author_membership__user",
                "author_user",
                "pharmacy",
                "organization",
                "community_group",
            )
            .prefetch_related(
                "comments__author_membership__user",
                "reactions",
                "attachments",
                "mentions__membership__user",
            )
            .order_by("-is_pinned", "-pinned_at", "-created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update(getattr(self, "extra_serializer_context", {}))
        return context

    def _notify_tagged_members(self, post, memberships):
        if not memberships:
            return
        author_user = getattr(getattr(post, "author_membership", None), "user", None)
        author_name = ""
        if author_user:
            author_name = author_user.get_full_name().strip() or author_user.email or ""
        if not author_name:
            author_name = "A teammate"
        if post.community_group_id and post.community_group:
            context_label = post.community_group.name
        elif post.pharmacy_id and post.pharmacy:
            context_label = post.pharmacy.name
        elif post.organization_id and post.organization:
            context_label = post.organization.name
        else:
            context_label = "Pharmacy Hub"
        title = f"{author_name} mentioned you in {context_label}"
        body_preview = (post.body or "").strip()
        body = body_preview[:280]
        hub_path = "/dashboard/pharmacy-hub"
        user_payloads = []
        for membership in memberships:
            user = getattr(membership, "user", None)
            if not user or not user.is_active:
                continue
            if author_user and user.id == author_user.id:
                continue
            user_payloads.append(
                {
                    "user_id": user.id,
                    "email": user.email,
                    "name": user.get_full_name().strip() or user.email or "",
                }
            )
        user_ids = {payload["user_id"] for payload in user_payloads if payload.get("user_id")}
        if user_ids:
            notify_users(
                user_ids,
                title=title,
                body=body,
                action_url=hub_path,
                payload={"post_id": post.id},
            )
        email_targets = {}
        for payload in user_payloads:
            email = payload.get("email")
            if not email:
                continue
            if email in email_targets:
                continue
            email_targets[email] = payload.get("name") or ""
        if email_targets:
            frontend_base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
            hub_url = (
                f"{frontend_base}{hub_path}" if frontend_base else hub_path
            )
            for email, recipient_name in email_targets.items():
                context = {
                    "recipient_name": recipient_name or "there",
                    "author_name": author_name,
                    "context_label": context_label,
                    "post_body": body_preview,
                    "hub_url": hub_url,
                }
                async_task(
                    "users.tasks.send_async_email",
                    subject=title,
                    recipient_list=[email],
                    template_name="emails/hub_post_tagged.html",
                    context=context,
                    text_template="emails/hub_post_tagged.txt",
                )

    def list(self, request, *args, **kwargs):
        self.scope_context = self._resolve_scope_from_params(request.query_params)
        queryset = self._apply_scope_filter(self.get_queryset(), self.scope_context)
        self._prepare_serializer_context(self.scope_context)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(instance)
        self._prepare_serializer_context(scope)
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        data = self._normalize_params(request.data)
        self.scope_context = self._resolve_scope_from_params(data)
        resolver = HubScopeResolver(request.user)
        membership = self.scope_context.get("request_membership")
        is_platform_post = self.scope_context.get("scope_type") == "platform"
        if membership is None and not is_platform_post:
            membership = resolver.ensure_author_membership(self.scope_context)
        self._prepare_serializer_context(self.scope_context)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        scope_type = self.scope_context.get("scope_type")
        pharmacy = None
        organization = None
        community_group = None
        platform_hub = None
        if scope_type == "pharmacy":
            pharmacy = self.scope_context.get("pharmacy")
        elif scope_type == "organization":
            organization = self.scope_context.get("organization")
            pharmacy = None  # org-only post
        elif scope_type == "group":
            pharmacy = self.scope_context.get("pharmacy")
            community_group = self.scope_context.get("community_group")
        elif scope_type == "platform":
            platform_hub = self.scope_context.get("platform_hub")
        post = serializer.save(
            pharmacy=pharmacy,
            organization=organization,
            community_group=community_group,
            platform_hub=platform_hub,
            author_membership=membership,
            author_user=request.user,
            original_body=serializer.validated_data.get("body", ""),
            is_edited=False,
            last_edited_at=None,
            last_edited_by=None,
        )
        self._add_attachments(post, request.FILES.getlist("attachments"))
        self._notify_tagged_members(post, getattr(serializer, "_newly_tagged_members", []))
        output = self.get_serializer(post)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = self.get_object()
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_post(instance)
        self._prepare_serializer_context(scope)
        membership = scope.get("request_membership")
        is_author = False
        if instance.author_membership_id and instance.author_membership_id == getattr(
            membership, "id", None
        ):
            is_author = True
        elif instance.author_user_id == self.request.user.id:
            is_author = True
        if not is_author:
            raise PermissionDenied("Only the author can edit this post.")
        if instance.deleted_at:
            raise PermissionDenied("You cannot edit a deleted post.")
        extra = {}
        new_body = serializer.validated_data.get("body")
        if new_body is not None and new_body != instance.body:
            extra["is_edited"] = True
            if not instance.original_body:
                extra["original_body"] = instance.body
            extra["last_edited_at"] = timezone.now()
            extra["last_edited_by"] = self.request.user
        post = serializer.save(**extra)
        self._remove_attachments(post, self.request)
        self._add_attachments(post, self.request.FILES.getlist("attachments"))
        new_mentions = getattr(serializer, "_newly_tagged_members", [])
        if new_mentions:
            self._notify_tagged_members(post, new_mentions)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(instance)
        membership = scope.get("request_membership")
        is_author = False
        if instance.author_membership_id and instance.author_membership_id == getattr(
            membership, "id", None
        ):
            is_author = True
        elif instance.author_user_id == request.user.id:
            is_author = True
        if not is_author:
            raise PermissionDenied("Only the author can delete this post.")
        if not instance.deleted_at:
            instance.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="pin")
    def pin(self, request, pk=None):
        post = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        if not (
            scope.get("has_admin_permissions") or scope.get("has_group_admin_permissions")
        ):
            raise PermissionDenied("Only admins can pin posts.")
        if post.deleted_at:
            raise PermissionDenied("Cannot pin a deleted post.")
        if not post.is_pinned:
            post.is_pinned = True
            post.pinned_at = timezone.now()
            post.pinned_by = request.user
            post.save(update_fields=["is_pinned", "pinned_at", "pinned_by"])
        self._prepare_serializer_context(scope)
        serializer = self.get_serializer(post)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="unpin")
    def unpin(self, request, pk=None):
        post = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        if not (
            scope.get("has_admin_permissions") or scope.get("has_group_admin_permissions")
        ):
            raise PermissionDenied("Only admins can unpin posts.")
        if post.is_pinned:
            post.is_pinned = False
            post.pinned_at = None
            post.pinned_by = None
            post.save(update_fields=["is_pinned", "pinned_at", "pinned_by"])
        self._prepare_serializer_context(scope)
        serializer = self.get_serializer(post)
        return Response(serializer.data)


class HubPollViewSet(
    HubScopedViewSetMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubPollSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            PharmacyHubPoll.objects.select_related(
                "pharmacy",
                "organization",
                "community_group",
                "created_by",
                "created_by_membership__user",
            )
            .prefetch_related(
                "options",
                "votes__membership",
                "reactions",
                "comments__author_membership__user",
                "comments__author_user",
            )
            .order_by("-created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update(getattr(self, "extra_serializer_context", {}))
        return context

    def _set_vote_cache(self, polls):
        if not polls:
            return
        for poll in polls:
            prefetched = getattr(poll, "_prefetched_objects_cache", {})
            votes = prefetched.get("votes")
            if votes is not None:
                poll._prefetched_votes = list(votes)

    def _apply_scope_filter(self, queryset, scope):
        if scope["scope_type"] == "platform":
            return queryset.filter(platform_hub=scope["platform_hub"])
        if scope["scope_type"] == "group":
            return queryset.filter(community_group=scope["community_group"])
        if scope["scope_type"] == "pharmacy":
            return queryset.filter(
                pharmacy=scope["pharmacy"],
                community_group__isnull=True
            )
        # Organization scope: include polls tied to the org or any pharmacy within the org, excluding group polls
        org = scope.get("organization")
        return queryset.filter(
            Q(organization=org) | Q(pharmacy__organization=org),
            community_group__isnull=True,
        )

    def list(self, request, *args, **kwargs):
        scope = self._resolve_scope_from_params(request.query_params)
        queryset = self._apply_scope_filter(self.get_queryset(), scope)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        page = self.paginate_queryset(queryset)
        polls = page if page is not None else queryset
        self._set_vote_cache(polls)
        serializer = self.get_serializer(polls, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        data = self._normalize_params(request.data)
        labels = self._coerce_option_labels(
            data.get("option_labels")
            or data.get("options")
            or data.get("choices")
            or data.get("labels")
        )
        if labels is not None:
            data["option_labels"] = labels
        scope = self._resolve_scope_from_params(data)
        resolver = HubScopeResolver(request.user)
        membership = scope.get("request_membership") or resolver.ensure_author_membership(scope)
        scope["request_membership"] = membership
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        poll = serializer.save()
        refreshed = self.get_queryset().get(pk=poll.pk)
        self._set_vote_cache([refreshed])
        output = self.get_serializer(refreshed)
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def retrieve(self, request, *args, **kwargs):
        poll = self.get_object()
        scope = HubScopeResolver(request.user).from_poll(poll)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        self._set_vote_cache([poll])
        serializer = self.get_serializer(poll)
        return Response(serializer.data)

    def _assert_can_manage_poll(self, poll):
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_poll(poll)
        membership = scope.get("request_membership")
        is_creator = getattr(poll, "created_by_membership_id", None) == getattr(membership, "id", None)
        if not (
            is_creator
            or scope.get("has_admin_permissions")
            or scope.get("has_group_admin_permissions")
        ):
            raise PermissionDenied("You do not have permission to modify this poll.")
        return scope

    def perform_destroy(self, instance):
        self._assert_can_manage_poll(instance)
        super().perform_destroy(instance)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        poll = self.get_object()
        scope = self._assert_can_manage_poll(poll)
        data = self._normalize_params(request.data)
        labels = self._coerce_option_labels(
            data.get("option_labels")
            or data.get("options")
            or data.get("choices")
            or data.get("labels")
        )
        if labels is not None:
            data["option_labels"] = labels
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        serializer = self.get_serializer(poll, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        updated = serializer.save()
        refreshed = self.get_queryset().get(pk=updated.pk)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        self._set_vote_cache([refreshed])
        output = self.get_serializer(refreshed)
        return Response(output.data)

    @action(detail=True, methods=["post"], url_path="vote")
    def vote(self, request, pk=None):
        poll = self.get_object()
        option_id = request.data.get("option_id")
        if not option_id:
            raise ValidationError({"option_id": "This field is required."})
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_poll(poll)
        membership = scope.get("request_membership")
        if membership is None and scope.get("scope_type") != "platform":
            membership = resolver.ensure_author_membership(scope)
        try:
            option_id = int(option_id)
        except (TypeError, ValueError):
            raise ValidationError({"option_id": "Invalid option."})
        with transaction.atomic():
            option = (
                PharmacyHubPollOption.objects.select_for_update()
                .filter(poll=poll, pk=option_id)
                .first()
            )
            if not option:
                raise ValidationError({"option_id": "Invalid option."})
            vote_qs = PharmacyHubPollVote.objects.select_for_update().select_related("option")
            if membership:
                vote_qs = vote_qs.filter(poll=poll, membership=membership)
            else:
                vote_qs = vote_qs.filter(poll=poll, user=request.user)
            vote = vote_qs.first()
            if vote and vote.option_id == option.id:
                pass
            else:
                if vote:
                    PharmacyHubPollOption.objects.filter(pk=vote.option_id).update(
                        vote_count=F("vote_count") - 1
                    )
                    vote.option = option
                    vote.save(update_fields=["option"])
                else:
                    create_kwargs = {
                        "poll": poll,
                        "option": option,
                    }
                    if membership:
                        create_kwargs["membership"] = membership
                    else:
                        create_kwargs["user"] = request.user
                    PharmacyHubPollVote.objects.create(**create_kwargs)
                PharmacyHubPollOption.objects.filter(pk=option.id).update(
                    vote_count=F("vote_count") + 1
                )
        refreshed = self.get_queryset().get(pk=poll.pk)
        self._prepare_serializer_context(scope, {"request_user": self.request.user})
        self._set_vote_cache([refreshed])
        serializer = self.get_serializer(refreshed)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def _coerce_option_labels(self, raw):
        if raw is None:
            return None
        if isinstance(raw, str):
            tokens = raw.replace("\r", "").replace("\n", ",").split(",")
            labels = [token.strip() for token in tokens if token.strip()]
            return labels if labels else None
        if isinstance(raw, list):
            labels = []
            for item in raw:
                if isinstance(item, str):
                    label = item.strip()
                elif isinstance(item, Mapping):
                    label = str(item.get("label") or item.get("value") or "").strip()
                else:
                    label = ""
                if label:
                    labels.append(label)
            return labels if labels else None
        if isinstance(raw, Mapping):
            labels = [str(v).strip() for v in raw.values() if str(v).strip()]
            return labels if labels else None
        return None


class HubCommentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _get_post(self):
        if hasattr(self, "_cached_post"):
            return self._cached_post
        post = get_object_or_404(
            PharmacyHubPost.objects.select_related(
                "pharmacy",
                "organization",
                "community_group",
            ),
            pk=self.kwargs["post_pk"],
            deleted_at__isnull=True,
        )
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_post(post)
        self._cached_post = post
        self.scope_context = scope
        self.resolver = resolver
        return post

    def get_queryset(self):
        post = self._get_post()
        return (
            post.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
            .prefetch_related("reactions")
            .order_by("created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        scope = getattr(self, "scope_context", {})
        context.update(
            {
                "request_membership": scope.get("request_membership"),
                "has_admin_permissions": scope.get("has_admin_permissions", False)
                or scope.get("has_group_admin_permissions", False),
            }
        )
        return context

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        post = self._get_post()
        if not post.allow_comments:
            raise ValidationError({"detail": "Comments are disabled for this post."})
        resolver = getattr(self, "resolver", HubScopeResolver(request.user))
        membership = self.scope_context.get("request_membership")
        if membership is None and self.scope_context.get("scope_type") != "platform":
            membership = resolver.ensure_author_membership(self.scope_context)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(
            post=post,
            author_membership=membership,
            author_user=request.user,
            original_body=serializer.validated_data.get("body", ""),
            is_edited=False,
            last_edited_at=None,
            last_edited_by=None,
        )
        post.recompute_comment_count()
        actor_user = getattr(membership, "user", None) or request.user
        actor_name = _get_user_display_name(actor_user)
        _notify_hub_post_owner(
            post=post,
            actor_user=actor_user,
            title=f"{actor_name} has commented on the post",
            body=(comment.body or "").strip()[:280],
            payload={"comment_id": comment.id},
        )
        output = self.get_serializer(comment)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        comment = self.get_object()
        membership = self.scope_context.get("request_membership")
        can_manage = self.scope_context.get("has_admin_permissions")
        is_author = (
            comment.author_membership_id == getattr(membership, "id", None)
            or comment.author_user_id == getattr(self.request.user, "id", None)
        )
        if not can_manage and not is_author:
            raise PermissionDenied("You cannot edit this comment.")
        extra = {}
        new_body = serializer.validated_data.get("body")
        if new_body is not None and new_body != comment.body:
            extra["is_edited"] = True
            if not comment.original_body:
                extra["original_body"] = comment.body
            extra["last_edited_at"] = timezone.now()
            extra["last_edited_by"] = self.request.user
        serializer.save(**extra)

    def destroy(self, request, *args, **kwargs):
        comment = self.get_object()
        membership = self.scope_context.get("request_membership")
        can_manage = self.scope_context.get("has_admin_permissions")
        is_author = (
            comment.author_membership_id == getattr(membership, "id", None)
            or comment.author_user_id == getattr(request.user, "id", None)
        )
        if not can_manage and not is_author:
            raise PermissionDenied("You cannot delete this comment.")
        if not comment.deleted_at:
            comment.soft_delete()
            comment.post.recompute_comment_count()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HubReactionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, post_pk: int):
        post = get_object_or_404(
            PharmacyHubPost.objects.select_related(
                "author_membership__user",
                "author_user",
                "pharmacy",
                "organization",
                "community_group",
            ),
            pk=post_pk,
            deleted_at__isnull=True,
        )
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        membership = scope.get("request_membership")
        serializer = HubReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reaction_type = serializer.validated_data["reaction_type"]
        lookup = {"post": post}
        if membership:
            lookup["member"] = membership
        else:
            lookup["user"] = request.user
        PharmacyHubReaction.objects.update_or_create(
            **lookup,
            defaults={
                "reaction_type": reaction_type,
                "updated_at": timezone.now(),
            },
        )
        post.recompute_reaction_summary()
        actor_user = getattr(membership, "user", None) or request.user
        actor_name = _get_user_display_name(actor_user)
        _notify_hub_post_owner(
            post=post,
            actor_user=actor_user,
            title=f"{actor_name} has reacted to the post",
            body=reaction_type.replace("_", " ").title(),
            payload={"reaction_type": reaction_type},
        )
        context = {
            "request": request,
            "request_membership": membership,
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
        }
        response = HubPostSerializer(post, context=context)
        return Response(response.data)

    def delete(self, request, post_pk: int):
        post = get_object_or_404(
            PharmacyHubPost,
            pk=post_pk,
            deleted_at__isnull=True,
        )
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(post)
        membership = scope.get("request_membership")
        if membership:
            PharmacyHubReaction.objects.filter(post=post, member=membership).delete()
        else:
            PharmacyHubReaction.objects.filter(post=post, user=request.user).delete()
        if membership or request.user.is_authenticated:
            post.recompute_reaction_summary()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HubCommentReactionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_comment(self, post_pk: int, comment_pk: int):
        return get_object_or_404(
            PharmacyHubComment.objects.select_related(
                "post",
                "post__pharmacy",
                "post__organization",
                "post__community_group",
            ),
            pk=comment_pk,
            post_id=post_pk,
            deleted_at__isnull=True,
            post__deleted_at__isnull=True,
        )

    def _serializer_context(self, scope, membership):
        return {
            "request": self.request,
            "request_membership": membership,
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
        }

    def post(self, request, post_pk: int, comment_pk: int):
        comment = self._get_comment(post_pk, comment_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(comment.post)
        membership = scope.get("request_membership")
        serializer = HubReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reaction_type = serializer.validated_data["reaction_type"]
        lookup = {"comment": comment}
        if membership:
            lookup["member"] = membership
        else:
            lookup["user"] = request.user
        PharmacyHubCommentReaction.objects.update_or_create(
            **lookup,
            defaults={
                "reaction_type": reaction_type,
                "updated_at": timezone.now(),
            },
        )
        comment.recompute_reaction_summary()
        serializer_context = self._serializer_context(scope, membership)
        response = HubCommentSerializer(comment, context=serializer_context)
        return Response(response.data)

    def delete(self, request, post_pk: int, comment_pk: int):
        comment = self._get_comment(post_pk, comment_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_post(comment.post)
        membership = scope.get("request_membership")
        if membership:
            PharmacyHubCommentReaction.objects.filter(
                comment=comment, member=membership
            ).delete()
        else:
            PharmacyHubCommentReaction.objects.filter(
                comment=comment, user=request.user
            ).delete()
        comment.recompute_reaction_summary()
        serializer_context = self._serializer_context(scope, membership)
        response = HubCommentSerializer(comment, context=serializer_context)
        return Response(response.data, status=status.HTTP_200_OK)


class HubPollCommentViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubPollCommentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _get_poll(self):
        if hasattr(self, "_cached_poll"):
            return self._cached_poll
        poll = get_object_or_404(
            PharmacyHubPoll.objects.select_related(
                "pharmacy",
                "organization",
                "community_group",
            ),
            pk=self.kwargs["poll_pk"],
        )
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.from_poll(poll)
        self._cached_poll = poll
        self.scope_context = scope
        self.resolver = resolver
        return poll

    def get_queryset(self):
        poll = self._get_poll()
        return (
            poll.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
            .order_by("created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        scope = getattr(self, "scope_context", {})
        context.update(
            {
                "request_membership": scope.get("request_membership"),
                "has_admin_permissions": scope.get("has_admin_permissions", False)
                or scope.get("has_group_admin_permissions", False),
            }
        )
        return context

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        poll = self._get_poll()
        scope = self.scope_context
        resolver = getattr(self, "resolver", HubScopeResolver(request.user))
        membership = scope.get("request_membership")
        if membership is None and scope.get("scope_type") != "platform":
            membership = resolver.ensure_author_membership(scope)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = PharmacyHubPollComment.objects.create(
            poll=poll,
            author_membership=membership,
            author_user=request.user,
            body=serializer.validated_data.get("body", ""),
            original_body=serializer.validated_data.get("body", ""),
            is_edited=False,
            last_edited_at=None,
            last_edited_by=None,
        )
        poll.recompute_comment_count()
        output = self.get_serializer(comment)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        comment = self.get_object()
        membership = self.scope_context.get("request_membership")
        can_manage = self.scope_context.get("has_admin_permissions")
        request_user = getattr(self.request, "user", None)
        is_author = (
            comment.author_membership_id == getattr(membership, "id", None)
            or comment.author_user_id == getattr(request_user, "id", None)
        )
        if not can_manage and not is_author:
            raise PermissionDenied("You cannot edit this comment.")
        extra = {}
        new_body = serializer.validated_data.get("body")
        if new_body is not None and new_body != comment.body:
            extra["is_edited"] = True
            if not comment.original_body:
                extra["original_body"] = comment.body
            extra["last_edited_at"] = timezone.now()
            extra["last_edited_by"] = self.request.user
        serializer.save(**extra)

    def destroy(self, request, *args, **kwargs):
        comment = self.get_object()
        membership = self.scope_context.get("request_membership")
        can_manage = self.scope_context.get("has_admin_permissions")
        is_author = (
            comment.author_membership_id == getattr(membership, "id", None)
            or comment.author_user_id == request.user.id
        )
        if not can_manage and not is_author:
            raise PermissionDenied("You cannot delete this comment.")
        if not comment.deleted_at:
            comment.soft_delete()
            comment.poll.recompute_comment_count()
        return Response(status=status.HTTP_204_NO_CONTENT)


class HubPollReactionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, poll_pk: int):
        poll = get_object_or_404(PharmacyHubPoll, pk=poll_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_poll(poll)
        serializer = HubReactionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reaction_type = serializer.validated_data["reaction_type"]
        PharmacyHubPollReaction.objects.update_or_create(
            poll=poll,
            user=request.user,
            defaults={
                "reaction_type": reaction_type,
                "updated_at": timezone.now(),
            },
        )
        poll.recompute_reaction_summary()
        context = {
            "request": request,
            "request_membership": scope.get("request_membership"),
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
            "request_user": request.user,
        }
        response = HubPollSerializer(poll, context=context)
        return Response(response.data)

    def delete(self, request, poll_pk: int):
        poll = get_object_or_404(PharmacyHubPoll, pk=poll_pk)
        resolver = HubScopeResolver(request.user)
        scope = resolver.from_poll(poll)
        PharmacyHubPollReaction.objects.filter(poll=poll, user=request.user).delete()
        poll.recompute_reaction_summary()
        context = {
            "request": request,
            "request_membership": scope.get("request_membership"),
            "has_admin_permissions": scope.get("has_admin_permissions", False),
            "has_group_admin_permissions": scope.get(
                "has_group_admin_permissions", False
            ),
            "request_user": request.user,
        }
        response = HubPollSerializer(poll, context=context)
        return Response(response.data, status=status.HTTP_200_OK)


class HubPharmacyProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, pharmacy_pk: int):
        resolver = HubScopeResolver(request.user)
        scope = resolver.pharmacy_scope(pharmacy_pk)
        if not scope.get("has_admin_permissions"):
            raise PermissionDenied("You cannot update this pharmacy profile.")
        serializer = HubPharmacyProfileSerializer(
            scope["pharmacy"], data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _, permissions, _, _ = get_user_pharmacy_permissions(request.user)
        data = HubPharmacySerializer(
            [scope["pharmacy"]],
            many=True,
            context={
                "request": request,
                "pharmacy_permissions": permissions,
            },
        ).data[0]
        return Response(data)


class HubOrganizationProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, organization_pk: int):
        resolver = HubScopeResolver(request.user)
        scope = resolver.organization_scope(organization_pk)
        if not scope.get("has_admin_permissions"):
            raise PermissionDenied("You cannot update this organization profile.")
        serializer = HubOrganizationProfileSerializer(
            scope["organization"], data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        data = HubOrganizationSerializer(
            [scope["organization"]],
            many=True,
            context={
                "request": request,
                "organization_permissions": {
                    scope["organization"].id: {"can_manage_profile": True}
                },
            },
        ).data[0]
        return Response(data)
