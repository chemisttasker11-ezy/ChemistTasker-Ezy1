# client_profile/serializers.py

# This is smsm update
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field, OpenApiTypes
from .models import *
from users.models import OrganizationMembership, DeviceToken
from users.serializers import UserProfileSerializer
from django.contrib.auth import get_user_model
from django.db import transaction
from decimal import Decimal
from client_profile.utils import q6, send_referee_emails, clean_email, enforce_public_shift_daily_limit, build_shift_email_context, build_shift_offer_context
from client_profile.services import expand_shift_slots
from client_profile.admin_helpers import has_admin_capability, CAPABILITY_MANAGE_ROSTER
from datetime import date, timedelta, datetime, time
from django.utils import timezone
from django_q.tasks import async_task
import logging
import math
import uuid
logger = logging.getLogger(__name__)
User = get_user_model()
from django_q.models import Schedule
from client_profile.tasks import schedule_referee_reminder
import os
import json
from pathlib import Path
from django.utils.text import slugify
from django.core.files.storage import default_storage
from client_profile.file_validation import (
    ATTACHMENT_UPLOAD_POLICY,
    DOCUMENT_UPLOAD_POLICY,
    IMAGE_UPLOAD_POLICY,
    validate_upload_mapping,
    validate_uploaded_file,
)
from client_profile.rewards import get_pill_balance

OFFER_EXPIRY_HOURS = 48

class UploadValidationMixin:
    upload_validation_map = {}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        return validate_upload_mapping(attrs, self.upload_validation_map)


# --- Skills catalog (shared-core/skills_catalog.json) ---
_SKILLS_CATALOG_CACHE = None


def _load_skills_catalog():
    global _SKILLS_CATALOG_CACHE
    if _SKILLS_CATALOG_CACHE is not None:
        return _SKILLS_CATALOG_CACHE
    base_dir = Path(__file__).resolve().parents[2]
    catalog_path = base_dir / "shared-core" / "skills_catalog.json"
    try:
        with open(catalog_path, "r", encoding="utf-8") as f:
            _SKILLS_CATALOG_CACHE = json.load(f)
    except Exception:
        _SKILLS_CATALOG_CACHE = {}
    return _SKILLS_CATALOG_CACHE


def _required_cert_skill_codes(role_key: str) -> set[str]:
    catalog = _load_skills_catalog()
    role = (catalog or {}).get(role_key, {})
    required = set()
    for group_key in ("clinical_services", "dispense_software", "expanded_scope"):
        for item in role.get(group_key, []) or []:
            if item.get("requires_certificate"):
                required.add(item.get("code"))
    return {c for c in required if c}


# === Onboardings ===
class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name']
        read_only_fields = ['id']


class PublicOrganizationSerializer(serializers.ModelSerializer):
    cover_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'about', 'cover_image_url']
        read_only_fields = fields

    def get_cover_image_url(self, obj):
        request = self.context.get("request")
        if not obj.cover_image:
            return None
        url = obj.cover_image.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url




def verification_fields_changed(instance, validated_data, fields):
    for field in fields:
        old = getattr(instance, field, None)
        if field in validated_data:
            new = validated_data[field]
        else:
            continue
        if hasattr(old, "name") or hasattr(new, "name"):
            old_name = getattr(old, "name", None)
            new_name = getattr(new, "name", None)
            if (old_name or "").strip() != (new_name or "").strip():
                return True
        else:
            # Important: Convert both to string to handle bools, numbers, etc.
            if str(old or "").strip() != str(new or "").strip():
                return True
    return False


def _file_has_changed(new_file, old_file):
    return getattr(new_file, "name", None) != getattr(old_file, "name", None)


def _known_file_references():
    return [
        (OwnerOnboarding, "profile_photo"),
        (PharmacistOnboarding, "profile_photo"),
        (PharmacistOnboarding, "government_id"),
        (PharmacistOnboarding, "identity_secondary_file"),
        (PharmacistOnboarding, "resume"),
        (OtherStaffOnboarding, "profile_photo"),
        (OtherStaffOnboarding, "government_id"),
        (OtherStaffOnboarding, "identity_secondary_file"),
        (OtherStaffOnboarding, "ahpra_proof"),
        (OtherStaffOnboarding, "hours_proof"),
        (OtherStaffOnboarding, "certificate"),
        (OtherStaffOnboarding, "university_id"),
        (OtherStaffOnboarding, "cpr_certificate"),
        (OtherStaffOnboarding, "s8_certificate"),
        (OtherStaffOnboarding, "resume"),
        (ExplorerOnboarding, "profile_photo"),
        (ExplorerOnboarding, "government_id"),
        (ExplorerOnboarding, "identity_secondary_file"),
        (ExplorerOnboarding, "resume"),
        (Organization, "cover_image"),
        (Pharmacy, "methadone_s8_protocols"),
        (Pharmacy, "qld_sump_docs"),
        (Pharmacy, "sops"),
        (Pharmacy, "induction_guides"),
        (Pharmacy, "cover_image"),
        (Chain, "logo"),
        (Message, "attachment"),
        (PharmacyHubAttachment, "file"),
    ]


def _delete_file_if_unreferenced(file_field, *, current_instance=None):
    name = getattr(file_field, "name", None)
    if not name:
        return False

    for model, field_name in _known_file_references():
        qs = model.objects.filter(**{field_name: name})
        if current_instance is not None and isinstance(current_instance, model):
            qs = qs.exclude(pk=getattr(current_instance, "pk", None))
        if qs.exists():
            return False

    try:
        file_field.delete(save=False)
        return True
    except Exception:
        return False


def _resolve_user_profile_photo(user):
    if not user:
        return None
    for attr in (
        "pharmacistonboarding",
        "otherstaffonboarding",
        "exploreronboarding",
        "owneronboarding",
    ):
        profile = getattr(user, attr, None)
        photo = getattr(profile, "profile_photo", None) if profile else None
        if photo:
            return photo
    return None


def _should_clear_flag(initial_data, key):
    value = initial_data.get(key)
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def _normalize_identity_value(value):
    if value is None:
        return ""
    return str(value).strip()


def _update_locked_user_fields(user, user_data):
    errors = {}
    changed_user_fields = []

    if "username" in user_data:
        incoming_username = _normalize_identity_value(user_data.get("username"))
        if user.username != incoming_username:
            user.username = incoming_username
            changed_user_fields.append("username")

    for field_name in ("first_name", "last_name"):
        if field_name not in user_data:
            continue
        incoming_value = _normalize_identity_value(user_data.get(field_name))
        existing_value = _normalize_identity_value(getattr(user, field_name))
        if existing_value and incoming_value != existing_value:
            errors[field_name] = f"{field_name.replace('_', ' ').title()} is locked and cannot be changed."
            continue
        if getattr(user, field_name) != incoming_value:
            setattr(user, field_name, incoming_value)
            changed_user_fields.append(field_name)

    if "mobile_number" in user_data:
        incoming_mobile = _normalize_identity_value(user_data.get("mobile_number")) or None
        existing_mobile = _normalize_identity_value(getattr(user, "mobile_number", None)) or None
        if getattr(user, "is_mobile_verified", False) and existing_mobile and incoming_mobile != existing_mobile:
            errors["phone_number"] = "Verified mobile number is locked and cannot be changed."
        elif user.mobile_number != incoming_mobile:
            user.mobile_number = incoming_mobile
            changed_user_fields.append("mobile_number")

    if errors:
        raise serializers.ValidationError(errors)

    if changed_user_fields:
        user.save(update_fields=sorted(set(changed_user_fields)))

class RemoveOldFilesMixin:
    file_fields: list[str] = []
    def update(self, instance, validated_data):
        for field_name in self.file_fields:
            if field_name in validated_data:
                new_file, old_file = validated_data[field_name], getattr(instance, field_name)
                if old_file and old_file.name and (new_file is None or old_file.name != new_file.name):
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
            elif field_name in validated_data and validated_data[field_name] is None:
                old_file = getattr(instance, field_name)
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
        return super().update(instance, validated_data)


def user_can_view_full_pharmacy(user, pharmacy) -> bool:
    """
    Mirrors BaseShiftViewSet._user_can_manage_pharmacy so serializers can reuse it.
    """
    if not user or not getattr(user, "is_authenticated", False) or pharmacy is None:
        return False

    owner = getattr(pharmacy, "owner", None)
    if owner and getattr(owner, "user", None) == user:
        return True

    if OrganizationMembership.objects.filter(
        user=user,
        role='ORG_ADMIN',
        organization_id=pharmacy.organization_id,
    ).exists():
        return True

    if OrganizationMembership.objects.filter(
        user=user,
        role__in=['CHIEF_ADMIN', 'REGION_ADMIN'],
        pharmacies=pharmacy,
    ).exists():
        return True

    if has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ROSTER):
        return True

    return False


def anonymize_pharmacy_detail(detail: dict | None) -> dict | None:
    """
    Strip sensitive pharmacy fields. Keep only the suburb-level context.
    """
    if not isinstance(detail, dict):
        return detail

    suburb = detail.get('suburb')
    state = detail.get('state')
    postcode = detail.get('postcode')

    masked = {
        'id': detail.get('id'),
        'name': 'Anonymous Pharmacy',
        'suburb': suburb,
    }
    if state is not None:
        masked['state'] = state
    if postcode is not None:
        masked['postcode'] = postcode

    return masked


def _get_user_short_bio(user):
    """
    Retrieve the first non-empty short_bio from the user's onboarding profile(s),
    falling back to any short_bio directly on the user if present.
    """
    if not user:
        return None
    for attr in ("pharmacistonboarding", "otherstaffonboarding", "exploreronboarding"):
        profile = getattr(user, attr, None)
        if profile:
            bio = getattr(profile, "short_bio", None)
            if bio:
                return bio
    return getattr(user, "short_bio", None)


# class SyncUserMixin:
#     USER_FIELDS = ['username', 'first_name', 'last_name']
#     @staticmethod
#     def sync_user_fields(user_data_from_pop, user_instance):
#         updated_fields = []
#         for attr in SyncUserMixin.USER_FIELDS:
#             if attr in user_data_from_pop and getattr(user_instance, attr) != user_data_from_pop[attr]:
#                 setattr(user_instance, attr, user_data_from_pop[attr])
#                 updated_fields.append(attr)
#         if updated_fields:
#             user_instance.save(update_fields=updated_fields)


# === OnboardingVerificationMixin ===
# class OnboardingVerificationMixin:
#     """
#     Triggers individual verification tasks and one initial evaluation task.
#     """
#     def _trigger_verification_tasks(self, instance, is_create=False):
#         # Reset automated verification fields
#         verification_fields_to_reset = [f for f in instance._meta.fields if f.name.endswith('_verified')]
#         for field in verification_fields_to_reset:
#             setattr(instance, field.name, False)
        
#         note_fields_to_reset = [f for f in instance._meta.fields if f.name.endswith('_verification_note')]
#         for field in note_fields_to_reset:
#             setattr(instance, field.name, "")
            
#         instance.verified = False
        
#         update_fields = [f.name for f in verification_fields_to_reset] + [f.name for f in note_fields_to_reset] + ['verified']

#         # FIX: ADD THIS BLOCK TO RESET REFEREE STATUSES
#         # This ensures that when a referee is changed, the old rejection/confirmation is cleared.
#         referee_fields_to_reset = [
#             'referee1_confirmed', 'referee1_rejected',
#             'referee2_confirmed', 'referee2_rejected'
#         ]
#         for field_name in referee_fields_to_reset:
#             if hasattr(instance, field_name):
#                 setattr(instance, field_name, False)
#                 update_fields.append(field_name)

#         if update_fields:
#             instance.save(update_fields=list(set(update_fields)))

