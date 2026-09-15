# Roster backend handover review

Date: 2026-09-15. Verdict: **not accepted as complete**.

Reviewed the current local checkout against ROSTER-ATTENDANCE-PLAN.md, the finalization plan, and Antigravity's safety, actions, checkpoint 6 and final checkpoint 13 reports. Application code was not changed. All execution used disposable SQLite settings; no configured database was accessed or migrated. This is backend review evidence, not frontend or deployment acceptance.

## What is correctly reused

- Services use the existing custom User, Pharmacy, Membership, Shift, ShiftSlot, ShiftSlotAssignment, LeaveRequest and UserAvailability models. No replacement top-level user-role system was added.
- Attendance checks confirmed assignments first, including marketplace locums without permanent membership. Unscheduled local, same-owner/chain and same-organization staff use provisional attendance with source-membership evidence.
- Destination approval checks manager access, requires a closed session, uses pharmacy-local actual times, backfills existing shift models, clears the provisional flag and creates no permanent membership.
- Swap/cover services retain assignments on submission and check the current assignee on approval. These are useful foundations, but do not establish full integration correctness.

## Required repairs

### 1. P1 — Bulk roster editing can overwrite marketplace bookings

`backend/client_profile/roster_services.py:1056` (`assign_worker`) uses update_or_create on the existing slot/date without protecting non-rostered assignments. A confirmed marketplace booking can be transferred to another worker and relabelled is_rostered=True. `update_slot_times` and `move_shift` also lack marketplace guards; move updates all assignments on a slot.

Reproduced: a LOCUM_CASUAL slot with is_rostered=False became assigned to another user with is_rostered=True after a roster bulk assign. Enforce the protected-data boundary on every mutation, including unfilled marketplace slots and recurring instances.

### 2. P1 — Forbidden publish requests still write a draft

`backend/client_profile/attendance_views.py:1200` creates the period from pharmacy_id/week_start before checking manager permission. Reproduced with an unrelated authenticated user: response 403, but RosterPeriod was created. Draft existence controls worker visibility and attendance eligibility, so the side effect matters. Authorize before initialization; audit the equivalent validate path.

### 3. P1 — Eligibility checks do not enforce the agreed relationship and role rules

`roster_services.py:269` accepts a matching top-level role without active membership and accepts matching memberships from any pharmacy. `roster_worker_actions.py:44` likewise does not require an active relationship when the top-level role matches. Bulk editing checks user existence, with no role/leave/conflict validation during editing.

Reproduced: a nonmember could be assigned and pass publication validation; a worker whose membership was made inactive passed replacement eligibility. Integrate the established role/relationship logic while preserving the explicit confirmed-marketplace-locum exception. Existing OTHER_STAFF handling in `views.py:111` resolves onboarding specialties; the new exact-role comparisons do not reproduce that behavior. Acceptance fixtures use user.role='ASSISTANT', although the real top-level role is OTHER_STAFF, so they miss this integration gap.

### 4. P1 — Overnight conflicts are missed

Both validators compare bare times on the same slot_date (`roster_services.py:305`, `roster_worker_actions.py:70`). Reproduced: Monday 22:00–Tuesday 06:00 plus Tuesday 05:00–08:00 produced zero validation errors and published successfully. Compare actual dated intervals, including adjacent dates and pharmacy timezones. Availability also reads exact dates only, ignoring the existing recurring availability fields.

### 5. P2 — Filled marketplace shifts appear vacant

`roster_services.py:98` determines occupied slots from is_rostered=True assignments only, then lists every other slot as vacant. Reproduced with a filled marketplace slot. The grid also omits that booked worker from assigned coverage. Keep V2 mutation scope narrow, but use all relevant existing assignments to distinguish confirmed coverage from real vacancies; account for recurring slot/date instances.

### 6. P2 — Republishing changed shifts preserves stale acknowledgements

`roster_services.py:482` stores acknowledgements per period/user; publish does not invalidate or version them. Reproduced: acknowledge, unpublish, change hours, publish again; the worker remained acknowledged. Track the acknowledged publication revision or require acknowledgement after changes.

### 7. P1 — Migration foundation is not demonstrated by the handover

Current 0044 is no longer the quarantined file described in checkpoint 13: it depends on newly generated 0001_squashed_baseline migrations. All three baseline files contain only SeparateDatabaseAndState with **zero database operations**. Their state graph resolves, but they cannot create the legacy schema on a clean database. This does not satisfy the required clean-bootstrap rehearsal.

Only a migration-application ledger template was found in the handover directory. Checkpoint 6 claims live PostgreSQL verification, while checkpoint 13 describes isolated testing and an unapplied quarantined migration. Reconcile the exact source provenance, any later baseline authorization, target state and executed commands. Require the completed backup/restore/upgrade ledger before deployment acceptance. This review did not inspect the live database and cannot establish whether any migration was applied there.

### 8. P2 — Existing assignment/escalation behavior is only partially reused

`roster_worker_actions.py:440` changes visibility directly instead of calling the existing escalation path (`views.py:7043` and `_apply_escalation`). New roster assignment creation omits the locked-rate calculation and notification workflow used by `CreateShiftAndAssignView` (`views.py:7153`). Swapping changes the user without recalculating an existing worker-specific locked rate. Copying carries the old unit_rate into a new date. Review these compatibility differences before payroll work builds on the assignments.

Publication contains no worker notification dispatch. No archive API or planned-break contract was found in the inspected roster routes/services, despite the finalization checklist. These require implementation evidence or an explicit scope adjustment.

### 9. P2 — Overwrite cleanup bypasses related-record handling

`roster_services.py:582` deletes assignments, slots and shifts using raw SQL to accommodate partial test schemas. That bypasses Django's related-record handling for leave, requests, attendance and audits and can fail against real foreign-key constraints. Its ShiftOffer guard references a name not imported in this module, and a broad exception silently suppresses that failure. Test overwrite against realistic linked records and preserve required audit/history data.

## Verification

Executed from backend:

```powershell
../.venv/Scripts/python.exe manage.py test attendance_tests client_profile.test_attendance_helpers --settings=attendance_tests.settings --verbosity 0
```

Result: **186 tests, 179 passed, 7 failed**. All seven failures were worker PIN setup/update requests receiving 404. The tests send /api/client-profile/... while attendance_tests.settings mounts client_profile.urls at root. With a temporary in-memory URL wrapper adding the missing prefix, the entire PIN module passed **9/9**. No source changes were needed for that diagnostic; these failures do not prove the production endpoints are absent.

Additional isolated service/API probes reproduced findings 1–6. The migration loader resolved the disk state without accessing a database; inspection confirmed all three baselines have zero database operations. These checks do not prove PostgreSQL locking, constraint behavior, clean installation or upgrade safety. Some acceptance fixtures disable foreign-key checking and bypass migrations, leaving those requirements untested.

Repair order: protect marketplace data and authorize before writes; integrate eligibility/conflict rules; correct coverage and publication lifecycle; reconcile migration provenance and rehearse PostgreSQL; then verify rates, escalation, notifications and remaining API contracts. Step 3A should remain open.
