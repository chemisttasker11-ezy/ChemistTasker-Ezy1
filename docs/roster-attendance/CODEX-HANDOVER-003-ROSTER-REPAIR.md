# Roster repair handover — 2026-09-16

## Status

The roster/attendance handover was reviewed and partially repaired. Do **not** accept Step 3A as production-ready yet. The backend has focused fixes for data protection, authorization, draft/publish behavior, validation, roster coverage, and worker actions. The production migration route, PostgreSQL rehearsal, full frontend typecheck, and browser acceptance remain incomplete.

The worktree was already dirty. No reset, commit, push, production database access, migration application, or deployment was performed.

## Installed workflow aid

`token-efficiency` was installed from the reviewed GitHub repository at `Naimul-islam-bd/token-efficiency`. It is available to Codex in subsequent turns and was used to keep investigation targeted.

## What was reviewed

The review covered the product rules and checkpoint reports in:

- `ROSTER-ATTENDANCE-PLAN.md`
- `docs/roster-attendance/ROSTER-ATTENDANCE-FINALIZATION-PLAN.md`
- `ANTIGRAVITY-RESULT-ROSTER-SAFETY-001.md`
- `ANTIGRAVITY-RESULT-ROSTER-ACTIONS-001.md`
- `ANTIGRAVITY-CHECKPOINT-006-RESULT.md`
- `ANTIGRAVITY-CHECKPOINT-013-RESULT.md`

The initial findings are preserved in `docs/roster-attendance/CODEX-REVIEW-002.md`.

## Confirmed architecture reuse

The repaired services continue to use ChemistTasker’s existing:

- custom `users.User`
- `Pharmacy`, `Membership`, `PharmacyAdmin`, organization relationship and owner chain
- `Shift`, `ShiftSlot`, `ShiftSlotAssignment`, `ShiftOffer`, leave and availability records
- existing locked-rate calculation, visibility/escalation, notification, and attendance services

No replacement top-level role system or second marketplace was introduced.

## Fixes applied

### Marketplace and legacy data protection

Files: `backend/client_profile/roster_services.py`, `backend/attendance_tests/test_roster_safety_regression.py`.

- Bulk roster assign, time edit, move, delete and unassign paths now reject marketplace/non-rostered bookings instead of overwriting them.
- A confirmed marketplace booking now occupies its slot in roster grid coverage; it no longer appears as a vacancy.
- Roster grid returns `editable` so the frontend can prevent a manager from dragging or editing protected entries.
- Copy/template source selection is restricted to roster-owned or roster-assigned work, rather than blindly including marketplace slots.
- Target-week overwrite was converted away from raw SQL deletion. It uses ORM deletion with checks for marketplace offers, leave history and attendance history.

### Explicit roster slot ownership and planned breaks

Files: `backend/client_profile/models.py`, `backend/client_profile/migrations/0045_roster_slot_ownership.py`, `backend/client_profile/roster_services.py`.

- Added `ShiftSlot.roster_period` to retain ownership when a roster slot is vacant; this prevents an empty marketplace slot being mistaken for an editable roster vacancy.
- Added `ShiftSlot.planned_break_minutes`, with validation that a planned break is shorter than its shift.
- New roster slots, copied slots and template slots set their roster-period ownership.
- Grid data exposes planned break minutes.

Important: migration `0045` is additive but **must not be applied** before the historical migration graph is fully recovered and rehearsed.

### Authorization and draft writes

Files: `backend/client_profile/attendance_views.py`, `backend/attendance_tests/test_roster_safety_regression.py`.

- Validate and publish endpoints now authorize a manager before `get_or_create_roster_period` runs.
- This fixes the reproduced defect where an unauthorized user received 403 but still created a DRAFT roster period.
- Added a roster archive service/API route. Published and archived periods are read-only through normal roster editing paths.

### Eligibility, role and conflict validation

Files: `backend/client_profile/roster_validation.py`, `backend/client_profile/roster_services.py`, `backend/client_profile/roster_worker_actions.py`.

- Added shared roster validation for active accepted membership at the destination pharmacy, required role, leave, availability and shift conflicts.
- Validation uses dated intervals and recognizes overnight shifts, including adjacent-day overlap detection.
- `OTHER_STAFF` compatibility follows the existing ChemistTasker role behavior for assistant/technician/student, instead of requiring an invalid top-level specialty.
- Bulk changes validate and price modified roster assignments before committing.
- Swap and cover replacement approvals revalidate against the live assignment and live target-worker eligibility inside transactions.
- A direct swap is now bound to its own request audit target; passing a different target user is rejected.

### Existing rates, escalation and notifications

Files: `backend/client_profile/roster_services.py`, `backend/client_profile/roster_worker_actions.py`.

- Created/reassigned roster assignments use existing `get_locked_rate_for_slot` rather than leaving stale or missing rates.
- Copy/template work is priced using the target date rather than copying an old worker-specific rate unchanged.
- Releasing a worker routes visibility through existing escalation tier handling instead of directly setting the field.
- Publication schedules notifications after the transaction commits and includes the roster revision in its payload.
- Acknowledgement status only counts acknowledgements at or after the current publish timestamp, preventing stale acknowledgement after unpublish/edit/republish.

### Test harness repair

Files: `backend/attendance_tests/roster_schema.py` and roster test modules.

