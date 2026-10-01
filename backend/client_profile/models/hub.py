"""client_profile models: hub (split verbatim from client_profile/models.py)."""
from django.db import models
from django.db.models import Q
from django.conf import settings
from django.core.exceptions import ValidationError
from django.utils import timezone
from client_profile.models.common import hub_attachment_upload_path
from client_profile.models.memberships import Membership


# PharmacyHub
class PharmacyCommunityGroup(models.Model):
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="community_groups",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_community_groups",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["pharmacy", "name"],
                name="uniq_group_name_per_pharmacy",
            )
        ]
        indexes = [
            models.Index(fields=["pharmacy", "name"]),
            models.Index(fields=["pharmacy", "created_at"]),
        ]

    def __str__(self):
        return f"CommunityGroup#{self.pk} pharmacy={self.pharmacy_id} name={self.name}"


class PharmacyCommunityGroupMembership(models.Model):
    group = models.ForeignKey(
        PharmacyCommunityGroup,
        on_delete=models.CASCADE,
        related_name="memberships",
    )
    membership = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="community_group_memberships",
    )
    is_admin = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("group", "membership")
        indexes = [
            models.Index(fields=["group"]),
            models.Index(fields=["membership"]),
        ]

    def clean(self):
        super().clean()
        if (
            self.membership
            and self.membership.pharmacy_id
            and self.group
            and self.group.pharmacy_id
        ):
            member_pharmacy = self.membership.pharmacy
            group_pharmacy = self.group.pharmacy
            if not member_pharmacy or not group_pharmacy:
                return
            if self.membership.pharmacy_id == self.group.pharmacy_id:
                return
            same_owner = False
            same_org = False
            if getattr(member_pharmacy, "owner_id", None) and getattr(
                group_pharmacy, "owner_id", None
            ):
                same_owner = member_pharmacy.owner_id == group_pharmacy.owner_id
            if getattr(member_pharmacy, "organization_id", None) and getattr(
                group_pharmacy, "organization_id", None
            ):
                same_org = (
                    member_pharmacy.organization_id
                    == group_pharmacy.organization_id
                )
            if not (same_owner or same_org):
                raise ValidationError(
                    "Membership must belong to the same owner or organization as the community group."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"CommunityGroupMembership#{self.pk} group={self.group_id} membership={self.membership_id}"


class PharmacyHubPost(models.Model):
    class Visibility(models.TextChoices):
        NORMAL = "NORMAL", "Normal"
        ANNOUNCEMENT = "ANNOUNCEMENT", "Announcement"

    class PlatformHub(models.TextChoices):
        PUBLIC = "public", "Public Hub"
        OWNER = "owner", "Owner Hub"
        PHARMACIST = "pharmacist", "Pharmacists Hub"
        INTERN = "intern", "Interns Hub"
        STAFF = "staff", "Staff Hub"
        EXPLORER = "explorer", "Explorer Hub"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="hub_posts",
        null=True,
        blank=True,
    )
    author_membership = models.ForeignKey(Membership, on_delete=models.SET_NULL, null=True, blank=True)
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pharmacy_hub_posts",
    )

    body = models.TextField()
    visibility = models.CharField(
        max_length=16,
        choices=Visibility.choices,
        default=Visibility.NORMAL,
    )
    community_group = models.ForeignKey(
        'client_profile.PharmacyCommunityGroup',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='hub_posts'
    )

    allow_comments = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    organization = models.ForeignKey(
        "client_profile.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_posts",
    )
    platform_hub = models.CharField(
        max_length=32,
        choices=PlatformHub.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    is_pinned = models.BooleanField(default=False)
    pinned_at = models.DateTimeField(null=True, blank=True)
    pinned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pinned_pharmacy_hub_posts",
    )
    tagged_members = models.ManyToManyField(
        Membership,
        through="PharmacyHubPostMention",
        related_name="tagged_pharmacy_hub_posts",
        blank=True,
    )

    comment_count = models.PositiveIntegerField(default=0)
    reaction_summary = models.JSONField(default=dict, blank=True)
    original_body = models.TextField(blank=True, default="")
    is_edited = models.BooleanField(default=False)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_pharmacy_hub_posts",
    )

    class Meta:
        db_table = "client_profile_pharmacyhubpost"
        ordering = ["-is_pinned", "-pinned_at", "-created_at"]
        indexes = [
            models.Index(fields=["pharmacy", "created_at"]),
            models.Index(fields=["author_membership"]),
            models.Index(fields=["author_user"]),
            models.Index(fields=["is_pinned", "pinned_at"]),
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["community_group", "created_at"]),
            models.Index(fields=["platform_hub", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(
                        platform_hub__isnull=False,
                        pharmacy__isnull=True,
                        organization__isnull=True,
                        community_group__isnull=True,
                    )
                    | Q(
                        community_group__isnull=False,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=True,
                        organization__isnull=False,
                        platform_hub__isnull=True,
                    )
                ),
                name="pharmacy_hub_post_scope_check",
            )
        ]

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")

        if self.platform_hub:
            self.pharmacy_id = None
            self.organization_id = None
            self.community_group_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "community_group"})
                kwargs["update_fields"] = list(fields)
        elif self.pharmacy_id and not self.organization_id:
            self.organization_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.add("organization")
                kwargs["update_fields"] = list(fields)
        elif self.organization_id and not self.pharmacy_id:
            self.pharmacy_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.add("pharmacy")
                kwargs["update_fields"] = list(fields)

        if self.community_group_id:
            group_pharmacy_id = self.community_group.pharmacy_id
            if not group_pharmacy_id:
                raise ValidationError("Community group must be linked to a pharmacy.")
            self.pharmacy_id = group_pharmacy_id
            self.organization_id = None
            self.platform_hub = None
            update_fields = kwargs.get("update_fields")
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "platform_hub"})
                kwargs["update_fields"] = list(fields)
        super().save(*args, **kwargs)

    def soft_delete(self):
        if self.deleted_at:
            return
        attachments = list(self.attachments.all())
        for attachment in attachments:
            try:
                if attachment.file:
                    attachment.file.delete(save=False)
            except Exception:
                pass
            attachment.delete()
        self.deleted_at = timezone.now()
        self.is_pinned = False
        self.pinned_at = None
        self.pinned_by = None
        self.save(update_fields=["deleted_at", "is_pinned", "pinned_at", "pinned_by"])

    def recompute_comment_count(self):
        from django.db.models import Count

        total = (
            self.comments.filter(deleted_at__isnull=True)
            .aggregate(total=Count("id"))
            .get("total", 0)
        )
        if total != self.comment_count:
            self.comment_count = total
            self.save(update_fields=["comment_count"])

    def recompute_reaction_summary(self):
        from django.db.models import Count

        summary = {
            row["reaction_type"]: row["total"]
            for row in self.reactions.values("reaction_type")
            .order_by()
            .annotate(total=Count("id"))
        }
        if summary != self.reaction_summary:
            self.reaction_summary = summary
            self.save(update_fields=["reaction_summary"])


