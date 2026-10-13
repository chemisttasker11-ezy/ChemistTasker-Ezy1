"""Pharmacy-owned software, services and script-volume validation."""
from rest_framework import serializers

from core.serializer_values import json_list
from onboarding.services.skill_identity import canonical_skill, normalize_skills, registry


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
