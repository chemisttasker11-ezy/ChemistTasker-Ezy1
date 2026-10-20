"""Django admin for the onboarding app (moved from client_profile/admin.py)."""
from django import forms
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.db import transaction
from onboarding.verification.ahpra_numbers import _user_numbers
from onboarding.verification.ahpra_numbers import ahpra_number_owner_conflict, normalize, sync_ahpra_registrations
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, OwnerOnboarding, PharmacistOnboarding, RefereeResponse
from onboarding.models import AhpraCheck
from django.utils import timezone
from django.utils.html import format_html
import json


@admin.register(AhpraCheck)
class AhpraCheckAdmin(admin.ModelAdmin):
    list_display = ('number', 'profile', 'reason', 'stage', 'status', 'needs_attention', 'outcome', 'created_at', 'completed_at')
    list_filter = ('status', 'stage', 'needs_attention', 'outcome', 'reason')
    readonly_fields = tuple(f.name for f in AhpraCheck._meta.fields if f.name != 'register_data') + ('register_rendering', 'open_register')
    exclude = ('register_data',)
    actions = ('mark_verified', 'mark_rejected')

    def has_add_permission(self, request):
        return False

    @admin.display(description='Number')
    def number(self, obj):
        return obj.registration_number

    @admin.display(description='Profile')
    def profile(self, obj):
        from onboarding.verification.desktop import PROFILE_MODELS
        if obj.model_name not in PROFILE_MODELS:
            return obj.model_name
        from django.urls import reverse
        return format_html('<a href="{}">{} #{}</a>', reverse(
            f'admin:client_profile_{obj.model_name.lower()}_change', args=[obj.object_pk]), obj.model_name, obj.object_pk)

    def register_rendering(self, obj):
        return format_html('<pre>{}</pre>', json.dumps(obj.register_data, indent=2))

    def open_register(self, obj):
        return format_html('<a href="{}">Open AHPRA register</a>',
                           'https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx')

    def _mark(self, request, queryset, verified):
        from onboarding.verification.desktop import check_profile
        from onboarding.verification.ahpra import _update_ahpra_fields
        from onboarding.verification.ahpra_numbers import full_registration_number
        with transaction.atomic():
            for check in queryset.select_for_update():
                profile = check_profile(check)
                if profile is None or full_registration_number(profile.ahpra_number) != check.registration_number:
                    continue
                from onboarding.verification.state import ahpra_state, apply_state_transition
                previous = ahpra_state(profile)
                note = f'Manually {"verified" if verified else "rejected"} by {request.user}'
                _update_ahpra_fields(check.model_name, check.object_pk, verified, note)
                check.outcome = 'verified' if verified else 'rejected'
                check.status, check.note = 'done', note
                check.needs_attention = False
                check.reviewed_by = request.user
                check.reviewed_at = check.completed_at = timezone.now()
                check.save()
                apply_state_transition(profile, previous)

    @admin.action(description='Mark verified')
    def mark_verified(self, request, queryset):
        self._mark(request, queryset, True)

    @admin.action(description='Mark rejected')
    def mark_rejected(self, request, queryset):
        self._mark(request, queryset, False)


class RoleScopedOnboardingAdminMixin:
    user_role = None

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        if not self.user_role:
            return queryset
        return queryset.filter(user__role=self.user_role)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "user" and self.user_role:
            kwargs["queryset"] = db_field.remote_field.model.objects.filter(role=self.user_role)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


class AhpraOwnershipAdminMixin:
    """Support corrections keep the AHPRA owner registry in step (one person per number): the form refuses a number
    another account holds, and the save claims and releases numbers in the same transaction."""

    def get_form(self, request, obj=None, **kwargs):
        form_class = super().get_form(request, obj, **kwargs)

        class AhpraOwnershipForm(form_class):
            def clean(self):
                cleaned = super().clean()
                user = cleaned.get('user') or getattr(self.instance, 'user', None)
                if user is None or 'ahpra_number' not in cleaned:
                    return cleaned
                new_number = normalize(cleaned.get('ahpra_number'))
                # Read the persisted identity rather than mutable form.instance:
                # a profile cannot be silently transferred to a different account.
                old = (
                    type(self.instance).objects.filter(pk=self.instance.pk)
                    .values('user_id', 'ahpra_number').first()
                    if self.instance.pk else None
                )
                old_number = normalize(old['ahpra_number']) if old else ''
                user_changed = old is not None and old['user_id'] != user.pk
                if user_changed and (old_number or new_number):
                    self.add_error('user', 'A profile with an AHPRA number cannot be reassigned to another account.')
                elif (old is None or user_changed or old_number != new_number) and ahpra_number_owner_conflict(user.pk, new_number):
                    # Historical duplicate holders can edit without claiming anything new.
                    self.add_error('ahpra_number', 'This AHPRA number belongs to another account.')
                return cleaned

        return AhpraOwnershipForm

    def save_model(self, request, obj, form, change):
        with transaction.atomic():
            # This snapshot must precede saving. Merely checking the current
            # profile after save cannot tell a new claim from a legacy duplicate.
            earlier = (
                type(obj).objects.filter(pk=obj.pk).values('user_id', 'ahpra_number').first()
                if obj.pk else None
            )
            if earlier and earlier['user_id'] != obj.user_id and (
                normalize(earlier['ahpra_number']) or normalize(obj.ahpra_number)
            ):
                raise ValidationError({'user': 'A profile with an AHPRA number cannot be reassigned to another account.'})
            grandfathered_numbers = _user_numbers(obj.user_id)
            super().save_model(request, obj, form, change)
            sync_ahpra_registrations(obj.user_id, grandfathered_numbers=grandfathered_numbers)


