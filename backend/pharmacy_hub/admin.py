"""Django admin for the pharmacy_hub app (moved from client_profile/admin.py)."""
from django.contrib import admin
from pharmacy_hub.models import PharmacyHubComment, PharmacyHubPost


@admin.register(PharmacyHubPost)
class PharmacyHubPostAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "scope_display",
        "author_membership",
        "visibility",
        "comment_count",
        "created_at",
        "is_pinned",
    )
    list_filter = ("visibility", "is_pinned", "pharmacy", "organization", "community_group")
    search_fields = (
        "body",
        "author_membership__user__email",
        "pharmacy__name",
        "organization__name",
    )
    readonly_fields = ("comment_count", "reaction_summary", "created_at", "updated_at")
    fieldsets = (
        (
            "Scope",
            {
                "fields": (
                    "pharmacy",
                    "organization",
                    "community_group",
                )
            },
        ),
        (
            "Content",
            {
                "fields": (
                    "author_membership",
                    "body",
                    "visibility",
                    "allow_comments",
                )
            },
        ),
        (
            "Status",
            {
                "fields": (
                    "is_pinned",
                    "pinned_at",
                    "pinned_by",
                    "comment_count",
                    "reaction_summary",
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )
    def scope_display(self, obj):
        if obj.community_group:
            return f"Group: {obj.community_group}"
        if obj.pharmacy:
            return f"Pharmacy: {obj.pharmacy}"
        if obj.organization:
            return f"Organization: {obj.organization}"
        return "Unknown"

    scope_display.short_description = "Scope"


@admin.register(PharmacyHubComment)
class PharmacyHubCommentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "post",
        "author_membership",
        "parent_comment",
        "created_at",
        "deleted_flag",
    )
    list_filter = ("deleted_at", "post__pharmacy", "post__organization", "post__community_group")
    search_fields = ("body", "author_membership__user__email", "post__body")
    readonly_fields = ("created_at", "updated_at")

    def deleted_flag(self, obj):
        return bool(obj.deleted_at)

    deleted_flag.boolean = True
    deleted_flag.short_description = "Deleted"
