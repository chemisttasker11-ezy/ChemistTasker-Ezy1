# Planner simplification: grill questions

Method (grill-with-docs: grilling + domain modeling): questions are ordered so each branch's answer unlocks the next;
the first section pins the words, because the PR uses plan / draft / task / item / WorkNote / template / catalogue /
library / standard for overlapping things. Each question carries a recommended default (**Rec**) where the code points
to one; answers are blank for the owner. Record answers that change architecture as ADRs in `docs/adr/`, and new terms in
a glossary. See `MAP.md` for file:line evidence.

## A. Words and the one core decision
Q1. Is a planner task the same thing as a calendar work note (one object, one editor), or a different thing staff see differently?
    Options: same object (WorkNote + optional extras) / separate OperationTask that publishes into a WorkNote (today). **Rec:** same object.
    Answer:
Q2. Do we need a "plan" (named container with type and date range) at all, or is the planner just a week view of the calendar?
    Options: drop plans / keep plan only as a hidden grouping / keep as today. Answer:
Q3. Which single word does the owner want in the UI for a reusable task: "template", "saved task", "routine", or "library item"? (Today: catalogue, library, standards, templates.) Answer:
Q4. Is "draft vs published" needed per task, per day, per week, or not at all (tasks visible to staff as soon as saved)?
    Options: no drafts / per-week "Share with team" / per-task toggle. Answer:
Q5. Should the planner be its own sidebar item, or a "Plan" view/tab inside the existing Calendar page?
    Options: tab in Calendar / keep separate nav item / both. **Rec:** tab or view in Calendar. Answer:

## B. Adding a task directly (the normal path)
Q6. What is the minimum a manager must type to add a task? Options: title only (date = clicked day) / title + who / title + who + time. Answer:
Q7. Where does "add" start: click an empty day/time slot, a "+" on each day, a top "Add task" button, or all three? Answer:
Q8. Which fields stay visible by default, and which move behind "More options"? (Today 15: area, audience, role, members,
    times, checklist, KPI kind/target/unit, training link, verification.) Answer:
Q9. Which of these fields can be deleted outright: area, KPI classification, team target/unit, training link, supervisor verification, plan type? Answer:
Q10. Should add be inline on the board (type and press Enter) or a dialog/drawer? Mobile the same? Answer:
Q11. Is a checklist a list of ticks inside one task, or should each step just be its own task? Answer:
Q12. After saving, does the form stay open for the next task (rapid entry) or close? Answer:
Q13. What happens if a manager adds a task on a date with no published roster: allow, warn, or block (today: block at publish for every non-named audience)? Answer:

## C. Catalogue optional ("save as reusable")
Q14. Should "Save as reusable" be a checkbox/button on any task, instead of a separate Library tab? **Rec:** yes; remove the tab. Answer:
Q15. How does a manager add from saved tasks: a type-ahead in the title field, a side list to drag from, or a picker menu? Answer:
Q16. Keep the 28 built-in starter tasks? Options: drop / show only in empty state as one-click suggestions / keep a browse list. Answer:
Q17. If a saved task is edited later, do tasks already placed on the board change? Options: never (copy on use) / ask / always. Answer:
Q18. Can a saved task carry a repeat rule (e.g. "1st weekday of month"), or is repeating set only when placing it? Answer:
Q19. Pharmacy-level vs organisation-level saved tasks: is the org level needed in v1? Who can create/delete each? Answer:
Q20. Deleting a saved task: confirm with ConfirmDialog; placed tasks remain. Correct? Answer:

