"""One authoritative holiday resolver for declared Australian public holidays.

Not a payroll entitlement engine. It resolves declared state, regional,
substituted and part-day public holidays from dated government source records.
The employee's base-for-work location is legally authoritative; a pharmacy's
configured region is a preview default, not a substitute for employee-specific
engagement terms or a public-holiday substitution agreement.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time

from shifts.pricing_data import PricingDataError, local_public_holidays, public_holidays


STATE_CODES = {
    "ACT": "ACT", "AUSTRALIAN CAPITAL TERRITORY": "ACT",
    "NSW": "NSW", "NEW SOUTH WALES": "NSW",
    "NT": "NT", "NORTHERN TERRITORY": "NT",
    "QLD": "QLD", "QUEENSLAND": "QLD",
    "SA": "SA", "SOUTH AUSTRALIA": "SA",
    "TAS": "TAS", "TASMANIA": "TAS",
    "VIC": "VIC", "VICTORIA": "VIC",
    "WA": "WA", "WESTERN AUSTRALIA": "WA",
}
FAIR_WORK_YEAR_SOURCE = "https://www.fairwork.gov.au/employment-conditions/public-holidays/"


@dataclass(frozen=True)
class HolidayResolution:
    is_public_holiday: bool
    scope: str
    status: str
    name: str = ""
    source: str = ""
    region: str = ""
    note: str = ""

    @property
    def needs_review(self) -> bool:
        return self.status != "VERIFIED"


def normalize_state(state: str | None) -> str:
    return STATE_CODES.get(str(state or "").strip().upper(), "")


def region_details(state, region_code):
    """Validate the explicit work-base region; never derive it from postcode."""
    code = str(region_code or "").strip().upper()
    if not code:
        return None
    record = local_public_holidays()["regions"].get(code)
    if not record or record["state"] != normalize_state(state):
        raise PricingDataError("Public-holiday region does not match the work-base state.")
    return record


def _minute(value):
    if isinstance(value, time):
        return value.hour * 60 + value.minute
    hours, minutes = map(int, str(value).split(":")[:2])
    result = hours * 60 + minutes
    if result < 0 or result > 24 * 60 or minutes < 0 or minutes > 59:
        raise PricingDataError("Invalid public-holiday time boundary.")
    return result


def _windows(work_date: date, state: str, region_code: str):
    data = local_public_holidays()
    record = region_details(state, region_code)
    day = work_date.isoformat()
    excluded = record is not None and day in record.get("exclude_state_dates", [])
    windows = []
    if not excluded and day in public_holidays().get(state, []):
        windows.append({
            "start": "00:00", "end": "24:00",
            "scope": "STATEWIDE", "name": "Statewide public holiday",
            "source": FAIR_WORK_YEAR_SOURCE + str(work_date.year) + "-public-holidays",
        })
    for item in data["statewide_part_days"]:
        if item["state"] == state and item["date"] == day:
            windows.append({**item, "scope": "STATE_PART_DAY"})
    if record is not None:
        for item in record["events"]:
            if item["date"] == day:
                windows.append({
                    **item,
                    "scope": "REGIONAL" if item["start"] == "00:00" and item["end"] == "24:00" else "REGIONAL_PART_DAY",
                    "source": record["source"],
                })
    return windows


def resolve_public_holiday(work_date: date, state, region_code="", at_time=None):
    """Return an auditable legal-date classification, including unresolved scope."""
    state_code = normalize_state(state)
    region = str(region_code or "").strip().upper()
    if not state_code:
        return HolidayResolution(False, "NONE", "UNKNOWN_STATE", region=region)
    record = region_details(state_code, region)
    if work_date.year not in (2026, 2027):
        return HolidayResolution(False, "NONE", "YEAR_NOT_CERTIFIED", region=region)

    windows = _windows(work_date, state_code, region)
    minute = _minute(at_time) if at_time is not None else None
    matched = next(
        (win for win in windows if (
            (minute is None and win["start"] == "00:00" and win["end"] == "24:00")
            or (minute is not None and _minute(win["start"]) <= minute < _minute(win["end"]))
        )), None
    )
    if record and work_date.year in record["pending_years"]:
        status = "LOCAL_DECLARATION_PENDING"
        note = "This region's local public holidays for the selected year are not yet certified."
    elif record is None:
        state_regions = [r for r in local_public_holidays()["regions"].values() if r["state"] == state_code]
        # A missing work-base district cannot be certified, even when no
        # known regional event is listed on this exact date. Future councils
        # may publish additional local declarations during the year.
        candidate = bool(state_regions) or state_code in {"VIC", "WA", "TAS", "NT", "NSW", "QLD"}
        status = "REGION_REQUIRED" if candidate else "VERIFIED"
        note = (
            "Local public holidays or regional replacements may apply; "
            "confirm the employee's work-base district against the "
            "jurisdiction's official declaration."
        ) if candidate else ""
    else:
        status = "VERIFIED"
        note = ""

    if matched:
        return HolidayResolution(
            True, matched["scope"], status, matched.get("name", ""),
            matched.get("source", ""), region, note,
        )
    return HolidayResolution(False, "NONE", status, region=region, note=note)


def holiday_boundaries(work_date: date, state, region_code=""):
    """Additional part-day boundaries for splitting a shift before pricing."""
    code = normalize_state(state)
    if not code:
        return ()
    windows = _windows(work_date, code, str(region_code or "").strip().upper())
    boundaries = set()
    for window in windows:
        for key in ("start", "end"):
            value = _minute(window[key])
            if 0 < value < 1440:
                boundaries.add(time(value // 60, value % 60))
    return tuple(sorted(boundaries))


def full_day_public_holidays(state, region_code=""):
    """Legacy date-array contract, never promote a part-day to all-day."""
    code = normalize_state(state)
    if not code:
        return []
    record = region_details(code, region_code)
    days = set(public_holidays()[code])
    if record is not None:
        days.difference_update(record.get("exclude_state_dates", []))
        for item in record["events"]:
            if item["start"] == "00:00" and item["end"] == "24:00":
                days.add(item["date"])
    return sorted(days)


def part_day_public_holidays(state, region_code=""):
    """Return explicit time windows for clients without altering date-only API."""
    code = normalize_state(state)
    if not code:
        return []
    record = region_details(code, region_code)
    rules = local_public_holidays()
    entries = [dict(item, scope="STATE_PART_DAY") for item in rules["statewide_part_days"] if item["state"] == code]
    if record:
        entries.extend(
            dict(item, scope="REGIONAL_PART_DAY", source=record["source"])
            for item in record["events"]
            if item["start"] != "00:00" or item["end"] != "24:00"
        )
    return sorted(entries, key=lambda item: (item["date"], item["start"]))


def holiday_calendar_status(state, region_code=""):
    code = normalize_state(state)
    if not code:
        return {"state": "", "region": "", "status": "UNKNOWN_STATE", "pendingYears": [2026, 2027]}
    record = region_details(code, region_code)
    if record:
        return {
            "state": code, "region": str(region_code).strip().upper(),
            "status": "LOCAL_DECLARATION_PENDING" if record["pending_years"] else "VERIFIED",
            "pendingYears": record["pending_years"],
            "verifiedYears": record["verified_years"],
            "source": record["source"],
        }
    return {
        "state": code, "region": "",
        "status": "REGION_NOT_CONFIGURED",
        "pendingYears": [2026, 2027],
        "note": "Statewide holidays only; local show/part-day scope must be verified.",
    }
