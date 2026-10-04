"""Copying a roster week, with the history and marketplace protections it relies on."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod
from workforce.roster.permissions import is_authorized_attendance_manager
from shifts.engagement import staff_assignment_defaults
from workforce.roster.assignment_rates import _validate_and_price
from workforce.roster.edit_guards import _delete_empty_shift, _parse_date, _protect_assignment_history, _protect_marketplace_slot
from workforce.roster.periods import get_roster_period_assignments


def _clear_target_week_shifts(pharmacy, week_start, week_end):
    """Clear only roster-owned work through the ORM, preserving linked history."""
    period = RosterPeriod.objects.get(pharmacy=pharmacy, week_start=week_start)
    slots = list(ShiftSlot.objects.filter(shift__pharmacy=pharmacy, date__range=(week_start, week_end))
                 .filter(Q(roster_period=period) | Q(assignments__is_rostered=True))
                 .distinct().select_related("shift"))
    for slot in slots:
        _protect_marketplace_slot(slot, 0, period)
        if ShiftOffer.objects.filter(shift=slot.shift).exists():
            raise ValidationError("Cannot overwrite a shift with marketplace offers.")
        for assignment in slot.assignments.all():
            _protect_assignment_history(assignment)
        slot.delete()
        _delete_empty_shift(slot.shift)


def _roster_occurrences(period):
    from copy import copy
    occurrences = {}
    for assignment in get_roster_period_assignments(period):
        slot = copy(assignment.slot)
        slot.date = assignment.slot_date or slot.date
        occurrences[(slot.pk, slot.date)] = slot
    for slot in period.planned_slots.select_related("shift").all():
        if period.week_start <= slot.date <= period.week_end:
            occurrences[(slot.pk, slot.date)] = slot
    return sorted(occurrences.values(), key=lambda slot: (slot.date, slot.start_time, slot.pk))


@transaction.atomic
def copy_roster_week(source_period, target_week_start, user, include_assignments=True, overwrite=False):
    """
    Copies all shifts, slots, and (optionally) assignments from source_period into a target week.
    - target_week_start must be a Monday.
    - Status of target period is ALWAYS DRAFT, with copied_from set to source_period.
    - Preserves pharmacy isolation: user must be authorized manager for source_period.pharmacy.
    - Target cannot be an already published roster period.
    - Duplicate protection: raises ValidationError if target week has shifts unless overwrite=True.
    """
    if not is_authorized_attendance_manager(user, source_period.pharmacy):
        raise ValidationError("User is not authorized to copy rosters for this pharmacy.")

    target_week_start = _parse_date(target_week_start)
    if target_week_start.weekday() != 0:
        raise ValidationError("target_week_start must be a Monday.")

    if target_week_start == source_period.week_start:
        raise ValidationError("Cannot copy a roster period onto its own week.")

    target_period, created = RosterPeriod.objects.get_or_create(
        pharmacy=source_period.pharmacy,
        week_start=target_week_start,
        defaults={
            "created_by": user,
            "status": RosterPeriod.Status.DRAFT,
            "copied_from": source_period,
        },
    )

    target_period = RosterPeriod.objects.select_for_update().get(pk=target_period.pk)
    if target_period.status != RosterPeriod.Status.DRAFT:
        raise ValidationError("Cannot copy into an already published roster period.")

    if not overwrite:
        if get_roster_period_assignments(target_period).exists() or target_period.planned_slots.exists():
            raise ValidationError("Target roster period already has shifts. Set overwrite=True to replace them.")

    delta = target_week_start - source_period.week_start

    with transaction.atomic():
        if overwrite:
            _clear_target_week_shifts(
                source_period.pharmacy,
                target_period.week_start,
                target_period.week_end,
            )

        target_period.copied_from = source_period
        target_period.status = RosterPeriod.Status.DRAFT
        target_period.save(update_fields=["copied_from", "status"])

        source_slots = _roster_occurrences(source_period)

        shifts_copied = 0
        slots_copied = 0
        assignments_copied = 0

        for slot in source_slots:
            # Skip marketplace shifts/slots that have no rostered assignments
            rostered_assignments = list(slot.assignments.filter(slot_date=slot.date, is_rostered=True))
            if slot.shift.visibility == 'PLATFORM' and not rostered_assignments:
                continue
            if slot.assignments.filter(slot_date=slot.date, is_rostered=False).exists() and not rostered_assignments:
                continue

            new_date = slot.date + delta
            new_shift = Shift.objects.create(
                pharmacy=source_period.pharmacy,
                role_needed=slot.shift.role_needed,
                employment_type=slot.shift.employment_type,
                is_roster_container=True,
                created_by=user,
                visibility="FULL_PART_TIME",
                rate_type=slot.shift.rate_type,
            )
            shifts_copied += 1

            new_slot = ShiftSlot.objects.create(
                shift=new_shift,
                date=new_date,
                roster_period=target_period,
                planned_break_minutes=slot.planned_break_minutes,
                start_time=slot.start_time,
                end_time=slot.end_time,
                rate=slot.rate,
            )
            slots_copied += 1

            if include_assignments:
                for assignment in rostered_assignments:
                    ShiftSlotAssignment.objects.create(
                        shift=new_shift,
                        slot=new_slot,
                        slot_date=new_date,
                        user=assignment.user,
                        unit_rate=assignment.unit_rate,
                        is_rostered=True,
                        **staff_assignment_defaults(
                            user=assignment.user,
                            pharmacy=source_period.pharmacy,
                            work_date=new_date,
                        ),
                    )
                    assignments_copied += 1

    _validate_and_price(target_period)
    return target_period, {
        "shifts_copied": shifts_copied,
        "slots_copied": slots_copied,
        "assignments_copied": assignments_copied,
    }
