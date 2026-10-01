# client_profile/serializers.py

# This is smsm update
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field, OpenApiTypes
from .models import (
    Chain,
    Conversation,
    ExplorerOnboarding,
    ExplorerPost,
    ExplorerPostReaction,
    Invoice,
    InvoiceLineItem,
    Membership,
    MembershipApplication,
    MembershipInviteLink,
    Message,
    MessageReaction,
    Notification,
    Organization,
    OtherStaffOnboarding,
    OwnerOnboarding,
    Participant,
    PharmacistOnboarding,
    Pharmacy,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
    PharmacyAdmin,
    PharmacyClaim,
    PharmacyCommunityGroup,
    PharmacyCommunityGroupMembership,
    PharmacyHubAttachment,
    PharmacyHubComment,
    PharmacyHubPoll,
    PharmacyHubPollComment,
    PharmacyHubPollOption,
    PharmacyHubPollVote,
    PharmacyHubPost,
    PharmacyHubPostMention,
    PharmacyHubReaction,
    PillLedgerEntry,
    PillReferralCode,
    PillReferralEvent,
    PillRewardRule,
    Rating,
    RefereeResponse,
    Shift,
    ShiftCounterOffer,
    ShiftCounterOfferSlot,
    ShiftDescriptionTemplate,
    ShiftInterest,
    ShiftOffer,
    ShiftRejection,
    ShiftSaved,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
    WorkerShiftRequest,
)
from users.models import OrganizationMembership, DeviceToken
from users.serializers import UserProfileSerializer
from django.contrib.auth import get_user_model
from django.db import transaction
from decimal import Decimal
from client_profile.utils import q6, send_referee_emails, clean_email, enforce_public_shift_daily_limit, build_shift_email_context, build_shift_offer_context, build_offer_shift_details, send_shift_updated_notifications
from client_profile.services import expand_shift_slots
from client_profile.admin_helpers import has_admin_capability, CAPABILITY_MANAGE_ROSTER
from client_profile.shift_notifications import notify_shift_users
from datetime import date, timedelta, datetime, time
from django.utils import timezone
from core.task_queue import async_task
import logging
import math
import uuid
logger = logging.getLogger(__name__)
User = get_user_model()
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
SHIFT_EMAIL_RECIPIENT_CAP = 50

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


def _split_chat_display_name(value):
    parts = (value or "").strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _chat_member_identity(user, request=None, membership=None):
    first_name = (getattr(user, "first_name", "") or "").strip() if user else ""
    last_name = (getattr(user, "last_name", "") or "").strip() if user else ""

    if not (first_name or last_name) and membership:
        first_name, last_name = _split_chat_display_name(getattr(membership, "invited_name", "") or "")

    if not (first_name or last_name) and user:
        fallback_name = (getattr(user, "get_full_name", lambda: "")() or getattr(user, "username", "") or "").strip()
        first_name, last_name = _split_chat_display_name(fallback_name)

    photo = _resolve_user_profile_photo(user)
    return {
        "id": getattr(user, "id", None),
        "first_name": first_name,
        "last_name": last_name,
        "email": getattr(user, "email", None),
        "profile_photo_url": _build_absolute_media_url(request, photo),
    }


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
            "use_chemisttasker_payroll",
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
    user_details = serializers.SerializerMethodField()
    invited_by_details = UserProfileSerializer(source='invited_by', read_only=True)
    pharmacy_detail = PharmacySerializer(source='pharmacy', read_only=True)
    is_pharmacy_owner = serializers.SerializerMethodField()
    is_pharmacy_admin = serializers.SerializerMethodField()
    admin_level = serializers.SerializerMethodField()
    admin_level_label = serializers.SerializerMethodField()
    admin_level_description = serializers.SerializerMethodField()
    admin_capabilities = serializers.SerializerMethodField()

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
            'admin_capabilities',
        ]
        read_only_fields = [
            'invited_by', 'invited_by_details', 'created_at', 'updated_at', 'is_pharmacy_owner',
            'is_pharmacy_admin',
            'admin_level',
            'admin_level_label',
            'admin_level_description',
            'admin_capabilities',
            'responded_at',
        ]

    # No 'create' method needed. The default ModelSerializer.create() works perfectly
    # because all the classification fields are listed in Meta.fields. It will
    # create the new Membership object and save all provided fields in one step.

    def get_user_details(self, obj):
        payload = UserProfileSerializer(obj.user, context=self.context).data if obj.user_id else {}
        identity = _chat_member_identity(
            obj.user,
            request=self.context.get("request"),
            membership=obj,
        )
        payload.update(identity)
        return payload

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
        return self._get_admin_assignment(obj) is not None

    def _get_admin_assignment(self, obj):
        assignment = getattr(obj, "admin_assignment", None)
        if assignment and assignment.is_active:
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

    def get_admin_capabilities(self, obj):
        assignment = self._get_admin_assignment(obj)
        if not assignment:
            return []
        return sorted(list(assignment.capabilities))

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

APPLICATION_IDENTIFIER_FIELDS = ("email", "mobile_number", "date_of_birth", "username")
APPLICATION_REVIEW_FIELDS = (
    "role",
    "first_name",
    "last_name",
    "job_title",
    "pharmacist_award_level",
    "otherstaff_classification_level",
    "intern_half",
    "student_year",
)


def _application_snapshot_value(source, field_name):
    if isinstance(source, dict):
        value = source.get(field_name)
    else:
        value = getattr(source, field_name, None)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _application_snapshot(source):
    fields = (
        "role",
        "first_name",
        "last_name",
        "username",
        "mobile_number",
        "date_of_birth",
        "job_title",
        "pharmacist_award_level",
        "otherstaff_classification_level",
        "intern_half",
        "student_year",
        "email",
    )
    return {field: _application_snapshot_value(source, field) for field in fields}


def _application_payment_profile_status(application):
    """Safe owner-facing readiness summary from the canonical workforce resolver."""
    worker = getattr(application, "submitted_by", None)
    if not worker and getattr(application, "email", None):
        worker = User.objects.filter(email__iexact=application.email).first()

    if not worker:
        return {
            "account_linked": False,
            "onboarding_complete": False,
            "payment_preference": None,
            "status": "ACCOUNT_NOT_LINKED",
            "payroll_ready": False,
            "invoice_ready": False,
            "missing_fields": ["worker_account", "onboarding", "payment_preference"],
        }

    from client_profile.engagement_routing import worker_payment_profile_status

    status = worker_payment_profile_status(worker)
    return {
        "account_linked": True,
        **status,
    }

