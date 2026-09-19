from __future__ import annotations

from copy import deepcopy
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError


AWARD_CODE = "MA000012"
AWARD_SOURCE_LABEL = "Pharmacy Industry Award 2020"
AWARD_SOURCE_URL = "https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf"
AWARD_REFERENCE_URL = "https://awards.fairwork.gov.au/MA000012.html"
AWARD_EFFECTIVE_FROM = "2026-07-01"
AWARD_EFFECTIVE_BASIS = "Pay period commencing on or after 1 July 2026"
AWARD_RATE_SCOPE = "adult"
JUNIOR_PERCENTAGES = {15: Decimal("0.45"), 16: Decimal("0.50"), 17: Decimal("0.60"), 18: Decimal("0.70"), 19: Decimal("0.80"), 20: Decimal("0.90")}

# Schedule B dollar amounts published by Fair Work for MA000012, ppc 01Jul26.
# We store the published rounded dollar amounts rather than recomputing penalty
# rates from percentages so the frozen engagement snapshot matches the source.
#
# Each canonical row contains:
#   weekday: 8am-7pm, 7am-8am, 7pm-9pm, 9pm-midnight
#   weekend: Sat 8am-6pm, Sat 7am-8am, Sat 6pm-9pm, Sat 9pm-midnight,
#            Sun outside 7am-9pm, Sun 7am-9pm, public holiday all day
#   overtime: Mon-Sat first 2h, Mon-Sat after 2h, Sunday, public holiday
PERMANENT_WEEKDAY = {
    "LEVEL_1": ("27.81", "41.72", "34.76", "41.72"),
    "LEVEL_2": ("28.45", "42.68", "35.56", "42.68"),
    "LEVEL_3": ("29.45", "44.18", "36.81", "44.18"),
    "LEVEL_4": ("30.66", "45.99", "38.33", "45.99"),
    "FIRST_HALF": ("33.99", "50.99", "42.49", "50.99"),
    "SECOND_HALF": ("35.14", "52.71", "43.93", "52.71"),
    "PHARMACIST": ("41.74", "62.61", "52.18", "62.61"),
    "EXPERIENCED_PHARMACIST": ("45.72", "68.58", "57.15", "68.58"),
    "PHARMACIST_IN_CHARGE": ("46.80", "70.20", "58.50", "70.20"),
    "PHARMACIST_MANAGER": ("52.15", "78.23", "65.19", "78.23"),
}

PERMANENT_WEEKEND = {
    "LEVEL_1": ("34.76", "55.62", "41.72", "48.67", "55.62", "41.72", "62.57"),
    "LEVEL_2": ("35.56", "56.90", "42.68", "49.79", "56.90", "42.68", "64.01"),
    "LEVEL_3": ("36.81", "58.90", "44.18", "51.54", "58.90", "44.18", "66.26"),
    "LEVEL_4": ("38.33", "61.32", "45.99", "53.66", "61.32", "45.99", "68.99"),
    "FIRST_HALF": ("42.49", "67.98", "50.99", "59.48", "67.98", "50.99", "76.48"),
    "SECOND_HALF": ("43.93", "70.28", "52.71", "61.50", "70.28", "52.71", "79.07"),
    "PHARMACIST": ("52.18", "83.48", "62.61", "73.05", "83.48", "62.61", "93.92"),
    "EXPERIENCED_PHARMACIST": ("57.15", "91.44", "68.58", "80.01", "91.44", "68.58", "102.87"),
    "PHARMACIST_IN_CHARGE": ("58.50", "93.60", "70.20", "81.90", "93.60", "70.20", "105.30"),
    "PHARMACIST_MANAGER": ("65.19", "104.30", "78.23", "91.26", "104.30", "78.23", "117.34"),
}

