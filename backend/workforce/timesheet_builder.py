"""Building and rebuilding timesheets: one per worker per period, each build a new revision when its inputs
changed."""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from workforce.models import Timesheet, TimesheetCheck, TimesheetPeriod, TimesheetRevision, TimesheetSegment
from workforce.timesheet_checks import _compare_roster_and_actual, _latest_revision
from workforce.timesheet_core import _check, _hash, _local_date, _minutes, _period_bounds, _serialize_dt
from workforce.timesheet_data import _active_membership, _attach_employment_engagements, _contracted_minutes, _modern_leave, _pending_leave_count, _roster_rows, _session_rows, _worker_ids_for_period


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
        modern_leave = _modern_leave(timesheet.user_id, period, start_bound, end_bound)
        slot_linked_assignment_ids = {
            leave.slot_assignment_id
            for leave in modern_leave
            if leave.slot_assignment_id
        }
        fully_leave_covered_assignment_ids = {
            roster["assignment_id"]
            for roster in roster_rows
            if any(leave.start_at <= roster["start"] and leave.end_at >= roster["end"] for leave in modern_leave)
        }
        approved_leave_assignment_ids = slot_linked_assignment_ids | fully_leave_covered_assignment_ids
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
            "pharmacy": {
                "id": period.pharmacy_id,
                "name": period.pharmacy.name,
                "use_chemisttasker_payroll": bool(getattr(period.pharmacy, "use_chemisttasker_payroll", False)),
            },
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
