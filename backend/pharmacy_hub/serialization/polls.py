"""pharmacy_hub: cohesive polls serializers."""
from rest_framework import serializers
from pharmacy_hub.models import PharmacyHubPoll, PharmacyHubPollComment, PharmacyHubPollOption, PharmacyHubPollVote
from django.db import transaction
from django.db.models import Q
from .common import _serialize_hub_author, _serialize_user_summary


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

    def _viewer_vote(self, obj):
        """Return this human viewer's vote regardless of its stored identity FK.

        Hub voters may be stored directly by User or indirectly by Membership.
        Treat both representations as the same person so gaining/losing a
        Membership cannot make an existing vote disappear from the response.
        """
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if not request_user or not request_user.is_authenticated:
            return None

        votes = getattr(obj, "_prefetched_votes", None)
        if votes is None:
            return (
                obj.votes.filter(
                    Q(user_id=request_user.id)
                    | Q(membership__user_id=request_user.id)
                )
                .select_related("membership")
                .order_by("id")
                .first()
            )

        for vote in votes:
            if vote.user_id == request_user.id:
                return vote
            if vote.membership_id and getattr(vote.membership, "user_id", None) == request_user.id:
                return vote
        return None

    def get_has_voted(self, obj):
        return self._viewer_vote(obj) is not None

    def get_selected_option_id(self, obj):
        vote = self._viewer_vote(obj)
        return vote.option_id if vote else None

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
