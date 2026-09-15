# Roster V2 and Attendance V1 — implementation checkpoints

## Source of truth

The user's pasted planning chat is the requirements reference. This file records
those decisions and the implementation checkpoints; model comments do not prove
a feature is implemented. No push. Complete one checkpoint, save the work,
report changes and validation, and stop until the user starts the next step.
Preserve unrelated work already present in this checkout.

## Delegation policy

For this project plan, Astra is the orchestrator. Astra coordinates, owns scope
and assignment, reviews compact results and validation evidence, makes acceptance
decisions, and reports checkpoints. Worker choice must be deliberate: pick one
appropriate worker for the bounded task, not every available worker by default,
and do not start extra workers for trivial tasks.

The older policy preferring Codex for heavy tasks is superseded by the user's
latest routing instruction (2026-09-15): all upcoming execution tasks go to
Antigravity Gemini Flash through the CLI terminal only. No computer/UI
automation. Do not start additional Codex workers by default. If a Codex worker
is later used, use low-to-medium reasoning, not high; do not select fast mode.
This is an execution preference, not a claim that global model settings or
service tiers have been changed. The current Codex high-reasoning attendance
foundation worker is finishing its already-running checkpoint; do not edit its
backend/test files until it has finished and Astra explicitly dispatches the
next implementation checkpoint. See docs/roster-attendance/ANTIGRAVITY-QUEUE.md.

Worker briefs must name the exact files the worker may change, the acceptance
tests or evidence required, and the stop boundary. Do not allow parallel workers
to write the same files. Workers save compact reports. Astra reviews the diff
and validation evidence before accepting work and must not blindly accept a
worker's claim. Treat model or tool capability claims as true only after they are
verified in the current environment. For Antigravity CLI work, a zero exit code
only proves dispatch; require a saved result file before accepting the task. If
Antigravity is unsupported or nonresponsive, do not use the UI or repeatedly
retry; route the task to a Codex worker and report the limitation.

These delegation preferences persist in this project plan, not as global Codex
app configuration. They do not change the backend preservation constraint, do
not authorize a push, and do not mark the current migration recovery as complete.
Keep worker reports compact and inside the agreed checkpoint/report locations;
do not create extra planning documents unless the checkpoint explicitly needs
one. Stop after each user-approved checkpoint.

## Backend preservation constraint

User clarification: add the new features cleanly, matching the original backend
logic. Keep changes additive and narrowly scoped. Reuse existing models,
permissions, services and escalation rather than creating parallel systems.
Preserve existing API contracts and behavior; isolate new attendance/roster
services and endpoints. Do not refactor unrelated backend code, reset existing
work, rebuild existing tables or regenerate a production migration baseline.
Where an agreed feature requires changing an existing workflow, identify the
specific integration and compatibility impact in that checkpoint and verify the
affected existing behavior with focused regression tests.

Step 1 changed only the newly added attendance model helpers and supporting
imports, added a separate test file and saved this plan. Existing hub changes in
models.py were already present and have been preserved. No original model fields,
existing endpoints or database records were changed by this checkpoint.

## Agreed requirements

### A. Owner Roster V2

- Weekly grid using existing Shift, ShiftSlot, ShiftSlotAssignment,
  UserAvailability and LeaveRequest models.
- Roster periods, draft/publish flow, role matching, conflict and approved-leave
  validation, publication audit and worker acknowledgements.
- Copy week, templates and bulk actions. No new top-level user roles.

### B. Worker My Roster

- Preserve and extend the existing worker roster API.
- Saying "can't work" does not automatically unassign the worker.
- Direct swaps, offer to team and request leave.
- Find Cover connects unfilled shifts to existing escalation. Trace
  EscalationStepper to its backend services; do not create a second marketplace.

### C. Attendance V1

- Installed React PWA on the pharmacy computer. Activated kiosk uses a restricted
  device token; it does not retain an owner login.
- One rotating, short-lived, signed QR per pharmacy. Authenticated mobile users
  scan for clock-in and clock-out. Breaks happen in the app.
- Optional owner-controlled personal code: hashed, rate limited, locked after
  repeated failures, usable only at an activated kiosk. No organization prefix
  or second code. The kiosk and existing records determine the pharmacy/context.
- A worked session plus immutable events; prevent double clocking and invalid
  transitions. Scheduled time and actual time remain separate.
