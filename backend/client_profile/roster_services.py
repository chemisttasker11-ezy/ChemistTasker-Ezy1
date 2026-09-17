"""
Roster V2 Services: Periods, Draft/Publish Workflow, Pre-Publish Validation,
Worker Shift Visibility, Copy Week, Templates, and Bulk Operations.
"""

from datetime import date, datetime, time, timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone

from client_profile.models import (
    LeaveRequest,
    Membership,
    Pharmacy,
    RosterAcknowledgement,
    RosterPeriod,
    RosterPublicationAudit,
    RosterTemplate,
    Shift,
    ShiftSlot,
    ShiftOffer,
    ShiftSlotAssignment,
    UserAvailability,
)
from client_profile.attendance_approvals import is_authorized_attendance_manager

User = get_user_model()


def refresh_assignment_rate(assignment):
    from .services import get_locked_rate_for_slot
    assignment.unit_rate, assignment.rate_reason = get_locked_rate_for_slot(
        assignment.slot, assignment.shift, assignment.user,
        override_date=assignment.slot_date or assignment.slot.date,
    )
    assignment.save(update_fields=["unit_rate", "rate_reason"])


def _validate_and_price(roster_period, slot_ids=None):
    assignments = get_roster_period_assignments(roster_period)
    list(User.objects.select_for_update().filter(pk__in=assignments.values_list("user_id", flat=True)).order_by("pk"))
    validation = validate_roster_period(roster_period)
    if validation["errors"]:
        raise ValidationError([item["message"] for item in validation["errors"]])
    if slot_ids is not None:
        assignments = assignments.filter(slot_id__in=slot_ids)
    for assignment in assignments:
        refresh_assignment_rate(assignment)


def _notify_roster_publication(period_id, worker_ids, revision):
    from .notifications import notify_users
    period = RosterPeriod.objects.select_related("pharmacy").get(pk=period_id)
    for worker in User.objects.filter(pk__in=worker_ids):
        role_path = {"PHARMACIST": "pharmacist", "OTHER_STAFF": "otherstaff", "EXPLORER": "explorer"}.get(worker.role, "owner")
        notify_users([worker.pk], title="Roster published",
                     body=f"Your roster at {period.pharmacy.name} for {period.week_start} is ready for acknowledgement.",
                     action_url=f"/dashboard/{role_path}/roster",
                     payload={"roster_period_id": period.pk, "revision_number": revision,
                              "notification_kind": "roster_published"})


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
    - vacant_slots: Unassigned slots in the period.
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

    occupied = {(a.slot_id, a.slot_date or a.slot.date) for a in assignments_list}
    vacant_list = []
    from copy import copy
    from .services import expand_shift_slots
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
    from .roster_validation import worker_issues
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


