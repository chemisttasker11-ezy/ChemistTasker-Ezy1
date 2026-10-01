"""Serializers for the pharmacy hub API."""
from rest_framework import serializers
from client_profile.models import (
    Membership,
    Organization,
    OtherStaffOnboarding,
    Pharmacy,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
)
from pharmacy_hub.models import (
    PharmacyCommunityGroup,
    PharmacyCommunityGroupMembership,
    PharmacyHubAttachment,
    PharmacyHubComment,
    PharmacyHubPoll,
    PharmacyHubPollComment,
    PharmacyHubPollOption,
    PharmacyHubPollVote,
    PharmacyHubPost,
    PharmacyHubPostMention,
    PharmacyHubReaction,
)
from django.db import transaction
from client_profile.file_validation import IMAGE_UPLOAD_POLICY
from client_profile.domains.common.serializers import (
    _build_absolute_media_url,
    _chat_member_identity,
    _resolve_user_profile_photo,
    UploadValidationMixin,
)


def _serialize_user_summary(user, request):
    if not user:
        return None
    photo = _resolve_user_profile_photo(user)
    return {
        "id": user.id,
        "username": getattr(user, "username", None),
        "first_name": getattr(user, "first_name", None),
        "last_name": getattr(user, "last_name", None),
        "email": getattr(user, "email", None),
        "profile_photo_url": _build_absolute_media_url(request, photo),
    }


class HubPharmacySerializer(serializers.ModelSerializer):
    cover_image = serializers.ImageField(read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    can_manage_profile = serializers.SerializerMethodField()
    can_create_group = serializers.SerializerMethodField()
    can_create_post = serializers.SerializerMethodField()

    class Meta:
        model = Pharmacy
        fields = [
            "id",
            "name",
            "about",
            "cover_image",
            "cover_image_url",
            "organization_id",
            "organization_name",
            "can_manage_profile",
            "can_create_group",
            "can_create_post",
        ]
        read_only_fields = fields

    def _permission_for(self, obj, key, default=False):
        perms = self.context.get("pharmacy_permissions", {})
        return perms.get(obj.id, {}).get(key, default)

    def get_cover_image_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.cover_image)

    def get_can_manage_profile(self, obj):
        return self._permission_for(obj, "can_manage_profile")

    def get_can_create_group(self, obj):
        return self._permission_for(obj, "can_create_group")

    def get_can_create_post(self, obj):
        return self._permission_for(obj, "can_create_post", True)


class HubOrganizationSerializer(serializers.ModelSerializer):
    cover_image = serializers.ImageField(read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    can_manage_profile = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    is_org_admin = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "about",
            "cover_image",
            "cover_image_url",
            "can_manage_profile",
            "is_org_admin",
            "member_count",
        ]
        read_only_fields = fields

    def get_cover_image_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.cover_image)

    def get_can_manage_profile(self, obj):
        perms = self.context.get("organization_permissions", {})
        return perms.get(obj.id, {}).get("can_manage_profile", False)

    def get_member_count(self, obj):
        counts = self.context.get("organization_member_counts", {})
        return counts.get(obj.id, 0)

    def get_is_org_admin(self, obj):
        perms = self.context.get("organization_permissions", {})
        return perms.get(obj.id, {}).get("is_org_admin", False)


class HubPharmacyProfileSerializer(UploadValidationMixin, serializers.ModelSerializer):
    upload_validation_map = {
        "cover_image": IMAGE_UPLOAD_POLICY,
    }

    class Meta:
        model = Pharmacy
        fields = ["about", "cover_image"]


def _serialize_hub_author(membership, user, request):
    def _display_role(target_user):
        if not target_user:
            return ""
        top_role = (getattr(target_user, "role", "") or "").upper()
        if top_role == "OWNER":
            return "Owner"
        if top_role == "PHARMACIST":
            return "Pharmacist"
        if top_role == "OTHER_STAFF":
            role_type = (
                OtherStaffOnboarding.objects.filter(user=target_user)
                .values_list("role_type", flat=True)
                .first()
            )
            if (role_type or "").upper() == "INTERN":
                return "Intern"
            return "Staff"
        if top_role == "ORG_STAFF":
            return "Staff"
        if top_role == "EXPLORER":
            return "Explorer"
        return ""

    target_user = user or getattr(membership, "user", None)
    summary = _serialize_user_summary(target_user, request)
    if membership:
        return {
            "id": membership.id,
            "role": _display_role(target_user),
            "employment_type": getattr(membership, "employment_type", "") or "",
            "job_title": getattr(membership, "job_title", "") or "",
            "user_details": summary,
        }
    if not summary:
        return None
    return {
        "id": 0,
        "role": _display_role(target_user),
        "employment_type": "",
        "job_title": "",
        "user_details": summary,
    }


