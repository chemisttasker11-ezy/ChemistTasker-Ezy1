# Native Maestro smoke suite

These flows exercise the real installed ChemistTasker Expo/native app (com.chemisttasker.app). They are intentionally not Playwright mobile-browser emulation.

## Safety contract

Run against a disposable development or staging backend only. Do not point these flows at production. Test accounts must be mobile-verified and pre-seeded for the persona under test. The delegated Admin account must have a valid pharmacy assignment with the established capabilities required by the visible manager routes.

## Required environment variables

- MAESTRO_OWNER_EMAIL / MAESTRO_OWNER_PASSWORD
- MAESTRO_ADMIN_EMAIL / MAESTRO_ADMIN_PASSWORD
- MAESTRO_ORG_EMAIL / MAESTRO_ORG_PASSWORD
- MAESTRO_PHARMACIST_EMAIL / MAESTRO_PHARMACIST_PASSWORD
- MAESTRO_OTHERSTAFF_EMAIL / MAESTRO_OTHERSTAFF_PASSWORD
- MAESTRO_EXPLORER_EMAIL / MAESTRO_EXPLORER_PASSWORD

## Running

Install a native Android/iOS build configured for the test backend on the connected device/emulator, then run the YAML flows in this directory with Maestro.

The repository does not currently provide a dedicated native E2E test APK/device runner or disposable E2E credentials. Until that infrastructure exists, these flows must not be represented as a mandatory green CI gate. The web Playwright suite is separately safe to run on PRs because it intercepts backend traffic and does not mutate live data.
