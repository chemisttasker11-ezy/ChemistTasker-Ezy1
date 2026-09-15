# Roster and Attendance finalization plan

**Prepared:** 2026-09-15  
**Rule:** Complete, verify, and report one checkpoint before starting the next.

## Fixed product rules

- Keep the existing Pharmacy, Membership, Shift, ShiftSlot, ShiftSlotAssignment,
  availability, leave, marketplace, organization, and owner-chain logic.
- Roster V2 is additive. It must not introduce replacement role systems or delete
  marketplace/open-shift data.
- A confirmed assignment clocks normally. Unscheduled local cover and active staff
  from another pharmacy in the same owner chain or organization may clock in as
  provisional. The worked-pharmacy manager approves it. Approval uses actual clock
  times and creates no permanent membership.
- One pharmacy QR is used. The optional personal code is owner-controlled. Kiosk
  credentials are restricted, hashed, rate-limited, and cannot retain an owner login.

## Checkpoint 0 - preserve and inventory

1. Keep the dirty worktree intact; do not reset, delete, commit, or push unrelated work.
2. Record changed files and SHA-256 fingerprints for migration inputs.
3. Keep `0044_roster_v2_and_attendance_v1.py` quarantined until the authoritative
   historical migration graph is present.

**Exit:** inventory and fingerprints are saved; no database mutation.

## Checkpoint 1 - restore the migration foundation

1. Recover the complete, version-matched migration directories for `users`,
   `client_profile`, and `billing`, including helper modules, from the deployed build,
   source archive, or exact release checkout.
2. Compare names, dependencies, merges, replacements, and hashes with all 178 records
   in the configured database. Determine the real leaf nodes from the graph.
3. Expand the read-only audit to all 12 new tables and confirm that
   `client_profile_workershiftrequest` remains an existing legacy table.
4. Replace the quarantine marker with a new additive Django state migration containing
   only the 12 new roster/attendance models. Use the swappable `users.User` dependency.
5. Rehearse a clean bootstrap and an upgrade of a disposable clone. Inspect generated
   SQL and prove there are no legacy table drops or unrelated alterations.
6. Back up the target (`pg_dump -Fc`, schema-only dump, and `django_migrations` export),
   verify the backup restores, then apply the migration through Django.
7. Save the exact ledger: target identifier, release revision, backup paths/hashes,
   migration file/hash/dependencies, SQL fingerprint, start/end timestamps, command,
   result, added `django_migrations` rows, table/index/constraint verification, and tests.

**Stop condition:** If authoritative migration source cannot be recovered, do not fake,
baseline, `--fake`, use raw `CREATE TABLE IF NOT EXISTS`, or apply the quarantined file.
Treat migration-history reconstruction as a separate reviewed project.

**Exit:** normal Django graph works on clean and upgrade rehearsals; target backup is
verified; exactly the reviewed migration rows and 12 tables are added; migration ledger
is saved for the backend developer.

## Checkpoint 2 - protect existing roster data

1. Scope roster period reads, copy, templates, bulk edits, and overwrite cleanup to
   `ShiftSlotAssignment.is_rostered=True`.
2. Never delete or mutate marketplace/open/non-rostered shifts in the same week.
3. Make owner roster reads side-effect free and keep legacy worker assignments visible
   until a new roster is published.
4. Add focused PostgreSQL-compatible tests for mixed roster/marketplace weeks.

**Exit:** focused tests and the full attendance test suite pass; changed files and test
output are recorded.

## Checkpoint 3 - make worker roster actions deterministic

1. Bind swap approval to its request ID and intended target worker.
2. Reject stale swap/release requests when the assignment or assignee changed.
3. Route owner cover approvals through the new validated service; preserve the original
   assignment until an explicit approval action releases or replaces it.
4. Validate role, active membership, conflicts, approved leave, and assignment ownership.

**Exit:** concurrent swaps, stale requests, and cover approval tests pass.

## Checkpoint 4 - correct provisional attendance approval

1. Require a closed attendance session before shift backfill.
2. On approval, clear the provisional flag, preserve actual times, and avoid duplicate
   backfill under concurrency.
3. Convert times using the pharmacy timezone and infer the correct local work date.
4. Return 403 for authorization failures. Validate correction chronology and audit every
   manual change.
5. Preserve urgent-cover source membership and never create permanent membership.

**Exit:** local, same-chain, same-organization, overnight, correction, and concurrency
tests pass.

## Checkpoint 5 - secure kiosk, QR, and PIN flows

1. Store only hashed kiosk tokens and PINs; accept kiosk authentication through the
   restricted device-token path without conflicting with normal JWT middleware.
2. Add separate throttles for kiosk QR refresh, PIN attempts, worker clock-in, and
   worker clock-out. Use generic PIN failure responses and tested lockout.
3. Prevent draft assignments from becoming normal attendance eligibility.
4. Clear the activating manager's browser credentials after kiosk activation.
5. Add installable PWA support and real camera QR scanning only after backend contracts
   are stable.

**Exit:** security, expiry, brute-force, concurrency, and transition tests pass.

## Checkpoint 6 - finish Roster V2 backend

1. Draft, validate, publish, archive, acknowledgement, copy-week, template, and bulk
   operations use existing shift/slot/assignment models.
2. Validate conflicts, role match, active membership, availability, and approved leave
   during editing and again at publish time.
3. Publish atomically with audit records and worker acknowledgement state.
4. Confirm APIs for staff view, stacked view, vacant shifts, breaks, and publish notices.

**Exit:** backend API and service acceptance tests pass against PostgreSQL.

## Checkpoint 7 - frontend repair and product design

Before editing, Antigravity must read:

- `.agents/skills/ui-ux-pro-max/SKILL.md` for dashboard, accessibility, interaction,
  responsive layout, and React implementation guidance.
- `.agents/skills/design-taste-frontend/SKILL.md` only for applicable visual-polish rules;
  its own scope says it is not a dashboard/data-table workflow.

Use Tanda as a functional benchmark: staff and stacked roster views, quick shift entry,
team/employee filters, vacant shifts, conflicts, breaks, copy week, templates, keyboard
shortcuts, review/publish, worker notifications, acknowledgement, availability, leave,
swap, offer-to-team, and find-cover flows. Match ChemistTasker's existing design tokens
and terminology rather than copying Tanda's visual identity.

Repair TypeScript/MUI failures first. Then implement small responsive slices: planning
toolbar, grid interactions, validation panel, publish flow, worker acknowledgement and
cover actions, manager provisional review, kiosk, and scanner. Each slice requires app
typecheck plus focused interaction/accessibility checks.

**Exit:** app typecheck passes for all changed roster/attendance files; core workflows
pass browser smoke tests on desktop and mobile widths.

## Checkpoint 8 - final acceptance and handover

1. Run migration checks, PostgreSQL backend tests, frontend typecheck/build, and selected
   browser flows.
2. Reconcile the implementation against every fixed product rule above.
3. Produce a backend-developer migration ledger and a final changed-file/API/test report.
4. Do not push or deploy unless separately requested.

