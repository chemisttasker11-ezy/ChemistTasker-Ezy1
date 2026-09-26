# CP6 local integration review

## Decision

CP6A camera support and CP6B/CP6C persona, pharmacy-scope, and navigation logic are integrated in the local `main` working tree. They remain uncommitted pending acceptance.

## Integrated behavior

- Expo Camera is locked to the SDK 54 compatible release and requests camera access only. Microphone and Android audio-recording permissions are disabled.
- Attendance QR scanning uses the rear camera, QR-only recognition, a scan lock, automatic clock-in/clock-out submission, permission recovery, and the existing manual token fallback.
- New credential and biometric sign-ins select the account's original role persona first.
- Admin persona and selected pharmacy are persisted per user and persona. Staff and admin workspace selections restore independently.
- Admin rendering waits for pharmacy-scope restoration. Capability checks use the selected admin assignment's pharmacy.
- The obsolete mobile-only admin assignment helper was removed; shared-core remains the authority for persona and capability normalization.
- Metro's incompatible global `image-size` and `query-string` overrides were removed. Metro and Expo Router now receive their declared dependency major versions.

## Verification completed

- `npm run lint`
- `npx tsc --noEmit`
- Expo public config validation
- Expo web production export: 246 static routes
- shared-core access policy: 15 tests passed
- Impeccable detector: no findings in the changed camera/admin UI files
- Browser-cookie login started in the disposable user's Pharmacist persona
- Switched to Admin, selected the second pharmacy, reloaded, and restored that Admin persona and pharmacy
- Returned to Pharmacist, reloaded, and restored the staff persona independently
- In-app Roster navigation succeeded for a Roster Manager; Pharmacy management was rejected for that assignment
- Camera page passed a 390 x 844 viewport review; browser camera permission opened the scanner with no console errors

## Remaining native check

The native restart/deep-link matrix has not run because no Maestro runner or native test device was used. Direct browser navigation to `/admin/shifts` was manually confirmed in Chrome after the automated hard-navigation session behaved inconsistently. Run the nine-step native matrix on a development build before release acceptance.
