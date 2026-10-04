"""Roster templates: validating, creating, saving a period as a template and applying one to a week."""
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db import transaction
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod, RosterTemplate
from workforce.roster.permissions import is_authorized_attendance_manager
from shifts.engagement import staff_assignment_defaults
from workforce.roster.assignment_rates import _validate_and_price
from workforce.roster.copying import _clear_target_week_shifts, _roster_occurrences
from workforce.roster.edit_guards import _parse_date, _parse_time
from workforce.roster.periods import get_roster_period_assignments
from django.contrib.auth import get_user_model

User = get_user_model()


def validate_roster_template_data(template_data):
    """
    Validates template JSON schema:
    [
        {"day_of_week": int(0..6), "start_time": "HH:MM", "end_time": "HH:MM", "role": str, "user_id": Optional[int]}
    ]
    """
    if not isinstance(template_data, list):
        raise ValidationError("template_data must be a list of slot objects.")

    valid_roles = {choice[0] for choice in Shift.ROLE_CHOICES}

    for idx, item in enumerate(template_data):
        if not isinstance(item, dict):
            raise ValidationError(f"Slot {idx}: entry must be an object.")

        day = item.get("day_of_week")
        if not isinstance(day, int) or not (0 <= day <= 6):
            raise ValidationError(f"Slot {idx}: day_of_week must be an integer between 0 (Monday) and 6 (Sunday).")

        st = item.get("start_time")
        et = item.get("end_time")
        if not st or not et:
            raise ValidationError(f"Slot {idx}: start_time and end_time are required.")

        parsed_st = _parse_time(st)
        parsed_et = _parse_time(et)
        if parsed_st == parsed_et:
            raise ValidationError(f"Slot {idx}: start_time and end_time must differ.")

        role = item.get("role")
        if not role or role not in valid_roles:
            raise ValidationError(f"Slot {idx}: role must be one of {sorted(list(valid_roles))}.")

        user_id = item.get("user_id")
        if user_id is not None:
            if not isinstance(user_id, int):
                raise ValidationError(f"Slot {idx}: user_id must be an integer or null.")
            if not User.objects.filter(pk=user_id).exists():
                raise ValidationError(f"Slot {idx}: user with ID {user_id} does not exist.")


def create_roster_template(pharmacy, name, template_data, user):
    """
    Creates a new RosterTemplate for a pharmacy after validation.
    """
    if not is_authorized_attendance_manager(user, pharmacy):
        raise ValidationError("User is not authorized to create templates for this pharmacy.")

    if not name or not str(name).strip():
        raise ValidationError("Template name cannot be empty.")

    validate_roster_template_data(template_data)

    return RosterTemplate.objects.create(
        pharmacy=pharmacy,
        name=str(name).strip(),
        template_data=template_data,
        created_by=user,
    )


def save_period_as_template(roster_period, name, user, include_users=True):
    """
    Converts an existing RosterPeriod's shifts and slots into a reusable RosterTemplate.
    """
    if not is_authorized_attendance_manager(user, roster_period.pharmacy):
        raise ValidationError("User is not authorized to create templates for this pharmacy.")

    if not name or not str(name).strip():
        raise ValidationError("Template name cannot be empty.")

    slots = _roster_occurrences(roster_period)

    template_data = []
    for slot in slots:
        day_of_week = (slot.date - roster_period.week_start).days
        item = {
            "day_of_week": day_of_week,
            "start_time": slot.start_time.strftime("%H:%M"),
            "end_time": slot.end_time.strftime("%H:%M"),
            "role": slot.shift.role_needed,
            "user_id": None,
            "planned_break_minutes": slot.planned_break_minutes,
        }
        if include_users:
            assignment = slot.assignments.filter(slot_date=slot.date, is_rostered=True).first()
            if assignment:
                item["user_id"] = assignment.user_id

        template_data.append(item)

    validate_roster_template_data(template_data)

    return RosterTemplate.objects.create(
        pharmacy=roster_period.pharmacy,
        name=str(name).strip(),
        template_data=template_data,
        created_by=user,
    )


@transaction.atomic
def apply_roster_template(pharmacy, template, target_week_start, user, include_assignments=True, overwrite=False):
    """
    Applies a RosterTemplate to create a draft RosterPeriod on target_week_start.
    Enforces cross-pharmacy isolation and prevents applying to published weeks.
    """
    if not is_authorized_attendance_manager(user, pharmacy):
        raise ValidationError("User is not authorized to apply templates for this pharmacy.")

    if template.pharmacy_id != pharmacy.id:
        raise ValidationError("Template belongs to a different pharmacy.")

    target_week_start = _parse_date(target_week_start)
    if target_week_start.weekday() != 0:
        raise ValidationError("target_week_start must be a Monday.")

    target_period, created = RosterPeriod.objects.get_or_create(
        pharmacy=pharmacy,
        week_start=target_week_start,
        defaults={
            "created_by": user,
            "status": RosterPeriod.Status.DRAFT,
        },
    )

    target_period = RosterPeriod.objects.select_for_update().get(pk=target_period.pk)
    if target_period.status != RosterPeriod.Status.DRAFT:
        raise ValidationError("Cannot apply template to an already published roster period.")

    if not overwrite:
        if get_roster_period_assignments(target_period).exists() or target_period.planned_slots.exists():
            raise ValidationError("Roster period already has shifts. Set overwrite=True to replace them.")

    with transaction.atomic():
        if overwrite:
            _clear_target_week_shifts(
                pharmacy,
                target_period.week_start,
                target_period.week_end,
            )

        slots_created = 0
        assignments_created = 0

        for item in template.template_data:
            entry_date = target_week_start + timedelta(days=item["day_of_week"])
            st = _parse_time(item["start_time"])
            et = _parse_time(item["end_time"])
            role = item["role"]

            new_shift = Shift.objects.create(
                pharmacy=pharmacy,
                role_needed=role,
                is_roster_container=True,
                visibility="FULL_PART_TIME",
                created_by=user,
            )
            new_slot = ShiftSlot.objects.create(
                shift=new_shift,
                date=entry_date,
                roster_period=target_period,
                planned_break_minutes=item.get("planned_break_minutes", 0),
                start_time=st,
                end_time=et,
            )
            slots_created += 1

            if include_assignments and item.get("user_id"):
                user_id = item["user_id"]
                worker = User.objects.filter(pk=user_id).first()
                if worker:
                    ShiftSlotAssignment.objects.create(
                        shift=new_shift,
                        slot=new_slot,
                        slot_date=entry_date,
                        user=worker,
                        is_rostered=True,
                        **staff_assignment_defaults(
                            user=worker,
                            pharmacy=pharmacy,
                            work_date=entry_date,
                        ),
                    )
                    assignments_created += 1

    _validate_and_price(target_period)
    return target_period, {
        "slots_created": slots_created,
        "assignments_created": assignments_created,
    }