def _normalise_application_role_fields(attrs, *, role, payroll_enabled, category):
    require_classification = bool(payroll_enabled and category == "FULL_PART_TIME")

    if role == "PHARMACIST":
        attrs["otherstaff_classification_level"] = None
        attrs["intern_half"] = None
        attrs["student_year"] = None
        if require_classification and not attrs.get("pharmacist_award_level"):
            raise serializers.ValidationError({
                "pharmacist_award_level": "Pharmacist Award classification is required while ChemistTasker Payroll is enabled."
            })
    elif role in ("ASSISTANT", "TECHNICIAN"):
        attrs["pharmacist_award_level"] = None
        attrs["intern_half"] = None
        attrs["student_year"] = None
        if require_classification and not attrs.get("otherstaff_classification_level"):
            raise serializers.ValidationError({
                "otherstaff_classification_level": "Classification level is required while ChemistTasker Payroll is enabled."
            })
    elif role == "INTERN":
        attrs["pharmacist_award_level"] = None
        attrs["otherstaff_classification_level"] = None
        attrs["student_year"] = None
        if require_classification and not attrs.get("intern_half"):
            raise serializers.ValidationError({
                "intern_half": "Intern training half is required while ChemistTasker Payroll is enabled."
            })
    elif role == "STUDENT":
        attrs["pharmacist_award_level"] = None
        attrs["otherstaff_classification_level"] = None
        attrs["intern_half"] = None
        if require_classification and not attrs.get("student_year"):
            raise serializers.ValidationError({
                "student_year": "Student year is required while ChemistTasker Payroll is enabled."
            })


class MembershipApplicationSerializer(serializers.ModelSerializer):
    invite_link = serializers.PrimaryKeyRelatedField(
        queryset=MembershipInviteLink.objects.all(),
        write_only=True,
    )
    email = serializers.EmailField(required=True, allow_blank=False)
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    payroll_enabled = serializers.BooleanField(source="pharmacy.use_chemisttasker_payroll", read_only=True)
    payment_profile_status = serializers.SerializerMethodField()

    class Meta:
        model = MembershipApplication
        fields = [
            "id", "invite_link", "pharmacy", "pharmacy_name", "category",
            "role", "first_name", "last_name", "username", "mobile_number", "date_of_birth", "job_title",
            "pharmacist_award_level", "otherstaff_classification_level",
            "intern_half", "student_year", "email",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]
        read_only_fields = [
            "id", "pharmacy", "pharmacy_name", "category",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]

    def get_payment_profile_status(self, obj):
        return _application_payment_profile_status(obj)

    def validate(self, attrs):
        request = self.context.get("request")
        authenticated_user = request.user if request and request.user.is_authenticated else None
        invite_link = attrs.get("invite_link")
        role = attrs.get("role")
        email_value = clean_email((attrs.get("email") or "").strip().lower())
        attrs["email"] = email_value
        attrs["mobile_number"] = (attrs.get("mobile_number") or "").strip()
        date_of_birth = attrs.get("date_of_birth")

        if not invite_link:
            raise serializers.ValidationError({"invite_link": "A valid membership invite link is required."})
        if not date_of_birth:
            raise serializers.ValidationError({"date_of_birth": "Date of birth is required."})
        if date_of_birth > timezone.localdate():
            raise serializers.ValidationError({"date_of_birth": "Date of birth cannot be in the future."})
        if date_of_birth < date(1900, 1, 1):
            raise serializers.ValidationError({"date_of_birth": "Enter a valid date of birth."})

        existing_user = User.objects.filter(email__iexact=email_value).first()
        if existing_user and Membership.objects.filter(user=existing_user, pharmacy=invite_link.pharmacy).exists():
            raise serializers.ValidationError({
                "email": "You already have a membership or pending invitation for this pharmacy."
            })

        if MembershipApplication.objects.filter(
            pharmacy=invite_link.pharmacy,
            email__iexact=email_value,
            status="PENDING",
        ).exists():
            raise serializers.ValidationError({
                "email": "An application for this email is already pending with this pharmacy."
            })

        pending_key = f"{invite_link.pharmacy_id}:{email_value}"
        if MembershipApplication.objects.filter(
            pending_identity_key=pending_key,
            status="PENDING",
        ).exists():
            raise serializers.ValidationError({
                "email": "An application for this email is already pending with this pharmacy."
            })

        duplicate_identity = MembershipApplication.objects.filter(
            pharmacy=invite_link.pharmacy,
            status="PENDING",
            mobile_number__iexact=attrs["mobile_number"],
            date_of_birth=date_of_birth,
        )
        if duplicate_identity.exists():
            raise serializers.ValidationError({
                "mobile_number": "An application with these identity details is already pending for this pharmacy."
            })

        if authenticated_user:
            user_role = getattr(authenticated_user, "role", None)
            if user_role not in ("PHARMACIST", "OTHER_STAFF"):
                raise serializers.ValidationError({
                    "email": "Only pharmacist and other staff accounts can submit an authenticated membership application."
                })

            if email_value != (authenticated_user.email or "").strip().lower():
                raise serializers.ValidationError({"email": "Use the email address on your signed-in account."})

            required_user_role = required_user_role_for_membership(role)
            if required_user_role and user_role != required_user_role:
                role_label = dict(Membership.ROLE_CHOICES).get(role, role)
                actual_label = dict(User.ROLE_CHOICES).get(user_role, user_role)
                raise serializers.ValidationError({
                    "role": f"Your account is registered as {actual_label} and cannot apply as {role_label}."
                })

            pharmacist_onboard = getattr(authenticated_user, "pharmacistonboarding", None)
            otherstaff_onboard = getattr(authenticated_user, "otherstaffonboarding", None)
            onboarding_dob = getattr(
                pharmacist_onboard if user_role == "PHARMACIST" else otherstaff_onboard,
                "date_of_birth",
                None,
            )
            if onboarding_dob and onboarding_dob != date_of_birth:
                raise serializers.ValidationError({
                    "date_of_birth": "Date of birth must match your verified onboarding profile."
                })
            if user_role == "OTHER_STAFF" and otherstaff_onboard:
                onboard_role = getattr(otherstaff_onboard, "role_type", None)
                if onboard_role in ("INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT") and role != onboard_role:
                    role_label = dict(Membership.ROLE_CHOICES).get(onboard_role, onboard_role)
                    raise serializers.ValidationError({
                        "role": f"Your account is onboarded as {role_label} and cannot apply as another role."
                    })

            identity_checks = {
                "first_name": authenticated_user.first_name,
                "last_name": authenticated_user.last_name,
                "username": authenticated_user.username,
                "mobile_number": authenticated_user.mobile_number,
            }
            for field_name, current_value in identity_checks.items():
                submitted_value = (attrs.get(field_name) or "").strip()
                current_value = (current_value or "").strip()
                if current_value and submitted_value and submitted_value != current_value:
                    raise serializers.ValidationError({field_name: "Use the value on your signed-in account."})

        username_value = (attrs.get("username") or "").strip()
        if not username_value:
            raise serializers.ValidationError({"username": "Username is required."})
        attrs["username"] = username_value

        job_title_value = (attrs.get("job_title") or "").strip()
        if invite_link.category == "FULL_PART_TIME":
            if not job_title_value:
                raise serializers.ValidationError({"job_title": "Job title is required for pharmacy staff applications."})
        else:
            job_title_value = ""
        attrs["job_title"] = job_title_value

        _normalise_application_role_fields(
            attrs,
            role=role,
            payroll_enabled=invite_link.pharmacy.use_chemisttasker_payroll,
            category=invite_link.category,
        )
        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["submitted_by"] = request.user
        link = validated_data["invite_link"]
        validated_data["category"] = link.category
        validated_data["pharmacy"] = link.pharmacy
        validated_data["pending_identity_key"] = f"{link.pharmacy_id}:{validated_data['email']}"
        validated_data["submitted_snapshot"] = _application_snapshot(validated_data)
        return super().create(validated_data)


