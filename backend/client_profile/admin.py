from django.contrib import admin
from django import forms
from django.core.exceptions import ValidationError
from .models import (
    Chain,
    ExplorerOnboarding,
    Membership,
    MembershipApplication,
    Organization,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    Pharmacy,
    PharmacyAdmin,
    RefereeResponse,
    Shift,
    ShiftCounterOffer,
    ShiftCounterOfferSlot,
    ShiftInterest,
    ShiftOffer,
    ShiftRejection,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerShiftRequest,
)


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


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display  = ['id', 'name']
    search_fields = ['name']
    def save_model(self, request, obj, form, change):
        obj.full_clean()  # Enforces model-level validation (e.g. PHARMACIST only)
        super().save_model(request, obj, form, change)

@admin.register(OwnerOnboarding)
class OwnerOnboardingAdmin(RoleScopedOnboardingAdminMixin, admin.ModelAdmin):
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
class PharmacistOnboardingAdmin(RoleScopedOnboardingAdminMixin, admin.ModelAdmin):
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
        'skills',  'payment_preference',
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
class OtherStaffOnboardingAdmin(RoleScopedOnboardingAdminMixin, admin.ModelAdmin):
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
        'user', 'government_id', 'role_type', 'skills', 'years_experience',
        'payment_preference', 'classification_level', 'student_year', 'intern_half',
        'ahpra_proof', 'hours_proof', 'certificate', 'university_id',
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

class ShiftSlotInline(admin.TabularInline):
    model = ShiftSlot
    extra = 1

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    inlines = [ShiftSlotInline]
    list_display = [
        'id','pharmacy','role_needed','employment_type',
        'visibility','reveal_count','single_user_only','created_at', 'created_by'
    ]
    list_filter = [
        'role_needed','employment_type','single_user_only','visibility'
    ]
    search_fields = ['pharmacy__name','role_needed']


@admin.register(ShiftSlotAssignment)
class ShiftSlotAssignmentAdmin(admin.ModelAdmin):
    list_display = ('id','shift','slot','user','assigned_at')
    list_filter  = ('shift','user')
    search_fields = ('user__username','shift__pharmacy__name')

@admin.register(ShiftInterest)
class ShiftInterestAdmin(admin.ModelAdmin):
    list_display = ('id','shift','slot','user','revealed','expressed_at')
    list_filter  = ('revealed','slot','shift')
    search_fields = ('user__username','shift__pharmacy__name')

@admin.register(ShiftRejection)
class ShiftRejectionAdmin(admin.ModelAdmin):
    list_display = ('id','shift','slot','user','rejected_at')
    list_filter  = ('slot','shift')
    search_fields = ('user__username','shift__pharmacy__name')


admin.site.register(WorkerShiftRequest)

admin.site.register(RefereeResponse)

admin.site.register(MembershipApplication)


class ShiftCounterOfferSlotInline(admin.TabularInline):
    model = ShiftCounterOfferSlot
    extra = 0
    readonly_fields = ('slot', 'proposed_start_time', 'proposed_end_time', 'proposed_rate')


@admin.register(ShiftCounterOffer)
class ShiftCounterOfferAdmin(admin.ModelAdmin):
    list_display = ('id', 'shift', 'pharmacy_name', 'user', 'status', 'created_at')
    list_filter = ('status', 'shift__pharmacy')
    search_fields = ('id', 'shift__pharmacy__name', 'user__email', 'user__first_name', 'user__last_name')
    readonly_fields = ('shift', 'user', 'status', 'message', 'request_travel', 'created_at', 'updated_at')
    inlines = [ShiftCounterOfferSlotInline]

    def pharmacy_name(self, obj):
        return getattr(obj.shift.pharmacy, 'name', None)

    pharmacy_name.short_description = "Pharmacy"


@admin.register(ShiftOffer)
class ShiftOfferAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'shift',
        'pharmacy_name',
        'slot',
        'user',
        'status',
        'offered_slot_date',
        'offered_start_time',
        'offered_end_time',
        'offered_rate',
        'expires_at',
        'created_at',
    )
    list_filter = (
        'status',
        'shift__pharmacy',
        'offered_slot_date',
        'expires_at',
    )
    search_fields = (
        'id',
        'shift__id',
        'shift__pharmacy__name',
        'user__email',
        'user__first_name',
        'user__last_name',
        'user__username',
    )
    autocomplete_fields = ('shift', 'user', 'counter_offer')
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'created_at'

    def pharmacy_name(self, obj):
        return getattr(obj.shift.pharmacy, 'name', None)

    pharmacy_name.short_description = "Pharmacy"