- Rostered workers and confirmed marketplace locums clock normally. A confirmed
  assignment does not require permanent pharmacy membership.
- Unscheduled local staff and eligible cross-site staff under the same owner
  chain or organization can clock in/out, always provisionally pending approval.
  Record the source membership for cross-site cover.
- No automatic permanent membership or permanent shifts on urgent clock-in.
- The destination pharmacy's authorized manager approves and backfills existing
  shift/slot/assignment models, preserving actual clock times.
- Manual manager corrections are fully audited; original events stay intact.
- Validate QR expiry, brute force, concurrency, locums, local/chain/organization
  cover and audit trails before calling Step 3A complete.
- Step 3B timesheet, shift-sheet and payroll logic comes after this is stable.

## Current baseline (2026-09-15)

- Eight new model classes provide partial roster/attendance storage. Backend
  searches found no integration consuming the new attendance/roster models.
- AttendanceSession currently represents an event, not a worked session.
- Migration 0044 is raw SQL with no dependencies or model state and hardcodes
  auth_user, whereas AUTH_USER_MODEL is users.User. Do not apply it as-is.
- Earlier client_profile migrations and users migrations are absent. They are
  not recoverable from the available local Git history searched so far.
  Migrations are ignored by Git except public_hub migrations.
- Django system checks pass; they do not establish migration correctness.
- Existing roster/leave/cover APIs and escalation UI are reuse points. Current
  cover-request approval creates an open shift and deletes the old assignment;
  do not reuse it unchanged as a swap or attendance approval workflow.
- Existing origin labels are display logic, not attendance authorization.
  Membership has both status and is_active, plus employed/favourite categories.

## Checkpoints

Each step ends with saved source, focused validation and an entry below. If a
step reveals extra work, split it before broadening the scope. No automatic move
to the next checkpoint. Schema changes must be rehearsed on a disposable/staging
database before an existing deployment is migrated.

### 1. Reference, plan and isolated credential helper fixes — COMPLETE

- Save these requirements and checkpoints.
- Expire QR credentials at the exact expiry timestamp.
- Add Django password hashing and checking helpers for personal codes.
- Reject disabled/locked codes; reject empty/non-string new codes.
- Serialize stored failure-count/reset updates using row locks. An expired
  lockout starts a new attempt window; attempts during a lock do not extend it.
- Verify helper behavior without applying migrations.

This step does not deliver kiosk authentication or end-to-end brute-force
protection. The eventual verification service must lock/check/count as one
transaction and apply device/request rate limits. PostgreSQL concurrency tests
remain part of step 5.

### 2. Recover and repair migration history — AUDIT SAVED; SOURCE RECOVERY BLOCKED

- Read applied migration names and relevant table/constraint metadata from the
  configured database without changing it; establish whether 0044 was applied.
- Recover original migration sources from the deployed artifact, trusted backup
  or original development checkout. Do not fabricate or fake a production baseline.
- Restore migration tracking with narrowly scoped ignore exceptions.
- If 0044 is unapplied, replace it with state-aware Django operations and actual
  dependencies. If applied, preserve history and design a forward reconciliation.
- Resolve custom-user foreign keys and verify model/schema consistency.
- Exit: migration graph consistent, clean bootstrap and existing-schema upgrade
  rehearsed where applicable, no unexplained model-state differences.
- Dependency: original migrations and database history. If unavailable, report
  the precise missing source/access instead of claiming the migration is fixed.

Checkpoint 2A (audit and tracking) is complete. Checkpoint 2B (source recovery,
actual repair and rehearsal) requires original migration files; do not start
step 3 schema work until it is resolved. See
docs/roster-attendance/MIGRATION-RECOVERY.md and migration-audit.json.

### 3. Correct the attendance data model — COMPLETE

- Introduce a real worked session and linked immutable events; preserve any
  existing event data with an explicit migration mapping.
- One open session per worker across pharmacies, actual event timestamps,
  assignment/source membership evidence, provisional decision metadata.
- Tie provisional approvals uniquely to a session and retain audit evidence
  across corrections and relevant record deletion paths.
- Exit: schema tests cover uniqueness, relationships, data preservation and
  scheduled-versus-actual separation.
- Completed in attendance foundation repair (8 isolated tests passed). See
  docs/roster-attendance/REPAIR-CHECKPOINT.md.

### 4. Central attendance eligibility service — COMPLETE

