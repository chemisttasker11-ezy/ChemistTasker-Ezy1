Q1: Use one WorkNote and one task editor; remove the separate OperationTask publication copy — publishing currently creates a WorkNote from another task record (`backend/team_calendar/operations_rules.py:172`; `backend/team_calendar/operations_models.py:59`).

Q2: Drop plans entirely; the planner becomes a calendar week view — names, types, ranges and publication state introduce prerequisites without helping direct entry or duplication (`backend/team_calendar/operations_models.py:38`; `frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:195`).

Q3: Use “Saved task,” with “Save as reusable” as the action — the current interface mixes “standards,” “templates” and “library” for the same reusable content (`frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:264`; `frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:288`).

Q4: Remove draft/publish states; saved tasks appear immediately to eligible assignees, while unassigned tasks remain manager-only — preserve targeted visibility when removing the current `operation_item` dependency (`backend/team_calendar/views.py:366`).

Q5: Put a “Plan” view inside Calendar and remove the separate sidebar item — Calendar already displays the resulting tasks, and the PR adds parallel navigation to reach their preparation screen (`frontend_web/src/navigation.tsx:217`; `frontend_web/src/main.tsx:348`).

Q6: Require only a title; inherit pharmacy and clicked date, and attempt the default roster assignment automatically — the existing calendar already accepts optional assignees, while the planner adds a mandatory plan (`backend/team_calendar/serializers.py:51`; `frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:130`).

Q7: Keep a labelled “Add task” button on each day plus the header action; omit empty-time-slot entry — both buttons already exist, and a separate time-grid interaction adds unnecessary complexity (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:233`; `frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:278`).

Q8: Show title, inherited date and assignment summary; put instructions, assignment/role, optional time, repeat and notifications under “More options” — remove the KPI, area, training and verification controls rather than hiding them (`frontend_web/src/pages/dashboard/sidebar/OperationsTaskEditor.tsx:24`).

Q9: Delete structured area, KPI classification/target/unit, training URL, verification and plan type; use instructions or existing Learning Materials where needed — retain clinical eligibility metadata separately from the removed KPI presentation (`backend/team_calendar/operations_models.py:67`; `backend/team_calendar/operations_rules.py:107`).

Q10: Reuse the calendar task dialog, reduced to the essential fields, with its native equivalent on mobile — maintaining another inline editor creates two editing paths for the same work (`frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarDialogs.tsx:225`; `frontend_web/src/pages/dashboard/sidebar/OperationsTaskEditor.tsx:17`).

Q11: Make each independently completable action a task; put supporting instructions in its body and remove nested checklist execution — WorkNoteCompletion already records completion, whereas checklist ticks introduce another model and submission gate (`backend/team_calendar/models.py:171`; `backend/team_calendar/views.py:449`).

Q12: Close after saving; keep the clicked day selected for the next addition — this preserves existing editor behaviour without adding a rapid-entry mode (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:149`; `frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.tsx:522`).

Q13: Allow saving without a published roster, show “Unassigned,” and offer assignment through the same editor; never silently broaden visibility — the current roster resolver blocks assignment, not task-content validity (`backend/team_calendar/operations_rules.py:128`; `backend/team_calendar/operations_rules.py:48`).

Q14: Yes: put “Save as reusable” on the task and remove the Library tab; replace it with a compact saved-task picker — the current library is a separate preparation workflow (`frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:261`).