def publish_roster_period(roster_period, published_by, force_warnings=False):
    """
    Atomically validates and publishes a roster period:
    - Verifies published_by is authorized manager for roster_period.pharmacy.
    - Locks RosterPeriod row using select_for_update.
    - Runs validation; blocks publication if errors exist.
    - Updates status to PUBLISHED, sets published_at and published_by.
    - Logs publication audit revision.
    - Marks all assigned slots is_rostered = True.
    """
    if not is_authorized_attendance_manager(published_by, roster_period.pharmacy):
        raise ValidationError("User is not authorized to publish roster for this pharmacy.")

    with transaction.atomic():
        period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)

        if period.status == RosterPeriod.Status.ARCHIVED:
            raise ValidationError("Cannot publish an archived roster period.")
        if period.status == RosterPeriod.Status.PUBLISHED:
            return period, validate_roster_period(period)

        worker_ids = get_roster_period_assignments(period).values_list("user_id", flat=True)
        list(User.objects.select_for_update().filter(pk__in=worker_ids).order_by("pk"))
        validation = validate_roster_period(period)
        if not validation["is_valid"]:
            error_msgs = [e["message"] for e in validation["errors"]]
            raise ValidationError(f"Cannot publish roster with blocking errors: {'; '.join(error_msgs)}")

        if validation["warnings"] and not force_warnings:
            warning_msgs = [w["message"] for w in validation["warnings"]]
            raise ValidationError(f"Roster has warnings: {'; '.join(warning_msgs)}")

        # Update period
        period.status = RosterPeriod.Status.PUBLISHED
        period.published_at = timezone.now()
        period.published_by = published_by
        period.save(update_fields=["status", "published_at", "published_by", "updated_at"])

        # Determine revision number
        last_audit = period.publication_audits.order_by("-revision_number").first()
        rev = (last_audit.revision_number + 1) if last_audit else 1

        # Audit publication
        RosterPublicationAudit.objects.create(
            roster_period=period,
            published_by=published_by,
            revision_number=rev,
            total_assignments=validation["total_assignments"],
            validation_snapshot=validation,
        )

        # Mark assignments as is_rostered
        assignments = get_roster_period_assignments(period)
        assignments.filter(is_rostered=False).update(is_rostered=True)

        worker_ids = list(assignments.values_list("user_id", flat=True).distinct())
        transaction.on_commit(lambda: _notify_roster_publication(period.pk, worker_ids, rev), robust=True)

        return period, validation


def unpublish_roster_period(roster_period, unpublished_by):
    """
    Reverts a published roster period to DRAFT.
    Draft shifts will immediately be hidden from worker views.
    """
    if not is_authorized_attendance_manager(unpublished_by, roster_period.pharmacy):
        raise ValidationError("User is not authorized to unpublish roster for this pharmacy.")

    with transaction.atomic():
        period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)
        if period.status == RosterPeriod.Status.ARCHIVED:
            raise ValidationError("Cannot unpublish an archived roster period.")
        period.status = RosterPeriod.Status.DRAFT
        period.save(update_fields=["status", "updated_at"])
        return period


def archive_roster_period(roster_period, user):
    if not is_authorized_attendance_manager(user, roster_period.pharmacy):
        raise ValidationError("User is not authorized to archive this roster.")
    with transaction.atomic():
        period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)
        if period.status == RosterPeriod.Status.DRAFT:
            raise ValidationError("Publish the roster before archiving it.")
        period.status = RosterPeriod.Status.ARCHIVED
        period.save(update_fields=["status", "updated_at"])
        return period


def get_worker_published_roster(user, start_date=None, end_date=None):
    """
    Retrieves published roster assignments for a worker.
    CRITICAL: DRAFT assignments are NEVER returned. Only shifts whose
    pharmacy's RosterPeriod for that week is in PUBLISHED status are returned.
    """
    qs = ShiftSlotAssignment.objects.filter(
        user=user,
        is_rostered=True,
    ).select_related("slot", "shift", "shift__pharmacy")

    if start_date:
        qs = qs.filter(slot_date__gte=start_date)
    if end_date:
        qs = qs.filter(slot_date__lte=end_date)

    assignments = list(qs.order_by("slot_date", "slot__start_time"))
    if not assignments:
        return []

    # Filter to only those whose pharmacy week is PUBLISHED
    published_assignments = []
    # Cache periods lookup
    period_cache = {}

    for a in assignments:
        if not a.slot_date:
            continue
        # Find Monday of that week
        monday = a.slot_date - timedelta(days=a.slot_date.weekday())
        key = (a.shift.pharmacy_id, monday)

        if key not in period_cache:
            period = RosterPeriod.objects.filter(
                pharmacy_id=a.shift.pharmacy_id,
                week_start=monday,
            ).first()
            period_cache[key] = period

        period = period_cache[key]
        if period and period.status in (RosterPeriod.Status.PUBLISHED, RosterPeriod.Status.ARCHIVED):
            published_assignments.append(a)

    return published_assignments


