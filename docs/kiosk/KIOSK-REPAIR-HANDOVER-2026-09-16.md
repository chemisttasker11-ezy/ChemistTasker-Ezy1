# ChemistTasker Kiosk Repair Handover

**Started:** 16 September 2026  
**Baseline:** `c5ef15e6f342814069289be1fea4e3a49a22a332` on `main`  
**Source report:** `ChemistTasker_Kiosk_Repair_Plan_c5ef15e.md`  
**Status:** HIGH-RISK REPAIR SLICE IMPLEMENTED AND FOCUSED CHECKS PASSED; FULL PLAN REMAINS IN PROGRESS

## Working rules

- Preserve the existing attendance, roster, membership, owner-chain, organization and provisional-attendance logic.
- Implement the Windows offline-PIN vertical path before mobile parity and full offline QR.
- Do not erase or reinitialize local evidence when keys, storage or chain state are inconsistent.
- Keep device credentials and signing/database keys inside native code.
- Record every implementation and verification command in this file.

## Baseline observations

- The repository already contains protocol v1, a Django batch endpoint, Tauri local storage, a signed event outbox and a mobile pairing helper.
- Migration `0046` has an uncommitted staged UUID backfill repair. It is preserved and not overwritten.
- `keyring = "3"` enables no native credential-store feature. On Windows and macOS this selects the in-memory mock backend, so keys and the device token do not reliably survive a new process.
- The desktop React flow sends the placeholder `tauri-secure-device` to the legacy online PIN endpoint, then falls back to native storage only when the HTTP request has no response.
- The current online PIN call creates attendance before native enrollment. This produces separate online and offline capture paths and can diverge from the local projection.
- A repeated `event_id` is currently returned as `already_received` before comparing its canonical content hash.
- Offline break processing resolves the worker's open session without first binding that session to the kiosk pharmacy.
- Local sync marks every event below the contiguous watermark as `SYNCED` without persisting its per-event accepted/review/rejected result.
- Dashboard PIN commands exist but are not wired into a protected native administrative session.
- Locally generated desktop QR challenges are incompatible with the existing legacy mobile/backend QR path. They must remain disabled for the Windows PIN pilot.

## Repair log

### CP00 — Baseline and specification

- Confirmed the baseline SHA and branch.
- Preserved the existing dirty migration repair.
- Adopted the reviewer report as the repair specification.
- Created this live handover.

### Planned active repair slice

1. Enable persistent Windows/macOS keyring backends and fail safely when an existing database key is missing.
2. Reject same-ID/different-content event replays.
3. Enforce kiosk-pharmacy ownership for break events.
4. Add a non-clocking worker enrollment endpoint.
5. Replace desktop online-first PIN clocking with one native local capture path.
6. Persist per-event synchronization outcomes locally.
7. Disable unfinished offline QR in the pilot UI.

### Implemented in this session

- Enabled the real Windows Credential Manager and Apple Keychain backends for `keyring` while keeping major version 3.
- Split secure-secret loading from initialization. Missing, locked or corrupt secure storage is no longer treated as an empty first installation.
- Added `RECOVERY_REQUIRED` behavior when an encrypted database exists but its database key is missing, or a paired installation has lost its signing key.
- Scoped keyring account names between development and production builds.
- Added an explicit SQLCipher runtime check and encrypted-database read check.
- Preserved the existing encrypted local database at `C:\Users\semse\AppData\Roaming\com.chemisttasker.kiosk\kiosk.db`. Its header is encrypted, and it was created by the previous mock-keyring build. No kiosk process or persistent mock key remained, so the file was not deleted or reset; the repaired build will report recovery required.
- Changed duplicate ingestion so canonical hash and signature are checked before idempotent replay. A reused UUID with different signed content is now rejected as a conflict.
- Enforced kiosk-pharmacy ownership for break start and break end.
- Added `attendance/kiosk/workers/enrol/`, a restricted device endpoint that verifies an established worker PIN without creating attendance.
- Enrollment reports the worker's current same-pharmacy clock state and refuses enrollment when an open session exists at another pharmacy.
- Replaced the desktop React online-first PIN clock call and placeholder token with one native `capture_pin_attendance` operation.
- The native path uses the device token from secure storage, enrolls only when required, records locally first, and leaves cloud application to batch synchronization.
- Removed renderer access to arbitrary employee-ID event creation and unverified worker-enrollment commands.
- Added explicit Clock In and Clock Out selection for desktop capture; local state no longer silently chooses the opposite action.
- Persisted content-bound per-event sync results locally. Accepted, review and rejected outcomes are no longer inferred only from a contiguous acknowledgement number.
- Added receipt validation for installation identity, event ID, sequence and event hash before local delivery state changes.
- Added HTTPS-only API-origin validation outside localhost development, redirect refusal and request deadlines for the native restricted client.
- Made a six-digit Dashboard Access PIN mandatory during desktop pairing and removed the unrestricted PIN replacement command.
- Hid desktop QR attendance and removed its renderer command until the mobile claim/return flow exists. The legacy web QR path remains separate.
- Added local request identities and a unique local index so native capture can return the original receipt for the same request instead of appending another event.
- Extended the native local projection and explicit PIN action selector to cover clock in, clock out, break start and break end.
- Hid the legacy server-driven break station in Tauri so desktop users cannot enter the placeholder-token path.
- Added a restricted `kiosk/config/` heartbeat that refreshes the server-time anchor even when the outbox is empty, with a 15-minute in-process refresh interval.
- Preserved valid signed evidence for inactive or unresolved workers. The submitted worker ID is stored independently and business rejection no longer discards the signed record.
- Added migration `0047_kiosk_event_preserve_unresolved_worker.py` for nullable worker resolution plus preserved submitted worker identity.
- Validated Ed25519 public keys before pairing-code consumption and reserved pairing codes without overwriting another live code.
- Added a dedicated `kiosk.html` React entry and `dist-kiosk` production build. Tauri now loads only this kiosk bundle rather than the full dashboard router.
- Prevented the Tauri renderer's retained Axios adapter from attaching account bearer tokens, cookies or CSRF credentials. Desktop pairing is code-only.
- Added a kiosk-only production build command and ignored generated `dist-kiosk` artifacts.

