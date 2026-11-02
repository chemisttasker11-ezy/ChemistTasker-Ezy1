"""Locked identity mutations shared by personal-profile serializers."""
from rest_framework import serializers


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
            user.mobile_otp_code = None
            user.mobile_otp_created_at = None
            changed_user_fields.extend(["mobile_number", "mobile_otp_code", "mobile_otp_created_at"])

    if errors:
        raise serializers.ValidationError(errors)

    if changed_user_fields:
        user.save(update_fields=sorted(set(changed_user_fields)))
