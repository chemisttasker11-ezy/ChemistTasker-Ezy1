"""In-place roster editing: never use marketplace slot-collection replacement.

The selected existing slots are the complete mutation scope, not the complete
new contents of Shift.slots. Accepted terms survive unchanged-worker edits.
"""
from collections import defaultdict

from django.core.exceptions import ValidationError

from shifts.engagement import staff_assignment_defaults
from shifts.models import ShiftSlotAssignment
from shifts.pricing import get_locked_rate_for_slot
from workforce.models import RosterPeriod, Timesheet, TimesheetPeriod
from workforce.roster.edit_guards import _protect_assignment_history
from workforce.roster.revisions import bump_roster_revision
from workforce.roster.slot_locking import locked_roster_slots, week_start
from workforce.roster.validation import worker_issues


UNSET = object()


def has_roster_ownership(shift):
    return (
        shift.is_roster_container
        or shift.slots.filter(roster_period__isnull=False).exists()
        or shift.slot_assignments.filter(is_rostered=True).exists()
    )


def _period_for_date(periods, pharmacy_id, day):
    return next((period for period in periods.values()
                 if period.pharmacy_id == pharmacy_id and period.week_start == week_start(day)), None)


def _require_editable(slot, periods):
    explicit = periods.get(slot.roster_period_id)
    dated = _period_for_date(periods, slot.shift.pharmacy_id, slot.date)
    for period in (explicit, dated):
        if period and period.pharmacy_id != slot.shift.pharmacy_id:
            raise ValidationError("Slot and roster period belong to different pharmacies.")
        if period and period.status == RosterPeriod.Status.ARCHIVED:
            raise ValidationError("Archived roster slots cannot be edited.")
        if period and period.status == RosterPeriod.Status.PUBLISHED and slot.unpublished_at is None:
            raise ValidationError("Unpublish this shift for editing before changing its roster slot.")
    if slot.is_recurring:
        raise ValidationError("Recurring roster slots require the recurring-series workflow, not a single-slot edit.")


def _validate_assignment(shift, slot, assignment, worker):
    errors, _warnings = worker_issues(
        shift.pharmacy, worker, slot.date, slot.start_time, slot.end_time,
        shift.role_needed, exclude_assignment_id=assignment.pk if assignment else None,
    )
    if errors:
        raise ValidationError({"slots": [issue["message"] for issue in errors]})


def _replace_worker(shift, slot, assignment, worker):
    if assignment:
        _protect_assignment_history(assignment)
    defaults = staff_assignment_defaults(user=worker, pharmacy=shift.pharmacy, work_date=slot.date)
    rate, reason = get_locked_rate_for_slot(slot=slot, shift=shift, user=worker, override_date=slot.date,
                                         staff_terms=defaults['engagement_terms_snapshot'])
    if assignment is None:
        assignment = ShiftSlotAssignment(shift=shift, slot=slot, slot_date=slot.date, user=worker, is_rostered=True)
    else:
        assignment.user = worker
        assignment.slot_date = slot.date
    assignment.unit_rate = rate
    assignment.rate_reason = reason
    for field, value in defaults.items():
        setattr(assignment, field, value)
    assignment.save()
    return assignment


