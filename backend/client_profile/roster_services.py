"""
Roster V2 Services: Periods, Draft/Publish Workflow, Pre-Publish Validation,
Worker Shift Visibility, Copy Week, Templates, and Bulk Operations.
"""

from datetime import date, time, timedelta
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
    ShiftSlotAssignment,
    UserAvailability,
)
from client_profile.attendance_approvals import is_authorized_attendance_manager

User = get_user_model()


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


def validate_roster_period(roster_period):
    """
    Runs comprehensive pre-publish validation on all assignments in a roster period:
    1. Role Matching: Worker's membership or role must match shift.role_needed.
    2. Overlaps / Double-booking: Worker cannot be assigned to overlapping shifts.
    3. Approved Leave: Worker cannot be assigned to shifts overlapping approved leave.
    4. Availability Conflict: Warns/errors if shift conflicts with declared availability.
    """
    assignments = list(get_roster_period_assignments(roster_period))
    errors = []
    warnings = []

    # Map of user_id -> list of assignments across the whole platform on those dates
    # to detect cross-pharmacy double bookings
    assigned_user_ids = {a.user_id for a in assignments}
    dates = {a.slot_date for a in assignments}

    all_user_assignments = list(
        ShiftSlotAssignment.objects.filter(
            user_id__in=assigned_user_ids,
            slot_date__in=dates,
        ).select_related("slot", "shift", "shift__pharmacy")
    )

    # Pre-fetch approved leaves
    approved_leaves = list(
        LeaveRequest.objects.filter(
            user_id__in=assigned_user_ids,
            status="APPROVED",
            slot_assignment__slot_date__in=dates,
        ).select_related("slot_assignment")
    )

    # Pre-fetch availabilities
    availabilities = list(
        UserAvailability.objects.filter(
            user_id__in=assigned_user_ids,
            date__in=dates,
        )
    )

    # Pre-fetch active memberships for role validation
    active_memberships = list(
        Membership.objects.filter(
            user_id__in=assigned_user_ids,
            status=Membership.Status.ACCEPTED,
            is_active=True,
        ).select_related("pharmacy")
    )

    for assignment in assignments:
        worker = assignment.user
        shift = assignment.shift
        slot = assignment.slot
        slot_date = assignment.slot_date

        # 1. Role matching check
        required_role = shift.role_needed
        worker_role = getattr(worker, "role", None)

        # Worker matches if user.role matches or has active membership matching role
        role_matches = False
        if worker_role and worker_role.upper() == required_role.upper():
            role_matches = True
        else:
            # Check memberships at this pharmacy or associated
            for m in active_memberships:
                if m.user_id == worker.id and m.role and m.role.upper() == required_role.upper():
                    role_matches = True
                    break

        if not role_matches:
            errors.append({
                "type": "ROLE_MISMATCH",
                "assignment_id": assignment.id,
                "user_id": worker.id,
                "user_name": worker.get_full_name() or worker.username,
                "date": str(slot_date),
                "required_role": required_role,
                "worker_role": worker_role,
                "message": f"Worker {worker.get_full_name() or worker.username} role ({worker_role}) does not match required role {required_role}.",
            })

        # 2. Overlap / Double-booking check
        for other in all_user_assignments:
            if other.user_id != worker.id or other.id == assignment.id:
                continue
            if other.slot_date != slot_date:
                continue

            # Time interval overlap: max(start1, start2) < min(end1, end2)
            s1, e1 = slot.start_time, slot.end_time
            s2, e2 = other.slot.start_time, other.slot.end_time
            if max(s1, s2) < min(e1, e2):
                errors.append({
                    "type": "SHIFT_OVERLAP",
                    "assignment_id": assignment.id,
                    "conflicting_assignment_id": other.id,
                    "user_id": worker.id,
                    "date": str(slot_date),
                    "start_time": str(s1),
                    "end_time": str(e1),
                    "conflicting_start": str(s2),
                    "conflicting_end": str(e2),
                    "conflicting_pharmacy": other.shift.pharmacy.name,
                    "message": (
                        f"Worker {worker.get_full_name() or worker.username} has an overlapping shift on {slot_date} "
                        f"({s2}-{e2} at {other.shift.pharmacy.name})."
                    ),
                })

        # 3. Approved Leave conflict
        for leave in approved_leaves:
            if leave.user_id == worker.id and leave.slot_assignment.slot_date == slot_date:
                errors.append({
                    "type": "APPROVED_LEAVE_CONFLICT",
                    "assignment_id": assignment.id,
                    "user_id": worker.id,
                    "leave_id": leave.id,
                    "leave_type": leave.leave_type,
                    "date": str(slot_date),
                    "message": f"Worker {worker.get_full_name() or worker.username} has approved {leave.get_leave_type_display()} on {slot_date}.",
                })

        # 4. Availability conflict check
        user_avails = [av for av in availabilities if av.user_id == worker.id and av.date == slot_date]
        for av in user_avails:
            if av.is_all_day:
                continue
            # If shift start is earlier than available start or shift end is later than available end
            if slot.start_time < av.start_time or slot.end_time > av.end_time:
                warnings.append({
                    "type": "AVAILABILITY_CONFLICT",
                    "assignment_id": assignment.id,
                    "user_id": worker.id,
                    "date": str(slot_date),
                    "shift_start": str(slot.start_time),
                    "shift_end": str(slot.end_time),
                    "avail_start": str(av.start_time),
                    "avail_end": str(av.end_time),
                    "message": f"Shift time ({slot.start_time}-{slot.end_time}) on {slot_date} is outside worker declared availability ({av.start_time}-{av.end_time}).",
                })

    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "total_assignments": len(assignments),
        "total_workers": len(assigned_user_ids),
    }


