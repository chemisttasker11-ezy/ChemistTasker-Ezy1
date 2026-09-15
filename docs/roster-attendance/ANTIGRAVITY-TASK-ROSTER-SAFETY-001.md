# Antigravity task - roster data safety checkpoint

Use the currently selected **Gemini 3.8 Flash, Medium** model. This is one bounded coding
checkpoint. Do not continue into attendance security, migrations, or frontend work.

## Read first

1. `docs/roster-attendance/ROSTER-ATTENDANCE-FINALIZATION-PLAN.md`
2. `docs/roster-attendance/CODEX-REVIEW-001.md`
3. `backend/client_profile/roster_services.py`
4. `backend/client_profile/views.py` around `RosterWorkerViewSet`
5. Existing roster tests under `backend/attendance_tests/`

## Implement

1. Ensure roster-period assignment selection includes only assignments explicitly marked
   `is_rostered=True`.
2. Make copy/template/bulk overwrite cleanup incapable of changing or deleting any
   `is_rostered=False` assignment, its marketplace/open slot, or its shift.
3. Make owner roster-period GET side-effect free. Reading a week must not create a draft.
   If creation is required, use an explicit write action already compatible with the API,
   or add the smallest explicit write action and tests.
4. Preserve legacy rostered assignment visibility in the worker roster until the relevant
   Roster V2 period has actually been published. A draft must not hide existing work.
5. Add focused regression tests for a week containing both rostered and marketplace/open
   assignments, owner read without mutation, and draft-versus-published worker visibility.

## Constraints

- Preserve the existing Pharmacy, Membership, Shift, ShiftSlot, ShiftSlotAssignment,
  marketplace, availability, leave, organization, and owner-chain behavior.
- Do not edit models or migrations in this checkpoint.
- Do not touch frontend code.
- Do not reset, delete, commit, push, run migrations, or modify the configured database.
- Keep the patch small and reuse existing services and conventions.

## Verify and report

Run focused tests and then:

`..\.venv\Scripts\python.exe manage.py test attendance_tests --settings=attendance_tests.settings`

Write `docs/roster-attendance/ANTIGRAVITY-RESULT-ROSTER-SAFETY-001.md` containing:

- exact files and behavior changed;
- tests added and exact commands/results;
- assumptions and any remaining risks;
- `git diff --check` result;
- a clear `COMPLETE` or `BLOCKED` status.

Stop after writing the report. Do not claim completion if tests fail.
