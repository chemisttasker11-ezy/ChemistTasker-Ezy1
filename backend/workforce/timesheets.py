from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from datetime import date, datetime, time, timedelta

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from client_profile.attendance_approvals import get_effective_session_timeline
from client_profile.models import (
    AttendanceEvent,
    AttendanceSession,
    LeaveRequest,
    Membership,
    Pharmacy,
    ProvisionalAttendance,
    RosterPeriod,
    ShiftSlotAssignment,
)
from client_profile.roster_validation import work_interval
from client_profile.timezone_utils import get_pharmacy_timezone

from .employment_terms import correspondence_profile
from .models import (
    EmploymentEngagement,
    MembershipWorkSettings,
    Timesheet,
    TimesheetApproval,
    TimesheetCheck,
    TimesheetCheckDecision,
    TimesheetComment,
    TimesheetManifest,
    TimesheetPeriod,
    TimesheetRevision,
    TimesheetSegment,
    WorkforceLeaveRequest,
)
from .permissions import can_manage_pharmacy, can_view_worker_timesheet, require_manage_pharmacy

CHECK_START_TOLERANCE_MINUTES = 5
CHECK_FINISH_TOLERANCE_MINUTES = 5
CHECK_DURATION_TOLERANCE_MINUTES = 5
CHECK_BREAK_TOLERANCE_MINUTES = 5


def _hash(payload) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _minutes(start: datetime, end: datetime) -> int:
    if not start or not end or end <= start:
        return 0
    return max(int(round((end - start).total_seconds() / 60.0)), 0)


def _period_bounds(period: TimesheetPeriod):
    tz = get_pharmacy_timezone(period.pharmacy)
    local_start = datetime.combine(period.start_date, time.min, tzinfo=tz)
    local_end_exclusive = datetime.combine(period.end_date + timedelta(days=1), time.min, tzinfo=tz)
    return local_start, local_end_exclusive, tz


def _local_date(value: datetime, tz):
    return value.astimezone(tz).date()


def _serialize_dt(value):
    return value.isoformat() if value else None


def _check(code, severity, message, *, work_date=None, details=None, identity_parts=None):
    identity_parts = identity_parts or []
    key_material = [code, str(work_date or ""), *[str(x) for x in identity_parts]]
    return {
        "identity_key": hashlib.sha256("|".join(key_material).encode("utf-8")).hexdigest()[:40],
        "code": code,
        "severity": severity,
        "work_date": work_date,
        "message": message,
        "details": details or {},
    }


def _active_membership(user_id, pharmacy_id):
    return (
        Membership.objects.filter(
            user_id=user_id,
            pharmacy_id=pharmacy_id,
            is_active=True,
            status=Membership.Status.ACCEPTED,
        )
        .exclude(role="CONTACT")
        .order_by("pk")
        .first()
    )


def _contracted_minutes(membership, period: TimesheetPeriod):
    if not membership:
        return None
    settings = MembershipWorkSettings.objects.filter(membership=membership).first()
    if not settings or settings.contracted_weekly_minutes is None:
        return None
    days = (period.end_date - period.start_date).days + 1
    return int(round(settings.contracted_weekly_minutes * (days / 7.0)))


EMPLOYEE_ENGAGEMENT_TYPES = {"FULL_TIME", "PART_TIME", "CASUAL"}


def _employment_engagements_for_period(membership, period: TimesheetPeriod):
    if (
        not membership
        or not membership.is_pharmacy_staff_member
        or membership.employment_type not in EMPLOYEE_ENGAGEMENT_TYPES
    ):
        return []
    return list(
        EmploymentEngagement.objects.filter(
            membership=membership,
            effective_from__lte=period.end_date,
        )
        .filter(Q(effective_to__isnull=True) | Q(effective_to__gte=period.start_date))
        .order_by("effective_from", "pk")
    )


