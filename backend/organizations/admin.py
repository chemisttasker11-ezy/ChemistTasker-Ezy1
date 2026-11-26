"""Django admin for the organizations app (moved from client_profile/admin.py)."""
from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.db import transaction
from organizations.feature_port import pharmacy_features
from organizations.models import Chain, Organization, Pharmacy, PharmacyAdmin
from organizations.pharmacy_profile import record_marketplace_review, validate_marketplace_review


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display  = ['id', 'name']
    search_fields = ['name']
    def save_model(self, request, obj, form, change):
        obj.full_clean()  # Enforces model-level validation (e.g. PHARMACIST only)
        super().save_model(request, obj, form, change)


@admin.register(Chain)
class ChainAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'owner',
        'organization',
        'primary_contact_email',
        'is_active',
        'created_at',
        'updated_at',
    )
    list_filter = (
        'is_active',
        'owner',
        'organization',
    )
    search_fields = (
        'name',
        'primary_contact_email',
        'owner__user__email',
        'organization__name',
    )
    readonly_fields = ('created_at', 'updated_at')
    filter_horizontal = ('pharmacies',)
    raw_id_fields = ('owner',)   # ← makes owner searchable by ID/email
    fieldsets = (
        (None, {
            'fields': (
                'name',
                'logo',
                'primary_contact_email',
                'subscription_plan',
                'pharmacies',
                'is_active',
            )
        }),
        ('Ownership', {
            'fields': ('owner', 'organization'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
        }),
    )


class PharmacyMarketplaceReviewForm(forms.ModelForm):
    class Meta:
        model = Pharmacy
        fields = "__all__"

    def clean(self):
        data = super().clean()
        if "marketplace_review_status" in self.changed_data:
            if self.instance.marketplace_review_status and not data.get("marketplace_review_status"):
                raise ValidationError("Choose a review decision to change the existing decision.")
            validate_marketplace_review(self.instance, data)
        return data


@admin.register(Pharmacy)
class PharmacyModelAdmin(admin.ModelAdmin):
    form = PharmacyMarketplaceReviewForm
    readonly_fields = ("verified", "marketplace_reviewed_by", "marketplace_reviewed_at")
    list_display = (
        'name',
        'owner',
        'organization',
        'verified',
        'abn',
        'state',
        'email',
    )
    list_filter = (
        'verified',
        'owner',
        'organization',
        'state',
        'email',
    )
    search_fields = (
        'name',
        'owner__user__email',
        'organization__name',
        'state',
    )
    fieldsets = (
        (None, {
            'fields': (
                'name',
                'state',
                'owner',
                'organization',
                'verified',
                'abn',
                'email',
            ),
        }),
        ("Marketplace review", {
            "fields": (
                "marketplace_approval_number", "marketplace_business_phone", "marketplace_review_status",
                "marketplace_review_note", "marketplace_reviewed_by", "marketplace_reviewed_at",
            ),
        }),
    )

    @transaction.atomic
    def save_model(self, request, obj, form, change):
        if change:
            pharmacy = Pharmacy.objects.select_for_update(no_key=True).get(pk=obj.pk)
            pharmacy_features().preserve_pharmacy_bookings(pharmacy, form.cleaned_data)
        if "marketplace_review_status" in form.changed_data:
            record_marketplace_review(obj, request.user)
        super().save_model(request, obj, form, change)


@admin.register(PharmacyAdmin)
class PharmacyAdminAssignmentAdmin(admin.ModelAdmin):
    list_display = (
        'user',
        'pharmacy',
        'admin_level',
        'staff_role',
        'is_active',
        'created_by',
        'created_at',
    )
    list_filter = ('admin_level', 'staff_role', 'is_active', 'pharmacy')
    search_fields = ('user__email', 'user__username', 'pharmacy__name')
    autocomplete_fields = ('user', 'pharmacy', 'membership', 'created_by')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        (None, {
            'fields': (
                'user',
                'pharmacy',
                'membership',
                'admin_level',
                'staff_role',
                'job_title',
                'is_active',
            ),
        }),
        ('Audit', {
            'fields': ('created_by', 'created_at', 'updated_at'),
        }),
    )
