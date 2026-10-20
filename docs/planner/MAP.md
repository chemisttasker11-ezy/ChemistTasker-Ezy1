# Pharmacy Operations Planner (PR #181): map

Source: `git diff origin/main...HEAD` (35 files, +3706). Line refs are on this branch.

## What it does
A manager (owner, org admin, roster-capable admin) builds a **draft plan** (name, type, date range ≤94 days, ≤400 tasks)
for one pharmacy, fills it with **tasks** (hand-made or stamped from a saved **template**), previews staff matching against
the **published roster**, then **publishes**. Publishing turns every task into a calendar **WorkNote** with assignees.
Staff then tick a per-person checklist, enter KPI numbers, submit via the calendar, and a manager may **verify**.
After publish the plan is frozen: no edits, no deletes, from the planner or the calendar.

## Screens and flows
**Web** `/dashboard/{owner|organization|admin}/operations` → `PharmacyOperationsPage.tsx` (nav item "Operations Planner").
1. Own gradient hero + own pharmacy selector + "Open authoritative calendar" (PharmacyOperationsPage.tsx:160-197).
2. Four metric tiles (:207-210), then 5 tabs (:21-28): Today & workload, Plan builder, Task library, KPIs & compliance, Training.
3. *Today*: date picker, published tasks grouped by area, "Details" opens `OperationTaskDialog` (:218-257).
4. *Plan builder* (`OperationsPlanBuilder.tsx`):
   a. "New plan" form: name, type (daily/weekly/monthly/training/campaign/other), start, end → Create draft (:195-207).
   b. Pick plan from a dropdown (:211-215). Empty state: "Create your first … plan" (:216).
   c. "Apply template" select + "Schedule template" (:226-232); if no templates: "Start by saving a pharmacy template
      from the curated library" + jump to Library tab (:235-237). This is the "catalogue first" feeling.
   d. "Add task" (top, :233) or "Add" in a day column (:278-280) opens an inline 15-field form (`OperationsTaskEditor.tsx`).
   e. 7-day grid of day columns (:252-283); per card: Edit, Duplicate (same day only, :272), Remove; drag card to another day.
   f. Copy day: two date pickers "Copy tasks from / To date" + Copy day (:238-242). No copy week.
   g. "Preview staff allocation" (required) → then "Publish to calendar" (:292-321). Blockers listed as "Task 123: …".
5. *Task library*: 28 static starter templates by category → "Save to library" (pharmacy or org scope); saved list with
   Remove; "New custom template name" creates an empty template (:261-327). Templates can't be edited in the UI.
6. *KPIs*: operational/clinical target bars + safety counts (:328-343). *Training*: published tasks of type training or with a link (:344-363).
7. **Calendar** (`PharmacyCalendarPage.tsx`): published ops notes hide Edit/Delete/status toggle and show
   "Checklist & progress" → `OperationTaskDialog` (steps, evidence note, KPI entry, submit/reopen, verify, manager correction).

**Mobile** (owner/organization/admin sidebar "Operations Planner" → `frontend_mobile/roles/shared/operations/index.tsx`).
1. Dark hero card, pharmacy menu, 3 metric cards, "Open calendar" card (:116-151).
2. Plans card: New plan (name, type chips, dates typed as YYYY-MM-DD text) (:156-168); plan menu (:169-175).
3. Draft: choose saved template → "Add work for selected dates"; Preview → Publish (:182-211).
   **No add-task, no edit, no delete, no duplicate, no copy day** on mobile. Only templates → the catalogue is mandatory here.
4. Task list with Open (published only) (:214-225). Template library: Save starter templates (:229-251).
5. Calendar `roles/shared/calendar/index.tsx` + `OperationTaskDialog.tsx`: same as web calendar.

## Data model (`backend/team_calendar/operations_models.py`, migration 0004)
- `OperationTemplate`: pharmacy XOR organization; name, category, area, description, recurrence{freq,byweekday}, audience,
  role_codes[], checklist[{id,label,required}], requires_verification, target_value/unit/kind, training_url, active.
- `OperationPlan`: pharmacy, name, period, starts_on, ends_on, notes, status DRAFT|PUBLISHED, revision, created/published by/at.
- `OperationTask` (plan FK, template FK null, calendar_note 1:1 WorkNote null): date, title, description, area, start/end_time,
  audience, membership_ids[], role_codes[], checklist, requires_verification, target_*, training_url. Unique (plan, template, date).
- `OperationStep` (task, membership, step_id, evidence), `OperationKpiRecord` (task, key UUID, value),
  `OperationVerification` (1:1 task), `OperationAudit` (plan, task, actor, action, details).
- Existing `WorkNote` gains a read-only `operation` block in its serializer (serializers.py get_operation).