class OwnerOnboardingAdminForm(forms.ModelForm):
    phone_number = forms.CharField(required=False)

    class Meta:
        model = OwnerOnboarding
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["phone_number"].help_text = "Uses the linked user's mobile number."
        user = getattr(self.instance, "user", None)
        if user and getattr(user, "mobile_number", None):
            self.fields["phone_number"].initial = user.mobile_number
        elif self.instance and getattr(self.instance, "phone_number", None):
            self.fields["phone_number"].initial = self.instance.phone_number

    def save(self, commit=True):
        instance = super().save(commit=False)
        phone_number = self.cleaned_data.get("phone_number", "")
        user = getattr(instance, "user", None)

        if user:
            user.mobile_number = phone_number or None
            if commit:
                user.save(update_fields=["mobile_number"])

        instance.phone_number = phone_number or (getattr(user, "mobile_number", None) or "")

        if commit:
            instance.save()
            self.save_m2m()

        return instance

    def clean_phone_number(self):
        phone_number = (self.cleaned_data.get("phone_number") or "").strip()
        user = getattr(self.instance, "user", None)
        return phone_number or getattr(user, "mobile_number", None) or getattr(self.instance, "phone_number", None) or ""

    def clean(self):
        cleaned_data = super().clean()
        phone_number = cleaned_data.get("phone_number")
        if not phone_number:
            raise ValidationError({
                "phone_number": "This user does not have a saved mobile number yet. Verify or enter the mobile number first."
            })
        return cleaned_data


@admin.register(OwnerOnboarding)
class OwnerOnboardingAdmin(AhpraOwnershipAdminMixin, RoleScopedOnboardingAdminMixin, admin.ModelAdmin):
    user_role = "OWNER"
    form = OwnerOnboardingAdminForm
    list_display = [
        'user', 'role', 'chain_pharmacy', 'number_of_pharmacies', 'verified',
        'submitted_for_verification', 'organization', 'gov_id_verified', 'ahpra_verified', 'ahpra_verification_note',
        'ahpra_first_registration_date', 'ahpra_years_since_first_registration'
    ]
    list_filter = [
        'role', 'chain_pharmacy', 'verified', 'gov_id_verified', 'submitted_for_verification',
        'organization',
    ]
    search_fields = [
        'user__username', 'user__email',
        'phone_number', 'organization__name'
    ]
    fields = [
        'user', 'phone_number', 'role', 'chain_pharmacy', 'number_of_pharmacies',
        'ahpra_number', 'ahpra_first_registration_date', 'ahpra_years_since_first_registration',
        'ahpra_verified', 'verified', 'submitted_for_verification', 'organization',
        'government_id_type', 'government_id', 'identity_secondary_file',
        'identity_meta', 'gov_id_verified', 'gov_id_verification_note',
    ]
    readonly_fields = ['ahpra_years_since_first_registration']

    @admin.display(description="Years since first registration")
    def ahpra_years_since_first_registration(self, obj):
        return obj.ahpra_years_since_first_registration
    def save_model(self, request, obj, form, change):
        obj.phone_number = (
            form.cleaned_data.get("phone_number")
            or getattr(obj.user, "mobile_number", None)
            or obj.phone_number
        )
        obj.full_clean()
        super().save_model(request, obj, form, change)