class PharmacyHubPostMention(models.Model):
    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="mentions",
    )
    membership = models.ForeignKey(
        Membership,
        on_delete=models.CASCADE,
        related_name="hub_post_mentions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "client_profile_pharmacyhubpostmention"
        unique_together = ("post", "membership")

    def __str__(self):
        return f"HubPostMention#{self.pk} post={self.post_id} membership={self.membership_id}"


class PharmacyHubComment(models.Model):
    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author_membership = models.ForeignKey(Membership, on_delete=models.SET_NULL, null=True, blank=True)
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hub_comments",
    )

    body = models.TextField()
    reaction_summary = models.JSONField(default=dict, blank=True)
    parent_comment = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="replies",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    original_body = models.TextField(blank=True, default="")
    is_edited = models.BooleanField(default=False)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_pharmacy_hub_comments",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["post", "created_at"]),
            models.Index(fields=["author_membership"]),
            models.Index(fields=["author_user"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(author_membership__isnull=False) | Q(author_user__isnull=False),
                name="hub_comment_has_author_membership_or_user",
            )
        ]

    def soft_delete(self):
        if not self.deleted_at:
            self.deleted_at = timezone.now()
            self.save(update_fields=["deleted_at"])

    def recompute_reaction_summary(self):
        from django.db.models import Count

        summary = {
            row["reaction_type"]: row["total"]
            for row in self.reactions.values("reaction_type")
            .order_by()
            .annotate(total=Count("id"))
        }
        if summary != self.reaction_summary:
            self.reaction_summary = summary
            self.save(update_fields=["reaction_summary"])

    def __str__(self):
        return f"HubComment#{self.pk} post={self.post_id}"


class HubReactionType(models.TextChoices):
    LIKE = "LIKE", "Like"
    CELEBRATE = "CELEBRATE", "Celebrate"
    SUPPORT = "SUPPORT", "Support"
    INSIGHTFUL = "INSIGHTFUL", "Insightful"
    LOVE = "LOVE", "Love"


