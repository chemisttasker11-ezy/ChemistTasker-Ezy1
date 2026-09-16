# ChemistTasker remaining kiosk fixes — implementation handover

## Baseline migration blocker resolved — 16 September 2026

This section supersedes the earlier full-PostgreSQL-migration blocker below. It does not close unrelated offline-kiosk release gates.

Root cause: the client-profile state-only baseline ran before auth's data migration had finished. That data migration rendered a historical state containing references to users.User before the users baseline existed. Additionally, the users/client-profile/billing baselines defined only state and could not create their tables on an empty database. This was not a Django dependency-graph cycle; the previous description as a circular graph was imprecise.

Permanent source corrections:

- The client-profile baseline now depends on auth.0012, ensuring auth's historical data operations finish first.
- The users baseline materializes users and client-profile tables together, after both historical model states exist. Foreign-key SQL is deferred until all referenced tables are created by the schema editor.
- The billing baseline materializes its tables after its dependencies.
- `backend/core/baseline_schema.py` creates a baseline only when none of its tables exist. Complete existing baselines are left untouched; partial baselines produce a clear error. No fake migrations, dropped business tables, or sequence resets were used.
- `backend/attendance_tests/migration_settings.py` uses the full installed migration graph, unlike the manual-schema attendance test settings. It requires a disposable database prefix and binds connections to local PostgreSQL.
- Forward migration `0050_align_kiosk_schema_state` resolves three index-name mismatches and two field-state mismatches found by Django's migration autodetector.

Actual PostgreSQL 17 evidence, database `chemisttasker_kiosk_test_baseline_fix`:

- Fresh `manage.py migrate --noinput`: passed for every installed app, including kiosk 0044–0049. Subsequent 0050 application passed.
- Repeated migrate: no migrations to apply.
- Physical schema inspection: 161 tables, zero missing managed model/automatic many-to-many tables.
- `manage.py makemigrations --check --dry-run`: exit 0, No changes detected.
- Historical baseline helper exercised against the complete migrated schema: no table recreation. Partial-schema guard also checked.

Independent revalidation on a second empty disposable database, `chemisttasker_kiosk_test_baseline_validation2`:

- Fresh full migration completed successfully; a repeat `manage.py migrate --noinput` exited 0 with `No migrations to apply`.
- Django's migration executor reported zero pending migrations.
- Physical inspection found 161 database tables and zero missing managed-model/automatic many-to-many tables (160 expected application tables plus Django's migration recorder table).
- `manage.py makemigrations --check --dry-run` exited 0 with `No changes detected`.

No configured development or production database was erased or migrated. The dedicated verification database is retained locally. Existing applied baseline records do not rerun changed operations; restored databases still require a matching complete schema/migration history. Fresh databases now build normally. Initial baseline materialization deliberately has no destructive reverse operation.

**Date:** 16 September 2026  
**Starting commit:** `d78b2c13d6677b5695427c8c612e27433634a346` (`Kiosk Fixed`)  
**Reviewer specification:** `01_IMPLEMENTATION_PLAN.md` and `02_DEVELOPER_HANDOVER.md` supplied by the user  
**Historical checkpoint retained:** `docs/kiosk/KIOSK-REPAIR-HANDOVER-2026-09-16.md`  
**Current status:** KF02 CORE REPLAY REPAIR IMPLEMENTED AND COMPILED; KF04 ATOMIC CODE REDEMPTION IMPLEMENTED AND FOCUSED TESTED; FULL A–H RELEASE GATE REMAINS OPEN

## Kiosk 4 reviewer closeout

### Historical local-request upgrade

- Replaced the per-open index rebuild with native local schema migration version 1, recorded in `local_schema_migration` and run in one SQLite transaction.
- Repeated Kiosk 3 `COMMITTED` requests are preserved as `LEGACY_COMMITTED`; no event, sequence, hash or receipt is deleted or falsely marked confirmed.
- The active-request unique index now covers only `PREPARED` and current `COMMITTED` requests.
- Native regression: a populated Kiosk 3-style database with duplicate historical clock-ins opens successfully and preserves both rows as legacy evidence.

### Confirmation and recovery

- `confirm_capture_receipt` is idempotent for the same request/event pair and rejects a mismatched event.
- The kiosk success message is displayed immediately after capture. Confirmation is now best-effort delivery bookkeeping, so a lost confirmation response cannot present recorded attendance as failed.
- Receipt recovery includes confirmed records, labels recovered results, and displays the original native event timestamp.

### Enrollment coordination and server migration history

- Enrollment HTTP fetch remains outside the lock; applying its worker credential and state snapshot now occurs under the same native capture lock as validation and recording.
- Added `0049_reclassify_existing_native_kiosks.py`. This forward migration safely handles environments that already applied the prior `0048`, promoting only stored Windows/macOS/Linux devices with a valid base64 32-byte public key.
- Removed the rewritten data operation from `0048`; no applied Django migration is relied on to rerun.

### PostgreSQL validation

- Created a guarded PostgreSQL 17 test settings module. It refuses any database whose name does not start with `chemisttasker_kiosk_test_`.
- Created and used the disposable database `chemisttasker_kiosk_test_20260916_review`.
- The real PostgreSQL pairing suite passed 9 tests, including concurrent redemption: exactly one device was created and the concurrent attempt received the controlled consumed result.
- Historical result: the first empty-database run stopped before the kiosk migrations because the state-only baselines could not materialize a complete fresh schema. This blocker is resolved and independently revalidated in the opening section of this handover.

## Second-review corrections at `6cbe008`

The follow-up reviewer report identified valid gaps in the first implementation. The following corrections were then made:

### PostgreSQL-safe pairing lock

- Removed `select_related("resulting_device")` from the `select_for_update()` authorization lookup. Because `resulting_device` is nullable, the former outer join is incompatible with PostgreSQL row locking.
- The transaction now locks only the authorization row. Related pharmacy/user objects are resolved normally while the authorization lock remains held.
- The guarded PostgreSQL pairing suite subsequently passed its simultaneous-redemption scenario: one device was created and the competing redemption received the controlled consumed result.

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
- PostgreSQL concurrent-redemption testing passed in the guarded pairing suite: one device was created and the competing redemption received the controlled consumed result.
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
| Fresh full PostgreSQL migration, database `chemisttasker_kiosk_test_baseline_validation2` | Passed; repeat migrate reports no work, executor reports zero pending migrations, and no managed tables are missing. |
| `makemigrations --check --dry-run` with `attendance_tests.migration_settings` | Passed: `No changes detected`. |
| Full frontend `tsc --noEmit` | Blocked by pre-existing errors in roster, dashboard, attendance review, active shifts and onboarding files. No reported error referenced the modified kiosk files. |
| `makemigrations --check --dry-run` with `attendance_tests.settings` | Not a valid drift check because that isolated settings module deliberately disables migrations; Django exited with that explicit configuration error. |

The initial pairing-suite run failed because its manual schema fixture did not yet create the new authorization table. The fixture was updated; the second run passed all eight tests. This is recorded rather than concealed.

## Checkpoint status

| Checkpoint | Status | Evidence / remaining gate |
|---|---|---|
| KF00 baseline/safety | IN_PROGRESS | Guarded PostgreSQL harness exists; two empty-database full-graph runs validate the repaired baseline. Deployment inventory and the remaining release evidence are still open. |
| KF01 environment/storage | NOT_STARTED | Existing earlier keyring repair retained; reviewer’s explicit build environments, numbered native migrations and single-instance lock remain. |
| KF02 request/replay | IMPLEMENTED_UNVERIFIED | Core durable intent and correct replay ordering implemented; restart/concurrency/fault-injection tests remain. |
| KF03 contracts/models | NOT_STARTED | Protocol v2, fixtures and processing companion models remain. |
| KF04 pairing | IMPLEMENTED_UNVERIFIED | Database row-lock redemption and PostgreSQL concurrency passed; proof-of-possession and lost-response credential escrow remain. |
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
2. Complete KF04 proof-of-possession and request recovery/escrow.
3. Freeze KF03 evidence-v2 and outcome contracts before implementing grants or projections.
4. Implement KF05 signed grants/trusted-time enforcement, then KF06/KF07 reconciliation.
5. Implement KF08/KF09 capability and manager lifecycle workflows.
6. Close KF10 only with the PostgreSQL migration suite and signed clean-machine pilot evidence.

## Release position

Do not release this branch as completion of reviewer items A–H. The changes close two important integrity gaps, but proof-bound pairing recovery, signed offline authorization, revisioned reconciliation, administrative capabilities and release evidence remain required.