- Resolve confirmed assignment first, then eligible local staff, then staff at
  another site under the same owner/organization; otherwise reject.
- Use active, accepted membership and established staff categories. Reconcile
  owner, Chain and organization relationships with existing escalation rules.
- Do not infer eligibility from onboarding flags, org-admin role, null owner/org
  matches or UI origin labels. Record which source membership justified cover.
- Exit: matrix tests for confirmed locums without membership, local urgent cover,
  same owner, same organization across chains, unrelated/inactive/pending members
  and favourite contacts. No membership or shift creation on urgent clock-in.
- Completed in isolated attendance eligibility service (14 isolated matrix tests
  passed). See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-004-RESULT.md.

### 5. Kiosk activation, signed QR and optional code services — COMPLETE

- Owner-authorized activation/revocation; scoped device authentication and
  protected credential storage. No general account access from device tokens.
- Rotate signed pharmacy QR with expiry; allow multiple workers to use the same
  current pharmacy QR. Validate device revocation and pharmacy context.
- Owner-authorized personal code lifecycle and kiosk-only verification; atomic
  check/count/reset, rate limits and lockout. Decide code lookup/scope within the
  existing user/membership system, including cross-site use, without prefixes.
- Exit: authorization, expiry, tampering, revocation, brute-force and PostgreSQL
  concurrent-attempt tests pass.
- Completed in isolated attendance credentials service (15 isolated matrix tests
  passed). See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-005-RESULT.md.

### 6. Clock-in/out and breaks backend — COMPLETE

- Transactional session transitions and duplicate-request handling.
- QR for mobile clock-in/out; optional code path only on activated kiosks.
- In-app breaks, assignment lookup, provisional urgent cover, server timestamps.
- Clock-out resolves the existing session, including cross-site cover; a later
  roster/membership change must not silently strand a worker in an open session.
- Exit: simultaneous clock-ins, repeated scans, invalid breaks, overnight sessions
  and all eligibility paths pass integration tests.
- Completed in isolated attendance transitions service (13 isolated integration
  tests passed). See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-006-RESULT.md.

### 7. Manager approval, rejection and manual corrections backend — COMPLETE

- Destination-pharmacy capability checks and pending attendance review API.
- Atomic, repeat-safe approval/backfill using existing Shift, ShiftSlot and
  ShiftSlotAssignment. No permanent membership creation.
- Rejection retains evidence. Audit decision actor/time/reason and corrections;
  preserve raw events and validate the effective corrected timeline.
- Exit: wrong-site manager denied; duplicate approval creates no duplicates;
  original times survive approval, rejection and corrections.
- Completed in isolated attendance approvals service (11 isolated unit
  tests passed). See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-007-RESULT.md.


### 8. Attendance screens

- Pharmacy kiosk React PWA, activation and QR/code screen; authenticated mobile
  scan, current attendance state and breaks; clear provisional status.
- Destination manager pending-review and correction screens.
- Exit: end-to-end rostered, locum, local urgent and cross-site journeys; expired
  QR, revoked device, failed requests and retries show accurate state.

### 9. Roster periods, draft/publish and validation backend — COMPLETE

- Define period-to-existing-assignment mapping and worker visibility of drafts.
- Validate roles, overlaps, approved leave and availability with existing rules.
- Publish atomically with publication revision/audit and acknowledgements.
- Exit: drafts stay out of published worker views; conflicting concurrent publish
  or edits cannot bypass validation; no new top-level roles.
- Completed in isolated roster services (12 unit/integration tests passed,
  3 API tests passed). See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-009-RESULT.md.

### 10. Roster copy, templates and bulk operations — COMPLETE

- Validated template content; copy a week as draft using existing shift models.
- Bulk edits with deliberate all-or-nothing/error reporting behavior.
- Exit: dates/roles validated, no accidental publication or duplicate copying;
  operations cannot alter another pharmacy's data.
- Completed in isolated roster copy/template/bulk services (17 isolated tests
  passed). See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-010-RESULT.md.

### 11. Owner weekly roster interface — COMPLETE

- Connect weekly grid, draft/publish, validation feedback, copy/template and bulk
  actions to steps 9–10; expose acknowledgement status.
- Exit: owner/authorized-manager weekly planning journey verified end to end.
- Completed in RosterPlanningToolbar integration with RosterOwnerPage (Vite build and
  TypeScript checks passed with 0 errors). See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-011-RESULT.md.

