# Grill answers (claude-b)

Verified against `git diff origin/main...HEAD` on `feat/pharmacy-ops-calendar-publishing-20261016`. Paths are short:
`rules` = backend/team_calendar/operations_rules.py, `ops_views` = operations_views.py, `views` = team_calendar/views.py,
`Builder` = frontend_web/.../OperationsPlanBuilder.tsx, `OpsPage` = PharmacyOperationsPage.tsx, `CalDialogs` =
PharmacyCalendarDialogs.tsx, `mobile_ops` = frontend_mobile/roles/shared/operations/index.tsx, `mobile_cal` =
frontend_mobile/roles/shared/calendar/index.tsx.

## A. Words and the one core decision
Q1: Same object: a planner task is a WorkNote (title, body, date, assignees, recurrence, notify) — publish already turns every OperationTask into a plain WorkNote (rules:172-182), so the OperationTask copy and its second editor (OperationsTaskEditor.tsx) are pure duplication; replaced by the calendar's note dialog (CalDialogs:225-340).
Q2: Drop plans — OperationPlan only carries name/period/range/revision/status to gate publish (operations_models.py:38-56); the "planner" becomes a week view of the calendar's WorkNotes. Nothing replaces it.
Q3: "Saved task" — plain words; the code currently says catalogue/library/template/standards (OpsPage tabs, operations_catalog.py), and "template" reads like a document template.
Q4: Not at all — WorkNotes are live when saved (views.py perform_create) and staff already see notes immediately; the draft layer exists only to feed preview/publish (rules:137-189). Replaced by nothing; copy-week-then-edit is the fast path.
Q5: A "Week" (Plan) view inside the Calendar page, not its own nav item — remove the three "Operations Planner" nav entries (navigation.tsx:131, 218, 323) and the `/operations` routes (main.tsx:293, 350, 461).
## B. Adding a task directly
Q6: Title only; date = the day clicked — WorkNote needs only pharmacy/date/title (models.py:87-95); everything else defaults.
Q7: A "+" on each day column plus the existing top "Create work note" button — two entries, both opening the same dialog; no time-slot clicking (WorkNote has no time grid today).
Q8: Visible: title, date, assign to (with "Fill from roster"), repeats. Behind "More": details, start/end time, notify at shift start, save as reusable. Area, audience, KPI, training, verification, free-text checklist go (Q9).
Q9: Delete all six: area, KPI classification, team target/unit, training link, supervisor verification, plan type — none serves add/duplicate/reuse; links go in the details text, and verification/KPIs are execution features cut in Q52-54 (ops_views:338-465).
Q10: Dialog on both — reuse the calendar note dialog (CalDialogs:225; mobile_cal:86-118) rather than building inline board editing; one editor, already on mobile.
Q11: Drop checklists — each step that matters becomes its own task, or lines in details; per-step ticking needs OperationStep + extra mark_done gating (views.py:449-455) for little gain.
Q12: Close, with a "Save & add another" secondary button — tiny, keeps rapid entry without changing the default flow.
Q13: Allow — "Fill from roster" on an unrostered day just shows "No one rostered" and leaves assignees empty; blocking (rules:128-130) is what makes a fresh week un-shareable today.
## C. Catalogue optional
Q14: Yes — a "Save as reusable" checkbox in the note dialog; remove the Task library tab (OpsPage:261-327) and its "save a template first" nudge (Builder:235-237).
Q15: Type-ahead on the title field (MUI Autocomplete freeSolo / mobile menu) filling title, details, times, role from the saved task — no extra screen.
Q16: Show only as type-ahead suggestions (static list in shared-core), never a browse list — keeps the 29 rows' content (operations_catalog.py) without the endpoint or the save-first ritual.
Q17: Never — copy on use; today apply_template already copies fields (rules:258-266) and placed tasks don't follow the template.
Q18: No repeat on saved tasks — repeat is set when placing, using the WorkNote recurrence field; removes the template recurrence + `template_dates` engine (rules:206-242).
Q19: Pharmacy-level only in v1; any planner manager (managed_pharmacies) creates/deletes — org scope adds the XOR rule and a second permission path (ops_views:103-107, operations_serializers:30-31) for one org-admin use case.
Q20: Correct — ConfirmDialog (components/ui/ConfirmDialog.tsx), placed WorkNotes untouched since they are copies (Q17).
## D. Duplicate task / day / week
Q21: Ask for target dates like the roster Duplicate dialog (multi-date, keep people; RosterOwnerPage.tsx:156-170, 629-660) — same-day duplicate (Builder:272) is rarely what's wanted.
Q22: Yes — source = the day whose "Copy day" you clicked, targets from the same multi-date picker as Q21; removes the two date fields (Builder:238-242).
Q23: To any chosen week, defaulting to next week — one picker, one confirm; "N weeks" is what recurrence is for (Q31).
Q24: Merge + skip exact duplicates (same title, date, time), with "Copy 12 tasks (2 skipped)" in the confirm — copy_day today blindly duplicates (ops_views:241-253).
Q25: Copied as-is, silently dropping inactive/departed memberships; managers re-run "Fill from roster" if needed — re-matching needs a stored audience mode we are deleting.
Q26: Live immediately — there is no draft state (Q4).
Q27: Not an issue — no plan range (Q2); only the existing 94-day/400 cap idea survives as a per-request cap on copy size.
Q28: Never in v1 — memberships are per pharmacy, so assignees can't carry over; doubles validation.
Q29: Confirm-before (with the count) is enough; undo needs a bulk-delete endpoint and tracked ids.
Q30: Remove drag-move (Builder:180-186) — editing the date in the dialog moves a task; no mobile equivalent needed.
Q31: Both, because they solve different jobs: "Repeats weekly" for standing routines, "Copy week" for one-off weeks; recurrence already exists (recurrence.py) so it costs nothing new.
## E. Recurring tasks, dates, time zones
Q32: Yes, use the calendar recurrence and delete `template_dates` — the catalog only uses ONCE/DAILY/WEEKLY plus FIRST_DAY_MONTH(1), FIRST_WEEKDAY_MONTH(2), MONTHLY_28(3); LAST_*, BUSINESS_DAY, YEARLY are unused. The few month-day rows become MONTHLY on that date.
Q33: Keep the calendar's existing behaviour (edit applies to the series; completions stay per occurrence via WorkNoteCompletion.occurrence_date) — per-occurrence exceptions would be a new feature.
Q34: Pharmacy-local wall-clock, as today — notifications use the pharmacy's timezone (tasks.py get_pharmacy_timezone) and roster match is local (rules:69-75); org admins plan each store in its own local time.
Q35: Keep rejecting end ≤ start (rules:60-61) — an overnight task is rare; split it in two. Roster overnight matching stays (rules:92-93).
Q36: Ignore — rules:209-210 already decided no state holiday calendar; manager deletes the occurrence.
Q37: Due by end of the day — mark_done has no time check (views.py:437-455); keep it.
## F. Assigning people, roster
Q38: Two: "Specific people" (the existing assignee picker) and a "Fill from roster" button (optional role) that pre-selects whoever is on a published roster at that time — keeps `_rostered_user_ids` (rules:69-96) but stores no audience; drops ON_DUTY/TEAM_POOL/EVERY_ON_DUTY.
Q39: At save (button press) — the result is ordinary assignees the manager can see and edit; live resolution would need a scheduler.
Q40: Do nothing (frozen, as today) — manager edits the task if the roster changes, now possible (Q44).
Q41: Cut the pool mode — every assignee ticks their own completion (WorkNoteCompletion, models.py:171-200); for "one person does it", assign one person. Removes the 1-vs-all threshold (operations_serializers:105, ops_views:413).
Q42: No strip — "Fill from roster" shows who is rostered when it matters; a strip is a new feature.
Q43: Leave it to the manager — "Fill from roster" with role = Pharmacist covers on-duty pharmacists; the AHPRA gate (rules:107-115) belongs to shift booking, not task notes.
## G. Edit, delete, publishing
Q44: Yes, from the same calendar dialog — delete the ops guards (views.py:389-390, 398-399) and the planner immutability (ops_views:154, 300, 311) along with the models.
Q45: Keep progress — WorkNoteCompletion rows stay; no reset logic.
Q46: Hard delete via existing WorkNote destroy with ConfirmDialog; no assignee notification (calendar doesn't notify today).
Q47: Not needed — nothing to publish (Q4); the only roster check is inline in "Fill from roster". Removes preview/publish (ops_views:185-203, Builder:292-321).
Q48: N/A — no publish step.
Q49: Not needed — last write wins, as for every other WorkNote; removes revision bumps across ops_views and Builder.
Q50: At shift start only (today's notify_on_shift_start, default on for planner-added tasks) — no "week shared" notification since there's no share action.
Q51: Not in v1 — single deletes plus confirm; revisit if copy-week mistakes are common.
## H. Execution features
Q52: Cut — one tick per person per occurrence (existing mark_done) is enough; removes OperationStep, `step`/`my_steps` (ops_views:338-368, 467-473) and the mark_done gating (views.py:437-455).
Q53: Cut — KPI records + tab (ops_views:370-402, OpsPage:328-343) don't serve add/duplicate; nothing replaces it.
Q54: Cut both — verification + manager correction (ops_views:404-465) is a compliance subsystem beyond the goals.
Q55: Cut the tab and field — Learning Materials (LearningMaterialsPage.tsx) already exists; paste a link in details.
Q56: Yes — the calendar's selected-day list (PharmacyCalendarPage.tsx:335-345) already is "today"; remove the tab.
Q57: Cut the model — WorkNote created_by/updated_at suffices; nothing left to audit once plans/steps/KPIs go.
## I. Layout, look, empty states
Q58: Yes — the Week view lives on the Calendar page, so the hero (OpsPage:160-197), tiles (:207-210), footer and "Handover" text all disappear; PageHeader stays the page header.
Q59: Week grid of day columns on desktop, one-day list on phone; week starts Monday (recurrence byweekday 0=Monday, recurrence.py:12; AU convention) — note the calendar month grid uses date-fns default Sunday (PharmacyCalendarPage.tsx:320), so pass weekStartsOn: 1 for both.
Q60: Yes — dashboardRouteScope already injects pharmacy_id for /calendar (dashboardRouteScope.ts:6); drop the page's own selector (OpsPage:177-186) with the page.
Q61: Agree, minus "suggestions": "No tasks this week. Add a task or copy last week." — two buttons; suggestions live in the title type-ahead.
Q62: Only "no staff" needs a CTA (link to Manage memberships). No managed pharmacy: Week view hidden. No roster: inline "No one rostered" in Fill-from-roster with a roster link. Saved list empty: nothing.
Q63: Staff: "To do / Done" (their own tick). Managers: "2 of 3 done". Drop "Needs sign-off" with verification; WorkNote's status enum (models.py:82-85) stays as is.
Q64: One colour plus status — area/category colouring dies with the area field.
## J. Roles and permissions
Q65: Keep `managed_pharmacies` (owner, org admin, PharmacyAdmin with roster capability; organizations/access.py:161-191) for the Week view and copy actions; no pharmacist-in-charge planning in v1.
Q66: Leave as today: any active member can already create work notes (views.py:156-170); the Week view and copy actions are manager-only.
Q67: Only their own (+ general notes) — that is the existing WorkNote rule for non-managers (views.py:363), so the ops-specific filters (views.py:366-373, 591-599) can go.
Q68: Per store via the dashboard pharmacy scope; no cross-store view in v1.
## K. Mobile parity
Q69: Yes: add, edit, delete come free from the mobile calendar's note dialog (mobile_cal:86-118, assignees + recurrence); add Copy task/day/week, Fill from roster and Save as reusable there. Delete mobile_ops entirely (272 lines).
Q70: Yes — react-native-paper-dates DatePickerModal is already in mobile_cal:20; the typed YYYY-MM-DD fields (mobile_ops:163-164) go with the screen.
Q71: Day list with prev/next day and a "Copy week" action — matches the phone layout of Q59; no swipe gesture needed.
Q72: Yes — Calendar on both; remove the three mobile "Operations Planner" routes (app/{owner,organization,admin}/operations.tsx and _layout entries).
## L. Remove / merge, migration
Q73: Remove OperationPlan, OperationTask, OperationStep, OperationKpiRecord, OperationVerification, OperationAudit. Replace OperationTemplate with a slim SavedTask (pharmacy, title, body, start_time, end_time, role, created_by).
Q74: Code can't show production state; per the brief assume none, so rewrite 0004 in place to: WorkNote.start_time/end_time (nullable) + SavedTask — no second migration, no data migration.
Q75: Keep it, but add a test — once repeating is done with WorkNote recurrence (Q18, Q32), recurring notes must notify on every occurrence, which is exactly this fix (tasks.py:234-256, 308-329); dedupe per date already exists (`_users_already_notified`). It has no test in test_operations.py.
Q76: Remove both — context duplicates the dashboard pharmacy scope, catalog becomes a static shared-core list (Q16). Add one: `POST work-notes/copy {note_ids, target_dates | day_offset}` serving task, day and week copy.
Q77: Add a task: "+" on a day → type title → Save (2 clicks + typing). Duplicate task/day/week: action → pick date(s)/week → Confirm (≤3 clicks). Reuse: type 2 letters in title → pick. Same counts on phone.

## Proposed simplified design
1. One object: a planner task is a WorkNote; WorkNote gains nullable start_time/end_time (0004 rewritten).
2. The planner is a "Week" view on the existing Calendar page (web + mobile), under PageHeader and the dashboard pharmacy scope.
3. Add/edit/delete use the existing calendar note dialog; fields: title, date, assign, repeats; "More" holds details, times, notify, save-as-reusable.
4. "Fill from roster" (optional role) pre-selects people on a published roster, reusing `_rostered_user_ids`; no audience modes stored.
5. Saved tasks: slim pharmacy-scoped SavedTask, picked via title type-ahead together with the static starter list; no library tab, no catalog endpoint.
6. Duplicate task / day / week: one roster-style multi-date dialog, one atomic `work-notes/copy` endpoint, merge + skip exact duplicates, count in confirm.
7. Repeating uses WorkNote recurrence (DAILY/WEEKLY/MONTHLY); `template_dates` deleted; keep the recurring-notification fix with a test.
8. No plans, drafts, preview, publish, revision or request keys; tasks are live when saved and editable after.
9. Cut checklist steps, KPIs, verification, manager correction, audit, Today/KPI/Training tabs, hero, tiles; done = per-person WorkNoteCompletion.
10. Delete the Operations Planner pages, routes and nav (web + mobile), their shared-core wrappers and the 6 extra models.
