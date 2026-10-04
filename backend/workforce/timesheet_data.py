"""The inputs of a timesheet: the worker's active membership and employment engagements, rostered rows, leave
and attendance sessions, and the workers of a period."""
from datetime import date, timedelta
from django.db.models import Q
from django.utils import timezone
from attendance.approvals import get_effective_session_timeline
from memberships.models import Membership
from shifts.models import ShiftSlotAssignment
from workforce.models import (
    RosterPeriod,
    EmploymentEngagement,
    MembershipWorkSettings,
    TimesheetPeriod,
    WorkforceLeaveRequest,
)
from attendance.models import AttendanceEvent, AttendanceSession, ProvisionalAttendance
from workforce.roster.validation import work_interval
from workforce.employment_terms import correspondence_profile
from workforce.timesheet_core import _check, _local_date, _minutes, _period_bounds


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
        not getattr(period.pharmacy, "use_chemisttasker_payroll", False)
        or not membership
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
    correspondence = (
        row.award_rate_snapshot.get("correspondence")
        or correspondence_profile(row.employment_type, row.pay_basis)
    )
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
            and getattr(period.pharmacy, "use_chemisttasker_payroll", False)
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
            "payment_preference": assignment.payment_preference_snapshot or None,
            "settlement_channel": assignment.settlement_channel or None,
            "engagement_kind": assignment.engagement_kind or None,
            "engagement_terms_accepted_at": (
                assignment.engagement_terms_accepted_at.isoformat()
                if assignment.engagement_terms_accepted_at else None
            ),
        })
    return rows


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