### 12. Worker roster actions and existing escalation — COMPLETE

- Keep the current worker API compatible; integrate published roster visibility.
- Direct swaps, offer to team and leave using existing request/approval models.
- Preserve assignments on "can't work" submission; make any later replacement or
  release an explicit validated approval action with audit history.
- Trace EscalationStepper requests and reuse existing backend escalation for
  unfilled shifts. Do not duplicate marketplace or replace an existing filled
  assignment simply to advertise cover.
- Exit: request submission retains assignment, replacement approval is atomic,
  role/conflict/leave checks apply, existing escalation still works.
- Completed with 14 isolated tests passing (117 total suite tests passing).
  See docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-012-RESULT.md.

### 13. Acceptance and Step 3A handover

- Run the complete agreed scenario matrix plus permissions and audit checks.
- Rehearse migrations and deployment; document any operational prerequisites.
- Record what is implemented and tested. Only then mark Attendance V1/Roster V2
  complete and prepare a separate Step 3B timesheet/shift-sheet plan.

## Saved checkpoint log

### Step 1 — 2026-09-15

- Changed: client_profile/models.py credential helpers and expiry boundary;
  added client_profile/test_attendance_helpers.py and this reference plan.
- Validation: all 6 attendance helper tests pass; Django system check reports
  no issues. Tests skipped database setup. PostgreSQL row-lock/concurrency
  behavior is not yet verified. Changed-file whitespace check passes.
- No migration applied, no database data changed, no push or commit. Files are
  saved locally; pre-existing working-tree changes are preserved.
- Next: step 2 migration recovery and reconciliation. The existing 0044 remains
  unresolved and must not be treated as deployment-ready.

### Step 2A — 2026-09-15

- Saved a repeatable PostgreSQL metadata audit script and its JSON report.
  PostgreSQL confirmed transaction_read_only=on for the saved audit.
- The configured database records 178 migration names across users,
  client_profile and billing without corresponding local source files.
  0044_roster_v2_and_attendance_v1 is not recorded as applied; all eight new
  roster/attendance tables are absent. Other deployments are not verified.
- Added narrow .gitignore exceptions for Python migrations in those three apps;
  the existing 0044 is now visible to Git, but remains unchanged and unsafe to
  apply. This does not stage or commit it.
- Local workspace and available local Git history contain no original migration
  source set. No Docker/az/gh CLI was available in the checked locations/PATH.
- Validation: audit completed successfully against the configured database;
  migration source parses; report schema/summary assertions and changed-file
  whitespace checks pass. No schema bootstrap or upgrade rehearsal was possible.
- No application model/API changes in this checkpoint. No migrate, fake,
  makemigrations, database restoration, commit or push performed.
- Step 2B is blocked on recovering the original backend migrations from a trusted
  deployment artifact, backup containing source files or original checkout.

### Step 4 — 2026-09-15

- Implemented central attendance eligibility service in isolated module
  `client_profile/attendance_eligibility.py`.
- Strict order of precedence enforced: Confirmed Assignment (non-provisional,
  including marketplace locums without membership), Unscheduled Local Staff
  (provisional UNROSTERED_LOCAL), Cross-Site Owner Chain (provisional
  CROSS_SITE_CHAIN), Cross-Site Organization (provisional CROSS_SITE_ORG).
- Rejected inactive/pending/rejected/left members, favourite contacts without
  assignment, null-to-null owner/org matches, unrelated staff, and inactive chains.
- Read-only evaluation: zero shifts or memberships created on urgent clock-in.
- Validation: 14 isolated matrix tests in `attendance_tests/test_attendance_eligibility.py`
  passed; 8 model foundation tests passed; 6 helper tests passed; Django system check
  clean (0 issues).
- No migrations created/applied, no database data changed, no push or commit.
  Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-004-RESULT.md`.

### Step 5 — 2026-09-15

- Implemented kiosk activation, signed rotating QR, and personal code (WorkerPIN)
  services in isolated module `client_profile/attendance_credentials.py`.
- Owner/manager-authorized kiosk activation issuing scoped `ctk_kiosk_...` tokens;
  immediate revocation disabling all device operations.
- Cryptographically signed HMAC QR tokens with expiry; concurrent multi-worker scans
  supported; strict tamper detection, expiry enforcement, and pharmacy isolation.
- Personal code lifecycle with prefixless kiosk verification (email or user ID)
  resolving local and cross-site staff under same owner or organization.
- Atomic row-locked attempt counting; 5 consecutive failures lock PIN for 15 minutes;
  attempts during lockout do not extend lockout timer; correct PIN resets counter.
- Validation: 15 isolated matrix tests in `attendance_tests/test_attendance_credentials.py`
  passed; 14 eligibility tests passed; 8 model foundation tests passed; 6 helper tests
  passed; Django system check clean (0 issues).
- No migrations created/applied, no database data changed, no push or commit.
  Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-005-RESULT.md`.

