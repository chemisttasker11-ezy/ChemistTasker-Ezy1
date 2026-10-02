from __future__ import annotations

from zoneinfo import ZoneInfo

from django.utils import timezone


def get_pharmacy_timezone(pharmacy) -> ZoneInfo:
    """Return the pharmacy IANA timezone, falling back to Django's default timezone."""
    tz_name = getattr(pharmacy, "timezone", None) or ""
    if tz_name:
        try:
            return ZoneInfo(tz_name)
        except Exception:
            pass
    return timezone.get_default_timezone()