Q15: Use a small “From saved tasks” picker alongside direct entry — the existing template selector can be reduced and reused without adding autocomplete behaviour or another drag surface (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:226`).

Q16: Drop the 28 built-in starters; replace them with nothing and let pharmacies save their own tasks — the catalogue brings checklist, KPI, training and specialised recurrence assumptions beyond the stated goals (`backend/team_calendar/operations_catalog.py:33`).

Q17: Placed tasks never change when a saved task changes; retain copy-on-use — template application already copies content into independent task fields (`backend/team_calendar/operations_rules.py:258`).

Q18: Set repeating only when placing a task; remove recurrence from saved-task defaults — the current template recurrence stamps an entire plan and creates a second scheduling workflow (`backend/team_calendar/operations_rules.py:253`; `backend/team_calendar/models.py:104`).

Q19: Keep pharmacy-level saved tasks only for this version, managed by that pharmacy’s authorised managers; remove organisation scope — organisation templates add separate authorisation and scope selection without serving the core fixes (`backend/team_calendar/operations_views.py:103`; `frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:266`).

Q20: Correct: confirm saved-task deletion with ConfirmDialog and leave placed tasks unchanged — the current template relationship already uses SET_NULL, and the shared confirmation component replaces `window.confirm` (`backend/team_calendar/operations_models.py:61`; `frontend_web/src/components/ui/ConfirmDialog.tsx:5`).

Q21: Duplicate a task immediately onto the same day; change its date through the ordinary editor if needed — this preserves the existing one-action behaviour without importing the roster’s multi-date workflow (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:272`).

Q22: Infer the source from the day heading and offer one-action “Copy to tomorrow”; remove the two permanent date fields — arbitrary rescheduling remains available through task editing (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:238`).

Q23: Provide one-action “Copy to next week,” preserving weekday offsets; omit N-week and arbitrary-week controls — the current PR has no week-copy implementation, so add only the missing operation the owner requested (`shared-core/src/domains/calendar/operations.ts:143`).

Q24: Merge by adding independent tasks; do not replace existing work or skip by title. Return the copied count and preserve retry protection — current copy-day already adds tasks atomically, and identical titles can represent legitimate separate duties (`backend/team_calendar/operations_views.py:221`; `backend/team_calendar/operations_views.py:241`).

Q25: For another date, re-match roster-based assignments; retain named people only while active and eligible, warning about missing roster coverage. Same-day duplication retains valid assignees — current copying blindly carries membership IDs (`backend/team_calendar/operations_views.py:246`; `backend/team_calendar/operations_rules.py:99`).

Q26: Copies save immediately under the same visibility rules as new tasks, with fresh completion state; unmatched tasks remain manager-only — there is no replacement draft workflow, and current copying already omits execution records (`backend/team_calendar/operations_views.py:242`; `backend/team_calendar/models.py:171`).

Q27: Dropping plans removes the range-end problem; bound each copy request to its selected day or week — the current restriction exists solely because both dates must fit a plan (`backend/team_calendar/operations_views.py:218`).

Q28: Exclude cross-pharmacy copying; replace it with nothing in this version — current tasks and assignments are pharmacy-scoped, and cross-store copying introduces another permission and staff-mapping problem (`backend/team_calendar/operations_serializers.py:72`; `backend/team_calendar/operations_rules.py:102`).

Q29: Use confirmation before destructive deletion; no new Undo infrastructure. Copy remains immediate and non-destructive — ConfirmDialog already supplies the needed deletion pattern (`frontend_web/src/components/ui/ConfirmDialog.tsx:4`).

Q30: Keep existing desktop drag-to-move as optional convenience; date editing supplies the keyboard/mobile equivalent. Do not add Alt-drag copying — the current drag handler already performs a date PATCH (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:181`).

Q31: Keep both existing recurrence and the requested week copy: recurrence maintains a series, while copy creates independent dated work — WorkNote already stores recurrence, so neither requires another scheduling engine (`backend/team_calendar/models.py:104`; `backend/team_calendar/operations_views.py:242`).

Q32: Use Calendar’s DAILY/WEEKLY/MONTHLY engine; delete the planner engine and its special rules. Catalogue references demonstrate implementation usage, not owner demand for those rules (`backend/team_calendar/recurrence.py:18`; `backend/team_calendar/operations_rules.py:206`; `backend/team_calendar/operations_catalog.py:104`).

Q33: Keep series-wide editing, clearly labelled “Edit repeating task”; omit occurrence-exception modes — the existing calendar edits the base note, and no exception model currently implements “this one” or “this and future” (`frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.tsx:466`).

Q34: Treat dates and times as belonging to the selected pharmacy, including when its manager is elsewhere; actual interstate usage cannot be established from code — Pharmacy already stores an IANA timezone and notifications use its resolver (`backend/organizations/models.py:131`; `backend/organizations/timezone.py:8`).

