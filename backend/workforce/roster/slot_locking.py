"""Period-first locks for an existing shift's roster slot lifecycle.

Read the candidate graph, acquire periods and workers in deterministic order,
then lock the shift, its slots and assignments. Reject a changed graph rather
than continuing with a new worker/period for which no lock was acquired.
"""
from contextlib import contextmanager
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import OperationalError, transaction
from django.db.models import Q

from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from users.models import User
from workforce.models import RosterPeriod
from workforce.permissions import require_manage_pharmacy


SLOT_STATE_FIELDS = ("id", "shift_id", "date", "start_time", "end_time", "roster_period_id", "unpublished_at")
ASSIGNMENT_STATE_FIELDS = ("id", "slot_id", "user_id", "slot_date", "is_rostered")


def week_start(day):
    return day - timedelta(days=day.weekday())


def _changed_graph():
    raise ValidationError("The roster changed while acquiring locks. Refresh and retry the edit.")


def lock_roster_shifts(shift_ids):
    """Call inside the roster transaction, after its period and worker locks.

    A booking can hold Shift while its synchronous revision signal needs our
    period. Refuse that contention immediately so neither transaction deadlocks.
    """
    try:
        with transaction.atomic():
            return list(
                Shift.objects.select_for_update(nowait=True, of=("self",))
                .select_related("pharmacy").filter(pk__in=shift_ids).order_by("pk")
            )
    except OperationalError as exc:
        cause = exc.__cause__ or exc
        if (getattr(cause, "sqlstate", None) or getattr(cause, "pgcode", None)) != "55P03":
            raise
        raise ValidationError("A shift is being booked or edited. Refresh and retry the roster change.") from exc


@contextmanager
def locked_roster_slots(shift_id, user, *, target_dates=None, extra_worker_ids=()):
    """Yield (shift, slots, assignments, periods, workers) inside one transaction.

    target_dates maps selected IDs to proposed dates, or None when date is
    omitted. The omitted value is read from the locked slot, not an earlier
    service snapshot. Another shift's slot is never adopted or created.
    """
    target_dates = target_dates or {}
    with transaction.atomic():
        initial_shift = Shift.objects.only("pk", "pharmacy_id").filter(pk=shift_id).first()
        if initial_shift is None:
            _changed_graph()
        slot_query = ShiftSlot.objects.filter(shift_id=shift_id).order_by("pk")
        initial_slots = list(slot_query.values(*SLOT_STATE_FIELDS))
        if not set(target_dates).issubset({row["id"] for row in initial_slots}):
            raise ValidationError({"slots": "Every edited slot must belong to this shift."})
        assignment_query = ShiftSlotAssignment.objects.filter(shift_id=shift_id).order_by("pk")
        initial_assignments = list(assignment_query.values(*ASSIGNMENT_STATE_FIELDS))
        dates = {row["date"] for row in initial_slots} | {day for day in target_dates.values() if day is not None}
        explicit_period_ids = {row["roster_period_id"] for row in initial_slots if row["roster_period_id"]}
        period_query = Q(pk__in=explicit_period_ids) | Q(
            pharmacy_id=initial_shift.pharmacy_id,
            week_start__in={week_start(day) for day in dates},
        )
        periods = {
            period.pk: period for period in
            RosterPeriod.objects.select_for_update().filter(period_query).order_by("pk")
        }
        worker_ids = {row["user_id"] for row in initial_assignments} | set(extra_worker_ids)
        workers = {
            worker.pk: worker for worker in
            User.objects.select_for_update().filter(pk__in=worker_ids).order_by("pk")
        }
        shifts = lock_roster_shifts([shift_id])
        shift = shifts[0] if shifts else None
        if shift is None or shift.pharmacy_id != initial_shift.pharmacy_id:
            _changed_graph()
        require_manage_pharmacy(user, shift.pharmacy)
        slots = {slot.pk: slot for slot in slot_query.select_for_update(of=("self",))}
        locked_slot_state = [
            {field: getattr(slot, field) for field in SLOT_STATE_FIELDS}
            for slot in slots.values()
        ]
        if locked_slot_state != initial_slots:
            _changed_graph()
        assignments = list(assignment_query.select_for_update(of=("self",)))
        locked_assignment_state = [
            {field: getattr(assignment, field) for field in ASSIGNMENT_STATE_FIELDS}
            for assignment in assignments
        ]
        if locked_assignment_state != initial_assignments:
            _changed_graph()
        for slot in slots.values():
            slot.shift = shift
        for assignment in assignments:
            if assignment.slot_id not in slots:
                raise ValidationError("Assignment and slot ownership are inconsistent; repair the roster first.")
            assignment.shift = shift
            assignment.slot = slots[assignment.slot_id]
            assignment.user = workers[assignment.user_id]
        yield shift, slots, assignments, periods, workers