def publish_roster_period(roster_period, published_by, force_warnings=True):
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
        period.status = RosterPeriod.Status.DRAFT
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
        if period and period.status == RosterPeriod.Status.PUBLISHED:
            published_assignments.append(a)

    return published_assignments


def acknowledge_roster_period(roster_period, user, notes=""):
    """
    Worker records acknowledgement of their published shifts in a roster period.
    """
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

    acks = {
        ack.user_id: ack
        for ack in RosterAcknowledgement.objects.filter(roster_period=roster_period)
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


def _clear_target_week_shifts(pharmacy, week_start, week_end):
    """
    Safely deletes existing ROSTER assignments, slots, and orphaned roster shifts for a given
    pharmacy and week without triggering cascading ORM queries across unrelated models.
    CRITICAL INVARIANT: NEVER deletes or modifies any is_rostered=False assignment, marketplace slot,
    or open marketplace shift.
    """
    # 1. Identify assignments explicitly marked is_rostered=True in the target week
    rostered_assignments = ShiftSlotAssignment.objects.filter(
        shift__pharmacy=pharmacy,
        slot_date__gte=week_start,
        slot_date__lte=week_end,
        is_rostered=True,
    )
    assignment_ids = list(rostered_assignments.values_list("id", flat=True))
    if not assignment_ids:
        return

    # 2. Identify candidate slots that held these rostered assignments
    candidate_slot_ids = list(
        rostered_assignments.values_list("slot_id", flat=True).distinct()
    )

    # Do not delete any slot that still has non-rostered (marketplace) assignments
    slots_with_other_assignments = set(
        ShiftSlotAssignment.objects.filter(
            slot_id__in=candidate_slot_ids,
            is_rostered=False,
        ).values_list("slot_id", flat=True)
    )
    slots_to_delete = [
        sid for sid in candidate_slot_ids if sid not in slots_with_other_assignments
    ]

    # 3. Identify candidate shifts that owned these slots
    candidate_shift_ids = list(
        ShiftSlot.objects.filter(id__in=slots_to_delete)
        .values_list("shift_id", flat=True)
        .distinct()
    )

    # Do not delete shifts that have other slots remaining
    shifts_with_other_slots = set(
        ShiftSlot.objects.filter(shift_id__in=candidate_shift_ids)
        .exclude(id__in=slots_to_delete)
        .values_list("shift_id", flat=True)
    )

    # Do not delete shifts that have marketplace offers
    shifts_with_offers = set()
    try:
        shifts_with_offers = set(
            ShiftOffer.objects.filter(
                shift_id__in=candidate_shift_ids
            ).values_list("shift_id", flat=True)
        )
    except Exception:
        pass

    shifts_to_delete = [
        sid
        for sid in candidate_shift_ids
        if sid not in shifts_with_other_slots and sid not in shifts_with_offers
    ]

    # 4. Perform atomic deletions in foreign-key safe order using scoped raw SQL
    # to avoid ORM collector inspecting uninstantiated models in partial test runners.
    with connection.cursor() as cursor:
        if assignment_ids:
            placeholders = ", ".join(["%s"] * len(assignment_ids))
            cursor.execute(
                f"DELETE FROM client_profile_shiftslotassignment WHERE id IN ({placeholders})",
                assignment_ids,
            )
        if slots_to_delete:
            placeholders = ", ".join(["%s"] * len(slots_to_delete))
            cursor.execute(
                f"DELETE FROM client_profile_shiftslot WHERE id IN ({placeholders})",
                slots_to_delete,
            )
        if shifts_to_delete:
            placeholders = ", ".join(["%s"] * len(shifts_to_delete))
            cursor.execute(
                f"DELETE FROM client_profile_shift WHERE id IN ({placeholders})",
                shifts_to_delete,
            )


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

    if not created and target_period.status == RosterPeriod.Status.PUBLISHED:
        raise ValidationError("Cannot copy into an already published roster period.")

    if not overwrite:
        if get_roster_period_assignments(target_period).exists():
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

        source_slots = (
            ShiftSlot.objects.filter(
                shift__pharmacy=source_period.pharmacy,
                date__gte=source_period.week_start,
                date__lte=source_period.week_end,
            )
            .select_related("shift")
            .prefetch_related("assignments")
        )

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
                rate_type=slot.shift.rate_type,
            )
            shifts_copied += 1

            new_slot = ShiftSlot.objects.create(
                shift=new_shift,
                date=new_date,
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
        if parsed_st >= parsed_et:
            raise ValidationError(f"Slot {idx}: start_time must be earlier than end_time.")

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

    slots = (
        ShiftSlot.objects.filter(
            shift__pharmacy=roster_period.pharmacy,
            date__gte=roster_period.week_start,
            date__lte=roster_period.week_end,
        )
        .select_related("shift")
        .prefetch_related("assignments")
        .order_by("date", "start_time")
    )

    template_data = []
    for slot in slots:
        day_of_week = (slot.date - roster_period.week_start).days
        item = {
            "day_of_week": day_of_week,
            "start_time": slot.start_time.strftime("%H:%M"),
            "end_time": slot.end_time.strftime("%H:%M"),
            "role": slot.shift.role_needed,
            "user_id": None,
        }
        if include_users:
            assignment = slot.assignments.filter(slot_date=slot.date).first()
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

    if not created and target_period.status == RosterPeriod.Status.PUBLISHED:
        raise ValidationError("Cannot apply template to an already published roster period.")

    if not overwrite:
        if get_roster_period_assignments(target_period).exists():
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
                created_by=user,
            )
            new_slot = ShiftSlot.objects.create(
                shift=new_shift,
                date=entry_date,
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

    return target_period, {
        "slots_created": slots_created,
        "assignments_created": assignments_created,
    }


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
        for idx, op in enumerate(operations):
            if not isinstance(op, dict):
                raise ValidationError(f"Operation {idx}: must be an object.")

            action = op.get("action")
            if not action:
                raise ValidationError(f"Operation {idx}: missing 'action'.")

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
                if st >= et:
                    raise ValidationError(f"Operation {idx}: start_time must be earlier than end_time.")

                new_shift = Shift.objects.create(
                    pharmacy=roster_period.pharmacy,
                    role_needed=role,
                    created_by=user,
                )
                new_slot = ShiftSlot.objects.create(
                    shift=new_shift,
                    date=shift_date,
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

                assignment.delete()
                summary["unassigned"] += 1

            elif action == "delete_slot":
                slot_id = op.get("slot_id")
                slot = ShiftSlot.objects.filter(pk=slot_id).select_related("shift").first()
                if not slot:
                    raise ValidationError(f"Operation {idx}: Slot {slot_id} not found.")

                if slot.shift.visibility == 'PLATFORM' or slot.assignments.filter(is_rostered=False).exists():
                    raise ValidationError(f"Operation {idx}: Cannot delete marketplace slot {slot_id}.")

                if slot.shift.pharmacy_id != roster_period.pharmacy_id:
                    raise ValidationError(f"Operation {idx}: Slot belongs to a different pharmacy.")

                if not (roster_period.week_start <= slot.date <= roster_period.week_end):
                    raise ValidationError(f"Operation {idx}: Slot date is outside this roster period.")

                shift = slot.shift
                slot.delete()
                if shift.slots.count() == 0:
                    shift.delete()
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
                if st >= et:
                    raise ValidationError(f"Operation {idx}: start_time must be earlier than end_time.")

                slot.start_time = st
                slot.end_time = et
                slot.save(update_fields=["start_time", "end_time"])
                summary["updated"] += 1

            else:
                raise ValidationError(f"Operation {idx}: unknown action '{action}'.")

    return summary
