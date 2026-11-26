"""Worker booking locks and overlap checks shared by acceptance and fulfillment."""
from datetime import datetime, timedelta, timezone as datetime_timezone

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.http import Http404
from rest_framework.exceptions import ValidationError

from shifts.models import Shift, ShiftOffer, ShiftSlotAssignment
from shifts.occurrences import accepted_occurrences
from shifts.pricing import expand_shift_slots
from organizations.timezone import get_booking_timezone


def lock_booking_profiles(workers):
    from onboarding.verification.state import lock_ahpra_profiles

    lock_ahpra_profiles(workers)


def lock_booking_offers(shift, *, offer_ids=(), workers=()):
    """With the shift locked, lock selected and live offers before any competing offer can be expired."""
    offers = shift.offers.filter(Q(pk__in=offer_ids) | Q(status__in=[
        ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    ]))
    owners = dict(offers.values_list('pk', 'user_id'))
    workers_by_id = get_user_model().objects.in_bulk(set(owners.values()))
    workers_by_id.update((worker.pk, worker) for worker in workers)
    lock_booking_profiles(workers_by_id.values())
    locked = list(shift.offers.select_for_update(of=('self',)).filter(pk__in=owners).order_by('pk'))
    if any(owners[offer.pk] != offer.user_id for offer in locked):
        raise ValidationError({'detail': 'The selected offer changed. Refresh before fulfillment.'})
    return locked


def lock_offer_for_acceptance(offer, worker):
    shift = Shift.objects.select_for_update().get(pk=offer.shift_id)
    locked_offers = lock_booking_offers(shift, offer_ids=[offer.pk], workers=[worker])
    locked_offer = next((row for row in locked_offers if row.pk == offer.pk), None)
    if locked_offer is None:
        raise Http404
    if locked_offer.user_id != offer.user_id:
        raise ValidationError({'detail': 'The selected offer changed. Refresh before accepting.'})
    return shift, locked_offer


def lock_booking_workers(worker_ids):
    """Lock users by PK in booking order: shift, profiles, offers, users, slots, roster weeks."""
    # NO KEY UPDATE serializes bookings without blocking unrelated foreign-key inserts.
    list(get_user_model().objects.select_for_update(no_key=True).filter(
        pk__in=worker_ids,
    ).order_by('pk').values_list('pk', flat=True))


def _work_interval(tz, work_date, start_time, end_time):
    start = datetime.combine(work_date, start_time, tzinfo=tz)
    end = datetime.combine(work_date, end_time, tzinfo=tz)
    return start, end + timedelta(days=1) if end <= start else end


def _booking_interval(pharmacy, slot, day, offer, terms=None):
    return _work_interval(
        get_booking_timezone(pharmacy, terms),
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
            assignment.source_offer, assignment.engagement_terms_snapshot,
        ), 'an assigned shift')

    # Payment expiry transitions the offer only after confirming the provider no longer owns the hold.
    holds = ShiftOffer.objects.filter(
        user_id=offer.user_id, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    ).exclude(pk=offer.pk).select_related('shift__pharmacy').prefetch_related('shift__slots')
    for hold in holds:
        for row in accepted_occurrences(hold, expand_shift_slots(hold.shift)):
            check(_booking_interval(hold.shift.pharmacy, row['slot'], row['date'], hold), 'an unpaid booking')