#         def schedule_orchestrator():
#             Schedule.objects.create(
#                 func='client_profile.tasks.run_all_verifications',
#                 args=f"'{instance._meta.model_name}',{instance.pk}",
#                 kwargs={'is_create': is_create},
#                 schedule_type=Schedule.ONCE,
#                 next_run=timezone.now() + timedelta(minutes=1),
#             )
#         transaction.on_commit(schedule_orchestrator)


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
        }

    def update(self, instance, validated_data):
        tab = (self.initial_data.get("tab") or "basic").strip().lower()
        submit = bool(validated_data.pop("submitted_for_verification", False))

        if tab != "basic":
            tab = "basic"

        if tab == "basic":
            return self._basic_tab(instance, validated_data, submit)
        return super().update(instance, validated_data)

    def _basic_tab(self, instance: OwnerOnboarding, vdata: dict, submit: bool):
        user_data = vdata.pop("user", {})
        update_fields: list[str] = []

        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        direct_fields = ["gender", "role", "chain_pharmacy", "number_of_pharmacies", "ahpra_number"]
        role_changed = "role" in vdata and vdata.get("role") != instance.role
        ahpra_changed = "ahpra_number" in vdata and vdata.get("ahpra_number") != instance.ahpra_number

        for field in direct_fields:
            if field in vdata:
                setattr(instance, field, vdata[field])
                update_fields.append(field)

        reset_ahpra = role_changed or ahpra_changed
        if reset_ahpra:
            instance.ahpra_verified = False
            instance.ahpra_verification_note = ""
            update_fields.extend(["ahpra_verified", "ahpra_verification_note"])

        first_submit = submit and not instance.submitted_for_verification
        if first_submit:
            instance.submitted_for_verification = True
            update_fields.append("submitted_for_verification")

        if submit:
            instance.verified = False
            update_fields.append("verified")

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # Notify on any update to this onboarding (manual review required).
        if update_fields:
            from .utils import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                pass

        # NOTE: AHPRA verification is handled manually to avoid automated scraping.
        # if submit and instance.role == "PHARMACIST":
        #     should_verify_ahpra = bool(instance.ahpra_number) and (
        #         ahpra_changed or not instance.ahpra_verified
        #     )
        #     if should_verify_ahpra:
        #         async_task(
        #             "client_profile.tasks.verify_ahpra_task",
        #             instance._meta.model_name,
        #             instance.pk,
        #             instance.ahpra_number,
        #             instance.user.first_name or "",
        #             instance.user.last_name or "",
        #             instance.user.email or "",
        #         )

        return instance

    def get_progress_percent(self, obj: OwnerOnboarding):
        user = getattr(obj, "user", None)
        checks = [
            bool(getattr(user, "username", None)),
            bool(getattr(user, "first_name", None)),
            bool(getattr(user, "last_name", None)),
            bool(getattr(user, "mobile_number", None)),
            bool(obj.role),
            bool(getattr(obj, "number_of_pharmacies", None)),
            bool(getattr(obj, "profile_photo")),
        ]
        if obj.role == "PHARMACIST":
            checks.append(bool(obj.ahpra_number))
            checks.append(bool(obj.ahpra_verified))

        filled = sum(1 for flag in checks if flag)
        return int(100 * filled / (len(checks) or 1))

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
        """
        Never expose raw TFN back to the client.
        TFNs are stored through the encrypted `tfn_number` field and masked on output.
        """
        tfn = getattr(obj, 'tfn_number', '') or ''
        if not tfn:
            return ''
        return f'*** *** {tfn[-3:]}'

    def _files_by_skill(self):
        """
        Accept files either as flat keys ('CBR') or nested 'skill_files[CBR]'.
        """
        req = self.context.get("request")
        out = {}
        if not req or not hasattr(req, "FILES"):
            return out
        for key, f in req.FILES.items():
            if key.startswith("skill_files[") and key.endswith("]"):
                code = key[len("skill_files["):-1]
                out[code] = f
            else:
                out[key] = f
        return out

    def _save_skill_file(self, user_id: int, code: str, uploaded_file):
        """
        Save to: skill_certs/<user_id>/<CODE>/<base>_<CODE>_<YYYYmmddHHMMSS>.<ext>
        (keeps historical versions; no deletes)
        """
        validate_uploaded_file(uploaded_file, DOCUMENT_UPLOAD_POLICY, f"skill certificate {code}")
        base, ext = os.path.splitext(uploaded_file.name or "certificate")
        safe = slugify(base) or "certificate"
        code_up = (code or "UNKNOWN").upper()
        ts = timezone.now().strftime("%Y%m%d%H%M%S")
        rel_path = f"skill_certs/{user_id}/{code_up}/{safe}_{code_up}_{ts}{ext.lower()}"
        return default_storage.save(rel_path, uploaded_file)

    def _list_existing(self, user_id: int, code: str):
        folder = f"skill_certs/{user_id}/{(code or 'UNKNOWN').upper()}/"
        try:
            _dirs, files = default_storage.listdir(folder)
        except Exception:
            return []
        return sorted(folder + name for name in files)

    # -------- progress --------
    def get_progress_percent(self, obj):
        user = getattr(obj, 'user', None)

        def _filled_str(x):
            return bool(x and str(x).strip())

        checks = [
            bool(getattr(user, 'username', None)),
            bool(getattr(user, 'first_name', None)),
            bool(getattr(user, 'last_name', None)),
            bool(getattr(user, 'mobile_number', None)),
            bool(getattr(obj, 'profile_photo', None)),
            bool(obj.gov_id_verified),
            bool(obj.ahpra_verified),
            bool(getattr(obj, 'referee1_confirmed', False)),
            bool(getattr(obj, 'referee2_confirmed', False)),
        ]

        # Address completeness counts as one unit
        addr_ok = all([
            _filled_str(getattr(obj, 'street_address', None)),
            _filled_str(getattr(obj, 'suburb', None)),
            _filled_str(getattr(obj, 'state', None)),
            _filled_str(getattr(obj, 'postcode', None)),
        ])
        checks.append(addr_ok)

        # Profile tab
        checks.append(bool(getattr(obj, 'resume', None)))
        checks.append(_filled_str(getattr(obj, 'short_bio', None)))

        # Payment contribution
        pref = (obj.payment_preference or '').upper()
        if pref == 'ABN':
            checks.append(bool(obj.abn) and bool(obj.abn_verified))
        elif pref == 'TFN':
            checks.append(bool(getattr(obj, 'tfn_number', None)))

        # Rates contribution (all fields)
        rp = getattr(obj, 'rate_preference', None) or {}
        checks.append(_filled_str(rp.get('weekday')))
        checks.append(_filled_str(rp.get('saturday')))
        checks.append(_filled_str(rp.get('sunday')))
        checks.append(_filled_str(rp.get('public_holiday')))
        early_ok = bool(rp.get('early_morning_same_as_day')) or _filled_str(rp.get('early_morning'))
        late_ok  = bool(rp.get('late_night_same_as_day'))   or _filled_str(rp.get('late_night'))
        checks.append(early_ok)
        checks.append(late_ok)

        # ---------- NEW: flip overall verified here, based on your gate ----------
        phone_ok = bool(getattr(user, 'is_mobile_verified', False))
        gate_ok = (
            bool(getattr(obj, 'referee1_confirmed', False)) and
            bool(getattr(obj, 'referee2_confirmed', False)) and
            bool(getattr(obj, 'ahpra_verified', False)) and
            phone_ok
        )
        if gate_ok and not bool(getattr(obj, 'verified', False)):
            try:
                obj.verified = True
                obj.save(update_fields=['verified'])
                # print("[VERIFY DEBUG] progress flip -> verified=True", {"pk": obj.pk}, flush=True)
            except Exception as e:
                # print("[VERIFY DEBUG] progress flip failed", {"pk": obj.pk, "err": str(e)}, flush=True)
                pass
        # ------------------------------------------------------------------------

        filled = sum(1 for x in checks if x)
        total = len(checks) or 1
        return int(100 * filled / total)

    # -------- update --------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = bool(self.initial_data.get('submitted_for_verification'))

        # --- Superuser notify: first-time submission gate (BASIC tab only) ---
        first_submit = submit and (tab == 'basic') and not bool(getattr(instance, 'submitted_for_verification', False))
        if first_submit:
            # Persist first submission so we don't email again
            instance.submitted_for_verification = True
            instance.save(update_fields=['submitted_for_verification'])

            # Local import avoids circular dependencies
            from .utils import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                # Never block user flow on email issues
                pass

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
    def _basic_tab(self, instance: PharmacistOnboarding, vdata: dict, submit: bool):
        # nested user data
        user_data = vdata.pop('user', {})

        update_fields = []

        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        # helper to compare file names safely
        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # We will handle government_id explicitly (to delete old files safely),
        # so do NOT include it in direct_fields.
        direct_fields = [
        'ahpra_number',
        'street_address', 'suburb', 'state', 'postcode', 'google_place_id',
        'open_to_travel', 'travel_states', 'coverage_radius_km',
        'date_of_birth', 'gender', 'emergency_contact_number', 'emergency_contact_relation',
        ]

        # Detect changes that affect verification flags
        ahpra_changed = 'ahpra_number' in vdata and (vdata.get('ahpra_number') != getattr(instance, 'ahpra_number'))

        # --- government_id: delete old file on replace or explicit clear ---
        # gov_id_changed = False
        # if 'government_id' in vdata:
        #     new_file = vdata.get('government_id')  # may be a file object or None
        #     old_file = getattr(instance, 'government_id', None)
        #     gov_id_changed = (_fname(new_file) != _fname(old_file))

        #     if new_file is None:
        #         # explicit clear
        #         if old_file:
        #             try:
        #                 _delete_file_if_unreferenced(old_file, current_instance=instance)   # Azure/local safe
        #             except Exception:
        #                 pass
        #         instance.government_id = None
        #         update_fields.append('government_id')
        #     else:
        #         # replacing: delete old first if it's different
        #         if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
        #             try:
        #                 _delete_file_if_unreferenced(old_file, current_instance=instance)
        #             except Exception:
        #                 pass
        #         instance.government_id = new_file
        #         update_fields.append('government_id')

        # regular writes for other basic fields
        for f in direct_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # round/quantize lat/lon to 6 dp if provided
        if 'latitude' in vdata:
            instance.latitude = q6(vdata.get('latitude'))
            update_fields.append('latitude')
        if 'longitude' in vdata:
            instance.longitude = q6(vdata.get('longitude'))
            update_fields.append('longitude')

        # reset only relevant flags when inputs changed
        if ahpra_changed:
            instance.ahpra_verified = False
            instance.ahpra_verification_note = ""
            update_fields += ['ahpra_verified', 'ahpra_verification_note']

        # if gov_id_changed:
        #     instance.gov_id_verified = False
        #     instance.gov_id_verification_note = ""
        #     update_fields += ['gov_id_verified', 'gov_id_verification_note']

        # full profile remains unverified until all tabs pass
        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # trigger ONLY the basic-tab tasks when submitting
        if submit:
            ahpra = vdata.get('ahpra_number', instance.ahpra_number)
            # gov   = vdata.get('government_id', instance.government_id)
            errors = {}
            if not ahpra:
                errors['ahpra_number'] = ['AHPRA number is required to submit.']
            # if not gov:
            #     errors['government_id'] = ['Government ID file is required to submit.']
            if errors:
                raise serializers.ValidationError(errors)

            # NOTE: AHPRA verification is handled manually to avoid automated scraping.
            # if instance.ahpra_number and (ahpra_changed or not instance.ahpra_verified):
            #     async_task(
            #         'client_profile.tasks.verify_ahpra_task',
            #         instance._meta.model_name, instance.pk,
            #         instance.ahpra_number, instance.user.first_name,
            #         instance.user.last_name, instance.user.email,
            #     )

            # GOV ID: file changed OR not verified yet
            # if instance.government_id and (gov_id_changed or not instance.gov_id_verified):
            #     async_task(
            #         'client_profile.tasks.verify_filefield_task',
            #         instance._meta.model_name, instance.pk,
            #         'government_id',
            #         instance.user.first_name or '',
            #         instance.user.last_name or '',
            #         instance.user.email or '',
            #         verification_field='gov_id_verified',
            #         note_field='gov_id_verification_note',
            #     )

        return instance

    def get_ahpra_years_since_first_registration(self, obj):
        return obj.ahpra_years_since_first_registration


    # ---------------- Identity TAB (new) ----------------
    def _identity_tab(self, instance: PharmacistOnboarding, vdata: dict, submit: bool):
        """
        Handles:
        - government_id_type (dropdown)
        - government_id (primary file)
        - identity_secondary_file (secondary file for paired docs)
        - identity_meta (JSON with per-type fields)
        Normalises per document type and validates on submit.
        """
        update_fields = []

        # helper to compare file names safely
        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # Track changes to drive verification resets
        type_changed = False
        gov_id_changed = False
        sec_changed = False
        meta_changed = False

        # --- type (dropdown) – optional
        if 'government_id_type' in vdata:
            new_type = vdata.get('government_id_type')
            type_changed = (new_type != getattr(instance, 'government_id_type'))
            instance.government_id_type = new_type
            update_fields.append('government_id_type')

            # If switching to a type that doesn't need a secondary file, clear it
            if new_type in ('DRIVER_LICENSE', 'AUS_PASSPORT', 'AGE_PROOF'):
                old_sec = getattr(instance, 'identity_secondary_file', None)
                if old_sec:
                    try:
                        _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception:
                        pass
                    instance.identity_secondary_file = None
                    update_fields.append('identity_secondary_file')
                    sec_changed = True

            # If type changes and no new meta provided, wipe old meta to avoid stale keys
            if 'identity_meta' not in vdata:
                instance.identity_meta = {}
                update_fields.append('identity_meta')
                meta_changed = True

        # --- primary file handling (replace / clear)
        if 'government_id' in vdata:
            new_file = vdata.get('government_id')
            old_file = getattr(instance, 'government_id', None)
            gov_id_changed = (_fname(new_file) != _fname(old_file))

            if new_file is None:
                if old_file:
                    try:
                        _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.government_id = None
                update_fields.append('government_id')
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    try:
                        _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.government_id = new_file
                update_fields.append('government_id')

        # --- secondary file handling (replace / clear)
        if 'identity_secondary_file' in vdata:
            new_sec = vdata.get('identity_secondary_file')  # may be file or None
            old_sec = getattr(instance, 'identity_secondary_file', None)
            sec_changed = (_fname(new_sec) != _fname(old_sec))

            if new_sec is None:
                if old_sec:
                    try:
                        _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception:
                        pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
            else:
                if old_sec and _fname(old_sec) and _fname(old_sec) != _fname(new_sec):
                    try:
                        _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception:
                        pass
                instance.identity_secondary_file = new_sec
                update_fields.append('identity_secondary_file')

        # --- identity_meta (JSON) – normalise per document type
        if 'identity_meta' in vdata:
            incoming_meta = vdata.get('identity_meta') or {}
            meta = dict(incoming_meta)  # shallow copy
            doc_type = getattr(instance, 'government_id_type')

            if doc_type == 'DRIVER_LICENSE':
                keep = {'state', 'expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}

            elif doc_type == 'VISA':
                # Visa + Overseas passport (secondary file)
                keep = {'visa_type_number', 'valid_to', 'passport_country', 'passport_expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}

            elif doc_type == 'AUS_PASSPORT':
                keep = {'expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}
                meta['country'] = 'Australia'

            elif doc_type == 'OTHER_PASSPORT':
                # Overseas passport + Visa (secondary file)
                keep = {'country', 'expiry', 'visa_type_number', 'valid_to'}
                meta = {k: v for k, v in meta.items() if k in keep}

            elif doc_type == 'AGE_PROOF':
                keep = {'state', 'expiry'}
                meta = {k: v for k, v in meta.items() if k in keep}

            # Detect change
            if meta != (instance.identity_meta or {}):
                instance.identity_meta = meta
                update_fields.append('identity_meta')
                meta_changed = True

        # --- reset verification flags if any relevant identity input changed
        if gov_id_changed or sec_changed or type_changed or meta_changed:
            instance.gov_id_verified = False
            instance.gov_id_verification_note = ""
            update_fields += ['gov_id_verified', 'gov_id_verification_note']

        # submitting this tab does not make the whole profile verified by itself
        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # --- Validate on submit (per type)
        if submit:
            errors = {}
            doc_type = getattr(instance, 'government_id_type')
            meta_now = getattr(instance, 'identity_meta') or {}

            if not doc_type:
                errors['government_id_type'] = ['Select a document type.']

            # Primary file required for all types
            if not getattr(instance, 'government_id', None):
                errors['government_id'] = ['This file is required.']

            if doc_type == 'DRIVER_LICENSE':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            elif doc_type == 'VISA':
                if not meta_now.get('visa_type_number'):  errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Overseas passport file is required with a Visa.']
                if not meta_now.get('passport_country'): errors['identity_meta.passport_country'] = ['Required.']
                if not meta_now.get('passport_expiry'):  errors['identity_meta.passport_expiry'] = ['Required.']

            elif doc_type == 'AUS_PASSPORT':
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
                # country forced to Australia in normalisation

            elif doc_type == 'OTHER_PASSPORT':
                if not meta_now.get('country'): errors['identity_meta.country'] = ['Required.']
                if not meta_now.get('expiry'):  errors['identity_meta.expiry'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Visa file is required with an Overseas passport.']
                if not meta_now.get('visa_type_number'): errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']

            elif doc_type == 'AGE_PROOF':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            if errors:
                raise serializers.ValidationError(errors)

            # On submit: schedule verification task if needed (primary file)
            if instance.government_id and (gov_id_changed or type_changed or meta_changed or not instance.gov_id_verified):
                async_task(
                    'client_profile.tasks.verify_filefield_task',
                    instance._meta.model_name, instance.pk,
                    'government_id',
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    verification_field='gov_id_verified',
                    note_field='gov_id_verification_note',
                )

        # Recompute final verified gate on every pass
        return instance

    # ---------------- Payment TAB ----------------
    def _payment_tab(self, instance: PharmacistOnboarding, vdata: dict, submit: bool):
        """
        Payment fields only. No GST file in V2.
        - ABN: task scrapes ABR fields; user must confirm => abn_verified=True
        - TFN: store through encrypted model field `tfn_number`, show only tfn_masked on reads
        - When pref=TFN and submit=True -> TFN + super_* are required
        """
        payment_fields = [
            'payment_preference', 'abn', 'gst_registered',
            'super_fund_name', 'super_usi', 'super_member_number',
            'abn_entity_confirmed',
        ]
        update_fields: list[str] = []

        # normalize pref for logic below
        pref_in = (vdata.get('payment_preference') or instance.payment_preference or '').upper()

        # 1) regular writes
        for f in payment_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # 2) TFN payload – client sends "tfn" (source='tfn_number'), DRF puts it in vdata['tfn_number']
        if 'tfn_number' in vdata:
            instance.tfn_number = (vdata['tfn_number'] or '').strip()
            update_fields.append('tfn_number')

        # 3) if ABN changed -> reset verification + confirmation
        abn_changed = ('abn' in vdata) and (vdata.get('abn') != getattr(instance, 'abn'))
        if abn_changed:
            instance.abn_verified = False
            instance.abn_entity_confirmed = False
            instance.abn_verification_note = ""
            update_fields += ['abn_verified', 'abn_entity_confirmed', 'abn_verification_note']

        # 4) confirmation gate: only user confirmation can set abn_verified=True
        if 'abn_entity_confirmed' in vdata:
            confirmed = bool(vdata['abn_entity_confirmed'])
            if confirmed and instance.abn_entity_name:   # must have scraped data to confirm
                instance.abn_verified = True
                if not instance.abn_verification_note:
                    instance.abn_verification_note = 'User confirmed ABN entity details.'
                update_fields += ['abn_verified', 'abn_verification_note']
            else:
                if instance.abn_verified:
                    instance.abn_verified = False
                    update_fields.append('abn_verified')

        # 5) optional sync of boolean gst_registered from ABR result if client didn’t send it
        if 'gst_registered' not in vdata:
            if instance.abn_gst_registered is True and not instance.gst_registered:
                instance.gst_registered = True
                update_fields.append('gst_registered')

        # 6) TFN validation: when submitting TFN path, enforce super_* required
        if submit and (pref_in or instance.payment_preference):
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'TFN':
                errors = {}
                if not instance.tfn_number:
                    errors['tfn'] = ['TFN is required.']
                if not instance.super_fund_name:
                    errors['super_fund_name'] = ['Super fund name is required for TFN.']
                if not instance.super_usi:
                    errors['super_usi'] = ['USI is required for TFN.']
                if not instance.super_member_number:
                    errors['super_member_number'] = ['Member number is required for TFN.']
                if errors:
                    raise serializers.ValidationError(errors)

        # 7) submitting this tab keeps the whole profile unverified until all tabs pass
        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # 8) run ABN task on submit (TFN has no task)
        if submit:
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'ABN' and instance.abn:
                async_task(
                    'client_profile.tasks.verify_abn_task',
                    instance._meta.model_name,
                    instance.pk,
                    instance.abn,
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    note_field='abn_verification_note',  # task will only fill ABR fields + note
                )
        return instance

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance, vdata: dict, submit: bool):
        """
        Two referees are required on submit.
        Required per referee: name, relation, workplace, email.
        If referee is already confirmed -> ignore edits (lock).
        On change for a pending referee -> reset confirmed/rejected + last_sent.
        On submit -> send referee emails (no final-eval). Scheduling happens in utils.
        """
        from .utils import send_referee_emails  # local import to avoid cycles
        update_fields = []

        def apply_ref(idx: int):
            prefix = f"referee{idx}_"
            locked = bool(getattr(instance, f"{prefix}confirmed", False))

            incoming = {
                'name': vdata.get(f"{prefix}name", getattr(instance, f"{prefix}name")),
                'relation': vdata.get(f"{prefix}relation", getattr(instance, f"{prefix}relation")),
                'email': clean_email(vdata.get(f"{prefix}email", getattr(instance, f"{prefix}email"))),
                'workplace': vdata.get(f"{prefix}workplace", getattr(instance, f"{prefix}workplace")),
            }

            if locked:
                return

            changed = False
            for key in ['name', 'relation', 'email', 'workplace']:
                field = f"{prefix}{key}"
                if field in vdata and getattr(instance, field) != incoming[key]:
                    setattr(instance, field, incoming[key])
                    update_fields.append(field)
                    changed = True

            if changed:
                if getattr(instance, f"{prefix}confirmed", False):
                    setattr(instance, f"{prefix}confirmed", False)
                    update_fields.append(f"{prefix}confirmed")
                if getattr(instance, f"{prefix}rejected", False):
                    setattr(instance, f"{prefix}rejected", False)
                    update_fields.append(f"{prefix}rejected")
                if getattr(instance, f"{prefix}last_sent", None) is not None:
                    setattr(instance, f"{prefix}last_sent", None)
                    update_fields.append(f"{prefix}last_sent")

        apply_ref(1)
        apply_ref(2)

        if submit:
            errors = {}
            for idx in [1, 2]:
                prefix = f"referee{idx}_"
                name = getattr(instance, f"{prefix}name")
                relation = getattr(instance, f"{prefix}relation")
                email = getattr(instance, f"{prefix}email")
                workplace = getattr(instance, f"{prefix}workplace")
                if not name:
                    errors[prefix + 'name'] = ['Required.']
                if not relation:
                    errors[prefix + 'relation'] = ['Required.']
                if not email:
                    errors[prefix + 'email'] = ['Required.']
                if not workplace:
                    errors[prefix + 'workplace'] = ['Required.']
            if errors:
                raise serializers.ValidationError(errors)

            if not instance.verified:
                instance.verified = False
                update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        if submit:
            send_referee_emails(instance, is_reminder=False)  # schedules per-ref inside
        return instance

    # ---------------- Skills tab ----------------
    def _skills_tab(self, instance, vdata: dict, submit: bool):
        """
        Rules:
        - Checking a skill is optional.
        - If a skill is checked, a certificate MUST exist (already saved or uploaded now).
        - We store per-skill file metadata in instance.skill_certificates (JSON).
        - This version deletes old files when replacing (and when a skill is unchecked) unless KEEP_SKILL_HISTORY=True.
        """
        # accept JSON string or list
        raw = self.initial_data.get("skills", vdata.get("skills", []))
        if isinstance(raw, str):
            try:
                skills = json.loads(raw)
            except Exception:
                raise serializers.ValidationError({"skills": "Must be a JSON array or list."})
        else:
            skills = list(raw or [])

        uploads = self._files_by_skill()
        cert_map = dict(instance.skill_certificates or {})
        user_id = instance.user_id

        # (A) If a skill was **unchecked/removed**, optionally delete its last stored file
        if not getattr(self, "KEEP_SKILL_HISTORY", False):
            removed_codes = [code for code in list(cert_map.keys()) if code not in skills]
            for code in removed_codes:
                old_path = (cert_map.get(code) or {}).get("path")
                if old_path:
                    try:
                        default_storage.delete(old_path)  # works with Azure Blob via django-storages
                    except Exception:
                        pass
                cert_map.pop(code, None)

        # (B) Save any uploaded files for checked skills
        #     Safe order: save the new file first; if it succeeds, delete the old one (if any).
        for code, f in uploads.items():
            if code in skills:
                # remember old path (if any)
                old_path = (cert_map.get(code) or {}).get("path")

                # save new file
                saved = self._save_skill_file(user_id, code, f)

                # delete old file unless we're keeping history
                if old_path and not getattr(self, "KEEP_SKILL_HISTORY", False):
                    try:
                        default_storage.delete(old_path)
                    except Exception:
                        # swallow storage deletion errors; user flow should not break
                        pass

                # point to the new file
                cert_map[code] = {
                    "path": saved,
                    "uploaded_at": timezone.now().isoformat(),
                }

        # (C) Validation: only skills that require certificates must have one
        required_codes = _required_cert_skill_codes("pharmacist")
        missing = [code for code in skills if code in required_codes and code not in cert_map]
        if missing:
            raise serializers.ValidationError(
                {"skills": f"Certificate required for checked skill(s): {', '.join(missing)}"}
            )

        # Persist
        instance.skills = skills
        instance.skill_certificates = cert_map
        instance.save(update_fields=["skills", "skill_certificates"])
        return instance

    # --------------- read-only summary for UI ---------------
    def get_skill_certificates(self, obj):
        """
        Return latest file per skill (by name sort). If you want all versions, expand here.
        """
        data = []
        for code, meta in (obj.skill_certificates or {}).items():
            path = (meta or {}).get("path")
            if not path:
                continue
            try:
                url = default_storage.url(path)
            except Exception:
                url = None
            data.append({"skill_code": code, "path": path, "url": url, "uploaded_at": meta.get("uploaded_at")})
        # stable order
        return sorted(data, key=lambda r: r["skill_code"])

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))

    # ---------------- Rate tab ----------------
    def _rate_tab(self, instance, vdata: dict, submit: bool):
        """
        Stores rate_preference JSON.
        Accepts stringified JSON or dict with keys:
        weekday, saturday, sunday, public_holiday, early_morning, late_night (strings),
        early_morning_same_as_day (bool), late_night_same_as_day (bool)
        """
        raw = self.initial_data.get('rate_preference', vdata.get('rate_preference'))
        if raw is None:
            # allow clearing: leave as-is if not provided
            return instance

        try:
            rp = json.loads(raw) if isinstance(raw, str) else dict(raw)
        except Exception:
            raise serializers.ValidationError({"rate_preference": "Must be a JSON object."})

        # Soft sanitize: ensure keys exist, store as strings/booleans
        def to_s(x): return '' if x is None else str(x)
        rp_norm = {
            "weekday": to_s(rp.get("weekday")),
            "saturday": to_s(rp.get("saturday")),
            "sunday": to_s(rp.get("sunday")),
            "public_holiday": to_s(rp.get("public_holiday")),
            "early_morning": to_s(rp.get("early_morning")),
            "late_night": to_s(rp.get("late_night")),
            "early_morning_same_as_day": bool(rp.get("early_morning_same_as_day", False)),
            "late_night_same_as_day": bool(rp.get("late_night_same_as_day", False)),
        }

        instance.rate_preference = rp_norm
        if submit:
            instance.verified = False  # stays unverified until all tabs pass
            instance.save(update_fields=["rate_preference", "verified"])
        else:
            instance.save(update_fields=["rate_preference"])

        return instance

    # ---------------- Profile tab ----------------
    def _profile_tab(self, instance, vdata: dict, submit: bool):
        """
        Profile tab: resume file + short note (short_bio).
        Behavior:
        - If a new resume is uploaded, delete the old file first (Azure + dev parity).
        - If resume is explicitly set to None, delete existing file.
        - short_bio is plain text, optional.
        """
        update_fields = []

        # Handle short_bio (optional)
        if 'short_bio' in vdata:
            instance.short_bio = vdata['short_bio']
            update_fields.append('short_bio')

        # Handle resume
        if 'resume' in vdata:
            new_file = vdata['resume']  # may be a file object or None
            old_file = getattr(instance, 'resume', None)

            if new_file is None:
                # explicit clear
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)  # Azure/local safe
                instance.resume = None
                update_fields.append('resume')
            else:
                # replace file: delete old first to mimic overwrite behavior everywhere
                if old_file:
                    try:
                        # delete only if name differs (optional; safe to always delete)
                        if getattr(old_file, 'name', None) != getattr(new_file, 'name', None):
                            _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        # swallow storage deletion errors to avoid blocking user save
                        pass
                instance.resume = new_file
                update_fields.append('resume')

        # Submit does not auto-verify anything here; keep profile unverified until all tabs pass
        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance


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
        tfn = getattr(obj, 'tfn_number', '') or ''
        if not tfn:
            return ''
        return f'*** *** {tfn[-3:]}'  # never expose full TFN

    def _files_by_skill(self):
        req = self.context.get("request")
        out = {}
        if not req or not hasattr(req, "FILES"):
            return out
        for key, f in req.FILES.items():
            if key.startswith("skill_files[") and key.endswith("]"):
                code = key[len("skill_files["):-1]
                out[code] = f
            else:
                out[key] = f
        return out

    def _save_skill_file(self, user_id: int, code: str, uploaded_file):
        validate_uploaded_file(uploaded_file, DOCUMENT_UPLOAD_POLICY, f"skill certificate {code}")
        base, ext = os.path.splitext(uploaded_file.name or "certificate")
        safe = slugify(base) or "certificate"
        code_up = (code or "UNKNOWN").upper()
        ts = timezone.now().strftime("%Y%m%d%H%M%S")
        rel_path = f"skill_certs/{user_id}/{code_up}/{safe}_{code_up}_{ts}{ext.lower()}"
        return default_storage.save(rel_path, uploaded_file)

    def _list_existing(self, user_id: int, code: str):
        folder = f"skill_certs/{user_id}/{(code or 'UNKNOWN').upper()}/"
        try:
            _dirs, files = default_storage.listdir(folder)
        except Exception:
            return []
        return sorted(folder + name for name in files)

    # -------- utility: regulatory requirements by role --------
    def _required_docs_for_role(self, instance):
        """
        Returns list of (field_name, verified_flag, note_field) tuples required for the selected role.
        """
        role = (instance.role_type or '').upper()
        mapping = {
            'INTERN': [
                ('ahpra_proof', 'ahpra_proof_verified', 'ahpra_proof_verification_note'),
                ('hours_proof', 'hours_proof_verified', 'hours_proof_verification_note'),
            ],
            'TECHNICIAN': [
                ('certificate', 'certificate_verified', 'certificate_verification_note'),
            ],
            'ASSISTANT': [
                ('certificate', 'certificate_verified', 'certificate_verification_note'),
            ],
            'STUDENT': [
                ('university_id', 'university_id_verified', 'university_id_verification_note'),
            ],
        }
        return mapping.get(role, [])

    # -------- progress --------
    def get_progress_percent(self, obj):
        user = getattr(obj, 'user', None)

        def _filled_str(x):
            return bool(x and str(x).strip())

        checks = [
            bool(getattr(user, 'username', None)),
            bool(getattr(user, 'first_name', None)),
            bool(getattr(user, 'last_name', None)),
            bool(getattr(user, 'mobile_number', None)),
            bool(getattr(obj, 'profile_photo', None)),
            bool(obj.gov_id_verified),
            bool(getattr(obj, 'referee1_confirmed', False)),
            bool(getattr(obj, 'referee2_confirmed', False)),
        ]

        # Address completeness counts as one unit
        addr_ok = all([
            _filled_str(getattr(obj, 'street_address', None)),
            _filled_str(getattr(obj, 'suburb', None)),
            _filled_str(getattr(obj, 'state', None)),
            _filled_str(getattr(obj, 'postcode', None)),
        ])
        checks.append(addr_ok)

        # Profile tab
        checks.append(bool(getattr(obj, 'resume', None)))
        checks.append(_filled_str(getattr(obj, 'short_bio', None)))

        # Payment contribution
        pref = (obj.payment_preference or '').upper()
        if pref == 'ABN':
            checks.append(bool(obj.abn) and bool(obj.abn_verified))
        elif pref == 'TFN':
            checks.append(bool(getattr(obj, 'tfn_number', None)))

        # Regulatory docs gate: all required docs for the role must be verified
        req = self._required_docs_for_role(obj)
        docs_ok = all(getattr(obj, verified_flag, False) for _, verified_flag, _ in req)
        checks.append(docs_ok)

        # Final verified flip (role-specific)
        phone_ok = bool(getattr(user, 'is_mobile_verified', False))
        gate_ok = (
            bool(getattr(obj, 'referee1_confirmed', False)) and
            bool(getattr(obj, 'referee2_confirmed', False)) and
            bool(getattr(obj, 'gov_id_verified', False))   and
            docs_ok and
            phone_ok
        )
        if gate_ok and not bool(getattr(obj, 'verified', False)):
            try:
                obj.verified = True
                obj.save(update_fields=['verified'])
                # print("[VERIFY DEBUG] otherstaff progress flip -> verified=True", {"pk": obj.pk}, flush=True)
            except Exception as e:
                # print("[VERIFY DEBUG] otherstaff progress flip failed", {"pk": obj.pk, "err": str(e)}, flush=True)
                pass

        filled = sum(1 for x in checks if x)
        total = len(checks) or 1
        return int(100 * filled / total)

    # ---------------- update router ----------------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = bool(self.initial_data.get('submitted_for_verification'))

        # --- Superuser notify: first-time submission gate (BASIC tab only) ---
        first_submit = submit and (tab == 'basic') and not bool(getattr(instance, 'submitted_for_verification', False))
        if first_submit:
            instance.submitted_for_verification = True
            instance.save(update_fields=['submitted_for_verification'])
            from .utils import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                pass

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
    def _basic_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        # nested user data
        user_data = vdata.pop('user', {})
        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        update_fields = []

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        # regular writes for basic fields (address + dob)
        direct_fields = [
            'street_address','suburb','state','postcode','google_place_id','open_to_travel','travel_states','coverage_radius_km','date_of_birth',
            'gender','emergency_contact_number','emergency_contact_relation',
            'role_type','classification_level','student_year','intern_half',  # allow role data in Basic if FE sends them early
        ]
        for f in direct_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # lat/lon rounding to 6 dp
        if 'latitude' in vdata:
            instance.latitude = q6(vdata.get('latitude'))
            update_fields.append('latitude')
        if 'longitude' in vdata:
            instance.longitude = q6(vdata.get('longitude'))
            update_fields.append('longitude')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    # ---------------- Identity TAB ----------------
    def _identity_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        update_fields = []

        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # track changes
        type_changed = False
        gov_id_changed = False
        sec_changed = False
        meta_changed = False

        # type
        if 'government_id_type' in vdata:
            new_type = vdata.get('government_id_type')
            type_changed = (new_type != getattr(instance, 'government_id_type'))
            instance.government_id_type = new_type
            update_fields.append('government_id_type')

            # wipe secondary doc when not needed
            if new_type in ('DRIVER_LICENSE', 'AUS_PASSPORT', 'AGE_PROOF'):
                old_sec = getattr(instance, 'identity_secondary_file', None)
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
                sec_changed = True

            # clear stale meta if not provided
            if 'identity_meta' not in vdata:
                instance.identity_meta = {}
                update_fields.append('identity_meta')
                meta_changed = True

        # primary file
        if 'government_id' in vdata:
            new_file = vdata.get('government_id')
            old_file = getattr(instance, 'government_id', None)
            gov_id_changed = (_fname(new_file) != _fname(old_file))
            if new_file is None:
                if old_file:
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = None
                update_fields.append('government_id')
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = new_file
                update_fields.append('government_id')

        # secondary file
        if 'identity_secondary_file' in vdata:
            new_sec = vdata.get('identity_secondary_file')
            old_sec = getattr(instance, 'identity_secondary_file', None)
            sec_changed = (_fname(new_sec) != _fname(old_sec)) or sec_changed
            if new_sec is None:
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
            else:
                if old_sec and _fname(old_sec) and _fname(old_sec) != _fname(new_sec):
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = new_sec
                update_fields.append('identity_secondary_file')

        # identity_meta normalisation per type
        if 'identity_meta' in vdata:
            incoming_meta = vdata.get('identity_meta') or {}
            meta = dict(incoming_meta)
            doc_type = getattr(instance, 'government_id_type')

            if doc_type == 'DRIVER_LICENSE':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}

            elif doc_type == 'VISA':
                meta = {k: v for k, v in meta.items() if k in {'visa_type_number','valid_to','passport_country','passport_expiry'}}

            elif doc_type == 'AUS_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'expiry'}}
                meta['country'] = 'Australia'

            elif doc_type == 'OTHER_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'country','expiry','visa_type_number','valid_to'}}

            elif doc_type == 'AGE_PROOF':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}

            if meta != (instance.identity_meta or {}):
                instance.identity_meta = meta
                update_fields.append('identity_meta')
                meta_changed = True

        # reset verification if any identity input changed
        if gov_id_changed or sec_changed or type_changed or meta_changed:
            instance.gov_id_verified = False
            instance.gov_id_verification_note = ""
            update_fields += ['gov_id_verified', 'gov_id_verification_note']

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # Validate on submit
        if submit:
            errors = {}
            doc_type = getattr(instance, 'government_id_type')
            meta_now = getattr(instance, 'identity_meta') or {}

            if not doc_type:
                errors['government_id_type'] = ['Select a document type.']
            if not getattr(instance, 'government_id', None):
                errors['government_id'] = ['This file is required.']

            if doc_type == 'DRIVER_LICENSE':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'VISA':
                if not meta_now.get('visa_type_number'):  errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Overseas passport file is required with a Visa.']
                if not meta_now.get('passport_country'): errors['identity_meta.passport_country'] = ['Required.']
                if not meta_now.get('passport_expiry'):  errors['identity_meta.passport_expiry'] = ['Required.']
            elif doc_type == 'AUS_PASSPORT':
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'OTHER_PASSPORT':
                if not meta_now.get('country'): errors['identity_meta.country'] = ['Required.']
                if not meta_now.get('expiry'):  errors['identity_meta.expiry'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Visa file is required with an Overseas passport.']
                if not meta_now.get('visa_type_number'): errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
            elif doc_type == 'AGE_PROOF':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            if errors:
                raise serializers.ValidationError(errors)

            # schedule verification task if needed
            if instance.government_id and (gov_id_changed or type_changed or meta_changed or not instance.gov_id_verified):
                async_task(
                    'client_profile.tasks.verify_filefield_task',
                    instance._meta.model_name, instance.pk,
                    'government_id',
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    verification_field='gov_id_verified',
                    note_field='gov_id_verification_note',
                )
        return instance

    # ---------------- Regulatory TAB ----------------
    def _regulatory_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        """
        Keeps your current role/subrole logic and per-role docs,
        but runs per-field resets and schedules file verifications.
        """
        update_fields = []
        file_fields = [
            'ahpra_proof','hours_proof','certificate','university_id','cpr_certificate','s8_certificate'
        ]

        def _fname(f):
            return getattr(f, 'name', None) if f else None

        # role classification inputs
        for f in ['role_type','classification_level','student_year','intern_half']:
            if f in vdata:
                if getattr(instance, f) != vdata[f]:
                    setattr(instance, f, vdata[f])
                    update_fields.append(f)

        # Handle each file: replace/clear safely; reset its verified flag on change
        def handle_file(field):
            changed = False
            if field in vdata:
                new_file = vdata.get(field)  # may be file or None
                old_file = getattr(instance, field, None)
                changed = (_fname(new_file) != _fname(old_file))
                if new_file is None:
                    if old_file:
                        try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                        except Exception: pass
                    setattr(instance, field, None)
                    update_fields.append(field)
                else:
                    if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                        try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                        except Exception: pass
                    setattr(instance, field, new_file)
                    update_fields.append(field)

                # reset verification when changed
                if changed:
                    vflag = f"{field}_verified"
                    vnote = f"{field}_verification_note"
                    if hasattr(instance, vflag):
                        setattr(instance, vflag, False)
                        update_fields.append(vflag)
                    if hasattr(instance, vnote):
                        setattr(instance, vnote, "")
                        update_fields.append(vnote)
            return changed

        changed_map = {f: handle_file(f) for f in file_fields}

        if submit:
            instance.verified = False
            update_fields.append('verified')

            # Validate required per role
            req = self._required_docs_for_role(instance)
            errors = {}
            for field, _, _ in req:
                if not getattr(instance, field, None):
                    errors[field] = ['This file is required for the selected role.']
            if errors:
                raise serializers.ValidationError(errors)

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # schedule verification tasks for any provided file that changed or is not verified
        if submit:
            for field, changed in changed_map.items():
                vflag = f"{field}_verified"
                if getattr(instance, field, None) and (changed or not getattr(instance, vflag, False)):
                    async_task(
                        'client_profile.tasks.verify_filefield_task',
                        instance._meta.model_name, instance.pk,
                        field,
                        instance.user.first_name or '',
                        instance.user.last_name or '',
                        instance.user.email or '',
                        verification_field=f"{field}_verified",
                        note_field=f"{field}_verification_note",
                    )
        return instance

    # ---------------- Payment TAB ----------------
    def _payment_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        payment_fields = [
            'payment_preference','abn','gst_registered',
            'super_fund_name','super_usi','super_member_number',
            'abn_entity_confirmed',
        ]
        update_fields: list[str] = []
        pref_in = (vdata.get('payment_preference') or instance.payment_preference or '').upper()

        # regular writes
        for f in payment_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # TFN
        if 'tfn_number' in vdata:
            instance.tfn_number = (vdata['tfn_number'] or '').strip()
            update_fields.append('tfn_number')

        # ABN changed -> reset
        abn_changed = ('abn' in vdata) and (vdata.get('abn') != getattr(instance, 'abn'))
        if abn_changed:
            instance.abn_verified = False
            instance.abn_entity_confirmed = False
            instance.abn_verification_note = ""
            update_fields += ['abn_verified','abn_entity_confirmed','abn_verification_note']

        # confirmation gate
        if 'abn_entity_confirmed' in vdata:
            confirmed = bool(vdata['abn_entity_confirmed'])
            if confirmed and instance.abn_entity_name:
                instance.abn_verified = True
                if not instance.abn_verification_note:
                    instance.abn_verification_note = 'User confirmed ABN entity details.'
                update_fields += ['abn_verified','abn_verification_note']
            else:
                if instance.abn_verified:
                    instance.abn_verified = False
                    update_fields.append('abn_verified')

        # optional sync gst_registered from ABR
        if 'gst_registered' not in vdata:
            if instance.abn_gst_registered is True and not instance.gst_registered:
                instance.gst_registered = True
                update_fields.append('gst_registered')

        # TFN path validation on submit
        if submit and (pref_in or instance.payment_preference):
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'TFN':
                errors = {}
                if not instance.tfn_number:
                    errors['tfn'] = ['TFN is required.']
                if not instance.super_fund_name:
                    errors['super_fund_name'] = ['Super fund name is required for TFN.']
                if not instance.super_usi:
                    errors['super_usi'] = ['USI is required for TFN.']
                if not instance.super_member_number:
                    errors['super_member_number'] = ['Member number is required for TFN.']
                if errors:
                    raise serializers.ValidationError(errors)

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # run ABN task on submit
        if submit:
            pref_effective = (pref_in or instance.payment_preference or '').upper()
            if pref_effective == 'ABN' and instance.abn:
                async_task(
                    'client_profile.tasks.verify_abn_task',
                    instance._meta.model_name, instance.pk,
                    instance.abn,
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    note_field='abn_verification_note',
                )
        return instance

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        from .utils import send_referee_emails
        update_fields = []

        def apply_ref(idx: int):
            prefix = f"referee{idx}_"
            locked = bool(getattr(instance, f"{prefix}confirmed", False))

            incoming = {
                'name': vdata.get(f"{prefix}name", getattr(instance, f"{prefix}name")),
                'relation': vdata.get(f"{prefix}relation", getattr(instance, f"{prefix}relation")),
                'email': clean_email(vdata.get(f"{prefix}email", getattr(instance, f"{prefix}email"))),
                'workplace': vdata.get(f"{prefix}workplace", getattr(instance, f"{prefix}workplace")),
            }
            if locked:
                return

            changed = False
            for key in ['name','relation','email','workplace']:
                field = f"{prefix}{key}"
                if field in vdata and getattr(instance, field) != incoming[key]:
                    setattr(instance, field, incoming[key])
                    update_fields.append(field)
                    changed = True

            if changed:
                for flag in ['confirmed','rejected']:
                    f = f"{prefix}{flag}"
                    if getattr(instance, f, False):
                        setattr(instance, f, False)
                        update_fields.append(f)
                last = f"{prefix}last_sent"
                if getattr(instance, last, None) is not None:
                    setattr(instance, last, None)
                    update_fields.append(last)

        apply_ref(1)
        apply_ref(2)

        if submit:
            errors = {}
            for idx in [1,2]:
                prefix = f"referee{idx}_"
                if not getattr(instance, f"{prefix}name"):       errors[prefix+'name'] = ['Required.']
                if not getattr(instance, f"{prefix}relation"):   errors[prefix+'relation'] = ['Required.']
                if not getattr(instance, f"{prefix}email"):      errors[prefix+'email'] = ['Required.']
                if not getattr(instance, f"{prefix}workplace"):  errors[prefix+'workplace'] = ['Required.']
            if errors:
                raise serializers.ValidationError(errors)
            if not instance.verified:
                instance.verified = False
                update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        if submit:
            send_referee_emails(instance, is_reminder=False)
        return instance

    # ---------------- Skills TAB ----------------
    def _skills_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        """
        Legacy-aligned Skills tab:
        - `skills`: list of codes (string or JSON array)
        - Per-skill certificate upload (must exist if the skill is selected)
        - `years_experience`: simple string bucket stored on the model
        """
        # 1) Parse skills array (accept JSON string or list)
        raw = self.initial_data.get("skills", vdata.get("skills", []))
        if isinstance(raw, str):
            try:
                skills = json.loads(raw)
            except Exception:
                raise serializers.ValidationError({"skills": "Must be a JSON array or list."})
        else:
            skills = list(raw or [])

        # 2) Years of experience (optional)
        yrs = self.initial_data.get("years_experience", vdata.get("years_experience", None))
        if yrs is not None:
            # store as plain string; keep legacy buckets (e.g. '', '0-1', '1-2', '2-3', '3-5', '5+')
            instance.years_experience = (yrs or "").strip()

        uploads = self._files_by_skill()                    # accepts both flat keys and skill_files[CODE]
        cert_map = dict(instance.skill_certificates or {})  # latest file per skill
        user_id = instance.user_id

        # 3) If a skill was unchecked, remove its stored certificate (unless keeping history)
        if not getattr(self, "KEEP_SKILL_HISTORY", False):
            removed = [code for code in list(cert_map.keys()) if code not in skills]
            for code in removed:
                old_path = (cert_map.get(code) or {}).get("path")
                if old_path:
                    try:
                        default_storage.delete(old_path)
                    except Exception:
                        pass
                cert_map.pop(code, None)

        # 4) Save any uploaded files for checked skills
        for code, f in uploads.items():
            if code in skills and f:
                # remember old path (if any)
                old_path = (cert_map.get(code) or {}).get("path")

                # save new file (keeps historical versions if you change _save_skill_file to do so)
                saved = self._save_skill_file(user_id, code, f)

                # delete old file unless keeping history
                if old_path and not getattr(self, "KEEP_SKILL_HISTORY", False):
                    try:
                        default_storage.delete(old_path)
                    except Exception:
                        pass

                # record new pointer
                cert_map[code] = {
                    "path": saved,
                    "uploaded_at": timezone.now().isoformat(),
                }

        # 5) Validation: only skills that require certificates must have one
        required_codes = _required_cert_skill_codes("otherstaff")
        missing = [code for code in skills if code in required_codes and code not in cert_map]
        if missing:
            raise serializers.ValidationError(
                {"skills": f"Certificate required for: {', '.join(missing)}"}
            )

        # 6) Persist changes
        instance.skills = skills
        instance.skill_certificates = cert_map

        # Save only the changed fields; include years_experience if we set it above
        update_fields = ["skills", "skill_certificates"]
        if yrs is not None:
            update_fields.append("years_experience")

        instance.save(update_fields=update_fields)
        return instance

    # ---------------- Profile TAB ----------------
    def _profile_tab(self, instance: OtherStaffOnboarding, vdata: dict, submit: bool):
        update_fields = []
        if 'short_bio' in vdata:
            instance.short_bio = vdata['short_bio']
            update_fields.append('short_bio')

        if 'resume' in vdata:
            new_file = vdata['resume']
            old_file = getattr(instance, 'resume', None)
            if new_file is None:
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
                instance.resume = None
                update_fields.append('resume')
            else:
                if old_file:
                    try:
                        if getattr(old_file, 'name', None) != getattr(new_file, 'name', None):
                            _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.resume = new_file
                update_fields.append('resume')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    # ---------------- read-only summary for UI ----------------
    def get_skill_certificates(self, obj):
        data = []
        for code, meta in (obj.skill_certificates or {}).items():
            path = (meta or {}).get("path")
            if not path:
                continue
            try:
                url = default_storage.url(path)
            except Exception:
                url = None
            data.append({"skill_code": code, "path": path, "url": url, "uploaded_at": meta.get("uploaded_at")})
        return sorted(data, key=lambda r: r["skill_code"])

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))

