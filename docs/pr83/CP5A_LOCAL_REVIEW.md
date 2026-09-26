# PR83 CP5A local review (2026-09-26)

Local `main` remains at `fdbfd4b`. CP5A is an uncommitted, selective working-tree integration from reviewed PR83 head `a6a5264`; nothing has been pushed. CP5B public landing edits remain excluded.

## Local main before to CP5A after

- **Kiosk desktop:** the Tauri bridge now requests server QR tokens, holds a bounded offline authorization lease, rejects new capture after expiry or revocation, can manually sync, and requires the dashboard PIN plus server self-revocation before disconnecting. Already signed offline evidence can still drain under the CP2 backend rules.
- **Web kiosk:** pairing, online QR, pending-sync status, and disconnect feedback use the native bridge where available. Browser-only disconnect copy now says it clears local registration and directs a manager to revoke the server device separately.
- **Web workforce:** leave types use the CP1 shared options; attendance approval and QR errors remain visible after updates; timesheet recalculation says it uses attendance already received. A proposed “Sync now” timesheet action was rejected because it only recalculated the period and did not sync offline kiosks.
- **Web device management:** Workforce settings lists kiosk devices, status and sync details, and requires confirmation before revocation. The tab uses the CP2 manager scope rather than the broader staff-management capability. Old pharmacy requests cannot overwrite the currently selected pharmacy.
- **Narrow Expo mirror:** the existing kiosk status page uses the same shared manager-scope helper for listing and revoking devices, with confirmation and feedback. The existing Expo timesheet copy states the same offline-sync limitation. PR83's camera redesign and dependency changes remain reserved for the separate Expo review.
- **Shared policy correction:** Org Admin access requires the verified organization pharmacy list. Chief and Region require a pharmacy assigned under that organization and an `OWNER` or `MANAGER` admin level, matching the CP2 backend. An empty scope grants nothing.

The current local-main web auth/session implementation was preserved. PR83's `frontend_web/src/contexts/AuthContext.tsx` was not copied over it.

## Checks completed

- Shared-core: 70 tests pass; build passes.
- Web and Expo TypeScript checks pass; Expo lint and Vite production build pass. Existing MUI barrel/chunk-size warnings remain.
- Tauri `cargo test --locked`: 3 tests pass, including the authorization lease case.
- Impeccable detector and `git diff --check` report no findings.
- Signed-in localhost web check with a disposable owner and pharmacy: Workforce settings listed a disposable native kiosk, showed a confirmation dialog, server revocation succeeded, and the row changed to **Revoked**. Timesheets and manager attendance review routes rendered.
- Kiosk pairing and advanced setup screens rendered in the browser.
- Terminal Playwright CLI was repaired by allowing official npm registry/cache access. A named CLI session opened the local kiosk, captured a fresh DOM snapshot, switched from pairing to advanced setup, and saved a screenshot under `output/playwright/cp5/.playwright-cli/`. The only console error was the development-only missing `favicon.ico`.
- The disposable owner, pharmacy, kiosk, JWT rows, and websocket tickets were removed after verification. Django's normal deletion collector could not run before `workforce.0005` because it queried a column not yet in the development database; a transaction guarded by the test account and record names removed only those test rows.

## Subsequent local verification (2026-09-27)

- A native debug Tauri kiosk paired with a disposable owner, worker and pharmacy against an isolated PostgreSQL test database. A live clock-in and an attendance event recorded while the API was offline each synchronized once. A third event was signed offline, the device was revoked on the server, and synchronization drained it as `NEEDS_REVIEW` with `DEVICE_REVOKED_DRAIN` and no applied attendance event. The user manually confirmed that a subsequent PIN action showed the revoked-device message. The backend still had exactly three kiosk sync rows, including one revoked drain, after that attempt.
- The development database was backed up to `C:\ChemistTasker_Ezy\backups\cp5-before-migrations-20260926-213358.dump` and the archive was validated with `pg_restore --list`. `public_hub.0004` and `workforce.0005` were applied to the local development database. The subsequent migration plan is empty, `makemigrations --check --dry-run` found no model changes, and the new leave column is readable.
- Packaged acceptance and production builds now have distinct Tauri app identities, data directories and keyring scopes. Acceptance builds remain constrained to a loopback API by the existing build validator. A previously downloaded acceptance EXE predates this isolation and is not evidence of the new package. No production installation was found; the user is unsure whether one exists.
- A transient QR failure now retries while a revoked device stops retrying and shows an explicit revoked status. Kiosk TypeScript, acceptance UI build, three Rust tests, Impeccable detector and diff whitespace check pass.
- The supplied `env.zip` was inspected for relevant key names only. The current Expo `.env` kept its localhost API URL; matching localhost WebSocket and web URLs were added. No archived production values or stale LAN address were copied. The normal local API was restored on `127.0.0.1:8000` after the isolated offline test.
- In an isolated headless Expo web session, the disposable owner signed in, selected the test pharmacy, and opened `Kiosk devices & PINs`. The native test device appeared as **Revoked**, with received sequence `3` and the expected re-pairing guidance. No browser console errors occurred on that screen. This checks the Expo web renderer; an Android/iOS device render remains outside this local browser check.
- The pre-test debug kiosk database was restored byte-for-byte (hash matched the backup); the test copy remains under `.local-run` as local evidence. Isolated API, Vite, Expo and browser sessions were stopped, the disposable PostgreSQL database was removed, and the normal port-8000 development API remains live.
- A fresh acceptance build compiled the release EXE and produced `frontend_web/src-tauri/target/release/bundle/msi/ChemistTasker Kiosk Local Test_0.1.0_x64_en-US.msi` (12,726,272 bytes). The first restricted run could not execute WiX `light.exe`; the permitted local-tool retry completed. Tauri warned that its optional updater bundle-type marker was absent; this kiosk does not use the updater plugin.
- The user installed the fresh MSI and confirmed its pairing screen opens. Windows lists **ChemistTasker Kiosk Local Test** with app ID `com.chemisttasker.kiosk.acceptance`.

## Decision

The CP5A local runtime gate, signed-in Expo browser gate, fresh acceptance installer build, and installed-app launch pass. The already downloaded acceptance EXE predates the profile separation and should not be used for this result. Native Android/iOS visual inspection and CP5B remain separate work. Do not push these uncommitted local changes without the user's review.
