"""Django admin for the rewards app (moved from client_profile/admin.py)."""
from django.contrib import admin
from rewards.models import PillLedgerEntry, PillReferralCode, PillReferralEvent, PillRewardRule


@admin.register(PillRewardRule)
class PillRewardRuleAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "event_type", "audience", "pill_amount", "is_active", "starts_at", "ends_at")
    list_editable = ("pill_amount", "is_active")
    list_filter = ("event_type", "audience", "is_active")
    search_fields = ("code", "name", "description")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        ("Rule", {
            "fields": ("code", "name", "description"),
            "description": "Use readable codes such as friend-referral-login, shift-referral-login, and shift-post-cost.",
        }),
        ("Pill Rate", {
            "fields": ("event_type", "audience", "pill_amount", "is_active"),
            "description": "For earn rules this is how many pills are awarded. For spend rules this is how many pills are deducted.",
        }),
        ("Schedule", {
            "fields": ("starts_at", "ends_at", "metadata"),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at"),
        }),
    )
    actions = ("activate_rules", "deactivate_rules", "seed_default_rules")

    @admin.action(description="Activate selected reward rules")
    def activate_rules(self, request, queryset):
        queryset.update(is_active=True)

    @admin.action(description="Deactivate selected reward rules")
    def deactivate_rules(self, request, queryset):
        queryset.update(is_active=False)

    @admin.action(description="Create missing default pill reward rules")
    def seed_default_rules(self, request, queryset):
        from rewards.services import seed_default_reward_rules
        seed_default_reward_rules()


@admin.register(PillReferralCode)
class PillReferralCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "user", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("code", "user__email", "user__username")
    readonly_fields = ("created_at", "updated_at")


@admin.register(PillReferralEvent)
class PillReferralEventAdmin(admin.ModelAdmin):
    list_display = ("id", "referral_type", "status", "referrer", "referred_user", "referred_email", "shift", "created_at")
    list_filter = ("referral_type", "status", "created_at")
    search_fields = ("id", "referrer__email", "referred_user__email", "referred_email", "referral_code__code", "shift__id")
    readonly_fields = ("created_at", "updated_at", "claimed_at", "awarded_at", "metadata")
    autocomplete_fields = ("referrer", "referred_user", "referral_code", "shift")


@admin.register(PillLedgerEntry)
class PillLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "entry_type", "source", "delta", "balance_after", "rule", "created_at")
    list_filter = ("entry_type", "source", "created_at")
    search_fields = ("user__email", "description", "idempotency_key", "rule__code")
    readonly_fields = ("user", "rule", "referral_event", "shift", "entry_type", "source", "delta", "balance_after", "description", "idempotency_key", "metadata", "created_at")
    autocomplete_fields = ("user", "rule", "referral_event", "shift")
