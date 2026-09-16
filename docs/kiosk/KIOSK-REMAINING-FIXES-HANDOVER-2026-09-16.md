# ChemistTasker remaining kiosk fixes — implementation handover

**Date:** 16 September 2026  
**Starting commit:** `d78b2c13d6677b5695427c8c612e27433634a346` (`Kiosk Fixed`)  
**Reviewer specification:** `01_IMPLEMENTATION_PLAN.md` and `02_DEVELOPER_HANDOVER.md` supplied by the user  
**Historical checkpoint retained:** `docs/kiosk/KIOSK-REPAIR-HANDOVER-2026-09-16.md`  
**Current status:** KF02 CORE REPLAY REPAIR IMPLEMENTED AND COMPILED; KF04 ATOMIC CODE REDEMPTION IMPLEMENTED AND FOCUSED TESTED; FULL A–H RELEASE GATE REMAINS OPEN

## Second-review corrections at `6cbe008`

The follow-up reviewer report identified valid gaps in the first implementation. The following corrections were then made:

### PostgreSQL-safe pairing lock

- Removed `select_related("resulting_device")` from the `select_for_update()` authorization lookup. Because `resulting_device` is nullable, the former outer join is incompatible with PostgreSQL row locking.
- The transaction now locks only the authorization row. Related pharmacy/user objects are resolved normally while the authorization lock remains held.
- Real PostgreSQL simultaneous-redemption testing is still required; the source-level incompatibility is fixed but not PostgreSQL-certified.

### Screen-level lost-response recovery

- Added the request lifecycle `PREPARED -> COMMITTED -> RECEIPT_CONFIRMED`.
- `prepare_capture_request` recovers both prepared and committed-but-unconfirmed requests.
- React confirms the native receipt only after `capture_pin_attendance` returns it to the renderer.
- A lost response therefore leaves the request `COMMITTED`; after restart and worker re-authentication, the screen recovers the original ID and receipt instead of allocating another attendance request.
- Added a unique active-request index for each hashed worker identifier/action pair and a process-wide native capture lock covering preparation and local mutation.
- Network enrollment remains outside the lock; capture reacquires the lock and revalidates local state after enrollment.

The complete four-action restart/fault-injection runtime test is still absent, so KF02 remains `IMPLEMENTED_UNVERIFIED`.

### Device capability enforcement and upgrade handling

- Offline ingestion now requires `client_kind == NATIVE_OFFLINE` in both `KioskOfflineSyncView` and `sync_offline_batch`.
- Added a regression proving that `WEB_ONLINE` is denied even when the device has a valid signing key.
- Migration `0048` classifies existing devices as native only when their stored platform is Windows/macOS/Linux and they already have a public signing key. Other existing devices remain `WEB_ONLINE`.
- This preserves eligible existing installation identities and evidence queues while failing closed for ambiguous devices. Deployment review of the classification set remains required.

### Cache failure isolation

- Pairing authorization remains database-authoritative.
- Post-commit compatibility-cache deletion is now best effort, so a cache outage cannot turn a committed registration into an apparent failure.
- Cross-version deployment cutover and proof-bound lost-response token recovery remain open.

### Focused kiosk TypeScript verification

- Added `frontend_web/tsconfig.kiosk.json` covering the kiosk entry, bridge, page and their real import graph.
- Added `npm run typecheck:kiosk`.
- The focused kiosk typecheck passes independently from the existing full-application TypeScript failures.

## Scope preserved

- The existing Django attendance transitions, pharmacy/user authority, roster relationships and signed event evidence remain the source of business truth.
- Desktop remains a Tauri local-first kiosk. Mobile two-shell parity and bidirectional offline QR remain deferred.
- The retained encrypted database with an unavailable historical mock-keyring key was not opened, reset, moved or deleted.
- The previously completed kiosk repair remains intact; this file records only work performed after commit `d78b2c1`.

## Work performed

### KF02 — durable capture intent and replay ordering

Files:

- `frontend_web/src-tauri/src/lib.rs`
- `frontend_web/src/kiosk/desktopBridge.ts`
- `frontend_web/src/pages/attendance/KioskPage.tsx`

Changes:

1. Added encrypted native `capture_request` storage containing a UUID, hashed normalized worker identifier, explicit requested action, status, resulting employee/event references and timestamps. No PIN is stored.
2. Added `prepare_capture_request`. It writes intent before attendance capture and reuses the latest unresolved matching worker/action intent after a renderer or application restart.
3. Removed renderer-generated request UUIDs from the desktop submit path. React now asks native storage to prepare or recover the request and passes that durable ID to capture.
4. Bound prepared intent to the authenticated worker identifier and explicit action. Reusing an ID for another worker or action fails without returning the original worker's receipt.
5. Moved committed-request receipt recovery ahead of mutable clock/break transition checks. A response-lost retry returns the original event ID, sequence, hash and queue state even though the first capture changed local state.
6. Completion of the capture request, event append, sequence/hash advance and local projection update now occurs in the same SQLite transaction.

Limits still open in KF02:

- No native fault-injection/unit harness currently demonstrates commit-before-render loss, concurrent same-ID capture or all four actions across a real restart.
- Capture serialization still relies on SQLite transaction behavior; the planned process-wide installation lock and explicit `BEGIN IMMEDIATE` boundary are not complete.
- Errors remain strings rather than the reviewer’s complete typed error-code contract.
- Prepared-intent abandonment and manager-assisted recovery UI are not implemented.

### KF04 — durable atomic pairing-code redemption

Files:

- `backend/client_profile/models.py`
- `backend/client_profile/attendance_credentials.py`
- `backend/client_profile/migrations/0048_kiosk_pairing_authorization.py`
- `backend/attendance_tests/test_kiosk_pairing_code.py`