Q35: Keep same-day task windows and reject end-before-start; retain overnight roster matching. Do not add cross-midnight task support, and validate optional timed entries against the pharmacy timezone on DST transitions — current validation rejects overnight tasks but roster matching handles overnight shifts (`backend/team_calendar/operations_rules.py:60`; `backend/team_calendar/operations_rules.py:92`).

Q36: Do not automatically skip holidays or closed days; managers choose dates — the current engine explicitly lacks a state-specific holiday calendar, so automation would add a new feature (`backend/team_calendar/operations_rules.py:206`).

Q37: “Anytime” means a task for that calendar date, without an enforced shift-end or closing-time deadline — the current assignment window spans the date and does not implement either deadline (`backend/team_calendar/operations_rules.py:84`).

Q38: Keep “Specific people” and “Whoever is rostered,” with optional role filtering; remove the other audience labels — four current non-named modes use the same roster resolver, with differences mainly in completion thresholds (`backend/team_calendar/operations_rules.py:116`; `backend/team_calendar/operations_serializers.py:105`).

Q39: Resolve roster assignments when saving or copying, using the target date; retain the resulting explicit assignees — the existing resolver can move from publication to save without creating a daily reassignment service (`backend/team_calendar/operations_rules.py:99`; `backend/team_calendar/operations_rules.py:177`).

Q40: Do not silently reassign after roster changes; show the saved assignees and let managers revise them through the same editor — current assignment is already a stored snapshot, with no roster-change reconciliation path (`backend/team_calendar/operations_rules.py:177`; `backend/team_calendar/serializers.py:132`).

Q41: Remove shared-pool completion semantics; each assignee records their own completion — WorkNoteCompletion already supports that model, whereas the planner adds the “one submission completes the pool” threshold (`backend/team_calendar/models.py:171`; `backend/team_calendar/operations_serializers.py:105`).

Q42: Omit a mini roster strip; show resolved assignees or an unassigned warning on task cards and use the existing Roster page for detail — current preview already provides resolved membership IDs without embedding another roster interface (`backend/team_calendar/operations_rules.py:153`).

Q43: Keep AHPRA, registration-expiry and published on-duty checks for explicitly clinical duties; carry that eligibility restriction through saves and copies despite removing KPI controls — these are server-side protections already implemented (`backend/team_calendar/operations_rules.py:107`; `backend/team_calendar/operations_rules.py:123`).

Q44: Yes: managers can edit title, instructions, time, assignments and date, or delete, through the same task dialog — the current planner and calendar both reject these changes after publication (`backend/team_calendar/operations_views.py:300`; `backend/team_calendar/views.py:387`).

Q45: Preserve completion for wording/time corrections; prevent changing the date or required assignees of an occurrence with recorded completion, and duplicate it instead — completion is keyed by note, membership and occurrence date, so those changes can misrepresent completed work (`backend/team_calendar/models.py:195`).

Q46: Hard-delete after confirmation, preserving a server-side audit snapshot; add no deletion-notification workflow — ordinary WorkNotes already hard-delete, but completion rows cascade, so the retained audit must survive independently (`backend/team_calendar/views.py:397`; `backend/team_calendar/models.py:175`).

Q47: Remove Preview and Share/Publish entirely; show validation and assignment warnings in the editor/card — preflight currently repeats per-task resolution behind an additional screen-level action (`backend/team_calendar/operations_rules.py:137`; `frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:292`).

Q48: Remove publication as a concept: valid tasks save independently, and missing roster coverage leaves them unassigned. Bulk copy remains atomic for malformed or unauthorised input — existing copy-day already uses a transaction (`backend/team_calendar/operations_views.py:205`; `backend/team_calendar/operations_rules.py:128`).

Q49: Remove plan revisions; use WorkNote’s existing `updated_at` for stale-edit rejection and retain transactions for bulk changes — current revision checking protects publication/copy, while ordinary item PATCH has no client-version check (`backend/team_calendar/models.py:124`; `backend/team_calendar/operations_views.py:295`).

Q50: Send no new “week shared” notification; preserve the optional calendar shift-start notification and existing fallback — Calendar already exposes that choice, while planner publication forces it on (`frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarDialogs.tsx:252`; `backend/team_calendar/operations_rules.py:175`).

