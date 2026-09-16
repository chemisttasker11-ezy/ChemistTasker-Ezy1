# Windows kiosk runtime acceptance and installer

Status: IN PROGRESS. This report records new runtime evidence only; prior compilation and migration checks are recorded in the remaining-fixes handover.

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
- Added guarded local acceptance server settings using the full migration graph, persistent local test OTP cache, real SMTP, and local Tauri origins. The settings still require a disposable database name with the `chemisttasker_kiosk_test_` prefix.

## Evidence and limits

No end-to-end checks are marked passed until their actual runtime results are recorded here. SMTP acceptance and receipt in the user's inbox are distinct checks. Installing a Windows package does not establish reboot durability or macOS compatibility.
