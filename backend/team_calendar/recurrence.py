from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, List, Optional

"""
Lightweight recurrence expansion for daily/weekly/monthly.
Recurrence schema:
{
    "freq": "DAILY" | "WEEKLY" | "MONTHLY",
    "interval": int,                  # defaults to 1
    "until_date": "YYYY-MM-DD" | None,
    "byweekday": [0-6]                # only for WEEKLY; 0=Monday
}
"""


def expand_recurrence_dates(
    start_date: date,
    recurrence: Optional[dict],
    from_date: date,
    to_date: date,
) -> List[date]:
    if not recurrence:
        return []

    freq = (recurrence.get("freq") or "").upper()
    interval = int(recurrence.get("interval") or 1)
    until_str = recurrence.get("until_date")
    byweekday = recurrence.get("byweekday") or []

    if interval < 1:
        interval = 1

    until: Optional[date] = None
    if until_str:
        try:
            until = date.fromisoformat(until_str)
        except Exception:
            until = None

    # Start from the later of start_date or from_date
    current = start_date
    results: List[date] = []

    def in_range(d: date) -> bool:
        if d < from_date or d > to_date:
            return False
        if until and d > until:
            return False
        return True

    if freq == "DAILY":
        # Find the first occurrence on or after from_date
        if current < from_date:
            delta_days = (from_date - current).days
            steps = delta_days // interval
            current = current + timedelta(days=steps * interval)
        while in_range(current):
            results.append(current)
            current = current + timedelta(days=interval)

    elif freq == "WEEKLY":
        # If byweekday provided, expand each chosen weekday
        weekdays: Iterable[int]
        if byweekday:
            weekdays = [int(x) for x in byweekday if isinstance(x, (int, str))]
        else:
            weekdays = [current.weekday()]

        # Move current to the beginning of the week containing max(current, from_date)
        anchor = max(current, from_date)
        # Align anchor backwards to Monday
        anchor_monday = anchor - timedelta(days=anchor.weekday())
        week_index = 0
        while True:
            week_start = anchor_monday + timedelta(weeks=week_index * interval)
            for wd in weekdays:
                try:
                    wd_int = int(wd)
                except Exception:
                    continue
                occurrence = week_start + timedelta(days=wd_int)
                if occurrence < current:
                    continue
                if in_range(occurrence):
                    results.append(occurrence)
            # Stop if next week start goes beyond to_date or until
            next_week_start = week_start + timedelta(weeks=interval)
            if next_week_start > to_date or (until and next_week_start > until):
                break
            week_index += 1

    elif freq == "MONTHLY":
        # Monthly on the same day-of-month as start_date
        anchor = start_date
        if anchor < from_date:
            # advance month until on/after from_date
            while True:
                anchor = _add_months(anchor, interval)
                if anchor >= from_date:
                    break
        current = anchor
        while in_range(current):
            results.append(current)
            current = _add_months(current, interval)

    return [d for d in results if in_range(d)]


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return (next_month - date(year, month, 1)).days
