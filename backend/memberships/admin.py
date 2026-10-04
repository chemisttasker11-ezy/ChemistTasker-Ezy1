"""Django admin for the memberships app (moved from client_profile/admin.py)."""
from django.contrib import admin
from memberships.models import Membership, MembershipApplication


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = (
        'user',
        'pharmacy',
        'is_active',
        'created_at',
        'updated_at',
    )
    list_filter = ('is_active', 'pharmacy')
    search_fields = ('user__email', 'pharmacy__name')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        (None, {
            'fields': ('user', 'pharmacy', 'is_active'),
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
        }),
    )


admin.site.register(MembershipApplication)