@transaction.atomic
def acknowledge_roster_period(roster_period, user, notes=""):
    """
    Worker records acknowledgement of their published shifts in a roster period.
    """
    roster_period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)
    if roster_period.status != RosterPeriod.Status.PUBLISHED:
        raise ValidationError("Cannot acknowledge an unpublished or draft roster period.")

    # Check that worker has at least one assignment in this period
    has_assignment = get_roster_period_assignments(roster_period).filter(user=user).exists()
    if not has_assignment:
        raise ValidationError("User has no assigned shifts in this roster period.")

    ack, _ = RosterAcknowledgement.objects.update_or_create(
        roster_period=roster_period,
        user=user,
        defaults={
            "acknowledged_at": timezone.now(),
            "notes": notes,
        },
    )
    return ack


def get_roster_acknowledgement_status(roster_period, manager_user):
    """
    Returns a manager summary of worker acknowledgements for a published period:
    total workers, acknowledged count, pending count, and worker breakdown.
    """
    if not is_authorized_attendance_manager(manager_user, roster_period.pharmacy):
        raise ValidationError("User is not authorized to view acknowledgements for this pharmacy.")

    roster_period.refresh_from_db()
    assignments = list(get_roster_period_assignments(roster_period))
    worker_map = {}
    for a in assignments:
        if a.user_id not in worker_map:
            worker_map[a.user_id] = {
                "id": a.user_id,
                "name": a.user.get_full_name() or a.user.username,
                "role": getattr(a.user, "role", ""),
                "shift_count": 0,
            }
        worker_map[a.user_id]["shift_count"] += 1

    ack_rows = (RosterAcknowledgement.objects.filter(roster_period=roster_period, acknowledged_at__gte=roster_period.published_at)
                if roster_period.published_at else RosterAcknowledgement.objects.none())
    acks = {
        ack.user_id: ack
        for ack in ack_rows
    }

    result_workers = []
    acknowledged_count = 0
    for worker_id, info in worker_map.items():
        is_ack = worker_id in acks
        if is_ack:
            acknowledged_count += 1
            ack_obj = acks[worker_id]
            info["is_acknowledged"] = True
            info["acknowledged_at"] = ack_obj.acknowledged_at
            info["notes"] = ack_obj.notes
        else:
            info["is_acknowledged"] = False
            info["acknowledged_at"] = None
            info["notes"] = ""
        result_workers.append(info)

    total_workers = len(worker_map)
    return {
        "period_id": roster_period.id,
        "week_start": str(roster_period.week_start),
        "status": roster_period.status,
        "total_workers": total_workers,
        "acknowledged_count": acknowledged_count,
        "pending_count": total_workers - acknowledged_count,
        "workers": result_workers,
    }


# ---------------------------------------------------------------------------
# Checkpoint 10: Roster Copy, Templates and Bulk Operations
# ---------------------------------------------------------------------------

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
    from .models import AttendanceSession, ProvisionalAttendance
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
                    )
                    assignments_copied += 1

    _validate_and_price(target_period)
    return target_period, {
        "shifts_copied": shifts_copied,
        "slots_copied": slots_copied,
        "assignments_copied": assignments_copied,
    }


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
                    )
                    assignments_created += 1

    _validate_and_price(target_period)
    return target_period, {
        "slots_created": slots_created,
        "assignments_created": assignments_created,
    }


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

                ShiftSlotAssignment.objects.update_or_create(
                    slot=slot,
                    slot_date=slot.date,
                    defaults={
                        "shift": slot.shift,
                        "user": worker,
                        "is_rostered": True,
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
                        ShiftSlotAssignment.objects.update_or_create(
                            slot=slot,
                            defaults={
                                "shift": slot.shift,
                                "user": worker,
                                "slot_date": target_date,
                                "is_rostered": True,
                            },
                        )
                changed_slots.add(slot.pk)
                summary["updated"] += 1

            else:
                raise ValidationError(f"Operation {idx}: unknown action '{action}'.")

        _validate_and_price(roster_period, changed_slots)

    return summary
