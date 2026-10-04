"""Roster periods: creating a week's period, its assignments, the manager grid and pre-publish validation."""
from datetime import date, datetime, timedelta
from django.core.exceptions import ValidationError
from django.db.models import Q
from shifts.models import Shift, ShiftSlotAssignment
from memberships.models import Membership
from workforce.models import RosterPeriod


def get_or_create_roster_period(pharmacy, week_start, user=None):
    """
    Retrieves or creates a RosterPeriod for a pharmacy starting on week_start.
    week_start must be a Monday (weekday() == 0).
    """
    if isinstance(week_start, str):
        week_start = date.fromisoformat(week_start)

    if week_start.weekday() != 0:
        raise ValidationError("week_start must be a Monday.")

    period, created = RosterPeriod.objects.get_or_create(
        pharmacy=pharmacy,
        week_start=week_start,
        defaults={"created_by": user, "status": RosterPeriod.Status.DRAFT},
    )
    return period, created


def get_roster_period_assignments(roster_period):
    """
    Returns all ShiftSlotAssignment rows whose slot date falls within the
    RosterPeriod week [week_start, week_end] for the given pharmacy.
    CRITICAL: Only assignments explicitly marked is_rostered=True are returned.
    Marketplace / open assignments (is_rostered=False) are strictly excluded.
    """
    week_start = roster_period.week_start
    week_end = roster_period.week_end

    return (
        ShiftSlotAssignment.objects.filter(
            shift__pharmacy=roster_period.pharmacy,
            slot_date__gte=week_start,
            slot_date__lte=week_end,
            is_rostered=True,
        )
        .select_related("user", "slot", "shift", "shift__pharmacy")
        .order_by("slot_date", "slot__start_time")
    )


