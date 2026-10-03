"""Pure helpers shared by the timesheet modules: payload hashing, minutes between times, period bounds, local
dates, datetime serialisation and building a check record."""
import hashlib
import json
from datetime import datetime, time, timedelta
from organizations.timezone import get_pharmacy_timezone
from workforce.models import TimesheetPeriod


def _hash(payload) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _minutes(start: datetime, end: datetime) -> int:
    if not start or not end or end <= start:
        return 0
    return max(int(round((end - start).total_seconds() / 60.0)), 0)


def _period_bounds(period: TimesheetPeriod):
    tz = get_pharmacy_timezone(period.pharmacy)
    local_start = datetime.combine(period.start_date, time.min, tzinfo=tz)
    local_end_exclusive = datetime.combine(period.end_date + timedelta(days=1), time.min, tzinfo=tz)
    return local_start, local_end_exclusive, tz


def _local_date(value: datetime, tz):
    return value.astimezone(tz).date()


def _serialize_dt(value):
    return value.isoformat() if value else None


def _check(code, severity, message, *, work_date=None, details=None, identity_parts=None):
    identity_parts = identity_parts or []
    key_material = [code, str(work_date or ""), *[str(x) for x in identity_parts]]
    return {
        "identity_key": hashlib.sha256("|".join(key_material).encode("utf-8")).hexdigest()[:40],
        "code": code,
        "severity": severity,
        "work_date": work_date,
        "message": message,
        "details": details or {},
    }
