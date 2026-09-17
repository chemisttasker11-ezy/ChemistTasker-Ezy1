# Windows kiosk: local installer and workflow

This is a Windows x64 test build of ChemistTasker Kiosk 0.1.0. Its backend is fixed to `http://127.0.0.1:8000/api`. It contains the React kiosk interface, native attendance engine and encrypted SQLite storage. Django and PostgreSQL are separate services; they are not installed by this package.

## Install and pair

1. Open `ChemistTasker-Kiosk-0.1.0-Windows-x64-Local-Setup.exe` and complete the installer, then launch ChemistTasker Kiosk.
2. Keep the local Django server running at `http://127.0.0.1:8000` for pairing and the worker's first authentication.
3. Obtain a new kiosk pairing code from an authorized pharmacy owner/manager connected to that same backend/database. A code from the production mobile app will not pair against a different local database. If using a phone, its development app must reach the PC's local backend through the PC's LAN address; `127.0.0.1` on a phone refers to the phone itself.
4. Enter the six-digit pairing code, terminal name and a new Dashboard Access PIN (at least six digits), then confirm it and select **Pair & Launch Kiosk**.
5. Use an existing active worker with a configured attendance PIN. The desktop currently directs first-time PIN setup/reset to the mobile app. The Dashboard Access PIN is separate from the worker's attendance PIN.

## Attendance pattern

`Pair online → worker enters email/ID + PIN → first online enrollment → clock in → start break → end break → clock out`

The native app stores the attendance event locally before returning its receipt. It then syncs queued events to Django in the background. Once a worker is enrolled, test a network outage and watch the queue return to zero after reconnection. Repeat a second clock-in and multiple breaks to check that the new action gets a new receipt.

Closing the window and reopening the app should retain pairing, encrypted data and queued events. Do not delete the data directory or Windows credentials during outage/restart testing. Release data is under `%APPDATA%\com.chemisttasker.kiosk\production\kiosk.db`; keys stay in Windows secure credential storage.

## What this build proves

Real PIN verification email delivery has been confirmed by the user. The four online HTTP attendance actions passed against a separate, disposable PostgreSQL test backend. Native request-preparation and legacy local-schema regression tests passed. See the acceptance handover for the installed/native runtime scenarios still open.

The installer is unsigned. It uses the existing Microsoft Edge WebView2 runtime or downloads its bootstrapper during installation if needed, so first installation may require internet. Offline attendance is a runtime feature after initial pairing and worker enrollment. Automatic application updating and clean-machine installation are not release-certified.