@admin.register(PharmacistOnboarding)
class PharmacistOnboardingAdmin(AhpraOwnershipAdminMixin, RoleScopedOnboardingAdminMixin, admin.ModelAdmin):
    user_role = "PHARMACIST"
    list_display = [
        'user', 'payment_preference', 'verified', 'member_of_chain',
        'referee1_confirmed', 'referee2_confirmed', 'submitted_for_verification','gov_id_verified',
            # Verification files
            # 'gst_file_verified',
            # 'tfn_declaration_verified',
            'abn_verified',
            'tfn_number',
            'ahpra_verified',
            'ahpra_registration_status',
            'ahpra_registration_type',
            'ahpra_expiry_date',
            'ahpra_first_registration_date',
            'ahpra_years_since_first_registration',
            'ahpra_verification_note',
    ]
    list_filter  = ['verified', 'member_of_chain', 'payment_preference']
    search_fields = [
        'user__username', 'user__email', 'user__first_name', 'user__last_name', 'ahpra_number'
    ]
    fields = [
        'user',
        'government_id', 'ahpra_number', 'ahpra_first_registration_date', 'ahpra_years_since_first_registration', 'short_bio', 'resume',
        'skills', 'skill_certificates', 'payment_preference',
        'abn', 'gst_registered', 'super_fund_name', 'super_usi', 'super_member_number',
        # Referee 1
        'referee1_name', 'referee1_relation', 'referee1_email', 'referee1_confirmed',
        # Referee 2
        'referee2_name', 'referee2_relation', 'referee2_email', 'referee2_confirmed',
        'rate_preference',
        'submitted_for_verification',
        'verified',
        'member_of_chain',
        'ahpra_verified',
    ]
    readonly_fields = ['ahpra_years_since_first_registration']

    @admin.display(description="Years since first registration")
    def ahpra_years_since_first_registration(self, obj):
        return obj.ahpra_years_since_first_registration
    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)


@admin.register(OtherStaffOnboarding)
class OtherStaffOnboardingAdmin(AhpraOwnershipAdminMixin, RoleScopedOnboardingAdminMixin, admin.ModelAdmin):
    user_role = "OTHER_STAFF"
    list_display = [
        'user', 'role_type', 'classification_level', 'student_year',
        'intern_half', 'payment_preference', 'verified',
        'referee1_confirmed', 'referee2_confirmed', 'submitted_for_verification',

            'gov_id_verified',
            'ahpra_proof_verified',
            'hours_proof_verified',
            'certificate_verified',
            'university_id_verified',
            'cpr_certificate_verified',
            's8_certificate_verified',
            'abn_verified',

    ]
    list_filter = [
        'verified', 'payment_preference', 'role_type',
        'classification_level', 'student_year', 'intern_half'
    ]
    search_fields = [
        'user__username', 'user__email', 'user__first_name', 'user__last_name', 'role_type'
    ]
    fields = [
        'user', 'government_id', 'role_type', 'skills', 'skill_certificates', 'years_experience',
        'payment_preference', 'classification_level', 'student_year', 'intern_half',
        'ahpra_number', 'ahpra_verified', 'ahpra_verification_note',
        'ahpra_proof', 'hours_proof', 'certificate', 'university_id',
        'dispensary_qualification', 'dispensary_qualification_verified', 'dispensary_qualification_verification_note',
        'cpr_certificate', 's8_certificate',
        'abn', 'gst_registered', 'tfn_number',
        'super_fund_name', 'super_usi', 'super_member_number',
        # Referee 1
        'referee1_name', 'referee1_relation', 'referee1_email', 'referee1_confirmed',
        # Referee 2
        'referee2_name', 'referee2_relation', 'referee2_email', 'referee2_confirmed',
        'short_bio', 'resume',
        'submitted_for_verification',
        'verified',
    ]
    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)


@admin.register(ExplorerOnboarding)
class ExplorerOnboardingAdmin(RoleScopedOnboardingAdminMixin, admin.ModelAdmin):
    user_role = "EXPLORER"
    list_display = [
        'user', 'role_type', 'verified', 'gov_id_verified',
        'referee1_confirmed', 'referee2_confirmed', 'submitted_for_verification'
    ]
    list_filter  = ['verified', 'role_type']
    search_fields = [
        'user__username', 'user__email', 'user__first_name', 'user__last_name', 'role_type'
    ]
    fields = [
        'user', 'government_id', 'role_type', 'interests',
        # Referee 1
        'referee1_name', 'referee1_relation', 'referee1_email', 'referee1_confirmed',
        # Referee 2
        'referee2_name', 'referee2_relation', 'referee2_email', 'referee2_confirmed',
        'short_bio', 'resume',
        'submitted_for_verification',
        'verified',
    ]
    def save_model(self, request, obj, form, change):
        obj.full_clean()
        super().save_model(request, obj, form, change)


admin.site.register(RefereeResponse)
