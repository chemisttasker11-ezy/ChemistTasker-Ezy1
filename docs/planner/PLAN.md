# Build plan (adopted)

Source: Codex A's plan, checked against Claude B's independent plan (they agree). Amendments: copy cap 400 tasks per call (the limit the PR already uses); saved-task fields are title, details, start/end times and the clinical flag (no role, no recurrence, no people/date).

1. Delete web `PharmacyOperationsPage.tsx`, `OperationsPlanBuilder.tsx`, `OperationsTaskEditor.tsx`, `operationsDraftModel.ts`, and the obsolete web/mobile `OperationTaskDialog.tsx` execution dialogs.
2. Delete mobile `roles/shared/operations/index.tsx` and `app/{owner,organization,admin}/operations.tsx`; delete backend `operations_catalog.py` and remove catalogue, plan, publication, checklist, KPI, verification and training APIs.
3. Update backend `team_calendar/models.py`, simplify `operations_models.py`, and rewrite `migrations/0004_operations_planner.py`: WorkNote gains `is_planner_task=False`, clinical eligibility and optional times; retain pharmacy-scoped saved tasks and deletion-surviving audit/copy receipts.
4. Unify planner access through `backend/organizations/access.py`: context, listing and writes share the same pharmacy scope, including regional admins; preserve informal-note behavior from main.
5. Update `views.py`, `serializers.py`, `operations_views.py`, `operations_serializers.py` and `urls.py` for live WorkNote CRUD, saved tasks, roster fill and copying; prevent staff mutations or planner-flag/scope bypasses.
6. Reduce `operations_rules.py` to assignment/time/clinical validation and copy logic: start unassigned, allow absent rosters, resolve explicit “Fill from roster,” and revalidate active accepted pharmacy memberships plus clinical AHPRA/expiry/on-duty eligibility.
7. Implement one atomic copy endpoint with source range, optional task ID, day offset and request key; enforce a task cap and unique scoped audit receipt, replay the original result on retries, and reject key reuse with different input.
8. Copies append independent tasks without content matching, retain eligible assignees, report dropped people, and reset completion/notification state; task duplication removes recurrence, while day/week copies skip series and report the count.
9. Lock planner mutations and completion consistently: atomically compare `updated_at`, block date/assignee changes after any completion, retain progress on wording edits, and snapshot before hard deletion.
10. Saved tasks contain reusable defaults without recurrence or person/date bindings; using one copies its content, and subsequent saved-task edits/deletion never alter placed tasks.
11. Keep the recurring-notification changes in `tasks.py`, with notifications defaulting off; retain Calendar recurrence and document save/copy-only eligibility checks with the required `shortcut:` comment.
12. Update shared-core `contracts/calendar.ts`, `domains/calendar/{api,mappers,operations}.ts` and `api.ts`: remove discarded contracts/exports; type recurrence, series/occurrence identity, timestamps, planner metadata, saved tasks and copy results.
13. Update web `PharmacyCalendarPage.tsx` and its model; add `PharmacyCalendarWeekView.tsx` under Calendar → Plan, using `PageHeader`, `SegmentTabs`, existing icons and dashboard pharmacy/date scope.
14. Render Monday–Sunday columns with header/day Add actions and one-click Duplicate, Copy day to tomorrow and Copy week to next week; fetch the entire selected week across month/year boundaries, leaving the month grid unchanged.
15. Extend `PharmacyCalendarDialogs.tsx`: title/date/assignees first, explicit roster fill, More options, reusable save/picker and `ConfirmDialog` deletes; save closes while retaining the day; series editing loads the original start date and preserves weekdays.
16. Mirror retained actions in mobile `roles/shared/calendar/index.tsx`, extracting its existing task dialog if needed; reuse `DatePickerModal`, Paper controls/icons and confirmation patterns, with selected-day previous/next controls.
17. Update web `navigation.tsx`, `main.tsx`, `dashboardRouteScope.ts` and mobile owner/organization/admin layouts: remove Operations entries/routes, preserve scope, and make Calendar reachable through the union of previous permissions.
18. Rewrite backend `test_operations.py`: prove manager/staff/tenant scope, informal-note regression, clinical/roster validation, all copy modes, rollback/caps/concurrent retries, fresh state, stale edits, completion locks, surviving audits, saved-task independence and recurring notifications.
19. Add shared-core calendar unit tests for wire payloads/mappers, recurrence/series identity, stale tokens, retry-key preservation, copy warnings and empty DELETE responses; add authenticated Playwright journeys for direct add, task/day/week duplication, edit, delete and save/use reusable tasks on desktop and phone layouts.
20. Risks: rewritten 0004 requires recreating already-migrated disposable databases; recurrence anchors, concurrent writes and native parity need explicit verification. Update `docs/architecture/operations_planner_components.md`; Playwright phone coverage must be supplemented by native dialog checks.

OPEN GAPS: none.

