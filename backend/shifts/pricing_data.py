"""Static shift-pricing data: casual first-level award rates and public holidays per state.

The files live in shifts/data/. They are read once, on first use (no I/O at import time), validated, and cached.
reset_cache() clears the cache (tests, or after replacing a file). Malformed data raises PricingDataError naming the
file, instead of failing later inside a rate calculation.
"""
import json
from datetime import date
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
AWARD_RATES_FILE = DATA_DIR / "award_rates_casual_first_level.json"
PUBLIC_HOLIDAYS_FILE = DATA_DIR / "public_holidays.json"
LOCAL_PUBLIC_HOLIDAYS_FILE = DATA_DIR / "public_holidays_local.json"

DAY_TYPES = ("weekday", "saturday", "sunday", "public_holiday")
TIME_BUCKETS = ("early_morning", "late_night")
REQUIRED_AWARD_CLASSIFICATIONS = {
    "ASSISTANT": "LEVEL_1",
    "STUDENT": "YEAR_1",
    "INTERN": "FIRST_HALF",
}
OPTIONAL_FALLBACK_CLASSIFICATIONS = {
    "TECHNICIAN": "LEVEL_1",  # pricing deliberately falls back to ASSISTANT when the whole TECHNICIAN role is absent
}
REQUIRED_STATE_CODES = ("ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA")


class PricingDataError(RuntimeError):
    pass


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        raise PricingDataError(f"Cannot load pricing data file {path.name}: {type(exc).__name__}") from exc


def _validate_rate(value, *, label):
    if isinstance(value, bool):
        raise PricingDataError(f"{AWARD_RATES_FILE.name}: {label} must be a positive numeric rate")
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise PricingDataError(f"{AWARD_RATES_FILE.name}: {label} must be a positive numeric rate") from exc
    if not parsed.is_finite() or parsed <= 0:
        raise PricingDataError(f"{AWARD_RATES_FILE.name}: {label} must be a positive numeric rate")


def _validate_casual_table(role, classification, casual):
    if not isinstance(casual, dict):
        raise PricingDataError(f"{AWARD_RATES_FILE.name}: {role}/{classification} has no casual rates")

    for day_type in DAY_TYPES:
        if day_type not in casual:
            raise PricingDataError(f"{AWARD_RATES_FILE.name}: {role}/{classification} missing {day_type}")
        _validate_rate(casual[day_type], label=f"{role}/{classification} {day_type}")

    for bucket in TIME_BUCKETS:
        bucket_rates = casual.get(bucket)
        if not isinstance(bucket_rates, dict):
            raise PricingDataError(f"{AWARD_RATES_FILE.name}: {role}/{classification} missing {bucket}")
        for day_type in DAY_TYPES:
            if day_type not in bucket_rates:
                raise PricingDataError(
                    f"{AWARD_RATES_FILE.name}: {role}/{classification} {bucket} missing {day_type}"
                )
            _validate_rate(
                bucket_rates[day_type],
                label=f"{role}/{classification} {bucket} {day_type}",
            )


@lru_cache(maxsize=None)
def award_rates(as_of):
    """{role: {classification: {"casual": {day_type: rate, time_bucket: {day_type: rate}}}}}"""
    data = _read_json(AWARD_RATES_FILE)
    if not isinstance(data, dict) or not data:
        raise PricingDataError(f"{AWARD_RATES_FILE.name}: expected a non-empty object of roles")

    for role, classifications in data.items():
        if not isinstance(classifications, dict) or not classifications:
            raise PricingDataError(f"{AWARD_RATES_FILE.name}: role {role} must map classifications")
        for classification, employment in classifications.items():
            if not isinstance(employment, dict):
                raise PricingDataError(f"{AWARD_RATES_FILE.name}: {role}/{classification} must map employment rates")
            _validate_casual_table(role, classification, employment.get("casual"))

    for role, classification in REQUIRED_AWARD_CLASSIFICATIONS.items():
        classifications = data.get(role)
        if not isinstance(classifications, dict) or classification not in classifications:
            raise PricingDataError(f"{AWARD_RATES_FILE.name}: missing {role}/{classification}")

    for role, classification in OPTIONAL_FALLBACK_CLASSIFICATIONS.items():
        if role in data:
            classifications = data.get(role)
            if not isinstance(classifications, dict) or classification not in classifications:
                raise PricingDataError(f"{AWARD_RATES_FILE.name}: missing {role}/{classification}")

    if as_of >= date(2026, 7, 1):
        # The payroll engagement calculator owns the authoritative Fair Work
        # Schedule B tables. Shift pricing derives from them, never another
        # independently maintained 2026 dollar table.
        from workforce.award_rates import CASUAL_WEEKDAY, CASUAL_WEEKEND, RATE_ALIAS
        derived = {}
        for role, rate_key, classification_key in (
            ("ASSISTANT", "LEVEL_1", "LEVEL_1"),
            ("TECHNICIAN", "LEVEL_1", "LEVEL_3"),
            ("STUDENT", "YEAR_1", "LEVEL_1"),
            ("INTERN", "FIRST_HALF", "FIRST_HALF"),
            ("PHARMACIST", "PHARMACIST", "PHARMACIST"),
        ):
            canonical = RATE_ALIAS.get(classification_key, classification_key)
            weekday = CASUAL_WEEKDAY[canonical]
            weekend = CASUAL_WEEKEND[canonical]
            windows = {
                "weekday": {"early_07_08": weekday[1], "daytime_08_19": weekday[0],
                            "evening_19_21": weekday[2], "late_21_24": weekday[3]},
                "saturday": {"early_07_08": weekend[1], "daytime_08_18": weekend[0],
                             "evening_18_21": weekend[2], "late_21_24": weekend[3]},
                "sunday": {"outside_07_21": weekend[4], "daytime_07_21": weekend[5]},
                "public_holiday": {"all_day": weekend[6]},
            }
            derived[role] = {rate_key: {"casual": {
                "weekday": weekday[0], "saturday": weekend[0],
                "sunday": weekend[5], "public_holiday": weekend[6],
                "early_morning": {"weekday": weekday[1], "saturday": weekend[1],
                                  "sunday": weekend[4], "public_holiday": weekend[6]},
                "late_night": {"weekday": weekday[3], "saturday": weekend[3],
                               "sunday": weekend[4], "public_holiday": weekend[6]},
                "award_windows": windows,
            }}}
        return derived
    return data