# helpers (reuse from your codebase if they already exist)
def q6(val):
    if val in (None, ""):
        return None
    try:
        return round(float(val), 6)
    except Exception:
        return None

def clean_email(s):
    return (s or "").strip().lower()

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
        user = getattr(obj, 'user', None)

        def _filled_str(x):
            return bool(x and str(x).strip())

        checks = [
            bool(getattr(user, 'username', None)),
            bool(getattr(user, 'first_name', None)),
            bool(getattr(user, 'last_name', None)),
            bool(getattr(user, 'mobile_number', None)),
            bool(getattr(obj, 'profile_photo', None)),
            bool(obj.gov_id_verified),
            bool(getattr(obj, 'referee1_confirmed', False)),
            bool(getattr(obj, 'referee2_confirmed', False)),
        ]

        # Address as one unit
        addr_ok = all([
            _filled_str(getattr(obj, 'street_address', None)),
            _filled_str(getattr(obj, 'suburb', None)),
            _filled_str(getattr(obj, 'state', None)),
            _filled_str(getattr(obj, 'postcode', None)),
        ])
        checks.append(addr_ok)

        # Interests present?
        interests_ok = bool(getattr(obj, 'interests', None))
        checks.append(interests_ok)

        # Profile
        checks.append(bool(getattr(obj, 'resume', None)))
        checks.append(_filled_str(getattr(obj, 'short_bio', None)))

        # Final flip
        phone_ok = bool(getattr(user, 'is_mobile_verified', False))
        gate_ok = (
            bool(getattr(obj, 'referee1_confirmed', False)) and
            bool(getattr(obj, 'referee2_confirmed', False)) and
            bool(getattr(obj, 'gov_id_verified', False))    and
            phone_ok
        )
        if gate_ok and not bool(getattr(obj, 'verified', False)):
            try:
                obj.verified = True
                obj.save(update_fields=['verified'])
            except Exception:
                pass

        filled = sum(1 for x in checks if x)
        total = len(checks) or 1
        return int(100 * filled / total)

    # ---------------- update router ----------------
    def update(self, instance, validated_data):
        tab = (self.initial_data.get('tab') or 'basic').strip().lower()
        submit = bool(self.initial_data.get('submitted_for_verification'))

        # first-time submission notify (Basic only)
        first_submit = submit and (tab == 'basic') and not bool(getattr(instance, 'submitted_for_verification', False))
        if first_submit:
            instance.submitted_for_verification = True
            instance.save(update_fields=['submitted_for_verification'])
            from .utils import notify_superuser_on_onboarding
            try:
                notify_superuser_on_onboarding(instance)
            except Exception:
                pass

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
    def _basic_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        # nested user data
        user_data = vdata.pop('user', {})
        if user_data:
            _update_locked_user_fields(instance.user, user_data)

        update_fields = []

        clear_photo = _should_clear_flag(self.initial_data, "profile_photo_clear")
        if "profile_photo" in vdata or clear_photo:
            new_photo = vdata.pop("profile_photo", None)
            old_photo = getattr(instance, "profile_photo", None)
            if new_photo is None and clear_photo:
                if old_photo:
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = None
                update_fields.append("profile_photo")
            elif new_photo is not None:
                if old_photo and _file_has_changed(new_photo, old_photo):
                    try:
                        _delete_file_if_unreferenced(old_photo, current_instance=instance)
                    except Exception:
                        pass
                instance.profile_photo = new_photo
                update_fields.append("profile_photo")

        # role + address
        direct_fields = [
            'role_type','gender','emergency_contact_number','emergency_contact_relation',
            'street_address','suburb','state','postcode','google_place_id','open_to_travel','travel_states','coverage_radius_km',
        ]
        for f in direct_fields:
            if f in vdata:
                setattr(instance, f, vdata[f])
                update_fields.append(f)

        # lat/lon rounding
        if 'latitude' in vdata:
            instance.latitude = q6(vdata.get('latitude'))
            update_fields.append('latitude')
        if 'longitude' in vdata:
            instance.longitude = q6(vdata.get('longitude'))
            update_fields.append('longitude')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    # ---------------- Identity TAB (identical behavior) ----------------
    def _identity_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        update_fields = []

        def _fname(f):
            return getattr(f, 'name', None) if f else None

        type_changed = False
        gov_id_changed = False
        sec_changed = False
        meta_changed = False

        # type
        if 'government_id_type' in vdata:
            new_type = vdata.get('government_id_type')
            type_changed = (new_type != getattr(instance, 'government_id_type'))
            instance.government_id_type = new_type
            update_fields.append('government_id_type')

            # clear secondary when not needed
            if new_type in ('DRIVER_LICENSE', 'AUS_PASSPORT', 'AGE_PROOF'):
                old_sec = getattr(instance, 'identity_secondary_file', None)
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
                sec_changed = True

            # clear stale meta if not provided
            if 'identity_meta' not in vdata:
                instance.identity_meta = {}
                update_fields.append('identity_meta')
                meta_changed = True

        # primary file
        if 'government_id' in vdata:
            new_file = vdata.get('government_id')
            old_file = getattr(instance, 'government_id', None)
            gov_id_changed = (_fname(new_file) != _fname(old_file))
            if new_file is None:
                if old_file:
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = None
                update_fields.append('government_id')
            else:
                if old_file and _fname(old_file) and _fname(old_file) != _fname(new_file):
                    try: _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception: pass
                instance.government_id = new_file
                update_fields.append('government_id')

        # secondary file
        if 'identity_secondary_file' in vdata:
            new_sec = vdata.get('identity_secondary_file')
            old_sec = getattr(instance, 'identity_secondary_file', None)
            sec_changed = (_fname(new_sec) != _fname(old_sec)) or sec_changed
            if new_sec is None:
                if old_sec:
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = None
                update_fields.append('identity_secondary_file')
            else:
                if old_sec and _fname(old_sec) and _fname(old_sec) != _fname(new_sec):
                    try: _delete_file_if_unreferenced(old_sec, current_instance=instance)
                    except Exception: pass
                instance.identity_secondary_file = new_sec
                update_fields.append('identity_secondary_file')

        # meta normalization
        if 'identity_meta' in vdata:
            incoming = vdata.get('identity_meta') or {}
            meta = dict(incoming)
            doc_type = getattr(instance, 'government_id_type')

            if doc_type == 'DRIVER_LICENSE':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}
            elif doc_type == 'VISA':
                meta = {k: v for k, v in meta.items() if k in {'visa_type_number','valid_to','passport_country','passport_expiry'}}
            elif doc_type == 'AUS_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'expiry'}}
                meta['country'] = 'Australia'
            elif doc_type == 'OTHER_PASSPORT':
                meta = {k: v for k, v in meta.items() if k in {'country','expiry','visa_type_number','valid_to'}}
            elif doc_type == 'AGE_PROOF':
                meta = {k: v for k, v in meta.items() if k in {'state','expiry'}}

            if meta != (instance.identity_meta or {}):
                instance.identity_meta = meta
                update_fields.append('identity_meta')
                meta_changed = True

        # reset verification
        if gov_id_changed or sec_changed or type_changed or meta_changed:
            instance.gov_id_verified = False
            instance.gov_id_verification_note = ""
            update_fields += ['gov_id_verified','gov_id_verification_note']

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        # validate + schedule on submit
        if submit:
            errors = {}
            doc_type = getattr(instance, 'government_id_type')
            meta_now = getattr(instance, 'identity_meta') or {}

            if not doc_type:
                errors['government_id_type'] = ['Select a document type.']
            if not getattr(instance, 'government_id', None):
                errors['government_id'] = ['This file is required.']

            if doc_type == 'DRIVER_LICENSE':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'VISA':
                if not meta_now.get('visa_type_number'):  errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Overseas passport file is required with a Visa.']
                if not meta_now.get('passport_country'): errors['identity_meta.passport_country'] = ['Required.']
                if not meta_now.get('passport_expiry'):  errors['identity_meta.passport_expiry'] = ['Required.']
            elif doc_type == 'AUS_PASSPORT':
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']
            elif doc_type == 'OTHER_PASSPORT':
                if not meta_now.get('country'): errors['identity_meta.country'] = ['Required.']
                if not meta_now.get('expiry'):  errors['identity_meta.expiry'] = ['Required.']
                if not getattr(instance, 'identity_secondary_file', None):
                    errors['identity_secondary_file'] = ['Visa file is required with an Overseas passport.']
                if not meta_now.get('visa_type_number'): errors['identity_meta.visa_type_number'] = ['Required.']
                if not meta_now.get('valid_to'):         errors['identity_meta.valid_to'] = ['Required.']
            elif doc_type == 'AGE_PROOF':
                if not meta_now.get('state'):  errors['identity_meta.state'] = ['Required.']
                if not meta_now.get('expiry'): errors['identity_meta.expiry'] = ['Required.']

            if errors:
                raise serializers.ValidationError(errors)

            # schedule verification task
            if instance.government_id and (gov_id_changed or type_changed or meta_changed or not instance.gov_id_verified):
                from django_q.tasks import async_task
                async_task(
                    'client_profile.tasks.verify_filefield_task',
                    instance._meta.model_name, instance.pk,
                    'government_id',
                    instance.user.first_name or '',
                    instance.user.last_name or '',
                    instance.user.email or '',
                    verification_field='gov_id_verified',
                    note_field='gov_id_verification_note',
                )
        return instance

    # ---------------- Interests TAB ----------------
    def _interests_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        """
        Accepts list or JSON string.
        Allowed (suggested) values: SHADOWING, VOLUNTEERING, PLACEMENT, JUNIOR_ASSISTANT
        """
        raw = self.initial_data.get('interests', vdata.get('interests'))
        if raw is None:
            return instance

        if isinstance(raw, str):
            try:
                vals = json.loads(raw)
            except Exception:
                raise serializers.ValidationError({"interests": "Must be a JSON array or list."})
        else:
            vals = list(raw or [])

        instance.interests = vals
        if submit:
            instance.verified = False
            instance.save(update_fields=['interests','verified'])
        else:
            instance.save(update_fields=['interests'])
        return instance

    # ---------------- Referees TAB ----------------
    def _referees_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        from .utils import send_referee_emails
        update_fields = []

        def apply_ref(idx: int):
            prefix = f"referee{idx}_"
            locked = bool(getattr(instance, f"{prefix}confirmed", False))
            incoming = {
                'name': vdata.get(f"{prefix}name", getattr(instance, f"{prefix}name")),
                'relation': vdata.get(f"{prefix}relation", getattr(instance, f"{prefix}relation")),
                'email': clean_email(vdata.get(f"{prefix}email", getattr(instance, f"{prefix}email"))),
                'workplace': vdata.get(f"{prefix}workplace", getattr(instance, f"{prefix}workplace")),
            }
            if locked:
                return
            changed = False
            for key in ['name','relation','email','workplace']:
                field = f"{prefix}{key}"
                if field in vdata and getattr(instance, field) != incoming[key]:
                    setattr(instance, field, incoming[key])
                    update_fields.append(field)
                    changed = True
            if changed:
                for flag in ['confirmed','rejected']:
                    f = f"{prefix}{flag}"
                    if getattr(instance, f, False):
                        setattr(instance, f, False)
                        update_fields.append(f)
                last = f"{prefix}last_sent"
                if getattr(instance, last, None) is not None:
                    setattr(instance, last, None)
                    update_fields.append(last)

        apply_ref(1)
        apply_ref(2)

        if submit:
            errors = {}
            for idx in [1,2]:
                prefix = f"referee{idx}_"
                if not getattr(instance, f"{prefix}name"):       errors[prefix+'name'] = ['Required.']
                if not getattr(instance, f"{prefix}relation"):   errors[prefix+'relation'] = ['Required.']
                if not getattr(instance, f"{prefix}email"):      errors[prefix+'email'] = ['Required.']
                if not getattr(instance, f"{prefix}workplace"):  errors[prefix+'workplace'] = ['Required.']
            if errors:
                raise serializers.ValidationError(errors)
            if not instance.verified:
                instance.verified = False
                update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))

        if submit:
            send_referee_emails(instance, is_reminder=False)
        return instance

    # ---------------- Profile TAB ----------------
    def _profile_tab(self, instance: ExplorerOnboarding, vdata: dict, submit: bool):
        update_fields = []
        if 'short_bio' in vdata:
            instance.short_bio = vdata['short_bio']
            update_fields.append('short_bio')

        if 'resume' in vdata:
            new_file = vdata['resume']
            old_file = getattr(instance, 'resume', None)
            if new_file is None:
                if old_file:
                    _delete_file_if_unreferenced(old_file, current_instance=instance)
                instance.resume = None
                update_fields.append('resume')
            else:
                if old_file:
                    try:
                        if getattr(old_file, 'name', None) != getattr(new_file, 'name', None):
                            _delete_file_if_unreferenced(old_file, current_instance=instance)
                    except Exception:
                        pass
                instance.resume = new_file
                update_fields.append('resume')

        if submit:
            instance.verified = False
            update_fields.append('verified')

        if update_fields:
            instance.save(update_fields=list(set(update_fields)))
        return instance

    def get_profile_photo_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), getattr(obj, "profile_photo", None))

# === Dashboards ===
class ShiftSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    pharmacy_name = serializers.CharField()
    date = serializers.DateField()

class OwnerDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()
    upcoming_shifts_count = serializers.IntegerField()
    confirmed_shifts_count = serializers.IntegerField()
    shifts = ShiftSummarySerializer(many=True)
    bills_summary = serializers.DictField()

class PharmacistDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()
    upcoming_shifts_count = serializers.IntegerField()
    confirmed_shifts_count = serializers.IntegerField()
    community_shifts_count = serializers.IntegerField()
    shifts = ShiftSummarySerializer(many=True)
    community_shifts = ShiftSummarySerializer(many=True)
    bills_summary = serializers.DictField()

class OtherStaffDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()
    upcoming_shifts_count = serializers.IntegerField()
    confirmed_shifts_count = serializers.IntegerField()
    community_shifts_count = serializers.IntegerField()
    shifts = ShiftSummarySerializer(many=True)
    community_shifts = ShiftSummarySerializer(many=True)
    bills_summary = serializers.DictField()

class ExplorerDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()