## Verification performed

- `cargo check --locked`: passed after enabling native credential-store features.
- Cargo formatting: passed.
- Frontend TypeScript: full `tsc --noEmit` passed with no kiosk errors.
- Dedicated kiosk production UI build: passed; emitted only `kiosk.html` and its kiosk assets.
- Seven focused offline-protocol tests passed, covering idempotency, tampering, sequence gaps, same-ID/different-content conflict, non-clocking enrollment, cross-pharmacy break rejection and inactive-worker evidence preservation.
- `git diff --check`: passed. Git emitted only expected line-ending notices.
- An initial broad run of the offline protocol module could not load URL-routed tests because the active Python environment lacks the existing `celery` dependency. The six non-URL tests ran during that attempt; focused direct-view and protocol tests were then run successfully. No dependency was installed or test weakened to conceal this environment issue.

## Commands run

- Read the token-efficiency skill and reviewer repair plan.
- Inspected Git SHA, branch and working-tree state.
- Inspected protocol ingestion, attendance transitions, Tauri storage/keyring, React kiosk flow, mobile pairing route and repair checkpoints CP04–CP10.
- The commands above were run from their relevant `backend`, `frontend_web` and `frontend_web/src-tauri` directories.

## Remaining repair checkpoints

- Replace cache-backed pairing redemption with a database authorization consumed under a row lock. Code collision overwrite is fixed, but redemption is not yet atomic across concurrent requests.
- Finish protocol v2, domain-separated signing and shared Python/Rust/TypeScript fixtures while retaining v1 verification.
- Add content-bound durable server receipt and decision-history models. Current server evidence is immutable, but later manager decisions do not yet have the full companion history described in the plan.
- Add renderer restart/lost-response recovery for local request identities. Native idempotency exists, but the React screen does not yet persist and recover an interrupted request identity.
- Add enrollment grants with server signature, credential generation and expiry. The repaired v1 pilot performs typed TLS/device-token enrollment but does not yet provide the v2 offline grant contract.
- Add bounded offline authorization and richer trusted-time uncertainty. Rebooted offline sessions are correctly marked with missing trusted time, but the 24-hour policy is not yet enforced as a signed grant.
- Add native administrative capability sessions and a PIN-protected dashboard exit/recovery flow. Initial PIN creation is mandatory and unrestricted replacement is removed, but the management workflow remains incomplete.
- Build manager review/device health/recovery screens and outcome revision pull.
- Complete the mobile two-shell kiosk implementation and secure mobile storage.
- Complete bidirectional QR claim return before re-enabling desktop QR.
- Replace the current local schema column upgrades with a complete numbered native migration framework.
- Add a real PostgreSQL migration/concurrency suite and resolve the deployed `0046` history before any production migration.
- Package, sign and clean-machine test Windows/macOS installers before release.

## Known deferred scope

- Protocol v2 and cross-language fixtures.
- Database-backed pairing codes and proof-of-possession retry.
- Full outcome/history model and manager review UI.
- Complete mobile two-shell kiosk experience.
- Bidirectional offline QR attendance.
- Signed production installers, CI expansion and controlled pilot rollout.
