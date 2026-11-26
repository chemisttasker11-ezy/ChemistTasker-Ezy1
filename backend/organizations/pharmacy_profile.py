"""Pharmacy-owned software, services and script-volume validation."""
from rest_framework import serializers
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from infrastructure.serializer_values import json_list
from onboarding.services.skill_identity import canonical_skill, normalize_skills, registry


def validate_marketplace_review(pharmacy, data):
    status = data.get("marketplace_review_status")
    if status in {"REJECTED", "REVOKED"} and not (data.get("marketplace_review_note") or "").strip():
        raise ValidationError("Enter the reason the pharmacy's marketplace access was refused or withdrawn.")
    if status != "APPROVED":
        return
    owner = data.get("owner", pharmacy.owner)
    required = {
        "confirmed business number": pharmacy.abn_verified and bool(pharmacy.abn) and data.get("abn", pharmacy.abn) == pharmacy.abn,
        "verified owner identity": owner and owner.gov_id_verified,
        "pharmacy approval number": (data.get("marketplace_approval_number") or "").strip(),
        "business phone": (data.get("marketplace_business_phone") or "").strip(),
        "business email": data.get("email", pharmacy.email),
        "pharmacy address": pharmacy.street_address and pharmacy.suburb and pharmacy.state and pharmacy.postcode,
    }
    missing = [label for label, found in required.items() if not found]
    if missing:
        raise ValidationError(f"Check these details before approving marketplace access: {', '.join(missing)}.")


def record_marketplace_review(pharmacy, reviewer):
    pharmacy.verified = pharmacy.marketplace_review_status == "APPROVED"
    pharmacy.marketplace_reviewed_by = reviewer
    pharmacy.marketplace_reviewed_at = timezone.now()
    if not pharmacy.owner_id:
        return

    from notifications.services import notify_users

    decision = pharmacy.get_marketplace_review_status_display().lower()
    name = reviewer.get_full_name().strip() or "A marketplace reviewer"
    note = pharmacy.marketplace_review_note.strip()
    body = f"{name} marked marketplace trading for {pharmacy.name} as {decision}."
    if note:
        body = f"{body} {note}"
    transaction.on_commit(
        lambda: notify_users([pharmacy.owner.user_id], title="Marketplace review decision", body=body),
        robust=True,
    )


def validate_services(value):
    allowed = set(registry().get("pharmacy_profile", {}).get("service_codes", []))
    result = []
    for raw in json_list(value, "Services"):
        code = canonical_skill(raw) if isinstance(raw, str) else None
        if code not in allowed:
            raise serializers.ValidationError(f"Unknown pharmacy service: {raw}.")
        if code not in result:
            result.append(code)
    return result


def validate_script_band(value):
    if value in (None, ""):
        return ""
    if value not in {band["code"] for band in registry().get("pharmacy_profile", {}).get("script_volume_bands", [])}:
        raise serializers.ValidationError("Choose a listed script volume.")
    return value


def validate_software(value):
    """Known software IDs, at most one product per pharmacy category."""
    value = json_list(value, "Software")
    codes = normalize_skills(value, strict=True, matchable_only=True, software_only=True)
    subgroup = {skill["code"]: skill.get("subgroup") for skill in registry()["skills"]}
    seen = {}
    for code in codes:
        category = subgroup.get(code)
        if category in seen:
            raise serializers.ValidationError(f"Choose one {category.lower()} option, not {seen[category]} and {code}.")
        seen[category] = code
    return codes
