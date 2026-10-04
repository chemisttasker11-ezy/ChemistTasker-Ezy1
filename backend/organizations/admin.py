"""Django admin for the organizations app (moved from client_profile/admin.py)."""
from django.contrib import admin
from organizations.models import Chain, Organization, Pharmacy, PharmacyAdmin


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


@admin.register(Pharmacy)
class PharmacyModelAdmin(admin.ModelAdmin):
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
    )


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
