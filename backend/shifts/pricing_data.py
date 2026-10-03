"""Static shift-pricing data: casual first-level award rates and public holidays per state.

The files live in shifts/data/. They are read once, on first use (no I/O at import time), validated, and cached.
reset_cache() clears the cache (tests, or after replacing a file). Malformed data raises PricingDataError naming the
file, instead of failing later inside a rate calculation.
"""
import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
AWARD_RATES_FILE = DATA_DIR / "award_rates_casual_first_level.json"
PUBLIC_HOLIDAYS_FILE = DATA_DIR / "public_holidays.json"


class PricingDataError(RuntimeError):
    pass


def _read_json(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        raise PricingDataError(f"Cannot load pricing data file {path.name}: {type(exc).__name__}") from exc


@lru_cache(maxsize=None)
def award_rates():
    """{role: {classification: {"casual": {day_type: rate, time_bucket: {day_type: rate}}}}}"""
    data = _read_json(AWARD_RATES_FILE)
    if not isinstance(data, dict) or not data:
        raise PricingDataError(f"{AWARD_RATES_FILE.name}: expected a non-empty object of roles")
    for role, classifications in data.items():
        if not isinstance(classifications, dict):
            raise PricingDataError(f"{AWARD_RATES_FILE.name}: role {role} must map classifications")
        for classification, employment in classifications.items():
            if not isinstance(employment, dict) or not isinstance(employment.get("casual"), dict):
                raise PricingDataError(f"{AWARD_RATES_FILE.name}: {role}/{classification} has no casual rates")
    return data


@lru_cache(maxsize=None)
def public_holidays():
    """{state_code: ["YYYY-MM-DD", ...]}"""
    data = _read_json(PUBLIC_HOLIDAYS_FILE)
    if not isinstance(data, dict) or not all(isinstance(days, list) for days in data.values()):
        raise PricingDataError(f"{PUBLIC_HOLIDAYS_FILE.name}: expected an object of state -> list of dates")
    return data


def reset_cache():
    award_rates.cache_clear()
    public_holidays.cache_clear()
