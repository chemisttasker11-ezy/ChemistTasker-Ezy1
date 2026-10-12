"""Stable skill identities shared by onboarding, talent and shift APIs.

The authoritative labels/aliases live in shared-core/skills_registry.json.
No fuzzy matching: an arbitrary free-text claim must never satisfy a job requirement.
"""
import json
from functools import lru_cache
from pathlib import Path
from django.conf import settings
from rest_framework import serializers


@lru_cache(maxsize=1)
def registry():
    file_path = Path(settings.BASE_DIR).parent / "shared-core" / "skills_registry.json"
    with file_path.open(encoding="utf-8") as source:
        return json.load(source)


@lru_cache(maxsize=1)
def _identities():
    data = registry()
    identities = {}
    for skill in data["skills"]:
        for name in [skill["code"], skill["label"], *skill.get("aliases", [])]:
            key = name.strip().casefold()
            if key in identities and identities[key] != skill["code"]:
                raise RuntimeError("Conflicting canonical skill identity: " + name)
            identities[key] = skill["code"]
    for old, current in data.get("legacy_aliases", {}).items():
        identities[old.strip().casefold()] = current
    return identities


def canonical_skill(value):
    if not isinstance(value, str):
        return None
    return _identities().get(value.strip().casefold())


def normalize_skills(values, *, strict=False, allowed_role=None, matchable_only=False, software_only=False):
    if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
        raise serializers.ValidationError("Skills must be a list of strings.")
    skills = {entry["code"]: entry for entry in registry()["skills"]}
    result = []
    for value in values:
        code = canonical_skill(value)
        if not code:
            if strict:
                raise serializers.ValidationError("Unknown skill: " + value)
            continue
        if matchable_only and (skills[code].get('matchable') is False):
            if strict:
                raise serializers.ValidationError('This skill cannot be used for matching: ' + value)
            continue
        if software_only and skills[code]['group'] != 'Software & Digital':
            if strict:
                raise serializers.ValidationError('Select a named software product: ' + value)
            continue
        if allowed_role and skills[code]["eligibility"].get(allowed_role, "none") == "none":
            if strict:
                raise serializers.ValidationError("Skill is not available for role " + allowed_role + ": " + value)
            continue
        if code not in result:
            result.append(code)
    return result


def evaluate_match(required, preferred, claimed):
    """Identity only; licence, supervision and evidence must be checked separately."""
    recognised = set(normalize_skills(claimed, matchable_only=True))
    needed = normalize_skills(required, matchable_only=True)
    helpful = normalize_skills(preferred, matchable_only=True)
    unknown = [value for value in required if not normalize_skills([value], matchable_only=True)]
    missing = [code for code in needed if code not in recognised]
    return {
        "matches_required": not missing and not unknown,
        "matched_required": [code for code in needed if code in recognised],
        "missing_required": missing,
        "unknown_required": unknown,
        "matched_preferred": [code for code in helpful if code in recognised],
    }
