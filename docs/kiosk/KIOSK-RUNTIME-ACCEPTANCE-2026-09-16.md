# Windows kiosk runtime acceptance and installer

Status: IN PROGRESS, updated 17 September 2026. This report records new runtime evidence only; prior compilation and migration checks are recorded in the remaining-fixes handover.

## Requested checks

- Real PIN setup verification email to the user-authorized inbox, then kiosk authentication.
- CLOCK_IN, BREAK_START, BREAK_END and CLOCK_OUT through native capture.
- Lost capture response, committed receipt recovery and process restart.
- Offline capture and automatic reconnect/sync without duplicate attendance.
- Single-file Windows installer, configured for `http://127.0.0.1:8000`.

## Work performed

- Inspected native capture, receipt confirmation, background sync, PIN delivery and packaging entry points.
- Confirmed desktop PIN setup is deliberately disabled in its UI: it directs workers to the mobile app. Web kiosk has the email OTP setup flow; native kiosk enrolls an already configured worker after online PIN verification.
- Started the release NSIS installer build with `VITE_API_URL=http://127.0.0.1:8000` and `npm run kiosk:build -- --bundles nsis`. Result pending.
- Added guarded local acceptance server settings using the full migration graph, in-memory test OTP cache, real SMTP, and local Tauri origins. The settings still require a disposable database name with the `chemisttasker_kiosk_test_` prefix. A file-cache attempt encountered sandbox/user ACL differences and was replaced; restarting this test server intentionally invalidates outstanding OTPs.

## 17 September results and fixes

- Real PIN verification email to the explicitly authorized inbox `chemisttasker@gmail.com`: user confirmed receipt. Initial sandbox SMTP access failed; the subsequent authorized network-enabled server sent successfully. Do not interpret the first HTTP 200 as delivery evidence: the current mail code suppresses send failures.
- Actual HTTP OTP setup returned 201 and created a non-provisional roster-linked attendance session. The harness initially expected 200; corrected to 201 and resumed the already-created session without resubmitting its consumed OTP.
- Invalid OTP and invalid PIN requests returned 400. Valid break-start, break-end and clock-out requests succeeded. PostgreSQL inspection confirmed exactly `CLOCK_IN, BREAK_START, BREAK_END, CLOCK_OUT` for the session and a non-null closing timestamp.
- These HTTP checks are against `http://127.0.0.1:8001`, backed by the disposable `chemisttasker_kiosk_test_baseline_validation2` database. Port 8000 already belonged to an existing Django process and was left available to that process. The installer targets port 8000 as requested.
- Native release startup exposed `RECOVERY_REQUIRED: database-key is missing for existing kiosk data`. Root cause: development/release keys were separated but both builds used the same database path. Release now uses `<app_data>/production/kiosk.db`; the existing development root database remains in place. This is the first release packaging attempt; do not blindly apply this path change to a deployed legacy release without an explicit data migration.
- Added the Windows release subsystem attribute so the packaged GUI does not open an extra console.
- Fixed the earlier review's confirmed-request reuse defect: normal preparation only resumes `PREPARED` or `COMMITTED`. Supplying the original request ID to authenticated capture still recovers a committed/confirmed receipt. A confirmed historical action is never selected by normal preparation.
- Extracted the connection-level preparation helper and added a native regression covering each of the four actions: prepared/committed intent is resumed, while confirmed intent gets a new UUID. `cargo test --locked --lib`: 2 passed, including the historical schema upgrade regression. This is not yet the complete event-ID/sequence/restart runtime acceptance requested by the reviewer.
- Final NSIS packaging passed after downloading its tools with approved network access. Artifact: `dist/kiosk/ChemistTasker-Kiosk-0.1.0-Windows-x64-Local-Setup.exe`, 10,670,890 bytes. Includes the replay fix, release database separation and console suppression. OpenSSL missing-PDB warnings and a Tauri bundle-type metadata warning were emitted; no updater is configured or verified.
- The user stopped Computer Use with Escape during the final release startup check. No further desktop input was issued. Final startup, installer execution and native end-to-end acceptance therefore remain unverified; the installer is supplied for the user's local test.

## Reproducible local fixture

Use `attendance_tests.runtime_settings`, `USE_PROD_DB=False`, and `KIOSK_TEST_DB_NAME=chemisttasker_kiosk_test_baseline_validation2`. Run `seed_runtime.py` through `manage.py shell -c` to create/update the local owner, worker, pharmacy and assignments and generate a temporary pairing code. `runtime_pin_delivery.py` sends a real code, and `runtime_pin_actions.py` consumes that code and performs the four HTTP actions. These are explicit acceptance scripts, not production startup hooks; do not run them against other settings. The delivery script stores a disposable device token only in ignored `.local-run/kiosk-pin-http.json`.

## Still open

- Packaged UI four-action cycle, second shift/multiple breaks, and original event-ID/sequence assertions.
- Commit-success/response-loss fault injection and authenticated recovery after process restart.
- Full offline native capture and reconnect batch sync with duplicate-count inspection.
- Actual PC reboot and signed clean-machine installation.
- Explicit failure reporting/retry when PIN email dispatch fails (the observed HTTP response incorrectly claimed a send despite the initial SMTP error).

## Evidence and limits

No end-to-end checks are marked passed until their actual runtime results are recorded here. SMTP acceptance and receipt in the user's inbox are distinct checks. Installing a Windows package does not establish reboot durability or macOS compatibility.
