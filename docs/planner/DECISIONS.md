# Planner simplification: decisions log

Sources: GRILL.md, grill/answers-claude-b.md, grill/answers-codex-a.md, grill/orchestrator-rulings.md (final).
"agreed" = both answerers and Codex B agreed; "ruling" = settled by the orchestrator rulings.

## Summary of the simplified design
1. A planner task is a WorkNote marked `is_planner_task`; the planner is a Monday-start Week view inside the Calendar page (web and mobile).
2. Managers add a task directly (title, date, assignees) in the Calendar's own dialog; it is live on save. There are no plans, drafts, previews or publishing.
3. Duplicate a task, copy a day to tomorrow or a week to next week, each in one click, through one atomic copy endpoint that retries safely.
4. "Save as reusable" and "Use a saved task" are optional, using a slim pharmacy-level saved-task model. The 28 built-in starters are removed.
5. Repeats use the Calendar's DAILY/WEEKLY/MONTHLY rules. Each person ticks their own completion. Server clinical checks stay for clinical tasks.
6. Checklists, KPIs, verification, training, area, audiences, the separate Operations page, its nav and its routes are all removed.

## A. Words and the core decision
Q1: A planner task is a WorkNote (one object, one editor) (source: agreed)
Q2: No plans; the planner is a week view of the calendar (source: agreed)
Q3: The UI word is "Saved task"; the action is "Save as reusable" (source: agreed)
Q4: No drafts. Tasks are live when saved; unassigned planner tasks are visible to managers only (source: ruling)
Q5: A Week view inside the Calendar page, not its own nav item (source: agreed)
## B. Adding a task directly
Q6: A task starts with nobody assigned. Only the title is required; the date is the day clicked. "Fill from roster" adds the rostered people (source: ruling)
Q7: "Add task" on each day plus one header action; no clicking on time slots (source: agreed)
Q8: The form shows title, date and assignees; repeat, details, times, notify, clinical and save-as-reusable sit under "More options" (source: ruling)
Q9: Keep the clinical-eligibility flag; delete area, KPI kind/target/unit, training link, verification and plan type (source: ruling)
Q10: A dialog on both platforms, reusing the Calendar's existing task dialog (source: agreed)
Q11: No checklists: each step that matters is its own task, or a line in the details (source: agreed)
Q12: Save closes the dialog and keeps the selected day (source: ruling)
Q13: Adding on a day with no roster is allowed and the task stays unassigned; nothing is blocked (source: agreed)
## C. Saved tasks (optional)
Q14: "Save as reusable" lives on the task; the Library tab is removed (source: agreed)
Q15: A compact "Use a saved task" picker in the add dialog; no autocomplete (source: ruling)
Q16: The 28 built-in starter tasks are removed (source: ruling)
Q17: Placed tasks never change when a saved task is edited (copied on use) (source: agreed)
Q18: Saved tasks don't repeat; repeat is chosen when the task is placed (source: agreed)
Q19: Saved tasks are pharmacy-level only; that pharmacy's managers create and delete them (source: agreed)
Q20: Deleting a saved task asks for confirmation (ConfirmDialog); placed tasks stay (source: agreed)
## D. Duplicate task / day / week
Q21: "Duplicate" copies the task to the same day in one click (source: ruling)
Q22: "Copy day to tomorrow" in one click (source: ruling)
Q23: "Copy week to next week" in one click, keeping each task's weekday (source: ruling)
Q24: Copies are added as independent tasks with no title matching; a request key makes retries safe (source: ruling)
Q25: Copies keep assignees who are still eligible; the result names anyone dropped; "Fill from roster" can refill (source: ruling)
Q26: Copies are live, with fresh completion and notification state (source: ruling)
Q27: Not an issue without plans; each copy request has a size cap (source: agreed)
Q28: No copying across pharmacies (source: agreed)
Q29: Copies have no confirmation and no undo; only deletes ask for confirmation (source: ruling)
Q30: Drag-and-drop is removed; change the date in the editor (source: ruling)
Q31: Keep both: repeat for routines, copy week for one-off weeks (source: agreed)
## E. Repeats, dates and time zones
Q32: Use the Calendar's DAILY/WEEKLY/MONTHLY repeat (with an "until" date); the planner's special rules are deleted (source: ruling)
Q33: Editing a repeating task edits the whole series; single occurrences can't be changed on their own (source: agreed)
Q34: Times are the pharmacy's local wall-clock time (source: agreed)
Q35: End must be after start; no tasks that cross midnight (source: agreed)
Q36: No holiday skipping; the docs say single occurrences of a series can't be excluded (source: ruling)
Q37: Tasks belong to a date; no deadline is enforced or implied (source: ruling)
## F. Assigning people and the roster
Q38: No "whoever is rostered" mode; "Fill from roster" (optional role) produces ordinary assignees (source: ruling)
Q39: The roster is read when "Fill from roster" is pressed; the server re-checks assignees on save and copy (source: ruling)
Q40: Roster changes don't reassign anything; the manager edits the task (source: agreed)
Q41: No shared pool; each assignee ticks their own completion (source: agreed)
Q42: No roster strip on the board (source: agreed)
Q43: Keep the server's clinical checks (AHPRA, registration expiry, on duty) for clinical tasks (source: ruling)
## G. Edit, delete and publishing
Q44: Managers can edit or delete any planner task from the same dialog at any time (source: agreed)
Q45: After any completion, date and assignee changes are blocked; wording edits keep progress (source: ruling)
Q46: Delete is a hard delete, with a minimal audit snapshot that survives it; no notification (source: ruling)
Q47: No preview or publish step (source: agreed)
Q48: Not applicable: nothing is published (source: agreed)
Q49: Stale edits are rejected by an atomic `updated_at` comparison (source: ruling)
Q50: The existing notification default (off) stays; no "week shared" notification (source: ruling)
Q51: No whole-day or whole-week delete (source: agreed)
## H. Execution features
Q52: Checklist ticks and evidence notes are cut; per-person whole-task completion stays (source: agreed)
Q53: KPI targets, records and the KPI tab are cut (source: agreed)
Q54: Supervisor verification and manager correction are cut (source: agreed)
Q55: The Training tab and training-link field are cut; use Learning Materials (source: agreed)
Q56: The "Today & workload" tab is cut; the Calendar's selected-day list covers it (source: agreed)
Q57: Keep a minimal server-only audit model, retargeted to WorkNotes; no audit UI (source: ruling)
## I. Layout, look and empty states
Q58: PageHeader only; no gradient hero, metric tiles, footer disclaimer or Handover text (source: agreed)
Q59: Desktop shows seven Monday-Sunday columns and phones show a one-day list. The existing month grid and its labels don't change (source: agreed, with ruling exception)
Q60: Use the dashboard's selected pharmacy; no second pharmacy dropdown (source: agreed)
Q61: Empty week: "No tasks this week. Add a task or copy last week." (source: agreed)
Q62: Short empty states with context, including how to save a reusable task (source: ruling)
Q63: Staff see To do / Done; managers see completion counts ("2 of 3 done") (source: ruling)
Q64: One colour plus status; no colours by area or category (source: agreed)
## J. Roles and permissions
Q65: One access helper for listing and writing; owners, org admins, roster-capable pharmacy admins and scoped regional admins (source: ruling)
Q66: Only managers create, edit and delete planner tasks; informal notes behave exactly as on main (source: ruling)
Q67: Staff see only the planner tasks assigned to them; informal notes behave exactly as on main (source: ruling)
Q68: Plan one store at a time; no view across stores (source: agreed)
## K. Mobile
Q69: Mobile supports add, edit, delete, duplicate task/day/week and saved tasks (source: agreed)
Q70: Use the existing DatePickerModal, not typed dates (source: agreed)
Q71: A one-day list with previous/next-day controls and a date picker (source: agreed)
Q72: Calendar is the entry point on mobile as on web (source: agreed)
## L. Removal and migration
Q73: Keep a slim SavedTask and a minimal audit model. Remove plans, plan items, checklist steps, KPI records, verification and training (source: ruling)
Q74: No production data, so rewrite migration 0004 in place; no second migration (source: agreed)
Q75: Keep the recurring-notification fix in this PR and add a test (source: ruling)
Q76: Remove `operation-catalog/`; keep a managed-pharmacy context endpoint so both calendars find manager-only pharmacies (source: ruling)
Q77: Done means add = Add, title, Save, and duplicate task/day/week = one click each, the same on phones (source: ruling)

## Gaps
G1: A stored WorkNote boolean `is_planner_task` marks planner tasks; informal notes, including ones managers create in the Calendar, stay false (source: ruling)
G2: Duplicating a repeating task makes one non-repeating task. Copy day and copy week skip repeating series and report how many were skipped (source: ruling)
G3: Assignees and clinical eligibility are checked at save and copy, not for each future occurrence; mark this with a `shortcut:` comment (source: ruling)
G4: One copy endpoint, in an atomic transaction: source range + day offset + request key. The audit receipt for that key returns the first result on retry. Capped per call, fresh completion state (source: ruling)
G5: The Week view fetches the feed for its own date range, including weeks that cross a month or year (source: ruling)
G6: Editing a repeating task edits the series from the note's own start date and keeps its weekday rule (source: ruling)
Navigation: Calendar stays reachable for everyone who could reach Operations Planner (the union of both permission sets); the Operations nav item and routes are removed on web and mobile (source: ruling)

## Owner decisions (safest default chosen)
O1: No draft or "share week" step: staff see planner tasks as soon as they are saved.
O2: KPI, sign-off, checklist steps and training leave this PR (recoverable from commit 9d1c6b76).
O3: The 28 built-in starter tasks are removed; each pharmacy builds its own saved tasks.