Q51: Do not add whole-day/week deletion; use existing task deletion — bulk deletion is outside the owner’s requested duplication fixes, and current deletion operates on tasks or draft plans (`backend/team_calendar/operations_views.py:160`; `backend/team_calendar/operations_views.py:307`).

Q52: Remove per-person checklist ticks and evidence notes; retain per-person whole-task completion and ordinary instructions — OperationStep and its execution endpoint add a separate workflow beyond the requested planner improvements (`backend/team_calendar/operations_models.py:88`; `backend/team_calendar/operations_views.py:340`).

Q53: Cut numeric KPI targets, records and the KPI tab; replace them with nothing — building a report would preserve and extend a subsystem unrelated to direct entry or duplication (`backend/team_calendar/operations_models.py:102`; `frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:328`).

Q54: Cut supervisor verification and reason-based manager correction; use ordinary completion/reopening, without presenting it as clinical authorisation — the current workflow adds another model, lock state and correction endpoint (`backend/team_calendar/operations_models.py:117`; `backend/team_calendar/operations_views.py:404`).

Q55: Remove the Training tab and dedicated training-link field; use existing Learning Materials, referenced in task instructions when useful — that destination already exists in navigation (`frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:344`; `frontend_web/src/navigation.tsx:249`).

Q56: Yes: remove Today & workload and use Calendar’s existing selected-day task list — it already renders date-specific notes and their completion state (`frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.tsx:954`; `frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.tsx:1194`).

Q57: Keep a minimal server-only audit; retarget it to pharmacy/WorkNote changes and preserve deletion snapshots — the current audit depends on a plan with cascading deletion and has no dedicated reader UI (`backend/team_calendar/operations_models.py:124`; `backend/team_calendar/operations_views.py:51`).

Q58: Yes: use PageHeader and existing shared controls/tokens, removing the bespoke hero, metrics, disclaimer and static handover panel — PageHeader explicitly defines the dashboard’s inner-page header pattern (`frontend_web/src/components/ui/PageHeader.tsx:4`; `frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:160`).

Q59: Use seven Monday–Sunday columns on desktop and a selected-day list on phones; make week alignment explicit across clients — current planner columns start at an arbitrary selected date, while recurrence anchors weeks to Monday (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:71`; `backend/team_calendar/recurrence.py:73`).

Q60: Yes: use the dashboard’s selected pharmacy and existing URL scope, with one selector only where Calendar needs it — scope propagation already includes Calendar and Operations (`frontend_web/src/layouts/dashboardRouteScope.ts:1`; `frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:177`).

Q61: Use “No tasks this week. Add a task or copy last week.” Remove suggestions because the catalogue is removed — the current empty state incorrectly directs users to create a plan first (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:216`).

Q62: No pharmacy: explain access and offer existing pharmacy selection/setup where authorised; no staff: offer staff management; no roster: link Roster without blocking add; no saved tasks: explain “Save as reusable” — current empty states mostly describe prerequisites (`frontend_mobile/roles/shared/operations/index.tsx:126`; `frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarDialogs.tsx:360`).

Q63: Use “Not started / In progress / Done”; show “Unassigned” separately and remove “Needs sign-off” — WorkNote already has three states, while verification introduces the fourth (`backend/team_calendar/models.py:82`; `backend/team_calendar/operations_serializers.py:108`).

Q64: Use one task treatment with semantic status indicators and text; remove area/category colours and grouping — the current area grouping adds structure that disappears when the area field is removed (`frontend_web/src/pages/dashboard/sidebar/PharmacyOperationsPage.tsx:234`).

Q65: Preserve `managed_pharmacies`/`user_can_manage_pharmacy`: owners, permitted organisation administrators, scoped regional administrators and roster-capable pharmacy admins; no automatic pharmacist-in-charge privilege — the helper already defines the authority (`backend/organizations/access.py:128`).

Q66: Staff may complete assigned managed tasks; preserve existing informal WorkNote creation separately, without granting planner/bulk permissions — legacy WorkNotes currently allow active-member creation, while planner creation is manager-only (`backend/team_calendar/views.py:156`; `backend/team_calendar/operations_views.py:282`).