def _serialize_pay_engagement(row: EmploymentEngagement):
    correspondence = correspondence_profile(row.employment_type, row.pay_basis)
    return {
        "public_id": str(row.public_id),
        "membership_id": row.membership_id,
        "effective_from": str(row.effective_from),
        "effective_to": str(row.effective_to) if row.effective_to else None,
        "role": row.role,
        "employment_type": row.employment_type,
        "job_title": row.job_title,
        "pay_basis": row.pay_basis,
        "award_code": row.award_code,
        "award_classification": row.award_classification,
        "award_source_label": row.award_source_label,
        "award_source_url": row.award_source_url,
        "award_effective_from": str(row.award_effective_from) if row.award_effective_from else None,
        "award_rate_snapshot": row.award_rate_snapshot,
        "adult_rate_confirmed": row.award_rate_snapshot.get("adult_rate_confirmed"),
        "ordinary_hours_pattern": row.ordinary_hours_pattern,
        "correspondence": correspondence,
        "rates": {
            "weekday": str(row.rate_weekday),
            "saturday": str(row.rate_saturday),
            "sunday": str(row.rate_sunday),
            "public_holiday": str(row.rate_public_holiday),
            "early_morning": str(row.rate_early_morning) if row.rate_early_morning is not None else None,
            "late_night": str(row.rate_late_night) if row.rate_late_night is not None else None,
            "early_morning_applicable": row.early_morning_applicable,
            "late_night_applicable": row.late_night_applicable,
        },
    }


def _attach_employment_engagements(day_rows, membership, period: TimesheetPeriod):
    engagements = _employment_engagements_for_period(membership, period)
    serialized = [_serialize_pay_engagement(row) for row in engagements]
    missing_dates = set()

    for day_row in day_rows:
        work_date = date.fromisoformat(day_row["date"])
        match = next(
            (
                row
                for row in engagements
                if row.effective_from <= work_date
                and (row.effective_to is None or row.effective_to >= work_date)
            ),
            None,
        )
        day_row["employment_engagement_public_id"] = str(match.public_id) if match else None
        if (
            membership
            and membership.is_pharmacy_staff_member
            and membership.employment_type in EMPLOYEE_ENGAGEMENT_TYPES
            and match is None
        ):
            missing_dates.add(work_date)

    return serialized, sorted(missing_dates)


def _roster_rows(user_id, period: TimesheetPeriod, tz):
    qs = (
        ShiftSlotAssignment.objects.filter(
            user_id=user_id,
            shift__pharmacy=period.pharmacy,
            is_rostered=True,
            slot_date__gte=period.start_date,
            slot_date__lte=period.end_date,
        )
        .select_related("slot", "shift", "shift__pharmacy")
        .order_by("slot_date", "slot__start_time", "pk")
    )
    rows = []
    published_week_cache = {}
    for assignment in qs:
        work_date = assignment.slot_date or assignment.slot.date
        monday = work_date - timedelta(days=work_date.weekday())
        if monday not in published_week_cache:
            published_week_cache[monday] = RosterPeriod.objects.filter(
                pharmacy=period.pharmacy, week_start=monday, status=RosterPeriod.Status.PUBLISHED
            ).exists()
        if not published_week_cache[monday]:
            continue
        start, end = work_interval(
            assignment.shift.pharmacy,
            work_date,
            assignment.slot.start_time,
            assignment.slot.end_time,
        )
        rows.append({
            "assignment_id": assignment.pk,
            "shift_id": assignment.shift_id,
            "slot_id": assignment.slot_id,
            "date": work_date,
            "start": start,
            "end": end,
            "minutes": _minutes(start, end),
            "planned_break_minutes": int(assignment.slot.planned_break_minutes or 0),
            "role": assignment.shift.role_needed,
        })
    return rows


def _legacy_approved_leave(user_id, period: TimesheetPeriod):
    return list(
        LeaveRequest.objects.filter(
            user_id=user_id,
            status="APPROVED",
            slot_assignment__shift__pharmacy=period.pharmacy,
        ).filter(
            Q(slot_assignment__slot_date__range=(period.start_date, period.end_date))
            | Q(slot_assignment__slot_date__isnull=True, slot_assignment__slot__date__range=(period.start_date, period.end_date))
        ).select_related("slot_assignment__slot", "slot_assignment__shift")
    )


def _modern_leave(user_id, period: TimesheetPeriod, start_bound, end_bound):
    return list(
        WorkforceLeaveRequest.objects.filter(
            user_id=user_id,
            pharmacy=period.pharmacy,
            status=WorkforceLeaveRequest.Status.APPROVED,
            start_at__lt=end_bound,
            end_at__gt=start_bound,
        ).order_by("start_at", "pk")
    )


