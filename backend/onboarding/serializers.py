"""Serializers for the onboarding flows (owner, pharmacist, other staff, explorer) and referee responses."""


from rest_framework import serializers
from onboarding.models import (
    ExplorerOnboarding,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    RefereeResponse,
)
from core.file_validation import DOCUMENT_UPLOAD_POLICY, IMAGE_UPLOAD_POLICY
from core.serializer_mixins import UploadValidationMixin
from users.presentation import _build_absolute_media_url
from onboarding.services.basic import (
    apply_explorer_basic_tab,
    apply_otherstaff_basic_tab,
    apply_owner_basic_tab,
    apply_pharmacist_basic_tab,
)
from onboarding.services.identity import apply_identity_tab
from onboarding.services.preferences import apply_interests_tab, apply_rate_tab
from onboarding.services.progress import (
    explorer_progress_percent,
    otherstaff_progress_percent,
    owner_progress_percent,
    pharmacist_progress_percent,
)
from onboarding.services.regulatory import apply_regulatory_tab, required_documents_for_role
from onboarding.services.skills import (  # noqa: F401  (_load_skills_catalog, _required_cert_skill_codes: historical path)
    _load_skills_catalog,
    _required_cert_skill_codes,
    apply_skills_tab,
    files_by_skill,
    list_existing_skill_files,
    save_skill_file,
    skill_certificate_summary,
)
from onboarding.services.submission import record_first_submission, submit_requested
from onboarding.services.payment import apply_payment_tab, masked_tfn
from onboarding.services.profile import apply_profile_tab
from onboarding.services.referees import apply_referees_tab


class OwnerOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    Single-tab onboarding for owners/managers.
    Mirrors the V2 pattern used by pharmacist/other staff/explorer flows.
    """

    username = serializers.CharField(source="user.username", required=False, allow_blank=True)
    first_name = serializers.CharField(source="user.first_name", required=False, allow_blank=True)
    last_name = serializers.CharField(source="user.last_name", required=False, allow_blank=True)
    phone_number = serializers.CharField(source="user.mobile_number", required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(required=False)
    progress_percent = serializers.SerializerMethodField()
    ahpra_years_since_first_registration = serializers.SerializerMethodField(read_only=True)
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = OwnerOnboarding
        fields = [
            "username",
            "first_name",
            "last_name",
            "phone_number",
            "gender",
            "role",
            "chain_pharmacy",
            "number_of_pharmacies",
            "profile_photo",
            "profile_photo_url",
            "government_id",
            "government_id_type",
            "identity_meta",
            "identity_secondary_file",
            "gov_id_verified",
            "gov_id_verification_note",
            "ahpra_number",
            "ahpra_verified",
            "ahpra_registration_status",
            "ahpra_registration_type",
            "ahpra_expiry_date",
            "ahpra_first_registration_date",
            "ahpra_verification_note",
            "ahpra_years_since_first_registration",
            "organization",
            "verified",
            "progress_percent",
            "tab",
            "submitted_for_verification",
        ]
        extra_kwargs = {
            "organization": {"read_only": True},
            "gender": {"required": False, "allow_blank": True, "allow_null": True},
            "ahpra_verified": {"read_only": True},
            "ahpra_registration_status": {"read_only": True},
            "ahpra_registration_type": {"read_only": True},
            "ahpra_expiry_date": {"read_only": True},
            "ahpra_first_registration_date": {"read_only": True},
            "ahpra_verification_note": {"read_only": True},
            "verified": {"read_only": True},
            "profile_photo": {"required": False, "allow_null": True},
            "government_id": {"required": False, "allow_null": True},
            "government_id_type": {"required": False, "allow_blank": True, "allow_null": True},
            "identity_meta": {"required": False},
            "identity_secondary_file": {"required": False, "allow_null": True},
            "gov_id_verified": {"read_only": True},
            "gov_id_verification_note": {"read_only": True},
        }

    def update(self, instance, validated_data):
        tab = (self.initial_data.get("tab") or "basic").strip().lower()
        submit = bool(validated_data.pop("submitted_for_verification", False))

        if tab == "identity":
            return apply_identity_tab(instance, validated_data, submit)
        if tab != "basic":
            tab = "basic"

        if tab == "basic":
            return self._basic_tab(instance, validated_data, submit)
        return super().update(instance, validated_data)

    def _basic_tab(self, instance, vdata: dict, submit: bool):
        return apply_owner_basic_tab(instance, vdata, submit, initial_data=self.initial_data)

    def get_progress_percent(self, obj):
        return owner_progress_percent(obj)

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))

    def get_ahpra_years_since_first_registration(self, obj):
        return obj.ahpra_years_since_first_registration


class RefereeResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = RefereeResponse
        fields = [
            "referee_name",
            "referee_position",
            "relationship_to_candidate",
            "association_period",
            "contact_details",
            "role_and_responsibilities",
            "reliability_rating",
            "professionalism_notes",
            "skills_rating",
            "skills_strengths_weaknesses",
            "teamwork_communication_notes",
            "feedback_conflict_notes",
            "conduct_concerns",
            "conduct_explanation",
            "compliance_adherence",
            "compliance_incidents",
            "would_rehire",
            "rehire_explanation",
            "additional_comments",
        ]


class PharmacistOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    V2 single-endpoint, tab-aware serializer.
    Implements ONLY the Basic tab (as requested).
    """

    # user fields (read/write through User)
    username   = serializers.CharField(source='user.username',   required=False, allow_blank=True)
    first_name = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name  = serializers.CharField(source='user.last_name',  required=False, allow_blank=True)
    phone_number = serializers.CharField(source='user.mobile_number', required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)


    latitude  = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)

    tfn = serializers.CharField(
        source='tfn_number', write_only=True, required=False, allow_blank=True, allow_null=True
    )
    tfn_masked = serializers.SerializerMethodField(read_only=True)


    skills = serializers.ListField(child=serializers.CharField(), required=False)
    skill_certificates = serializers.SerializerMethodField(read_only=True)
   
    # write-only control flags
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)

    # computed
    progress_percent = serializers.SerializerMethodField()
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
        "resume": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = PharmacistOnboarding
        fields = [
            # ---------- BASIC ----------
            'username','first_name','last_name','phone_number','date_of_birth','gender',
            'emergency_contact_number','emergency_contact_relation','profile_photo','profile_photo_url',
            'profile_photo','profile_photo_url',
            'ahpra_number',
            'street_address','suburb','state','postcode','google_place_id','latitude','longitude','open_to_travel','travel_states','coverage_radius_km',
            'ahpra_verified','ahpra_registration_status','ahpra_registration_type','ahpra_expiry_date',
            'ahpra_verification_note',
            'ahpra_years_since_first_registration',

            # -------- IDENTITY (new tab) --------
            'government_id','identity_secondary_file','government_id_type','identity_meta','gov_id_verified','gov_id_verification_note',

            # -------- PAYMENT (add tfn here) --------
            'payment_preference',
            'abn','gst_registered',
            'tfn',            # <— NEW write-only alias to tfn_number
            'tfn_masked',     # <— read-only masked view
            'super_fund_name','super_usi','super_member_number',
            'abn_verified','abn_verification_note',
            'abn_entity_name','abn_entity_type','abn_status',
            'abn_gst_registered','abn_gst_from','abn_gst_to','abn_last_checked',
            'abn_entity_confirmed',


            # ----- REFEREES -----
            'referee1_name','referee1_relation','referee1_email','referee1_workplace',
            'referee1_confirmed','referee1_rejected','referee1_last_sent',
            'referee2_name','referee2_relation','referee2_email','referee2_workplace',
            'referee2_confirmed','referee2_rejected','referee2_last_sent',


            # ---------- SKILLS ----------
            'skills',
            'skill_certificates',   # read-only summary


            # ---------- Rete preferences ----------
            'rate_preference',

            # ---------- Profile preferences ----------
            'short_bio', 'resume',

            'verified','progress_percent',
            'tab','submitted_for_verification',
        ]
        extra_kwargs = {
            # user names are optional
            'username': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},

            # pharmacist fields optional here
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'date_of_birth': {'required': False, 'allow_null': True},
            'gender': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_relation': {'required': False, 'allow_blank': True, 'allow_null': True},
            'ahpra_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'government_id': {'required': False, 'allow_null': True},
            'government_id_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},
            'identity_secondary_file': {'required': False, 'allow_null': True},
            'identity_meta': {'required': False},

            # address optional
            'street_address':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'suburb':          {'required': False, 'allow_blank': True, 'allow_null': True},
            'state':           {'required': False, 'allow_blank': True, 'allow_null': True},
            'postcode':        {'required': False, 'allow_blank': True, 'allow_null': True},
            'google_place_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'latitude':        {'required': False, 'allow_null': True},
            'longitude':       {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'travel_states':   {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'travel_states':   {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'coverage_radius_km': {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'open_to_travel':  {'required': False},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},

            # payment (optional – tab decides what’s required)
            'payment_preference': {'required': False, 'allow_blank': True},
            'abn':                {'required': False, 'allow_blank': True},
            'gst_registered':     {'required': False},
            'super_fund_name':    {'required': False, 'allow_blank': True},
            'super_usi':          {'required': False, 'allow_blank': True},
            'super_member_number':{'required': False, 'allow_blank': True},
            'abn_entity_confirmed': {'required': False},
            'tfn_masked': {'read_only': True},


            # read-only verification outputs
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},
            'ahpra_verified': {'read_only': True},
            'ahpra_registration_status': {'read_only': True},
            'ahpra_registration_type': {'read_only': True},
            'ahpra_expiry_date': {'read_only': True},
            'ahpra_verification_note': {'read_only': True},

            'abn_verified': {'read_only': True},
            'abn_verification_note': {'read_only': True},
            'abn_entity_name': {'read_only': True},
            'abn_entity_type': {'read_only': True},
            'abn_status': {'read_only': True},
            'abn_gst_registered': {'read_only': True},
            'abn_gst_from': {'read_only': True},
            'abn_gst_to': {'read_only': True},
            'abn_last_checked': {'read_only': True},


            # referees input
            'referee1_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},

            'referee2_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},

            # status/read-only
            'referee1_confirmed':  {'read_only': True},
            'referee1_rejected':   {'read_only': True},
            'referee1_last_sent':  {'read_only': True},
            'referee2_confirmed':  {'read_only': True},
            'referee2_rejected':   {'read_only': True},
            'referee2_last_sent':  {'read_only': True},

            # Skills
            'skills': {'required': False},          # optional tab
            'skill_certificates': {'read_only': True},


            # Rate
            'short_bio': {'required': False, 'allow_blank': True, 'allow_null': True},
            'resume':    {'required': False, 'allow_null': True},

            # Rate Preferences
            'rate_preference': {'required': False, 'allow_null': True},
            'verified': {'read_only': True},
            'progress_percent': {'read_only': True},
        }


    # ---------------- representation helpers ----------------
    def get_tfn_masked(self, obj):
        """Never expose the raw TFN: it is stored encrypted and only a masked form is returned."""
        return masked_tfn(obj)

    def _files_by_skill(self):
        return files_by_skill(self.context.get("request"))

    def _save_skill_file(self, user_id: int, code: str, uploaded_file):
        return save_skill_file(user_id, code, uploaded_file)

    def _list_existing(self, user_id: int, code: str):
        return list_existing_skill_files(user_id, code)

    # -------- progress --------
    def get_progress_percent(self, obj):
        return pharmacist_progress_percent(obj)

    # -------- update --------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = submit_requested(self.initial_data)
        record_first_submission(instance, tab=tab, submit=submit)

        if tab == 'basic':
            return self._basic_tab(instance, validated_data, submit)
        if tab == 'payment':
            return self._payment_tab(instance, validated_data, submit)
        if tab == 'referees':
            return self._referees_tab(instance, validated_data, submit)
        if tab == 'skills':
            return self._skills_tab(instance, validated_data, submit)
        if tab == 'rate':
            return self._rate_tab(instance, validated_data, submit)
        if tab == 'profile':
            return self._profile_tab(instance, validated_data, submit)
        if tab == 'identity':
            return self._identity_tab(instance, validated_data, submit)

        return super().update(instance, validated_data)

    # ---------------- BASIC TAB ----------------
    def _basic_tab(self, instance, vdata: dict, submit: bool):
        return apply_pharmacist_basic_tab(instance, vdata, submit, initial_data=self.initial_data)

    def get_ahpra_years_since_first_registration(self, obj):
        return obj.ahpra_years_since_first_registration


    # ---------------- Identity TAB (new) ----------------
    def _identity_tab(self, instance, vdata: dict, submit: bool):
        return apply_identity_tab(instance, vdata, submit)

    # ---------------- Payment TAB ----------------
    def _payment_tab(self, instance, vdata: dict, submit: bool):
        return apply_payment_tab(instance, vdata, submit)

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance, vdata: dict, submit: bool):
        return apply_referees_tab(instance, vdata, submit)

    # ---------------- Skills tab ----------------
    def _skills_tab(self, instance, vdata: dict, submit: bool):
        return apply_skills_tab(
            instance, vdata, initial_data=self.initial_data, uploads=self._files_by_skill(), role_key="pharmacist",
            missing_message="Certificate required for checked skill(s): ",
            keep_history=getattr(self, "KEEP_SKILL_HISTORY", False),
        )

    # --------------- read-only summary for UI ---------------
    def get_skill_certificates(self, obj):
        return skill_certificate_summary(obj)

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))

    # ---------------- Rate tab ----------------
    def _rate_tab(self, instance, vdata: dict, submit: bool):
        return apply_rate_tab(instance, vdata, submit, initial_data=self.initial_data)

    # ---------------- Profile tab ----------------
    def _profile_tab(self, instance, vdata: dict, submit: bool):
        return apply_profile_tab(instance, vdata, submit)


class OtherStaffOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    V2 single-endpoint, tab-aware serializer for OtherStaff.
    Mirrors the Pharmacist V2 procedure but without AHPRA and with a Regulatory tab.
    """

    # user fields (read/write through User)
    username     = serializers.CharField(source='user.username',   required=False, allow_blank=True)
    first_name   = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name    = serializers.CharField(source='user.last_name',  required=False, allow_blank=True)
    phone_number = serializers.CharField(source='user.mobile_number', required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)

    latitude  = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)

    # TFN aliasing (store encrypted; only expose masked)
    tfn = serializers.CharField(
        source='tfn_number', write_only=True, required=False, allow_blank=True, allow_null=True
    )
    tfn_masked = serializers.SerializerMethodField(read_only=True)

    # Skills
    skills = serializers.ListField(child=serializers.CharField(), required=False)
    skill_certificates = serializers.SerializerMethodField(read_only=True)

    # write-only control flags
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)

    # computed
    progress_percent = serializers.SerializerMethodField()
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
        "ahpra_proof": DOCUMENT_UPLOAD_POLICY,
        "hours_proof": DOCUMENT_UPLOAD_POLICY,
        "certificate": DOCUMENT_UPLOAD_POLICY,
        "university_id": DOCUMENT_UPLOAD_POLICY,
        "cpr_certificate": DOCUMENT_UPLOAD_POLICY,
        "s8_certificate": DOCUMENT_UPLOAD_POLICY,
        "resume": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = OtherStaffOnboarding
        fields = [
            # ---------- BASIC ----------
            'username','first_name','last_name','phone_number','date_of_birth','gender',
            'emergency_contact_number','emergency_contact_relation','profile_photo','profile_photo_url',
            'street_address','suburb','state','postcode','google_place_id','latitude','longitude','open_to_travel','travel_states','coverage_radius_km',

            # ---------- IDENTITY ----------
            'government_id','identity_secondary_file','government_id_type','identity_meta',
            'gov_id_verified','gov_id_verification_note',

            # ---------- REGULATORY DOCS (role + files) ----------
            'role_type','classification_level','student_year','intern_half',
            'ahpra_proof','hours_proof','certificate','university_id','cpr_certificate','s8_certificate',
            'ahpra_proof_verified','ahpra_proof_verification_note',
            'hours_proof_verified','hours_proof_verification_note',
            'certificate_verified','certificate_verification_note',
            'university_id_verified','university_id_verification_note',
            'cpr_certificate_verified','cpr_certificate_verification_note',
            's8_certificate_verified','s8_certificate_verification_note',

            # ---------- PAYMENT ----------
            'payment_preference',
            'abn','gst_registered',
            'tfn', 'tfn_masked',
            'super_fund_name','super_usi','super_member_number',
            'abn_verified','abn_verification_note',
            'abn_entity_name','abn_entity_type','abn_status',
            'abn_gst_registered','abn_gst_from','abn_gst_to','abn_last_checked',
            'abn_entity_confirmed',

            # ---------- REFEREES ----------
            'referee1_name','referee1_relation','referee1_email','referee1_workplace',
            'referee1_confirmed','referee1_rejected','referee1_last_sent',
            'referee2_name','referee2_relation','referee2_email','referee2_workplace',
            'referee2_confirmed','referee2_rejected','referee2_last_sent',

            # ---------- SKILLS ----------
            'skills',
            'skill_certificates',   # read-only summary
            'years_experience',  

            # ---------- PROFILE ----------
            'short_bio','resume',

            'verified','progress_percent',
            'tab','submitted_for_verification',
        ]
        extra_kwargs = {
            # user names optional
            'username': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},

            # basic optional
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},
            'date_of_birth': {'required': False, 'allow_null': True},
            'gender': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_relation': {'required': False, 'allow_blank': True, 'allow_null': True},
            'street_address':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'suburb':          {'required': False, 'allow_blank': True, 'allow_null': True},
            'state':           {'required': False, 'allow_blank': True, 'allow_null': True},
            'postcode':        {'required': False, 'allow_blank': True, 'allow_null': True},
            'google_place_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'latitude':        {'required': False, 'allow_null': True},
            'longitude':       {'required': False, 'allow_null': True},

            # identity optional (tab handles requiredness)
            'government_id': {'required': False, 'allow_null': True},
            'government_id_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'identity_secondary_file': {'required': False, 'allow_null': True},
            'identity_meta': {'required': False},
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},

            # regulatory files optional (tab decides requiredness)
            'role_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'classification_level': {'required': False, 'allow_blank': True, 'allow_null': True},
            'student_year': {'required': False, 'allow_blank': True, 'allow_null': True},
            'intern_half': {'required': False, 'allow_blank': True, 'allow_null': True},

            'ahpra_proof': {'required': False, 'allow_null': True},
            'hours_proof': {'required': False, 'allow_null': True},
            'certificate': {'required': False, 'allow_null': True},
            'university_id': {'required': False, 'allow_null': True},
            'cpr_certificate': {'required': False, 'allow_null': True},
            's8_certificate': {'required': False, 'allow_null': True},

            'ahpra_proof_verified': {'read_only': True},
            'ahpra_proof_verification_note': {'read_only': True},
            'hours_proof_verified': {'read_only': True},
            'hours_proof_verification_note': {'read_only': True},
            'certificate_verified': {'read_only': True},
            'certificate_verification_note': {'read_only': True},
            'university_id_verified': {'read_only': True},
            'university_id_verification_note': {'read_only': True},
            'cpr_certificate_verified': {'read_only': True},
            'cpr_certificate_verification_note': {'read_only': True},
            's8_certificate_verified': {'read_only': True},
            's8_certificate_verification_note': {'read_only': True},

            # payment (tab decides requiredness)
            'payment_preference': {'required': False, 'allow_blank': True},
            'abn':                {'required': False, 'allow_blank': True},
            'gst_registered':     {'required': False},
            'super_fund_name':    {'required': False, 'allow_blank': True},
            'super_usi':          {'required': False, 'allow_blank': True},
            'super_member_number':{'required': False, 'allow_blank': True},
            'abn_entity_confirmed': {'required': False},
            'tfn_masked': {'read_only': True},

            # ABR outputs read-only
            'abn_verified': {'read_only': True},
            'abn_verification_note': {'read_only': True},
            'abn_entity_name': {'read_only': True},
            'abn_entity_type': {'read_only': True},
            'abn_status': {'read_only': True},
            'abn_gst_registered': {'read_only': True},
            'abn_gst_from': {'read_only': True},
            'abn_gst_to': {'read_only': True},
            'abn_last_checked': {'read_only': True},

            # referees
            'referee1_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_confirmed':  {'read_only': True},
            'referee1_rejected':   {'read_only': True},
            'referee1_last_sent':  {'read_only': True},
            'referee2_confirmed':  {'read_only': True},
            'referee2_rejected':   {'read_only': True},
            'referee2_last_sent':  {'read_only': True},

            # skills
            'skills': {'required': False},
            'skill_certificates': {'read_only': True},
            'years_experience': {'required': False, 'allow_blank': True, 'allow_null': True},

            # profile
            'short_bio': {'required': False, 'allow_blank': True, 'allow_null': True},
            'resume':    {'required': False, 'allow_null': True},

            'verified': {'read_only': True},
            'progress_percent': {'read_only': True},
        }

    # ---------------- representation helpers ----------------
    def get_tfn_masked(self, obj):
        """Never expose the raw TFN: it is stored encrypted and only a masked form is returned."""
        return masked_tfn(obj)

    def _files_by_skill(self):
        return files_by_skill(self.context.get("request"))

    def _save_skill_file(self, user_id: int, code: str, uploaded_file):
        return save_skill_file(user_id, code, uploaded_file)

    def _list_existing(self, user_id: int, code: str):
        return list_existing_skill_files(user_id, code)

    # -------- utility: regulatory requirements by role --------
    def _required_docs_for_role(self, instance):
        return required_documents_for_role(instance)

    # -------- progress --------
    def get_progress_percent(self, obj):
        return otherstaff_progress_percent(obj)

    # ---------------- update router ----------------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = submit_requested(self.initial_data)
        record_first_submission(instance, tab=tab, submit=submit)

        if tab == 'basic':
            return self._basic_tab(instance, validated_data, submit)
        if tab == 'identity':
            return self._identity_tab(instance, validated_data, submit)
        if tab == 'regulatory':
            return self._regulatory_tab(instance, validated_data, submit)
        if tab == 'payment':
            return self._payment_tab(instance, validated_data, submit)
        if tab == 'referees':
            return self._referees_tab(instance, validated_data, submit)
        if tab == 'skills':
            return self._skills_tab(instance, validated_data, submit)
        if tab == 'profile':
            return self._profile_tab(instance, validated_data, submit)

        return super().update(instance, validated_data)

    # ---------------- BASIC TAB ----------------
    def _basic_tab(self, instance, vdata: dict, submit: bool):
        return apply_otherstaff_basic_tab(instance, vdata, submit, initial_data=self.initial_data)

    # ---------------- Identity TAB ----------------
    def _identity_tab(self, instance, vdata: dict, submit: bool):
        return apply_identity_tab(instance, vdata, submit)

    # ---------------- Regulatory TAB ----------------
    def _regulatory_tab(self, instance, vdata: dict, submit: bool):
        return apply_regulatory_tab(instance, vdata, submit)

    # ---------------- Payment TAB ----------------
    def _payment_tab(self, instance, vdata: dict, submit: bool):
        return apply_payment_tab(instance, vdata, submit)

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance, vdata: dict, submit: bool):
        return apply_referees_tab(instance, vdata, submit)

    # ---------------- Skills TAB ----------------
    def _skills_tab(self, instance, vdata: dict, submit: bool):
        return apply_skills_tab(
            instance, vdata, initial_data=self.initial_data, uploads=self._files_by_skill(), role_key="otherstaff",
            missing_message="Certificate required for: ", track_years_experience=True,
            keep_history=getattr(self, "KEEP_SKILL_HISTORY", False),
        )

    # ---------------- Profile TAB ----------------
    def _profile_tab(self, instance, vdata: dict, submit: bool):
        return apply_profile_tab(instance, vdata, submit)

    # ---------------- read-only summary for UI ----------------
    def get_skill_certificates(self, obj):
        return skill_certificate_summary(obj)

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))


class ExplorerOnboardingV2Serializer(UploadValidationMixin, serializers.ModelSerializer):
    """
    V2 tab-aware serializer for Explorer.
    Tabs: basic, identity, interests, referees, profile.
    """

    # user pass-through
    username     = serializers.CharField(source='user.username',   required=False, allow_blank=True)
    first_name   = serializers.CharField(source='user.first_name', required=False, allow_blank=True)
    last_name    = serializers.CharField(source='user.last_name',  required=False, allow_blank=True)
    phone_number = serializers.CharField(source='user.mobile_number', required=False, allow_blank=True, allow_null=True)
    profile_photo = serializers.ImageField(required=False, allow_null=True)
    profile_photo_url = serializers.SerializerMethodField(read_only=True)

    latitude  = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=18, decimal_places=12, required=False, allow_null=True)

    # write-only control flags
    tab = serializers.CharField(write_only=True, required=False)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)

    # computed
    progress_percent = serializers.SerializerMethodField()
    upload_validation_map = {
        "profile_photo": IMAGE_UPLOAD_POLICY,
        "government_id": DOCUMENT_UPLOAD_POLICY,
        "identity_secondary_file": DOCUMENT_UPLOAD_POLICY,
        "resume": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = ExplorerOnboarding
        fields = [
            "id",
            # ---------- BASIC ----------
            'username','first_name','last_name','phone_number','profile_photo','profile_photo_url',
            'role_type','gender','emergency_contact_number','emergency_contact_relation',
            'street_address','suburb','state','postcode','google_place_id','latitude','longitude','open_to_travel','travel_states','coverage_radius_km',

            # ---------- IDENTITY ----------
            'government_id','identity_secondary_file','government_id_type','identity_meta',
            'gov_id_verified','gov_id_verification_note',

            # ---------- INTERESTS ----------
            'interests',   # JSON (array of codes, e.g. ["SHADOWING","VOLUNTEERING","PLACEMENT","JUNIOR_ASSISTANT"])

            # ---------- REFEREES ----------
            'referee1_name','referee1_relation','referee1_email','referee1_workplace',
            'referee1_confirmed','referee1_rejected','referee1_last_sent',
            'referee2_name','referee2_relation','referee2_email','referee2_workplace',
            'referee2_confirmed','referee2_rejected','referee2_last_sent',

            # ---------- PROFILE ----------
            'short_bio','resume',

            'verified','progress_percent',
            'tab','submitted_for_verification',
        ]
        extra_kwargs = {
            "id": {"read_only": True},
            # user names optional
            'username': {'required': False, 'allow_blank': True},
            'first_name': {'required': False, 'allow_blank': True},
            'last_name': {'required': False, 'allow_blank': True},
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'profile_photo': {'required': False, 'allow_null': True},
            'profile_photo_url': {'read_only': True},

            # basic
            'role_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'gender': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_number': {'required': False, 'allow_blank': True, 'allow_null': True},
            'emergency_contact_relation': {'required': False, 'allow_blank': True, 'allow_null': True},
            'street_address':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'suburb':          {'required': False, 'allow_blank': True, 'allow_null': True},
            'state':           {'required': False, 'allow_blank': True, 'allow_null': True},
            'postcode':        {'required': False, 'allow_blank': True, 'allow_null': True},
            'google_place_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'latitude':        {'required': False, 'allow_null': True},
            'longitude':       {'required': False, 'allow_null': True},
            'open_to_travel':  {'required': False},
            'travel_states':   {'required': False},
            'coverage_radius_km': {'required': False, 'allow_null': True},

            # identity (tab decides requiredness)
            'government_id': {'required': False, 'allow_null': True},
            'government_id_type': {'required': False, 'allow_blank': True, 'allow_null': True},
            'identity_secondary_file': {'required': False, 'allow_null': True},
            'identity_meta': {'required': False},
            'gov_id_verified': {'read_only': True},
            'gov_id_verification_note': {'read_only': True},

            # interests
            'interests': {'required': False},

            # referees
            'referee1_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_name':       {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_relation':   {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_email':      {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee2_workplace':  {'required': False, 'allow_blank': True, 'allow_null': True},
            'referee1_confirmed':  {'read_only': True},
            'referee1_rejected':   {'read_only': True},
            'referee1_last_sent':  {'read_only': True},
            'referee2_confirmed':  {'read_only': True},
            'referee2_rejected':   {'read_only': True},
            'referee2_last_sent':  {'read_only': True},

            # profile
            'short_bio': {'required': False, 'allow_blank': True, 'allow_null': True},
            'resume':    {'required': False, 'allow_null': True},

            'verified': {'read_only': True},
            'progress_percent': {'read_only': True},
        }

    # ---------------- progress gate ----------------
    def get_progress_percent(self, obj):
        return explorer_progress_percent(obj)

    # ---------------- update router ----------------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = submit_requested(self.initial_data)
        record_first_submission(instance, tab=tab, submit=submit)

        if tab == 'basic':
            return self._basic_tab(instance, validated_data, submit)
        if tab == 'identity':
            return self._identity_tab(instance, validated_data, submit)
        if tab == 'interests':
            return self._interests_tab(instance, validated_data, submit)
        if tab == 'referees':
            return self._referees_tab(instance, validated_data, submit)
        if tab == 'profile':
            return self._profile_tab(instance, validated_data, submit)

        return super().update(instance, validated_data)

    # ---------------- BASIC TAB ----------------
    def _basic_tab(self, instance, vdata: dict, submit: bool):
        return apply_explorer_basic_tab(instance, vdata, submit, initial_data=self.initial_data)

    # ---------------- Identity TAB (identical behavior) ----------------
    def _identity_tab(self, instance, vdata: dict, submit: bool):
        return apply_identity_tab(instance, vdata, submit)

    # ---------------- Interests TAB ----------------
    def _interests_tab(self, instance, vdata: dict, submit: bool):
        return apply_interests_tab(instance, vdata, submit, initial_data=self.initial_data)

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance, vdata: dict, submit: bool):
        return apply_referees_tab(instance, vdata, submit)

    # ---------------- Profile TAB ----------------
    def _profile_tab(self, instance, vdata: dict, submit: bool):
        return apply_profile_tab(instance, vdata, submit)

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))
