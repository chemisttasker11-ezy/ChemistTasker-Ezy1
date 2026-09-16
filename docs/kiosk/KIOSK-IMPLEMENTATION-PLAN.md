# ChemistTasker Kiosk implementation plan

## Objective

Extend the existing Expo application and `client_profile` attendance domain with an offline-capable pharmacy kiosk. Preserve the current attendance, roster, membership, organization, owner-chain and provisional-approval rules.

This checkout has `backend/client_profile/attendance_views.py` and role-based mobile routes under `frontend_mobile/app/`; it does not contain the `backend/workforce` or `(tabs)` paths referenced in the initial brief. Work will use the actual paths and existing domain objects.

## Non-negotiable boundaries

- One mobile app, with separate normal and kiosk route trees. Do not duplicate the normal application.
- Kiosk isolation is enforced by a restricted device credential and backend permissions, not hidden navigation.
- Device private signing keys never leave the device.
- Attendance is written locally before any sync attempt. Local records are append-only and tamper-evident.
- Mobile and later desktop clients share one versioned protocol and fixture suite.
- Existing business rules decide the cloud outcome after sync, including exceptional attendance and manager approval.

## Phase 0 — discovery and protocol decisions

1. Map the current Expo route tree, authentication/session storage, current QR credential flow, `run_kiosk.bat`, and attendance endpoints.
2. Inventory existing models and APIs for kiosk devices, QR sessions, attendance events, clock-in/out, approvals and device credentials. Reuse them where they meet the specification.
3. Define a versioned canonical attendance protocol in `shared-core` or a backend-owned contract package:
   - challenge and event schemas;
   - deterministic serialization;
   - Ed25519 signing inputs and public-key verification;
   - event hash-chain inputs;
   - device sequence, receipt and error semantics.
4. Produce protocol fixtures used by backend and Expo tests. Desktop must consume these unchanged later.

**Exit gate:** agreed protocol document and fixtures; no new mobile or desktop code uses an ad-hoc event format.

## Phase 1 — backend device trust and restricted APIs

1. Add additive `client_profile` models/migrations for registered kiosk devices and device credentials. Required device data: pharmacy, name, platform, public key, active/revoked state, registration actor/timestamps, health/version and sync timestamps.
2. Add owner, organization-admin and pharmacy-admin provisioning/revocation authorization using the existing role and pharmacy-scope rules.
3. Add narrowly scoped device-token authentication and permissions. Permit only device identity, health, challenge, attendance capture and batch sync; deny normal user, payroll, roster-admin, HR, messaging and management APIs.
4. Extend the current attendance service/views with:
   - signed challenge validation;
   - idempotent batch sync;
   - unique `event_id` and `(device_id, device_sequence)` handling;
   - per-event results and contiguous acknowledgement;
   - device revocation and integrity-warning handling.
5. Route accepted events into the existing clock-in/out and provisional-attendance rules rather than copying business logic.

**Exit gate:** backend tests prove authorization, signature validation, duplicate batches, sequence errors, revocation, clock-integrity flags and preservation of existing exceptional attendance flows.

## Phase 2 — Windows/macOS desktop offline kiosk

1. Package the existing React kiosk route with Tauri; Tauri owns SQLCipher, secure device keys, the local attendance outbox, clock anchors and synchronization.
2. Pair with the backend using an Ed25519 public key generated locally; store the private key, database key and device token in the operating-system credential store.
3. Generate signed QR challenges locally, verify enrolled worker PINs locally and append signed attendance actions before showing success.
4. Synchronize in idempotent batches with retry and jitter. Keep the kiosk operational through application restarts, computer reboots and internet outages.
5. Require the device Dashboard Access PIN before leaving the kiosk shell.

**Exit gate:** an enrolled worker clocks in/out with the network disconnected, the record survives restart, and reconnecting syncs exactly once.

## Phase 3 — Expo navigation and provisioning

1. Keep kiosk entry absent from ordinary mobile startup and navigation. Expose kiosk linking only after an explicit secure deep link or kiosk-pairing notification.
2. Add kiosk provisioning from that link-only prompt. Require authorized admin authentication, pharmacy selection, device registration, device-key generation and Dashboard Access PIN setup/confirmation.
4. Generate the private Ed25519 key locally and store it only in secure device storage. Store the server-issued restricted device credential separately from normal user credentials.
5. On kiosk entry, clear/unmount normal navigation and do not retain a usable privileged session in kiosk state.

**Exit gate:** only permitted admins can provision; a provisioned device enters kiosk mode without a normal user session; kiosk routes cannot reach normal routes or private APIs.

## Phase 4 — Expo local-first kiosk attendance

1. Use a native/prebuilt Expo build with SQLCipher-backed encrypted local SQLite. Do not rely on Expo Go for the encrypted attendance store.
2. Create local append-only tables for device metadata, attendance events, outbox, receipts, clock anchors and persistent device sequence.
3. Generate locally signed QR challenges and signed event records with a hash chain. Record device wall time, trusted-time estimate, monotonic elapsed time and boot/session identifier.
4. Implement rotating QR, online/offline state, last-sync state, queued count and compact diagnostics screens only. Do not expose roster, staff, chat, HR or admin data.
5. Implement retryable batch sync with bounded batches, exponential backoff and jitter. Mark records synced only after server acknowledgement.
6. Detect clock rollback, suspicious forward jumps, database/device resets and sequence problems. Retain and flag questionable events for review.

**Exit gate:** offline clock-in/out persists across restart, sync is idempotent after reconnection, and integrity warnings remain auditable.

## Phase 5 — kiosk dashboard protection and lifecycle

1. Store a strong locally verified Dashboard Access PIN using Argon2id parameters and device secure-storage material; never store plaintext.
2. Require this PIN whenever a provisioned kiosk attempts to enter the normal dashboard, including after reboot, force-close, offline use and upgrade.
3. Rate-limit failures and require an authenticated authorized admin to reset a forgotten PIN.
4. Add a discreet kiosk exit action. On successful unlock, destroy kiosk state and require normal authentication before restoring the normal shell.
5. Add device health, re-registration and revocation UX without widening kiosk permissions.

**Exit gate:** PIN bypass attempts fail and incorrect unlock attempts never expose normal routes underneath the kiosk shell.

## Phase 6 — shared protocol hardening and parity

1. Run the same protocol fixtures against backend and Expo implementations.
2. Keep desktop and Expo implementations on the same fixtures as the protocol evolves.

**Exit gate:** protocol fixtures are client-neutral and desktop has no separate event schema or sync path.

## Validation matrix

- Normal app regression tests pass.
- Provisioning authorization and pharmacy scope tests pass.
- Kiosk credential API-denial tests pass.
- Offline persistence, restart, retry and duplicate-sync tests pass.
- Event immutability, hash-chain, signature, sequence and clock-integrity tests pass.
- Revocation rejects new trusted synchronization.
- Existing membership, owner-chain, urgent and pending-approval attendance tests pass.
- Mobile routes and APIs are smoke-tested on a physical/prebuilt device.
- Before release, rehearse new migrations on disposable PostgreSQL after the existing migration-history recovery work is resolved.

## Delivery order

1. Phase 0 and backend Phase 1, with protocol tests.
2. Desktop Phase 2 offline attendance and sync.
3. Link-only Expo provisioning, then mobile offline parity.
4. PIN/lifecycle hardening on both clients.
5. Device tests and PostgreSQL rehearsal.

Frontend visual optimization remains separate and follows the kiosk functional/security work unless reprioritized.