def _pending_leave_count(user_id, period: TimesheetPeriod, start_bound, end_bound):
    return WorkforceLeaveRequest.objects.filter(
        user_id=user_id,
        pharmacy=period.pharmacy,
        status=WorkforceLeaveRequest.Status.PENDING,
        start_at__lt=end_bound,
        end_at__gt=start_bound,
    ).count()


def _session_rows(user_id, period: TimesheetPeriod, start_bound, end_bound, tz):
    sessions = list(
        AttendanceSession.objects.filter(
            user_id=user_id,
            pharmacy=period.pharmacy,
            started_at__lt=end_bound,
        )
        .filter(Q(ended_at__isnull=True) | Q(ended_at__gte=start_bound))
        .select_related("assignment", "assignment__slot", "assignment__shift", "pharmacy", "user")
        .prefetch_related("events__corrections")
        .order_by("started_at", "pk")
    )

    session_rows = []
    all_segments = []
    checks = []
    now = timezone.now()

    for session in sessions:
        timeline = get_effective_session_timeline(session)
        timeline.sort(key=lambda item: (item["effective_timestamp"], item["event_id"]))
        clock_ins = [e for e in timeline if e["event_type"] == AttendanceEvent.EventType.CLOCK_IN]
        clock_outs = [e for e in timeline if e["event_type"] == AttendanceEvent.EventType.CLOCK_OUT]
        actual_start = clock_ins[0]["effective_timestamp"] if clock_ins else session.started_at
        actual_end = clock_outs[-1]["effective_timestamp"] if clock_outs else None
        work_date = _local_date(actual_start, tz)

        if not clock_ins:
            checks.append(_check(
                "MISSING_CLOCK_IN", "BLOCKER", "Attendance session has no clock-in event.",
                work_date=work_date, identity_parts=["session", session.pk], details={"session_id": session.pk},
            ))
        if actual_end is None:
            checks.append(_check(
                "MISSING_CLOCK_OUT", "BLOCKER", "Attendance session has no clock-out event.",
                work_date=work_date, identity_parts=["session", session.pk], details={"session_id": session.pk},
            ))
        if session.is_provisional:
            checks.append(_check(
                "UNRESOLVED_PROVISIONAL_ATTENDANCE", "BLOCKER",
                "Attendance is provisional and must be reviewed before time approval.",
                work_date=work_date, identity_parts=["session", session.pk], details={"session_id": session.pk},
            ))
        else:
            provisional = getattr(session, "provisional_review", None)
            if provisional and provisional.status == ProvisionalAttendance.Status.PENDING:
                checks.append(_check(
                    "UNRESOLVED_PROVISIONAL_ATTENDANCE", "BLOCKER",
                    "Attendance review is still pending.",
                    work_date=work_date, identity_parts=["session", session.pk], details={"session_id": session.pk},
                ))

        clipping_end = actual_end or min(now, end_bound)
        clipping_start = max(actual_start, start_bound)
        clipping_end = min(clipping_end, end_bound)

        break_stack = []
        breaks = []
        for event in timeline:
            ts = event["effective_timestamp"]
            if event["event_type"] == AttendanceEvent.EventType.BREAK_START:
                break_stack.append((event["event_id"], ts))
            elif event["event_type"] == AttendanceEvent.EventType.BREAK_END:
                if break_stack:
                    start_event_id, break_start = break_stack.pop(0)
                    if break_start < ts:
                        breaks.append((max(break_start, start_bound), min(ts, end_bound), start_event_id, event["event_id"]))
                else:
                    checks.append(_check(
                        "UNMATCHED_BREAK_END", "WARNING", "Break end has no matching break start.",
                        work_date=_local_date(ts, tz), identity_parts=["event", event["event_id"]],
                        details={"event_id": event["event_id"], "session_id": session.pk},
                    ))
        for start_event_id, break_start in break_stack:
            checks.append(_check(
                "UNMATCHED_BREAK_START", "WARNING", "Break start has no matching break end.",
                work_date=_local_date(break_start, tz), identity_parts=["event", start_event_id],
                details={"event_id": start_event_id, "session_id": session.pk},
            ))

        valid_breaks = [(s, e, se, ee) for s, e, se, ee in breaks if s < e and s < clipping_end and e > clipping_start]
        cursor = clipping_start
        session_work_minutes = 0
        session_break_minutes = 0
        for break_start, break_end, start_event_id, end_event_id in sorted(valid_breaks, key=lambda b: b[0]):
            break_start = max(break_start, clipping_start)
            break_end = min(break_end, clipping_end)
            if cursor < break_start:
                mins = _minutes(cursor, break_start)
                session_work_minutes += mins
                all_segments.append({
                    "segment_type": "WORK", "started_at": cursor, "ended_at": break_start,
                    "minutes": mins, "source_type": "ATTENDANCE_SESSION", "source_id": str(session.pk),
                    "metadata": {"session_id": session.pk},
                })
            if break_start < break_end:
                mins = _minutes(break_start, break_end)
                session_break_minutes += mins
                all_segments.append({
                    "segment_type": "BREAK", "started_at": break_start, "ended_at": break_end,
                    "minutes": mins, "source_type": "ATTENDANCE_BREAK", "source_id": f"{start_event_id}:{end_event_id}",
                    "metadata": {"session_id": session.pk, "start_event_id": start_event_id, "end_event_id": end_event_id},
                })
            cursor = max(cursor, break_end)
        if cursor < clipping_end:
            mins = _minutes(cursor, clipping_end)
            session_work_minutes += mins
            all_segments.append({
                "segment_type": "WORK", "started_at": cursor, "ended_at": clipping_end,
                "minutes": mins, "source_type": "ATTENDANCE_SESSION", "source_id": str(session.pk),
                "metadata": {"session_id": session.pk, "open_session": actual_end is None},
            })

        session_rows.append({
            "session_id": session.pk,
            "assignment_id": session.assignment_id,
            "date": work_date,
            "actual_start": actual_start,
            "actual_end": actual_end,
            "work_minutes": session_work_minutes,
            "break_minutes": session_break_minutes,
            "is_provisional": session.is_provisional,
            "timeline": timeline,
        })

    return session_rows, all_segments, checks


