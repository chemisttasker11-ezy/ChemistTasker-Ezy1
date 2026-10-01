"""Moved verbatim from client_profile/serializers.py (Stage 2 domain split). Behaviour is unchanged; client_profile/serializers.py re-exports these names."""
from rest_framework import serializers
from client_profile.models import (
    Chain,
    ExplorerOnboarding,
    Organization,
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    Pharmacy,
    PharmacyHubAttachment,
)
from chat.models import Message
from client_profile.file_validation import validate_upload_mapping


class UploadValidationMixin:
    upload_validation_map = {}

    def validate(self, attrs):
        attrs = super().validate(attrs)
        return validate_upload_mapping(attrs, self.upload_validation_map)


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
