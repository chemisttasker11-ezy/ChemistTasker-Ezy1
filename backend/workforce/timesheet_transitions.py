"""Timesheet state transitions: submit, approve, reopen, decide a check, comment and lock the period."""
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone
from workforce.models import (
    Timesheet,
    TimesheetApproval,
    TimesheetCheck,
    TimesheetCheckDecision,
    TimesheetComment,
    TimesheetManifest,
    TimesheetPeriod,
)
from workforce.permissions import can_manage_pharmacy, can_view_worker_timesheet, require_manage_pharmacy
from workforce.timesheet_builder import ensure_period_timesheets
from workforce.timesheet_checks import _latest_revision, effective_open_checks
from workforce.timesheet_core import _hash


def submit_timesheet(timesheet, user, revision_number: int):
    if timesheet.user_id != user.pk:
        raise PermissionDenied("Workers can only submit their own timesheets.")
    revision = _latest_revision(timesheet)
    if not revision or revision.revision_number != int(revision_number):
        raise ValidationError("Timesheet changed. Refresh before submitting.")
    if timesheet.needs_rebuild:
        raise ValidationError("Timesheet needs recalculation before submission.")
    TimesheetApproval.objects.create(revision=revision, kind=TimesheetApproval.Kind.EMPLOYEE_SUBMIT, actor=user)
    timesheet.status = Timesheet.Status.SUBMITTED
    timesheet.save(update_fields=["status", "updated_at"])
    return revision


def approve_timesheet(timesheet, user, revision_number: int, *, reason=""):
    require_manage_pharmacy(user, timesheet.period.pharmacy)
    if timesheet.period.status == TimesheetPeriod.Status.LOCKED:
        raise ValidationError("Locked periods cannot be approved again.")
    revision = _latest_revision(timesheet)
    if not revision or revision.revision_number != int(revision_number):
        raise ValidationError("Timesheet changed. Refresh and review the current revision.")
    if timesheet.needs_rebuild:
        raise ValidationError("Timesheet needs recalculation before approval.")
    blockers = [check for check in effective_open_checks(revision) if check.severity == TimesheetCheck.Severity.BLOCKER]
    if blockers:
        raise ValidationError({"code": "TIMESHEET_BLOCKERS", "check_ids": [check.pk for check in blockers]})
    TimesheetApproval.objects.create(
        revision=revision,
        kind=TimesheetApproval.Kind.TIME_APPROVAL,
        actor=user,
        reason=(reason or "").strip(),
    )
    timesheet.status = Timesheet.Status.APPROVED
    timesheet.reviewed_minutes = revision.worked_minutes
    timesheet.save(update_fields=["status", "reviewed_minutes", "updated_at"])
    return revision


def reopen_timesheet(timesheet, user, reason: str):
    require_manage_pharmacy(user, timesheet.period.pharmacy)
    if timesheet.period.status == TimesheetPeriod.Status.LOCKED:
        raise ValidationError("Locked periods require a later adjustment workflow; they cannot be reopened in place.")
    revision = _latest_revision(timesheet)
    if not revision:
        raise ValidationError("Timesheet has no revision to reopen.")
    if not (reason or "").strip():
        raise ValidationError("A reason is required to reopen a timesheet.")
    TimesheetApproval.objects.create(revision=revision, kind=TimesheetApproval.Kind.REOPEN, actor=user, reason=reason.strip())
    timesheet.status = Timesheet.Status.REOPENED
    timesheet.save(update_fields=["status", "updated_at"])
    return revision


def decide_check(check, user, decision: str, reason: str):
    timesheet = check.revision.timesheet
    require_manage_pharmacy(user, timesheet.period.pharmacy)
    source_required = {"MISSING_CLOCK_IN", "MISSING_CLOCK_OUT", "UNRESOLVED_PROVISIONAL_ATTENDANCE"}
    if check.code in source_required and decision in {TimesheetCheckDecision.Decision.RESOLVED, TimesheetCheckDecision.Decision.WAIVED}:
        raise ValidationError("This blocker must be corrected at the attendance source; it cannot be waived from the timesheet.")
    if decision not in TimesheetCheckDecision.Decision.values:
        raise ValidationError("Invalid check decision.")
    if decision in {TimesheetCheckDecision.Decision.RESOLVED, TimesheetCheckDecision.Decision.WAIVED} and not (reason or "").strip():
        raise ValidationError("A reason is required to resolve or waive a timesheet check.")
    return TimesheetCheckDecision.objects.create(
        timesheet_check=check,
        decision=decision,
        reason=(reason or "").strip(),
        decided_by=user,
    )