class PharmacyHubCommentReaction(models.Model):
    comment = models.ForeignKey(
        PharmacyHubComment,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    member = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="hub_comment_reactions",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_comment_reactions",
        null=True,
        blank=True,
    )
    reaction_type = models.CharField(
        max_length=16,
        choices=HubReactionType.choices,
        default=HubReactionType.LIKE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["comment", "member"],
                condition=Q(member__isnull=False),
                name="unique_hub_comment_reaction_member",
            ),
            models.UniqueConstraint(
                fields=["comment", "user"],
                condition=Q(user__isnull=False),
                name="unique_hub_comment_reaction_user",
            ),
            models.CheckConstraint(
                check=(
                    (Q(member__isnull=False) & Q(user__isnull=True))
                    | (Q(member__isnull=True) & Q(user__isnull=False))
                ),
                name="hub_comment_reaction_member_xor_user",
            ),
        ]
        indexes = [
            models.Index(fields=["comment"]),
            models.Index(fields=["member"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return (
            f"HubCommentReaction#{self.pk} comment={self.comment_id} member={self.member_id}"
        )


class PharmacyHubReaction(models.Model):
    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    member = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="hub_reactions",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_reactions",
        null=True,
        blank=True,
    )
    reaction_type = models.CharField(
        max_length=16,
        choices=HubReactionType.choices,
        default=HubReactionType.LIKE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["post", "member"],
                condition=Q(member__isnull=False),
                name="unique_hub_post_reaction_member",
            ),
            models.UniqueConstraint(
                fields=["post", "user"],
                condition=Q(user__isnull=False),
                name="unique_hub_post_reaction_user",
            ),
            models.CheckConstraint(
                check=(
                    (Q(member__isnull=False) & Q(user__isnull=True))
                    | (Q(member__isnull=True) & Q(user__isnull=False))
                ),
                name="hub_post_reaction_member_xor_user",
            ),
        ]
        indexes = [
            models.Index(fields=["post"]),
            models.Index(fields=["member"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"HubReaction#{self.pk} post={self.post_id} member={self.member_id}"


class PharmacyHubAttachment(models.Model):
    class Kind(models.TextChoices):
        IMAGE = "IMAGE", "Image"
        GIF = "GIF", "GIF"
        FILE = "FILE", "File"

    post = models.ForeignKey(
        PharmacyHubPost,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to=hub_attachment_upload_path)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.FILE)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["post"]),
            models.Index(fields=["kind"]),
        ]

    def __str__(self):
        return f"Attachment#{self.pk} for post={self.post_id}"


class PharmacyHubPoll(models.Model):
    class PlatformHub(models.TextChoices):
        PUBLIC = "public", "Public Hub"
        OWNER = "owner", "Owner Hub"
        PHARMACIST = "pharmacist", "Pharmacists Hub"
        INTERN = "intern", "Interns Hub"
        STAFF = "staff", "Staff Hub"
        EXPLORER = "explorer", "Explorer Hub"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_polls",
    )
    organization = models.ForeignKey(
        "client_profile.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_polls",
    )
    community_group = models.ForeignKey(
        PharmacyCommunityGroup,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="hub_polls",
    )
    platform_hub = models.CharField(
        max_length=32,
        choices=PlatformHub.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    question = models.CharField(max_length=500)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_hub_polls",
    )
    created_by_membership = models.ForeignKey(
        Membership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_hub_polls",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    closes_at = models.DateTimeField(null=True, blank=True)
    is_closed = models.BooleanField(default=False)
    comment_count = models.PositiveIntegerField(default=0)
    reaction_summary = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["pharmacy", "created_at"]),
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["community_group", "created_at"]),
            models.Index(fields=["platform_hub", "created_at"]),
            models.Index(fields=["is_closed", "closes_at"]),
            models.Index(fields=["created_by"]),
            models.Index(fields=["created_by_membership"]),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(
                        platform_hub__isnull=False,
                        pharmacy__isnull=True,
                        organization__isnull=True,
                        community_group__isnull=True,
                    )
                    | Q(
                        community_group__isnull=False,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=False,
                        organization__isnull=True,
                        platform_hub__isnull=True,
                    )
                    | Q(
                        community_group__isnull=True,
                        pharmacy__isnull=True,
                        organization__isnull=False,
                        platform_hub__isnull=True,
                    )
                ),
                name="pharmacy_hub_poll_scope_check",
            )
        ]

    def save(self, *args, **kwargs):
        update_fields = kwargs.get("update_fields")
        if self.platform_hub:
            self.pharmacy_id = None
            self.organization_id = None
            self.community_group_id = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "community_group"})
                kwargs["update_fields"] = list(fields)
        elif self.community_group_id:
            group_pharmacy_id = self.community_group.pharmacy_id
            if not group_pharmacy_id:
                raise ValidationError("Community group must be linked to a pharmacy.")
            self.pharmacy_id = group_pharmacy_id
            self.organization_id = None
            self.platform_hub = None
            if update_fields is not None:
                fields = set(update_fields)
                fields.update({"pharmacy", "organization", "platform_hub"})
                kwargs["update_fields"] = list(fields)
        elif self.pharmacy_id and self.organization_id:
            # enforce constraint manually to keep validation errors clear
            raise ValidationError("Poll must target either a pharmacy or organization, not both.")
        super().save(*args, **kwargs)

    def __str__(self):
        if self.platform_hub:
            return f"HubPoll#{self.pk} platform={self.platform_hub}"
        if self.community_group_id:
            return f"HubPoll#{self.pk} group={self.community_group_id}"
        if self.pharmacy_id:
            return f"HubPoll#{self.pk} pharmacy={self.pharmacy_id}"
        return f"HubPoll#{self.pk} organization={self.organization_id}"

    def recompute_comment_count(self):
        from django.db.models import Count

        total = (
            self.comments.filter(deleted_at__isnull=True)
            .aggregate(total=Count("id"))
            .get("total", 0)
        )
        if total != self.comment_count:
            self.comment_count = total
            self.save(update_fields=["comment_count"])

    def recompute_reaction_summary(self):
        from django.db.models import Count

        summary = {
            row["reaction_type"]: row["total"]
            for row in self.reactions.values("reaction_type")
            .order_by()
            .annotate(total=Count("id"))
        }
        if summary != self.reaction_summary:
            self.reaction_summary = summary
            self.save(update_fields=["reaction_summary"])


