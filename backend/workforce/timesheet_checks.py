"""Roster-vs-actual reconciliation: matching attendance to rostered shifts and raising the timesheet checks
(with their tolerances), and the effective state of a revision's checks."""
from workforce.models import TimesheetCheckDecision
from workforce.timesheet_core import _check, _serialize_dt


CHECK_START_TOLERANCE_MINUTES = 5


CHECK_FINISH_TOLERANCE_MINUTES = 5


CHECK_DURATION_TOLERANCE_MINUTES = 5


CHECK_BREAK_TOLERANCE_MINUTES = 5


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