def add_comment(timesheet, user, body: str, worker_visible=True):
    if not can_view_worker_timesheet(user, timesheet):
        raise PermissionDenied("You cannot comment on this timesheet.")
    if not (body or "").strip():
        raise ValidationError("Comment cannot be empty.")
    revision = _latest_revision(timesheet)
    return TimesheetComment.objects.create(
        timesheet=timesheet,
        revision=revision,
        author=user,
        body=body.strip(),
        worker_visible=bool(worker_visible) if can_manage_pharmacy(user, timesheet.period.pharmacy) else True,
    )


def lock_period(period, user):
    require_manage_pharmacy(user, period.pharmacy)
    with transaction.atomic():
        period = TimesheetPeriod.objects.select_for_update().get(pk=period.pk)
        ensure_period_timesheets(period)
        if period.timesheets.filter(needs_rebuild=True).exists():
            raise ValidationError("Recalculate all timesheets before locking this period.")
        unapproved = list(period.timesheets.exclude(status=Timesheet.Status.APPROVED).values_list("pk", flat=True))
        if unapproved:
            raise ValidationError({"code": "UNAPPROVED_TIMESHEETS", "timesheet_ids": unapproved})
        snapshots = []
        payroll_export = []
        payroll_enabled = bool(getattr(period.pharmacy, "use_chemisttasker_payroll", False))
        for timesheet in period.timesheets.select_related("user").order_by("user_id"):
            revision = _latest_revision(timesheet)
            roster_rows = revision.snapshot.get("roster", []) or []
            payroll_assignment_ids = [
                row.get("assignment_id")
                for row in roster_rows
                if row.get("assignment_id") and row.get("settlement_channel") == "PAYROLL"
            ]
            invoice_assignment_ids = [
                row.get("assignment_id")
                for row in roster_rows
                if row.get("assignment_id") and row.get("settlement_channel") == "INVOICE"
            ]
            timesheet_only_assignment_ids = [
                row.get("assignment_id")
                for row in roster_rows
                if row.get("assignment_id") and row.get("settlement_channel") == "TIMESHEET_ONLY"
            ]
            row_snapshot = {
                "timesheet_id": timesheet.pk,
                "worker_id": timesheet.user_id,
                "revision_number": revision.revision_number,
                "source_fingerprint": revision.source_fingerprint,
                "employment_engagement_public_ids": [
                    row["public_id"]
                    for row in revision.snapshot.get("employment_engagements", [])
                ],
                "reviewed_minutes": timesheet.reviewed_minutes,
                "approved_leave_minutes": timesheet.approved_leave_minutes,
                "settlement_routing": {
                    "payroll_assignment_ids": payroll_assignment_ids,
                    "invoice_assignment_ids": invoice_assignment_ids,
                    "timesheet_only_assignment_ids": timesheet_only_assignment_ids,
                },
            }
            snapshots.append(row_snapshot)

            if payroll_enabled and payroll_assignment_ids:
                payroll_days = [
                    day for day in (revision.snapshot.get("days", []) or [])
                    if day.get("assignment_id") in payroll_assignment_ids
                ]
                payroll_export.append({
                    "timesheet_id": timesheet.pk,
                    "worker_id": timesheet.user_id,
                    "revision_number": revision.revision_number,
                    "assignment_ids": payroll_assignment_ids,
                    "days": payroll_days,
                    "employment_engagement_public_ids": row_snapshot["employment_engagement_public_ids"],
                })

        manifest_snapshot = {
            "period_id": period.pk,
            "pharmacy_id": period.pharmacy_id,
            "start_date": str(period.start_date),
            "end_date": str(period.end_date),
            "payroll_enabled": payroll_enabled,
            "timesheets": snapshots,
            "payroll_export": payroll_export,
            "payroll_exclusion_rule": (
                "Only assignments whose frozen settlement_channel is PAYROLL appear in payroll_export. "
                "INVOICE and TIMESHEET_ONLY assignments remain in the audit timesheet snapshot only."
            ),
        }
        manifest_hash = _hash(manifest_snapshot)
        manifest, _ = TimesheetManifest.objects.get_or_create(
            period=period,
            defaults={"manifest_hash": manifest_hash, "snapshot": manifest_snapshot, "created_by": user},
        )
        if manifest.manifest_hash != manifest_hash:
            raise ValidationError("A different locked manifest already exists for this period.")
        period.status = TimesheetPeriod.Status.LOCKED
        period.locked_by = user
        period.locked_at = timezone.now()
        period.save(update_fields=["status", "locked_by", "locked_at", "updated_at"])
        return manifest