class MembershipApplicationReviewSerializer(serializers.ModelSerializer):
    pharmacy_name = serializers.CharField(source="pharmacy.name", read_only=True)
    payroll_enabled = serializers.BooleanField(source="pharmacy.use_chemisttasker_payroll", read_only=True)
    payment_profile_status = serializers.SerializerMethodField()

    class Meta:
        model = MembershipApplication
        fields = [
            "id", "pharmacy", "pharmacy_name", "category",
            "role", "first_name", "last_name", "username", "mobile_number", "date_of_birth", "job_title",
            "pharmacist_award_level", "otherstaff_classification_level",
            "intern_half", "student_year", "email",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]
        read_only_fields = [
            "id", "pharmacy", "pharmacy_name", "category",
            "username", "mobile_number", "date_of_birth", "email",
            "submitted_by", "status", "submitted_at", "decided_at", "decided_by",
            "submitted_snapshot", "review_changes", "reviewed_at", "reviewed_by",
            "approved_membership", "payroll_enabled", "payment_profile_status",
        ]

    def get_payment_profile_status(self, obj):
        return _application_payment_profile_status(obj)

    def validate(self, attrs):
        if self.instance.status != "PENDING":
            raise serializers.ValidationError({"detail": "Only pending applications can be edited."})

        for field_name in APPLICATION_IDENTIFIER_FIELDS:
            if field_name in self.initial_data:
                incoming = self.initial_data.get(field_name)
                current = _application_snapshot_value(self.instance, field_name)
                if str(incoming or "") != str(current or ""):
                    raise serializers.ValidationError({
                        field_name: "This identifier is locked after the applicant submits the application."
                    })

        role = attrs.get("role", self.instance.role)
        merged = {
            field: attrs.get(field, getattr(self.instance, field, None))
            for field in APPLICATION_REVIEW_FIELDS
        }
        merged["role"] = role
        merged["job_title"] = (merged.get("job_title") or "").strip()

        if self.instance.category == "FULL_PART_TIME" and not merged["job_title"]:
            raise serializers.ValidationError({"job_title": "Job title is required for pharmacy staff applications."})
        if self.instance.category != "FULL_PART_TIME":
            merged["job_title"] = ""

        worker = self.instance.submitted_by or User.objects.filter(email__iexact=self.instance.email).first()
        if worker:
            required_user_role = required_user_role_for_membership(role)
            if required_user_role and worker.role != required_user_role:
                raise serializers.ValidationError({
                    "role": "The reviewed role conflicts with the applicant's ChemistTasker account role."
                })

        _normalise_application_role_fields(
            merged,
            role=role,
            payroll_enabled=self.instance.pharmacy.use_chemisttasker_payroll,
            category=self.instance.category,
        )
        attrs.update(merged)
        return attrs

    def update(self, instance, validated_data):
        request = self.context.get("request")
        changes = []
        for field in APPLICATION_REVIEW_FIELDS:
            if field not in validated_data:
                continue
            old_value = _application_snapshot_value(instance, field)
            new_value = validated_data[field]
            if isinstance(new_value, (date, datetime)):
                new_value = new_value.isoformat()
            if old_value != new_value:
                changes.append({
                    "field": field,
                    "from": old_value,
                    "to": new_value,
                    "edited_at": timezone.now().isoformat(),
                    "edited_by_user_id": getattr(getattr(request, "user", None), "id", None),
                })

        instance = super().update(instance, validated_data)
        if changes:
            instance.review_changes = [*(instance.review_changes or []), *changes]
            instance.reviewed_at = timezone.now()
            instance.reviewed_by = request.user if request and request.user.is_authenticated else None
            instance.save(update_fields=["review_changes", "reviewed_at", "reviewed_by"])
        return instance


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


class ShiftDescriptionTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftDescriptionTemplate
        fields = [
            "id",
            "pharmacy",
            "role_needed",
            "description",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "updated_by", "created_at", "updated_at"]

    def validate_description(self, value):
        return (value or "").strip()