class PharmacySerializer(RemoveOldFilesMixin, UploadValidationMixin, serializers.ModelSerializer):
    # explicitly declare your FileFields so DRF will return the URLs
    methadone_s8_protocols = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    qld_sump_docs = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    sops = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    induction_guides = serializers.FileField(
        use_url=True, allow_null=True, required=False
    )
    has_chain = serializers.SerializerMethodField()
    claimed   = serializers.SerializerMethodField()
    claim_status = serializers.SerializerMethodField()
    claim_request_id = serializers.SerializerMethodField()
    public_holiday_dates = serializers.SerializerMethodField()
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    submitted_for_verification = serializers.BooleanField(write_only=True, required=False)
    file_fields = [
        'methadone_s8_protocols',
        'qld_sump_docs',
        'sops',
        'induction_guides',
    ]
    abn = serializers.CharField(required=True, allow_blank=False)
    upload_validation_map = {
        "methadone_s8_protocols": DOCUMENT_UPLOAD_POLICY,
        "qld_sump_docs": DOCUMENT_UPLOAD_POLICY,
        "sops": DOCUMENT_UPLOAD_POLICY,
        "induction_guides": DOCUMENT_UPLOAD_POLICY,
    }

    class Meta:
        model = Pharmacy

        fields = [
            "id",
            "name",
            "email",
            "street_address",
            "suburb",
            "postcode",
            "google_place_id",
            "latitude",
            "longitude",
            "state",
            "owner",
            "organization",
            "verified",
            "abn",
            "abn_entity_name",
            "abn_entity_type",
            "abn_status",
            "abn_gst_registered",
            "abn_gst_from",
            "abn_gst_to",
            "abn_last_checked",
            "abn_entity_confirmed",
            "abn_verification_note",
            "timezone",
            # "asic_number",
            # your file fields:
            "methadone_s8_protocols",
            "qld_sump_docs",
            "sops",
            "induction_guides",
            # hours:
            "weekdays_start",
            "weekdays_end",
            "monday_start",
            "monday_end",
            "monday_closed",
            "tuesday_start",
            "tuesday_end",
            "tuesday_closed",
            "wednesday_start",
            "wednesday_end",
            "wednesday_closed",
            "thursday_start",
            "thursday_end",
            "thursday_closed",
            "friday_start",
            "friday_end",
            "friday_closed",
            "saturdays_start",
            "saturdays_end",
            "saturdays_closed",
            "sundays_start",
            "sundays_end",
            "sundays_closed",
            "public_holidays_start",
            "public_holidays_end",
            "public_holidays_closed",
            "public_holiday_dates",
            # arrays:
            "employment_types",
            "roles_needed",
            # rates & about:
            "default_rate_type",
            "default_fixed_rate",
            "rate_weekday",
            "rate_saturday",
            "rate_sunday",
            "rate_public_holiday",
            "rate_early_morning",
            "rate_late_night",
            "about",
            "auto_publish_worker_requests",

            'has_chain',
            'claimed',
            'claim_status',
            'claim_request_id',
            'submitted_for_verification',
        ]

        read_only_fields = ["owner", "organization", "verified"]
        extra_kwargs = {
            "abn_entity_name": {"read_only": True},
            "abn_entity_type": {"read_only": True},
            "abn_status": {"read_only": True},
            "abn_gst_registered": {"read_only": True},
            "abn_gst_from": {"read_only": True},
            "abn_gst_to": {"read_only": True},
            "abn_last_checked": {"read_only": True},
            "abn_verification_note": {"read_only": True},
        }

    _weekday_day_names = ("monday", "tuesday", "wednesday", "thursday", "friday")
    _hours_day_names = _weekday_day_names + ("saturdays", "sundays", "public_holidays")

    def get_public_holiday_dates(self, obj):
        from client_profile.services import PUBLIC_HOLIDAYS, _normalize_state_code

        state_code = _normalize_state_code(getattr(obj, "state", ""))
        return PUBLIC_HOLIDAYS.get(state_code, [])

    def _apply_weekday_hours_compat(self, attrs):
        weekday_start = attrs.get("weekdays_start", serializers.empty)
        weekday_end = attrs.get("weekdays_end", serializers.empty)

        if weekday_start is not serializers.empty:
            for day_name in self._weekday_day_names:
                if not attrs.get(f"{day_name}_closed", getattr(self.instance, f"{day_name}_closed", False) if self.instance else False):
                    attrs.setdefault(f"{day_name}_start", weekday_start)
        if weekday_end is not serializers.empty:
            for day_name in self._weekday_day_names:
                if not attrs.get(f"{day_name}_closed", getattr(self.instance, f"{day_name}_closed", False) if self.instance else False):
                    attrs.setdefault(f"{day_name}_end", weekday_end)

        monday_start = attrs.get("monday_start", serializers.empty)
        monday_end = attrs.get("monday_end", serializers.empty)
        if "weekdays_start" not in attrs and monday_start is not serializers.empty:
            attrs["weekdays_start"] = monday_start
        if "weekdays_end" not in attrs and monday_end is not serializers.empty:
            attrs["weekdays_end"] = monday_end

        return attrs

    def _clear_closed_day_hours(self, attrs):
        for day_name in self._hours_day_names:
            closed_key = f"{day_name}_closed"
            is_closed = attrs.get(
                closed_key,
                getattr(self.instance, closed_key, False) if self.instance else False,
            )
            if is_closed:
                attrs[f"{day_name}_start"] = None
                attrs[f"{day_name}_end"] = None
        if any(attrs.get(f"{day_name}_closed") for day_name in self._weekday_day_names):
            attrs["weekdays_start"] = None
            attrs["weekdays_end"] = None
        return attrs

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance and "abn" in attrs:
            incoming_abn = attrs.get("abn")
            current_abn = getattr(self.instance, "abn", None)
            is_locked = bool(
                getattr(self.instance, "abn_verified", False)
                and getattr(self.instance, "abn_entity_confirmed", False)
            )
            if is_locked and incoming_abn != current_abn:
                raise serializers.ValidationError(
                    {"abn": ["This ABN is locked after verification and confirmation."]}
                )
        attrs = self._apply_weekday_hours_compat(attrs)
        return self._clear_closed_day_hours(attrs)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        weekday_start = data.get("weekdays_start")
        weekday_end = data.get("weekdays_end")
        for day_name in self._weekday_day_names:
            start_key = f"{day_name}_start"
            end_key = f"{day_name}_end"
            if not data.get(start_key):
                data[start_key] = weekday_start
            if not data.get(end_key):
                data[end_key] = weekday_end
        if not weekday_start:
            data["weekdays_start"] = data.get("monday_start")
        if not weekday_end:
            data["weekdays_end"] = data.get("monday_end")
        return data

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_has_chain(self, obj) -> bool:
        if not obj.owner:
            return False
        return Chain.objects.filter(owner=obj.owner, pharmacies=obj).exists()



    @extend_schema_field(OpenApiTypes.BOOL)
    def get_claimed(self, obj) -> bool:
        if obj.organization_id:
            return True
        return obj.claims.filter(status__in=["PENDING", "ACCEPTED"]).exists()

    def _get_active_claim(self, obj):
        cached = getattr(obj, "_active_pharmacy_claim", None)
        if cached is not None:
            return cached
        claim = obj.claims.filter(status__in=["PENDING", "ACCEPTED"]).order_by('-created_at').first()
        setattr(obj, "_active_pharmacy_claim", claim)
        return claim

    def get_claim_status(self, obj):
        claim = self._get_active_claim(obj)
        return claim.status if claim else None

    def get_claim_request_id(self, obj):
        claim = self._get_active_claim(obj)
        return claim.id if claim else None

    def validate_abn(self, value: str) -> str:
        digits = ''.join(ch for ch in value if ch.isdigit())
        if len(digits) != 11:
            raise serializers.ValidationError("ABN must be 11 digits.")
        # store normalized (digits only)
        return digits

    def validate_state(self, value):
        if not value:
            return value
        v = value.strip()
        long_to_short = {
            "NEW SOUTH WALES": "NSW",
            "QUEENSLAND": "QLD",
            "VICTORIA": "VIC",
            "SOUTH AUSTRALIA": "SA",
            "WESTERN AUSTRALIA": "WA",
            "TASMANIA": "TAS",
            "AUSTRALIAN CAPITAL TERRITORY": "ACT",
            "NORTHERN TERRITORY": "NT",
        }
        upper = v.upper()
        if upper in long_to_short:
            return long_to_short[upper]
        allowed = {"QLD","NSW","VIC","SA","WA","TAS","ACT","NT"}
        if upper not in allowed:
            raise serializers.ValidationError("Invalid Australian state/territory.")
        return upper

    def _owner_identity_for_abn(self, instance: Pharmacy):
        owner_user = getattr(getattr(instance, "owner", None), "user", None)
        return (
            getattr(owner_user, "first_name", "") or "",
            getattr(owner_user, "last_name", "") or "",
            getattr(owner_user, "email", "") or "",
        )

    def _apply_abn_side_effects(
        self,
        instance: Pharmacy,
        *,
        previous_abn: str | None,
        submitted_for_verification: bool,
        confirmation_provided: bool,
        confirmation_value: bool,
    ) -> None:
        update_fields: list[str] = []
        current_abn = getattr(instance, "abn", None)
        abn_changed = previous_abn != current_abn

        if abn_changed:
            instance.abn_verified = False
            instance.abn_entity_confirmed = False
            instance.abn_entity_name = None
            instance.abn_entity_type = None
            instance.abn_status = None
            instance.abn_gst_registered = None
            instance.abn_gst_from = None
            instance.abn_gst_to = None
            instance.abn_last_checked = None
            instance.abn_verification_note = ""
            update_fields.extend([
                "abn_verified",
                "abn_entity_confirmed",
                "abn_entity_name",
                "abn_entity_type",
                "abn_status",
                "abn_gst_registered",
                "abn_gst_from",
                "abn_gst_to",
                "abn_last_checked",
                "abn_verification_note",
            ])

        if confirmation_provided:
            instance.abn_entity_confirmed = confirmation_value
            update_fields.append("abn_entity_confirmed")
            if confirmation_value and instance.abn_entity_name:
                instance.abn_verified = True
                if not instance.abn_verification_note:
                    instance.abn_verification_note = "User confirmed ABN entity details."
                update_fields.extend(["abn_verified", "abn_verification_note"])
            else:
                instance.abn_verified = False
                update_fields.append("abn_verified")

        if update_fields:
            instance.save(update_fields=list(dict.fromkeys(update_fields)))

        if submitted_for_verification and instance.abn:
            first_name, last_name, email = self._owner_identity_for_abn(instance)

            def enqueue_abn_check():
                async_task(
                    "client_profile.tasks.verify_abn_task",
                    instance._meta.model_name,
                    instance.pk,
                    instance.abn,
                    first_name,
                    last_name,
                    email,
                    note_field="abn_verification_note",
                )

            transaction.on_commit(enqueue_abn_check)

    def create(self, validated_data):
        submitted_for_verification = bool(validated_data.pop("submitted_for_verification", False))
        confirmation_provided = "abn_entity_confirmed" in validated_data
        confirmation_value = bool(validated_data.pop("abn_entity_confirmed", False))
        instance = super().create(validated_data)
        self._apply_abn_side_effects(
            instance,
            previous_abn=None,
            submitted_for_verification=submitted_for_verification,
            confirmation_provided=confirmation_provided,
            confirmation_value=confirmation_value,
        )
        return instance

    def update(self, instance, validated_data):
        submitted_for_verification = bool(validated_data.pop("submitted_for_verification", False))
        confirmation_provided = "abn_entity_confirmed" in validated_data
        confirmation_value = bool(validated_data.pop("abn_entity_confirmed", False))
        previous_abn = instance.abn
        instance = super().update(instance, validated_data)
        self._apply_abn_side_effects(
            instance,
            previous_abn=previous_abn,
            submitted_for_verification=submitted_for_verification,
            confirmation_provided=confirmation_provided,
            confirmation_value=confirmation_value,
        )
        return instance


class PharmacyClaimSerializer(serializers.ModelSerializer):
    pharmacy = serializers.SerializerMethodField()
    organization = serializers.SerializerMethodField()
    requested_by_user = UserProfileSerializer(source='requested_by', read_only=True)
    responded_by_user = UserProfileSerializer(source='responded_by', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    can_respond = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyClaim
        fields = [
            'id',
            'pharmacy',
            'organization',
            'status',
            'status_display',
            'message',
            'response_message',
            'requested_by',
            'requested_by_user',
            'responded_by',
            'responded_by_user',
            'responded_at',
            'can_respond',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'pharmacy',
            'organization',
            'requested_by_user',
            'responded_by_user',
            'responded_at',
            'created_at',
            'updated_at',
            'status_display',
            'requested_by',
            'responded_by',
            'can_respond',
        ]

    def get_pharmacy(self, obj):
        pharmacy = obj.pharmacy
        owner = getattr(pharmacy, "owner", None)
        owner_user = getattr(owner, "user", None)
        owner_payload = None
        if owner_user:
            owner_payload = {
                "id": owner.id,
                "user_id": owner_user.id,
                "email": owner_user.email,
                "first_name": owner_user.first_name,
                "last_name": owner_user.last_name,
            }
        return {
            "id": pharmacy.id,
            "name": pharmacy.name,
            "email": pharmacy.email,
            "organization_id": pharmacy.organization_id,
            "owner": owner_payload,
        }

    def get_organization(self, obj):
        org = obj.organization
        return {"id": org.id, "name": org.name}

    def get_can_respond(self, obj):
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            return False
        user = request.user
        if not user or not user.is_authenticated:
            return False
        owner = getattr(obj.pharmacy, "owner", None)
        owner_user = getattr(owner, "user", None)
        return owner_user and owner_user.id == user.id and obj.status == PharmacyClaim.Status.PENDING


class PharmacyClaimCreateSerializer(serializers.Serializer):
    pharmacy_id = serializers.IntegerField(required=False)
    pharmacy_email = serializers.EmailField(required=False)
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("pharmacy_id") and not attrs.get("pharmacy_email"):
            raise serializers.ValidationError("Provide either pharmacy_id or pharmacy_email.")
        return attrs

class ChainSerializer(RemoveOldFilesMixin, UploadValidationMixin, serializers.ModelSerializer):
    file_fields = ['logo']
    upload_validation_map = {
        "logo": IMAGE_UPLOAD_POLICY,
    }
    # nested readout of pharmacies
    pharmacies = PharmacySerializer(many=True, read_only=True)
    # write-only field to set pharmacies by ID list
    pharmacy_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        queryset=Pharmacy.objects.all(),
        source='pharmacies'
    )

    class Meta:
        model = Chain
        fields = [
            'id', 'owner', 'organization', 'name', 'logo',
            'subscription_plan','primary_contact_email',
            'is_active','created_at','updated_at',
            'pharmacies','pharmacy_ids'
        ]
        read_only_fields = ['owner','organization','created_at','updated_at', 'is_active']

MAX_ACTIVE_PHARMACY_MEMBERSHIPS = 3


def _count_active_memberships(user, exclude_membership_id=None):
    if not user:
        return 0
    qs = Membership.objects.filter(
        user=user,
        is_active=True,
        status=Membership.Status.ACCEPTED,
    )
    if exclude_membership_id:
        qs = qs.exclude(pk=exclude_membership_id)
    return qs.count()

ROLE_REQUIRED_USER_ROLE = {
    "PHARMACIST": "PHARMACIST",
    "INTERN": "OTHER_STAFF",
    "STUDENT": "OTHER_STAFF",
    "TECHNICIAN": "OTHER_STAFF",
    "ASSISTANT": "OTHER_STAFF",
}


def required_user_role_for_membership(role):
    if not role:
        return None
    return ROLE_REQUIRED_USER_ROLE.get(role)


class MembershipSerializer(serializers.ModelSerializer):
    user_details = UserProfileSerializer(source='user', read_only=True)
    invited_by_details = UserProfileSerializer(source='invited_by', read_only=True)
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    is_pharmacy_owner = serializers.SerializerMethodField()
    is_pharmacy_admin = serializers.SerializerMethodField()
    admin_level = serializers.SerializerMethodField()
    admin_level_label = serializers.SerializerMethodField()
    admin_level_description = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = [
            'id', 'user', 'user_details', 'pharmacy', 'pharmacy_detail', 'invited_by', 'invited_by_details',
            'invited_name', 'role', 'employment_type', 'is_active', 'created_at', 'updated_at',
            'status', 'responded_at',
            'job_title',
            # All classification fields are included and will be handled automatically
            'pharmacist_award_level',
            'otherstaff_classification_level',
            'intern_half',
            'student_year',
            'staff_category',
            'is_pharmacy_owner',
            'is_pharmacy_admin',
            'admin_level',
            'admin_level_label',
            'admin_level_description',
        ]
        read_only_fields = [
            'invited_by', 'invited_by_details', 'created_at', 'updated_at', 'is_pharmacy_owner',
            'is_pharmacy_admin',
            'admin_level',
            'admin_level_label',
            'admin_level_description',
            'responded_at',
        ]

    # No 'create' method needed. The default ModelSerializer.create() works perfectly
    # because all the classification fields are listed in Meta.fields. It will
    # create the new Membership object and save all provided fields in one step.


    def validate(self, attrs):
        """
        Validate and keep Membership data consistent:
        - Prevent assigning a role that conflicts with user's onboarding profile.
        - Enforce maximum active memberships per user.
        - Default employment_type for Pharmacy Admin if missing.
        - Clear irrelevant classification fields when role changes.
        """

        user = attrs.get('user', getattr(self.instance, 'user', None))
        role = attrs.get('role', getattr(self.instance, 'role', None))
        employment_type = attrs.get('employment_type', getattr(self.instance, 'employment_type', None))

        if role == 'PHARMACY_ADMIN':
            raise serializers.ValidationError({
                'role': 'Use the pharmacy admin management endpoints to assign admin roles.'
            })

        # --- (1) Enforce active membership limit ---
        if user:
            if self.instance:
                will_be_active = attrs.get('is_active', self.instance.is_active)
                if will_be_active and not self.instance.is_active:
                    current_active = _count_active_memberships(user, exclude_membership_id=self.instance.pk)
                    if current_active >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                        raise serializers.ValidationError({
                            'is_active': f'User already belongs to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'
                        })
            else:
                if _count_active_memberships(user) >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                    raise serializers.ValidationError({
                        'user': f'User already belongs to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'
                    })

        # --- (2) Enforce role consistency with user onboarding ---
        if user:
            pharmacist_onboard = getattr(user, 'pharmacistonboarding', None)
            otherstaff_onboard = getattr(user, 'otherstaffonboarding', None)
            explorer_onboard = getattr(user, 'exploreronboarding', None)

            # Pharmacist accounts
            if pharmacist_onboard and role not in ['PHARMACIST']:
                raise serializers.ValidationError({
                    'role': 'This user is a Pharmacist and can only be assigned as PHARMACIST.'
                })

            # Other staff (interns, assistants, etc.)
            if otherstaff_onboard:
                onboard_role = otherstaff_onboard.role_type
                if onboard_role == 'INTERN' and role != 'INTERN':
                    raise serializers.ValidationError({
                        'role': 'This user is onboarded as an Intern and cannot be invited as another role.'
                    })
                elif onboard_role == 'TECHNICIAN' and role != 'TECHNICIAN':
                    raise serializers.ValidationError({
                        'role': 'This user is onboarded as a Technician and cannot be invited as another role.'
                    })
                elif onboard_role == 'ASSISTANT' and role != 'ASSISTANT':
                    raise serializers.ValidationError({
                        'role': 'This user is onboarded as an Assistant and cannot be invited as another role.'
                    })

            # Explorer users
            if explorer_onboard:
                raise serializers.ValidationError({
                    'role': 'Explorer users cannot be added to pharmacies.'
                })

        # --- (3) Enforce user-role mapping if defined globally ---
        required_user_role = required_user_role_for_membership(role)
        user_role = getattr(user, 'role', None) if user else None
        if required_user_role and user_role and user_role != required_user_role:
            role_label = dict(Membership.ROLE_CHOICES).get(role, role)
            required_label = dict(User.ROLE_CHOICES).get(required_user_role, required_user_role)
            actual_label = dict(User.ROLE_CHOICES).get(user_role, user_role)
            identifier = getattr(user, 'email', getattr(user, 'username', 'This user'))
            raise serializers.ValidationError({
                'role': (
                    f'{identifier} is registered as {actual_label} and cannot be assigned the {role_label} role. '
                    f'Ask them to complete the {required_label} onboarding first.'
                )
            })

        job_title_value = attrs.get('job_title', getattr(self.instance, 'job_title', '') if self.instance else '')
        job_title_value = (job_title_value or '').strip()
        full_staff_types = {'FULL_TIME', 'PART_TIME'}
        if employment_type in full_staff_types:
            if not job_title_value:
                raise serializers.ValidationError({
                    'job_title': 'Job title is required for full or part-time staff.'
                })
            attrs['job_title'] = job_title_value
        else:
            attrs['job_title'] = ''

        # --- (4) Default employment type for Pharmacy Admin ---
        # --- (5) Role-based cleanup of classification fields ---
        def clear(*fields):
            for f in fields:
                if f in attrs:
                    attrs[f] = None

        if role == 'PHARMACIST':
            clear('otherstaff_classification_level', 'intern_half', 'student_year')
        elif role in ('ASSISTANT', 'TECHNICIAN'):
            clear('pharmacist_award_level', 'intern_half', 'student_year')
        elif role == 'INTERN':
            clear('pharmacist_award_level', 'otherstaff_classification_level', 'student_year')
        elif role == 'STUDENT':
            clear('pharmacist_award_level', 'otherstaff_classification_level', 'intern_half')

        return attrs

    def _clear_closed_day_hours(self, attrs):
        for day_name in self._hours_day_names:
            closed_key = f"{day_name}_closed"
            is_closed = attrs.get(
                closed_key,
                getattr(self.instance, closed_key, False) if self.instance else False,
            )
            if is_closed:
                attrs[f"{day_name}_start"] = None
                attrs[f"{day_name}_end"] = None
        if any(attrs.get(f"{day_name}_closed") for day_name in self._weekday_day_names):
            attrs["weekdays_start"] = None
            attrs["weekdays_end"] = None
        return attrs

    def get_is_pharmacy_owner(self, obj):
        owner = getattr(obj.pharmacy, "owner", None)
        owner_user_id = getattr(owner, "user_id", None) if owner else None
        return owner_user_id == obj.user_id

    def get_is_pharmacy_admin(self, obj):
        assignment = getattr(obj, "admin_assignment", None)
        if assignment:
            return True
        return PharmacyAdmin.objects.filter(
            user=obj.user,
            pharmacy=obj.pharmacy,
        ).exists()

    def _get_admin_assignment(self, obj):
        assignment = getattr(obj, "admin_assignment", None)
        if assignment:
            return assignment
        return PharmacyAdmin.objects.filter(
            user=obj.user,
            pharmacy=obj.pharmacy,
            is_active=True,
        ).first()

    def get_admin_level(self, obj):
        assignment = self._get_admin_assignment(obj)
        return assignment.admin_level if assignment else None

    def get_admin_level_label(self, obj):
        assignment = self._get_admin_assignment(obj)
        if not assignment:
            return None
        return dict(PharmacyAdmin.AdminLevel.choices).get(assignment.admin_level, assignment.admin_level)

    def get_admin_level_description(self, obj):
        assignment = self._get_admin_assignment(obj)
        if not assignment:
            return None
        descriptions = {
            PharmacyAdmin.AdminLevel.OWNER: "Full control. Cannot be removed.",
            PharmacyAdmin.AdminLevel.MANAGER: "Full control except removing the owner.",
            PharmacyAdmin.AdminLevel.ROSTER_MANAGER: "Manage roster/shifts and broadcast communications.",
            PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER: "Communications only. Cannot manage staff or admins.",
        }
        return descriptions.get(assignment.admin_level)

    def update(self, instance, validated_data):
        """
        This override is only needed to add one piece of custom logic: if the user's role
        is changing, we want to clear out the old, irrelevant classification level.
        """
        # Check if the role is being changed to something different.
        if 'role' in validated_data and instance.role != validated_data['role']:
            # If so, reset all classification fields to None.
            # This prevents keeping old data (e.g., a pharmacist_award_level for a user now assigned as a STUDENT).
            instance.pharmacist_award_level = None
            instance.otherstaff_classification_level = None
            instance.intern_half = None
            instance.student_year = None

        # After our custom logic, we let the default .update() method do the rest.
        # It will efficiently update all fields from validated_data in a single database operation.
        return super().update(instance, validated_data)

class MembershipInviteLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = MembershipInviteLink
        fields = ['id', 'pharmacy', 'created_by', 'category', 'token', 'expires_at', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_by', 'token', 'created_at']

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)

class MembershipApplicationSerializer(serializers.ModelSerializer):
    invite_link = serializers.PrimaryKeyRelatedField(
    queryset=MembershipInviteLink.objects.all(),
    write_only=True
    )
    email = serializers.EmailField(required=True, allow_blank=False)

    
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)

    class Meta:
        model = MembershipApplication
        fields = [
            'id', 'invite_link', 'pharmacy', 'pharmacy_name', 'category',
            'role', 'first_name', 'last_name', 'mobile_number', 'job_title',
            'pharmacist_award_level', 'otherstaff_classification_level',
            'intern_half', 'student_year', 'email',
            'submitted_by', 'status', 'submitted_at', 'decided_at', 'decided_by'
        ]
        read_only_fields = [
            'id', 'pharmacy', 'pharmacy_name', 'category',
            'submitted_by', 'status', 'submitted_at', 'decided_at', 'decided_by'
        ]

    def validate(self, attrs):
        invite_link = attrs.get('invite_link')
        role = attrs.get('role')
        job_title_value = (attrs.get('job_title') or '').strip()
        if invite_link and invite_link.category == 'FULL_PART_TIME':
            if not job_title_value:
                raise serializers.ValidationError({
                    'job_title': 'Job title is required for full/part-time applications.'
                })
        else:
            job_title_value = ''
        attrs['job_title'] = job_title_value

        if role == 'PHARMACIST':
            attrs['otherstaff_classification_level'] = None
            attrs['intern_half'] = None
            attrs['student_year'] = None
            if not attrs.get('pharmacist_award_level'):
                raise serializers.ValidationError({
                    'pharmacist_award_level': 'Pharmacist award level is required for pharmacists.'
                })
        elif role in ('ASSISTANT', 'TECHNICIAN'):
            attrs['pharmacist_award_level'] = None
            attrs['intern_half'] = None
            attrs['student_year'] = None
            if not attrs.get('otherstaff_classification_level'):
                raise serializers.ValidationError({
                    'otherstaff_classification_level': 'Classification level is required for assistants and technicians.'
                })
        elif role == 'INTERN':
            attrs['pharmacist_award_level'] = None
            attrs['otherstaff_classification_level'] = None
            attrs['student_year'] = None
            if not attrs.get('intern_half'):
                raise serializers.ValidationError({
                    'intern_half': 'Intern half is required for intern pharmacists.'
                })
        elif role == 'STUDENT':
            attrs['pharmacist_award_level'] = None
            attrs['otherstaff_classification_level'] = None
            attrs['intern_half'] = None
            if not attrs.get('student_year'):
                raise serializers.ValidationError({
                    'student_year': 'Student year is required for pharmacy students.'
                })

        return super().validate(attrs)

    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['submitted_by'] = request.user
        # Freeze category from the link at submission time
        link = validated_data['invite_link']
        validated_data['category'] = link.category
        validated_data['pharmacy'] = link.pharmacy
        return super().create(validated_data)


class PharmacyAdminSerializer(serializers.ModelSerializer):
    user_details = UserProfileSerializer(source='user', read_only=True)
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    capabilities = serializers.SerializerMethodField()
    can_remove = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyAdmin
        fields = [
            "id",
            "user",
            "user_details",
            "pharmacy",
            "pharmacy_detail",
            "membership",
            "admin_level",
            "staff_role",
            "job_title",
            "is_active",
            "capabilities",
            "can_remove",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "admin_level",
            "capabilities",
            "can_remove",
            "created_by",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        user = attrs.get("user", getattr(self.instance, "user", None))
        pharmacy = attrs.get("pharmacy", getattr(self.instance, "pharmacy", None))
        admin_level = attrs.get("admin_level", getattr(self.instance, "admin_level", None))

        if not user or not pharmacy:
            raise serializers.ValidationError("user and pharmacy are required.")

        existing = PharmacyAdmin.objects.filter(
            user=user,
            pharmacy=pharmacy,
        )
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("This user is already an admin for the selected pharmacy.")

        owner_user_id = getattr(getattr(pharmacy, "owner", None), "user_id", None)
        if owner_user_id and owner_user_id == getattr(user, "id", None):
            if admin_level != PharmacyAdmin.AdminLevel.OWNER:
                raise serializers.ValidationError({
                    "admin_level": "Pharmacy owners must remain OWNER admin level."
                })
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data.setdefault("created_by", request.user)
        return super().create(validated_data)

    def get_capabilities(self, obj) -> list[str]:
        return sorted(list(obj.capabilities))

    def get_can_remove(self, obj) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.can_be_removed_by(request.user)


# === Shifts ===
class ShiftSlotSerializer(serializers.ModelSerializer):
    recurring_days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        required=False,
        allow_empty=True
    )
    recurring_end_date = serializers.DateField(required=False, allow_null=True)
    start_hour = serializers.SerializerMethodField()

    class Meta:
        model = ShiftSlot
        fields = [
            'id', 'date', 'start_time', 'end_time', 'rate', 'start_hour',
            'is_recurring', 'recurring_days', 'recurring_end_date',
        ]

    def get_start_hour(self, obj):
        if not obj.start_time:
            return None
        return obj.start_time.hour

class ShiftSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    dedicated_user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )
    slots = ShiftSlotSerializer(many=True)
    interested_users_count = serializers.IntegerField(read_only=True)
    pharmacy = serializers.PrimaryKeyRelatedField(
        write_only=True,
        queryset=Shift._meta.get_field('pharmacy').related_model.objects.all()
    )
    # read‐only nested for listing
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    # for multi-slot shifts
    slot_assignments = serializers.SerializerMethodField()
    pending_payment_slot_ids = serializers.SerializerMethodField()

    role_label = serializers.SerializerMethodField()
    ui_is_negotiable = serializers.SerializerMethodField()
    ui_is_flexible_time = serializers.SerializerMethodField()
    ui_allow_partial = serializers.SerializerMethodField()
    ui_location_city = serializers.SerializerMethodField()
    ui_location_state = serializers.SerializerMethodField()
    ui_address_line = serializers.SerializerMethodField()
    ui_distance_km = serializers.SerializerMethodField()
    ui_is_urgent = serializers.SerializerMethodField()

    # fixed_rate = serializers.DecimalField(max_digits=6, decimal_places=2)
    owner_adjusted_rate = serializers.DecimalField(max_digits=6,decimal_places=2,required=False,allow_null=True)

    allowed_escalation_levels = serializers.SerializerMethodField()
    is_single_user = serializers.BooleanField(source='single_user_only', read_only=True)
    notify_pharmacy_staff = serializers.BooleanField(write_only=True, required=False, default=False)
    notify_favorite_staff = serializers.BooleanField(write_only=True, required=False, default=False)
    notify_chain_members = serializers.BooleanField(write_only=True, required=False, default=False)
    apply_rates_to_pharmacy = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Shift
        fields = [
            'id', 'created_by','created_at', 'pharmacy',  'pharmacy_detail', 'dedicated_user', 'role_needed', 'employment_type', 'visibility',
            'escalation_level', 'escalate_to_owner_chain', 'escalate_to_org_chain', 'escalate_to_platform',
            'must_have', 'nice_to_have', 'rate_type', 'fixed_rate', 'owner_adjusted_rate','slots','single_user_only',
            'post_anonymously',
            'escalate_to_locum_casual',
            'interested_users_count', 'reveal_quota', 'reveal_count', 'workload_tags','slot_assignments',
            'pending_payment_slot_ids',
            'allowed_escalation_levels','is_single_user', 'description',
            'flexible_timing',
            'min_hourly_rate', 'max_hourly_rate', 'min_annual_salary', 'max_annual_salary', 'super_percent',
            'payment_preference',
            'has_travel', 'has_accommodation', 'is_urgent',
            'role_label', 'ui_is_negotiable', 'ui_is_flexible_time', 'ui_allow_partial',
            'ui_location_city', 'ui_location_state', 'ui_address_line', 'ui_distance_km', 'ui_is_urgent',
            'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members',
            'apply_rates_to_pharmacy',
            'payment_status',
        ]
        read_only_fields = [
            'id', 'created_by', 'escalation_level',
            'interested_users_count', 'reveal_count',
            'allowed_escalation_levels']

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get('request')

        # Only restrict rate fields on write methods
        if request and request.method in ['POST', 'PUT', 'PATCH']:
            # ⬇️ replace this line:
            # role = request.data.get('role_needed') or self.initial_data.get('role_needed')

            # ⬇️ with this guarded version (so schema gen doesn't crash):
            idata = getattr(self, 'initial_data', {}) or {}
            req_role = getattr(request, 'data', {}).get('role_needed') if hasattr(request, 'data') else None
            role = req_role or idata.get('role_needed')

            if role != 'PHARMACIST':
                fields.pop('fixed_rate', None)
                fields.pop('rate_type', None)

        return fields

    def validate(self, attrs):
        attrs = super().validate(attrs)
        employment_type = attrs.get('employment_type') or getattr(self.instance, 'employment_type', None)
        min_hour = attrs.get('min_hourly_rate') if 'min_hourly_rate' in attrs else getattr(self.instance, 'min_hourly_rate', None)
        max_hour = attrs.get('max_hourly_rate') if 'max_hourly_rate' in attrs else getattr(self.instance, 'max_hourly_rate', None)
        min_annual = attrs.get('min_annual_salary') if 'min_annual_salary' in attrs else getattr(self.instance, 'min_annual_salary', None)
        max_annual = attrs.get('max_annual_salary') if 'max_annual_salary' in attrs else getattr(self.instance, 'max_annual_salary', None)
        super_percent = attrs.get('super_percent') if 'super_percent' in attrs else getattr(self.instance, 'super_percent', None)

        # Default flexible_timing to True for FT/PT if not explicitly provided
        if employment_type in ['FULL_TIME', 'PART_TIME'] and 'flexible_timing' not in attrs:
            attrs['flexible_timing'] = True

        if employment_type in ['FULL_TIME', 'PART_TIME']:
            has_hourly = min_hour is not None or max_hour is not None
            has_annual = min_annual is not None or max_annual is not None
            if not has_hourly and not has_annual:
                raise serializers.ValidationError('Provide hourly or annual pay for full/part-time shifts.')
            if has_hourly and (min_hour is None or max_hour is None):
                raise serializers.ValidationError('Both min and max hourly are required.')
            if has_hourly and min_hour is not None and max_hour is not None and min_hour > max_hour:
                raise serializers.ValidationError('Min hourly cannot exceed max hourly.')
            if has_annual and (min_annual is None or max_annual is None):
                raise serializers.ValidationError('Both min and max annual are required.')
            if has_annual and min_annual is not None and max_annual is not None and min_annual > max_annual:
                raise serializers.ValidationError('Min annual cannot exceed max annual.')
            if has_annual and super_percent is None:
                raise serializers.ValidationError('Super percent is required when annual package is provided.')
        else:
            # Strip FT/PT pay fields for locum/casual
            for key in ['min_hourly_rate', 'max_hourly_rate', 'min_annual_salary', 'max_annual_salary']:
                attrs.pop(key, None)

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        if instance.post_anonymously and not user_can_view_full_pharmacy(user, instance.pharmacy):
            data['pharmacy_detail'] = anonymize_pharmacy_detail(data.get('pharmacy_detail'))
        return data

    def get_role_label(self, obj):
        return obj.get_role_needed_display()

    def get_ui_is_negotiable(self, obj):
        return obj.rate_type == 'FLEXIBLE'

    def get_ui_is_flexible_time(self, obj):
        if obj.employment_type in ['FULL_TIME', 'PART_TIME']:
            return True
        return bool(obj.flexible_timing)

    def get_ui_allow_partial(self, obj):
        return not obj.single_user_only

    def get_ui_location_city(self, obj):
        pharmacy = getattr(obj, 'pharmacy', None)
        return getattr(pharmacy, 'suburb', None) if pharmacy else None

    def get_ui_location_state(self, obj):
        pharmacy = getattr(obj, 'pharmacy', None)
        return getattr(pharmacy, 'state', None) if pharmacy else None

    def _get_address_parts(self, pharmacy, *, anonymize=False):
        if not pharmacy:
            return None
        suburb = getattr(pharmacy, 'suburb', None)
        state = getattr(pharmacy, 'state', None)
        postcode = getattr(pharmacy, 'postcode', None)
        street = getattr(pharmacy, 'street_address', None)

        if anonymize:
            parts = [p for p in [suburb, state, postcode] if p]
        else:
            parts = [p for p in [street, suburb, state, postcode] if p]
        return ", ".join(parts) if parts else None

    def get_ui_address_line(self, obj):
        pharmacy = getattr(obj, 'pharmacy', None)
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        anonymize = obj.post_anonymously and not user_can_view_full_pharmacy(user, pharmacy)
        return self._get_address_parts(pharmacy, anonymize=anonymize)

    def _get_user_location(self, user):
        if not user or not getattr(user, "is_authenticated", False):
            return None
        if getattr(user, "role", None) == "PHARMACIST":
            loc = PharmacistOnboarding.objects.filter(user=user).values("latitude", "longitude").first()
            return (loc or {}).get("latitude"), (loc or {}).get("longitude")
        if getattr(user, "role", None) == "OTHER_STAFF":
            loc = OtherStaffOnboarding.objects.filter(user=user).values("latitude", "longitude").first()
            return (loc or {}).get("latitude"), (loc or {}).get("longitude")
        return None

    def _haversine_km(self, lat1, lon1, lat2, lon2):
        r = 6371.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        d_phi = math.radians(lat2 - lat1)
        d_lambda = math.radians(lon2 - lon1)
        a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return r * c

    def get_ui_distance_km(self, obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None) if request else None
        user_loc = self._get_user_location(user)
        pharmacy = getattr(obj, 'pharmacy', None)
        if not pharmacy or not user_loc:
            return None
        user_lat, user_lon = user_loc
        pharm_lat = getattr(pharmacy, 'latitude', None)
        pharm_lon = getattr(pharmacy, 'longitude', None)
        if user_lat is None or user_lon is None or pharm_lat is None or pharm_lon is None:
            return None
        return round(self._haversine_km(float(user_lat), float(user_lon), float(pharm_lat), float(pharm_lon)), 1)

    def get_ui_is_urgent(self, obj):
        return bool(obj.is_urgent)

    @staticmethod
    def build_allowed_tiers(pharmacy):
        """
        Determine which escalation tiers are available for this pharmacy.
        Chain escalation is only available when the pharmacy belongs to at least
        one of the owner's chains. Organization escalation requires the pharmacy
        to be claimed by an organization.
        """
        tiers = ['FULL_PART_TIME', 'LOCUM_CASUAL']

        owner = getattr(pharmacy, 'owner', None)
        if owner and Chain.objects.filter(owner=owner, pharmacies=pharmacy).exists():
            tiers.append('OWNER_CHAIN')

        if pharmacy.organization_id:
            tiers.append('ORG_CHAIN')

        tiers.append('PLATFORM')
        return tiers



    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_allowed_escalation_levels(self, obj) -> list[str]:
        return self.build_allowed_tiers(obj.pharmacy)

    @staticmethod
    def _ensure_escalation_stamps(shift, allowed_tiers, target_index):
        field_map = {
            'LOCUM_CASUAL': 'escalate_to_locum_casual',
            'OWNER_CHAIN': 'escalate_to_owner_chain',
            'ORG_CHAIN': 'escalate_to_org_chain',
            'PLATFORM': 'escalate_to_platform',
        }
        stamp_time = timezone.now()
        for idx in range(1, target_index + 1):
            if idx >= len(allowed_tiers):
                break
            tier = allowed_tiers[idx]
            field = field_map.get(tier)
            if field and not getattr(shift, field):
                setattr(shift, field, stamp_time)

    def _normalize_slots_payload(self, slots_data):
        normalized = []
        for idx, raw_slot in enumerate(slots_data, start=1):
            slot = dict(raw_slot)
            recurring_days = slot.get('recurring_days') or []
            slot['recurring_days'] = sorted({int(day) for day in recurring_days if day is not None})

            if slot.get('is_recurring'):
                if not slot['recurring_days']:
                    raise serializers.ValidationError({
                        'slots': [f"Recurring slot #{idx} must include at least one weekday."]
                    })
                slot['recurring_end_date'] = slot.get('recurring_end_date') or slot['date']
            else:
                slot['recurring_days'] = []
                slot['recurring_end_date'] = None

            normalized.append(slot)
        return normalized

    def _sync_pharmacy_rate_defaults(self, pharmacy, *, shift=None, request_data=None):
        if not pharmacy:
            return

        request_data = request_data or {}

        def get_request_value(*keys):
            for key in keys:
                if key in request_data:
                    return request_data.get(key)
            return None

        def to_decimal_or_none(value):
            if value in (None, ''):
                return None
            try:
                return Decimal(str(value))
            except Exception:
                return None

        next_rate_type = (
            get_request_value('rate_type', 'rateType')
            or getattr(shift, 'rate_type', None)
            or getattr(pharmacy, 'default_rate_type', None)
            or 'FLEXIBLE'
        )
        pharmacy.default_rate_type = next_rate_type

        pharmacy.rate_weekday = to_decimal_or_none(get_request_value('rate_weekday', 'rateWeekday'))
        pharmacy.rate_saturday = to_decimal_or_none(get_request_value('rate_saturday', 'rateSaturday'))
        pharmacy.rate_sunday = to_decimal_or_none(get_request_value('rate_sunday', 'rateSunday'))
        pharmacy.rate_public_holiday = to_decimal_or_none(get_request_value('rate_public_holiday', 'ratePublicHoliday'))
        pharmacy.rate_early_morning = to_decimal_or_none(get_request_value('rate_early_morning', 'rateEarlyMorning'))
        pharmacy.rate_late_night = to_decimal_or_none(get_request_value('rate_late_night', 'rateLateNight'))

        fixed_rate_value = (
            get_request_value('fixed_rate', 'fixedRate', 'hourly_rate', 'hourlyRate')
            or getattr(shift, 'fixed_rate', None)
            or pharmacy.rate_weekday
        )
        pharmacy.default_fixed_rate = (
            to_decimal_or_none(fixed_rate_value)
            if next_rate_type == 'FIXED'
            else None
        )

        pharmacy.save(update_fields=[
            'default_rate_type',
            'default_fixed_rate',
            'rate_weekday',
            'rate_saturday',
            'rate_sunday',
            'rate_public_holiday',
            'rate_early_morning',
            'rate_late_night',
        ])

    def _collect_membership_users(self, shift, pharmacy_ids, employment_types):
        qs = Membership.objects.filter(
            pharmacy_id__in=pharmacy_ids,
            role=shift.role_needed,
            employment_type__in=employment_types,
            is_active=True,
            user__is_active=True,
        ).select_related("user")
        users = []
        for membership in qs:
            user = membership.user
            if not user or not user.email:
                continue
            if shift.created_by_id and user.id == shift.created_by_id:
                continue
            users.append(user)
        return users

    @staticmethod
    def _format_slot_date(value):
        if not value:
            return None
        if isinstance(value, date):
            parsed = value
        elif isinstance(value, datetime):
            parsed = value.date()
        elif isinstance(value, str):
            try:
                parsed = datetime.strptime(value, "%Y-%m-%d").date()
            except ValueError:
                try:
                    parsed = datetime.fromisoformat(value).date()
                except ValueError:
                    return value
        else:
            return str(value)
        return parsed.strftime("%d %B, %Y").lstrip("0")

    @staticmethod
    def _format_slot_time(value):
        if not value:
            return None
        if isinstance(value, time):
            parsed = value
        elif isinstance(value, datetime):
            parsed = value.time()
        elif isinstance(value, str):
            parsed = None
            for fmt in ("%H:%M:%S", "%H:%M"):
                try:
                    parsed = datetime.strptime(value, fmt).time()
                    break
                except ValueError:
                    continue
            if parsed is None:
                return value
        else:
            return str(value)
        return parsed.strftime("%I:%M %p").lstrip("0")

    @staticmethod
    def _format_money(value):
        if value is None or value == "":
            return None
        try:
            amount = Decimal(str(value))
        except Exception:
            return None
        formatted = f"{amount:.2f}".rstrip("0").rstrip(".")
        return f"${formatted}"

    def _get_pharmacy_display_name(self, shift, user):
        pharmacy = getattr(shift, "pharmacy", None)
        if not pharmacy:
            return "Pharmacy"
        if shift.post_anonymously and not user_can_view_full_pharmacy(user, pharmacy):
            suburb = getattr(pharmacy, "suburb", None)
            return f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"
        return pharmacy.name

    def _get_location_line_for_email(self, shift, user):
        pharmacy = getattr(shift, "pharmacy", None)
        if not pharmacy:
            return None
        anonymize = shift.post_anonymously and not user_can_view_full_pharmacy(user, pharmacy)
        if anonymize:
            parts = [
                getattr(pharmacy, "suburb", None),
                getattr(pharmacy, "state", None),
                getattr(pharmacy, "postcode", None),
            ]
        else:
            parts = [
                getattr(pharmacy, "street_address", None),
                getattr(pharmacy, "suburb", None),
                getattr(pharmacy, "state", None),
                getattr(pharmacy, "postcode", None),
            ]
        return ", ".join(part for part in parts if part) or None

    def _build_shift_email_slot_meta(self, shift, slot_entries, *, user=None):
        first_slot = slot_entries[0] if slot_entries else {}
        slot_date = first_slot.get('date') if isinstance(first_slot, dict) else None
        slot_start = first_slot.get('start_time') if isinstance(first_slot, dict) else None
        slot_end = first_slot.get('end_time') if isinstance(first_slot, dict) else None
        slot_summary = None
        if slot_date and slot_start and slot_end:
            slot_summary = f"{self._format_slot_date(slot_date)} — {self._format_slot_time(slot_start)} to {self._format_slot_time(slot_end)}"

        slot_lines = []
        slot_cards = []
        for slot in slot_entries or []:
            if not isinstance(slot, dict):
                continue
            date_text = self._format_slot_date(slot.get('date'))
            start_text = self._format_slot_time(slot.get('start_time'))
            end_text = self._format_slot_time(slot.get('end_time'))
            if date_text and start_text and end_text:
                rate_value = slot.get("rate")
                rate_text = f"{self._format_money(rate_value)}/hr" if rate_value not in (None, "") else None
                slot_cards.append({
                    "date": date_text,
                    "time": f"{start_text} - {end_text}",
                    "rate": rate_text,
                    "line": f"{date_text} - {start_text} to {end_text}{f' - {rate_text}' if rate_text else ''}",
                })
                slot_lines.append(f"{date_text} — {start_text} to {end_text}")
        max_slots_in_email = 6
        slots_display = slot_lines[:max_slots_in_email]
        slots_display_details = slot_cards[:max_slots_in_email]
        slots_extra_count = max(0, len(slot_lines) - len(slots_display))

        location_line = self._get_location_line_for_email(shift, user)

        rate_summary = None
        min_annual = getattr(shift, "min_annual_salary", None)
        max_annual = getattr(shift, "max_annual_salary", None)
        min_hourly = getattr(shift, "min_hourly_rate", None)
        max_hourly = getattr(shift, "max_hourly_rate", None)
        fixed_rate = getattr(shift, "fixed_rate", None)
        slot_rates = [
            Decimal(str(s.get("rate")))
            for s in slot_entries or []
            if isinstance(s, dict) and s.get("rate") not in (None, "")
        ]
        if min_annual or max_annual:
            min_display = self._format_money(min_annual)
            max_display = self._format_money(max_annual)
            if min_display and max_display:
                rate_summary = f"{min_display}–{max_display} package"
            else:
                rate_summary = f"{min_display or max_display} package"
        elif fixed_rate:
            rate_summary = f"{self._format_money(fixed_rate)}/hr"
        elif min_hourly or max_hourly:
            min_display = self._format_money(min_hourly)
            max_display = self._format_money(max_hourly)
            if min_display and max_display:
                rate_summary = f"{min_display}–{max_display}/hr"
            else:
                rate_summary = f"{min_display or max_display}/hr"
        elif slot_rates:
            min_rate = min(slot_rates)
            max_rate = max(slot_rates)
            if min_rate == max_rate:
                rate_summary = f"{self._format_money(min_rate)}/hr"
            else:
                rate_summary = f"{self._format_money(min_rate)}–{self._format_money(max_rate)}/hr"

        return {
            "slot_summary": slot_summary,
            "slot_date": slot_date,
            "slot_start": slot_start,
            "slot_end": slot_end,
            "slots_display": slots_display,
            "slots_display_details": slots_display_details,
            "slots_extra_count": slots_extra_count,
            "location_line": location_line,
            "rate_summary": rate_summary,
        }

    @staticmethod
    def _role_matches_shift(user_role, shift_role):
        if shift_role == "PHARMACIST":
            return user_role == "PHARMACIST"
        if shift_role in ["ASSISTANT", "TECHNICIAN", "INTERN", "STUDENT"]:
            return user_role == "OTHER_STAFF"
        if shift_role == "EXPLORER":
            return user_role == "EXPLORER"
        return False

    @staticmethod
    def _availability_matches_slot(availability, slot_date, slot_start, slot_end):
        if not slot_date or not slot_start or not slot_end:
            return False
        if availability.is_recurring:
            if availability.date and slot_date < availability.date:
                return False
            if availability.recurring_end_date and slot_date > availability.recurring_end_date:
                return False
            mapped_days = [int(day) for day in (availability.recurring_days or [])]
            if not mapped_days:
                return False
            adjusted_weekday = (slot_date.weekday() + 1) % 7
            if adjusted_weekday not in mapped_days:
                return False
        else:
            if slot_date != availability.date:
                return False

        if availability.is_all_day:
            return True
        if availability.start_time is None or availability.end_time is None:
            return False
        return availability.start_time <= slot_end and availability.end_time >= slot_start

    def _load_user_travel_prefs(self, user_ids_by_role):
        prefs = {}
        pharm_ids = user_ids_by_role.get("PHARMACIST") or []
        other_ids = user_ids_by_role.get("OTHER_STAFF") or []
        explorer_ids = user_ids_by_role.get("EXPLORER") or []

        if pharm_ids:
            for row in PharmacistOnboarding.objects.filter(user_id__in=pharm_ids).values(
                "user_id", "latitude", "longitude", "open_to_travel", "travel_states", "coverage_radius_km"
            ):
                prefs[row["user_id"]] = row

        if other_ids:
            for row in OtherStaffOnboarding.objects.filter(user_id__in=other_ids).values(
                "user_id", "latitude", "longitude", "open_to_travel", "travel_states", "coverage_radius_km"
            ):
                prefs[row["user_id"]] = row

        if explorer_ids:
            for row in ExplorerOnboarding.objects.filter(user_id__in=explorer_ids).values(
                "user_id", "latitude", "longitude", "open_to_travel", "travel_states", "coverage_radius_km"
            ):
                prefs[row["user_id"]] = row

        return prefs

    def _user_can_travel_to_shift(self, pref_row, shift):
        if not pref_row or not shift or not shift.pharmacy:
            return False
        if pref_row.get("open_to_travel"):
            travel_states = pref_row.get("travel_states") or []
            if not travel_states:
                return False
            pharmacy_state = getattr(shift.pharmacy, "state", None)
            if not pharmacy_state:
                return False
            normalized = {str(s).strip().upper() for s in travel_states if str(s).strip()}
            return pharmacy_state.strip().upper() in normalized
        user_lat = pref_row.get("latitude")
        user_lon = pref_row.get("longitude")
        pharm_lat = getattr(shift.pharmacy, "latitude", None)
        pharm_lon = getattr(shift.pharmacy, "longitude", None)
        if user_lat is None or user_lon is None or pharm_lat is None or pharm_lon is None:
            return False
        radius_km = pref_row.get("coverage_radius_km")
        if radius_km is None:
            return False
        distance = self._haversine_km(float(user_lat), float(user_lon), float(pharm_lat), float(pharm_lon))
        return distance <= float(radius_km)

    def _send_posted_shift_notifications(
        self,
        shift,
        slots_data,
        *,
        notify_pharmacy_staff=False,
        notify_favorite_staff=False,
        notify_chain_members=False,
    ):
        visibility_rules = {
            'FULL_PART_TIME': {'notify_pharmacy_staff'},
            'LOCUM_CASUAL': {'notify_pharmacy_staff', 'notify_favorite_staff'},
            'OWNER_CHAIN': {'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members'},
            'ORG_CHAIN': {'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members'},
            'PLATFORM': {'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members'},
        }
        allowed = set(visibility_rules.get(shift.visibility, set()))
        if getattr(shift, "post_anonymously", False):
            anonymous_rules = {
                'FULL_PART_TIME': {'notify_pharmacy_staff'},
                'LOCUM_CASUAL': {'notify_favorite_staff'},
                'OWNER_CHAIN': {'notify_chain_members'},
                'ORG_CHAIN': {'notify_chain_members'},
                'PLATFORM': set(),
            }
            allowed &= anonymous_rules.get(shift.visibility, set())
        if not allowed:
            return

        if not notify_pharmacy_staff:
            allowed.discard('notify_pharmacy_staff')
        if not notify_favorite_staff:
            allowed.discard('notify_favorite_staff')
        if not notify_chain_members:
            allowed.discard('notify_chain_members')

        if not allowed:
            return

        staff_types = {'FULL_TIME', 'PART_TIME', 'CASUAL'}
        favorite_types = {'LOCUM', 'SHIFT_HERO'}
        recipient_map = {}

        if 'notify_pharmacy_staff' in allowed:
            users = self._collect_membership_users(shift, [shift.pharmacy_id], staff_types)
            for user in users:
                recipient_map[user.id] = user

        if 'notify_favorite_staff' in allowed:
            users = self._collect_membership_users(shift, [shift.pharmacy_id], favorite_types)
            for user in users:
                recipient_map[user.id] = user

        if 'notify_chain_members' in allowed:
            if shift.pharmacy and shift.pharmacy.owner_id:
                chain_pharmacy_ids = list(
                    Chain.objects.filter(
                        owner_id=shift.pharmacy.owner_id,
                        pharmacies=shift.pharmacy,
                        is_active=True,
                    ).values_list('pharmacies__id', flat=True)
                )
            else:
                chain_pharmacy_ids = []
            if chain_pharmacy_ids:
                users = self._collect_membership_users(
                    shift,
                    chain_pharmacy_ids,
                    staff_types | favorite_types,
                )
                for user in users:
                    recipient_map[user.id] = user

        if not recipient_map:
            return

        slot_meta = self._build_shift_email_slot_meta(shift, slots_data)

        for user in recipient_map.values():
            ctx = build_shift_email_context(shift, user=user)
            pharmacy_display_name = self._get_pharmacy_display_name(shift, user)
            slot_meta = self._build_shift_email_slot_meta(shift, slots_data, user=user)
            ctx.update({
                "pharmacy_name": pharmacy_display_name,
                "role_label": shift.get_role_needed_display(),
                "employment_type_label": shift.get_employment_type_display(),
                **slot_meta,
            })
            notification_payload = {
                "title": "New shift available",
                "body": f"{ctx['role_label']} shift at {pharmacy_display_name}.",
                "type": "shift",
                "action_url": ctx.get("shift_link"),
                "payload": {"shift_id": shift.id},
                "user_ids": [user.id],
            }
            async_task(
                'users.tasks.send_async_email',
                subject=f"New {ctx['role_label']} shift at {pharmacy_display_name}",
                recipient_list=[user.email],
                template_name="emails/shift_posted.html",
                context=ctx,
                text_template="emails/shift_posted.txt",
                notification=notification_payload,
            )

    def _send_availability_match_notifications(self, shift):
        if shift.visibility != "PLATFORM":
            return
        slot_entries = expand_shift_slots(shift)
        if not slot_entries:
            return

        today = timezone.localdate()
        slot_entries = [entry for entry in slot_entries if entry.get("date") and entry["date"] >= today]
        if not slot_entries:
            return
        slot_entries = sorted(
            slot_entries,
            key=lambda entry: (entry.get("date") or date.max, entry.get("start_time") or time.min),
        )

        max_entries = 180
        if len(slot_entries) > max_entries:
            slot_entries = slot_entries[:max_entries]

        user_availabilities = (
            UserAvailability.objects.filter(notify_new_shifts=True, user__is_active=True)
            .select_related("user")
        )
        if shift.created_by_id:
            user_availabilities = user_availabilities.exclude(user_id=shift.created_by_id)
        if not user_availabilities.exists():
            return

        user_availability_map = {}
        user_ids_by_role = {"PHARMACIST": set(), "OTHER_STAFF": set(), "EXPLORER": set()}
        for availability in user_availabilities:
            user = availability.user
            if not user or not self._role_matches_shift(getattr(user, "role", None), shift.role_needed):
                continue
            user_availability_map.setdefault(user.id, []).append(availability)
            if user.role in user_ids_by_role:
                user_ids_by_role[user.role].add(user.id)

        if not user_availability_map:
            return

        prefs = self._load_user_travel_prefs(
            {role: list(ids) for role, ids in user_ids_by_role.items() if ids}
        )

        slot_meta_entries = [
            {
                "date": entry.get("date"),
                "start_time": entry.get("start_time"),
                "end_time": entry.get("end_time"),
                "rate": getattr(entry.get("slot"), "rate", None) if entry.get("slot") else None,
            }
            for entry in slot_entries
        ]
        for user_id, availabilities in user_availability_map.items():
            user = availabilities[0].user
            if not user or not user.email:
                continue
            pref_row = prefs.get(user_id)
            if not self._user_can_travel_to_shift(pref_row, shift):
                continue

            matched = False
            for availability in availabilities:
                for entry in slot_entries:
                    if self._availability_matches_slot(
                        availability,
                        entry.get("date"),
                        entry.get("start_time"),
                        entry.get("end_time"),
                    ):
                        matched = True
                        break
                if matched:
                    break

            if not matched:
                continue

            ctx = build_shift_email_context(shift, user=user, role=user.role.lower())
            pharmacy_display_name = self._get_pharmacy_display_name(shift, user)
            slot_meta = self._build_shift_email_slot_meta(shift, slot_meta_entries, user=user)
            ctx.update({
                "pharmacy_name": pharmacy_display_name,
                "role_label": shift.get_role_needed_display(),
                "employment_type_label": shift.get_employment_type_display(),
                **slot_meta,
            })
            notification_payload = {
                "title": "Shift match found",
                "body": f"A {ctx['role_label']} shift matches your availability.",
                "type": "shift",
                "action_url": ctx.get("shift_link"),
                "payload": {"shift_id": shift.id},
                "user_ids": [user.id],
            }
            async_task(
                'users.tasks.send_async_email',
                subject=f"New {ctx['role_label']} shift that matches your availability",
                recipient_list=[user.email],
                template_name="emails/shift_availability_match.html",
                context=ctx,
                text_template="emails/shift_availability_match.txt",
                notification=notification_payload,
            )

    def create(self, validated_data):
        notify_pharmacy_staff = validated_data.pop('notify_pharmacy_staff', False)
        notify_favorite_staff = validated_data.pop('notify_favorite_staff', False)
        notify_chain_members = validated_data.pop('notify_chain_members', False)
        apply_rates_to_pharmacy = validated_data.pop('apply_rates_to_pharmacy', False)
        slots_data = self._normalize_slots_payload(validated_data.pop('slots'))
        user        = self.context['request'].user
        pharmacy    = validated_data['pharmacy']
        rate_type   = validated_data.get('rate_type')
        employment_type = validated_data.get('employment_type')

        # Default fixed_rate from pharmacy defaults when rate_type=FIXED and not provided
        if rate_type == 'FIXED' and not validated_data.get('fixed_rate'):
            default_fixed = getattr(pharmacy, 'default_fixed_rate', None)
            weekday_rate = getattr(pharmacy, 'rate_weekday', None)
            slot_rate = next((slot.get('rate') for slot in slots_data if slot.get('rate') is not None), None)
            validated_data['fixed_rate'] = default_fixed or weekday_rate or slot_rate or Decimal('0.00')

        # Default flexible timing for FT/PT if not provided
        if employment_type in ['FULL_TIME', 'PART_TIME'] and 'flexible_timing' not in validated_data:
            validated_data['flexible_timing'] = True

        # Default payment preference for locum shifts if missing
        if not validated_data.get('payment_preference'):
            if employment_type == 'LOCUM':
                req = self.context.get('request')
                from_payload = None
                if req and hasattr(req, 'data'):
                    from_payload = req.data.get('payment_preference') or req.data.get('paymentPreference')
                validated_data['payment_preference'] = from_payload or 'ABN'
            elif employment_type in ['FULL_TIME', 'PART_TIME']:
                validated_data['payment_preference'] = 'TFN'

        # Build the correct path
        allowed_tiers = self.build_allowed_tiers(pharmacy)

        # Ensure the front-end’s choice is valid
        chosen = validated_data.get('visibility')
        if chosen not in allowed_tiers:
            raise serializers.ValidationError({
                'visibility': f"Invalid choice; must be one of {allowed_tiers}"
            })

        if chosen == 'PLATFORM':
            enforce_public_shift_daily_limit(pharmacy)
            if not validated_data.get('escalate_to_platform'):
                validated_data['escalate_to_platform'] = timezone.now()

        # Index of that choice becomes the escalation_level
        validated_data['escalation_level'] = allowed_tiers.index(chosen)
        validated_data['created_by']       = user

        with transaction.atomic():
            shift = Shift.objects.create(**validated_data)
            for slot in slots_data:
                ShiftSlot.objects.create(shift=shift, **slot)
            transaction.on_commit(
                lambda: self._send_posted_shift_notifications(
                    shift,
                    slots_data,
                    notify_pharmacy_staff=notify_pharmacy_staff,
                    notify_favorite_staff=notify_favorite_staff,
                    notify_chain_members=notify_chain_members,
                )
            )
            transaction.on_commit(lambda: self._send_availability_match_notifications(shift))
            if apply_rates_to_pharmacy and validated_data.get('role_needed') == 'PHARMACIST':
                self._sync_pharmacy_rate_defaults(
                    pharmacy,
                    shift=shift,
                    request_data=getattr(self.context.get('request'), 'data', {}),
                )

            dedicated_user = getattr(shift, 'dedicated_user', None)
            if dedicated_user:
                offers = []
                now = timezone.now()
                if shift.single_user_only or not shift.slots.exists():
                    offers.append(ShiftOffer.objects.create(
                        shift=shift,
                        slot=None,
                        user=dedicated_user,
                        offered_slot_date=None,
                        offered_start_time=None,
                        offered_end_time=None,
                        offered_rate=shift.fixed_rate or shift.max_hourly_rate or shift.min_hourly_rate,
                        expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
                    ))
                else:
                    for slot in shift.slots.all():
                        offers.append(ShiftOffer.objects.create(
                            shift=shift,
                            slot=slot,
                            user=dedicated_user,
                            offered_slot_date=slot.date,
                            offered_start_time=slot.start_time,
                            offered_end_time=slot.end_time,
                            offered_rate=slot.rate,
                            expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
                        ))

                if offers and dedicated_user.email:
                    offer_for_email = offers[0]
                    def _send_offer_email():
                        ctx = build_shift_offer_context(
                            shift,
                            offer_for_email,
                            recipient=dedicated_user,
                            ignore_slot_filter=True,
                        )
                        notification_payload = {
                            "title": "Shift offer received",
                            "body": "You have received a shift offer. Please confirm to lock it in.",
                            "payload": {"shift_id": shift.id, "offer_id": offer_for_email.id},
                        }
                        if ctx.get("shift_link"):
                            notification_payload["action_url"] = ctx["shift_link"]
                        async_task(
                            'users.tasks.send_async_email',
                            subject="You have a new shift offer",
                            recipient_list=[dedicated_user.email],
                            template_name="emails/shift_offer.html",
                            context=ctx,
                            text_template="emails/shift_offer.txt",
                            notification=notification_payload,
                        )

                    transaction.on_commit(_send_offer_email)

        return shift

    def update(self, instance, validated_data):
        validated_data.pop('notify_pharmacy_staff', None)
        validated_data.pop('notify_favorite_staff', None)
        validated_data.pop('notify_chain_members', None)
        apply_rates_to_pharmacy = validated_data.pop('apply_rates_to_pharmacy', False)
        # If visibility is changing, recalc escalation_level
        if 'visibility' in validated_data:
            allowed_tiers = self.build_allowed_tiers(instance.pharmacy)
            new_vis = validated_data['visibility']
            if new_vis not in allowed_tiers:
                raise serializers.ValidationError({
                    'visibility': f"Invalid choice; must be one of {allowed_tiers}"
                })
            target_index = allowed_tiers.index(new_vis)
            instance.escalation_level = target_index
            if new_vis == 'PLATFORM' and not validated_data.get('escalate_to_platform') and not instance.escalate_to_platform:
                validated_data['escalate_to_platform'] = timezone.now()
            self._ensure_escalation_stamps(instance, allowed_tiers, target_index)

        # Apply other fields
        for attr, val in validated_data.items():
            if attr != 'slots':
                setattr(instance, attr, val)
        instance.save()

        # Replace slots if provided
        if 'slots' in validated_data:
            instance.slots.all().delete()
            for slot in validated_data['slots']:
                ShiftSlot.objects.create(shift=instance, **slot)

        if apply_rates_to_pharmacy and instance.role_needed == 'PHARMACIST':
            self._sync_pharmacy_rate_defaults(
                instance.pharmacy,
                shift=instance,
                request_data=getattr(self.context.get('request'), 'data', {}),
            )

        return instance

    def get_slots(self, obj): # NEW METHOD
        """
        Filters and returns only relevant slots for the shift (future and unassigned).
        This mirrors the logic from ActiveShiftViewSet's get_queryset.
        """
        now = timezone.now()
        today = date.today()

        # Get all slots for this shift
        all_slots = obj.slots.all()

        # Filter out past slots and assigned slots
        filtered_slots = []
        for slot in all_slots:
            slot_is_future = (
                slot.date > today
                or (slot.date == today and slot.end_time >= now.time()) # Use >= now.time() for active shifts
            )

            # Check if this specific slot has any assignments
            # Note: This checks if ANY assignment exists for this slot, regardless of date.
            # If you need to check for assignments on a specific date for recurring slots,
            # the logic would need to be more complex, potentially involving expand_shift_slots.
            # For simplicity for an 'unassigned' shift, this assumes the whole slot is unassigned.
            slot_is_assigned = ShiftSlotAssignment.objects.filter(slot=slot).exists()

            if slot_is_future and not slot_is_assigned:
                filtered_slots.append(slot)
        
        return ShiftSlotSerializer(filtered_slots, many=True).data

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_slot_assignments(self, shift) -> list[dict]:
        return [
        {'slot_id': a.slot.id, 'user_id': a.user.id}
            for a in shift.slot_assignments.all()
        ]

    def get_pending_payment_slot_ids(self, shift) -> list[int]:
        qs = ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            slot_id__isnull=False,
        ).values_list('slot_id', flat=True)
        return sorted(set(qs))

class ShiftInterestSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    user_id  = serializers.IntegerField(source='user.id', read_only=True)
    slot_id  = serializers.IntegerField(source='slot.id', read_only=True)
    slot_time = serializers.SerializerMethodField()
    short_bio = serializers.SerializerMethodField()
    user_detail = serializers.SerializerMethodField()
    revealed = serializers.BooleanField(read_only=True)

    class Meta:
        model  = ShiftInterest
        fields = [
            'id',
            'shift',
            'slot',
            'slot_id',
            'slot_time',
            'user',
            'user_id',
            'short_bio',
            'user_detail',
            'revealed',
            'expressed_at',
        ]
        read_only_fields = [
            'id','user','user_id','slot_time','short_bio','user_detail','revealed','expressed_at'
        ]

    def get_user(self, obj):
        request = self.context.get('request')
        if obj.shift.visibility == 'PLATFORM' and not obj.revealed:
            # For debugging, return a distinct anonymous string.
            return "Anonymous Interest User"
        # For debugging, return the full name if revealed or not public.
        return obj.user.get_full_name()

    def get_short_bio(self, obj):
        is_public = obj.shift.visibility == 'PLATFORM'
        if is_public and not obj.revealed:
            return None
        return _get_user_short_bio(obj.user)

    def get_user_detail(self, obj):
        is_public = obj.shift.visibility == 'PLATFORM'
        if is_public and not obj.revealed:
            return None
        user = getattr(obj, 'user', None)
        if not user:
            return None
        return {
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'short_bio': _get_user_short_bio(user),
        }

    def get_slot_time(self, obj):
        slot = obj.slot
        if not slot:
            # For debugging, return a default string if slot is None.
            return "N/A Slot Time"
        date_str  = slot.date.strftime('%Y-%m-%d')
        start_str = slot.start_time.strftime('%H:%M')
        end_str   = slot.end_time.strftime('%H:%M')
        return f"{date_str} {start_str}-{end_str}"

class ShiftRejectionSerializer(serializers.ModelSerializer):
    user = serializers.StringRelatedField(read_only=True)
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    slot_id = serializers.IntegerField(source='slot.id', read_only=True)
    class Meta:
        model = ShiftRejection
        fields = [
            'id', 'shift', 'slot', 'slot_id', 'slot_date', 'user', 'user_id', 'rejected_at'
        ]
        read_only_fields = ['id', 'user', 'user_id', 'slot_id', 'rejected_at']

class ShiftCounterOfferSlotSerializer(serializers.ModelSerializer):
    slot_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    slot_date = serializers.DateField(required=False, allow_null=True)
    slot = ShiftSlotSerializer(read_only=True)

    class Meta:
        model = ShiftCounterOfferSlot
        fields = [
            'id',
            'slot_id',
            'slot_date',
            'slot',
            'proposed_start_time',
            'proposed_end_time',
            'proposed_rate',
        ]

from client_profile.utils import extract_travel_origin_from_message, extract_suburb_from_travel_origin

class ShiftCounterOfferSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    user_detail = serializers.SerializerMethodField()
    slots = ShiftCounterOfferSlotSerializer(many=True)
    travel_origin = serializers.SerializerMethodField()

    class Meta:
        model = ShiftCounterOffer
        fields = [
            'id',
            'shift',
            'user',
            'user_detail',
            'travel_origin',
            'request_travel',
            'status',
            'slots',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'shift', 'user', 'status', 'created_at', 'updated_at']

    def validate(self, attrs):
        shift = self.context.get('shift')
        slots_data = attrs.get('slots') or []
        if not shift:
            raise serializers.ValidationError('Shift context is required.')
        if not slots_data:
            raise serializers.ValidationError({'slots': 'At least one slot is required.'})
        try:
            # print("[ShiftCounterOfferSerializer.validate] incoming slots", slots_data)
            pass
        except Exception:
            pass

        shift_slots_qs = shift.slots.all()
        shift_slots = {slot.id: slot for slot in shift_slots_qs}
        # Deduplicate pairs up front instead of throwing an error so UI quirks don't block submissions.
        normalized_slots = []
        seen_pairs = {}
        for entry in slots_data:
            slot_id = entry.get('slot_id')
            slot_date = entry.get('slot_date')
            key = (slot_id, slot_date)
            if key in seen_pairs:
                # Keep the first occurrence; ignore later duplicates.
                continue
            seen_pairs[key] = entry
            normalized_slots.append(entry)
        slots_data = normalized_slots

        if shift_slots_qs.exists():
            invalid = [entry.get('slot_id') for entry in slots_data if entry.get('slot_id') is not None and entry.get('slot_id') not in shift_slots]
            if invalid:
                raise serializers.ValidationError({'slots': f'Invalid slot ids: {invalid}'})
            # For single-user shifts, accept a single slot_id to represent the whole shift,
            # or the full set of slot_ids. Do not require every occurrence to be sent.
            if shift.single_user_only:
                if not slots_data:
                    raise serializers.ValidationError({'slots': 'At least one slot is required for single-user shifts.'})
            else:
                provided_ids = {entry.get('slot_id') for entry in slots_data if entry.get('slot_id') is not None}
                if not provided_ids:
                    raise serializers.ValidationError({'slots': 'At least one slot is required for multi-slot counter offers.'})
                # Allow subsets: do not require every slot to be included.
        else:
            # Slotless shift (e.g., FT/PT without slots): allow a single pseudo slot
            if any(entry.get('slot_id') is not None for entry in slots_data):
                raise serializers.ValidationError({'slots': 'Do not send slot_id for slotless shifts.'})
            if len(slots_data) > 1:
                raise serializers.ValidationError({'slots': 'Only one entry is allowed for slotless shifts.'})
            entry = slots_data[0]
            if not entry.get('proposed_start_time') or not entry.get('proposed_end_time'):
                raise serializers.ValidationError({'slots': 'Start and end time are required for slotless shifts.'})

        is_flexible_time = bool(shift.flexible_timing)
        # Allow rate negotiation when shift explicitly flexible OR pharmacist-provided (worker supplies rate)
        is_negotiable = shift.rate_type in ('FLEXIBLE', 'PHARMACIST_PROVIDED')

        for entry in slots_data:
            slot_id = entry.get('slot_id')
            proposed_start = entry.get('proposed_start_time')
            proposed_end = entry.get('proposed_end_time')
            proposed_rate = entry.get('proposed_rate')
            if slot_id is None:
                # slotless case already validated above
                continue
            slot = shift_slots[slot_id]
            if not is_flexible_time:
                if proposed_start != slot.start_time or proposed_end != slot.end_time:
                    raise serializers.ValidationError({
                        'slots': f'Slot {slot.id} does not allow time changes.'
                    })

            if not is_negotiable and proposed_rate is not None:
                reference_rate = slot.rate if slot.rate is not None else shift.fixed_rate
                if reference_rate is None:
                    raise serializers.ValidationError({
                        'slots': f'Slot {slot.id} does not allow rate changes.'
                    })
                if Decimal(str(proposed_rate)) != Decimal(str(reference_rate)):
                    raise serializers.ValidationError({
                        'slots': f'Slot {slot.id} does not allow rate changes.'
                    })

        attrs['slots'] = slots_data
        return attrs

    def create(self, validated_data):
        shift = self.context['shift']
        user = self.context['request'].user
        slots_data = validated_data.pop('slots', [])
        validated_data.setdefault('message', '')

        offer = ShiftCounterOffer.objects.create(
            shift=shift,
            user=user,
            **validated_data
        )
        for entry in slots_data:
            slot_id = entry.pop('slot_id', None)
            slot_date = entry.pop('slot_date', None)
            slot = shift.slots.get(id=slot_id) if slot_id else None
            ShiftCounterOfferSlot.objects.create(
                offer=offer,
                slot=slot,
                slot_date=slot_date,
                **entry
            )
        return offer

    def _can_view_user_detail(self, obj):
        shift = getattr(obj, "shift", None)
        user = getattr(obj, "user", None)
        request = self.context.get("request")
        viewer = getattr(request, "user", None)

        if not shift or not user:
            return False

        if shift.visibility != "PLATFORM":
            return True

        if viewer and getattr(viewer, "is_authenticated", False) and viewer.id == user.id:
            return True

        return shift.revealed_users.filter(pk=user.id).exists()

    def get_user_detail(self, obj):
        user = getattr(obj, 'user', None)
        if not user:
            return None
        if not self._can_view_user_detail(obj):
            return None
        return {
            'id': user.id,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'email': user.email,
            'short_bio': _get_user_short_bio(user),
        }

    def get_travel_origin(self, obj):
        _, travel_origin = extract_travel_origin_from_message(getattr(obj, 'message', '') or '')
        return extract_suburb_from_travel_origin(travel_origin)


class ShiftOfferSerializer(serializers.ModelSerializer):
    shift_detail = ShiftSerializer(source='shift', read_only=True)
    slot_detail = ShiftSlotSerializer(source='slot', read_only=True)

    class Meta:
        model = ShiftOffer
        fields = [
            'id',
            'shift',
            'shift_detail',
            'slot',
            'slot_detail',
            'user',
            'status',
            'offered_slot_date',
            'offered_start_time',
            'offered_end_time',
            'offered_rate',
            'expires_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'shift',
            'shift_detail',
            'slot',
            'slot_detail',
            'user',
            'status',
            'offered_slot_date',
            'offered_start_time',
            'offered_end_time',
            'offered_rate',
            'expires_at',
            'created_at',
            'updated_at',
        ]

class MyShiftSerializer(serializers.ModelSerializer):
    # reuse the full PharmacySerializer (with all the file‐fields)
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    created_by_first_name = serializers.CharField(source='created_by.first_name', read_only=True)
    created_by_last_name  = serializers.CharField(source='created_by.last_name',  read_only=True)
    created_by_email      = serializers.EmailField(source='created_by.email',      read_only=True)

    # bring rate_type, fixed_rate, workload_tags straight through
    rate_type     = serializers.CharField(read_only=True)
    fixed_rate    = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)
    workload_tags = serializers.ListField(child=serializers.CharField(), read_only=True)

    # only return the slots that this user is actually assigned to
    slots = serializers.SerializerMethodField()

    # Lineitems from service.py
    line_items = serializers.SerializerMethodField()
    owner_adjusted_rate = serializers.DecimalField(max_digits=6, decimal_places=2, read_only=True)

    class Meta:
        model = Shift
        fields = [
            'id',
            'pharmacy_detail',
            'created_by_first_name',
            'created_by_last_name',
            'created_by_email',
            'role_needed',
            'rate_type',
            'fixed_rate',
            'workload_tags',
            'slots',
            'line_items',
            'owner_adjusted_rate',
        ]
        read_only_fields = ['was_modified']  # ✅ this protects it

    @staticmethod
    def build_allowed_tiers(pharmacy):
        # Delegate to main ShiftSerializer logic so viewsets can reuse it
        return ShiftSerializer.build_allowed_tiers(pharmacy)

    def get_slots(self, obj):
        user = self.context['request'].user

        # Show only the slots where the user has assignments
        slot_ids = obj.slot_assignments.filter(user=user).values_list('slot_id', flat=True)
        qs = obj.slots.filter(id__in=slot_ids)

        return ShiftSlotSerializer(qs, many=True).data

        return ShiftSlotSerializer(qs, many=True).data
    def get_line_items(self, obj):
        user = self.context['request'].user
        from client_profile.services import generate_preview_invoice_lines

        try:
            return generate_preview_invoice_lines(shift=obj, user=user)
        except Exception:
            return []

class SharedShiftSerializer(serializers.ModelSerializer):
    """
    Public/shared shift serializer that reuses the full ShiftSerializer output
    (including UI helper fields) while still honoring anonymization rules.
    """

    class Meta:
        model = Shift
        fields = ['id']

    def to_representation(self, instance):
        return ShiftSerializer(instance, context=self.context).data

class LeaveRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'slot_assignment', 'user', 'leave_type', 'note',
            'status', 'date_applied', 'date_resolved'
        ]
        read_only_fields = ['id', 'user', 'status', 'date_applied', 'date_resolved']

class WorkerShiftRequestSerializer(serializers.ModelSerializer):
    requested_by = serializers.HiddenField(default=serializers.CurrentUserDefault())
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    requester_name = serializers.CharField(source="requested_by.get_full_name", read_only=True)

    class Meta:
        model = WorkerShiftRequest
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "requested_by",
            "requester_name",
            "shift",
            "role",
            "slot_date",
            "start_time",
            "end_time",
            "note",
            "status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "created_at", "updated_at"]

    def create(self, validated_data):
        user = self.context["request"].user

        # Explicitly link requester
        validated_data["requested_by"] = user
        validated_data["status"] = "PENDING"

        return super().create(validated_data)


# === Notifications / Devices ===
class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ["id", "platform", "token", "active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        # Allow upsert-by-token logic in the view without the unique validator blocking the request
        extra_kwargs = {
            "token": {"validators": []},
        }

# === Rosters ===
class RosterUserDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'email']

class RosterShiftDetailSerializer(serializers.ModelSerializer):
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    # ADD THIS LINE:
    allowed_escalation_levels = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = ['id', 'role_needed', 'pharmacy_name', 'visibility', 'allowed_escalation_levels']

    def get_allowed_escalation_levels(self, obj):
        return ShiftSerializer.build_allowed_tiers(obj.pharmacy)

class RosterAssignmentSerializer(serializers.ModelSerializer):
    user_detail = RosterUserDetailSerializer(source='user', read_only=True)
    slot_detail = ShiftSlotSerializer(source='slot', read_only=True)
    shift_detail = RosterShiftDetailSerializer(source='shift', read_only=True)
    leave_request = serializers.SerializerMethodField()
    origin = serializers.SerializerMethodField()

    class Meta:
        model = ShiftSlotAssignment
        fields = [
            "id", "slot_date", "unit_rate", "rate_reason", "is_rostered",
            "user", "slot", "shift",
            "user_detail",
            "slot_detail",
            "shift_detail",
            "leave_request",
            "origin",
        ]

    def get_leave_request(self, obj):
        # Get latest leave request with status PENDING or APPROVED
        leave = obj.leave_requests.filter(status__in=['PENDING', 'APPROVED']).order_by('-date_applied').first()
        if leave:
            return {
                "id": leave.id,
                "leave_type": leave.leave_type,
                "status": leave.status,
                "note": leave.note,
                "date_applied": leave.date_applied,
                "date_resolved": leave.date_resolved,
            }
        return None

    def get_origin(self, obj):
        """
        Returns a small descriptor showing where this worker came from
        relative to the shift's pharmacy: pharmacy staff, favourite staff
        (locum/shift hero in the same pharmacy), chain staff, organization
        staff (with org name), or public ChemistTasker pool.
        """
        shift = getattr(obj, "shift", None)
        user = getattr(obj, "user", None)
        if not shift or not user or not shift.pharmacy:
            return {"type": "UNKNOWN", "label": "Unknown"}

        pharmacy = shift.pharmacy

        # 1) Direct membership in the pharmacy
        membership = Membership.objects.filter(
            user=user,
            pharmacy=pharmacy,
            is_active=True
        ).first()
        if membership:
            if membership.employment_type in ("LOCUM", "SHIFT_HERO"):
                return {"type": "FAV_STAFF", "label": "Fav Staff"}
            return {"type": "PHARMACY_STAFF", "label": "Pharmacy staff"}

        # 2) Membership in any pharmacy that sits in the same chain(s)
        chain_qs = pharmacy.chains.all()
        if chain_qs.exists():
            org_name = chain_qs.filter(
                organization__isnull=False,
                pharmacies__memberships__user=user,
                pharmacies__memberships__is_active=True
            ).values_list("organization__name", flat=True).distinct().first()
            if org_name:
                return {
                    "type": "ORG_STAFF",
                    "label": f"Organization staff ({org_name})",
                    "organization_name": org_name,
                }
            owner_chain_match = chain_qs.filter(
                organization__isnull=True,
                pharmacies__memberships__user=user,
                pharmacies__memberships__is_active=True
            ).exists()
            if owner_chain_match:
                return {"type": "CHAIN_STAFF", "label": "Chain staff"}

        # 3) Public/other pool
        return {"type": "PUBLIC", "label": "ChemistTasker"}


class OpenShiftSerializer(serializers.ModelSerializer):
    slots = ShiftSlotSerializer(many=True, read_only=True)
    pharmacy_name = serializers.CharField(source='pharmacy.name', read_only=True)
    visibility = serializers.CharField(read_only=True)
    allowed_escalation_levels = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "role_needed",
            "visibility",
            "allowed_escalation_levels",
            "description",
            "slots",
        ]

    def get_allowed_escalation_levels(self, obj):
        return ShiftSerializer.build_allowed_tiers(obj.pharmacy)

# === Invoice ===
class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = [
            'id',
            'description',
            'category_code',
            'unit',
            'quantity',
            'unit_price',
            'discount',
            'total',
            'gst_applicable',
            'super_applicable',
            'is_manual',
            'shift',
        ]
        read_only_fields = ['total']

    def create(self, validated_data):
        qty      = validated_data['quantity']
        rate     = validated_data['unit_price']
        discount = validated_data.get('discount', Decimal('0')) / Decimal('100')
        validated_data['total'] = (qty * rate * (1 - discount)).quantize(Decimal('0.01'))
        return super().create(validated_data)

    def update(self, instance, validated_data):
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        discount = validated_data.get('discount', instance.discount) / Decimal('100')
        instance.total = (instance.quantity * instance.unit_price * (1 - discount)).quantize(Decimal('0.01'))
        instance.save()
        return instance

