# Workforce integration checkpoint - 2026-09-17

## Scope completed

Integrated the supplied Workforce Developer Package into the current kiosk branch after reviewing its baseline and integration script. Payroll calculation, award interpretation, payment providers, STP, banking, superannuation, and contractor payments remain outside this implementation.

## Integration performed

- Added the additive `backend/workforce` Django app, initial migration, revision-safe roster publishing, coverage requirements, dated leave, timesheet projection, manager source-punch correction, review approvals, and associated tests.
- Registered `workforce.apps.WorkforceConfig` and `workforce.tasks`, and mounted `/api/client-profile/workforce/`.
- Added web workforce routes for Timesheets, manager leave, workforce settings, My Hours, and My Leave.
- Added the Expo My Hours and My Leave routes and profile-menu entries for pharmacists and other staff.
- Included `STUDENT` in legacy owner and worker roster role filters.
- Excluded non-rostered marketplace assignments from the editable roster grid.
- Added approved workforce leave windows to the existing roster validator.

## Roster safety and UX changes

- Changed legacy backend and service defaults so roster warnings are blocked unless explicitly acknowledged.
- Replaced the visible legacy publish action with `RosterSafePublishButton`. It revalidates the draft, requires acknowledgement of warning keys, sends the expected revision, and supplies an operation UUID for idempotent publish retries.
- Removed the second publish action from the legacy validation dialog, so there is no UI path that bypasses warning acknowledgement.
- Added `RosterCoveragePanel` beneath the existing toolbar. Calendar, staff, and daily views remain available.

## Package defect repaired

The supplied package defined `TimesheetCheckDecision.check`. Django reserves `check()` for model validation, so the field shadowed the model method and raised `models.E020`. Renamed it to `timesheet_check` in the model, the timesheet decision creator, and the initial workforce migration.

The supplied initial migration also contained Django-version-specific generated index names. Aligned those names with the installed Django version, so `makemigrations workforce --check --dry-run` now reports no model changes.

## Kiosk and multi-pharmacy work retained

The current branch retains the completed kiosk work: mobile kiosk linking is only entered via an explicit kiosk link, owners select the pharmacy before a pairing code is created, and Attendance PIN updates require pharmacy scope for multi-pharmacy users. The desktop kiosk keeps local encrypted storage, pairing state, and the offline attendance outbox in Tauri.

## Validation recorded

- `frontend_web`: `npm run typecheck:kiosk` passed.
- `frontend_web`: `npx tsc --noEmit` passed after the workforce integration.
- `frontend_mobile`: `npx tsc --noEmit` passed after repairing the existing Talent Board optional legacy field access.
- `backend/workforce`: Python compilation passed.
- `git diff --check` passed.
- Django model validation initially identified the `TimesheetCheckDecision.check` collision above. It was repaired.

## PostgreSQL validation completed

The user supplied local PostgreSQL credentials on 2026-09-17. Authentication now succeeds. Credentials were passed only to the validation process and were not added to tracked files.

Django created `test_chemisttasker_kiosk_test_workforce_validation`, applied the full real migration graph including `workforce.0001_initial`, ran all seven workforce tests successfully, and destroyed the disposable database. The existing `chemisttasker` database was not migrated or modified.

The actual PostgreSQL run exposed and resolved:

- Invalid package fixtures: three full-time shifts omitted mandatory hourly pay bounds. Added both bounds to the test fixtures, preserving the existing Shift validation rules.
- A runtime PostgreSQL error in `build_timesheet`: unrestricted `select_for_update` included a nullable membership join. Restricted row locking to the timesheet and its non-null period with `of=("self", "period")`.

Final result: seven tests passed, with Django system checks reporting no issues. These cover stale roster revision rejection, deterministic warning keys, idempotent publishing, roster/actual separation, idempotent timesheet projection, audited missing-clock-out repair with waiver rejection, and full-day leave overlap.

Repeat with the local environment loaded:

```powershell
cd C:\ChemistTasker_Ezy\chemisttasker-ezy
$env:DJANGO_SETTINGS_MODULE = 'attendance_tests.migration_settings'
$env:USE_PROD_DB = 'False'
$env:KIOSK_TEST_DB_NAME = 'chemisttasker_kiosk_test_workforce_validation'
.\.venv\Scripts\python.exe backend\manage.py makemigrations workforce --check --dry-run
.\.venv\Scripts\python.exe backend\manage.py test workforce.tests --noinput
```

Before release, run the package acceptance flow against a disposable PostgreSQL database: roster validate/publish, attendance capture, missing-punch append, rebuild, worker submission, manager time approval, period lock, and multi-pharmacy permissions. Do not run this initial migration against production until that flow passes.
