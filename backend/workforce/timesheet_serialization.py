"""Timesheet representations for the API: checks, a timesheet (list or detail, per viewer) and the period summary."""
from django.core.exceptions import PermissionDenied
from attendance.models import AttendanceSession
from workforce.models import Timesheet, TimesheetCheck, WorkforceLeaveRequest
from workforce.permissions import can_manage_pharmacy, can_view_worker_timesheet, require_manage_pharmacy
from workforce.timesheet_builder import ensure_period_timesheets
from workforce.timesheet_checks import _latest_revision, effective_open_checks, latest_check_decision


def serialize_check(check):
    decision = latest_check_decision(check)
    return {
        "id": check.pk,
        "identity_key": check.identity_key,
        "code": check.code,
        "severity": check.severity,
        "work_date": str(check.work_date) if check.work_date else None,
        "message": check.message,
        "details": check.details,
        "decision": None if not decision else {
            "decision": decision.decision,
            "reason": decision.reason,
            "decided_by": decision.decided_by_id,
            "created_at": decision.created_at.isoformat(),
        },
    }


def serialize_timesheet(timesheet, *, detail=False, user=None):
    if user is not None and not can_view_worker_timesheet(user, timesheet):
        raise PermissionDenied("You cannot view this timesheet.")
    revision = _latest_revision(timesheet)
    effective = effective_open_checks(revision) if revision else []
    effective_blockers = sum(1 for check in effective if check.severity == TimesheetCheck.Severity.BLOCKER)
    effective_warnings = sum(1 for check in effective if check.severity == TimesheetCheck.Severity.WARNING)
    data = {
        "id": timesheet.pk,
        "period_id": timesheet.period_id,
        "worker": {"id": timesheet.user_id, "name": timesheet.user.get_full_name() or timesheet.user.username},
        "membership_id": timesheet.membership_id,
        "status": timesheet.status,
        "needs_rebuild": timesheet.needs_rebuild,
        "revision_number": revision.revision_number if revision else None,
        "rostered_minutes": timesheet.rostered_minutes,
        "planned_break_minutes": timesheet.planned_break_minutes,
        "contracted_minutes": timesheet.contracted_minutes,
        "worked_minutes": timesheet.worked_minutes,
        "approved_leave_minutes": timesheet.approved_leave_minutes,
        "reviewed_minutes": timesheet.reviewed_minutes,
        "blocking_checks": effective_blockers,
        "warning_checks": effective_warnings,
        "generated_blocking_checks": timesheet.blocking_checks,
        "generated_warning_checks": timesheet.warning_checks,
        "comments_count": timesheet.comments.count(),
        "last_built_at": timesheet.last_built_at.isoformat() if timesheet.last_built_at else None,
    }
    if detail and revision:
        open_checks = effective_open_checks(revision)
        data.update({
            "snapshot": revision.snapshot,
            "checks": [serialize_check(check) for check in revision.checks.all().order_by("work_date", "severity", "code", "id")],
            "effective_blocking_checks": sum(1 for check in open_checks if check.severity == TimesheetCheck.Severity.BLOCKER),
            "effective_warning_checks": sum(1 for check in open_checks if check.severity == TimesheetCheck.Severity.WARNING),
            "comments": [
                {
                    "id": comment.pk,
                    "author_id": comment.author_id,
                    "author_name": comment.author.get_full_name() or comment.author.username,
                    "body": comment.body,
                    "worker_visible": comment.worker_visible,
                    "created_at": comment.created_at.isoformat(),
                }
                for comment in timesheet.comments.select_related("author").all()
                if comment.worker_visible or (user and can_manage_pharmacy(user, timesheet.period.pharmacy))
            ],
        })
    return data


def period_summary(period, user):
    require_manage_pharmacy(user, period.pharmacy)
    ensure_period_timesheets(period)
    qs = list(period.timesheets.prefetch_related("revisions__checks__decisions").all())
    blocking_timesheets = 0
    warning_checks = 0
    for row in qs:
        revision = _latest_revision(row)
        if not revision:
            continue
        open_checks = effective_open_checks(revision)
        if any(check.severity == TimesheetCheck.Severity.BLOCKER for check in open_checks):
            blocking_timesheets += 1
        warning_checks += sum(1 for check in open_checks if check.severity == TimesheetCheck.Severity.WARNING)
    return {
        "period_id": period.pk,
        "pharmacy_id": period.pharmacy_id,
        "start_date": str(period.start_date),
        "end_date": str(period.end_date),
        "status": period.status,
        "total_timesheets": len(qs),
        "blocking_timesheets": blocking_timesheets,
        "warning_checks": warning_checks,
        "pending_leave_requests": WorkforceLeaveRequest.objects.filter(
            pharmacy=period.pharmacy,
            status=WorkforceLeaveRequest.Status.PENDING,
            start_at__date__lte=period.end_date,
            end_at__date__gte=period.start_date,
        ).count(),
        "open_sessions": AttendanceSession.objects.filter(
            pharmacy=period.pharmacy,
            ended_at__isnull=True,
            started_at__date__lte=period.end_date,
        ).count(),
        "ready_timesheets": sum(1 for row in qs if row.status in {Timesheet.Status.READY, Timesheet.Status.SUBMITTED, Timesheet.Status.APPROVED}),
    }