class InvoiceSerializer(serializers.ModelSerializer):
    line_items = InvoiceLineItemSerializer(many=True)
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'user', 'external', 'pharmacy',
            'pharmacy_name_snapshot', 'pharmacy_address_snapshot', 'pharmacy_abn_snapshot',
            'custom_bill_to_name', 'custom_bill_to_address',
            'gst_registered', 'super_rate_snapshot',
            'bank_account_name', 'bsb', 'account_number',
            'super_fund_name', 'super_usi', 'super_member_number',
            'bill_to_email', 'cc_emails',
            'invoice_date', 'due_date',
            'subtotal', 'gst_amount', 'super_amount', 'total',
            'status', 'created_at',
            'line_items',
            # Recipient snapshot
            'bill_to_first_name', 'bill_to_last_name', 'bill_to_abn',

            # Issuer snapshot
            'issuer_first_name', 'issuer_last_name', 'issuer_abn',
        ]
        read_only_fields = [
            'subtotal', 'gst_amount', 'super_amount', 'total', 'created_at'
        ]

    def create(self, validated_data):
        items = validated_data.pop('line_items', [])
        invoice = Invoice.objects.create(**validated_data)
        for item in items:
            item['invoice'] = invoice
            InvoiceLineItemSerializer().create(item)

        # Recompute totals
        invoice.refresh_from_db()
        subtotal = sum(li.total for li in invoice.line_items.all())
        gst_amt = subtotal * Decimal('0.10') if invoice.gst_registered else Decimal('0.00')
        super_amt = subtotal * (invoice.super_rate_snapshot / Decimal('100'))
        invoice.subtotal = subtotal
        invoice.gst_amount = gst_amt
        invoice.super_amount = super_amt
        invoice.total = subtotal + gst_amt + super_amt
        invoice.save()
        return invoice

    def update(self, instance, validated_data):
        items = validated_data.pop('line_items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if items is not None:
            instance.line_items.all().delete()
            for item in items:
                item['invoice'] = instance
                InvoiceLineItemSerializer().create(item)

        # Recompute totals
        subtotal = sum(li.total for li in instance.line_items.all())
        gst_amt = subtotal * Decimal('0.10') if instance.gst_registered else Decimal('0.00')
        super_amt = subtotal * (instance.super_rate_snapshot / Decimal('100'))
        instance.subtotal = subtotal
        instance.gst_amount = gst_amt
        instance.super_amount = super_amt
        instance.total = subtotal + gst_amt + super_amt
        instance.save()
        return instance

class ExplorerPostReadSerializer(serializers.ModelSerializer):
    explorer_name = serializers.SerializerMethodField()
    explorer_user_id = serializers.SerializerMethodField()
    explorer_role_type = serializers.SerializerMethodField()
    author_user_id = serializers.IntegerField(source="author_user.id", read_only=True)
    skills = serializers.SerializerMethodField()
    software = serializers.SerializerMethodField()
    travel_states = serializers.SerializerMethodField()
    ahpra_years_since_first_registration = serializers.SerializerMethodField()
    years_experience = serializers.SerializerMethodField()
    rating_average = serializers.FloatField(read_only=True)
    rating_count = serializers.IntegerField(read_only=True)

    is_liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = ExplorerPost
        fields = [
            "id",
            "explorer_profile",
            "author_user_id",
            "headline",
            "body",
            "role_category",
            "role_title",
            "work_types",
            "post_kind",
            "coverage_radius_km",
            "open_to_travel",
            "travel_states",
            "ahpra_years_since_first_registration",
            "years_experience",
            "availability_mode",
            "availability_summary",
            "availability_days",
            "availability_notice",
            "location_suburb",
            "location_state",
            "location_postcode",
            "skills",
            "software",
            "reference_code",
            "is_anonymous",
            "view_count",
            "like_count",
            "reply_count",
            "rating_average",
            "rating_count",
            "created_at",
            "updated_at",
            "explorer_name",
            # --- ADD THE NEW FIELDS TO THE LIST ---
            "explorer_user_id",
            "explorer_role_type",
            "is_liked_by_me",
        ]
        read_only_fields = fields  # read serializer only

    def get_explorer_name(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        return user.get_full_name() if user else ""

    def get_explorer_user_id(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        return user.id if user else None

    def get_explorer_role_type(self, obj):
        if obj.explorer_profile:
            return getattr(obj.explorer_profile, "role_type", None)
        return obj.role_title or obj.role_category

    def _get_onboarding_skills(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return []
        try:
            if obj.role_category == "PHARMACIST":
                po = PharmacistOnboarding.objects.filter(user=user).first()
                return list(po.skills or []) if po else []
            if obj.role_category == "OTHER_STAFF":
                so = OtherStaffOnboarding.objects.filter(user=user).first()
                return list(so.skills or []) if so else []
            # Explorers do not expose skills on TalentBoard.
            return []
        except Exception:
            return []

    def get_skills(self, obj):
        # Always prefer onboarding skills for Pharmacist/Other Staff.
        if obj.role_category in ("PHARMACIST", "OTHER_STAFF"):
            return self._get_onboarding_skills(obj)
        # Explorers do not expose skills on TalentBoard.
        if obj.role_category == "EXPLORER":
            return []
        return list(obj.skills or []) if obj.skills else self._get_onboarding_skills(obj)

    def get_software(self, obj):
        return list(obj.software or []) if obj.software else []

    def get_travel_states(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return []
        try:
            if obj.role_category == "PHARMACIST":
                po = PharmacistOnboarding.objects.filter(user=user).first()
                return list(getattr(po, "travel_states", []) or []) if po else []
            if obj.role_category == "OTHER_STAFF":
                so = OtherStaffOnboarding.objects.filter(user=user).first()
                return list(getattr(so, "travel_states", []) or []) if so else []
            if obj.role_category == "EXPLORER":
                eo = ExplorerOnboarding.objects.filter(user=user).first()
                return list(getattr(eo, "travel_states", []) or []) if eo else []
        except Exception:
            return []
        return []

    def get_ahpra_years_since_first_registration(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return None
        if obj.role_category != "PHARMACIST":
            return None
        try:
            po = PharmacistOnboarding.objects.filter(user=user).first()
            return getattr(po, "ahpra_years_since_first_registration", None) if po else None
        except Exception:
            return None

    def get_years_experience(self, obj):
        user = obj.author_user or getattr(obj.explorer_profile, "user", None)
        if not user:
            return None
        if obj.role_category != "OTHER_STAFF":
            return None
        try:
            so = OtherStaffOnboarding.objects.filter(user=user).first()
            return getattr(so, "years_experience", None) if so else None
        except Exception:
            return None

    def get_is_liked_by_me(self, obj):
        req = self.context.get("request")
        if not req or not req.user or not req.user.is_authenticated:
            return False
        return ExplorerPostReaction.objects.filter(post=obj, user=req.user).exists()


class ExplorerPostWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExplorerPost
        fields = [
            "id",
            "explorer_profile",
            "headline",
            "body",
            "role_category",
            "role_title",
            "work_types",
            "post_kind",
            "coverage_radius_km",
            "open_to_travel",
            "availability_mode",
            "availability_summary",
            "availability_days",
            "availability_notice",
            "location_suburb",
            "location_state",
            "location_postcode",
            "skills",
            "software",
            "reference_code",
            "is_anonymous",
        ]

    def validate(self, attrs):
        """
        Ensure the creator owns the explorer_profile.
        (We re-check in perform_create too, but this gives nice 400s earlier.)
        """
        # Normalize JSON fields coming from multipart/form-data
        work_types = attrs.get("work_types")
        if isinstance(work_types, str):
            try:
                attrs["work_types"] = json.loads(work_types)
            except Exception:
                raise serializers.ValidationError({"work_types": "Invalid JSON list."})
        skills = attrs.get("skills")
        if isinstance(skills, str):
            try:
                attrs["skills"] = json.loads(skills)
            except Exception:
                raise serializers.ValidationError({"skills": "Invalid JSON list."})
        software = attrs.get("software")
        if isinstance(software, str):
            try:
                attrs["software"] = json.loads(software)
            except Exception:
                raise serializers.ValidationError({"software": "Invalid JSON list."})
        availability_days = attrs.get("availability_days")
        if isinstance(availability_days, str):
            try:
                attrs["availability_days"] = json.loads(availability_days)
            except Exception:
                raise serializers.ValidationError({"availability_days": "Invalid JSON list."})

        post_kind = attrs.get("post_kind", getattr(self.instance, "post_kind", None))
        existing_work_types = getattr(self.instance, "work_types", []) if self.instance else []
        work_types = list(attrs.get("work_types") if "work_types" in attrs else (existing_work_types or []))
        if post_kind == "FULL_TIME_APPLICATION":
            if "FULL_TIME" not in work_types:
                work_types.append("FULL_TIME")
            attrs["work_types"] = work_types
            attrs["availability_days"] = []
            attrs["availability_mode"] = "FULL_TIME_NOTICE"
            attrs["availability_summary"] = "Open to anytime"
            attrs["availability_notice"] = None
        elif post_kind == "AVAILABILITY":
            availability_days = list(attrs.get("availability_days") or [])
            attrs["availability_days"] = availability_days
            attrs["availability_mode"] = "CASUAL_CALENDAR" if availability_days else None
            attrs["availability_summary"] = attrs.get("availability_summary") or None
            if not availability_days:
                attrs["availability_notice"] = attrs.get("availability_notice") or None

        request = self.context.get("request")
        profile = attrs.get("explorer_profile")
        if request and request.user.is_authenticated and profile:
            if getattr(profile, "user_id", None) != request.user.id:
                raise serializers.ValidationError("You can only post from your own explorer profile.")
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data.setdefault("author_user", request.user)
            if not validated_data.get("explorer_profile") and getattr(request.user, "is_explorer", lambda: False)():
                try:
                    validated_data["explorer_profile"] = ExplorerOnboarding.objects.get(user=request.user)
                except ExplorerOnboarding.DoesNotExist:
                    pass
        if not validated_data.get("reference_code"):
            validated_data["reference_code"] = uuid.uuid4().hex[:8].upper()
        return ExplorerPost.objects.create(**validated_data)

    def update(self, instance, validated_data):
        updatable_fields = [
            "headline",
            "body",
            "role_category",
            "role_title",
            "work_types",
            "post_kind",
            "coverage_radius_km",
            "open_to_travel",
            "availability_mode",
            "availability_summary",
            "availability_days",
            "availability_notice",
            "location_suburb",
            "location_state",
            "location_postcode",
            "skills",
            "software",
            "reference_code",
            "is_anonymous",
            "explorer_profile",
        ]
        changed = []
        for field in updatable_fields:
            if field in validated_data:
                setattr(instance, field, validated_data[field])
                changed.append(field)
        if changed:
            changed.append("updated_at")
            instance.save(update_fields=list(set(changed)))
        return instance

# Availability
class UserAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAvailability
        fields = [
            'id', 'date', 'start_time', 'end_time',
            'is_all_day', 'is_recurring', 'recurring_days',
            'recurring_end_date', 'notify_new_shifts', 'notes'
        ]
        read_only_fields = ['id']


#  Ratings  
class RatingReadSerializer(serializers.ModelSerializer):
    rater_user_id = serializers.IntegerField(source="rater_user.id", read_only=True)
    ratee_user_id = serializers.IntegerField(source="ratee_user.id", read_only=True)
    ratee_pharmacy_id = serializers.IntegerField(source="ratee_pharmacy.id", read_only=True)

    class Meta:
        model = Rating
        fields = [
            "id", "direction", "stars", "comment",
            "rater_user_id", "ratee_user_id", "ratee_pharmacy_id",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


class RatingWriteSerializer(serializers.ModelSerializer):
    """
    Upsert semantics: if a rating already exists for (direction, rater, target),
    we update stars/comment; otherwise we create it.
    rater_user is taken from request.user in the view.
    """
    class Meta:
        model = Rating
        fields = ["direction", "ratee_user", "ratee_pharmacy", "stars", "comment"]

    def validate(self, attrs):
        direction = attrs.get("direction")
        ratee_user = attrs.get("ratee_user")
        ratee_pharmacy = attrs.get("ratee_pharmacy")

        if direction == Rating.Direction.OWNER_TO_WORKER:
            if not ratee_user or ratee_pharmacy is not None:
                raise serializers.ValidationError("OWNER_TO_WORKER requires ratee_user and no ratee_pharmacy.")
        elif direction == Rating.Direction.WORKER_TO_PHARMACY:
            if not ratee_pharmacy or ratee_user is not None:
                raise serializers.ValidationError("WORKER_TO_PHARMACY requires ratee_pharmacy and no ratee_user.")
        else:
            raise serializers.ValidationError({"direction": "Unknown direction."})

        stars = attrs.get("stars")
        if stars is None or not (1 <= int(stars) <= 5):
            raise serializers.ValidationError({"stars": "Stars must be between 1 and 5."})
        return attrs


class RatingSummarySerializer(serializers.Serializer):
    """
    Read-only aggregate: average + count for a target.
    Used by GET /ratings/summary?target_type=...&target_id=...
    """
    average = serializers.FloatField()
    count = serializers.IntegerField()


class MyRatingSerializer(serializers.Serializer):
    """
    Read-only: current user's rating (if any) on a target.
    Used by GET /ratings/mine?target_type=...&target_id=...
    """
    id = serializers.IntegerField(allow_null=True)
    direction = serializers.CharField()
    stars = serializers.IntegerField(allow_null=True)
    comment = serializers.CharField(allow_blank=True, allow_null=True)


class PendingRatingsSerializer(serializers.Serializer):
    """
    Read-only: IDs the user can still rate.
    Used by GET /ratings/pending
    """
    workers_to_rate = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)
    pharmacies_to_rate = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)

# --- Chat Serializers --------------------------------------------------------
class ChatMemberSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "first_name", "last_name", "email", "profile_photo_url"]

    def get_profile_photo_url(self, obj):
        photo = _resolve_user_profile_photo(obj)
        return _build_absolute_media_url(self.context.get("request"), photo)

class ChatMembershipSerializer(serializers.ModelSerializer):
    user_details = ChatMemberSerializer(source='user', read_only=True)
    class Meta:
        model = Membership
        fields = ["id", "user_details"]

class ReactionSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id')
    class Meta:
        model = MessageReaction
        fields = ['reaction', 'user_id']

class MessageSerializer(serializers.ModelSerializer):
    sender = ChatMembershipSerializer(read_only=True)
    attachment_url = serializers.SerializerMethodField()
    reactions = ReactionSerializer(many=True, read_only=True)
    attachment_filename = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    class Meta:
        model = Message
        fields = [
            "id", "conversation", "sender", "body", "attachment", "attachment_url",
            "attachment_filename", "created_at", "is_deleted", "is_edited",
            "original_body", "reactions",  "is_pinned",
        ]
        read_only_fields = fields
    def get_attachment_url(self, obj):
        try:
            return obj.attachment.url if obj.attachment else None
        except Exception:
            return None
 
    def get_attachment_filename(self, obj):
        if obj.attachment and hasattr(obj.attachment, 'name'):
            import os
            return os.path.basename(obj.attachment.name)
        return None
 
    def get_is_pinned(self, obj):
        request = self.context.get("request")
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            part = Participant.objects.filter(conversation=obj.conversation, membership__user=request.user).first()
            if part and part.pinned_message_id:
                return part.pinned_message_id == obj.id
        # Fallback to legacy conversation-level pin if present
        return obj.conversation.pinned_message_id == obj.id

class ConversationListSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    participant_ids = serializers.SerializerMethodField()
    my_last_read_at = serializers.SerializerMethodField()
    title = serializers.SerializerMethodField()
    my_membership_id = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    pinned_message = serializers.SerializerMethodField()
    created_by_user_id = serializers.IntegerField(source='created_by_id', read_only=True)
    my_is_admin = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id", "created_by", "type", "title","pharmacy","updated_at", "last_message",
            "unread_count", "participant_ids", "my_last_read_at", "my_membership_id",
            "is_pinned", "pinned_message", "created_by_user_id",
            "my_is_admin", "can_manage", "can_delete",

        ]

    def get_title(self, obj: Conversation) -> str:
            # --- START OF FIX ---
            # Prioritize the pharmacy link to guarantee the correct name for community chats.
        if hasattr(obj, 'pharmacy') and obj.pharmacy:
            return obj.pharmacy.name
        
        # Fallback for DMs and custom groups that use the title field.
        if obj.type == Conversation.Type.DM:
            request = self.context.get("request")
            if request and hasattr(request, 'user'):
                # This correctly finds the other user's name for DMs
                other_participant = obj.participants.exclude(membership__user=request.user).first()
                if other_participant and getattr(other_participant, "membership", None):
                    partner_user = getattr(other_participant.membership, "user", None)
                    if partner_user:
                        return partner_user.get_full_name() or partner_user.email
        
        # If it's a custom group or a DM where the partner can't be found, use the stored title.
        if obj.title:
            return obj.title
            
            # Final fallback.
            return "Group Chat"

    def _get_my_participant(self, obj):
        request = self.context.get("request")
        if not request or not hasattr(request, 'user') or not request.user.is_authenticated:
            return None
        if not hasattr(self, '_participant_cache'):
            self._participant_cache = {}
        cache_key = (request.user.id, obj.id)
        if cache_key not in self._participant_cache:
            self._participant_cache[cache_key] = Participant.objects.filter(conversation=obj, membership__user=request.user).first()
        return self._participant_cache[cache_key]
    
    def get_is_pinned(self, obj):
        my_part = self._get_my_participant(obj)
        return my_part.is_pinned if my_part else False

    def get_my_membership_id(self, obj):
        my_part = self._get_my_participant(obj)
        return my_part.membership_id if my_part else None

    def get_my_last_read_at(self, obj):
        my_part = self._get_my_participant(obj)
        return my_part.last_read_at.isoformat() if my_part and my_part.last_read_at else None

    def get_last_message(self, obj):
        msg = obj.messages.order_by("-created_at").first()
        if not msg: return None
        return {"id": msg.id, "body": msg.body[:200], "created_at": msg.created_at.isoformat(), "sender": msg.sender_id}

    def get_pinned_message(self, obj):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None) or not request.user.is_authenticated:
            # fallback to legacy conversation-level pinned message
            pm = obj.pinned_message
            return MessageSerializer(pm, context=self.context).data if pm else None
        part = Participant.objects.filter(conversation=obj, membership__user=request.user).first()
        if part and part.pinned_message:
            return MessageSerializer(part.pinned_message, context=self.context).data
        # legacy fallback
        pm = obj.pinned_message
        return MessageSerializer(pm, context=self.context).data if pm else None

    def get_unread_count(self, obj):
        my_part = self._get_my_participant(obj)
        if not my_part: return 0
        since = my_part.last_read_at
        qs = obj.messages
        # Never count my own messages as unread
        qs = qs.exclude(sender_id=my_part.membership_id)
        if not since:
            return qs.count()
        return qs.filter(created_at__gt=since).count()

    def get_participant_ids(self, obj):
        return list(obj.participants.values_list("membership_id", flat=True))

    def get_my_is_admin(self, obj):
        my_part = self._get_my_participant(obj)
        return bool(getattr(my_part, "is_admin", False)) if my_part else False

    def get_can_manage(self, obj):
        """
        Match ConversationViewSet logic:
        - Pharmacy chat: require comms admin capability.
        - Custom group: creator or participant admin.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        my_part = self._get_my_participant(obj)
        if obj.pharmacy_id:
            try:
                from client_profile.admin_helpers import has_admin_capability, CAPABILITY_MANAGE_COMMS
                return has_admin_capability(user, obj.pharmacy, CAPABILITY_MANAGE_COMMS)
            except Exception:
                return False
        if obj.created_by_id == user.id:
            return True
        return bool(getattr(my_part, "is_admin", False))

    def get_can_delete(self, obj):
        """
        Align with perform_destroy:
        - Pharmacy chat: comms admin only.
        - Custom group: creator or admin (or self-only group).
        - DM: participants can delete-for-me (handled server-side); expose true so client can show delete-for-me.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        my_part = self._get_my_participant(obj)
        if obj.type == Conversation.Type.DM:
            return True
        if obj.pharmacy_id:
            try:
                from client_profile.admin_helpers import has_admin_capability, CAPABILITY_MANAGE_COMMS
                return has_admin_capability(user, obj.pharmacy, CAPABILITY_MANAGE_COMMS)
            except Exception:
                return False
        if obj.created_by_id == user.id:
            return True
        if my_part and getattr(my_part, "is_admin", False):
            return True
        try:
            if obj.participants.count() == 1 and my_part:
                return True
        except Exception:
            pass
        return False

class ConversationCreateSerializer(serializers.ModelSerializer):
    participants = serializers.PrimaryKeyRelatedField(
        queryset=Membership.objects.filter(is_active=True), 
        many=True, 
        write_only=True,
        required=False
    )

    class Meta:
        model = Conversation
        fields = ["id", "type", "title", "participants", "created_by"]
        read_only_fields = ["id", "created_by", "type"]

    def create(self, validated_data):
        participants_data = validated_data.pop("participants", [])
        validated_data['created_by'] = self.context['request'].user

        conv = Conversation.objects.create(**validated_data)

        # Add creator + dedupe, mark creator admin
        creator_membership = (
            Membership.objects.filter(user=self.context['request'].user, is_active=True).first()
        )
        if creator_membership:
            # Normalise & dedupe incoming participants (can be Membership instances)
            participant_memberships = {m if isinstance(m, Membership) else None for m in participants_data}
            participant_memberships = {m for m in participant_memberships if isinstance(m, Membership)}
            participant_memberships.add(creator_membership)

            # Insert; mark creator as admin; ignore conflicts if client sent creator too
            Participant.objects.bulk_create(
                [
                    Participant(
                        conversation=conv,
                        membership=m,
                        is_admin=(m.id == creator_membership.id)
                    )
                    for m in participant_memberships
                    if getattr(m, "is_active", True)
                ],
                ignore_conflicts=True,
            )
        return conv


    def update(self, instance, validated_data):
        if 'participants' in validated_data:
            # Incoming can be a queryset or list of Membership objects
            new_participants_qs = validated_data.pop('participants')
            new_participant_ids = {p.id for p in new_participants_qs}

            # Current links
            current_participant_ids = set(
                instance.participants.values_list('membership_id', flat=True)
            )

            # Ensure creator is always included
            creator_user = instance.created_by
            creator_mem = (
                Membership.objects.filter(user=creator_user, is_active=True).first()
                or Membership.objects.filter(user=creator_user).first()
            )
            if creator_mem:
                new_participant_ids.add(creator_mem.id)

            # Add missing memberships (keep creator admin)
            ids_to_add = new_participant_ids - current_participant_ids
            if ids_to_add:
                memberships_to_add = list(Membership.objects.filter(id__in=ids_to_add))
                Participant.objects.bulk_create(
                    [
                        Participant(
                            conversation=instance,
                            membership=m,
                            is_admin=(creator_mem and m.id == creator_mem.id)
                        )
                        for m in memberships_to_add
                    ],
                    ignore_conflicts=True,
                )

            # Remove those no longer present (but never remove creator)
            if creator_mem:
                current_participant_ids.discard(creator_mem.id)
            ids_to_remove = current_participant_ids - new_participant_ids
            if ids_to_remove:
                instance.participants.filter(membership_id__in=ids_to_remove).delete()

        return super().update(instance, validated_data)

class ConversationDetailSerializer(ConversationListSerializer):
    class Meta(ConversationListSerializer.Meta):
        fields = ConversationListSerializer.Meta.fields

class ChatParticipantSerializer(serializers.ModelSerializer):
    """
    A specific serializer to provide user details for all participants
    in a user's conversations, regardless of their active status.
    """
    user_details = ChatMemberSerializer(source='user', read_only=True)
    is_admin = serializers.SerializerMethodField()

    def get_is_admin(self, obj):
        # A membership can have multiple participant rows; return True if any mark this membership as admin.
        from .models import Participant  # local import to avoid cycles
        return Participant.objects.filter(membership=obj, is_admin=True).exists()

    class Meta:
        model = Membership
        fields = [
            "id",
            "user_details",
            "role",
            "employment_type",
            "invited_name",
            "is_admin",
        ]

class ShiftContactSerializer(serializers.Serializer):
    """
    Lightweight serializer for shift-related chat contacts.
    Includes aggregated pharmacy info for users with multiple shifts.
    """
    pharmacy_id = serializers.IntegerField(required=False, allow_null=True)
    pharmacy_name = serializers.CharField(required=False, allow_blank=True)
    pharmacies = serializers.ListField(child=serializers.DictField(), required=False)
    shift_id = serializers.IntegerField(required=False, allow_null=True)
    shift_date = serializers.DateField(required=False, allow_null=True)
    role = serializers.CharField()
    user = ChatMemberSerializer()

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "type",
            "title",
            "body",
            "payload",
            "action_url",
            "created_at",
            "read_at",
        ]
        read_only_fields = fields


# --- Pharmacy Hub Serializers --------------------------------------------------------

def _build_absolute_media_url(request, file_field):
    if not file_field:
        return None
    try:
        url = file_field.url
    except Exception:
        return None
    if request:
        try:
            return request.build_absolute_uri(url)
        except Exception:
            return url
    return url


def _serialize_user_summary(user, request):
    if not user:
        return None
    photo = _resolve_user_profile_photo(user)
    return {
        "id": user.id,
        "username": getattr(user, "username", None),
        "first_name": getattr(user, "first_name", None),
        "last_name": getattr(user, "last_name", None),
        "email": getattr(user, "email", None),
        "profile_photo_url": _build_absolute_media_url(request, photo),
    }


class HubPharmacySerializer(serializers.ModelSerializer):
    cover_image = serializers.ImageField(read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    organization_name = serializers.CharField(source="organization.name", read_only=True)
    can_manage_profile = serializers.SerializerMethodField()
    can_create_group = serializers.SerializerMethodField()
    can_create_post = serializers.SerializerMethodField()

    class Meta:
        model = Pharmacy
        fields = [
            "id",
            "name",
            "about",
            "cover_image",
            "cover_image_url",
            "organization_id",
            "organization_name",
            "can_manage_profile",
            "can_create_group",
            "can_create_post",
        ]
        read_only_fields = fields

    def _permission_for(self, obj, key, default=False):
        perms = self.context.get("pharmacy_permissions", {})
        return perms.get(obj.id, {}).get(key, default)

    def get_cover_image_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.cover_image)

    def get_can_manage_profile(self, obj):
        return self._permission_for(obj, "can_manage_profile")

    def get_can_create_group(self, obj):
        return self._permission_for(obj, "can_create_group")

    def get_can_create_post(self, obj):
        return self._permission_for(obj, "can_create_post", True)


class HubOrganizationSerializer(serializers.ModelSerializer):
    cover_image = serializers.ImageField(read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    can_manage_profile = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    is_org_admin = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = [
            "id",
            "name",
            "about",
            "cover_image",
            "cover_image_url",
            "can_manage_profile",
            "is_org_admin",
            "member_count",
        ]
        read_only_fields = fields

    def get_cover_image_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.cover_image)

    def get_can_manage_profile(self, obj):
        perms = self.context.get("organization_permissions", {})
        return perms.get(obj.id, {}).get("can_manage_profile", False)

    def get_member_count(self, obj):
        counts = self.context.get("organization_member_counts", {})
        return counts.get(obj.id, 0)

    def get_is_org_admin(self, obj):
        perms = self.context.get("organization_permissions", {})
        return perms.get(obj.id, {}).get("is_org_admin", False)


class HubPharmacyProfileSerializer(UploadValidationMixin, serializers.ModelSerializer):
    upload_validation_map = {
        "cover_image": IMAGE_UPLOAD_POLICY,
    }

    class Meta:
        model = Pharmacy
        fields = ["about", "cover_image"]


def _serialize_hub_author(membership, user, request):
    def _display_role(target_user):
        if not target_user:
            return ""
        top_role = (getattr(target_user, "role", "") or "").upper()
        if top_role == "OWNER":
            return "Owner"
        if top_role == "PHARMACIST":
            return "Pharmacist"
        if top_role == "OTHER_STAFF":
            role_type = (
                OtherStaffOnboarding.objects.filter(user=target_user)
                .values_list("role_type", flat=True)
                .first()
            )
            if (role_type or "").upper() == "INTERN":
                return "Intern"
            return "Staff"
        if top_role == "ORG_STAFF":
            return "Staff"
        if top_role == "EXPLORER":
            return "Explorer"
        return ""

    target_user = user or getattr(membership, "user", None)
    summary = _serialize_user_summary(target_user, request)
    if membership:
        return {
            "id": membership.id,
            "role": _display_role(target_user),
            "employment_type": getattr(membership, "employment_type", "") or "",
            "job_title": getattr(membership, "job_title", "") or "",
            "user_details": summary,
        }
    if not summary:
        return None
    return {
        "id": 0,
        "role": _display_role(target_user),
        "employment_type": "",
        "job_title": "",
        "user_details": summary,
    }


class HubOrganizationProfileSerializer(UploadValidationMixin, serializers.ModelSerializer):
    upload_validation_map = {
        "cover_image": IMAGE_UPLOAD_POLICY,
    }

    class Meta:
        model = Organization
        fields = ["about", "cover_image"]


class HubMembershipSerializer(serializers.ModelSerializer):
    user_details = ChatMemberSerializer(source="user", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "role", "employment_type", "job_title", "user_details"]
        read_only_fields = fields


class PharmacyCommunityGroupMemberSerializer(serializers.ModelSerializer):
    membership_id = serializers.IntegerField(read_only=True)
    member = HubMembershipSerializer(source="membership", read_only=True)
    pharmacy_id = serializers.IntegerField(source="membership.pharmacy_id", read_only=True)
    pharmacy_name = serializers.CharField(
        source="membership.pharmacy.name", read_only=True
    )
    job_title = serializers.CharField(
        source="membership.job_title", read_only=True, allow_blank=True
    )

    class Meta:
        model = PharmacyCommunityGroupMembership
        fields = [
            "membership_id",
            "member",
            "is_admin",
            "joined_at",
            "pharmacy_id",
            "pharmacy_name",
            "job_title",
        ]
        read_only_fields = [
            "membership_id",
            "member",
            "joined_at",
            "pharmacy_id",
            "pharmacy_name",
            "job_title",
        ]


class HubCommunityGroupSerializer(serializers.ModelSerializer):
    members = PharmacyCommunityGroupMemberSerializer(
        source="memberships", many=True, read_only=True
    )
    member_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )
    member_count = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    organization_id = serializers.IntegerField(
        source="pharmacy.organization_id", read_only=True
    )
    is_creator = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyCommunityGroup
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "organization_id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "members",
            "member_ids",
            "member_count",
            "is_admin",
            "is_member",
            "is_creator",
        ]
        read_only_fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "organization_id",
            "created_at",
            "updated_at",
            "members",
            "member_count",
            "is_admin",
            "is_member",
            "is_creator",
        ]

    def _resolve_memberships(self, pharmacy, member_ids):
        if not member_ids:
            return []
        allowed_pharmacy_ids = set(
            self.context.get("allowed_pharmacy_ids") or []
        )
        if pharmacy:
            allowed_pharmacy_ids.add(pharmacy.id)
        memberships_qs = Membership.objects.filter(
            id__in=member_ids,
            is_active=True,
        )
        if allowed_pharmacy_ids:
            memberships_qs = memberships_qs.filter(
                pharmacy_id__in=allowed_pharmacy_ids
            )
        memberships = list(memberships_qs)
        found_ids = {m.id for m in memberships}
        missing = sorted(set(member_ids) - found_ids)
        if missing:
            raise serializers.ValidationError(
                {
                    "member_ids": (
                        "Invalid membership IDs for manageable pharmacies: "
                        f"{missing}"
                    )
                }
            )
        return memberships

    def _ensure_creator_membership(self, pharmacy):
        request_membership = self.context.get("request_membership")
        if request_membership and request_membership.pharmacy_id == pharmacy.id:
            return request_membership
        user = self.context["request"].user if "request" in self.context else None
        if not user:
            return None
        return (
            Membership.objects.filter(
                user=user,
                pharmacy=pharmacy,
                is_active=True,
            )
            .order_by("id")
            .first()
        )

    def create(self, validated_data):
        member_ids = set(validated_data.pop("member_ids", []) or [])
        pharmacy = validated_data["pharmacy"]
        creator_membership = self._ensure_creator_membership(pharmacy)
        if creator_membership:
            member_ids.add(creator_membership.id)
        memberships = self._resolve_memberships(pharmacy, member_ids)
        with transaction.atomic():
            group = PharmacyCommunityGroup.objects.create(**validated_data)
            bulk_links = [
                PharmacyCommunityGroupMembership(
                    group=group,
                    membership=membership,
                    is_admin=(membership == creator_membership),
                )
                for membership in memberships
            ]
            PharmacyCommunityGroupMembership.objects.bulk_create(bulk_links)
        return group

    def update(self, instance, validated_data):
        membership_ids = validated_data.pop("member_ids", None)
        response = super().update(instance, validated_data)
        if membership_ids is not None:
            membership_ids = set(membership_ids)
            memberships = self._resolve_memberships(instance.pharmacy, membership_ids)
            desired_ids = {membership.id for membership in memberships}
            existing_links = {
                link.membership_id: link
                for link in PharmacyCommunityGroupMembership.objects.filter(
                    group=instance
                )
            }
            new_links = []
            for membership in memberships:
                if membership.id in existing_links:
                    continue
                new_links.append(
                    PharmacyCommunityGroupMembership(
                        group=instance,
                        membership=membership,
                    )
                )
            if new_links:
                PharmacyCommunityGroupMembership.objects.bulk_create(new_links)
            to_remove = set(existing_links.keys()) - desired_ids
            if to_remove:
                PharmacyCommunityGroupMembership.objects.filter(
                    group=instance, membership_id__in=to_remove
                ).delete()
        return response

    def get_member_count(self, obj):
        return getattr(obj, "member_count", obj.memberships.count())

    def get_is_admin(self, obj):
        request = self.context.get("request")
        if request and getattr(request, "user", None):
            if obj.created_by_id == request.user.id:
                return True
        admin_map = self.context.get("group_admin_map", {})
        return admin_map.get(obj.id, False)

    def get_is_member(self, obj):
        member_map = self.context.get("group_member_map", {})
        return member_map.get(obj.id, False)

    def get_is_creator(self, obj):
        request = self.context.get("request")
        if request and getattr(request, "user", None):
            return obj.created_by_id == request.user.id
        return False

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not self.context.get("include_members", True):
            data.pop("members", None)
        return data


class HubCommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    is_edited = serializers.BooleanField(read_only=True)
    original_body = serializers.CharField(read_only=True)
    edited_at = serializers.DateTimeField(source="last_edited_at", read_only=True)
    edited_by = serializers.SerializerMethodField()
    is_deleted = serializers.SerializerMethodField()
    viewer_reaction = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubComment
        fields = [
            "id",
            "post",
            "author",
            "body",
            "parent_comment",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
            "reaction_summary",
            "viewer_reaction",
        ]
        read_only_fields = [
            "id",
            "post",
            "author",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
            "reaction_summary",
            "viewer_reaction",
        ]

    def get_can_edit(self, obj):
        membership = self.context.get("request_membership")
        if membership and membership == obj.author_membership:
            return True
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if request_user and obj.author_user_id == request_user.id:
            return True
        return self.context.get("has_admin_permissions", False)

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "author_membership", None),
            getattr(obj, "author_user", None)
            or getattr(getattr(obj, "author_membership", None), "user", None),
            self.context.get("request"),
        )

    def get_edited_by(self, obj):
        user = getattr(obj, "last_edited_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_is_deleted(self, obj):
        return obj.deleted_at is not None

    def get_viewer_reaction(self, obj):
        membership = self.context.get("request_membership")
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if membership:
            return (
                obj.reactions.filter(member=membership)
                .values_list("reaction_type", flat=True)
                .first()
            )
        if request_user and request_user.is_authenticated:
            return (
                obj.reactions.filter(user=request_user)
                .values_list("reaction_type", flat=True)
                .first()
            )
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("is_deleted"):
            data["body"] = "This comment has been deleted."
        return data


class HubAttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    filename = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubAttachment
        fields = ["id", "kind", "url", "filename", "uploaded_at"]
        read_only_fields = fields

    def get_url(self, obj):
        return _build_absolute_media_url(self.context.get("request"), obj.file)

    def get_filename(self, obj):
        if obj.file and hasattr(obj.file, "name"):
            import os

            return os.path.basename(obj.file.name)
        return None


class HubPostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    viewer_reaction = serializers.SerializerMethodField()
    recent_comments = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    attachments = HubAttachmentSerializer(many=True, read_only=True)
    is_edited = serializers.BooleanField(read_only=True)
    original_body = serializers.CharField(read_only=True)
    edited_at = serializers.DateTimeField(source="last_edited_at", read_only=True)
    edited_by = serializers.SerializerMethodField()
    is_deleted = serializers.SerializerMethodField()
    is_pinned = serializers.BooleanField(read_only=True)
    pinned_at = serializers.DateTimeField(read_only=True)
    pinned_by = serializers.SerializerMethodField()
    viewer_is_admin = serializers.SerializerMethodField()
    organization = serializers.IntegerField(source="organization_id", read_only=True)
    organization_name = serializers.SerializerMethodField()
    platform_hub = serializers.CharField(read_only=True)
    pharmacy_name = serializers.SerializerMethodField()
    community_group = serializers.IntegerField(
        source="community_group_id", read_only=True
    )
    community_group_name = serializers.SerializerMethodField()
    scope_type = serializers.SerializerMethodField()
    scope_target_id = serializers.SerializerMethodField()
    tagged_members = serializers.SerializerMethodField()
    tagged_member_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
        allow_empty=True,
    )

    class Meta:
        model = PharmacyHubPost
        fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "community_group",
            "community_group_name",
            "organization",
            "organization_name",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "body",
            "visibility",
            "allow_comments",
            "created_at",
            "updated_at",
            "deleted_at",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
            "can_manage",
            "attachments",
            "is_edited",
            "is_pinned",
            "pinned_at",
            "pinned_by",
            "original_body",
            "edited_at",
            "edited_by",
            "viewer_is_admin",
            "is_deleted",
            "tagged_members",
            "tagged_member_ids",
        ]
        read_only_fields = [
            "id",
            "pharmacy",
            "pharmacy_name",
            "community_group",
            "community_group_name",
            "organization",
            "organization_name",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "created_at",
            "updated_at",
            "deleted_at",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
            "can_manage",
            "attachments",
            "is_edited",
            "is_pinned",
            "pinned_at",
            "pinned_by",
            "original_body",
            "edited_at",
            "edited_by",
            "viewer_is_admin",
            "is_deleted",
            "tagged_members",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._newly_tagged_members = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "tagged_member_ids" in getattr(self, "initial_data", {}):
            raw_ids = self.initial_data.get("tagged_member_ids") or []
            memberships = self._resolve_tagged_memberships(raw_ids)
            attrs["_tagged_memberships"] = memberships
        return attrs

    def create(self, validated_data):
        validated_data.pop("tagged_member_ids", None)
        memberships = validated_data.pop("_tagged_memberships", None)
        post = super().create(validated_data)
        self._newly_tagged_members = self._apply_mentions(post, memberships)
        return post

    def update(self, instance, validated_data):
        validated_data.pop("tagged_member_ids", None)
        memberships = validated_data.pop("_tagged_memberships", None)
        post = super().update(instance, validated_data)
        if memberships is not None:
            self._newly_tagged_members = self._apply_mentions(post, memberships)
        return post

    def _resolve_tagged_memberships(self, member_ids):
        if not isinstance(member_ids, list):
            raise serializers.ValidationError({"tagged_member_ids": "Provide a list of membership ids."})
        normalized_ids = []
        for raw in member_ids:
            try:
                normalized_ids.append(int(raw))
            except (TypeError, ValueError):
                raise serializers.ValidationError({"tagged_member_ids": f"Invalid membership id: {raw}"})
        if not normalized_ids:
            return []
        memberships = list(
            Membership.objects.filter(id__in=set(normalized_ids), is_active=True).select_related("pharmacy__organization", "user")
        )
        if len(memberships) != len(set(normalized_ids)):
            found_ids = {m.id for m in memberships}
            missing = [mid for mid in normalized_ids if mid not in found_ids]
            raise serializers.ValidationError({"tagged_member_ids": f"Invalid membership ids: {missing}"})
        context = self.context or {}
        pharmacy = context.get("pharmacy")
        organization = context.get("organization")
        community_group = context.get("community_group")
        platform_hub = context.get("platform_hub")
        if community_group:
            allowed_ids = set(
                PharmacyCommunityGroupMembership.objects.filter(
                    group=community_group
                ).values_list("membership_id", flat=True)
            )
            invalid = [m.id for m in memberships if m.id not in allowed_ids]
            if invalid:
                raise serializers.ValidationError(
                    {
                        "tagged_member_ids": (
                            "Memberships must belong to the selected group."
                        )
                    }
                )
        elif pharmacy:
            invalid = [m.id for m in memberships if m.pharmacy_id != pharmacy.id]
            if invalid:
                raise serializers.ValidationError({"tagged_member_ids": f"Memberships must belong to pharmacy #{pharmacy.id}."})
        elif organization:
            invalid = [
                m.id
                for m in memberships
                if not m.pharmacy or m.pharmacy.organization_id != organization.id
            ]
            if invalid:
                raise serializers.ValidationError(
                    {"tagged_member_ids": f"Memberships must belong to organization #{organization.id}."}
                )
        elif platform_hub:
            raise serializers.ValidationError(
                {"tagged_member_ids": "Member tagging is not available in ChemistTasker Hub posts."}
            )
        else:
            raise serializers.ValidationError({"tagged_member_ids": "Unable to determine post scope for tagging."})
        return memberships

    def _apply_mentions(self, post, memberships):
        if memberships is None:
            return []
        desired_ids = {m.id for m in memberships}
        existing_ids = set(post.mentions.values_list("membership_id", flat=True))
        to_remove = existing_ids - desired_ids
        if to_remove:
            PharmacyHubPostMention.objects.filter(post=post, membership_id__in=to_remove).delete()
        to_add = desired_ids - existing_ids
        new_links = [
            PharmacyHubPostMention(post=post, membership=membership)
            for membership in memberships
            if membership.id in to_add
        ]
        if new_links:
            PharmacyHubPostMention.objects.bulk_create(new_links)
        return [membership for membership in memberships if membership.id in to_add]

    def get_scope_type(self, obj):
        if obj.platform_hub:
            return "platform"
        if obj.community_group_id:
            return "group"
        if obj.pharmacy_id:
            return "pharmacy"
        if obj.organization_id:
            return "organization"
        return None

    def get_scope_target_id(self, obj):
        if obj.platform_hub:
            return obj.platform_hub
        if obj.community_group_id:
            return obj.community_group_id
        if obj.pharmacy_id:
            return obj.pharmacy_id
        return obj.organization_id

    def get_viewer_reaction(self, obj):
        membership = self.context.get("request_membership")
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if membership:
            return (
                obj.reactions.filter(member=membership)
                .values_list("reaction_type", flat=True)
                .first()
            )
        if request_user and request_user.is_authenticated:
            return (
                obj.reactions.filter(user=request_user)
                .values_list("reaction_type", flat=True)
                .first()
            )
        return None

    def get_recent_comments(self, obj):
        comments_qs = (
            obj.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
            .order_by("-created_at")[:2]
        )
        serializer = HubCommentSerializer(
            comments_qs,
            many=True,
            context=self.context,
        )
        return list(reversed(serializer.data))

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "author_membership", None),
            getattr(obj, "author_user", None),
            self.context.get("request"),
        )

    def get_can_manage(self, obj):
        membership = self.context.get("request_membership")
        if membership and membership == obj.author_membership:
            return True
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        return bool(request_user and obj.author_user_id == request_user.id)

    def get_edited_by(self, obj):
        user = getattr(obj, "last_edited_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_is_deleted(self, obj):
        return obj.deleted_at is not None

    def get_pinned_by(self, obj):
        user = getattr(obj, "pinned_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_viewer_is_admin(self, obj):
        if self.context.get("has_admin_permissions"):
            return True
        return bool(self.context.get("has_group_admin_permissions", False))

    def get_organization_name(self, obj):
        organization = getattr(obj, "organization", None)
        if not organization:
            return None
        return organization.name

    def get_pharmacy_name(self, obj):
        pharmacy = getattr(obj, "pharmacy", None)
        if not pharmacy:
            return None
        return pharmacy.name

    def get_community_group_name(self, obj):
        group = getattr(obj, "community_group", None)
        if not group:
            return None
        return group.name

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("is_deleted"):
            data["body"] = "This post has been deleted."
            data["attachments"] = []
        return data

    def get_tagged_members(self, obj):
        tagged = []
        for mention in obj.mentions.all():
            membership = mention.membership
            if not membership:
                continue
            user = getattr(membership, "user", None)
            full_name = ""
            if user:
                full_name = user.get_full_name().strip() or user.email or ""
            if not full_name:
                full_name = membership.display_name if hasattr(membership, "display_name") else ""
            tagged.append(
                {
                    "membership_id": membership.id,
                    "full_name": full_name or "(Unnamed)",
                    "email": user.email if user else None,
                    "role": membership.role,
                    "job_title": membership.job_title or "",
                }
            )
        return tagged


class HubPollOptionSerializer(serializers.ModelSerializer):
    percentage = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubPollOption
        fields = ["id", "label", "vote_count", "percentage", "position"]
        read_only_fields = ["id", "vote_count", "percentage", "position"]

    def get_percentage(self, obj):
        total = self.context.get("total_votes") or 0
        if total <= 0:
            return 0
        return round((obj.vote_count / total) * 100)


class HubPollSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    options = serializers.SerializerMethodField()
    option_labels = serializers.ListField(
        child=serializers.CharField(max_length=255),
        write_only=True,
        required=True,
        allow_empty=False,
    )
    total_votes = serializers.SerializerMethodField()
    has_voted = serializers.SerializerMethodField()
    selected_option_id = serializers.SerializerMethodField()
    platform_hub = serializers.CharField(read_only=True)
    scope_type = serializers.SerializerMethodField()
    scope_target_id = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    can_vote = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    comment_count = serializers.IntegerField(read_only=True)
    reaction_summary = serializers.JSONField(read_only=True)
    viewer_reaction = serializers.SerializerMethodField()
    recent_comments = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubPoll
        fields = [
            "id",
            "question",
            "pharmacy",
            "organization",
            "community_group",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "created_at",
            "updated_at",
            "closes_at",
            "is_closed",
            "options",
            "option_labels",
            "can_manage",
            "total_votes",
            "has_voted",
            "selected_option_id",
            "created_by",
            "can_vote",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
        ]
        read_only_fields = [
            "id",
            "pharmacy",
            "organization",
            "community_group",
            "platform_hub",
            "scope_type",
            "scope_target_id",
            "author",
            "created_at",
            "updated_at",
            "closes_at",
            "is_closed",
            "options",
            "total_votes",
            "has_voted",
            "selected_option_id",
            "created_by",
            "can_vote",
            "can_manage",
            "comment_count",
            "reaction_summary",
            "viewer_reaction",
            "recent_comments",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance:
            field = self.fields.get("option_labels")
            if field:
                field.required = False
                field.allow_null = True
                field.allow_empty = True

    def validate_option_labels(self, value):
        normalized = [label.strip() for label in value if label and label.strip()]
        if len(normalized) < 2:
            raise serializers.ValidationError("Provide at least two poll options.")
        if len(normalized) > 5:
            raise serializers.ValidationError("You can specify up to five options.")
        return normalized

    def create(self, validated_data):
        option_labels = validated_data.pop("option_labels", [])
        poll = PharmacyHubPoll.objects.create(
            question=validated_data["question"],
            pharmacy=self.context.get("pharmacy"),
            organization=self.context.get("organization"),
            community_group=self.context.get("community_group"),
            platform_hub=self.context.get("platform_hub"),
            created_by=self.context.get("request_user"),
            created_by_membership=self.context.get("request_membership"),
        )
        options = [
            PharmacyHubPollOption(
                poll=poll,
                label=label,
                position=index,
            )
            for index, label in enumerate(option_labels)
        ]
        PharmacyHubPollOption.objects.bulk_create(options)
        poll.refresh_from_db()
        return poll

    def update(self, instance, validated_data):
        option_labels = validated_data.pop("option_labels", None)
        question = validated_data.get("question")
        if question is not None:
            instance.question = question
        with transaction.atomic():
            instance.save(update_fields=["question"])
            if option_labels is not None:
                PharmacyHubPollVote.objects.filter(poll=instance).delete()
                instance.options.all().delete()
                new_options = [
                    PharmacyHubPollOption(
                        poll=instance,
                        label=label,
                        position=index,
                    )
                    for index, label in enumerate(option_labels)
                ]
                PharmacyHubPollOption.objects.bulk_create(new_options)
        instance.refresh_from_db()
        return instance

    def get_scope_type(self, obj):
        if obj.platform_hub:
            return "platform"
        if obj.community_group_id:
            return "group"
        if obj.pharmacy_id:
            return "pharmacy"
        if obj.organization_id:
            return "organization"
        return None

    def get_scope_target_id(self, obj):
        if obj.platform_hub:
            return obj.platform_hub
        if obj.community_group_id:
            return obj.community_group_id
        if obj.pharmacy_id:
            return obj.pharmacy_id
        return obj.organization_id

    def get_total_votes(self, obj):
        total = getattr(obj, "_total_votes", None)
        if total is None:
            total = sum(option.vote_count for option in obj.options.all())
            obj._total_votes = total
        return total

    def get_options(self, obj):
        total = self.get_total_votes(obj)
        serializer = HubPollOptionSerializer(
            obj.options.all(),
            many=True,
            context={"total_votes": total},
        )
        return serializer.data

    def _get_membership(self):
        return self.context.get("request_membership")

    def get_has_voted(self, obj):
        membership = self._get_membership()
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        votes = getattr(obj, "_prefetched_votes", None)
        if membership:
            if votes is None:
                return obj.votes.filter(membership=membership).exists()
            return any(v.membership_id == membership.id for v in votes)
        if request_user and request_user.is_authenticated:
            if votes is None:
                return obj.votes.filter(user=request_user).exists()
            return any(v.user_id == request_user.id for v in votes)
        return False

    def get_selected_option_id(self, obj):
        membership = self._get_membership()
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        votes = getattr(obj, "_prefetched_votes", None)
        if membership:
            if votes is None:
                return (
                    obj.votes.filter(membership=membership)
                    .values_list("option_id", flat=True)
                    .first()
                )
            for vote in votes:
                if vote.membership_id == membership.id:
                    return vote.option_id
        elif request_user and request_user.is_authenticated:
            if votes is None:
                return (
                    obj.votes.filter(user=request_user)
                    .values_list("option_id", flat=True)
                    .first()
                )
            for vote in votes:
                if vote.user_id == request_user.id:
                    return vote.option_id
        return None

    def get_created_by(self, obj):
        return self.get_author(obj)

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "created_by_membership", None),
            getattr(obj, "created_by", None),
            self.context.get("request"),
        )

    def get_can_vote(self, obj):
        membership = self._get_membership()
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        return bool(membership or (request_user and request_user.is_authenticated)) and not obj.is_closed

    def get_can_manage(self, obj):
        membership = self._get_membership()
        is_creator = membership and getattr(obj, "created_by_membership_id", None) == membership.id
        has_admin = bool(self.context.get("has_admin_permissions") or self.context.get("has_group_admin_permissions"))
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        return bool(is_creator or has_admin or (request_user and obj.created_by_id == request_user.id))

    def get_viewer_reaction(self, obj):
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if not request_user or not request_user.is_authenticated:
            return None
        return (
            obj.reactions.filter(user=request_user)
            .values_list("reaction_type", flat=True)
            .first()
        )

    def get_recent_comments(self, obj):
        comments_qs = (
            obj.comments.filter(deleted_at__isnull=True)
            .select_related("author_membership__user", "author_user")
            .order_by("-created_at")[:2]
        )
        serializer = HubPollCommentSerializer(
            comments_qs,
            many=True,
            context=self.context,
        )
        return list(reversed(serializer.data))


class HubPollCommentSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    is_edited = serializers.BooleanField(read_only=True)
    original_body = serializers.CharField(read_only=True)
    edited_at = serializers.DateTimeField(source="last_edited_at", read_only=True)
    edited_by = serializers.SerializerMethodField()
    is_deleted = serializers.SerializerMethodField()

    class Meta:
        model = PharmacyHubPollComment
        fields = [
            "id",
            "poll",
            "author",
            "body",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
        ]
        read_only_fields = [
            "id",
            "poll",
            "author",
            "created_at",
            "updated_at",
            "deleted_at",
            "can_edit",
            "is_edited",
            "original_body",
            "edited_at",
            "edited_by",
            "is_deleted",
        ]

    def get_author(self, obj):
        return _serialize_hub_author(
            getattr(obj, "author_membership", None),
            getattr(obj, "author_user", None),
            self.context.get("request"),
        )

    def get_can_edit(self, obj):
        membership = self.context.get("request_membership")
        if membership and membership == obj.author_membership:
            return True
        request = self.context.get("request")
        request_user = getattr(request, "user", None)
        if request_user and obj.author_user_id == request_user.id:
            return True
        return self.context.get("has_admin_permissions", False)

    def get_edited_by(self, obj):
        user = getattr(obj, "last_edited_by", None)
        return _serialize_user_summary(user, self.context.get("request"))

    def get_is_deleted(self, obj):
        return obj.deleted_at is not None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("is_deleted"):
            data["body"] = "This comment has been deleted."
        return data


class HubReactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PharmacyHubReaction
        fields = ["reaction_type"]


class ShiftSavedSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftSaved
        fields = ["id", "shift", "created_at"]
        read_only_fields = ["id", "created_at"]


class PillRewardRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PillRewardRule
        fields = [
            "id",
            "code",
            "name",
            "description",
            "event_type",
            "audience",
            "pill_amount",
            "is_active",
            "starts_at",
            "ends_at",
            "metadata",
        ]
        read_only_fields = fields


class PillReferralCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PillReferralCode
        fields = ["code", "is_active", "created_at"]
        read_only_fields = fields


class PillLedgerEntrySerializer(serializers.ModelSerializer):
    rule_code = serializers.CharField(source="rule.code", read_only=True)
    referral_type = serializers.CharField(source="referral_event.referral_type", read_only=True)
    shift_id = serializers.IntegerField(source="shift.id", read_only=True)

    class Meta:
        model = PillLedgerEntry
        fields = [
            "id",
            "entry_type",
            "source",
            "delta",
            "balance_after",
            "description",
            "rule_code",
            "referral_type",
            "shift_id",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class PillReferralEventSerializer(serializers.ModelSerializer):
    referral_code = serializers.CharField(source="referral_code.code", read_only=True)
    referrer_email = serializers.EmailField(source="referrer.email", read_only=True)
    referred_user_email = serializers.EmailField(source="referred_user.email", read_only=True)
    shift_id = serializers.IntegerField(source="shift.id", read_only=True)

    class Meta:
        model = PillReferralEvent
        fields = [
            "id",
            "referral_code",
            "referral_type",
            "status",
            "referrer_email",
            "referred_user_email",
            "referred_email",
            "shift_id",
            "claimed_at",
            "awarded_at",
            "created_at",
        ]
        read_only_fields = fields


class PillBalanceSerializer(serializers.Serializer):
    balance = serializers.SerializerMethodField()
    shift_post_cost = serializers.IntegerField(read_only=True)

    def get_balance(self, obj):
        return get_pill_balance(self.context["request"].user)


class CreateFriendReferralSerializer(serializers.Serializer):
    referred_email = serializers.EmailField(required=False, allow_blank=True)


class CreateShiftReferralSerializer(serializers.Serializer):
    shift_id = serializers.IntegerField()
    referred_email = serializers.EmailField(required=False, allow_blank=True)


class ClaimReferralSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    shift_id = serializers.IntegerField(required=False)
    referral_event_id = serializers.IntegerField(required=False)