CASUAL_WEEKDAY = {
    "LEVEL_1": ("34.76", "48.67", "41.72", "48.67"),
    "LEVEL_2": ("35.56", "49.79", "42.68", "49.79"),
    "LEVEL_3": ("36.81", "51.54", "44.18", "51.54"),
    "LEVEL_4": ("38.33", "53.66", "45.99", "53.66"),
    "FIRST_HALF": ("42.49", "59.48", "50.99", "59.48"),
    "SECOND_HALF": ("43.93", "61.50", "52.71", "61.50"),
    "PHARMACIST": ("52.18", "73.05", "62.61", "73.05"),
    "EXPERIENCED_PHARMACIST": ("57.15", "80.01", "68.58", "80.01"),
    "PHARMACIST_IN_CHARGE": ("58.50", "81.90", "70.20", "81.90"),
    "PHARMACIST_MANAGER": ("65.19", "91.26", "78.23", "91.26"),
}

CASUAL_WEEKEND = {
    "LEVEL_1": ("41.72", "62.57", "48.67", "55.62", "62.57", "48.67", "69.53"),
    "LEVEL_2": ("42.68", "64.01", "49.79", "56.90", "64.01", "49.79", "71.13"),
    "LEVEL_3": ("44.18", "66.26", "51.54", "58.90", "66.26", "51.54", "73.63"),
    "LEVEL_4": ("45.99", "68.99", "53.66", "61.32", "68.99", "53.66", "76.65"),
    "FIRST_HALF": ("50.99", "76.48", "59.48", "67.98", "76.48", "59.48", "84.98"),
    "SECOND_HALF": ("52.71", "79.07", "61.50", "70.28", "79.07", "61.50", "87.85"),
    "PHARMACIST": ("62.61", "93.92", "73.05", "83.48", "93.92", "73.05", "104.35"),
    "EXPERIENCED_PHARMACIST": ("68.58", "102.87", "80.01", "91.44", "102.87", "80.01", "114.30"),
    "PHARMACIST_IN_CHARGE": ("70.20", "105.30", "81.90", "93.60", "105.30", "81.90", "117.00"),
    "PHARMACIST_MANAGER": ("78.23", "117.34", "91.26", "104.30", "117.34", "91.26", "130.38"),
}

# Clause 21 states that casual loading is not payable on overtime, so these
# published overtime dollar rates apply to adult employees regardless of
# full-time, part-time or casual status.
OVERTIME = {
    "LEVEL_1": ("41.72", "55.62", "55.62", "69.53"),
    "LEVEL_2": ("42.68", "56.90", "56.90", "71.13"),
    "LEVEL_3": ("44.18", "58.90", "58.90", "73.63"),
    "LEVEL_4": ("45.99", "61.32", "61.32", "76.65"),
    "FIRST_HALF": ("50.99", "67.98", "67.98", "84.98"),
    "SECOND_HALF": ("52.71", "70.28", "70.28", "87.85"),
    "PHARMACIST": ("62.61", "83.48", "83.48", "104.35"),
    "EXPERIENCED_PHARMACIST": ("68.58", "91.44", "91.44", "114.30"),
    "PHARMACIST_IN_CHARGE": ("70.20", "93.60", "93.60", "117.00"),
    "PHARMACIST_MANAGER": ("78.23", "104.30", "104.30", "130.38"),
}

# Student years use the same published dollar rows as assistant levels 1-4.
RATE_ALIAS = {
    "YEAR_1": "LEVEL_1",
    "YEAR_2": "LEVEL_2",
    "YEAR_3": "LEVEL_3",
    "YEAR_4": "LEVEL_4",
}

CLASSIFICATION_LABELS = {
    "LEVEL_1": "Pharmacy assistant level 1",
    "LEVEL_2": "Pharmacy assistant level 2",
    "LEVEL_3": "Pharmacy assistant / dispensary assistant level 3",
    "LEVEL_4": "Pharmacy assistant level 4",
    "YEAR_1": "Pharmacy student — 1st year",
    "YEAR_2": "Pharmacy student — 2nd year",
    "YEAR_3": "Pharmacy student — 3rd year",
    "YEAR_4": "Pharmacy student — 4th year",
    "FIRST_HALF": "Pharmacy intern — 1st half of training",
    "SECOND_HALF": "Pharmacy intern — 2nd half of training",
    "PHARMACIST": "Pharmacist",
    "EXPERIENCED_PHARMACIST": "Experienced pharmacist",
    "PHARMACIST_IN_CHARGE": "Pharmacist in charge",
    "PHARMACIST_MANAGER": "Pharmacist manager",
}

