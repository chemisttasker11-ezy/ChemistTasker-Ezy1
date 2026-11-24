"""Worker booking locks and overlap checks shared by acceptance and fulfillment."""
from datetime import datetime, timedelta, timezone as datetime_timezone

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from shifts.models import ShiftOffer, ShiftSlotAssignment
from shifts.occurrences import accepted_occurrences
from shifts.pricing import expand_shift_slots
from organizations.timezone import get_pharmacy_timezone


def lock_booking_workers(worker_ids):
    """Lock in user ID order inside the booking transaction, after its shift and offer locks."""
    # NO KEY UPDATE serializes bookings without blocking unrelated foreign-key inserts.
    list(get_user_model().objects.select_for_update(no_key=True).filter(
        pk__in=worker_ids,
    ).order_by('pk').values_list('pk', flat=True))


def _work_interval(pharmacy, work_date, start_time, end_time):
    tz = get_pharmacy_timezone(pharmacy)
    start = datetime.combine(work_date, start_time, tzinfo=tz)
    end = datetime.combine(work_date, end_time, tzinfo=tz)
    return start, end + timedelta(days=1) if end <= start else end


def _booking_interval(pharmacy, slot, day, offer):
    return _work_interval(
        pharmacy,
        day,
        (offer and offer.offered_start_time) or slot.start_time,
        (offer and offer.offered_end_time) or slot.end_time,
    )


def ensure_worker_booking_available(offer, occurrences=None):
    """Refuse overlaps with assignments or other unpaid holds while the worker is locked."""
    if occurrences is None:
        occurrences = list(accepted_occurrences(offer, expand_shift_slots(offer.shift)))
    if not occurrences:
        return

    intervals = [
        tuple(moment.astimezone(datetime_timezone.utc) for moment in _booking_interval(
            offer.shift.pharmacy, row['slot'], row['date'], offer,
        ))
        for row in occurrences
    ]

    def check(interval, booking):
        start, end = (moment.astimezone(datetime_timezone.utc) for moment in interval)
        if any(proposed_start < end and start < proposed_end for proposed_start, proposed_end in intervals):
            local_start, local_end = interval
            raise ValidationError({
                'code': 'worker_booking_overlap',
                'detail': (
                    f'This booking overlaps {booking} from {local_start:%Y-%m-%d %H:%M %Z} '
                    f'to {local_end:%Y-%m-%d %H:%M %Z}.'
                ),
            })

    # Allow for overnight work and local dates on either side of the date line.
    days = [row['date'] for row in occurrences]
    nearby = (min(days) - timedelta(days=3), max(days) + timedelta(days=3))
    assignments = ShiftSlotAssignment.objects.filter(user_id=offer.user_id).filter(
        Q(slot_date__range=nearby) | Q(slot_date__isnull=True, slot__date__range=nearby)
    ).select_related('shift__pharmacy', 'slot', 'source_offer')
    for assignment in assignments:
        check(_booking_interval(
            assignment.shift.pharmacy, assignment.slot, assignment.slot_date or assignment.slot.date,
            assignment.source_offer,
        ), 'an assigned shift')

    holds = ShiftOffer.objects.filter(
        user_id=offer.user_id, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    ).filter(
        Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()),
    ).exclude(pk=offer.pk).select_related('shift__pharmacy').prefetch_related('shift__slots')
    for hold in holds:
        for row in accepted_occurrences(hold, expand_shift_slots(hold.shift)):
            check(_booking_interval(hold.shift.pharmacy, row['slot'], row['date'], hold), 'an unpaid booking')
