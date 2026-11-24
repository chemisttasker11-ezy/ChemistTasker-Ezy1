"""Pay-by deadlines for accepted shift offers."""
from datetime import datetime, timedelta, timezone

from organizations.timezone import get_pharmacy_timezone
from shifts.occurrences import accepted_occurrences
from shifts.pricing import expand_shift_slots


def payment_deadline(reserved_at, starts_at):
    """Return the pay-by time for an accepted reservation (slotless offers have no start)."""
    reserved_at = reserved_at.astimezone(timezone.utc)
    if starts_at is None:
        return reserved_at + timedelta(hours=24)
    starts_at = starts_at.astimezone(timezone.utc)
    lead = starts_at - reserved_at
    if lead > timedelta(hours=48):
        window = timedelta(hours=24)
    elif lead >= timedelta(hours=12):
        window = timedelta(hours=6)
    elif lead > timedelta(hours=2):
        window = timedelta(hours=2)
    else:
        window = timedelta(minutes=30)
    return min(reserved_at + window, starts_at)


def offer_payment_deadline(offer, reserved_at):
    zone = get_pharmacy_timezone(offer.shift.pharmacy)
    starts = (datetime.combine(row['date'], offer.offered_start_time or row['start_time'], zone)
              for row in accepted_occurrences(offer, expand_shift_slots(offer.shift)))
    return payment_deadline(reserved_at, min(starts, default=None))
