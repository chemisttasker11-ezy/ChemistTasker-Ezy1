"""Worker preferences captured during onboarding: a pharmacist's rate preferences and an explorer's interests."""
import json

from rest_framework import serializers


def apply_rate_tab(instance, vdata: dict, submit: bool, *, initial_data):
    """
    Stores rate_preference JSON.
    Accepts stringified JSON or dict with keys:
    weekday, saturday, sunday, public_holiday, early_morning, late_night (strings),
    early_morning_same_as_day (bool), late_night_same_as_day (bool)
    """
    raw = initial_data.get('rate_preference', vdata.get('rate_preference'))
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


def apply_interests_tab(instance, vdata: dict, submit: bool, *, initial_data):
    """
    Accepts list or JSON string.
    Allowed (suggested) values: SHADOWING, VOLUNTEERING, PLACEMENT, JUNIOR_ASSISTANT
    """
    raw = initial_data.get('interests', vdata.get('interests'))
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
