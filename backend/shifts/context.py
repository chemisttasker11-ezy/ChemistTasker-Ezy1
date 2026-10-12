"""Shift-owned workload and accompanying-staff validation."""
from rest_framework import serializers

from core.serializer_values import json_list
from onboarding.services.skill_identity import registry


def validate_workload_tags(value, *, strict=True):
    tags = registry().get("pharmacy_profile", {}).get("workload_tags", [])
    lookup = {name.casefold(): tag["code"] for tag in tags for name in (tag["code"], tag["label"])}
    for tag in tags:
        lookup.update({alias.casefold(): tag["code"] for alias in tag.get("aliases", [])})
    result = []
    for raw in json_list(value, "Workload tags"):
        key = str(raw).strip().casefold()
        code = lookup.get(key)
        if not code:
            if strict:
                raise serializers.ValidationError(f"Unknown workload tag: {raw}.")
            continue
        if code not in result:
            result.append(code)
    return result


def validate_support(value):
    roles = {role["code"] for role in registry().get("pharmacy_profile", {}).get("support_roles", [])}
    result = {}
    for item in json_list(value, "Support on shift"):
        if not isinstance(item, dict) or item.get("role") not in roles:
            raise serializers.ValidationError("Each support entry needs a listed role.")
        raw_count = item.get("count", 1)
        if isinstance(raw_count, bool) or not (isinstance(raw_count, int) or (isinstance(raw_count, str) and raw_count.isdecimal())):
            raise serializers.ValidationError("Support count must be a whole number.")
        count = int(raw_count)
        if not 1 <= count <= registry().get("pharmacy_profile", {}).get("support_count_max", 20):
            raise serializers.ValidationError("Support count must be between 1 and 20.")
        result[item["role"]] = count
    return [{"role": role, "count": count} for role, count in result.items()]
