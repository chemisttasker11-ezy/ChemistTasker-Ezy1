from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

_STATE_TIMEZONES: dict[str, str] = {
    "NSW": "Australia/Sydney",
    "NEW SOUTH WALES": "Australia/Sydney",
    "VIC": "Australia/Melbourne",
    "VICTORIA": "Australia/Melbourne",
    "QLD": "Australia/Brisbane",
    "QUEENSLAND": "Australia/Brisbane",
    "WA": "Australia/Perth",
    "WESTERN AUSTRALIA": "Australia/Perth",
    "SA": "Australia/Adelaide",
    "SOUTH AUSTRALIA": "Australia/Adelaide",
    "TAS": "Australia/Hobart",
    "TASMANIA": "Australia/Hobart",
    "ACT": "Australia/Sydney",
    "AUSTRALIAN CAPITAL TERRITORY": "Australia/Sydney",
    "NT": "Australia/Darwin",
    "NORTHERN TERRITORY": "Australia/Darwin",
}


def get_pharmacy_timezone(pharmacy) -> ZoneInfo:
    """Resolve an explicit zone, then postcode/state, then settings.TIME_ZONE without saving it."""
    raw_tz = getattr(pharmacy, "timezone", None)
    tz_name = str(raw_tz).strip() if raw_tz is not None else ""
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except (ValueError, ZoneInfoNotFoundError):
            pass

    raw_postcode = getattr(pharmacy, "postcode", None)
    postcode = str(raw_postcode).strip() if raw_postcode is not None else ""
    if postcode == "2880":
        return ZoneInfo("Australia/Broken_Hill")

    raw_state = getattr(pharmacy, "state", None)
    if raw_state is not None:
        normalized_state = " ".join(str(raw_state).split()).upper()
        state_tz = _STATE_TIMEZONES.get(normalized_state)
        if state_tz:
            return ZoneInfo(state_tz)

    return timezone.get_default_timezone()