class HubOrganizationProfileSerializer(UploadValidationMixin, serializers.ModelSerializer):
    upload_validation_map = {
        "cover_image": IMAGE_UPLOAD_POLICY,
    }

    class Meta:
        model = Organization
        fields = ["about", "cover_image"]


class HubMembershipSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = ["id", "role", "employment_type", "job_title", "user_details"]
        read_only_fields = fields

    def get_user_details(self, obj):
        return _chat_member_identity(
            getattr(obj, "user", None),
            self.context.get("request"),
            obj,
        )


class PharmacyCommunityGroupMemberSerializer(serializers.ModelSerializer):
    membership_id = serializers.IntegerField(read_only=True)
    member = HubMembershipSerializer(source="membership", read_only=True)
    pharmacy_id = serializers.IntegerField(source="membership.pharmacy_id", read_only=True)
    pharmacy_name = serializers.CharField(
        source="membership.pharmacy.name", read_only=True
    )
    job_title = serializers.CharField(
        source="membership.job_title", read_only=True, allow_blank=True
    )

    class Meta:
        model = PharmacyCommunityGroupMembership
        fields = [
            "membership_id",
            "member",
            "is_admin",
            "joined_at",
            "pharmacy_id",
            "pharmacy_name",
            "job_title",
        ]
        read_only_fields = [
            "membership_id",
            "member",
            "joined_at",
            "pharmacy_id",
            "pharmacy_name",
            "job_title",
        ]


