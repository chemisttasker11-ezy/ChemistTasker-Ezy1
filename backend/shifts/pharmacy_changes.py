"""Keep the location of a confirmed booking when its pharmacy updates its site."""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from organizations.timezone import get_booking_timezone, get_pharmacy_timezone
from shifts.models import ShiftSlotAssignment
from shifts.notifications import notify_shift_users
from shifts.selectors import assignment_not_ended_q, snapshot_assignment_filters


ADDRESS_FIELDS = ("street_address", "suburb", "state", "postcode", "google_place_id", "latitude", "longitude")
OPENING_FIELDS = tuple(
    f"{day}_{part}"
    for day in ("weekdays", "monday", "tuesday", "wednesday", "thursday", "friday", "saturdays", "sundays", "public_holidays")
    for part in ("start", "end", "closed")
)


def booking_site(pharmacy):
    values = {field: getattr(pharmacy, field) for field in ADDRESS_FIELDS}
    values["timezone"] = get_pharmacy_timezone(pharmacy).key
    for field in ("latitude", "longitude"):
        if values[field] is not None:
            values[field] = str(values[field])
    return values


def upcoming_pharmacy_assignments(pharmacy, *, user_id=None):
    now = timezone.now()
    rows = ShiftSlotAssignment.objects.filter(
        Q(is_rostered=False) | Q(slot__roster_period__isnull=True) | Q(slot__roster_period__status="PUBLISHED"),
        slot__unpublished_at__isnull=True,
        shift__pharmacy=pharmacy,
    )
    if user_id is not None:
        rows = rows.filter(user_id=user_id)
    saved_zone, upcoming = snapshot_assignment_filters(now, rows)
    return rows.filter(upcoming | (~saved_zone & assignment_not_ended_q(now, get_pharmacy_timezone(pharmacy))))


def pharmacy_booking_impact(pharmacy, *, user_id=None):
    dates = {
        (shift_id, work_date or legacy_date)
        for shift_id, work_date, legacy_date in upcoming_pharmacy_assignments(pharmacy, user_id=user_id).values_list(
            "shift_id", "slot_date", "slot__date",
        )
    }
    return [{"shift_id": shift_id, "date": date.isoformat()} for shift_id, date in sorted(dates)]


def preserve_pharmacy_bookings(pharmacy, changes):
    changes_site = any(
        field in changes and changes[field] != getattr(pharmacy, field) for field in (*ADDRESS_FIELDS, "timezone")
    )
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
            old_site = terms.get("booking_site")
            if not old_site or not old_site.get("timezone"):
                if old_site:
                    saved_zone = get_booking_timezone(pharmacy, terms).key
                    if (old_site.get("state"), old_site.get("postcode")) == (site["state"], site["postcode"]):
                        saved_zone = site["timezone"]
                    old_site = {**old_site, "timezone": saved_zone}
                booking.engagement_terms_snapshot = {**terms, "booking_site": old_site or site}
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