def edit_roster_slots(shift, user, command):
    """Apply a validated RosterSlotEditCommand atomically and return the shift.

    No slot or unchanged-worker assignment is deleted/recreated. Editing is
    silent: the existing explicit republish command owns notification choice.
    """
    edits = {item["id"]: {key: value for key, value in item.items() if key != "id"}
             for item in command["slots"]}
    targets = {pk: data.get("date") for pk, data in edits.items()}
    requested_worker = command.get("user_id", UNSET)
    extra_workers = () if requested_worker is UNSET or requested_worker is None else (requested_worker,)

    with locked_roster_slots(shift.pk, user, target_dates=targets, extra_worker_ids=extra_workers) as graph:
        shift, slots, assignments, periods, workers = graph
        if not has_roster_ownership(shift):
            raise ValidationError("This is not a roster-owned shift.")
        if extra_workers and requested_worker not in workers:
            raise ValidationError({"user_id": "Select an existing eligible pharmacy worker."})
        by_slot = defaultdict(list)
        for assignment in assignments:
            by_slot[assignment.slot_id].append(assignment)
        role = command.get("role_needed", shift.role_needed)
        role_changed = role != shift.role_needed
        if role_changed and set(edits) != set(slots):
            raise ValidationError({"role_needed": "A shift-wide role change must include every affected slot."})

        old_assignment_context = [(a.user_id, a.slot_date or a.slot.date) for a in assignments if a.slot_id in edits]
        affected_period_ids = set()
        changed_slots = set()
        for pk in sorted(edits):
            slot = slots[pk]
            _require_editable(slot, periods)
            attached = by_slot[pk]
            if len(attached) > 1 or any(not a.is_rostered or a.source_offer_id for a in attached):
                raise ValidationError("This slot has recurring or marketplace assignments; use its existing assignment workflow.")
            if slot.roster_period_id is None and not attached and not shift.is_roster_container:
                raise ValidationError("This vacant slot has no roster ownership.")
            old_period = periods.get(slot.roster_period_id) or _period_for_date(periods, shift.pharmacy_id, slot.date)
            if old_period:
                affected_period_ids.add(old_period.pk)
            proposed_date = edits[pk].get("date", slot.date)
            destination = _period_for_date(periods, shift.pharmacy_id, proposed_date)
            if week_start(proposed_date) != week_start(slot.date):
                if destination is None:
                    raise ValidationError({"slots": "Create the destination roster week before moving this slot."})
                if destination.status == RosterPeriod.Status.ARCHIVED:
                    raise ValidationError("A slot cannot be moved into an archived roster.")
                if destination.status == RosterPeriod.Status.PUBLISHED and slot.unpublished_at is None:
                    raise ValidationError("Only an individually unpublished slot can be moved into a published week.")
            if proposed_date != slot.date:
                for assignment in attached:
                    _protect_assignment_history(assignment)
            if destination:
                affected_period_ids.add(destination.pk)
            changed_fields = [field for field, value in edits[pk].items() if getattr(slot, field) != value]
            for field in changed_fields:
                setattr(slot, field, edits[pk][field])
            # Keep explicit ownership aligned even after a legacy unlinked slot is edited.
            if destination and slot.roster_period_id != destination.pk:
                slot.roster_period = destination
                changed_fields.append("roster_period")
            if slot.start_time == slot.end_time:
                raise ValidationError({"slots": "Start and end time must differ."})
            if changed_fields:
                slot.save(update_fields=changed_fields)
                changed_slots.add(pk)

        if role_changed:
            # All sibling slots were included and passed publication checks above.
            shift.role_needed = role
            shift.save(update_fields=["role_needed"])

        resulting_assignments = []
        for pk in sorted(edits):
            slot = slots[pk]
            attached = by_slot[pk]
            assignment = attached[0] if attached else None
            current_worker = assignment.user_id if assignment else None
            target_worker = current_worker if requested_worker is UNSET else requested_worker
            if target_worker != current_worker or (role_changed and assignment):
                if target_worker is None:
                    if assignment:
                        _protect_assignment_history(assignment)
                        assignment.delete()
                    assignment = None
                else:
                    assignment = _replace_worker(shift, slot, assignment, workers[target_worker])
            elif assignment and (pk in changed_slots or assignment.slot_date != slot.date):
                # Save the same row, including for a time-only edit, so the existing
                # workforce invalidation signal runs without resetting contract terms.
                assignment.slot_date = slot.date
                assignment.save(update_fields=["slot_date"])
            if assignment:
                resulting_assignments.append((slot, assignment))

        # Validate after every requested slot is staged, so multi-slot edits are
        # checked against the final shape, not an intermediate old sibling state.
        for slot, assignment in resulting_assignments:
            _validate_assignment(shift, slot, assignment, workers[assignment.user_id])
        for period_id in sorted(affected_period_ids):
            bump_roster_revision(period_id)
        # Assignment signals cover the new dates. A move also invalidates the old
        # date's existing timesheet; never rewrite a locked payroll manifest.
        for worker_id, old_date in old_assignment_context:
            old_periods = TimesheetPeriod.objects.filter(
                pharmacy_id=shift.pharmacy_id, start_date__lte=old_date, end_date__gte=old_date,
            ).exclude(status=TimesheetPeriod.Status.LOCKED)
            Timesheet.objects.filter(period__in=old_periods, user_id=worker_id).update(needs_rebuild=True)
        return shift
