# ChemistTasker Roster and Offline Kiosk Checkpoint

**Checkpoint date:** 16 September 2026  
**Status:** Backend protocol and initial desktop offline kiosk implemented  
**Deferred:** Frontend visual and performance optimization

## 1. Objective

This work covered two related areas:

1. Review and repair the roster and attendance backend completed by the previous agent.
2. Implement the first functional Windows/macOS local-first attendance kiosk using Tauri.

The kiosk architecture now follows this flow:

```text
Tauri desktop application
    ↓
Existing React kiosk interface
    ↓
Local encrypted SQLite/SQLCipher database
    ↓
Machine-held device key
    ↓
Signed, hash-chained attendance events
    ↓
Offline outbox that survives restarts
    ↓
Automatic retry and batch synchronization
    ↓
Django attendance backend
```

## 2. Backend attendance protocol

### New offline kiosk protocol

Implemented a shared protocol for securely recording attendance while the kiosk has no internet connection.

Primary files:

- `backend/client_profile/attendance_protocol.py`
- `backend/client_profile/models.py`
- `backend/client_profile/attendance_views.py`
- `backend/client_profile/urls.py`

The protocol provides:

- Canonical JSON serialization.
- Ed25519 signature verification.
- Per-device monotonic sequence numbers.
- Hash chaining between consecutive events.
- Idempotent event processing.
- Duplicate event protection.
- Device continuity tracking.
- Integrity flags for invalid or suspicious batches.
- Batch acknowledgement through a contiguous sequence number.
- Server timestamps after synchronization.
- Historical attendance timestamps for verified offline events.

### New attendance source

Added an `OFFLINE_KIOSK` attendance source so verified offline attendance can be distinguished from existing online attendance sources.

The existing attendance transition logic was extended so offline events use the established attendance rules and worker records instead of creating a separate attendance system.

Relevant files:

- `backend/client_profile/attendance_transitions.py`
- `backend/client_profile/attendance_credentials.py`
- `backend/client_profile/attendance_approvals.py`
- `backend/client_profile/serializers.py`

### Batch synchronization endpoint

Added:

```text
POST /client-profile/attendance/kiosk/sync/batch/
```

The endpoint:

- Authenticates the kiosk using its device token.
- Checks that the device has not been revoked.
- Verifies every event signature.
- Verifies sequence continuity.
- Verifies the event hash chain.
- Detects duplicates using stable event IDs and device sequence numbers.
- Processes events through the established attendance transition logic.
- Records immutable kiosk event receipts.
- Returns the highest contiguous acknowledged sequence.
- Returns server time for the kiosk trusted-clock anchor.

## 3. Kiosk device model changes

The existing kiosk device model was extended with:

- `installation_id`
- `platform`
- `public_signing_key`
- `app_version`
- `last_seen_at`
- `last_sync_at`
- `revoked_at`
- `last_contiguous_sequence`
- `last_event_hash`

A new immutable kiosk attendance-event model stores server-side protocol receipts and integrity information.

Migration:

- `backend/client_profile/migrations/0046_kiosk_offline_protocol.py`

Pairing and activation now support:

- Installation identity.
- Desktop platform information.
- Application version.
- Device public signing key.
- Device-token issuance.
- Device revocation timestamps.

Organization administrators were included in kiosk authorization where required.

## 4. Desktop Tauri kiosk

### Tauri application scaffold

The desktop application is located under:

- `frontend_web/src-tauri/`
- `frontend_web/src-tauri/tauri.conf.json`
- `frontend_web/src-tauri/Cargo.toml`
- `frontend_web/src-tauri/src/lib.rs`
- `frontend_web/src-tauri/src/main.rs`

The application uses the existing React kiosk page as its interface. Rust/Tauri owns local storage and security-sensitive functionality.

### Local encrypted database

Tauri creates a local kiosk database in the application data directory.

Implemented local tables for:

- Paired device configuration.
- General configuration values.
- Locally enrolled worker credentials.
- Immutable attendance-event outbox.
- Trusted server clock anchor.
- Dashboard PIN configuration and lockout state.