ROLE_CLASSIFICATIONS = {
    "ASSISTANT": ("LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"),
    # ChemistTasker's TECHNICIAN persona means dispensary work. MA000012 names
    # "Dispensary assistant level 3" rather than "technician"; Level 4 remains
    # selectable where the employee has the required Certificate IV competencies
    # and is required to work at that level.
    "TECHNICIAN": ("LEVEL_3", "LEVEL_4"),
    "STUDENT": ("YEAR_1", "YEAR_2", "YEAR_3", "YEAR_4"),
    "INTERN": ("FIRST_HALF", "SECOND_HALF"),
    "PHARMACIST": (
        "PHARMACIST",
        "EXPERIENCED_PHARMACIST",
        "PHARMACIST_IN_CHARGE",
        "PHARMACIST_MANAGER",
    ),
}

CLASSIFICATION_HELP = {
    "LEVEL_1": "No Community Pharmacy qualification competencies and not covered by another classification.",
    "LEVEL_2": "Competencies required for Certificate II in Community Pharmacy.",
    "LEVEL_3": "Certificate III competencies and required to work at this level; includes dispensary assistant duties under direct pharmacist supervision.",
    "LEVEL_4": "Certificate IV competencies and required to work at this level.",
}


def classification_options(role: str) -> list[dict[str, str]]:
    role_key = str(role or "").upper()
    return [
        {
            "value": key,
            "label": CLASSIFICATION_LABELS[key],
            **({"help": CLASSIFICATION_HELP[key]} if key in CLASSIFICATION_HELP else {}),
        }
        for key in ROLE_CLASSIFICATIONS.get(role_key, ())
    ]


def default_membership_classification(membership) -> str:
    role = str(membership.role or "").upper()
    if role == "PHARMACIST":
        value = membership.pharmacist_award_level or ""
    elif role in {"ASSISTANT", "TECHNICIAN"}:
        value = membership.otherstaff_classification_level or ""
    elif role == "INTERN":
        value = membership.intern_half or ""
    elif role == "STUDENT":
        value = membership.student_year or ""
    else:
        value = ""

    value = str(value or "").upper()
    return value if value in ROLE_CLASSIFICATIONS.get(role, ()) else ""


def _canonical_classification(classification: str) -> str:
    key = str(classification or "").upper()
    return RATE_ALIAS.get(key, key)