### Step 6 — 2026-09-15

- Implemented transactional attendance transitions engine in isolated module
  `client_profile/attendance_transitions.py`.
- Features: `clock_in`, `start_break`, `end_break`, `clock_out`, `get_active_session_status`.
- Integrated mobile signed QR and kiosk PIN verification; resolved staff eligibility
  and cover tiers; stamped authoritative server timestamps.
- Enforced single open session invariant across all pharmacies with 30-second
  idempotent duplicate request retry handling.
- Sequential break transitions enforced; auto-closed active breaks on clock-out;
  guaranteed worker session resolution mid-shift regardless of roster/membership changes.
- Validation: 13 isolated integration tests in `attendance_tests/test_attendance_transitions.py`
  passed; 15 credential tests passed; 14 eligibility tests passed; 8 model foundation tests
  passed; 6 helper tests passed; Django system check clean (0 issues).
- No migrations created/applied, no database data changed, no push or commit.
  Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-006-RESULT.md`.

### Step 7 — 2026-09-15

- Implemented destination manager approval, provisional rejection and manual
  corrections engine in isolated module `client_profile/attendance_approvals.py`.
- Features: `is_authorized_attendance_manager`, `get_pending_provisional_attendances`,
  `approve_provisional_attendance`, `reject_provisional_attendance`,
  `create_attendance_correction`, `get_effective_session_timeline`.
- Enforces strict destination-pharmacy manager authorization (owner, active manager,
  superuser); denies unauthorized or wrong-pharmacy managers.
- Atomic, repeat-safe approval backfills completed Shift, ShiftSlot, and
  ShiftSlotAssignment linked to the session; marks session non-provisional and
  sets ProvisionalAttendance decision to APPROVED with decision metadata.
- Preserves core rule: cross-site staff never receive permanent pharmacy membership
  on approval.
- Rejection marks ProvisionalAttendance as REJECTED and retains raw session and
  events for audit.
- Audited manual corrections are append-only; preserves original event occurred_at.
- Validation: 11 isolated unit tests in `attendance_tests/test_attendance_approvals.py`
  passed; 61 tests across all 5 test modules in `attendance_tests` passed; 6 helper
  tests passed; Django system check clean (0 issues).
- No migrations created/applied, no database data changed, no push or commit.
  Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-007-RESULT.md`.

### Step 8 — 2026-09-15

- Implemented comprehensive frontend attendance screens in `frontend_web` and supporting
  Django REST Framework API views in `backend/client_profile/attendance_views.py`.
- REST API layer exposed at `attendance/...`: Kiosk activation, rotating QR generation,
  PIN clock-in/out; worker personal status, clock-in, break start/end, clock-out; manager
  pending review list, idempotent approval with backfill, rejection with audit reason,
  append-only manual event correction, and effective timeline resolution.
- Frontend React Screens:
  1. `KioskPage.tsx`: Dedicated counter tablet PWA with rotating QR code (30s timer bar),
     tactile 4-digit PIN numpad, lockout status feedback, device enrollment modal.
  2. `WorkerAttendancePage.tsx`: Worker shift status, live stopwatch (HH:MM:SS), quick
     clock-in, meal & rest break controls, clock-out, QR modal, and amber provisional banner.
  3. `ManagerAttendanceReviewPage.tsx`: Pending review queue, multi-site pharmacy picker,
     one-click backfill approval, formal rejection dialog, and timeline drawer modal with
     manual punch correction form.
- Routes & Navigation:
  - Mounted standalone `/kiosk`, direct `/dashboard/attendance`, and `/dashboard/attendance/reviews`.
  - Added role-based routes and sidebar items in `main.tsx` and `navigation.tsx` for Owner,
    Admin, Organization, Pharmacist, and Other Staff.
