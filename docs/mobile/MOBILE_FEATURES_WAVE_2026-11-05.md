# Mobile features wave — safety and implementation notes (5 Nov 2026)

## Existing and new
- Existing: app version/OTA check at launch and resume, biometric shortcut using a valid server session, QR attendance clock, kiosk PIN separated by pharmacy.
- New: mobile-only settings for biometric enable/disable, system PIN and Face ID setup guidance, device permission visibility, user-initiated notification prompt, camera/location privacy explanations, explicit update check, and discoverability from every role's More tab.
- A custom in-app PIN is **not** a substitute for server authentication; for launch use the system device PIN fallback. Never store raw PINs in AsyncStorage.
- Notification permission changes in OS settings do not independently revoke server push tokens. A backend user notification-preferences and device-token revocation workflow requires an explicit contract before exposing a switch claiming server unsubscribe.
- Camera is only requested within the actual scanner. Location is not needed for barcode attendance; any map use remains separately optional.
- Don't claim QR scans establish employment or favorite status without confirmation via membership/application server enforcement.

## QA
Verify Android and iOS biometric enrollment, device passcode fallback, sign-out, account switching, expired JWT and revoked refresh, permission denied/blocked, return from OS settings, app update mandatory vs optional, and kiosk location-free flow.