Q67: Keep managed tasks visible only to assignees and authorised managers; do not expose the whole team’s work by removing OperationTask — the current restriction explicitly depends on its relationship and must move with the unified object (`backend/team_calendar/views.py:591`).

Q68: Plan one pharmacy at a time using existing scope; omit a cross-store planning board — plans, assignments and task access are currently pharmacy-scoped, so aggregation would introduce another product surface (`backend/team_calendar/operations_views.py:133`; `backend/team_calendar/operations_rules.py:102`).

Q69: Yes: mobile must support direct add, edit, delete, saved-task reuse and task/day/week duplication for everything retained — current mobile imports template application but none of the direct task-mutation functions (`frontend_mobile/roles/shared/operations/index.tsx:8`).

Q70: Reuse Calendar’s existing mobile DatePickerModal instead of typed YYYY-MM-DD fields — the required picker is already implemented in the same mobile calendar (`frontend_mobile/roles/shared/calendar/index.tsx:1262`; `frontend_mobile/roles/shared/operations/index.tsx:164`).

Q71: Use a selected-day list with visible previous/next-day controls and a date picker; omit a separate week agenda or mandatory swipe interaction — the existing mobile calendar already centres interaction on a selected date (`frontend_mobile/roles/shared/calendar/index.tsx:321`; `frontend_mobile/roles/shared/calendar/index.tsx:1262`).

Q72: Yes: use Calendar → Plan on both platforms, preserving pharmacy/date scope; ensure roster-capable admins can reach it even without communications permission — mobile currently gates Calendar by communications while adding Operations separately (`frontend_mobile/app/admin/_layout.tsx:45`; `frontend_mobile/app/admin/_layout.tsx:51`).

Q73: Remove OperationPlan, OperationTask, OperationStep, OperationKpiRecord and OperationVerification; keep a stripped pharmacy-scoped saved-task model and retargeted server audit — WorkNote, WorkNoteAssignee and WorkNoteCompletion replace the task/execution layers (`backend/team_calendar/operations_models.py:10`; `backend/team_calendar/models.py:78`).

Q74: Rewrite migration 0004 under the owner’s explicit assumption that production has not applied it; do not add a compatibility migration for the discarded schema — it currently creates the entire planner model set, and code cannot establish database deployment history (`backend/team_calendar/migrations/0004_operations_planner.py:13`).

Q75: Split the recurring-notification change into a separate change; retain the existing notification option here — the diff changes notification behaviour for all recurring WorkNotes, while planner publication creates non-recurring notes (`backend/team_calendar/tasks.py:234`; `backend/team_calendar/operations_rules.py:172`).

Q76: Remove `operation-catalog/`; fold managed-pharmacy context into existing calendar/pharmacy context, preserving manager-only pharmacies — both calendar clients currently call `operation-context/`, so remove those callers only after replacing that dependency (`backend/team_calendar/operations_views.py:56`; `frontend_mobile/roles/shared/calendar/index.tsx:130`).

Q77: Acceptance target: from an open board, add with Add → title → Save; duplicate task/day/week with one labelled action each, identically on mobile. Verify permissions, fresh completion, copy retries and existing-target merging; none is runtime-proven by this code-only review (`frontend_web/src/pages/dashboard/sidebar/OperationsPlanBuilder.tsx:272`; `backend/team_calendar/test_operations.py:329`).

Proposed simplified design

1. Calendar contains one Plan view; remove separate Operations navigation and its five-tab workspace.
2. WorkNote is the task; use one reduced editor per platform and shared-core contracts.
3. Add directly with a title and inherited date; assignment and other options remain secondary.
4. Save immediately; remove named plans, drafts, previews and publication.
5. Keep saved tasks optional through “Save as reusable” and a compact picker.
6. Duplicate a task, day or week in one action, with atomic writes and safe retries.
7. Preserve pharmacy scope, assignment visibility and clinical eligibility; warn when work is unassigned.
8. Reuse Calendar recurrence and per-person completion; remove checklist, KPI, verification and training subsystems.
9. Use shared dashboard components, icons and tokens; provide every retained action on mobile.
10. Rewrite unapplied 0004; implementation and runtime acceptance remain unverified because this review read code only.