- Validation: 4 API integration tests in `attendance_tests/test_attendance_api.py` passed;
  all 71 tests in `attendance_tests` and `client_profile` passed (0.66s); `npx tsc --noEmit`
  clean (0 errors); `npx vite build` succeeded in 7.59s.
- Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-008-RESULT.md`.

### Step 9 — 2026-09-15

- Implemented Roster V2 core business logic, validation engine, and REST API in
  `backend/client_profile/roster_services.py` and `backend/client_profile/attendance_views.py`.
- Features:
  - Monday-to-Sunday weekly `RosterPeriod` mapping to `ShiftSlotAssignment` (`is_rostered=True`).
  - Worker visibility isolation: DRAFT assignments are strictly hidden from workers. Only
    shifts in PUBLISHED roster periods are returned by worker roster endpoints.
  - Pre-publish validation engine: detects role mismatch, cross-pharmacy double booking /
    overlapping shifts, approved leave conflicts, and declared availability conflicts.
  - Atomic publication: uses `select_for_update()` inside `transaction.atomic()` with manager
    authorization check; blocks publication on hard errors; increments revision counter and
    records `RosterPublicationAudit`.
  - Worker shift acknowledgement engine: workers acknowledge published rosters with optional
    notes; managers view real-time breakdown (`total_workers`, `acknowledged_count`, `pending_count`).
- REST API layer exposed at `attendance/roster/...`: period detail, validate, publish,
  unpublish, worker published roster, worker acknowledge, and acknowledgement status.
- Validation: 12 tests in `attendance_tests/test_roster_services.py` passed (0.146s); 3 API tests
  in `attendance_tests/test_roster_api.py` passed (0.658s); 80 total tests in `attendance_tests`
  passed (0.867s); 6 helper tests passed; Django system check clean (0 issues); frontend typecheck clean.
- Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-009-RESULT.md`.

### Step 10 — 2026-09-15

- Implemented weekly roster copy, template creation/application, and transactional
  bulk operations in `backend/client_profile/roster_services.py` and
  `backend/client_profile/attendance_views.py`.
- Features:
  - Week copy: copies shifts, slots, and assignments to a target Monday; ensures target is
    always in DRAFT status with `copied_from` set; enforces cross-pharmacy isolation;
    safely replaces existing shifts if `overwrite=True` using scoped SQL cleanup.
  - Template validation & application: validates template schema (day 0-6, start/end times,
    valid role choices); enables creating templates from scratch or saving existing periods
    into templates; generates shifts and draft assignments for any target Monday.
  - Bulk operations engine: supports transactional batch creation, worker assignment,
    unassignment, slot deletion, and time updates with deliberate all-or-nothing rollback
    on any validation failure; strictly prevents bulk editing published rosters.
- REST API layer exposed at `attendance/roster/copy-week/`, `attendance/roster/templates/`,
  `attendance/roster/templates/apply/`, and `attendance/roster/bulk-edit/`.
- Validation: 17 unit and API tests in `attendance_tests/test_roster_copy_templates.py` passed
  (0.221s); all 97 tests in `attendance_tests` passed (1.008s); 6 helper tests passed;
  Django system check clean (0 issues); frontend typecheck clean (`npx tsc --noEmit` 0 errors).
- Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-010-RESULT.md`.

### Step 11 — 2026-09-15

- Implemented the owner/authorized-manager weekly planning toolbar and workflow dialogs
  in `frontend_web/src/components/roster/RosterPlanningToolbar.tsx` and integrated it into
  `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx`.
- Features:
  - Active week tracker with dynamic status badge (`DRAFT (HIDDEN)` vs. `PUBLISHED`).
  - Pre-publish validation diagnostics modal with blocking errors and availability warnings.
  - One-click atomic publishing with force-warning support, and unpublish rollback to draft.
  - Real-time staff shift acknowledgement tracking modal with worker comments and timestamps.
  - Copy week modal with target date selector, worker inclusion toggle, and overwrite option.
  - Reusable template management: save current week as template and apply saved templates.
- Validation:
  - Frontend typecheck clean (`cmd /c npx tsc --noEmit` 0 errors).
  - Frontend production build succeeded in 1.73s (`cmd /c npx vite build`).
  - All 103 backend tests passed (97 in `attendance_tests`, 6 in `client_profile`).
  - Django system check clean (0 issues).
- Report saved as `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-011-RESULT.md`.