## D. Duplicate task / day / week (one action each)
Q21. Duplicate task: same day (today's behaviour), or ask for target date(s) like the roster Duplicate dialog (multi-date, keep person)? Answer:
Q22. Copy day: should the source be the day you're on and the target picked from a mini-calendar (multi-select), instead of two date fields? Answer:
Q23. Copy week: copy to next week only, to N following weeks, or to any chosen week? Answer:
Q24. Target day already has tasks: merge (add), replace, or skip identical titles? Show a count before confirming? **Rec:** merge + skip exact duplicates. Answer:
Q25. Are assigned people copied as-is, re-matched to the target day's roster, or cleared? What if the person is not rostered/inactive on the target day? Answer:
Q26. Copy a published (shared) day into another week: does the copy start as draft or go live immediately? Answer:
Q27. Copying across the plan's date range end: extend the range, refuse, or (if plans are dropped) not an issue? Answer:
Q28. Should duplicate work across pharmacies (org admin copies Store A's week to Store B)? v1 or never? Answer:
Q29. Undo: is a single "Undo" snackbar after copy/delete required, or is confirm-before enough? Answer:
Q30. Drag to move between days: keep, remove, or add Alt-drag = copy? Mobile equivalent? Answer:
Q31. Is "repeat weekly" (recurrence) a better answer than "copy week" for routine tasks? Should we offer only one of them? Answer:

## E. Recurring tasks, dates and time zones
Q32. Use the calendar's existing recurrence (DAILY/WEEKLY/MONTHLY + until) and drop the planner's 11-option engine? Which extra rules (first/last weekday, 28th, yearly) are really used? Answer:
Q33. Editing one occurrence of a repeating task: this one / this and future / all? Answer:
Q34. Task times are pharmacy-local wall-clock. Is any manager planning a store in another state/time zone (org admins)? Answer:
Q35. DST change days and overnight tasks (end before start): allow tasks that cross midnight? Answer:
Q36. Public holidays / closed days: skip automatically, warn, or ignore? Answer:
Q37. "Anytime" tasks (no time): due by close of day, or by end of the person's shift? Answer:

## F. Assigning people and roster awareness
Q38. Which assignment options survive from the five (named, on shift, role on shift, shared pool, every on shift)? **Rec:** "Specific people" and "Whoever is rostered (optional role)". Answer:
Q39. When is "whoever is rostered" resolved: at save, at publish, or live each day (so roster changes flow through)? Answer:
Q40. Roster changes after a task is shared: re-assign automatically, notify manager, or do nothing (today: frozen)? Answer:
Q41. Shared-pool task: one person ticks it done for all, or everyone sees it until done? Answer:
Q42. Should the board show who is rostered each day (mini roster strip) so managers assign without guessing? Answer:
Q43. Clinical tasks: keep AHPRA + on-duty pharmacist checks, or leave it to the manager? Answer:

## G. Edit, delete and publishing
Q44. After a task is shared with staff, can a manager fix a typo, change time, reassign or delete it? (Today: no, never, anywhere.) **Rec:** yes, from the same task dialog. Answer:
Q45. If edited after staff started/completed it: keep progress, reset, or block edit? Answer:
Q46. Delete a shared task: soft-delete with audit, or hard delete? Notify assignees? Answer:
Q47. Is the "Preview staff allocation" step needed, or can blockers show inline on each task card (red badge) with one "Share week" button? Answer:
Q48. Partial publish: share the tasks that are ready and leave blocked ones as draft, or all-or-nothing (today)? Answer:
Q49. Is the revision/optimistic-lock check needed (two managers editing the same week at once)? Answer:
Q50. Do staff get a notification when a week is shared, at shift start (today), both, or none? Answer:
Q51. Delete a whole draft day/week in one action: needed? Answer:

## H. Execution features (keep, move or cut)
Q52. Per-person checklist ticks with evidence notes: keep in v1? Answer:
Q53. Numeric KPI targets and the KPIs tab: keep, move to a report, or cut? Answer:
Q54. Supervisor verification + manager correction with reason: keep, keep only verification, or cut? Answer:
Q55. Training tab and training links: keep in the planner, move to Learning Materials, or cut? Answer:
Q56. "Today & workload" tab: does the calendar's day view already cover it? Answer:
Q57. Audit log: keep server-side only (no UI)? Answer:

## I. Layout, look and empty states
Q58. Use `PageHeader` (title, subtitle, actions) and drop the gradient hero, metric tiles, footer disclaimer and "Handover" text? **Rec:** yes. Answer:
Q59. Board shape: week grid (days as columns) on desktop, one day list on phone? Which day starts the week? Answer:
Q60. Use the dashboard's selected pharmacy instead of a second pharmacy dropdown? Answer:
Q61. Empty board copy and action: "No tasks this week. Add a task, copy last week, or pick from suggestions." Agree? Answer:
Q62. Empty states for: no managed pharmacy, no staff, no roster this week, saved list empty. Which need a call to action? Answer:
Q63. Status words staff and managers see: "Not started / In progress / Done / Needs sign-off" only? Answer:
Q64. Colour per task (area/category) needed, or one colour plus status? Answer:

## J. Roles and permissions
Q65. Who can plan: owner, org admin, pharmacy admin with roster permission (today: `managed_pharmacies`)? Should pharmacists-in-charge also plan? Answer:
Q66. Can staff add their own tasks or only tick assigned ones? Answer:
Q67. Can staff see the whole team's tasks for the day, or only their own (today: only own for ops tasks)? Answer:
Q68. Org admin with many stores: plan per store only, or one view across stores? Answer:

## K. Mobile parity
Q69. Must mobile support direct add, edit, delete, duplicate task/day/week (today: none; templates only)? **Rec:** add + duplicate + edit minimum. Answer:
Q70. Mobile date entry: native date picker instead of typed YYYY-MM-DD? Answer:
Q71. Mobile layout: day list with swipe between days, or week agenda? Answer:
Q72. Same entry point on mobile (Calendar tab) as on web? Answer:

## L. Remove / merge and migration
Q73. Which models can go: OperationPlan, OperationTemplate (vs saved WorkNote), OperationStep, OperationKpiRecord, OperationVerification, OperationAudit? Answer:
Q74. Is there production data from this PR (migration 0004 applied anywhere)? If not, can the migration be rewritten instead of adding a second one? Answer:
Q75. Keep the unrelated recurring-notification fix in `tasks.py` in this PR or split it out? Answer:
Q76. Keep `operation-catalog/` and `operation-context/` endpoints, or fold into existing calendar/pharmacy endpoints? Answer:
Q77. Done check for the redesign: what must a manager do in under N clicks/seconds (e.g. add a task ≤ 2 clicks, copy a week = 1 action + confirm)? Answer:
