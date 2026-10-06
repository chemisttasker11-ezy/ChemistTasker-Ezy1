"""pharmacy_hub: cohesive posts serializers."""
from rest_framework import serializers
from memberships.models import Membership
from pharmacy_hub.models import PharmacyCommunityGroupMembership, PharmacyHubAttachment, PharmacyHubComment, PharmacyHubPost, PharmacyHubPostMention
from django.db.models import Q
from users.presentation import _build_absolute_media_url
from .common import _serialize_hub_author, _serialize_user_summary


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
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if not request_user or not request_user.is_authenticated:
            return None
        return (
            obj.reactions.filter(
                Q(user_id=request_user.id) | Q(member__user_id=request_user.id)
            )
            .order_by("id")
            .values_list("reaction_type", flat=True)
            .first()
        )

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
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if not request_user or not request_user.is_authenticated:
            return None
        return (
            obj.reactions.filter(
                Q(user_id=request_user.id) | Q(member__user_id=request_user.id)
            )
            .order_by("id")
            .values_list("reaction_type", flat=True)
            .first()
        )

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
                full_name = user.get_full_name().strip()
            if not full_name:
                full_name = membership.display_name if hasattr(membership, "display_name") else ""
            tagged.append(
                {
                    "membership_id": membership.id,
                    "full_name": full_name or "(Unnamed)",
                    "role": membership.role,
                    "job_title": membership.job_title or "",
                }
            )
        return tagged