The database is opened with SQLCipher configuration. Its key is generated locally and stored through the operating-system keyring.

The kiosk data survives:

- React reloads.
- Application restarts.
- Computer restarts.
- Internet outages.

### Device identity and signing key

Each desktop installation generates a local Ed25519 signing key.

The private signing key:

- Is generated on the device.
- Is stored using the operating-system keyring.
- Is not returned to React.
- Is used by Rust to sign local QR challenges and attendance events.

The public key is sent to the backend during device pairing.

### Offline attendance outbox

Every local event contains:

- Stable event UUID.
- Installation identity.
- Pharmacy identity.
- Worker identity.
- Attendance action.
- Device sequence number.
- Previous event hash.
- Current event hash.
- Captured local timestamp.
- Trusted estimated server timestamp where available.
- Boot-session identity.
- Monotonic elapsed time.
- Protocol version.
- Device signature.
- Synchronization status.

Events remain in the outbox until the backend acknowledges them. Stable event identities and device sequences prevent duplicate attendance records after retries.

### Automatic synchronization

The Tauri process includes a background synchronization worker that:

- Attempts synchronization automatically.
- Uses batch upload.
- Retains unacknowledged events.
- Retries after failures.
- Applies increasing delays.
- Adds randomized jitter.
- Resets its retry delay after successful synchronization.
- Updates the trusted-clock anchor from the server response.

### Clock-integrity handling

The kiosk stores:

- Last trusted server UTC value.
- Current boot-session identifier.
- Monotonic elapsed time associated with the trusted anchor.

This permits trusted-time estimation during an outage and preserves information needed to identify suspicious wall-clock changes.

This is an initial integrity layer. The reviewer must assess whether additional policy is needed for long outages or large clock discrepancies.

### Local dashboard PIN

Implemented dashboard PIN protection with:

- Argon2 hashing.
- Per-PIN salt.
- Failed-attempt tracking.
- Temporary lockout after repeated failures.
- Verification inside Rust.

Raw dashboard PINs are not stored.

### Offline worker PIN support

After a successful online PIN attendance request, the React kiosk can enroll that worker credential locally through Tauri.

When the network is unavailable:

- Rust verifies the locally enrolled credential.
- Rust determines the next attendance action from local state.
- Rust writes a signed event to the local outbox.
- The event is later synchronized with the Django backend.

This preserves use of established backend worker identities and attendance behavior.

### Offline QR challenge generation

Tauri can generate signed QR challenge payloads locally containing:

- Installation identity.
- Pharmacy identity.
- Challenge identifier.
- Issue and expiry timestamps.
- Protocol version.
- Device signature.

This permits QR challenges to continue rotating while the desktop kiosk is offline. The complete mobile-side offline QR redemption flow remains outstanding.

## 5. React desktop integration

Files:

- `frontend_web/src/kiosk/desktopBridge.ts`
- `frontend_web/src/pages/attendance/KioskPage.tsx`

The React kiosk now:

- Detects whether it is running inside Tauri.
- Obtains desktop device status through Rust.
- Sends pairing details to Rust.
- Displays locally generated QR challenges.
- Enrolls worker credentials locally after successful online PIN attendance.
- Falls back to offline PIN attendance when a network request fails.
- Displays locally queued attendance receipts.
- Can request immediate synchronization.
- Can read the number of pending local events.

The web kiosk path remains usable outside Tauri.

## 6. Mobile kiosk-link behavior

Files:

- `frontend_mobile/app/kiosk-link.tsx`
- `frontend_mobile/app/_layout.tsx`

Current behavior:

- The mobile app does not show a general kiosk chooser during startup.
- The kiosk-link screen appears only when the app is explicitly sent to the kiosk-link route.
- Authenticated kiosk pairing notifications can navigate to that route.
- Pairing notifications contain pharmacy and pairing-code parameters.
- Ordinary users remain in the normal application flow.

Expected route format:

```text
/kiosk-link?source=kiosk&pharmacy_id=<id>&pairing_code=<code>
```

## 7. Shared TypeScript protocol

Files:

- `shared-core/src/kioskProtocol.ts`
- `shared-core/src/kioskProtocol.test.ts`
- `shared-core/src/index.ts`

The shared module contains:

- Protocol event types.
- QR challenge types.
- Batch request and response types.
- Canonical serialization helpers.
- Event hash helpers.

## 8. Development launcher and prerequisites

Files:

- `frontend_web/scripts/run-tauri.mjs`
- `frontend_web/package.json`
- `run_kiosk.bat`

Installed or configured prerequisites include:

- Rustup.
- Cargo.
- Tauri CLI.
- Strawberry Perl for native OpenSSL compilation.
- Generated Tauri icon assets.

The launcher adds these locations to the child-process environment:

```text
%USERPROFILE%\.cargo\bin
C:\Strawberry\perl\bin
C:\Strawberry\c\bin
```

Windows produced intermittent file-lock errors during parallel Rust compilation. The launcher now uses:

```text
CARGO_BUILD_JOBS=1
CARGO_INCREMENTAL=0
```

This resolved the build failure on the current machine.

Development launch command:

```powershell
cd C:\ChemistTasker_Ezy\chemisttasker-ezy\frontend_web
npm run kiosk:dev
```

Root launcher:

```powershell
C:\ChemistTasker_Ezy\chemisttasker-ezy\run_kiosk.bat
```

The batch launcher uses the compiled Tauri executable when available and otherwise starts Tauri development mode.

## 9. Verification completed before this checkpoint

No additional tests were run while creating this checkpoint.

### Backend

- Full Django test suite passed: **187 tests**.
- Django system checks passed.
- Migration consistency check reported no ungenerated model changes.
- Offline kiosk protocol tests passed.
- Existing attendance approval tests passed after their expected behavior was updated.

Protocol tests:

- `backend/attendance_tests/test_kiosk_offline_protocol.py`
- `backend/attendance_tests/test_attendance_approvals.py`

### Shared code

- Shared TypeScript type checking passed.
- Shared kiosk-protocol tests passed.

### Mobile

- Direct type checking of kiosk-link and related mobile kiosk files passed.
- The complete mobile project type check still reports two unrelated, pre-existing talent-board errors.

### Desktop

- `cargo fmt` was applied.
- `cargo check` passed.
- The full development executable compiled successfully.
- The desktop process started successfully.
- `chemisttasker-kiosk.exe` remained responsive.
- Vite served `/kiosk` successfully with HTTP 200.
- Executable path:

```text
C:\ChemistTasker_Ezy\chemisttasker-ezy\frontend_web\src-tauri\target\debug\chemisttasker-kiosk.exe
```

The linker emitted `LNK4099` warnings about a missing `ossl_static.pdb`. These concern OpenSSL debugging symbols and did not prevent linking or execution.

## 10. Items the reviewer must examine

### Production migration history

An older migration-history issue in the repository predates this kiosk migration.

Do not run migrations against a production database until the deployed migration state has been compared with the repository migration graph.

The reviewer should:

1. Inspect `django_migrations` in the deployed database.
2. Compare it with the repository migration files.
3. Resolve missing, renamed, or previously faked migrations.
4. Back up production data.
5. Test migration `0046` against a recent production copy.
6. Confirm the rollback and recovery procedure before deployment.

### SQLCipher enforcement

The Rust database connection issues SQLCipher `PRAGMA key` statements. Confirm that the distributed SQLite native library includes SQLCipher support and that a production database cannot be opened as ordinary SQLite.

This must be checked in final packaged Windows and macOS artifacts.

### Local worker credential lifecycle

Local worker credentials are enrolled after successful online use. Decide how local credentials are invalidated when:

- A worker is deactivated.
- A worker changes their PIN.
- A worker is removed from the pharmacy.
- A pharmacy administrator revokes offline access.

A successful synchronization should eventually carry credential-revocation or roster-refresh information back to the kiosk.