def _money(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _age_on(date_of_birth: date, as_of: date) -> int:
    return as_of.year - date_of_birth.year - ((as_of.month, as_of.day) < (date_of_birth.month, date_of_birth.day))


def _next_birthday(date_of_birth: date, as_of: date) -> date:
    year = as_of.year + 1 if (as_of.month, as_of.day) >= (date_of_birth.month, date_of_birth.day) else as_of.year
    try:
        return date(year, date_of_birth.month, date_of_birth.day)
    except ValueError:
        return date(year, 2, 28)


def _junior_schedule(*, classification: str, employment_type: str, percentage: Decimal) -> tuple[dict, str]:
    canonical = _canonical_classification(classification)
    adult_base = Decimal(PERMANENT_WEEKDAY[canonical][0])
    junior_base = (adult_base * percentage).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    permanent = employment_type in {"FULL_TIME", "PART_TIME"}
    weekday_multipliers = (
        (Decimal("1.00"), Decimal("1.50"), Decimal("1.25"), Decimal("1.50"))
        if permanent else
        (Decimal("1.25"), Decimal("1.75"), Decimal("1.50"), Decimal("1.75"))
    )
    weekend_multipliers = (
        (Decimal("1.25"), Decimal("2.00"), Decimal("1.50"), Decimal("1.75"), Decimal("2.00"), Decimal("1.50"), Decimal("2.25"))
        if permanent else
        (Decimal("1.50"), Decimal("2.25"), Decimal("1.75"), Decimal("2.00"), Decimal("2.25"), Decimal("1.75"), Decimal("2.50"))
    )
    overtime_multipliers = (Decimal("1.50"), Decimal("2.00"), Decimal("2.00"), Decimal("2.50"))
    weekday = tuple(_money(junior_base * m) for m in weekday_multipliers)
    weekend = tuple(_money(junior_base * m) for m in weekend_multipliers)
    overtime = tuple(_money(junior_base * m) for m in overtime_multipliers)
    return ({
        "weekday": {
            "daytime_08_19": weekday[0], "early_07_08": weekday[1],
            "evening_19_21": weekday[2], "late_21_24": weekday[3],
        },
        "saturday": {
            "daytime_08_18": weekend[0], "early_07_08": weekend[1],
            "evening_18_21": weekend[2], "late_21_24": weekend[3],
        },
        "sunday": {"outside_07_21": weekend[4], "daytime_07_21": weekend[5]},
        "public_holiday": {"all_day": weekend[6]},
        "overtime": {
            "monday_saturday_first_2_hours": overtime[0],
            "monday_saturday_after_2_hours": overtime[1],
            "sunday_all_day": overtime[2], "public_holiday_all_day": overtime[3],
        },
    }, _money(junior_base))


def _schedule(*, classification: str, employment_type: str) -> dict:
    canonical = _canonical_classification(classification)
    permanent = employment_type in {"FULL_TIME", "PART_TIME"}
    weekday = (PERMANENT_WEEKDAY if permanent else CASUAL_WEEKDAY)[canonical]
    weekend = (PERMANENT_WEEKEND if permanent else CASUAL_WEEKEND)[canonical]
    overtime = OVERTIME[canonical]

    return {
        "weekday": {
            "daytime_08_19": weekday[0],
            "early_07_08": weekday[1],
            "evening_19_21": weekday[2],
            "late_21_24": weekday[3],
        },
        "saturday": {
            "daytime_08_18": weekend[0],
            "early_07_08": weekend[1],
            "evening_18_21": weekend[2],
            "late_21_24": weekend[3],
        },
        "sunday": {
            "outside_07_21": weekend[4],
            "daytime_07_21": weekend[5],
        },
        "public_holiday": {"all_day": weekend[6]},
        "overtime": {
            "monday_saturday_first_2_hours": overtime[0],
            "monday_saturday_after_2_hours": overtime[1],
            "sunday_all_day": overtime[2],
            "public_holiday_all_day": overtime[3],
        },
    }


def resolve_award_schedule(*, role: str, classification: str, employment_type: str, date_of_birth: date | None = None, as_of: date | None = None) -> dict:
    role_key = str(role or "").upper()
    classification_key = str(classification or "").upper()
    employment_key = str(employment_type or "").upper()

    if employment_key not in {"FULL_TIME", "PART_TIME", "CASUAL"}:
        raise ValidationError(
            {"employment_type": "Award employment engagements support FULL_TIME, PART_TIME or CASUAL."}
        )

    allowed = ROLE_CLASSIFICATIONS.get(role_key, ())
    if classification_key not in allowed:
        raise ValidationError(
            {
                "award_classification": (
                    "Select a Pharmacy Award classification that matches the employee's "
                    "duties, competencies and qualifications."
                )
            }
        )

    junior_percentage = None
    age_at_effective_date = None
    next_rate_review_date = None
    is_junior_classification = role_key == "ASSISTANT" and classification_key in {"LEVEL_1", "LEVEL_2"}
    if is_junior_classification:
        if not date_of_birth or not as_of:
            raise ValidationError({"date_of_birth": "Date of birth is required to resolve Pharmacy Assistant level 1 or 2 rates."})
        if date_of_birth > as_of:
            raise ValidationError({"date_of_birth": "Date of birth cannot be after the engagement effective date."})
        age_at_effective_date = _age_on(date_of_birth, as_of)
        if age_at_effective_date < 21:
            pct_key = 15 if age_at_effective_date < 16 else age_at_effective_date
            junior_percentage = JUNIOR_PERCENTAGES[pct_key]
            schedule, minimum_hourly_rate = _junior_schedule(
                classification=classification_key,
                employment_type=employment_key,
                percentage=junior_percentage,
            )
            next_rate_review_date = _next_birthday(date_of_birth, as_of)
        else:
            schedule = _schedule(classification=classification_key, employment_type=employment_key)
            minimum_hourly_rate = PERMANENT_WEEKDAY[_canonical_classification(classification_key)][0]
    else:
        schedule = _schedule(classification=classification_key, employment_type=employment_key)
        minimum_hourly_rate = PERMANENT_WEEKDAY[_canonical_classification(classification_key)][0]

    return {
        "award_code": AWARD_CODE,
        "award_source_label": AWARD_SOURCE_LABEL,
        "award_source_url": AWARD_SOURCE_URL,
        "award_reference_url": AWARD_REFERENCE_URL,
        "award_effective_from": AWARD_EFFECTIVE_FROM,
        "award_effective_basis": AWARD_EFFECTIVE_BASIS,
        "rate_scope": "junior" if junior_percentage is not None else AWARD_RATE_SCOPE,
        "date_of_birth": str(date_of_birth) if date_of_birth else None,
        "age_at_effective_date": age_at_effective_date,
        "junior_percentage": _money(junior_percentage * Decimal("100")) if junior_percentage is not None else None,
        "next_rate_review_date": str(next_rate_review_date) if next_rate_review_date else None,
        "role": role_key,
        "classification": classification_key,
        "classification_label": CLASSIFICATION_LABELS[classification_key],
        "employment_type": employment_key,
        "minimum_hourly_rate": minimum_hourly_rate,
        "schedule": deepcopy(schedule),
        "window_labels": {
            "weekday": {
                "daytime_08_19": "Monday–Friday 8:00 am–7:00 pm",
                "early_07_08": "Monday–Friday 7:00 am–8:00 am",
                "evening_19_21": "Monday–Friday 7:00 pm–9:00 pm",
                "late_21_24": "Monday–Friday 9:00 pm–midnight",
            },
            "saturday": {
                "daytime_08_18": "Saturday 8:00 am–6:00 pm",
                "early_07_08": "Saturday 7:00 am–8:00 am",
                "evening_18_21": "Saturday 6:00 pm–9:00 pm",
                "late_21_24": "Saturday 9:00 pm–midnight",
            },
            "sunday": {
                "daytime_07_21": "Sunday 7:00 am–9:00 pm",
                "outside_07_21": "Sunday before 7:00 am or after 9:00 pm",
            },
            "public_holiday": {"all_day": "Public holiday"},
        },
        "ordinary_hours_note": (
            "Penalty windows shown are Schedule B ordinary-hour rates. Hours outside "
            "ordinary hours are subject to the Award overtime provisions; overtime "
            "rates are frozen separately in this snapshot."
        ),
        "junior_rate_note": (
            f"Clause 16.2 junior rate applied at {str(junior_percentage * Decimal('100')).rstrip('0').rstrip('.')}% of the level minimum; review on {next_rate_review_date}."
            if junior_percentage is not None
            else "Adult rate applies. Pharmacy Assistant levels 1 and 2 use DOB-driven clause 16.2 junior percentages until age 21."
        ),
        # Flat summary fields used by the engagement editor/reporting.
        "rate_weekday": schedule["weekday"]["daytime_08_19"],
        "rate_saturday": schedule["saturday"]["daytime_08_18"],
        "rate_sunday": schedule["sunday"]["daytime_07_21"],
        "rate_public_holiday": schedule["public_holiday"]["all_day"],
        "rate_early_morning": schedule["weekday"]["early_07_08"],
        "rate_late_night": schedule["weekday"]["late_21_24"],
        "early_morning_applicable": True,
        "late_night_applicable": True,
    }