class HubCommunityGroupSerializer(serializers.ModelSerializer):
    members = serializers.SerializerMethodField()
    member_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    member_count = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    organization_id = serializers.IntegerField(
        source="pharmacy.organization_id", read_only=True
    )
    is_creator = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyCommunityGroup
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "organization_id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "members",
            "member_ids",
            "member_count",
            "is_admin",
            "is_member",
            "is_creator",
        ]
        read_only_fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "organization_id",
            "created_at",
            "updated_at",
            "members",
            "member_count",
            "is_admin",
            "is_member",
            "is_creator",
        ]

    def _resolve_memberships(self, pharmacy, member_ids):
        if not member_ids:
            return []
        allowed_pharmacy_ids = set(
            self.context.get("allowed_pharmacy_ids") or []
        )
        if pharmacy:
            allowed_pharmacy_ids.add(pharmacy.id)
        memberships_qs = Membership.objects.filter(
            id__in=member_ids,
            is_active=True,
            employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
        )
        if allowed_pharmacy_ids:
            memberships_qs = memberships_qs.filter(
                pharmacy_id__in=allowed_pharmacy_ids
            )
        memberships = list(memberships_qs)
        found_ids = {m.id for m in memberships}
        missing = sorted(set(member_ids) - found_ids)
        if missing:
            raise serializers.ValidationError(
                {
                    "member_ids": (
                        "Invalid membership IDs for manageable pharmacies: "
                        f"{missing}"
                    )
                }
            )
        return memberships

    def _ensure_creator_membership(self, pharmacy):
        request_membership = self.context.get("request_membership")
        if request_membership and request_membership.pharmacy_id == pharmacy.id:
            return request_membership
        user = self.context["request"].user if "request" in self.context else None
        if not user:
            return None
        return (
            Membership.objects.filter(
                user=user,
                pharmacy=pharmacy,
                is_active=True,
                employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            )
            .order_by("id")
            .first()
        )

    def create(self, validated_data):
        member_ids = set(validated_data.pop("member_ids", []) or [])
        pharmacy = validated_data["pharmacy"]
        creator_membership = self._ensure_creator_membership(pharmacy)
        if creator_membership:
            member_ids.add(creator_membership.id)
        memberships = self._resolve_memberships(pharmacy, member_ids)
        with transaction.atomic():
            group = PharmacyCommunityGroup.objects.create(**validated_data)
            bulk_links = [
                PharmacyCommunityGroupMembership(
                    group=group,
                    membership=membership,
                    is_admin=(membership == creator_membership),
                )
                for membership in memberships
            ]
            PharmacyCommunityGroupMembership.objects.bulk_create(bulk_links)
        return group

    def update(self, instance, validated_data):
        membership_ids = validated_data.pop("member_ids", None)
        response = super().update(instance, validated_data)
        if membership_ids is not None:
            membership_ids = set(membership_ids)
            memberships = self._resolve_memberships(instance.pharmacy, membership_ids)
            desired_ids = {membership.id for membership in memberships}
            existing_links = {
                link.membership_id: link
                for link in PharmacyCommunityGroupMembership.objects.filter(
                    group=instance
                )
            }
            new_links = []
            for membership in memberships:
                if membership.id in existing_links:
                    continue
                new_links.append(
                    PharmacyCommunityGroupMembership(
                        group=instance,
                        membership=membership,
                    )
                )
            if new_links:
                PharmacyCommunityGroupMembership.objects.bulk_create(new_links)
            to_remove = set(existing_links.keys()) - desired_ids
            if to_remove:
                PharmacyCommunityGroupMembership.objects.filter(
                    group=instance, membership_id__in=to_remove
                ).delete()
        return response

    def get_member_count(self, obj):
        return getattr(
            obj,
            "staff_member_count",
            obj.memberships.filter(
                membership__is_active=True,
                membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).count(),
        )

    def get_members(self, obj):
        links = getattr(obj, "_prefetched_objects_cache", {}).get("staff_memberships")
        if links is None:
            links = obj.memberships.filter(
                membership__is_active=True,
                membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).select_related("membership", "membership__user", "membership__pharmacy")
        serializer = PharmacyCommunityGroupMemberSerializer(
            links,
            many=True,
            context=self.context,
        )
        return serializer.data

    def get_is_admin(self, obj):
        request = self.context.get("request")
        if request and getattr(request, "user", None):
            if obj.created_by_id == request.user.id:
                return True
        admin_map = self.context.get("group_admin_map", {})
        return admin_map.get(obj.id, False)

    def get_is_member(self, obj):
        member_map = self.context.get("group_member_map", {})
        return member_map.get(obj.id, False)

    def get_is_creator(self, obj):
        request = self.context.get("request")
        if request and getattr(request, "user", None):
            return obj.created_by_id == request.user.id
        return False

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self.context.get("include_members", True):
            data.pop("members", None)
        return data


class HubCommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    is_edited = serializers.BooleanField(read_only=True)
    original_body = serializers.CharField(read_only=True)
    edited_at = serializers.DateTimeField(source="last_edited_at", read_only=True)
    edited_by = serializers.SerializerMethodField()
    is_deleted = serializers.SerializerMethodField()
    viewer_reaction = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubComment
        fields = [
            "id",
            "post",
            "author",
            "body",
            "parent_comment",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
            "reaction_summary",
            "viewer_reaction",
        ]
        read_only_fields = [
            "id",
            "post",
            "author",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
            "reaction_summary",
            "viewer_reaction",
        ]

    def get_can_edit(self, obj):
        membership = self.context.get("request_membership")
        if membership and membership == obj.author_membership:
            return True
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if request_user and obj.author_user_id == request_user.id:
            return True
        return self.context.get("has_admin_permissions", False)

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "author_membership", None),
            getattr(obj, "author_user", None)
            or getattr(getattr(obj, "author_membership", None), "user", None),
            self.context.get("request"),
        )

    def get_edited_by(self, obj):
        user = getattr(obj, "last_edited_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_is_deleted(self, obj):
        return obj.deleted_at is not None

    def get_viewer_reaction(self, obj):
        membership = self.context.get("request_membership")
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if membership:
            return (
                obj.reactions.filter(member=membership)
                .values_list("reaction_type", flat=True)
                .first()
            )
        if request_user and request_user.is_authenticated:
            return (
                obj.reactions.filter(user=request_user)
                .values_list("reaction_type", flat=True)
                .first()
            )
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("is_deleted"):
            data["body"] = "This comment has been deleted."
        return data


class HubAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    filename = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubAttachment
        fields = ["id", "kind", "url", "filename", "uploaded_at"]
        read_only_fields = fields

    def get_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.file)

    def get_filename(self, obj):
        if obj.file and hasattr(obj.file, "name"):
            import os

            return os.path.basename(obj.file.name)
        return None


class HubPostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    viewer_reaction = serializers.SerializerMethodField()
    recent_comments = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    attachments = HubAttachmentSerializer(many=True, read_only=True)
    is_edited = serializers.BooleanField(read_only=True)
    original_body = serializers.CharField(read_only=True)
    edited_at = serializers.DateTimeField(source="last_edited_at", read_only=True)
    edited_by = serializers.SerializerMethodField()
    is_deleted = serializers.SerializerMethodField()
    is_pinned = serializers.BooleanField(read_only=True)
    pinned_at = serializers.DateTimeField(read_only=True)
    pinned_by = serializers.SerializerMethodField()
    viewer_is_admin = serializers.SerializerMethodField()
    organization = serializers.IntegerField(source="organization_id", read_only=True)
    organization_name = serializers.SerializerMethodField()
    platform_hub = serializers.CharField(read_only=True)
    pharmacy_name = serializers.SerializerMethodField()
    community_group = serializers.IntegerField(
        source="community_group_id", read_only=True
    )
    community_group_name = serializers.SerializerMethodField()
    scope_type = serializers.SerializerMethodField()
    scope_target_id = serializers.SerializerMethodField()
    tagged_members = serializers.SerializerMethodField()
    tagged_member_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
        allow_empty=True,
    )

    class Meta:
        model = PharmacyHubPost
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "community_group",
            "community_group_name",
            "organization",
            "organization_name",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "body",
            "visibility",
            "allow_comments",
            "created_at",
            "updated_at",
            "deleted_at",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
            "can_manage",
            "attachments",
            "is_edited",
            "is_pinned",
            "pinned_at",
            "pinned_by",
            "original_body",
            "edited_at",
            "edited_by",
            "viewer_is_admin",
            "is_deleted",
            "tagged_members",
            "tagged_member_ids",
        ]
        read_only_fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "community_group",
            "community_group_name",
            "organization",
            "organization_name",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "created_at",
            "updated_at",
            "deleted_at",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
            "can_manage",
            "attachments",
            "is_edited",
            "is_pinned",
            "pinned_at",
            "pinned_by",
            "original_body",
            "edited_at",
            "edited_by",
            "viewer_is_admin",
            "is_deleted",
            "tagged_members",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._newly_tagged_members = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "tagged_member_ids" in getattr(self, "initial_data", {}):
            raw_ids = self.initial_data.get("tagged_member_ids") or []
            memberships = self._resolve_tagged_memberships(raw_ids)
            attrs["_tagged_memberships"] = memberships
        return attrs

    def create(self, validated_data):
        validated_data.pop("tagged_member_ids", None)
        memberships = validated_data.pop("_tagged_memberships", None)
        post = super().create(validated_data)
        self._newly_tagged_members = self._apply_mentions(post, memberships)
        return post

    def update(self, instance, validated_data):
        validated_data.pop("tagged_member_ids", None)
        memberships = validated_data.pop("_tagged_memberships", None)
        post = super().update(instance, validated_data)
        if memberships is not None:
            self._newly_tagged_members = self._apply_mentions(post, memberships)
        return post

    def _resolve_tagged_memberships(self, member_ids):
        if not isinstance(member_ids, list):
            raise serializers.ValidationError({"tagged_member_ids": "Provide a list of membership ids."})
        normalized_ids = []
        for raw in member_ids:
            try:
                normalized_ids.append(int(raw))
            except (TypeError, ValueError):
                raise serializers.ValidationError({"tagged_member_ids": f"Invalid membership id: {raw}"})
        if not normalized_ids:
            return []
        memberships = list(
            Membership.objects.filter(id__in=set(normalized_ids), is_active=True).select_related("pharmacy__organization", "user")
        )
        if len(memberships) != len(set(normalized_ids)):
            found_ids = {m.id for m in memberships}
            missing = [mid for mid in normalized_ids if mid not in found_ids]
            raise serializers.ValidationError({"tagged_member_ids": f"Invalid membership ids: {missing}"})
        context = self.context or {}
        pharmacy = context.get("pharmacy")
        organization = context.get("organization")
        community_group = context.get("community_group")
        platform_hub = context.get("platform_hub")
        if community_group:
            allowed_ids = set(
                PharmacyCommunityGroupMembership.objects.filter(
                    group=community_group
                ).values_list("membership_id", flat=True)
            )
            invalid = [m.id for m in memberships if m.id not in allowed_ids]
            if invalid:
                raise serializers.ValidationError(
                    {
                        "tagged_member_ids": (
                            "Memberships must belong to the selected group."
                        )
                    }
                )
        elif pharmacy:
            invalid = [m.id for m in memberships if m.pharmacy_id != pharmacy.id]
            if invalid:
                raise serializers.ValidationError({"tagged_member_ids": f"Memberships must belong to pharmacy #{pharmacy.id}."})
        elif organization:
            invalid = [
                m.id
                for m in memberships
                if not m.pharmacy or m.pharmacy.organization_id != organization.id
            ]
            if invalid:
                raise serializers.ValidationError(
                    {"tagged_member_ids": f"Memberships must belong to organization #{organization.id}."}
                )
        elif platform_hub:
            raise serializers.ValidationError(
                {"tagged_member_ids": "Member tagging is not available in ChemistTasker Hub posts."}
            )
        else:
            raise serializers.ValidationError({"tagged_member_ids": "Unable to determine post scope for tagging."})
        return memberships

    def _apply_mentions(self, post, memberships):
        if memberships is None:
            return []
        desired_ids = {m.id for m in memberships}
        existing_ids = set(post.mentions.values_list("membership_id", flat=True))
        to_remove = existing_ids - desired_ids
        if to_remove:
            PharmacyHubPostMention.objects.filter(post=post, membership_id__in=to_remove).delete()
        to_add = desired_ids - existing_ids
        new_links = [
            PharmacyHubPostMention(post=post, membership=membership)
            for membership in memberships
            if membership.id in to_add
        ]
        if new_links:
            PharmacyHubPostMention.objects.bulk_create(new_links)
        return [membership for membership in memberships if membership.id in to_add]

    def get_scope_type(self, obj):
        if obj.platform_hub:
            return "platform"
        if obj.community_group_id:
            return "group"
        if obj.pharmacy_id:
            return "pharmacy"
        if obj.organization_id:
            return "organization"
        return None

    def get_scope_target_id(self, obj):
        if obj.platform_hub:
            return obj.platform_hub
        if obj.community_group_id:
            return obj.community_group_id
        if obj.pharmacy_id:
            return obj.pharmacy_id
        return obj.organization_id

    def get_viewer_reaction(self, obj):
        membership = self.context.get("request_membership")
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if membership:
            return (
                obj.reactions.filter(member=membership)
                .values_list("reaction_type", flat=True)
                .first()
            )
        if request_user and request_user.is_authenticated:
            return (
                obj.reactions.filter(user=request_user)
                .values_list("reaction_type", flat=True)
                .first()
            )
        return None

    def get_recent_comments(self, obj):
        comments_qs = (
            obj.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
            .order_by("-created_at")[:2]
        )
        serializer = HubCommentSerializer(
            comments_qs,
            many=True,
            context=self.context,
        )
        return list(reversed(serializer.data))

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "author_membership", None),
            getattr(obj, "author_user", None),
            self.context.get("request"),
        )

    def get_can_manage(self, obj):
        membership = self.context.get("request_membership")
        if membership and membership == obj.author_membership:
            return True
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        return bool(request_user and obj.author_user_id == request_user.id)

    def get_edited_by(self, obj):
        user = getattr(obj, "last_edited_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_is_deleted(self, obj):
        return obj.deleted_at is not None

    def get_pinned_by(self, obj):
        user = getattr(obj, "pinned_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_viewer_is_admin(self, obj):
        if self.context.get("has_admin_permissions"):
            return True
        return bool(self.context.get("has_group_admin_permissions", False))

    def get_organization_name(self, obj):
        organization = getattr(obj, "organization", None)
        if not organization:
            return None
        return organization.name

    def get_pharmacy_name(self, obj):
        pharmacy = getattr(obj, "pharmacy", None)
        if not pharmacy:
            return None
        return pharmacy.name

    def get_community_group_name(self, obj):
        group = getattr(obj, "community_group", None)
        if not group:
            return None
        return group.name

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("is_deleted"):
            data["body"] = "This post has been deleted."
            data["attachments"] = []
        return data

    def get_tagged_members(self, obj):
        tagged = []
        for mention in obj.mentions.all():
            membership = mention.membership
            if not membership:
                continue
            user = getattr(membership, "user", None)
            full_name = ""
            if user:
                full_name = user.get_full_name().strip() or user.email or ""
            if not full_name:
                full_name = membership.display_name if hasattr(membership, "display_name") else ""
            tagged.append(
                {
                    "membership_id": membership.id,
                    "full_name": full_name or "(Unnamed)",
                    "email": user.email if user else None,
                    "role": membership.role,
                    "job_title": membership.job_title or "",
                }
            )
        return tagged


class HubPollOptionSerializer(serializers.ModelSerializer):
    percentage = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubPollOption
        fields = ["id", "label", "vote_count", "percentage", "position"]
        read_only_fields = ["id", "vote_count", "percentage", "position"]

    def get_percentage(self, obj):
        total = self.context.get("total_votes") or 0
        if total <= 0:
            return 0
        return round((obj.vote_count / total) * 100)


class HubPollSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    options = serializers.SerializerMethodField()
    option_labels = serializers.ListField(
        child=serializers.CharField(max_length=255),
        write_only=True,
        required=True,
        allow_empty=False,
    )
    total_votes = serializers.SerializerMethodField()
    has_voted = serializers.SerializerMethodField()
    selected_option_id = serializers.SerializerMethodField()
    platform_hub = serializers.CharField(read_only=True)
    scope_type = serializers.SerializerMethodField()
    scope_target_id = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    can_vote = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    comment_count = serializers.IntegerField(read_only=True)
    reaction_summary = serializers.JSONField(read_only=True)
    viewer_reaction = serializers.SerializerMethodField()
    recent_comments = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubPoll
        fields = [
            "id",
            "question",
            "pharmacy",
            "organization",
            "community_group",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "created_at",
            "updated_at",
            "closes_at",
            "is_closed",
            "options",
            "option_labels",
            "can_manage",
            "total_votes",
            "has_voted",
            "selected_option_id",
            "created_by",
            "can_vote",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
        ]
        read_only_fields = [
            "id",
            "pharmacy",
            "organization",
            "community_group",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "created_at",
            "updated_at",
            "closes_at",
            "is_closed",
            "options",
            "total_votes",
            "has_voted",
            "selected_option_id",
            "created_by",
            "can_vote",
            "can_manage",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance:
            field = self.fields.get("option_labels")
            if field:
                field.required = False
                field.allow_null = True
                field.allow_empty = True

    def validate_option_labels(self, value):
        normalized = [label.strip() for label in value if label and label.strip()]
        if len(normalized) < 2:
            raise serializers.ValidationError("Provide at least two poll options.")
        if len(normalized) > 5:
            raise serializers.ValidationError("You can specify up to five options.")
        return normalized

    def create(self, validated_data):
        option_labels = validated_data.pop("option_labels", [])
        poll = PharmacyHubPoll.objects.create(
            question=validated_data["question"],
            pharmacy=self.context.get("pharmacy"),
            organization=self.context.get("organization"),
            community_group=self.context.get("community_group"),
            platform_hub=self.context.get("platform_hub"),
            created_by=self.context.get("request_user"),
            created_by_membership=self.context.get("request_membership"),
        )
        options = [
            PharmacyHubPollOption(
                poll=poll,
                label=label,
                position=index,
            )
            for index, label in enumerate(option_labels)
        ]
        PharmacyHubPollOption.objects.bulk_create(options)
        poll.refresh_from_db()
        return poll

    def update(self, instance, validated_data):
        option_labels = validated_data.pop("option_labels", None)
        question = validated_data.get("question")
        if question is not None:
            instance.question = question
        with transaction.atomic():
            instance.save(update_fields=["question"])
            if option_labels is not None:
                PharmacyHubPollVote.objects.filter(poll=instance).delete()
                instance.options.all().delete()
                new_options = [
                    PharmacyHubPollOption(
                        poll=instance,
                        label=label,
                        position=index,
                    )
                    for index, label in enumerate(option_labels)
                ]
                PharmacyHubPollOption.objects.bulk_create(new_options)
        instance.refresh_from_db()
        return instance

    def get_scope_type(self, obj):
        if obj.platform_hub:
            return "platform"
        if obj.community_group_id:
            return "group"
        if obj.pharmacy_id:
            return "pharmacy"
        if obj.organization_id:
            return "organization"
        return None

    def get_scope_target_id(self, obj):
        if obj.platform_hub:
            return obj.platform_hub
        if obj.community_group_id:
            return obj.community_group_id
        if obj.pharmacy_id:
            return obj.pharmacy_id
        return obj.organization_id

    def get_total_votes(self, obj):
        total = getattr(obj, "_total_votes", None)
        if total is None:
            total = sum(option.vote_count for option in obj.options.all())
            obj._total_votes = total
        return total

    def get_options(self, obj):
        total = self.get_total_votes(obj)
        serializer = HubPollOptionSerializer(
            obj.options.all(),
            many=True,
            context={"total_votes": total},
        )
        return serializer.data

    def _get_membership(self):
        return self.context.get("request_membership")

    def get_has_voted(self, obj):
        membership = self._get_membership()
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        votes = getattr(obj, "_prefetched_votes", None)
        if membership:
            if votes is None:
                return obj.votes.filter(membership=membership).exists()
            return any(v.membership_id == membership.id for v in votes)
        if request_user and request_user.is_authenticated:
            if votes is None:
                return obj.votes.filter(user=request_user).exists()
            return any(v.user_id == request_user.id for v in votes)
        return False

    def get_selected_option_id(self, obj):
        membership = self._get_membership()
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        votes = getattr(obj, "_prefetched_votes", None)
        if membership:
            if votes is None:
                return (
                    obj.votes.filter(membership=membership)
                    .values_list("option_id", flat=True)
                    .first()
                )
            for vote in votes:
                if vote.membership_id == membership.id:
                    return vote.option_id
        elif request_user and request_user.is_authenticated:
            if votes is None:
                return (
                    obj.votes.filter(user=request_user)
                    .values_list("option_id", flat=True)
                    .first()
                )
            for vote in votes:
                if vote.user_id == request_user.id:
                    return vote.option_id
        return None

    def get_created_by(self, obj):
        return self.get_author(obj)

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "created_by_membership", None),
            getattr(obj, "created_by", None),
            self.context.get("request"),
        )

    def get_can_vote(self, obj):
        membership = self._get_membership()
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        return bool(membership or (request_user and request_user.is_authenticated)) and not obj.is_closed

    def get_can_manage(self, obj):
        membership = self._get_membership()
        is_creator = membership and getattr(obj, "created_by_membership_id", None) == membership.id
        has_admin = bool(self.context.get("has_admin_permissions") or self.context.get("has_group_admin_permissions"))
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        return bool(is_creator or has_admin or (request_user and obj.created_by_id == request_user.id))

    def get_viewer_reaction(self, obj):
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if not request_user or not request_user.is_authenticated:
            return None
        return (
            obj.reactions.filter(user=request_user)
            .values_list("reaction_type", flat=True)
            .first()
        )

    def get_recent_comments(self, obj):
        comments_qs = (
            obj.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
            .order_by("-created_at")[:2]
        )
        serializer = HubPollCommentSerializer(
            comments_qs,
            many=True,
            context=self.context,
        )
        return list(reversed(serializer.data))


class HubPollCommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    is_edited = serializers.BooleanField(read_only=True)
    original_body = serializers.CharField(read_only=True)
    edited_at = serializers.DateTimeField(source="last_edited_at", read_only=True)
    edited_by = serializers.SerializerMethodField()
    is_deleted = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubPollComment
        fields = [
            "id",
            "poll",
            "author",
            "body",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
        ]
        read_only_fields = [
            "id",
            "poll",
            "author",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
        ]

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "author_membership", None),
            getattr(obj, "author_user", None),
            self.context.get("request"),
        )

    def get_can_edit(self, obj):
        membership = self.context.get("request_membership")
        if membership and membership == obj.author_membership:
            return True
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if request_user and obj.author_user_id == request_user.id:
            return True
        return self.context.get("has_admin_permissions", False)

    def get_edited_by(self, obj):
        user = getattr(obj, "last_edited_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_is_deleted(self, obj):
        return obj.deleted_at is not None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("is_deleted"):
            data["body"] = "This comment has been deleted."
        return data


class HubReactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyHubReaction
        fields = ["reaction_type"]