def get_roster_period_grid(pharmacy, week_start, week_end):
    """
    Computes structured grid views for a roster week:
    - assignments: All assigned shifts in the period explicitly marked is_rostered=True.
    - vacant_slots: Unassigned slots in the period (a marketplace booking, is_rostered=False, occupies its slot too).
    - staff_view: Grouped by worker with total hours, shift count, and daily assignments.
    - stacked_view: Grouped by date with chronological coverage bands.
    """
    assignments_qs = (
        ShiftSlotAssignment.objects.filter(
            shift__pharmacy=pharmacy,
            slot_date__gte=week_start,
            slot_date__lte=week_end,
            is_rostered=True,
        )
        .select_related("user", "slot", "shift", "shift__pharmacy")
        .order_by("slot_date", "slot__start_time")
    )
    assignments_list = list(assignments_qs)

    occupied = set(
        ShiftSlotAssignment.objects.filter(
            shift__pharmacy=pharmacy,
            slot_date__gte=week_start,
            slot_date__lte=week_end,
        ).values_list("slot_id", "slot_date")
    )
    vacant_list = []
    from copy import copy
    from shifts.pricing import expand_shift_slots
    candidate_shifts = Shift.objects.filter(pharmacy=pharmacy, slots__date__lte=week_end).filter(
        Q(slots__date__gte=week_start) | Q(slots__is_recurring=True, slots__recurring_end_date__gte=week_start)
    ).distinct().prefetch_related("slots")
    for shift in candidate_shifts:
        for occurrence in expand_shift_slots(shift):
            slot_date = occurrence["date"]
            slot = occurrence["slot"]
            if week_start <= slot_date <= week_end and (slot.pk, slot_date) not in occupied:
                item = copy(slot)
                item.date = slot_date
                vacant_list.append(item)
    vacant_list.sort(key=lambda item: (item.date, item.start_time, item.pk))

    assignments_data = [
        {
            "id": a.id,
            "slot_id": a.slot_id,
            "shift_id": a.shift_id,
            "worker_id": a.user_id,
            "worker_name": a.user.get_full_name() or a.user.username,
            "worker_role": getattr(a.user, "role", ""),
            "date": str(a.slot_date),
            "start_time": str(a.slot.start_time),
            "end_time": str(a.slot.end_time),
            "role_needed": a.shift.role_needed,
            "is_rostered": a.is_rostered,
            "editable": a.is_rostered,
            "planned_break_minutes": a.slot.planned_break_minutes,
        }
        for a in assignments_list
    ]

    vacant_data = [
        {
            "slot_id": s.id,
            "shift_id": s.shift_id,
            "date": str(s.date),
            "start_time": str(s.start_time),
            "end_time": str(s.end_time),
            "role_needed": s.shift.role_needed,
            "editable": s.roster_period_id is not None,
            "planned_break_minutes": s.planned_break_minutes,
        }
        for s in vacant_list
    ]

    workers_map = {
        m.user_id: {"worker_id": m.user_id, "worker_name": m.user.get_full_name() or m.user.username,
                    "role": m.role, "total_shifts": 0, "total_hours": 0.0, "shifts": []}
        for m in Membership.objects.filter(pharmacy=pharmacy, status=Membership.Status.ACCEPTED,
                                            is_active=True, user__is_active=True).exclude(role="CONTACT").select_related("user")
    }
    for a in assignments_list:
        uid = a.user_id
        if uid not in workers_map:
            workers_map[uid] = {
                "worker_id": uid,
                "worker_name": a.user.get_full_name() or a.user.username,
                "role": getattr(a.user, "role", ""),
                "total_shifts": 0,
                "total_hours": 0.0,
                "shifts": [],
            }
        st = datetime.combine(a.slot_date, a.slot.start_time)
        et = datetime.combine(a.slot_date, a.slot.end_time)
        if et <= st:
            et += timedelta(days=1)
        hours = round((et - st).total_seconds() / 3600.0, 2)

        workers_map[uid]["total_shifts"] += 1
        workers_map[uid]["total_hours"] = round(workers_map[uid]["total_hours"] + hours, 2)
        workers_map[uid]["shifts"].append({
            "assignment_id": a.id,
            "slot_id": a.slot_id,
            "date": str(a.slot_date),
            "start_time": str(a.slot.start_time),
            "end_time": str(a.slot.end_time),
            "hours": hours,
            "editable": a.is_rostered and not a.slot.is_recurring,
            "planned_break_minutes": a.slot.planned_break_minutes,
            "role": a.shift.role_needed,
        })

    staff_view = sorted(
        workers_map.values(),
        key=lambda w: (-w["total_shifts"], -w["total_hours"], w["worker_name"], w["worker_id"]),
    )

    days_map = {}
    curr = week_start
    while curr <= week_end:
        days_map[str(curr)] = {
            "date": str(curr),
            "total_shifts": 0,
            "vacant_count": 0,
            "shifts": [],
        }
        curr += timedelta(days=1)

    for a in assignments_list:
        d_str = str(a.slot_date)
        if d_str in days_map:
            days_map[d_str]["total_shifts"] += 1
            days_map[d_str]["shifts"].append({
                "type": "ASSIGNED",
                "slot_id": a.slot_id,
                "editable": a.is_rostered and not a.slot.is_recurring,
                "planned_break_minutes": a.slot.planned_break_minutes,
                "assignment_id": a.id,
                "worker_id": a.user_id,
                "worker_name": a.user.get_full_name() or a.user.username,
                "start_time": str(a.slot.start_time),
                "end_time": str(a.slot.end_time),
                "role": a.shift.role_needed,
            })

    for s in vacant_list:
        d_str = str(s.date)
        if d_str in days_map:
            days_map[d_str]["vacant_count"] += 1
            days_map[d_str]["shifts"].append({
                "type": "VACANT",
                "editable": s.roster_period_id is not None and not s.is_recurring,
                "planned_break_minutes": s.planned_break_minutes,
                "slot_id": s.id,
                "start_time": str(s.start_time),
                "end_time": str(s.end_time),
                "role": s.shift.role_needed,
            })

    for d_data in days_map.values():
        d_data["shifts"].sort(key=lambda x: x["start_time"])

    stacked_view = list(days_map.values())

    return {
        "assignments": assignments_data,
        "vacant_slots": vacant_data,
        "staff_view": staff_view,
        "stacked_view": stacked_view,
    }


def validate_roster_period(roster_period):
    from workforce.roster.validation import worker_issues
    assignments = list(get_roster_period_assignments(roster_period))
    errors, warnings = [], []
    for assignment in assignments:
        found_errors, found_warnings = worker_issues(
            assignment.shift.pharmacy, assignment.user, assignment.slot_date or assignment.slot.date,
            assignment.slot.start_time, assignment.slot.end_time, assignment.shift.role_needed,
            exclude_assignment_id=assignment.pk,
        )
        errors.extend(dict(item, assignment_id=assignment.pk) for item in found_errors)
        warnings.extend(dict(item, assignment_id=assignment.pk) for item in found_warnings)
    return {"is_valid": not errors, "errors": errors, "warnings": warnings,
            "total_assignments": len(assignments), "total_workers": len({a.user_id for a in assignments})}