# === Shifts ===
class ShiftSlotSerializer(serializers.ModelSerializer):
    recurring_days = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6),
        required=False,
        allow_empty=True
    )
    recurring_end_date = serializers.DateField(required=False, allow_null=True)
    start_hour = serializers.SerializerMethodField()
    awaiting_payment = serializers.SerializerMethodField()
    awaiting_payment_offer_id = serializers.SerializerMethodField()
    is_locked = serializers.SerializerMethodField()
    locked_by_offer_id = serializers.SerializerMethodField()
    confirmed_assignment_id = serializers.SerializerMethodField()

    class Meta:
        model = ShiftSlot
        fields = [
            'id', 'date', 'start_time', 'end_time', 'rate', 'start_hour',
            'is_recurring', 'recurring_days', 'recurring_end_date',
            'roster_period', 'planned_break_minutes',
            'awaiting_payment', 'awaiting_payment_offer_id',
            'is_locked', 'locked_by_offer_id', 'confirmed_assignment_id',
        ]

    def get_start_hour(self, obj):
        if not obj.start_time:
            return None
        return obj.start_time.hour

    def _pending_payment_offer(self, obj):
        return ShiftOffer.objects.filter(
            shift_id=obj.shift_id,
            slot_id=obj.id,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        ).order_by('-updated_at').first()

    def _confirmed_assignment(self, obj):
        return ShiftSlotAssignment.objects.filter(
            shift_id=obj.shift_id,
            slot_id=obj.id,
        ).order_by('-assigned_at').first()

    def get_awaiting_payment(self, obj):
        return self._pending_payment_offer(obj) is not None

    def get_awaiting_payment_offer_id(self, obj):
        offer = self._pending_payment_offer(obj)
        return offer.id if offer else None

    def get_confirmed_assignment_id(self, obj):
        assignment = self._confirmed_assignment(obj)
        return assignment.id if assignment else None

    def get_locked_by_offer_id(self, obj):
        payment_offer = self._pending_payment_offer(obj)
        if payment_offer:
            return payment_offer.id
        return None

    def get_is_locked(self, obj):
        return (
            self.get_confirmed_assignment_id(obj) is not None
            or self.get_locked_by_offer_id(obj) is not None
        )

class ShiftSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    dedicated_user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        allow_null=True
    )
    slots = serializers.SerializerMethodField()
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
    payment_options = serializers.SerializerMethodField()

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
            'pending_payment_slot_ids', 'payment_options',
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

    @staticmethod
    def _normalize_money_value(value, *, field_name, slot_index):
        if value in (None, ''):
            return None
        try:
            return Decimal(str(value)).quantize(Decimal('0.01'))
        except Exception:
            raise serializers.ValidationError({
                'slots': [f"Slot #{slot_index} has an invalid {field_name}."]
            })

    def _normalize_slots_payload(self, slots_data):
        normalized = []
        for idx, raw_slot in enumerate(slots_data, start=1):
            slot = dict(raw_slot)
            recurring_days = slot.get('recurring_days') or []
            slot['recurring_days'] = sorted({int(day) for day in recurring_days if day is not None})
            slot['rate'] = self._normalize_money_value(slot.get('rate'), field_name='rate', slot_index=idx)

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

    def _initial_slots_payload(self):
        initial_data = getattr(self, 'initial_data', {}) or {}
        if 'slots' not in initial_data:
            return None
        return initial_data.get('slots') or []

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

        recipients = sorted(recipient_map.values(), key=lambda user: user.id)
        if len(recipients) > SHIFT_EMAIL_RECIPIENT_CAP:
            logger.warning(
                "Shift %s posted notification recipient cap hit: sending %s of %s recipients.",
                shift.id,
                SHIFT_EMAIL_RECIPIENT_CAP,
                len(recipients),
            )
            recipients = recipients[:SHIFT_EMAIL_RECIPIENT_CAP]

        for user in recipients:
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
        sent_count = 0
        skipped_by_cap = 0
        for user_id, availabilities in sorted(user_availability_map.items()):
            if sent_count >= SHIFT_EMAIL_RECIPIENT_CAP:
                skipped_by_cap += 1
                continue
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
            sent_count += 1

        if skipped_by_cap:
            logger.warning(
                "Shift %s availability notification recipient cap hit: skipped at least %s matching users.",
                shift.id,
                skipped_by_cap,
            )

    def create(self, validated_data):
        notify_pharmacy_staff = validated_data.pop('notify_pharmacy_staff', False)
        notify_favorite_staff = validated_data.pop('notify_favorite_staff', False)
        notify_chain_members = validated_data.pop('notify_chain_members', False)
        apply_rates_to_pharmacy = validated_data.pop('apply_rates_to_pharmacy', False)
        slots_payload = self._initial_slots_payload()
        if slots_payload is None:
            raise serializers.ValidationError({'slots': 'This field is required.'})
        slots_data = self._normalize_slots_payload(slots_payload)
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
                        offer_details = build_offer_shift_details(shift, offer_for_email)
                        ctx.update(offer_details)
                        notify_shift_users(
                            [dedicated_user],
                            shift=shift,
                            title="Shift offer received",
                            body=f"You have received a shift offer. Please confirm to lock it in. {offer_details['shift_summary']}",
                            kind="shift_offer_received",
                            payload={"offer_id": offer_for_email.id, **offer_details},
                        )
                        async_task(
                            'users.tasks.send_async_email',
                            subject="You have a new shift offer",
                            recipient_list=[dedicated_user.email],
                            template_name="emails/shift_offer.html",
                            context=ctx,
                            text_template="emails/shift_offer.txt",
                            suppress_auto_notification=True,
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

        slots_payload = self._initial_slots_payload()

        # Replace slots if provided
        if slots_payload is not None:
            instance.slots.all().delete()
            for slot in self._normalize_slots_payload(slots_payload):
                ShiftSlot.objects.create(shift=instance, **slot)

        if apply_rates_to_pharmacy and instance.role_needed == 'PHARMACIST':
            self._sync_pharmacy_rate_defaults(
                instance.pharmacy,
                shift=instance,
                request_data=getattr(self.context.get('request'), 'data', {}),
            )

        transaction.on_commit(lambda: send_shift_updated_notifications(instance))
        return instance

    def get_slots(self, obj): # NEW METHOD
        """
        Active shifts expose only future/unassigned slots. Other shift endpoints
        need the full slot list, especially confirmed/history views.
        """
        request = self.context.get('request')
        path = getattr(request, 'path', '') if request else ''
        resolver_match = getattr(request, 'resolver_match', None) if request else None
        basename = getattr(resolver_match, 'kwargs', {}).get('basename') if resolver_match else None
        is_active_endpoint = basename == 'active-shifts' or '/shifts/active/' in path
        if not is_active_endpoint:
            return ShiftSlotSerializer(obj.slots.all(), many=True).data

        now = timezone.now()
        today = date.today()

        # Get all slots for this shift
        assigned_pairs = {
            (assignment.slot_id, assignment.slot_date)
            for assignment in obj.slot_assignments.all()
        }
        assignment_by_pair = {
            (assignment.slot_id, assignment.slot_date): assignment.id
            for assignment in obj.slot_assignments.all()
        }
        pending_payment_offers = list(obj.offers.filter(
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            slot_id__isnull=False,
        ))
        pending_payment_by_pair = {}
        pending_payment_by_slot = {}
        for offer in pending_payment_offers:
            pending_payment_by_pair.setdefault((offer.slot_id, offer.offered_slot_date), offer.id)
            pending_payment_by_slot.setdefault(offer.slot_id, offer.id)

        filtered_slots = []
        for entry in expand_shift_slots(obj):
            slot = entry.get('slot')
            slot_date = entry.get('date')
            if not slot or not slot_date:
                continue
            slot_is_future = (
                slot_date > today
                or (slot_date == today and slot.end_time >= now.time())
            )
            if not slot_is_future:
                continue
            if (slot.id, slot_date) in assigned_pairs:
                continue
            pending_payment_offer_id = (
                pending_payment_by_pair.get((slot.id, slot_date))
                or pending_payment_by_slot.get(slot.id)
            )
            locked_by_offer_id = pending_payment_offer_id
            filtered_slots.append({
                'id': slot.id,
                'date': slot_date.isoformat(),
                'start_time': slot.start_time.isoformat() if slot.start_time else None,
                'end_time': slot.end_time.isoformat() if slot.end_time else None,
                'start_hour': slot.start_time.hour if slot.start_time else None,
                'rate': str(slot.rate) if slot.rate is not None else None,
                'is_recurring': False,
                'recurring_days': [],
                'recurring_end_date': None,
                'awaiting_payment': pending_payment_offer_id is not None,
                'awaiting_payment_offer_id': pending_payment_offer_id,
                'is_locked': locked_by_offer_id is not None,
                'locked_by_offer_id': locked_by_offer_id,
                'confirmed_assignment_id': assignment_by_pair.get((slot.id, slot_date)),
            })
        
        return filtered_slots

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_slot_assignments(self, shift) -> list[dict]:
        assignments = []
        for assignment in shift.slot_assignments.all():
            user = assignment.user
            user_name = user.get_full_name() or user.email or getattr(user, 'username', '') or 'Assigned candidate'
            assignments.append({
                'slot_id': assignment.slot.id,
                'user_id': user.id,
                'user': {
                    'id': user.id,
                    'first_name': user.first_name,
                    'last_name': user.last_name,
                    'name': user_name,
                    'email': user.email,
                },
            })
        return assignments

    def get_pending_payment_slot_ids(self, shift) -> list[int]:
        qs = ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            slot_id__isnull=False,
        ).values_list('slot_id', flat=True)
        return sorted(set(qs))

    def get_payment_options(self, shift) -> list[dict]:
        offers = ShiftOffer.objects.filter(
            shift=shift,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        ).select_related('slot', 'user').order_by('offered_slot_date', 'offered_start_time', 'created_at')

        options = []
        for offer in offers:
            user = offer.user
            name = user.get_full_name() or user.email or getattr(user, 'username', '') or 'Participant'
            options.append({
                'offer_id': offer.id,
                'slot_id': offer.slot_id,
                'slot_date': offer.offered_slot_date.isoformat() if offer.offered_slot_date else None,
                'start_time': offer.offered_start_time.isoformat() if offer.offered_start_time else None,
                'end_time': offer.offered_end_time.isoformat() if offer.offered_end_time else None,
                'candidate_user_id': user.id,
                'candidate_name': name,
                'candidate_email': user.email,
            })
        return options

class ShiftInterestSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    user_id  = serializers.IntegerField(source='user.id', read_only=True)
    slot_id  = serializers.IntegerField(source='slot.id', read_only=True)
    slot_time = serializers.SerializerMethodField()
    short_bio = serializers.SerializerMethodField()
    user_detail = serializers.SerializerMethodField()
    revealed = serializers.BooleanField(read_only=True)
    pending_confirmation = serializers.SerializerMethodField()
    pending_offer_id = serializers.SerializerMethodField()
    awaiting_payment = serializers.SerializerMethodField()
    awaiting_payment_offer_id = serializers.SerializerMethodField()

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
            'pending_confirmation',
            'pending_offer_id',
            'awaiting_payment',
            'awaiting_payment_offer_id',
        ]
        read_only_fields = [
            'id','user','user_id','slot_time','short_bio','user_detail','revealed','expressed_at',
            'pending_confirmation','pending_offer_id','awaiting_payment','awaiting_payment_offer_id'
        ]

    def _matching_offer(self, obj, status_value):
        qs = ShiftOffer.objects.filter(
            shift=obj.shift,
            user=obj.user,
            status=status_value,
        )
        if obj.shift.single_user_only:
            qs = qs.filter(slot__isnull=True)
        else:
            qs = qs.filter(slot=obj.slot)
        return qs.order_by('-updated_at').first()

    def get_pending_confirmation(self, obj):
        return self._matching_offer(obj, ShiftOffer.Status.PENDING) is not None

    def get_pending_offer_id(self, obj):
        offer = self._matching_offer(obj, ShiftOffer.Status.PENDING)
        return offer.id if offer else None

    def get_awaiting_payment(self, obj):
        return self._matching_offer(obj, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT) is not None

    def get_awaiting_payment_offer_id(self, obj):
        offer = self._matching_offer(obj, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        return offer.id if offer else None

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

from client_profile.utils import TRAVEL_ORIGIN_PREFIX, extract_travel_origin_from_message, extract_suburb_from_travel_origin

class ShiftCounterOfferSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    user_detail = serializers.SerializerMethodField()
    slots = ShiftCounterOfferSlotSerializer(many=True)
    travel_origin = serializers.SerializerMethodField()
    travel_origin_input = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ShiftCounterOffer
        fields = [
            'id',
            'shift',
            'user',
            'user_detail',
            'travel_origin',
            'travel_origin_input',
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
        travel_origin = (validated_data.pop('travel_origin_input', '') or '').strip()
        validated_data.setdefault('message', '')
        if travel_origin:
            message = (validated_data.get('message') or '').strip()
            validated_data['message'] = "\n".join(
                part for part in [message, f"{TRAVEL_ORIGIN_PREFIX} {travel_origin}"] if part
            )

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
    engagement_terms_preview = serializers.SerializerMethodField()

    def get_engagement_terms_preview(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        can_view = request.user.id == obj.user_id or has_admin_capability(
            request.user, obj.shift.pharmacy, CAPABILITY_MANAGE_ROSTER
        )
        if not can_view:
            return None
        from .engagement_routing import build_shift_engagement_terms
        try:
            return build_shift_engagement_terms(shift=obj.shift, user=obj.user, offer=obj)
        except Exception as exc:
            detail = getattr(exc, 'message_dict', None) or getattr(exc, 'detail', None) or str(exc)
            return {'blocked': True, 'error': detail}

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
            'engagement_terms_preview',
            'payment_preference_snapshot',
            'settlement_channel',
            'engagement_kind',
            'engagement_terms_snapshot',
            'engagement_terms_accepted_at',
            'payroll_activated_at',
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
            'engagement_terms_preview',
            'payment_preference_snapshot',
            'settlement_channel',
            'engagement_kind',
            'engagement_terms_snapshot',
            'engagement_terms_accepted_at',
            'payroll_activated_at',
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
    for UI compatibility, then removes private user/payment/internal fields.
    """

    SENSITIVE_TOP_LEVEL_FIELDS = {
        'created_by',
        'dedicated_user',
        'slot_assignments',
        'pending_payment_slot_ids',
        'payment_options',
        'reveal_quota',
        'reveal_count',
    }
    SENSITIVE_PHARMACY_FIELDS = {
        'email',
        'owner',
        'organization',
        'abn',
        'abn_entity_name',
        'abn_entity_type',
        'abn_status',
        'abn_gst_registered',
        'abn_gst_from',
        'abn_gst_to',
        'abn_last_checked',
        'abn_entity_confirmed',
        'abn_verification_note',
        'methadone_s8_protocols',
        'qld_sump_docs',
        'sops',
        'induction_guides',
        'claim_request_id',
    }
    SENSITIVE_SLOT_FIELDS = {
        'awaiting_payment',
        'awaiting_payment_offer_id',
        'is_locked',
        'locked_by_offer_id',
        'confirmed_assignment_id',
    }

    class Meta:
        model = Shift
        fields = ['id']

    def to_representation(self, instance):
        data = ShiftSerializer(instance, context=self.context).data

        for field in self.SENSITIVE_TOP_LEVEL_FIELDS:
            data.pop(field, None)

        pharmacy_detail = data.get('pharmacy_detail')
        if isinstance(pharmacy_detail, dict):
            for field in self.SENSITIVE_PHARMACY_FIELDS:
                pharmacy_detail.pop(field, None)

        for slot in data.get('slots') or []:
            if isinstance(slot, dict):
                for field in self.SENSITIVE_SLOT_FIELDS:
                    slot.pop(field, None)

        return data

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

    @staticmethod
    def _normalize_shift_role(value):
        raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
        if raw in {"PHARMACY_ASSISTANT", "ASSISTANT"}:
            return "ASSISTANT"
        if raw in {"DISPENSARY_TECHNICIAN", "PHARMACY_TECHNICIAN", "TECHNICIAN"}:
            return "TECHNICIAN"
        if raw in {"INTERN_PHARMACIST", "INTERN"}:
            return "INTERN"
        if raw in {"PHARMACY_STUDENT", "STUDENT"}:
            return "STUDENT"
        if raw in {"PHARMACIST", "EXPLORER", "OTHER_STAFF"}:
            return raw
        return raw

    @staticmethod
    def _otherstaff_onboarding_role(user):
        onboarding = OtherStaffOnboarding.objects.filter(user=user).first()
        return WorkerShiftRequestSerializer._normalize_shift_role(getattr(onboarding, "role_type", None))

    def _resolve_role(self, attrs):
        role = self._normalize_shift_role(attrs.get("role"))
        assignment = attrs.get("shift") or getattr(self.instance, "shift", None)
        requester = attrs.get("requested_by") or getattr(self.instance, "requested_by", None)
        request = self.context.get("request")
        if not requester and request:
            requester = request.user

        if role == "OTHER_STAFF":
            if assignment and getattr(assignment, "shift", None):
                assignment_role = self._normalize_shift_role(assignment.shift.role_needed)
                if assignment_role in dict(Shift.ROLE_CHOICES):
                    return assignment_role
            onboarding_role = self._otherstaff_onboarding_role(requester)
            if onboarding_role in dict(Shift.ROLE_CHOICES):
                return onboarding_role
            raise serializers.ValidationError({
                "role": "Other staff cover requests must use a specific shift role."
            })

        if role not in dict(Shift.ROLE_CHOICES):
            raise serializers.ValidationError({"role": "Invalid shift role."})

        return role

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "role" in attrs:
            attrs["role"] = self._resolve_role(attrs)
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user

        # Explicitly link requester
        validated_data["requested_by"] = user
        validated_data["status"] = "PENDING"

        return super().create(validated_data)



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
    workforce_status = serializers.SerializerMethodField()

    class Meta:
        model = ShiftSlotAssignment
        fields = [
            "id", "slot_date", "unit_rate", "rate_reason", "is_rostered",
            "payment_preference_snapshot", "settlement_channel", "engagement_kind",
            "engagement_terms_accepted_at", "workforce_status",
            "user", "slot", "shift",
            "user_detail",
            "slot_detail",
            "shift_detail",
            "leave_request",
            "origin",
        ]

    def get_workforce_status(self, obj):
        request = self.context.get("request")
        if request is not None and obj.user_id != request.user.id:
            from workforce.permissions import can_manage_pharmacy
            if not can_manage_pharmacy(request.user, obj.shift.pharmacy):
                return None

        snapshot = obj.engagement_terms_snapshot or {}
        timesheet = None
        if obj.user_id and obj.shift_id and obj.slot_date:
            prefetched = list(obj.user.workforce_timesheets.all())
            matches = [
                row for row in prefetched
                if row.period.pharmacy_id == obj.shift.pharmacy_id
                and row.period.start_date <= obj.slot_date <= row.period.end_date
            ]
            if matches:
                timesheet = max(matches, key=lambda row: (row.period.start_date, row.id))

        rates = snapshot.get("rates") or {}
        occurrences = snapshot.get("occurrences") or []
        occurrence = next(
            (item for item in occurrences if str(item.get("date") or "") == str(obj.slot_date)),
            occurrences[0] if occurrences else {},
        )
        agreed_rate = (
            occurrence.get("agreed_rate")
            or snapshot.get("agreed_rate")
            or obj.unit_rate
        )
        return {
            "payment_preference": obj.payment_preference_snapshot or snapshot.get("payment_preference") or "",
            "settlement_channel": obj.settlement_channel or snapshot.get("settlement_channel") or "",
            "engagement_kind": obj.engagement_kind or snapshot.get("engagement_kind") or "",
            "employment_type": snapshot.get("employment_type") or "",
            "pay_basis": snapshot.get("pay_basis") or "",
            "award_code": snapshot.get("award_code") or "",
            "award_classification": snapshot.get("award_classification") or "",
            "employment_engagement_public_id": snapshot.get("employment_engagement_public_id"),
            "rates": rates,
            "agreed_rate": str(agreed_rate) if agreed_rate not in (None, "") else None,
            "payroll_ready": (
                (obj.settlement_channel or snapshot.get("settlement_channel")) != "PAYROLL"
                or bool(obj.payroll_activated_at)
                or not bool(snapshot.get("payroll_activation_required"))
            ),
            "payroll_activation_required": bool(snapshot.get("payroll_activation_required")),
            "payroll_missing_fields": snapshot.get("payroll_missing_fields") or [],
            "payroll_activated_at": obj.payroll_activated_at.isoformat() if obj.payroll_activated_at else None,
            "timesheet": {
                "id": timesheet.id,
                "period_id": timesheet.period_id,
                "period_status": timesheet.period.status,
                "status": timesheet.status,
                "needs_rebuild": timesheet.needs_rebuild,
                "rostered_minutes": timesheet.rostered_minutes,
                "worked_minutes": timesheet.worked_minutes,
                "reviewed_minutes": timesheet.reviewed_minutes,
                "blocking_checks": timesheet.blocking_checks,
                "warning_checks": timesheet.warning_checks,
            } if timesheet else None,
        }

    def get_leave_request(self, obj):
        from workforce.models import WorkforceLeaveRequest

        leave = WorkforceLeaveRequest.objects.filter(
            slot_assignment=obj,
            user_id=obj.user_id,
            status__in=[
                WorkforceLeaveRequest.Status.PENDING,
                WorkforceLeaveRequest.Status.APPROVED,
            ],
        ).order_by("-created_at", "-id").first()
        if leave:
            return {
                "id": leave.id,
                "leave_type": leave.leave_type,
                "status": leave.status,
                "note": leave.note,
                "date_applied": leave.created_at,
                "date_resolved": leave.decided_at,
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
            'was_modified',
            'shift',
            'source_assignment',
        ]
        read_only_fields = ['total', 'was_modified', 'source_assignment']

    def create(self, validated_data):
        qty      = validated_data['quantity']
        rate     = validated_data['unit_price']
        discount = validated_data.get('discount', Decimal('0')) / Decimal('100')
        validated_data['total'] = (qty * rate * (1 - discount)).quantize(Decimal('0.01'))
        if not validated_data.get('source_assignment'):
            validated_data['is_manual'] = True
            validated_data['was_modified'] = True
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
    finance_record_id = serializers.SerializerMethodField()

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
            'source_snapshot', 'finance_record_id',
            'status', 'created_at',
            'line_items',
            # Recipient snapshot
            'bill_to_first_name', 'bill_to_last_name', 'bill_to_abn',

            # Issuer snapshot
            'issuer_first_name', 'issuer_last_name', 'issuer_abn', 'issuer_email',
        ]
        read_only_fields = [
            'subtotal', 'gst_amount', 'super_amount', 'total', 'source_snapshot', 'created_at'
        ]

    def get_finance_record_id(self, obj):
        return obj.pk if obj.request_key is not None else None

    def create(self, validated_data):
        items = validated_data.pop('line_items', [])
        invoice = Invoice.objects.create(**validated_data)
        for item in items:
            item['invoice'] = invoice
            InvoiceLineItemSerializer().create(item)

        from client_profile.services import recalculate_invoice_totals
        invoice.refresh_from_db()
        return recalculate_invoice_totals(invoice)

    def update(self, instance, validated_data):
        items = validated_data.pop('line_items', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if items is not None:
            internal_source = (instance.source_snapshot or {}).get("source") == "INTERNAL_ABN_SHIFT_ASSIGNMENTS"
            if internal_source:
                protected = instance.line_items.filter(
                    category_code="ProfessionalServices",
                    source_assignment__isnull=False,
                )
                protected_ids = list(protected.values_list("id", flat=True))
                instance.line_items.exclude(id__in=protected_ids).delete()
                for item in items:
                    category = item.get("category_code") or "ProfessionalServices"
                    if category == "ProfessionalServices":
                        continue
                    item['invoice'] = instance
                    InvoiceLineItemSerializer().create(item)
            else:
                instance.line_items.all().delete()
                for item in items:
                    item['invoice'] = instance
                    InvoiceLineItemSerializer().create(item)

        from client_profile.services import recalculate_invoice_totals
        return recalculate_invoice_totals(instance)




























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


































class ShiftSavedSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftSaved
        fields = ["id", "shift", "created_at"]
        read_only_fields = ["id", "created_at"]


# --- Stage 2: code moved to client_profile/domains (re-exported so existing import paths keep working) ---
_MOVED_LAZY = {
    "ChatMemberSerializer": "client_profile.domains.chat.serializers",
    "ChatMembershipSerializer": "client_profile.domains.chat.serializers",
    "ChatParticipantSerializer": "client_profile.domains.chat.serializers",
    "ClaimReferralSerializer": "client_profile.domains.pills.serializers",
    "ConversationCreateSerializer": "client_profile.domains.chat.serializers",
    "ConversationDetailSerializer": "client_profile.domains.chat.serializers",
    "ConversationListSerializer": "client_profile.domains.chat.serializers",
    "CreateFriendReferralSerializer": "client_profile.domains.pills.serializers",
    "CreateShiftReferralSerializer": "client_profile.domains.pills.serializers",
    "DeviceTokenSerializer": "client_profile.domains.notifications.serializers",
    "ExplorerOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "ExplorerPostReadSerializer": "client_profile.domains.explorer.serializers",
    "ExplorerPostWriteSerializer": "client_profile.domains.explorer.serializers",
    "HubAttachmentSerializer": "client_profile.hub.serializers",
    "HubCommentSerializer": "client_profile.hub.serializers",
    "HubCommunityGroupSerializer": "client_profile.hub.serializers",
    "HubMembershipSerializer": "client_profile.hub.serializers",
    "HubOrganizationProfileSerializer": "client_profile.hub.serializers",
    "HubOrganizationSerializer": "client_profile.hub.serializers",
    "HubPharmacyProfileSerializer": "client_profile.hub.serializers",
    "HubPharmacySerializer": "client_profile.hub.serializers",
    "HubPollCommentSerializer": "client_profile.hub.serializers",
    "HubPollOptionSerializer": "client_profile.hub.serializers",
    "HubPollSerializer": "client_profile.hub.serializers",
    "HubPostSerializer": "client_profile.hub.serializers",
    "HubReactionSerializer": "client_profile.hub.serializers",
    "MessageSerializer": "client_profile.domains.chat.serializers",
    "MyRatingSerializer": "client_profile.domains.ratings.serializers",
    "NotificationSerializer": "client_profile.domains.notifications.serializers",
    "OtherStaffOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "OwnerOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "PendingRatingsSerializer": "client_profile.domains.ratings.serializers",
    "PharmacistOnboardingV2Serializer": "client_profile.domains.onboarding.serializers",
    "PharmacyCommunityGroupMemberSerializer": "client_profile.hub.serializers",
    "PillBalanceSerializer": "client_profile.domains.pills.serializers",
    "PillLedgerEntrySerializer": "client_profile.domains.pills.serializers",
    "PillReferralCodeSerializer": "client_profile.domains.pills.serializers",
    "PillReferralEventSerializer": "client_profile.domains.pills.serializers",
    "PillRewardRuleSerializer": "client_profile.domains.pills.serializers",
    "PublicExplorerPostReadSerializer": "client_profile.domains.explorer.serializers",
    "RatingReadSerializer": "client_profile.domains.ratings.serializers",
    "RatingSummarySerializer": "client_profile.domains.ratings.serializers",
    "RatingWriteSerializer": "client_profile.domains.ratings.serializers",
    "ReactionSerializer": "client_profile.domains.chat.serializers",
    "RefereeResponseSerializer": "client_profile.domains.onboarding.serializers",
    "ShiftContactSerializer": "client_profile.domains.chat.serializers",
    "UserAvailabilitySerializer": "client_profile.domains.availability.serializers",
    "_required_cert_skill_codes": "client_profile.domains.onboarding.serializers",
    "_serialize_hub_author": "client_profile.hub.serializers",
    "_serialize_user_summary": "client_profile.hub.serializers",
}

def __getattr__(name):
    # Lazy re-export: avoids import-time cycles between this legacy module and the domain modules, which
    # still import shared helpers back from here. Result is cached so later lookups are plain attributes.
    target = _MOVED_LAZY.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib
    value = getattr(importlib.import_module(target), name)
    globals()[name] = value
    return value


def __dir__():
    return sorted(set(globals()) | set(_MOVED_LAZY))


if False:  # pragma: no cover - static analysis / IDE navigation only
    from client_profile.domains.availability.serializers import UserAvailabilitySerializer  # noqa: F401
    from client_profile.domains.chat.serializers import ChatMemberSerializer, ChatMembershipSerializer, ChatParticipantSerializer, ConversationCreateSerializer, ConversationDetailSerializer, ConversationListSerializer, MessageSerializer, ReactionSerializer, ShiftContactSerializer  # noqa: F401
    from client_profile.domains.explorer.serializers import ExplorerPostReadSerializer, ExplorerPostWriteSerializer, PublicExplorerPostReadSerializer  # noqa: F401
    from client_profile.domains.notifications.serializers import DeviceTokenSerializer, NotificationSerializer  # noqa: F401
    from client_profile.domains.onboarding.serializers import ExplorerOnboardingV2Serializer, OtherStaffOnboardingV2Serializer, OwnerOnboardingV2Serializer, PharmacistOnboardingV2Serializer, RefereeResponseSerializer, _required_cert_skill_codes  # noqa: F401
    from client_profile.domains.pills.serializers import ClaimReferralSerializer, CreateFriendReferralSerializer, CreateShiftReferralSerializer, PillBalanceSerializer, PillLedgerEntrySerializer, PillReferralCodeSerializer, PillReferralEventSerializer, PillRewardRuleSerializer  # noqa: F401
    from client_profile.domains.ratings.serializers import MyRatingSerializer, PendingRatingsSerializer, RatingReadSerializer, RatingSummarySerializer, RatingWriteSerializer  # noqa: F401
    from client_profile.hub.serializers import HubAttachmentSerializer, HubCommentSerializer, HubCommunityGroupSerializer, HubMembershipSerializer, HubOrganizationProfileSerializer, HubOrganizationSerializer, HubPharmacyProfileSerializer, HubPharmacySerializer, HubPollCommentSerializer, HubPollOptionSerializer, HubPollSerializer, HubPostSerializer, HubReactionSerializer, PharmacyCommunityGroupMemberSerializer, _serialize_hub_author, _serialize_user_summary  # noqa: F401
