from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction

from client_profile.models import RosterPeriod, ShiftSlotAssignment
from client_profile.roster_services import (
    get_roster_period_grid,
    publish_roster_period,
    validate_roster_period,
)
from client_profile.roster_validation import work_interval

from .models import CoverageRequirement, RosterOperation, RosterRevisionState
from .permissions import require_manage_pharmacy


def _json_hash(payload) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def warning_key(item: dict) -> str:
    stable = {
        "type": item.get("type"),
        "assignment_id": item.get("assignment_id"),
        "user_id": item.get("user_id"),
        "date": item.get("date"),
        "required_role": item.get("required_role"),
        "conflicting_assignment_id": item.get("conflicting_assignment_id"),
    }
    return _json_hash(stable)[:24]


def get_revision_state(period: RosterPeriod, *, lock=False) -> RosterRevisionState:
    qs = RosterRevisionState.objects
    if lock:
        qs = qs.select_for_update()
    state, _ = qs.get_or_create(period=period)
    return state


def bump_roster_revision(period_id: int) -> int:
    """Bump only draft state. Publishing records which draft was released."""
    with transaction.atomic():
        period = RosterPeriod.objects.select_for_update().get(pk=period_id)
        state = get_revision_state(period, lock=True)
        state.draft_revision += 1
        state.validated_revision = None
        state.validation_snapshot = {}
        state.save(update_fields=["draft_revision", "validated_revision", "validation_snapshot", "changed_at"])
        return state.draft_revision


def _period_for_week(pharmacy_id: int, work_date: date):
    monday = work_date - timedelta(days=work_date.weekday())
    return RosterPeriod.objects.filter(pharmacy_id=pharmacy_id, week_start=monday).first()


def bump_for_assignment(assignment: ShiftSlotAssignment):
    if not assignment or not assignment.shift_id or not assignment.slot_id:
        return
    if not getattr(assignment, "is_rostered", False):
        return
    work_date = assignment.slot_date or assignment.slot.date
    period = _period_for_week(assignment.shift.pharmacy_id, work_date)
    if period:
        bump_roster_revision(period.pk)


def _coverage_for_week(pharmacy, week_start: date, assignments: list[ShiftSlotAssignment]):
    requirements = list(CoverageRequirement.objects.filter(pharmacy=pharmacy, active=True).order_by("weekday", "start_time", "role"))
    if not requirements:
        return []

    by_day_role = defaultdict(list)
    for assignment in assignments:
        work_date = assignment.slot_date or assignment.slot.date
        start, end = work_interval(
            assignment.shift.pharmacy,
            work_date,
            assignment.slot.start_time,
            assignment.slot.end_time,
        )
        by_day_role[(work_date, assignment.shift.role_needed)].append((start, end, assignment.pk))

    rows = []
    for offset in range(7):
        work_date = week_start + timedelta(days=offset)
        for requirement in [r for r in requirements if r.weekday == work_date.weekday()]:
            req_start, req_end = work_interval(pharmacy, work_date, requirement.start_time, requirement.end_time)
            overlapping = [
                assignment_id
                for start, end, assignment_id in by_day_role[(work_date, requirement.role)]
                if start < req_end and req_start < end
            ]
            rows.append({
                "requirement_id": requirement.pk,
                "date": str(work_date),
                "role": requirement.role,
                "start_time": requirement.start_time.isoformat(timespec="minutes"),
                "end_time": requirement.end_time.isoformat(timespec="minutes"),
                "minimum_staff": requirement.minimum_staff,
                "scheduled_staff": len(overlapping),
                "assignment_ids": overlapping,
                "is_covered": len(overlapping) >= requirement.minimum_staff,
                "shortfall": max(requirement.minimum_staff - len(overlapping), 0),
            })
    return rows