def _nearest_roster(session_row, roster_rows, used_assignment_ids):
    if session_row.get("assignment_id"):
        for row in roster_rows:
            if row["assignment_id"] == session_row["assignment_id"]:
                return row
    candidates = [r for r in roster_rows if r["date"] == session_row["date"] and r["assignment_id"] not in used_assignment_ids]
    if not candidates:
        return None
    return min(candidates, key=lambda r: abs((r["start"] - session_row["actual_start"]).total_seconds()))


def _compare_roster_and_actual(session_rows, roster_rows, approved_legacy_assignment_ids):
    checks = []
    day_rows = []
    used = set()

    for session in session_rows:
        roster = _nearest_roster(session, roster_rows, used)
        if roster:
            used.add(roster["assignment_id"])
        else:
            checks.append(_check(
                "WORK_WITHOUT_ROSTER", "WARNING", "Worked attendance has no matching rostered shift.",
                work_date=session["date"], identity_parts=["session", session["session_id"]],
                details={"session_id": session["session_id"]},
            ))

        if roster:
            start_diff = int(round(abs((session["actual_start"] - roster["start"]).total_seconds()) / 60.0))
            if start_diff > CHECK_START_TOLERANCE_MINUTES:
                checks.append(_check(
                    "START_DIFFERS_FROM_ROSTER", "WARNING",
                    f"Clock-in differs from rostered start by {start_diff} minutes.",
                    work_date=session["date"], identity_parts=["session", session["session_id"], "start"],
                    details={"session_id": session["session_id"], "assignment_id": roster["assignment_id"], "difference_minutes": start_diff},
                ))
            if session["actual_end"]:
                finish_diff = int(round(abs((session["actual_end"] - roster["end"]).total_seconds()) / 60.0))
                if finish_diff > CHECK_FINISH_TOLERANCE_MINUTES:
                    checks.append(_check(
                        "FINISH_DIFFERS_FROM_ROSTER", "WARNING",
                        f"Clock-out differs from rostered finish by {finish_diff} minutes.",
                        work_date=session["date"], identity_parts=["session", session["session_id"], "finish"],
                        details={"session_id": session["session_id"], "assignment_id": roster["assignment_id"], "difference_minutes": finish_diff},
                    ))
                duration_diff = abs(session["work_minutes"] - max(roster["minutes"] - roster["planned_break_minutes"], 0))
                if duration_diff > CHECK_DURATION_TOLERANCE_MINUTES:
                    checks.append(_check(
                        "DURATION_DIFFERS_FROM_ROSTER", "WARNING",
                        f"Worked duration differs from rostered span less planned break by {duration_diff} minutes.",
                        work_date=session["date"], identity_parts=["session", session["session_id"], "duration"],
                        details={"session_id": session["session_id"], "assignment_id": roster["assignment_id"], "difference_minutes": duration_diff},
                    ))
            break_diff = abs(session["break_minutes"] - roster["planned_break_minutes"])
            if break_diff > CHECK_BREAK_TOLERANCE_MINUTES:
                checks.append(_check(
                    "BREAK_DIFFERS_FROM_PLAN", "WARNING",
                    f"Recorded break differs from the planned break by {break_diff} minutes.",
                    work_date=session["date"], identity_parts=["session", session["session_id"], "break"],
                    details={"session_id": session["session_id"], "assignment_id": roster["assignment_id"], "difference_minutes": break_diff},
                ))

        day_rows.append({
            "date": str(session["date"]),
            "session_id": session["session_id"],
            "assignment_id": roster["assignment_id"] if roster else None,
            "actual_start": _serialize_dt(session["actual_start"]),
            "actual_end": _serialize_dt(session["actual_end"]),
            "recorded_break_minutes": session["break_minutes"],
            "worked_minutes": session["work_minutes"],
            "rostered_start": _serialize_dt(roster["start"]) if roster else None,
            "rostered_end": _serialize_dt(roster["end"]) if roster else None,
            "planned_break_minutes": roster["planned_break_minutes"] if roster else 0,
        })

    for roster in roster_rows:
        if roster["assignment_id"] in used or roster["assignment_id"] in approved_legacy_assignment_ids:
            continue
        checks.append(_check(
            "ROSTER_WITHOUT_ATTENDANCE", "BLOCKER", "Rostered shift has no attendance session or approved leave.",
            work_date=roster["date"], identity_parts=["assignment", roster["assignment_id"]],
            details={"assignment_id": roster["assignment_id"]},
        ))
        day_rows.append({
            "date": str(roster["date"]),
            "session_id": None,
            "assignment_id": roster["assignment_id"],
            "actual_start": None,
            "actual_end": None,
            "recorded_break_minutes": 0,
            "worked_minutes": 0,
            "rostered_start": _serialize_dt(roster["start"]),
            "rostered_end": _serialize_dt(roster["end"]),
            "planned_break_minutes": roster["planned_break_minutes"],
        })
    day_rows.sort(key=lambda row: (row["date"], row.get("actual_start") or row.get("rostered_start") or ""))
    return day_rows, checks


