"""Keep the location of a confirmed booking when its pharmacy updates its site."""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from organizations.timezone import get_pharmacy_timezone
from shifts.models import ShiftSlotAssignment
from shifts.notifications import notify_shift_users
from shifts.selectors import slot_not_ended_q


ADDRESS_FIELDS = ("street_address", "suburb", "state", "postcode", "google_place_id", "latitude", "longitude")
OPENING_FIELDS = tuple(
    f"{day}_{part}"
    for day in ("weekdays", "monday", "tuesday", "wednesday", "thursday", "friday", "saturdays", "sundays", "public_holidays")
    for part in ("start", "end", "closed")
)


def booking_site(pharmacy):
    values = {field: getattr(pharmacy, field) for field in ADDRESS_FIELDS}
    for field in ("latitude", "longitude"):
        if values[field] is not None:
            values[field] = str(values[field])
    return values


def upcoming_pharmacy_assignments(pharmacy, *, user_id=None):
    now = timezone.now().astimezone(get_pharmacy_timezone(pharmacy))
    upcoming = slot_not_ended_q(now.date(), now.time(), date="slot_date", start="slot__start_time", end="slot__end_time")
    legacy = Q(slot_date__isnull=True) & slot_not_ended_q(
        now.date(), now.time(), date="slot__date", start="slot__start_time", end="slot__end_time",
    )
    rows = ShiftSlotAssignment.objects.filter(upcoming | legacy, shift__pharmacy=pharmacy)
    rows = rows.filter(
        Q(is_rostered=False) | Q(slot__roster_period__isnull=True) | Q(slot__roster_period__status="PUBLISHED"),
        slot__unpublished_at__isnull=True,
    )
    return rows.filter(user_id=user_id) if user_id is not None else rows


def pharmacy_booking_impact(pharmacy, *, user_id=None):
    dates = {
        (shift_id, work_date or legacy_date)
        for shift_id, work_date, legacy_date in upcoming_pharmacy_assignments(pharmacy, user_id=user_id).values_list(
            "shift_id", "slot_date", "slot__date",
        )
    }
    return [{"shift_id": shift_id, "date": date.isoformat()} for shift_id, date in sorted(dates)]


def preserve_pharmacy_bookings(pharmacy, changes):
    changes_site = any(field in changes and changes[field] != getattr(pharmacy, field) for field in ADDRESS_FIELDS)
    changes_hours = any(
        field in changes and changes[field] != getattr(pharmacy, field, None)
        for field in OPENING_FIELDS
    )
    if not (changes_site or changes_hours):
        return

    bookings = list(upcoming_pharmacy_assignments(pharmacy).select_related("shift", "user").select_for_update(of=("self",)))
    if changes_site:
        site = booking_site(pharmacy)
        historic = []
        for booking in bookings:
            terms = booking.engagement_terms_snapshot or {}
            if "booking_site" not in terms:
                booking.engagement_terms_snapshot = {**terms, "booking_site": site}
                historic.append(booking)
        ShiftSlotAssignment.objects.bulk_update(historic, ["engagement_terms_snapshot"])

    recipients = {(booking.shift_id, booking.user_id): (booking.shift, booking.user) for booking in bookings}
    for shift, user in recipients.values():
        transaction.on_commit(
            lambda shift=shift, user=user: notify_shift_users(
                [user], shift=shift, title="Pharmacy details updated",
                body="The pharmacy changed its address or opening hours. Your agreed shift location and hours are unchanged.",
                kind="pharmacy_booking_details_updated",
            ), robust=True,
        )