def serialize_workspace(pharmacy, week_start: date):
    week_end = week_start + timedelta(days=6)
    period = RosterPeriod.objects.filter(pharmacy=pharmacy, week_start=week_start).first()
    state = RosterRevisionState.objects.filter(period=period).first() if period else None
    grid = get_roster_period_grid(pharmacy, week_start, week_end)
    # Existing get_roster_period_grid currently includes every assignment in its base
    # queryset despite its docstring. Keep marketplace/non-rostered commitments visible
    # only through the existing owner calendar, not as editable roster rows here.
    roster_assignments = list(
        ShiftSlotAssignment.objects.filter(
            shift__pharmacy=pharmacy,
            slot_date__gte=week_start,
            slot_date__lte=week_end,
            is_rostered=True,
        ).select_related("slot", "shift", "shift__pharmacy", "user")
    )
    validation = validate_roster_period(period) if period else {
        "is_valid": True,
        "errors": [],
        "warnings": [],
        "total_assignments": 0,
        "total_workers": 0,
    }
    validation = {
        **validation,
        "warnings": [{**w, "warning_key": warning_key(w)} for w in validation.get("warnings", [])],
    }
    return {
        "period_id": period.pk if period else None,
        "week_start": str(week_start),
        "week_end": str(week_end),
        "status": period.status if period else "DRAFT",
        "draft_revision": state.draft_revision if state else (1 if period else 0),
        "published_revision": state.published_revision if state else 0,
        "validated_revision": state.validated_revision if state else None,
        "validation": validation,
        "grid": grid,
        "coverage_view": _coverage_for_week(pharmacy, week_start, roster_assignments),
        "summary": {
            "staff_count": len({a.user_id for a in roster_assignments}),
            "shift_count": len(roster_assignments),
            "vacancy_count": len(grid.get("vacant_slots", [])),
            "coverage_shortfalls": sum(1 for row in _coverage_for_week(pharmacy, week_start, roster_assignments) if not row["is_covered"]),
        },
    }


def _load_operation(operation_id):
    try:
        return RosterOperation.objects.filter(operation_id=UUID(str(operation_id))).first()
    except (TypeError, ValueError, AttributeError):
        raise ValidationError("operation_id must be a valid UUID.")


def validate_revision(period, expected_revision: int):
    state = get_revision_state(period, lock=True)
    if int(expected_revision) != state.draft_revision:
        raise ValidationError({
            "code": "ROSTER_REVISION_CONFLICT",
            "message": "Roster changed since it was loaded. Refresh and review the latest draft.",
            "current_revision": state.draft_revision,
        })
    return state


def validate_period_command(*, user, period: RosterPeriod, expected_revision: int):
    require_manage_pharmacy(user, period.pharmacy)
    with transaction.atomic():
        state = validate_revision(period, expected_revision)
        validation = validate_roster_period(period)
        payload = {
            **validation,
            "draft_revision": state.draft_revision,
            "warnings": [{**w, "warning_key": warning_key(w)} for w in validation.get("warnings", [])],
        }
        state.validated_revision = state.draft_revision
        state.validation_snapshot = payload
        state.save(update_fields=["validated_revision", "validation_snapshot", "changed_at"])
        return payload


def publish_period_command(*, user, period: RosterPeriod, expected_revision: int, operation_id, acknowledged_warning_keys):
    require_manage_pharmacy(user, period.pharmacy)
    request_payload = {
        "period_id": period.pk,
        "expected_revision": int(expected_revision),
        "acknowledged_warning_keys": sorted(set(acknowledged_warning_keys or [])),
    }
    request_hash = _json_hash(request_payload)

    with transaction.atomic():
        # Serialize commands for the same period before checking the idempotency ledger.
        # This closes the race where two identical requests both observed no operation row.
        locked_period = RosterPeriod.objects.select_for_update().select_related("pharmacy").get(pk=period.pk)
        previous = _load_operation(operation_id)
        if previous:
            if previous.period_id != locked_period.pk or previous.request_hash != request_hash:
                raise ValidationError("operation_id was already used for a different roster command.")
            return previous.result_json

        state = validate_revision(locked_period, expected_revision)
        validation = validate_roster_period(locked_period)
        if validation["errors"]:
            raise ValidationError({"code": "ROSTER_BLOCKING_ERRORS", "errors": validation["errors"]})

        warnings = [{**w, "warning_key": warning_key(w)} for w in validation.get("warnings", [])]
        required_keys = {w["warning_key"] for w in warnings}
        supplied_keys = set(acknowledged_warning_keys or [])
        missing = sorted(required_keys - supplied_keys)
        if missing:
            raise ValidationError({
                "code": "ROSTER_WARNINGS_REQUIRE_ACKNOWLEDGEMENT",
                "missing_warning_keys": missing,
                "warnings": warnings,
            })

        published, final_validation = publish_roster_period(
            locked_period,
            published_by=user,
            force_warnings=True,  # safe here because every current warning was explicitly acknowledged above
        )
        state.published_revision = state.draft_revision
        state.validated_revision = state.draft_revision
        state.validation_snapshot = {**final_validation, "warnings": warnings}
        state.save(update_fields=["published_revision", "validated_revision", "validation_snapshot", "changed_at"])

        result = {
            "status": "PUBLISHED",
            "period_id": published.pk,
            "week_start": str(published.week_start),
            "draft_revision": state.draft_revision,
            "published_revision": state.published_revision,
            "validation": state.validation_snapshot,
        }
        RosterOperation.objects.create(
            operation_id=operation_id,
            period=locked_period,
            operation_type="PUBLISH",
            request_hash=request_hash,
            result_json=result,
            created_by=user,
        )
        return result