def _latest_revision(timesheet):
    return timesheet.revisions.order_by("-revision_number", "-id").first()


def latest_check_decision(check):
    return check.decisions.order_by("-created_at", "-id").first()


def effective_open_checks(revision):
    result = []
    for check in revision.checks.all().order_by("work_date", "severity", "code", "id"):
        decision = latest_check_decision(check)
        resolved = bool(decision and decision.decision in {
            TimesheetCheckDecision.Decision.RESOLVED,
            TimesheetCheckDecision.Decision.WAIVED,
        })
        if not resolved:
            result.append(check)
    return result


def _worker_ids_for_period(period):
    start_bound, end_bound, _ = _period_bounds(period)
    membership_ids = Membership.objects.filter(
        pharmacy=period.pharmacy,
        is_active=True,
        status=Membership.Status.ACCEPTED,
    ).exclude(role="CONTACT").values_list("user_id", flat=True)
    roster_ids = ShiftSlotAssignment.objects.filter(
        shift__pharmacy=period.pharmacy,
        is_rostered=True,
    ).filter(
        Q(slot_date__range=(period.start_date, period.end_date))
        | Q(slot_date__isnull=True, slot__date__range=(period.start_date, period.end_date))
    ).values_list("user_id", flat=True)
    attendance_ids = AttendanceSession.objects.filter(
        pharmacy=period.pharmacy,
        started_at__lt=end_bound,
    ).filter(Q(ended_at__isnull=True) | Q(ended_at__gte=start_bound)).values_list("user_id", flat=True)
    modern_leave_ids = WorkforceLeaveRequest.objects.filter(
        pharmacy=period.pharmacy,
        start_at__lt=end_bound,
        end_at__gt=start_bound,
    ).values_list("user_id", flat=True)
    return sorted(set(membership_ids) | set(roster_ids) | set(attendance_ids) | set(modern_leave_ids))


