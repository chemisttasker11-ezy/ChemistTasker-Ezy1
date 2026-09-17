# Kiosk current-blocker acceptance

Base commit: `c36d82fc4b1a02016c678ea37d32c6ee9e05e452`.

This patch closes the concrete blockers found in the current Windows PIN slice. It does **not** claim to complete protocol-v2, mobile two-shell, bidirectional QR, native payroll, or the full manager recovery UI.

## Required verification

1. `python manage.py migrate --settings=attendance_tests.migration_settings` on a disposable PostgreSQL DB.
2. `python manage.py test attendance_tests.test_kiosk_release_blockers` using a normal isolated Django test DB/settings appropriate to the repo.
3. `npm run typecheck:kiosk`.
4. `cargo test --locked --lib` and `cargo check --locked` from `frontend_web/src-tauri`.
5. Acceptance build must use a loopback URL only:
   - PowerShell: `$env:VITE_API_URL='http://127.0.0.1:8001'; npm run kiosk:build:acceptance`
6. Production build must use the real HTTPS ChemistTasker API:
   - PowerShell: `$env:VITE_API_URL='https://<REAL-CHEMISTTASKER-API-HOST>'; npm run kiosk:build:production`
   - The build must fail if a production profile points to localhost or plain HTTP.
7. Pair a native kiosk, then simulate server-commit/client-response-loss by repeating the same pairing code/attempt. Confirm the same `KioskDevice` is recovered and a fresh device token replaces the lost token.
8. Verify worker offline authorization expires after the configured validity window and forces online re-verification.
9. Verify a rejected sync result marks local state as requiring reconciliation before another attendance transition.
10. Native runtime cycle: `CLOCK_IN -> BREAK_START -> BREAK_END -> CLOCK_OUT -> second CLOCK_IN`.
11. Disconnect network, capture events, restart the app, reconnect, and verify exactly-once server ingestion.
12. Reboot the PC and repeat persistence checks before pilot sign-off.

## Important deployment note

The previously built `ChemistTasker-Kiosk-0.1.0-Windows-x64-Local-Setup.exe` is an acceptance artifact because it was built with a loopback API URL. Do not distribute it to pharmacies as the production installer.
