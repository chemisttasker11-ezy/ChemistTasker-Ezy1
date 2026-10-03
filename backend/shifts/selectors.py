"""Query building blocks of the shift lists: which shifts a user manages, and which slots are open, confirmed or past.

The list views compose these instead of repeating the filters.
"""
from django.db.models import Exists, OuterRef, Q

from organizations.access import managed_pharmacies
from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment


def shifts_managed_by(queryset, user):
    """The shifts the user created or whose pharmacy they manage."""
    return queryset.filter(Q(created_by=user) | Q(pharmacy__in=managed_pharmacies(user)))


def _future_or_current_slot_q(now, today):
    return (
        Q(is_recurring=True, recurring_end_date__gte=today) |
        Q(date__gt=today) |
        Q(date=today, end_time__gte=now.time())
    )


def _past_slot_q(now, today):
    return (
        Q(is_recurring=True, recurring_end_date__lt=today) |
        Q(date__lt=today) |
        Q(date=today, end_time__lt=now.time())
    )


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
