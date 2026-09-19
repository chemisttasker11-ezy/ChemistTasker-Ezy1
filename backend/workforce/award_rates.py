from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError


AWARD_CODE = "MA000012"
AWARD_SOURCE_LABEL = "Pharmacy Industry Award 2020"
AWARD_SOURCE_URL = "https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf"
AWARD_EFFECTIVE_FROM = "2026-07-01"

# Minimum hourly rates effective 1 July 2026. These are versioned here so an
# EmploymentEngagement freezes the exact source/rates used at agreement time.
BASE_HOURLY = {
    "ASSISTANT": {
        "LEVEL_1": "27.81",
        "LEVEL_2": "28.45",
        "LEVEL_3": "29.45",
        "LEVEL_4": "30.66",
    },
    # Existing ChemistTasker technician classifications intentionally correspond
    # to the same pharmacy/dispensary assistant wage levels.
    "TECHNICIAN": {
        "LEVEL_1": "27.81",
        "LEVEL_2": "28.45",
        "LEVEL_3": "29.45",
        "LEVEL_4": "30.66",
    },
    "STUDENT": {
        "YEAR_1": "27.81",
        "YEAR_2": "28.45",
        "YEAR_3": "29.45",
        "YEAR_4": "30.66",
    },
    "INTERN": {
        "FIRST_HALF": "33.99",
        "SECOND_HALF": "35.14",
    },
    "PHARMACIST": {
        "PHARMACIST": "41.74",
        "EXPERIENCED_PHARMACIST": "45.72",
        "PHARMACIST_IN_CHARGE": "46.80",
        "PHARMACIST_MANAGER": "52.15",
    },
}

CLASSIFICATION_LABELS = {
    "LEVEL_1": "Level 1",
    "LEVEL_2": "Level 2",
    "LEVEL_3": "Level 3",
    "LEVEL_4": "Level 4",
    "YEAR_1": "1st year",
    "YEAR_2": "2nd year",
    "YEAR_3": "3rd year",
    "YEAR_4": "4th year",
    "FIRST_HALF": "1st half of training",
    "SECOND_HALF": "2nd half of training",
    "PHARMACIST": "Pharmacist",
    "EXPERIENCED_PHARMACIST": "Experienced Pharmacist",
    "PHARMACIST_IN_CHARGE": "Pharmacist in charge",
    "PHARMACIST_MANAGER": "Pharmacist manager",
}

# Percentages of the minimum hourly rate under the Award. PART_TIME and
# FULL_TIME share the permanent-employee penalty table.
PERMANENT_MULTIPLIERS = {
    "weekday": {
        "daytime": "1.00",
        "early_morning": "1.50",
        "evening": "1.25",
        "late_night": "1.50",
    },
    "saturday": {
        "daytime": "1.25",
        "early_morning": "2.00",
        "evening": "1.50",
        "late_night": "1.75",
    },
    "sunday": {
        "daytime": "1.50",
        "outside_daytime": "2.00",
    },
    "public_holiday": {"all_day": "2.25"},
}

CASUAL_MULTIPLIERS = {
    "weekday": {
        "daytime": "1.25",
        "early_morning": "1.75",
        "evening": "1.50",
        "late_night": "1.75",
    },
    "saturday": {
        "daytime": "1.50",
        "early_morning": "2.25",
        "evening": "1.75",
        "late_night": "2.00",
    },
    "sunday": {
        "daytime": "1.75",
        "outside_daytime": "2.25",
    },
    "public_holiday": {"all_day": "2.50"},
}


def classification_options(role: str) -> list[dict[str, str]]:
    role_key = str(role or "").upper()
    return [
        {"value": key, "label": CLASSIFICATION_LABELS.get(key, key.replace("_", " ").title())}
        for key in BASE_HOURLY.get(role_key, {})
    ]


def default_membership_classification(membership) -> str:
    role = str(membership.role or "").upper()
    if role == "PHARMACIST":
        return membership.pharmacist_award_level or ""
    if role in {"ASSISTANT", "TECHNICIAN"}:
        return membership.otherstaff_classification_level or ""
    if role == "INTERN":
        return membership.intern_half or ""
    if role == "STUDENT":
        return membership.student_year or ""
    return ""


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _multiply_schedule(base: Decimal, multipliers: dict) -> dict:
    schedule = {}
    for day_key, windows in multipliers.items():
        schedule[day_key] = {
            window_key: str(_money(base * Decimal(multiplier)))
            for window_key, multiplier in windows.items()
        }
    return schedule


def resolve_award_schedule(*, role: str, classification: str, employment_type: str) -> dict:
    role_key = str(role or "").upper()
    classification_key = str(classification or "").upper()
    employment_key = str(employment_type or "").upper()

    if employment_key not in {"FULL_TIME", "PART_TIME", "CASUAL"}:
        raise ValidationError(
            {"employment_type": "Award employment engagements support FULL_TIME, PART_TIME or CASUAL."}
        )

    base_raw = BASE_HOURLY.get(role_key, {}).get(classification_key)
    if not base_raw:
        raise ValidationError(
            {"award_classification": "No configured Pharmacy Award rate exists for this role/classification."}
        )

    base = Decimal(base_raw)
    multipliers = CASUAL_MULTIPLIERS if employment_key == "CASUAL" else PERMANENT_MULTIPLIERS
    schedule = _multiply_schedule(base, multipliers)

    return {
        "award_code": AWARD_CODE,
        "award_source_label": AWARD_SOURCE_LABEL,
        "award_source_url": AWARD_SOURCE_URL,
        "award_effective_from": AWARD_EFFECTIVE_FROM,
        "role": role_key,
        "classification": classification_key,
        "classification_label": CLASSIFICATION_LABELS.get(classification_key, classification_key),
        "employment_type": employment_key,
        "minimum_hourly_rate": str(_money(base)),
        "schedule": schedule,
        # Flat summary fields retained for the engagement editor/reporting. The
        # complete time-window correspondence above remains payroll-authoritative.
        "rate_weekday": schedule["weekday"]["daytime"],
        "rate_saturday": schedule["saturday"]["daytime"],
        "rate_sunday": schedule["sunday"]["daytime"],
        "rate_public_holiday": schedule["public_holiday"]["all_day"],
        "rate_early_morning": schedule["weekday"]["early_morning"],
        "rate_late_night": schedule["weekday"]["late_night"],
        "early_morning_applicable": True,
        "late_night_applicable": True,
    }
