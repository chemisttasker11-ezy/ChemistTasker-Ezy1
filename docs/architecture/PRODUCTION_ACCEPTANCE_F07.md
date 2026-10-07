# F07 production acceptance and closure

Baseline: F06 merge `f1d94df72976a4f8df41e2ee7739401f9762288c`.

F07 is an acceptance milestone, not another architecture or business-rule refactor. It proves the
fully integrated F01-F06 tree with real clients and production-shaped infrastructure. Real staging
is explicitly not a gate; controlled CI is the acceptance authority.

## Required evidence

1. **Real web journey:** production-mode Next owns the browser origin, the real login UI authenticates
   through the Next platform BFF, the browser lands on the Vite dashboard through the production
   dashboard rewrite, and both the canonical `/api/v1/**` facade and `/api/platform/**` return the
   same authenticated Django user.
2. **Real native journeys:** the existing Android and iOS emulator/simulator acceptance workflow is
   required by F07 through its reusable `workflow_call` entrypoint. It uses the compiled native app,
   real backend login, persona navigation, restart persistence, deep links and camera navigation.
3. **PostgreSQL fresh install:** the exact F07 candidate must migrate an empty PostgreSQL 16 database
   from zero and report no migration drift.
4. **Populated PostgreSQL deployment upgrade:** the database is built and seeded using the exact F06
   merge, then the F07 candidate is applied to that same database. Representative user, onboarding,
   pharmacy, membership and admin-assignment records must remain readable with their authority state
   intact.
5. **Generated schema diff:** F06 and F07 generate DRF Spectacular OpenAPI documents against the same
   PostgreSQL-backed settings. F07 must be byte-identical to the F06 API schema unless an explicitly
   reviewed production API change is added to this milestone.
6. **Concurrency:** final PostgreSQL concurrency suites cover the established client-profile races,
   attendance approval locking, roster slot editing and roster publication.
7. **Deployment/security:** production container routing, canonical API roots, BFF ordering, ASGI,
   WebSocket separation, migration ownership, non-root backend execution and HTTPS/security headers
   are asserted. Django `check --deploy --fail-level WARNING` must pass under production-shaped
   environment settings.
8. **Exact-head release evidence:** the F07 release gate requires every acceptance surface above.
   Existing repository security, CodeQL, backend, serializer, shared-core, Vite, Next, mobile and
   kiosk workflows remain independently required before merge.

## Native harness repair — 2026-10-07

Run `37554644023`, head `7c89e1b`, failed on iOS before application login.
The uploaded simulator screenshot shows the Expo development-server launcher;
Metro had not produced the application bundle during the failed assertion.
Android failed in emulator startup and then stalled in unbounded ADB diagnostics.

Native acceptance now builds Android Release and iOS simulator Release with
embedded JavaScript, asserts the bundle exists, and launches the installed app
directly. No Metro server or Expo launcher handoff participates in login or
restart persistence. Simulator signing and test-only Firebase descriptors remain
isolated; generated HTTP allowances apply only to the loopback smoke backend.
Android uses an explicit emulator serial, bounded ADB calls and boot deadlines,
with bounded failure diagnostics. The pinned Maestro version and all login,
persona, pharmacy-selection persistence, deep-link and camera assertions remain.

This is a harness correction, not runtime acceptance evidence. Real Android and
iOS CI must pass on the final repaired head before F07 can close.

Run `37560295352`, head `0f3a9c3`, passed deployment security, populated
PostgreSQL upgrade/schema and the real browser journey. iOS stopped during
`npm ci` with `ECONNRESET`; Android release compilation stopped in AsyncStorage
release lint with `Metaspace`, after Gradle warned its limit was 512 MiB.
Dependency installation now retries only recognized network failures, at most
three clean lockfile installs within a 15-minute step deadline. Deterministic
install failures still fail immediately. npm fetch settings are inherited by
the shared-core preinstall. Android builds the emulator's x86_64 ABI with a
3 GiB heap and 1536 MiB metaspace; release lint remains enabled. Both native
journeys still require fresh hosted execution on the repaired commit.

## Non-goals

- No database model/table additions.
- No migration rewrites.
- No billing-authority or payer-policy changes.
- No Celery task identity changes.
- No compatibility restoration for removed unversioned HTTP APIs.
- PR #139 remains separate and must not be silently incorporated.

## F08 roster withdrawal and release acceptance

A manager can select one worker's roster slot, unpublish it, edit it in place and
republish it independently while the remainder of the week stays published.
Reconciliation of an already published week continues to reject individually
withdrawn slots instead of silently restoring them.

Unpublishing the whole week hides every shift and makes the week editable.
Explicit publication of that draft week validates the entire current roster and
atomically restores all shifts, including slots individually withdrawn earlier.
Validation failure leaves both the week and individual withdrawals unpublished.
Existing assignment identities, worker bindings and contract snapshots survive.
The web and Expo flows explain the difference before whole-week publication.

The F07 acceptance workflow now also runs on stacked F08 application corrections.
Its original acceptance-only file list prevented PostgreSQL upgrade/schema checks
from running on those corrections. The gate retains exact commit identity, the
migration restriction and the F06 schema comparison; it runs the actual acceptance
checks instead of rejecting application files before those checks start.

### Gate frequency

Ordinary pull requests use the existing Shared Core Consolidation release gate,
Backend Finalization Contracts, Serializer Decomposition, static/mobile checks
and repository security checks. F07 production/native acceptance is no longer
triggered for every pull request. It remains available by manual dispatch and on
main pushes for release acceptance. Native Mobile Acceptance retains its manual
and reusable workflow entrypoints.