Changes:

1. Added `KioskPairingAuthorization` with pharmacy, authorizing user, keyed code digest, allowed client kind, expiry, consumption time and resulting device.
2. Generation now reserves the six-digit code through a database uniqueness constraint. The cache entry remains only as a compatibility hint for older nodes and existing tests.
3. Redemption now runs inside `transaction.atomic()` and locks the authorization row with `select_for_update()` before it creates a device and marks the authorization consumed.
4. Raw pairing codes are not stored in the database.
5. Native Windows/macOS/Linux pairing requires a valid Ed25519 public key. The maintained browser request without a native key remains supported as the lower-privilege online client shape.
6. Added an explicit `client_kind` to `KioskDevice`; activation records `NATIVE_OFFLINE` only for native platforms and otherwise records `WEB_ONLINE`.
7. Collision retries now catch only database uniqueness failures; operational database errors are allowed to surface instead of being misreported as exhausted codes.
8. Added migration `0048`; existing applied `0046`/`0047` files were not rewritten.
9. Updated the isolated pairing test schema to include the new model.

Limits still open in KF04:

- Native proof-of-possession challenge, durable pairing attempt identity and lost-response credential escrow are not implemented.
- Client-kind authorization is recorded, but the manager request endpoint does not yet expose a reviewed choice; current generated authorizations default to `NATIVE_OFFLINE` while keyless legacy redemption remains online-compatible.
- PostgreSQL concurrent-redemption testing is not available. SQLite tests do not prove row-lock behavior.
- Pairing rate limits and staged native recovery across keyring/SQLite commit boundaries remain open.

## Verification ledger

| Command | Result |
|---|---|
| `C:\\Users\\semse\\.cargo\\bin\\cargo.exe fmt --all -- --check` | Passed after formatting the new Rust code. |
| `C:\\Users\\semse\\.cargo\\bin\\cargo.exe check --locked` | Passed. |
| `npm run build:kiosk-ui` | Passed; 530 modules transformed. Existing chunk-size warning only. |
| `npm run typecheck:kiosk` | Passed against the kiosk entry, bridge, page and imported dependencies. |
| `.venv\\Scripts\\python.exe -m unittest attendance_tests.test_kiosk_pairing_code` | Passed: 8 tests. Existing resource warnings and malformed environment-line warning remain. |
| `.venv\\Scripts\\python.exe -m unittest attendance_tests.test_kiosk_offline_protocol attendance_tests.test_kiosk_pairing_code` | Passed: 18 tests after capability enforcement; existing resource/environment warnings remain. |
| `python -m compileall` on modified backend modules/migration | Passed. |
| `git diff --check` | Passed; line-ending notices only. |
| Full frontend `tsc --noEmit` | Blocked by pre-existing errors in roster, dashboard, attendance review, active shifts and onboarding files. No reported error referenced the modified kiosk files. |
| `makemigrations --check --dry-run` with `attendance_tests.settings` | Not a valid drift check because that isolated settings module deliberately disables migrations; Django exited with that explicit configuration error. |

The initial pairing-suite run failed because its manual schema fixture did not yet create the new authorization table. The fixture was updated; the second run passed all eight tests. This is recorded rather than concealed.

## Checkpoint status

| Checkpoint | Status | Evidence / remaining gate |
|---|---|---|
| KF00 baseline/safety | IN_PROGRESS | Baseline and worktree captured; pinned `.venv` with Celery 5.5.3 found. Deployment migration inventory and PostgreSQL harness remain absent. |
| KF01 environment/storage | NOT_STARTED | Existing earlier keyring repair retained; reviewer’s explicit build environments, numbered native migrations and single-instance lock remain. |
| KF02 request/replay | IMPLEMENTED_UNVERIFIED | Core durable intent and correct replay ordering implemented; restart/concurrency/fault-injection tests remain. |
| KF03 contracts/models | NOT_STARTED | Protocol v2, fixtures and processing companion models remain. |
| KF04 pairing | IMPLEMENTED_UNVERIFIED | Database row-lock redemption and compatibility tests implemented; proof/escrow/PostgreSQL concurrency remain. |
| KF05 grants/time | NOT_STARTED | Signed grants/generations/uncertainty enforcement remain. |
| KF06 server outcomes | NOT_STARTED | Durable processing decisions and reconciliation feed remain. |
| KF07 client state/sync | NOT_STARTED | Revisioned snapshot plus pending overlay remains. |
| KF08 native admin | NOT_STARTED | Scoped expiring native capability and recovery remain. |
| KF09 review/lifecycle UI | NOT_STARTED | Manager integrity/device lifecycle screens remain. |
| KF10 release/pilot | NOT_STARTED | PostgreSQL, signed installers, clean-machine and pilot evidence remain. |
| KF11 mobile two-shell | DEFERRED_EXPLICIT | Per reviewer plan. |
| KF12 bidirectional QR | DEFERRED_EXPLICIT | Per reviewer plan; desktop QR remains disabled. |

## Next implementation order

1. Complete KF02 native tests, capture serialization and typed errors.
2. Complete KF04 proof-of-possession, request recovery/escrow and PostgreSQL concurrency coverage.
3. Freeze KF03 evidence-v2 and outcome contracts before implementing grants or projections.
4. Implement KF05 signed grants/trusted-time enforcement, then KF06/KF07 reconciliation.
5. Implement KF08/KF09 capability and manager lifecycle workflows.
6. Close KF10 only with the PostgreSQL migration suite and signed clean-machine pilot evidence.

## Release position

Do not release this branch as completion of reviewer items A–H. The changes close two important integrity gaps, but proof-bound pairing recovery, signed offline authorization, revisioned reconciliation, administrative capabilities and release evidence remain required.