def ensure_period_timesheets(period):
    for user_id in _worker_ids_for_period(period):
        membership = _active_membership(user_id, period.pharmacy_id)
        Timesheet.objects.get_or_create(period=period, user_id=user_id, defaults={"membership": membership})


def build_timesheet(timesheet_id: int, *, actor=None, force=False):
    with transaction.atomic():
        timesheet = (
            Timesheet.objects.select_for_update(of=("self", "period"))
            .select_related("period__pharmacy", "user", "membership")
            .get(pk=timesheet_id)
        )
        period = timesheet.period
        if period.status == TimesheetPeriod.Status.LOCKED and force:
            raise ValidationError("Locked timesheet periods cannot be recalculated in place.")

        start_bound, end_bound, tz = _period_bounds(period)
        membership = _active_membership(timesheet.user_id, period.pharmacy_id)
        roster_rows = _roster_rows(timesheet.user_id, period, tz)
        legacy_leave = _legacy_approved_leave(timesheet.user_id, period)
        approved_legacy_assignment_ids = {leave.slot_assignment_id for leave in legacy_leave}
        modern_leave = _modern_leave(timesheet.user_id, period, start_bound, end_bound)
        fully_leave_covered_assignment_ids = {
            roster["assignment_id"]
            for roster in roster_rows
            if any(leave.start_at <= roster["start"] and leave.end_at >= roster["end"] for leave in modern_leave)
        }
        approved_leave_assignment_ids = approved_legacy_assignment_ids | fully_leave_covered_assignment_ids
        session_rows, segments, checks = _session_rows(timesheet.user_id, period, start_bound, end_bound, tz)
        day_rows, comparison_checks = _compare_roster_and_actual(session_rows, roster_rows, approved_leave_assignment_ids)
        checks.extend(comparison_checks)

        engagement_rows, missing_engagement_dates = _attach_employment_engagements(
            day_rows,
            membership,
            period,
        )
        for missing_date in missing_engagement_dates:
            checks.append(_check(
                "MISSING_EMPLOYMENT_ENGAGEMENT",
                "WARNING",
                "No dated employment engagement covers this worked/rostered date; payroll terms are not yet resolved.",
                work_date=missing_date,
                identity_parts=["employment-engagement", membership.pk, missing_date],
                details={"membership_id": membership.pk},
            ))

        pending_leave_count = _pending_leave_count(timesheet.user_id, period, start_bound, end_bound)
        if pending_leave_count:
            checks.append(_check(
                "PENDING_LEAVE", "WARNING", f"{pending_leave_count} leave request(s) are pending review.",
                identity_parts=["period", period.pk, "worker", timesheet.user_id],
                details={"pending_leave_count": pending_leave_count},
            ))

        leave_minutes = 0
        leave_rows = []
        counted_leave_intervals = []
        for leave in modern_leave:
            requested_start = max(leave.start_at, start_bound)
            requested_end = min(leave.end_at, end_bound)
            scheduled_minutes = 0
            for roster in roster_rows:
                s = max(requested_start, roster["start"])
                e = min(requested_end, roster["end"])
                if s >= e:
                    continue
                mins = _minutes(s, e)
                scheduled_minutes += mins
                counted_leave_intervals.append((s, e))
                segments.append({
                    "segment_type": "LEAVE", "started_at": s, "ended_at": e, "minutes": mins,
                    "source_type": "WORKFORCE_LEAVE", "source_id": str(leave.pk),
                    "metadata": {"leave_type": leave.leave_type, "assignment_id": roster["assignment_id"]},
                })
            leave_rows.append({
                "id": leave.pk, "leave_type": leave.leave_type,
                "start_at": requested_start.isoformat(), "end_at": requested_end.isoformat(),
                "minutes": scheduled_minutes,
                "note": "Approved leave minutes count only overlap with published rostered work in this non-payroll phase.",
            })

        # Legacy leave is shift-linked. Count its rostered span, but do not count a
        # legacy row twice when it has already been explicitly bridged to a modern leave.
        linked_legacy_ids = {leave.legacy_leave_id for leave in modern_leave if leave.legacy_leave_id}
        roster_by_assignment = {row["assignment_id"]: row for row in roster_rows}
        for leave in legacy_leave:
            if leave.pk in linked_legacy_ids:
                continue
            row = roster_by_assignment.get(leave.slot_assignment_id)
            if row:
                counted_leave_intervals.append((row["start"], row["end"]))
                segments.append({
                    "segment_type": "LEAVE", "started_at": row["start"], "ended_at": row["end"], "minutes": row["minutes"],
                    "source_type": "LEGACY_LEAVE", "source_id": str(leave.pk),
                    "metadata": {"leave_type": leave.leave_type, "assignment_id": leave.slot_assignment_id},
                })
                leave_rows.append({"id": leave.pk, "legacy": True, "leave_type": leave.leave_type, "start_at": row["start"].isoformat(), "end_at": row["end"].isoformat(), "minutes": row["minutes"]})

        # Sum the union of scheduled leave intervals so overlapping records cannot
        # inflate the summary. This is reviewed-time display, not a leave entitlement engine.
        merged_leave = []
        for start, end in sorted(counted_leave_intervals, key=lambda pair: pair[0]):
            if not merged_leave or start > merged_leave[-1][1]:
                merged_leave.append([start, end])
            else:
                merged_leave[-1][1] = max(merged_leave[-1][1], end)
        leave_minutes = sum(_minutes(start, end) for start, end in merged_leave)

        # Flag contradictory evidence instead of silently counting worked time and
        # approved leave for the same interval. A manager can investigate/waive the
        # warning, but the original attendance and leave records remain unchanged.
        for work_segment in [segment for segment in segments if segment["segment_type"] == "WORK"]:
            if any(work_segment["started_at"] < leave_end and leave_start < work_segment["ended_at"] for leave_start, leave_end in merged_leave):
                checks.append(_check(
                    "WORK_OVERLAPS_APPROVED_LEAVE", "WARNING",
                    "Recorded work overlaps approved leave.",
                    work_date=_local_date(work_segment["started_at"], tz),
                    identity_parts=["work-leave", work_segment["source_id"], work_segment["started_at"].isoformat()],
                    details={"source_id": work_segment["source_id"]},
                ))

        rostered_minutes = sum(r["minutes"] for r in roster_rows)
        planned_break_minutes = sum(r["planned_break_minutes"] for r in roster_rows)
        worked_minutes = sum(s["minutes"] for s in segments if s["segment_type"] == "WORK")
        contracted_minutes = _contracted_minutes(membership, period)

        source_payload = {
            "period": [period.pk, str(period.start_date), str(period.end_date)],
            "worker_id": timesheet.user_id,
            "membership_id": membership.pk if membership else None,
            "employment_engagements": engagement_rows,
            "roster": [{**r, "start": r["start"].isoformat(), "end": r["end"].isoformat(), "date": str(r["date"])} for r in roster_rows],
            "sessions": [
                {
                    "session_id": row["session_id"],
                    "assignment_id": row["assignment_id"],
                    "actual_start": _serialize_dt(row["actual_start"]),
                    "actual_end": _serialize_dt(row["actual_end"]),
                    "timeline": [
                        {
                            "event_id": ev["event_id"],
                            "event_type": ev["event_type"],
                            "effective_timestamp": _serialize_dt(ev["effective_timestamp"]),
                            "correction_id": ev["correction_id"],
                        } for ev in row["timeline"]
                    ],
                } for row in session_rows
            ],
            "leave": leave_rows,
            "checks": [{**c, "work_date": str(c["work_date"]) if c["work_date"] else None} for c in checks],
        }
        fingerprint = _hash(source_payload)
        previous = _latest_revision(timesheet)
        if previous and previous.source_fingerprint == fingerprint and not force:
            timesheet.needs_rebuild = False
            timesheet.last_built_at = timezone.now()
            timesheet.save(update_fields=["needs_rebuild", "last_built_at", "updated_at"])
            return previous

        revision_number = (previous.revision_number + 1) if previous else 1
        blockers = sum(1 for c in checks if c["severity"] == "BLOCKER")
        warnings = sum(1 for c in checks if c["severity"] == "WARNING")
        # Reviewed/approved time is not established by projection alone.
        # It becomes authoritative only after a manager approves this exact revision.
        reviewed_minutes = 0
        snapshot = {
            "worker": {"id": timesheet.user_id, "name": timesheet.user.get_full_name() or timesheet.user.username},
            "pharmacy": {"id": period.pharmacy_id, "name": period.pharmacy.name},
            "period": {"id": period.pk, "start_date": str(period.start_date), "end_date": str(period.end_date), "timezone": period.timezone},
            "employment_engagements": engagement_rows,
            "days": day_rows,
            "leave": leave_rows,
            "totals": {
                "rostered_minutes": rostered_minutes,
                "planned_break_minutes": planned_break_minutes,
                "contracted_minutes": contracted_minutes,
                "worked_minutes": worked_minutes,
                "approved_leave_minutes": leave_minutes,
                "reviewed_minutes": reviewed_minutes,
            },
        }
        revision = TimesheetRevision.objects.create(
            timesheet=timesheet,
            revision_number=revision_number,
            source_fingerprint=fingerprint,
            snapshot=snapshot,
            rostered_minutes=rostered_minutes,
            planned_break_minutes=planned_break_minutes,
            contracted_minutes=contracted_minutes,
            worked_minutes=worked_minutes,
            approved_leave_minutes=leave_minutes,
            reviewed_minutes=reviewed_minutes,
            created_by=actor,
        )
        TimesheetSegment.objects.bulk_create([
            TimesheetSegment(
                revision=revision,
                segment_type=s["segment_type"],
                started_at=s["started_at"],
                ended_at=s["ended_at"],
                minutes=s["minutes"],
                source_type=s["source_type"],
                source_id=s["source_id"],
                metadata=s["metadata"],
            ) for s in segments if s["ended_at"] > s["started_at"]
        ])
        TimesheetCheck.objects.bulk_create([
            TimesheetCheck(
                revision=revision,
                identity_key=c["identity_key"],
                code=c["code"],
                severity=c["severity"],
                work_date=c["work_date"],
                message=c["message"],
                details=c["details"],
            ) for c in checks
        ])

        timesheet.membership = membership
        timesheet.source_fingerprint = fingerprint
        timesheet.rostered_minutes = rostered_minutes
        timesheet.planned_break_minutes = planned_break_minutes
        timesheet.contracted_minutes = contracted_minutes
        timesheet.worked_minutes = worked_minutes
        timesheet.approved_leave_minutes = leave_minutes
        timesheet.reviewed_minutes = reviewed_minutes
        timesheet.blocking_checks = blockers
        timesheet.warning_checks = warnings
        timesheet.needs_rebuild = False
        timesheet.last_built_at = timezone.now()
        if timesheet.status in {Timesheet.Status.APPROVED, Timesheet.Status.SUBMITTED}:
            timesheet.status = Timesheet.Status.REOPENED
        elif blockers:
            timesheet.status = Timesheet.Status.NEEDS_REVIEW
        else:
            timesheet.status = Timesheet.Status.READY
        timesheet.save()
        return revision


def rebuild_period(period_id: int, *, actor=None, force=False):
    period = TimesheetPeriod.objects.select_related("pharmacy").get(pk=period_id)
    if period.status == TimesheetPeriod.Status.LOCKED:
        return []
    ensure_period_timesheets(period)
    results = []
    for timesheet_id in period.timesheets.order_by("user_id").values_list("pk", flat=True):
        results.append(build_timesheet(timesheet_id, actor=actor, force=force))
    return results


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
        for timesheet in period.timesheets.select_related("user").order_by("user_id"):
            revision = _latest_revision(timesheet)
            snapshots.append({
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
            })
        manifest_snapshot = {
            "period_id": period.pk,
            "pharmacy_id": period.pharmacy_id,
            "start_date": str(period.start_date),
            "end_date": str(period.end_date),
            "timesheets": snapshots,
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
