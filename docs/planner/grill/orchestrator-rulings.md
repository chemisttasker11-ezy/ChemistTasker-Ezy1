# Orchestrator rulings (round 1)

Inputs: GRILL.md, answers-claude-b.md, answers-codex-a.md, and Codex B's review (agreed list + disputes + gaps).
Rule of thumb used: the owner's goals (native feel, direct add, one-action duplicate, remove before adding),
then "keep the existing server logic that protects people and data" (permissions, clinical checks, retry safety).

AGREED by both answerers and Codex B (take the shared answer as decided): Q1, 2, 3, 5, 7, 10, 11, 13, 14, 17, 18,
19, 20, 27, 28, 31, 33, 34, 35, 40, 41, 42, 44, 47, 48, 51, 52, 53, 54, 55, 56, 58, 59, 60, 61, 64, 68, 69, 70, 71,
72, 74. Exception: Q59: the Week view starts Monday; leave the existing month grid and its labels unchanged.

## Disputed: rulings
- Q4: tasks are live on save; unassigned planner tasks are visible to managers only (Codex A).
- Q6: a new task starts with nobody assigned; an explicit "Fill from roster" action adds the rostered people (Codex B).
- Q8: the add form shows title, date and assignees; repeat and the rest sit under "More options" (Codex B).
- Q9: keep the clinical-eligibility flag; drop the other classifications (Codex A).
- Q12: Save closes the dialog and keeps the selected day (Codex A).
- Q15: a compact "Use a saved task" picker in the add dialog; no autocomplete (Codex A).
- Q16: remove the 28 built-in starters (Codex A).
- Q21: "Duplicate" copies the task to the same day in one click (Codex A).
- Q22: "Copy day to tomorrow" in one click (Codex A).
- Q23: "Copy week to next week" in one click, keeping weekday offsets (Codex A).
- Q24: copies are independent; retries are protected by a request key, no content matching (Codex A).
- Q25: copies keep assignees who are still eligible; the result reports anyone dropped; the manager can use "Fill from roster" (Codex B).
- Q26: copies are live with fresh completion and notification state (Codex A).
- Q29: no confirmation for copies; confirm only deletes (Codex A).
- Q30: remove drag-and-drop; change the date in the editor (Claude B).
- Q32: remove the specialised repeat rules; use the calendar's existing repeat (Codex A).
- Q36: no holiday skipping; document that single occurrences of a series can't be excluded (Codex A).
- Q37: tasks are date-scoped; no deadline is enforced or implied (Codex A).
- Q38: no "whoever is rostered" mode; "Fill from roster" produces ordinary assignees (Claude B).
- Q39: roster resolves when "Fill from roster" is pressed; the server re-validates on save and copy (Codex B).
- Q43: keep the server's clinical checks (AHPRA, expiry, on duty) for clinical tasks (Codex A).
- Q45: after any completion, date and assignee changes are blocked; wording edits keep progress (Codex A).
- Q46: delete is hard, with a minimal audit snapshot that survives (Codex A).
- Q49: reject stale edits using an atomic updated_at comparison (Codex A).
- Q50: keep the existing notification default (off) (Codex A).
- Q57 / Q73: keep a saved-task model (the optional "reusable" list) and a minimal audit model retargeted to work notes; remove plans, plan items, checklist steps, KPI records, sign-off and training (Codex A).
- Q62: short contextual empty states, including how to save a reusable task (Codex A).
- Q63: staff see To do / Done only; managers see completion counts (Claude B).
- Q65: one access helper for list and write; scoped regional admins included in both (Codex B).
- Q66 / Q67: planner tasks are distinct from informal notes: managers create/edit/delete planner tasks; staff see only planner tasks assigned to them; informal notes behave exactly as on main (Codex A).
- Q75: keep the recurring-notification fix, with a test (Codex B).
- Q76: keep a managed-pharmacy context endpoint, so both calendars can discover manager-only pharmacies (Codex A).
- Q77: duplicates are the three one-click actions above (Codex A).

## Gaps: rulings
- G1: a persisted WorkNote boolean (e.g. `is_planner_task`) marks planner tasks; informal notes (including ones managers create in the Calendar) stay false.
- G2: "Duplicate" on a repeating task creates one non-repeating task. "Copy day" and "Copy week" copy one-off tasks only and skip repeating series (they already repeat), reporting the skipped count.
- G3: assignees and clinical eligibility are checked at save and copy time, not re-checked for each future occurrence; record this with a `shortcut:` comment.
- G4: copy contract: one server endpoint, atomic transaction, source range + day offset + request key; the audit receipt keyed by request key makes retries return the first result; a cap on tasks copied per call; fresh completion state.
- G5: the Week view fetches the feed for its own date range, including weeks that cross a month or year.
- G6: editing a repeating task edits the series from the note's own start date and keeps its weekday rule.
- Navigation: the Calendar entry must stay reachable for everyone who could reach Operations Planner before (union of the old permissions). Remove the separate Operations nav item and routes on web and mobile.

## Owner decisions recorded for the report (safest default chosen)
- O1: no draft / "share week" step: staff see planner tasks as soon as they're saved. Default: live on save.
- O2: KPI, sign-off, checklist steps and training are removed from this PR (recoverable from commit 9d1c6b76).
- O3: the 28 built-in starter tasks are removed; each pharmacy builds its own saved tasks.