API (`team_calendar/urls.py`): `GET operation-context/` (managed pharmacies + categories), `GET operation-catalog/` (static list),
`operation-templates/` CRUD, `operation-plans/` CRUD + `apply_template`, `preview`, `publish`, `copy_day`,
`operation-items/` CRUD + `step`, `record_kpi`, `verify`, `manager_reopen`, `my_steps`.
Shared client: `shared-core/src/domains/calendar/operations.ts` (one wrapper per endpoint).

## Publishing and roster awareness (`operations_rules.py`)
- `check_item` (:48) validates date in plan, audience, roles, times, clinical ⇒ pharmacist.
- `resolve_memberships` (:99): eligible = active accepted memberships (minus CONTACT), filtered by role; clinical also needs
  AHPRA-verified, unexpired pharmacists. NAMED ⇒ the chosen people. Every other audience (ON_DUTY, ROLE_ON_DUTY, TEAM_POOL,
  EVERY_ON_DUTY) ⇒ people on a **published roster** slot overlapping the task time (`_rostered_user_ids` :69, incl. overnight).
  No roster match ⇒ **blocker**; the default audience is ROLE_ON_DUTY, so a brand-new task cannot publish without a published roster.
- `preview` = `preflight` (:137); `publish_plan` (:160) needs the previewed `revision`, row-locks, creates one WorkNote + assignees
  per task (`notify_on_shift_start=True`, no recurrence), sets PUBLISHED, audits. Assignees are frozen at publish time.
- Visibility: ops WorkNotes only to assignees and managers (views.py:366-373, CalendarFeed :591-599).
  `mark_done` requires required steps done and the published date (views.py:437-455). Plain WorkNote edit/delete is refused
  for ops notes (views.py:389-390, 398-399), and plans/tasks are immutable once published (operations_views.py:154, 300, 311).

## Over-built or duplicated
1. **Plan layer on top of the calendar.** Plan name/type/range/revision/draft/preview/publish (operations_views.py:129-262,
   PlanBuilder.tsx:195-321) just to create WorkNotes, which the calendar already creates directly with assignees and recurrence
   (PharmacyCalendarDialogs.tsx:33-43). Two "add work" paths, two editors.
2. **Three copies of a task shape**: static catalog (operations_catalog.py:33-152) → OperationTemplate → OperationTask, plus
   field-by-field copying in 5 places: rules.py:258-266, operations_views.py:242-251, PlanBuilder.tsx:156-163,
   PharmacyOperationsPage.tsx:139-147, mobile operations/index.tsx:239-245.
3. **Second recurrence engine** `template_dates` with 11 frequencies (rules.py:206-242) next to the calendar's
   `recurrence.expand_recurrence_dates` (DAILY/WEEKLY/MONTHLY). Templates use one, WorkNotes the other.
4. **Task form with 15 fields** (OperationsTaskEditor.tsx:24-80): 5 audience modes (operationsDraftModel.ts:11-17),
   role, area, KPI kind/target/unit, training link, verification, free-text checklist.
5. **Execution sub-system**: per-member checklist steps, UUID-idempotent KPI records, verification, manager correction with
   reasons, audit log (operations_views.py:338-473, 4 models), KPI and Training tabs (PharmacyOperationsPage.tsx:328-363).
6. **Two-step publish + optimistic revision + copy-day request keys** (PlanBuilder.tsx:46,165-180,292-321; views.py:193-262).
7. **Five tabs + 4 metric tiles + static "Handover and exceptions" text + footer disclaimer** (PharmacyOperationsPage.tsx:207-257, 367-369).
8. **Two duplicate actions with different semantics**: per-card Duplicate (same day only) vs Copy day (two date pickers); drag-move.
9. Out-of-scope rider: recurring WorkNote shift-start notification change in `tasks.py` (:234-256, :308-329).

## Existing ChemistTasker patterns it ignores
- `components/ui/PageHeader.tsx` ("the one header for inner dashboard pages", used by 23 files, e.g. RosterOwnerPage.tsx:934):
  replaced by a custom navy gradient hero with hard-coded hex colours (PharmacyOperationsPage.tsx:160-197). Mobile hero
  also hard-codes `#172c60`, `#f6f8ff` (operations/index.tsx:258-272).
- `MetricStrip` (vs `PillMetric` :33-37), `SegmentTabs` (vs raw MUI Tabs :212-217), `SectionCard`, `Pill` (vs raw Chip),
  `ConfirmDialog` (vs `window.confirm` :297), `Hint`, `--ct-*` tokens.
- Dashboard pharmacy scope: page keeps its own pharmacy selector (:177-186) on top of the dashboard's `pharmacy_id` scope.
- Roster's existing Duplicate dialog (multi-date, keep-user) in RosterOwnerPage.tsx:156-170, 629-660 is not reused.
- Calendar's own WorkNote dialog (assignees, recurrence, notify) is not reused; ops tasks are a parallel editor.
- Copy reads as a separate product: "CHEMISTTASKER · PHARMACY OPERATIONS", "Your pharmacy, organised.", "authoritative calendar".
