"""Roster revisions: optimistic-concurrency workspace, validation and publication commands layered over the roster periods."""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import transaction

from shifts.models import ShiftSlotAssignment
from workforce.models import RosterPeriod
from workforce.roster.services import get_roster_period_grid, publish_roster_period, validate_roster_period
from workforce.roster.validation import work_interval

from workforce.models import CoverageRequirement, RosterOperation, RosterRevisionState
from workforce.permissions import require_manage_pharmacy
from workforce.roster.publication_contract import RosterCommandConflict, warning_key


def _json_hash(payload) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


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
            hits = [(start, end, assignment_id)
                    for start, end, assignment_id in by_day_role[(work_date, requirement.role)]
                    if start < req_end and req_start < end]
            overlapping = [assignment_id for _, _, assignment_id in hits]
            # Staffing is the lowest headcount at any moment of the window, not anyone touching it.
            edges = sorted({req_start, req_end, *(max(s, req_start) for s, _, _ in hits), *(min(e, req_end) for _, e, _ in hits)})
            staffed = min(sum(1 for s, e, _ in hits if s <= a and b <= e) for a, b in zip(edges, edges[1:]))
            rows.append({
                "requirement_id": requirement.pk,
                "date": str(work_date),
                "role": requirement.role,
                "start_time": requirement.start_time.isoformat(timespec="minutes"),
                "end_time": requirement.end_time.isoformat(timespec="minutes"),
                "minimum_staff": requirement.minimum_staff,
                "scheduled_staff": staffed,
                "assignment_ids": overlapping,
                "is_covered": staffed >= requirement.minimum_staff,
                "shortfall": max(requirement.minimum_staff - staffed, 0),
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


def _operation_uuid(value):
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise ValidationError("operation_id must be a valid UUID.")


def _positive_revision(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValidationError("expected_revision must be a positive integer.")
    return value


def revision_summary(period):
    """A side-effect-free projection for the period read/init response."""
    state = RosterRevisionState.objects.filter(period=period).first() if period else None
    return {
        "draft_revision": state.draft_revision if state else (1 if period else 0),
        "published_revision": state.published_revision if state else 0,
        "validated_revision": state.validated_revision if state else None,
    }


def validate_revision(period, expected_revision: int):
    state = get_revision_state(period, lock=True)
    if _positive_revision(expected_revision) != state.draft_revision:
        raise RosterCommandConflict(
            "ROSTER_REVISION_CONFLICT",
            "Roster changed since it was loaded. Refresh and review the latest draft.",
            current_revision=state.draft_revision,
        )
    return state


def validate_period_command(*, user, period: RosterPeriod, expected_revision: int):
    require_manage_pharmacy(user, period.pharmacy)
    with transaction.atomic():
        locked_period = RosterPeriod.objects.select_for_update(of=("self",)).select_related("pharmacy").get(pk=period.pk)
        state = validate_revision(locked_period, expected_revision)
        validation = validate_roster_period(locked_period)
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
    revision = _positive_revision(expected_revision)
    operation_id = _operation_uuid(operation_id)
    if not isinstance(acknowledged_warning_keys, (list, tuple)) or any(
        not isinstance(key, str) or not key or len(key) > 128 for key in acknowledged_warning_keys
    ):
        raise ValidationError("acknowledged_warning_keys must be a list of warning keys.")
    keys = sorted(set(acknowledged_warning_keys))
    request_hash = _json_hash({
        "period_id": period.pk,
        "expected_revision": revision,
        "acknowledged_warning_keys": keys,
    })

    with transaction.atomic():
        locked_period = RosterPeriod.objects.select_for_update(of=("self",)).select_related("pharmacy").get(pk=period.pk)
        # Reserve the globally unique operation before publishing. get_or_create
        # serializes conflicting UUIDs even when callers selected different periods.
        # Validation failure rolls this uncommitted reservation back with the command.
        operation, created = RosterOperation.objects.get_or_create(
            operation_id=operation_id,
            defaults={"period": locked_period, "operation_type": "PUBLISH", "request_hash": request_hash,
                      "result_json": {}, "created_by": user},
        )
        if not created:
            if (operation.period_id != locked_period.pk or operation.request_hash != request_hash
                    or operation.operation_type != "PUBLISH" or operation.created_by_id != user.pk):
                raise RosterCommandConflict("ROSTER_OPERATION_CONFLICT", "operation_id was already used for a different roster command.")
            if not operation.result_json:
                raise RosterCommandConflict("ROSTER_OPERATION_INCOMPLETE", "This operation has no completed result. Use a new operation after review.")
            return operation.result_json

        state = validate_revision(locked_period, revision)
        unpublished_slot_ids = list(
            locked_period.planned_slots.filter(unpublished_at__isnull=False)
            .order_by("pk")
            .values_list("pk", flat=True)
        )
        # Reconciliation of a live week must not restore an individually
        # withdrawn shift. Publishing a withdrawn whole week is an explicit
        # publication of every shift, validated together by the service below.
        if locked_period.status == RosterPeriod.Status.PUBLISHED and unpublished_slot_ids:
            raise RosterCommandConflict(
                "ROSTER_SHIFT_REPUBLISH_REQUIRED",
                "Republish each individually unpublished shift before publishing this roster revision.",
                unpublished_slot_ids=unpublished_slot_ids,
            )
        # The underlying publication service validates the exact current warning
        # keys after acquiring the period and worker locks. No force-warnings escape.
        published, validation = publish_roster_period(
            locked_period, published_by=user, acknowledged_warning_keys=keys,
        )
        validation = {**validation, "warnings": [{**w, "warning_key": warning_key(w)} for w in validation.get("warnings", [])]}
        state.published_revision = state.draft_revision
        state.validated_revision = state.draft_revision
        state.validation_snapshot = validation
        state.save(update_fields=["published_revision", "validated_revision", "validation_snapshot", "changed_at"])
        result = {
            "status": "PUBLISHED",
            "period_id": published.pk,
            "week_start": str(published.week_start),
            "published_at": published.published_at.isoformat() if published.published_at else None,
            "draft_revision": state.draft_revision,
            "published_revision": state.published_revision,
            "validation": validation,
        }
        operation.result_json = result
        operation.save(update_fields=["result_json"])
        return result
