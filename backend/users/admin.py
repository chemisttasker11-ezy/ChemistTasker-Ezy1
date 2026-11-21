from django.contrib import admin
from django import forms
from access_control.admin_roles import validate_admin_user
from .models import User, OrganizationMembership, ContactMessage


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('id', 'email', 'username', 'role', 'is_active')
    list_filter = ('role', 'is_active')
    search_fields = ('email', 'username')
    ordering = ('-date_joined',)
    exclude = ('groups', 'user_permissions')


class OrganizationMembershipForm(forms.ModelForm):
    class Meta:
        model = OrganizationMembership
        fields = '__all__'

    def clean(self):
        cleaned = super().clean()
        user = cleaned.get('user')
        if user and 'pharmacies' in cleaned:
            validate_admin_user(user, assignment=self.instance, changes={
                **cleaned, 'pharmacies': cleaned['pharmacies'],
            })
        return cleaned


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    form = OrganizationMembershipForm
    list_display = ['user', 'organization', 'role', 'region']
    list_filter = ['role', 'organization']
    search_fields = ['user__email', 'organization__name']


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'subject', 'email', 'name', 'source', 'created_at')
    search_fields = ('subject', 'email', 'name', 'message')
    list_filter = ('source', 'created_at')
    readonly_fields = ('created_at',)


