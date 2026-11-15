"""Query building blocks of the shift lists: which shifts a user manages, and which slots are open, confirmed or past.

The list views compose these instead of repeating the filters.
"""
from datetime import timedelta

from django.db.models import Exists, F, OuterRef, Q

from organizations.access import managed_pharmacies
from organizations.models import Pharmacy
from organizations.timezone import get_pharmacy_timezone
from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment


def shifts_managed_by(queryset, user):
    """The shifts the user created or whose pharmacy they manage."""
    return queryset.filter(Q(created_by=user) | Q(pharmacy__in=managed_pharmacies(user)))


def slot_occurrence_ended(slot_date, start_time, end_time, local_date, clock):
    """True once the occurrence on slot_date has ended; one ending at or before its start ends the next day."""
    end_date = slot_date + timedelta(days=1) if end_time <= start_time else slot_date
    return (end_date, end_time) < (local_date, clock)


def slot_not_ended_q(local_date, clock, *, date='date', start='start_time', end='end_time'):
    """SQL form of `not slot_occurrence_ended` for the occurrence dated by the `date` field."""
    overnight = Q(**{f'{end}__lte': F(start)})
    return (
        Q(**{f'{date}__gt': local_date})
        | (Q(**{date: local_date}) & (Q(**{f'{end}__gte': clock}) | overnight))
        | (Q(**{date: local_date - timedelta(days=1), f'{end}__gte': clock}) & overnight)
    )


def _future_or_current_slot_q(now, today, prefix=''):
    result = Q(pk__in=[])
    pharmacy_ids_by_zone = {}
    for pharmacy in Pharmacy.objects.only('pk', 'timezone', 'state', 'postcode'):
        zone = get_pharmacy_timezone(pharmacy)
        pharmacy_ids_by_zone.setdefault(zone, []).append(pharmacy.pk)
    for zone, pharmacy_ids in pharmacy_ids_by_zone.items():
        local_now = now.astimezone(zone)
        local_date = local_now.date()
        clock = local_now.time()
        times = {'start': f'{prefix}start_time', 'end': f'{prefix}end_time'}
        result |= Q(**{f'{prefix}shift__pharmacy_id__in': pharmacy_ids}) & (
            (Q(**{f'{prefix}is_recurring': True})
             & slot_not_ended_q(local_date, clock, date=f'{prefix}recurring_end_date', **times)) |
            slot_not_ended_q(local_date, clock, date=f'{prefix}date', **times)
        )
    return result


def _past_slot_q(now, today):
    return ~_future_or_current_slot_q(now, today)


def _matching_shift_slot_exists(*, now, today, assigned_user_id=None, state='active'):
    slots = ShiftSlot.objects.filter(shift_id=OuterRef('pk'))
    slot_assignments = ShiftSlotAssignment.objects.filter(
        shift_id=OuterRef('shift_id'),
        slot_id=OuterRef('pk'),
    )
    if assigned_user_id is not None:
        slot_assignments = slot_assignments.filter(user_id=assigned_user_id)

    pending_payment = ShiftOffer.objects.filter(
        shift_id=OuterRef('shift_id'),
        slot_id=OuterRef('pk'),
        status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    )

    slots = slots.annotate(
        has_assignment=Exists(slot_assignments),
        has_pending_payment=Exists(pending_payment),
    )

    if state == 'active':
        slots = slots.filter(_future_or_current_slot_q(now, today)).filter(
            Q(has_assignment=False) | Q(has_pending_payment=True)
        )
    elif state == 'confirmed':
        slots = slots.filter(_future_or_current_slot_q(now, today)).filter(
            has_assignment=True,
            has_pending_payment=False,
        )
    # elif state == 'history':
    #     slots = slots.filter(_past_slot_q(now, today)).filter(
    #         has_assignment=True,
    #         has_pending_payment=False,
    #     )

# this part will be removed later
    elif state == 'history':
        slots = slots.filter(
            has_assignment=True,
            has_pending_payment=False,
        )


    else:
        raise ValueError(f"Unsupported slot lifecycle state: {state}")

    return Exists(slots)


def _shift_has_past_slot_exists(*, now, today):
    slots = ShiftSlot.objects.filter(shift_id=OuterRef('pk')).filter(_past_slot_q(now, today))
    return Exists(slots)