- Replaced incomplete, hand-picked SQLite test schemas with a complete disposable schema helper. This exposes missing foreign-key target tables instead of masking them with disabled constraints.
- Corrected worker PIN test paths to match the isolated root URL configuration. The module passed when tested with the correct prefix; the prior seven 404s were test-routing failures rather than missing production routes.

## Validation completed before stopping

Passed focused suites while their relevant changes were current:

```powershell
../.venv/Scripts/python.exe manage.py test attendance_tests.test_roster_safety_regression attendance_tests.test_roster_copy_templates attendance_tests.test_roster_v2_acceptance --settings=attendance_tests.settings --verbosity 0
```

Result: 35 passed.

```powershell
../.venv/Scripts/python.exe manage.py test attendance_tests.test_roster_safety_regression attendance_tests.test_roster_copy_templates attendance_tests.test_roster_v2_acceptance attendance_tests.test_roster_worker_actions attendance_tests.test_roster_worker_actions_deterministic --settings=attendance_tests.settings --verbosity 0
```

Result: 55 passed.

```powershell
../.venv/Scripts/python.exe manage.py test attendance_tests.test_acceptance_matrix attendance_tests.test_roster_services attendance_tests.test_roster_api --settings=attendance_tests.settings --verbosity 0
```

Result: 22 passed.

Final isolated backend verification completed after the last repair:

```powershell
..\.venv\Scripts\python.exe manage.py test attendance_tests --settings=attendance_tests.settings --verbosity 0
```

Result: **182 tests passed**. Django reported no system-check issues. The final failure was a stale test assertion comparing a backfilled shift date with the UTC session date; it now correctly uses the destination pharmacy timezone.

```powershell
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --settings=attendance_tests.settings
```

Result: no model changes were missing from the migration set.

## Known unfinished or unverified work

### Blocker: migration foundation and PostgreSQL

- The historical migration graph was previously missing and the generated squashed baselines use `SeparateDatabaseAndState` with zero database operations. Resolving Django state is not a clean database bootstrap.
- `0044_roster_v2_and_attendance_v1.py` and new `0045_roster_slot_ownership.py` need authoritative dependencies from the recovered graph.
- Do not migrate, fake, baseline, or deploy until authoritative historical migration sources are reconciled.
- Rehearse a clean bootstrap and upgrade of a disposable PostgreSQL clone; inspect SQL; verify foreign keys, indexes and constraints; restore a verified backup; then record the full migration ledger.
- PostgreSQL locking behavior (`select_for_update`), JSON lookup behavior and real FK deletion behavior still require integration tests.

### Backend follow-up

- `ShiftSlotSerializer` now exposes `roster_period` and `planned_break_minutes`. Confirm API clients consume the fields during the deferred frontend pass.
- Write direct regression tests for: overnight availability, archived-period behavior, acknowledgement revision invalidation, notification payloads, locked-rate changes on swaps, release with shift offers/history, and cross-organization manager scope.
- The newly added period ownership is only as trustworthy as migration/backfill policy. Existing roster assignments are recognized as legacy roster work during reads; production data needs an explicit, reviewed backfill only after migration recovery.
- Confirm whether manager approval for a release should retain the original assignment history as a soft state rather than delete it. The current preservation guard blocks deletion if leave or attendance history exists.
- Audit `WorkerShiftRequest` state names (`APPROVED`, `AUTO_PUBLISHED`) and all legacy dashboard endpoints for consistent semantics after the service changes.
- The service imports `views` for established role/escalation logic. It works conceptually but should be refactored to a neutral shared module if import coupling causes app-load issues.

### Frontend follow-up

- `RosterGridViews.tsx` was updated to honour backend `editable` and create a draft period before quick-add. The full project typecheck is currently failing, including existing attendance/dashboard errors and roster file errors.
- The typecheck output specifically reports missing `ListItemIcon` and `ListItemText` imports and unused imports/props in `RosterGridViews.tsx`; fix these before claiming the roster frontend is clean.
- The root frontend typecheck had 78 errors. Several were unrelated existing errors in dashboard and attendance pages, but roster changes must be retested after those direct roster errors are corrected.
- Confirm the grid supports 44px touch targets, keyboard alternatives to drag-and-drop, clear protected-state feedback, mobile widths and archive controls. UI guidance was checked: disabled items must be visibly non-interactive and drag operations need menu/button alternatives.
- Add UI controls for archive and planned breaks; only backend support currently exists.

### Scope not completed

- Browser smoke tests for desktop/mobile roster, attendance kiosk, worker acknowledgement, swaps/covers and manager approvals.
- PWA/camera scanner verification.
- Production database and migration deployment.
- Commit/push/deploy.

## Files added in this repair

- `backend/client_profile/roster_validation.py`
- `backend/client_profile/migrations/0045_roster_slot_ownership.py`
- `backend/attendance_tests/roster_schema.py`
- `docs/roster-attendance/CODEX-REVIEW-002.md`
- this handover file

## Recommended continuation order

1. Start the deferred frontend optimization: fix direct roster TypeScript errors, then run the frontend typecheck and roster interaction tests.
2. Add the focused backend regression tests listed above when those flows change again.
3. Recover and reconcile the migration history, then authorize a PostgreSQL rehearsal only after the graph is proven.
4. Run the PostgreSQL suite, browser smoke flows and final diff check before release.

## Important evidence boundary

Antigravity reports claiming a complete PostgreSQL implementation conflict with the recorded migration constraints and are not accepted as proof. The current reviewed state has meaningful repairs, but it has not earned production acceptance.