class PharmacyHubPollOption(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="options",
    )
    label = models.CharField(max_length=255)
    vote_count = models.PositiveIntegerField(default=0)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        indexes = [
            models.Index(fields=["poll", "position"]),
        ]

    def __str__(self):
        return f"HubPollOption#{self.pk} poll={self.poll_id}"


class PharmacyHubPollVote(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    option = models.ForeignKey(
        PharmacyHubPollOption,
        on_delete=models.CASCADE,
        related_name="votes",
    )
    membership = models.ForeignKey(
        Membership,
        on_delete=models.CASCADE,
        related_name="hub_poll_votes",
        null=True,
        blank=True,
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_poll_votes",
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["poll", "membership"],
                condition=Q(membership__isnull=False),
                name="unique_hub_poll_vote_membership",
            ),
            models.UniqueConstraint(
                fields=["poll", "user"],
                condition=Q(user__isnull=False),
                name="unique_hub_poll_vote_user",
            ),
            models.CheckConstraint(
                check=(
                    (Q(membership__isnull=False) & Q(user__isnull=True))
                    | (Q(membership__isnull=True) & Q(user__isnull=False))
                ),
                name="hub_poll_vote_membership_xor_user",
            ),
        ]
        indexes = [
            models.Index(fields=["poll"]),
            models.Index(fields=["option"]),
            models.Index(fields=["membership"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"HubPollVote#{self.pk} poll={self.poll_id} option={self.option_id} membership={self.membership_id}"


class PharmacyHubPollComment(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    author_membership = models.ForeignKey(
        Membership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hub_poll_comments",
    )
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hub_poll_comments",
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    original_body = models.TextField(blank=True, default="")
    is_edited = models.BooleanField(default=False)
    last_edited_at = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="edited_pharmacy_hub_poll_comments",
    )

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["poll", "created_at"]),
            models.Index(fields=["author_membership"]),
            models.Index(fields=["author_user"]),
        ]

    def soft_delete(self):
        if not self.deleted_at:
            self.deleted_at = timezone.now()
            self.save(update_fields=["deleted_at"])

    def __str__(self):
        return f"HubPollComment#{self.pk} poll={self.poll_id}"


class PharmacyHubPollReaction(models.Model):
    poll = models.ForeignKey(
        PharmacyHubPoll,
        on_delete=models.CASCADE,
        related_name="reactions",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hub_poll_reactions",
    )
    reaction_type = models.CharField(
        max_length=16,
        choices=HubReactionType.choices,
        default=HubReactionType.LIKE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("poll", "user")
        indexes = [
            models.Index(fields=["poll"]),
            models.Index(fields=["user"]),
        ]

    def __str__(self):
        return f"HubPollReaction#{self.pk} poll={self.poll_id} user={self.user_id}"
