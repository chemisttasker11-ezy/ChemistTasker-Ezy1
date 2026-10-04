"""Guards and parsing shared by the roster edit operations (copy week, templates, bulk edit): time and date
parsing, protecting assignment history and marketplace slots, and removing emptied shifts."""
from datetime import date, time
from django.core.exceptions import ValidationError
from shifts.models import LeaveRequest


def _parse_time(val):
    if isinstance(val, time):
        return val
    if isinstance(val, str):
        parts = val.strip().split(":")
        if len(parts) == 2:
            return time(int(parts[0]), int(parts[1]))
        elif len(parts) == 3:
            return time(int(parts[0]), int(parts[1]), int(float(parts[2])))
    raise ValidationError(f"Invalid time format: {val}")


def _parse_date(val):
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        return date.fromisoformat(val.strip())
    raise ValidationError(f"Invalid date format: {val}")


def _protect_assignment_history(assignment):
    from attendance.models import AttendanceSession, ProvisionalAttendance
    if (LeaveRequest.objects.filter(slot_assignment=assignment).exists()
            or AttendanceSession.objects.filter(assignment=assignment).exists()
            or ProvisionalAttendance.objects.filter(backfill_assignment=assignment).exists()):
        raise ValidationError("Cannot remove an assignment with leave or attendance history.")


def _delete_empty_shift(shift):
    # Preserve offers, invoices and every other existing relation to the shift.
    for relation in shift._meta.related_objects:
        if not relation.many_to_many and relation.related_model.objects.filter(**{relation.field.name: shift}).exists():
            return
    shift.delete()


def _protect_marketplace_slot(slot, operation_index, roster_period):
    """Do not let roster operations change existing marketplace bookings."""
    if slot.shift.pharmacy_id != roster_period.pharmacy_id:
        raise ValidationError(f"Operation {operation_index}: Slot belongs to a different pharmacy.")
    if slot.is_recurring:
        raise ValidationError(f"Operation {operation_index}: Edit recurring shifts through the existing occurrence-aware workflow.")
    if slot.assignments.filter(is_rostered=False).exists() or (
        slot.roster_period_id != roster_period.pk and not slot.assignments.filter(is_rostered=True).exists()
    ):
        raise ValidationError(f"Operation {operation_index}: Cannot modify marketplace or unowned slot {slot.pk}.")
    if slot.roster_period_id and slot.roster_period_id != roster_period.pk:
        raise ValidationError(f"Operation {operation_index}: Slot belongs to a different roster period.")
    if slot.shift.pharmacy_id != roster_period.pharmacy_id or not roster_period.week_start <= slot.date <= roster_period.week_end:
        raise ValidationError(f"Operation {operation_index}: Slot is outside this roster period.")
    # Adopt a legacy rostered slot before its final assignment is removed.
    if not slot.roster_period_id:
        slot.roster_period = roster_period
        slot.save(update_fields=["roster_period"])
