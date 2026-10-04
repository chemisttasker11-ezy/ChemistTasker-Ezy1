"""Bulk editing a roster period."""
from django.core.exceptions import ValidationError
from django.db import transaction
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod
from workforce.roster.permissions import is_authorized_attendance_manager
from shifts.engagement import staff_assignment_defaults
from workforce.roster.assignment_rates import _validate_and_price
from workforce.roster.edit_guards import _delete_empty_shift, _parse_date, _parse_time, _protect_assignment_history, _protect_marketplace_slot
from workforce.roster.periods import get_roster_period_assignments
from django.contrib.auth import get_user_model

User = get_user_model()


def bulk_edit_roster_period(roster_period, operations, user):
    """
    Executes a batch of roster operations atomically within transaction.atomic().
    Deliberate all-or-nothing behavior: if ANY operation fails validation,
    the entire transaction is rolled back and an error with the operation index is raised.

    Supported actions:
    - "create_shift": {"action": "create_shift", "date": "YYYY-MM-DD", "start_time": "HH:MM", "end_time": "HH:MM", "role": str, "user_id": Optional[int]}
    - "assign_worker": {"action": "assign_worker", "slot_id": int, "user_id": int}
    - "unassign_worker": {"action": "unassign_worker", "assignment_id": int}
    - "delete_slot": {"action": "delete_slot", "slot_id": int}
    - "update_slot_times": {"action": "update_slot_times", "slot_id": int, "start_time": "HH:MM", "end_time": "HH:MM"}
    """
    if not is_authorized_attendance_manager(user, roster_period.pharmacy):
        raise ValidationError("User is not authorized to edit rosters for this pharmacy.")

    if roster_period.pk:
        roster_period.refresh_from_db()

    if roster_period.status == RosterPeriod.Status.PUBLISHED:
        raise ValidationError("Cannot perform bulk edits on a published roster period. Unpublish first.")

    if not isinstance(operations, list) or len(operations) == 0:
        raise ValidationError("operations must be a non-empty list.")

    valid_roles = {choice[0] for choice in Shift.ROLE_CHOICES}
    summary = {
        "created": 0,
        "assigned": 0,
        "unassigned": 0,
        "deleted": 0,
        "updated": 0,
    }

    with transaction.atomic():
        # Share the publication lock so a concurrent publish cannot race edits.
        roster_period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)
        if roster_period.status != RosterPeriod.Status.DRAFT:
            raise ValidationError("Cannot perform bulk edits on a non-draft roster period.")

        worker_ids = set(get_roster_period_assignments(roster_period).values_list("user_id", flat=True))
        for op in operations:
            if isinstance(op, dict):
                for key in ("user_id", "target_user_id"):
                    if op.get(key):
                        try:
                            worker_ids.add(int(op[key]))
                        except (TypeError, ValueError):
                            raise ValidationError("Worker ID must be an integer.")
        list(User.objects.select_for_update().filter(pk__in=worker_ids).order_by("pk"))

        changed_slots = set()
        for idx, op in enumerate(operations):
            if not isinstance(op, dict):
                raise ValidationError(f"Operation {idx}: must be an object.")

            action = op.get("action")
            if not action:
                raise ValidationError(f"Operation {idx}: missing 'action'.")

            if action in {"assign_worker", "delete_slot", "update_slot_times", "move_shift"}:
                protected_slot = ShiftSlot.objects.select_for_update().filter(pk=op.get("slot_id")).first()
                if protected_slot:
                    _protect_marketplace_slot(protected_slot, idx, roster_period)

            if action == "create_shift":
                shift_date = _parse_date(op.get("date"))
                if not (roster_period.week_start <= shift_date <= roster_period.week_end):
                    raise ValidationError(
                        f"Operation {idx}: shift date {shift_date} is outside roster period "
                        f"[{roster_period.week_start}, {roster_period.week_end}]."
                    )

                role = op.get("role")
                if not role or role not in valid_roles:
                    raise ValidationError(f"Operation {idx}: invalid role '{role}'.")

                st = _parse_time(op.get("start_time"))
                et = _parse_time(op.get("end_time"))
                if st == et:
                    raise ValidationError(f"Operation {idx}: start_time and end_time must differ.")

                new_shift = Shift.objects.create(
                    pharmacy=roster_period.pharmacy,
                    role_needed=role,
                    is_roster_container=True,
                    visibility="FULL_PART_TIME",
                    created_by=user,
                )
                new_slot = ShiftSlot.objects.create(
                    shift=new_shift,
                    date=shift_date,
                    roster_period=roster_period,
                    planned_break_minutes=op.get("planned_break_minutes", 0),
                    start_time=st,
                    end_time=et,
                )

                user_id = op.get("user_id")
                if user_id:
                    worker = User.objects.filter(pk=user_id).first()
                    if not worker:
                        raise ValidationError(f"Operation {idx}: user {user_id} does not exist.")
                    ShiftSlotAssignment.objects.create(
                        shift=new_shift,
                        slot=new_slot,
                        slot_date=shift_date,
                        user=worker,
                        is_rostered=True,
                        **staff_assignment_defaults(
                            user=worker,
                            pharmacy=roster_period.pharmacy,
                            work_date=shift_date,
                        ),
                    )
                changed_slots.add(new_slot.pk)
                summary["created"] += 1

            elif action == "assign_worker":
                slot_id = op.get("slot_id")
                slot = ShiftSlot.objects.filter(pk=slot_id).select_related("shift").first()
                if not slot:
                    raise ValidationError(f"Operation {idx}: Slot {slot_id} not found.")

                if slot.shift.pharmacy_id != roster_period.pharmacy_id:
                    raise ValidationError(f"Operation {idx}: Slot belongs to a different pharmacy.")

                if not (roster_period.week_start <= slot.date <= roster_period.week_end):
                    raise ValidationError(f"Operation {idx}: Slot date is outside this roster period.")

                user_id = op.get("user_id")
                worker = User.objects.filter(pk=user_id).first()
                if not worker:
                    raise ValidationError(f"Operation {idx}: User {user_id} not found.")

                assignment_defaults = staff_assignment_defaults(
                    user=worker,
                    pharmacy=roster_period.pharmacy,
                    work_date=slot.date,
                )
                ShiftSlotAssignment.objects.update_or_create(
                    slot=slot,
                    slot_date=slot.date,
                    defaults={
                        "shift": slot.shift,
                        "user": worker,
                        "is_rostered": True,
                        **assignment_defaults,
                    },
                )
                changed_slots.add(slot.pk)
                summary["assigned"] += 1

            elif action == "unassign_worker":
                assignment_id = op.get("assignment_id")
                assignment = ShiftSlotAssignment.objects.filter(pk=assignment_id).select_related("shift").first()
                if not assignment:
                    raise ValidationError(f"Operation {idx}: Assignment {assignment_id} not found.")

                if not assignment.is_rostered:
                    raise ValidationError(f"Operation {idx}: Cannot unassign non-rostered marketplace assignment {assignment_id}.")

                if assignment.shift.pharmacy_id != roster_period.pharmacy_id:
                    raise ValidationError(f"Operation {idx}: Assignment belongs to a different pharmacy.")

                if not (roster_period.week_start <= assignment.slot_date <= roster_period.week_end):
                    raise ValidationError(f"Operation {idx}: Assignment date is outside this roster period.")

                _protect_marketplace_slot(assignment.slot, idx, roster_period)
                _protect_assignment_history(assignment)
                assignment.delete()
                summary["unassigned"] += 1

            elif action == "delete_slot":
                slot_id = op.get("slot_id")
                slot = ShiftSlot.objects.filter(pk=slot_id).select_related("shift").first()
                if not slot:
                    raise ValidationError(f"Operation {idx}: Slot {slot_id} not found.")


                if slot.shift.pharmacy_id != roster_period.pharmacy_id:
                    raise ValidationError(f"Operation {idx}: Slot belongs to a different pharmacy.")

                if not (roster_period.week_start <= slot.date <= roster_period.week_end):
                    raise ValidationError(f"Operation {idx}: Slot date is outside this roster period.")

                shift = slot.shift
                for assignment in slot.assignments.all():
                    _protect_assignment_history(assignment)
                if ShiftOffer.objects.filter(shift=shift).exists():
                    raise ValidationError("Cannot delete a shift with marketplace offers.")
                slot.delete()
                _delete_empty_shift(shift)
                summary["deleted"] += 1

            elif action == "update_slot_times":
                slot_id = op.get("slot_id")
                slot = ShiftSlot.objects.filter(pk=slot_id).select_related("shift").first()
                if not slot:
                    raise ValidationError(f"Operation {idx}: Slot {slot_id} not found.")

                if slot.shift.pharmacy_id != roster_period.pharmacy_id:
                    raise ValidationError(f"Operation {idx}: Slot belongs to a different pharmacy.")

                if not (roster_period.week_start <= slot.date <= roster_period.week_end):
                    raise ValidationError(f"Operation {idx}: Slot date is outside this roster period.")

                st = _parse_time(op.get("start_time"))
                et = _parse_time(op.get("end_time"))
                if st == et:
                    raise ValidationError(f"Operation {idx}: start_time and end_time must differ.")

                slot.start_time = st
                slot.end_time = et
                if "planned_break_minutes" in op:
                    slot.planned_break_minutes = op["planned_break_minutes"]
                slot.save(update_fields=["start_time", "end_time", "planned_break_minutes"])
                changed_slots.add(slot.pk)
                summary["updated"] += 1

            elif action == "move_shift":
                slot_id = op.get("slot_id")
                slot = ShiftSlot.objects.filter(pk=slot_id).select_related("shift").first()
                if not slot:
                    raise ValidationError(f"Operation {idx}: Slot {slot_id} not found.")

                if slot.shift.pharmacy_id != roster_period.pharmacy_id:
                    raise ValidationError(f"Operation {idx}: Slot belongs to a different pharmacy.")

                target_date_raw = op.get("target_date")
                if target_date_raw:
                    target_date = _parse_date(target_date_raw)
                    if not (roster_period.week_start <= target_date <= roster_period.week_end):
                        raise ValidationError(f"Operation {idx}: Target date {target_date} is outside this roster period.")

                    if target_date != slot.date:
                        slot.date = target_date
                        slot.save(update_fields=["date"])
                        slot.assignments.all().update(slot_date=target_date)
                else:
                    target_date = slot.date

                # Optionally reassign worker if target_user_id provided
                if "target_user_id" in op:
                    target_user_id = op.get("target_user_id")
                    if target_user_id is None or target_user_id == 0 or target_user_id == "":
                        for assignment in slot.assignments.filter(is_rostered=True):
                            _protect_assignment_history(assignment)
                        slot.assignments.filter(is_rostered=True).delete()
                    else:
                        worker = User.objects.filter(pk=target_user_id).first()
                        if not worker:
                            raise ValidationError(f"Operation {idx}: User {target_user_id} not found.")
                        assignment_defaults = staff_assignment_defaults(
                            user=worker,
                            pharmacy=roster_period.pharmacy,
                            work_date=target_date,
                        )
                        ShiftSlotAssignment.objects.update_or_create(
                            slot=slot,
                            defaults={
                                "shift": slot.shift,
                                "user": worker,
                                "slot_date": target_date,
                                "is_rostered": True,
                                **assignment_defaults,
                            },
                        )
                changed_slots.add(slot.pk)
                summary["updated"] += 1

            else:
                raise ValidationError(f"Operation {idx}: unknown action '{action}'.")

        _validate_and_price(roster_period, changed_slots)

    return summary
