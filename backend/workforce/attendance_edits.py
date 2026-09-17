from __future__ import annotations

from datetime import timedelta

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from client_profile.attendance_approvals import get_effective_session_timeline
from client_profile.models import AttendanceEvent, AttendanceSession
from client_profile.timezone_utils import get_pharmacy_timezone

from .models import ManagerAttendanceEventAudit, Timesheet, TimesheetPeriod
from .permissions import require_manage_pharmacy


def append_missing_punch(*, timesheet: Timesheet, manager, session_id: int, event_type: str, occurred_at, reason: str):
    """Append a missing CLOCK_IN/CLOCK_OUT event without rewriting existing evidence."""
    require_manage_pharmacy(manager, timesheet.period.pharmacy)
    if timesheet.period.status == TimesheetPeriod.Status.LOCKED:
        raise ValidationError("Locked periods require a later adjustment workflow.")
    event_type = str(event_type or "").upper()
    if event_type not in {AttendanceEvent.EventType.CLOCK_IN, AttendanceEvent.EventType.CLOCK_OUT}:
        raise ValidationError("Only a missing clock-in or clock-out can be appended from the timesheet workflow.")
    if not occurred_at or timezone.is_naive(occurred_at):
        raise ValidationError("occurred_at must be a timezone-aware datetime.")
    if occurred_at > timezone.now():
        raise ValidationError("Attendance cannot be created in the future.")
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("A reason is required for a manager-created attendance event.")

    with transaction.atomic():
        session = (
            AttendanceSession.objects.select_for_update()
            .select_related("pharmacy", "user")
            .prefetch_related("events__corrections")
            .get(pk=session_id)
        )
        if session.pharmacy_id != timesheet.period.pharmacy_id or session.user_id != timesheet.user_id:
            raise PermissionDenied("Attendance session does not belong to this timesheet.")
        if session.events.filter(event_type=event_type).exists():
            raise ValidationError(f"A {event_type} event already exists. Correct the existing event instead of adding another.")

        tz = get_pharmacy_timezone(session.pharmacy)
        local_date = occurred_at.astimezone(tz).date()
        if local_date < timesheet.period.start_date - timedelta(days=1) or local_date > timesheet.period.end_date + timedelta(days=1):
            raise ValidationError("The missing punch is outside this timesheet period.")

        timeline = get_effective_session_timeline(session)
        existing_times = [row["effective_timestamp"] for row in timeline]
        if event_type == AttendanceEvent.EventType.CLOCK_IN:
            if existing_times and occurred_at > min(existing_times):
                raise ValidationError("Clock-in must be at or before the session's existing events.")
        else:
            if existing_times and occurred_at < max(existing_times):
                raise ValidationError("Clock-out must be at or after the session's existing events.")

        event = AttendanceEvent.objects.create(
            session=session,
            event_type=event_type,
            occurred_at=occurred_at,
            source=AttendanceEvent.Source.MANAGER,
        )
        ManagerAttendanceEventAudit.objects.create(event=event, reason=reason, created_by=manager)

        # AttendanceSession is the efficient current-state projection; the append-only event remains the audit evidence.
        if event_type == AttendanceEvent.EventType.CLOCK_IN:
            session.started_at = occurred_at
            session.save(update_fields=["started_at", "updated_at"])
        else:
            session.ended_at = occurred_at
            session.save(update_fields=["ended_at", "updated_at"])
        return event