@lru_cache(maxsize=None)
def public_holidays():
    """{state_code: ["YYYY-MM-DD", ...]}"""
    data = _read_json(PUBLIC_HOLIDAYS_FILE)
    if not isinstance(data, dict):
        raise PricingDataError(f"{PUBLIC_HOLIDAYS_FILE.name}: expected an object of state -> list of dates")

    missing_states = [state for state in REQUIRED_STATE_CODES if state not in data]
    if missing_states:
        raise PricingDataError(
            f"{PUBLIC_HOLIDAYS_FILE.name}: missing required state data: {', '.join(missing_states)}"
        )

    for state, days in data.items():
        if not isinstance(days, list):
            raise PricingDataError(f"{PUBLIC_HOLIDAYS_FILE.name}: state {state} must map to a list of dates")
        for value in days:
            if not isinstance(value, str):
                raise PricingDataError(f"{PUBLIC_HOLIDAYS_FILE.name}: {state} has invalid date {value!r}")
            try:
                parsed = date.fromisoformat(value)
            except ValueError as exc:
                raise PricingDataError(
                    f"{PUBLIC_HOLIDAYS_FILE.name}: {state} has invalid date {value}"
                ) from exc
            if parsed.isoformat() != value:
                raise PricingDataError(f"{PUBLIC_HOLIDAYS_FILE.name}: {state} has invalid date {value}")

    return data


@lru_cache(maxsize=1)
def local_public_holidays():
    """Declared location-scoped and part-day dates, with explicit pending years."""
    data = _read_json(LOCAL_PUBLIC_HOLIDAYS_FILE)
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise PricingDataError(f"{LOCAL_PUBLIC_HOLIDAYS_FILE.name}: unsupported calendar schema")
    if not isinstance(data.get("regions"), dict) or not isinstance(
        data.get("statewide_part_days"), list
    ):
        raise PricingDataError(f"{LOCAL_PUBLIC_HOLIDAYS_FILE.name}: missing region or part-day data")
    for region_code, record in data["regions"].items():
        if (
            not isinstance(record, dict)
            or region_code != str(region_code).strip().upper()
            or record.get("state") not in REQUIRED_STATE_CODES
            or not region_code.startswith(record["state"] + "_")
            or not isinstance(record.get("events"), list)
            or not isinstance(record.get("pending_years"), list)
            or not isinstance(record.get("verified_years"), list)
        ):
            raise PricingDataError(f"{LOCAL_PUBLIC_HOLIDAYS_FILE.name}: invalid region {region_code}")
        if set(record["pending_years"]) & set(record["verified_years"]):
            raise PricingDataError(f"{LOCAL_PUBLIC_HOLIDAYS_FILE.name}: conflicting region year {region_code}")
        for entry in record["events"]:
            try:
                parsed = date.fromisoformat(entry["date"])
            except (KeyError, TypeError, ValueError) as exc:
                raise PricingDataError(f"{LOCAL_PUBLIC_HOLIDAYS_FILE.name}: bad event date in {region_code}") from exc
            if parsed.year not in record["verified_years"]:
                raise PricingDataError(f"{LOCAL_PUBLIC_HOLIDAYS_FILE.name}: unverified local event in {region_code}")
    return data


def reset_cache():
    award_rates.cache_clear()
    public_holidays.cache_clear()
    local_public_holidays.cache_clear()