### Roster and user refresh

The kiosk uses established backend users and attendance transition logic. A complete local roster synchronization mechanism still needs formal review.

Confirm:

- Which pharmacy workers may use each kiosk.
- How assigned workers are downloaded.
- How removed users are deleted locally.
- Whether worker role changes take effect immediately after synchronization.
- How long a kiosk may remain offline before requiring administrative review.

### Event-chain conflict policy

The backend detects sequence and hash-chain problems. Operational decisions still required include:

- Whether a broken chain rejects the complete batch.
- Whether later valid events are quarantined.
- Who can resolve a quarantined device.
- Whether a device must be re-paired after a chain conflict.
- What information administrators should see.

### Trusted-time policy

Define:

- Maximum permitted offline duration.
- Maximum clock difference.
- Whether suspicious events are accepted and flagged or rejected.
- Administrator workflow for reviewing clock-integrity flags.
- Behavior after hibernation, sleep, daylight-saving changes, or battery-backed clock changes.

### Offline QR completion

Desktop generation exists, but full mobile offline QR redemption remains outstanding. The next phase needs:

- Mobile verification of the kiosk signature.
- Replay protection.
- Challenge expiry enforcement.
- Mobile device clock-integrity rules.
- Secure mobile attendance outbox.
- Synchronization of the mobile claim with the kiosk/backend.
- Conflict resolution when mobile and kiosk reconnect independently.

### Production packaging

Development mode works. Production packaging still requires review for:

- Windows MSI generation.
- macOS DMG generation.
- Code signing.
- Apple notarization.
- Windows signing certificate.
- WebView2 bootstrap behavior.
- SQLCipher linkage.
- Keyring behavior under standard and restricted Windows accounts.
- Installation upgrades without losing the local database or private key.
- Uninstall behavior and data-retention policy.
- Automatic update strategy.

### Frontend optimization

Visual design, kiosk usability polishing, accessibility review, and frontend performance optimization were intentionally left for the next phase.

## 11. Recommended reviewer sequence

1. Review the migration and model changes.
2. Review canonical serialization and signature verification on both sides.
3. Compare offline transitions with existing online attendance transitions.
4. Confirm permissions for owners, managers, administrators, and workers.
5. Inspect event idempotency and duplicate handling.
6. Inspect sequence and hash-chain failure handling.
7. Confirm SQLCipher is present in the packaged binary.
8. Confirm private keys and database keys remain outside React.
9. Simulate a restart during a long outage.
10. Synchronize the same batch repeatedly and confirm no duplicate attendance records.
11. Revoke a kiosk device and confirm future synchronization is refused.
12. Change or deactivate a worker and review local credential behavior.
13. Review the mobile kiosk-link routing restriction.
14. Resolve the existing production migration-history problem.
15. Package and test on a clean Windows machine.

## 12. Completion state

### Completed

- Backend offline attendance protocol.
- Device registration and public-key pairing.
- Signed attendance batch synchronization.
- Idempotent backend processing.
- Integration with existing attendance transitions.
- Immutable backend event receipts.
- Tauri desktop application scaffold.
- Local encrypted-database design.
- OS-keyring device and database secrets.
- Signed local attendance outbox.
- Retry, jitter, and acknowledgement handling.
- Local dashboard PIN.
- Local worker credential enrollment.
- Offline PIN clock in/out.
- Locally generated signed QR challenges.
- React-to-Tauri bridge.
- Explicit mobile kiosk-link routing.
- Development launcher and Windows prerequisites.
- Successful desktop compilation and launch.

### Outstanding

- Production migration reconciliation.
- Packaged SQLCipher verification.
- Complete local roster refresh and credential-revocation lifecycle.
- Final operational policy for event-chain conflicts.
- Final trusted-clock policy.
- Full mobile offline QR redemption.
- Windows/macOS production packaging and signing.
- Clean-machine installer testing.
- Frontend visual and performance optimization.
- End-to-end outage testing with real pharmacy data and devices.

