# CP9 local verification decision

Date: 2026-09-27

## Decision

Accept the static audits and attendance/kiosk contract coverage as required CI checks. Retain the Vite Playwright suite as a manual GitHub Actions verification job until it has repeated clean runs on GitHub-hosted runners. Maestro remains a manual native acceptance specification. An unsigned kiosk package remains build evidence only and is not a production distributable.

## Integrated and verified

### Static frontend audits

- `node scripts/audit-native-tab-routes.mjs`
- `node scripts/audit-frontend-static-wiring.mjs`

Both pass on current `main`. The audits found and drove focused corrections:

- Owner persona switches now target `/owner/dashboard`.
- Explorer persona switches now target `/explorer/dashboard`.
- Pharmacist and Other Staff membership pages are explicitly registered as hidden tab routes.
- Two visible `Download CV` controls now open the supplied resume URL.
- The unsupported no-op `Continue as Guest` control was removed.

The audits run in `.github/workflows/frontend_mobile_ci.yml`, whose action references are pinned to immutable commits.

### Attendance and kiosk contracts

The attendance/kiosk unittest group is included in `.github/workflows/shared_core_consolidation_ci.yml`.

Local result: **110 passed, 1 skipped**. The skip is part of the existing isolated contract suite.

### Vite Playwright

The suite now lives in the dedicated `frontend_web/e2e` package with its own lockfile. `@playwright/test` is pinned exactly to `1.63.0`; `1.55.0` was rejected because npm reported the browser-download certificate advisory GHSA-7mvr-c777-76hp. The isolated package reports zero known npm vulnerabilities.

The runner builds current application source and starts a private Vite preview on port 4173. It does not reuse a developer server. This removed eleven false login/navigation timeouts from the initial run.

The eight previously reported route failures were Google Maps loader retries in an environment without a Maps key. The suite now ignores only the two known Maps loader error signatures while continuing to reject page errors, missing routes, application errors, and unrelated console errors.

The timesheet contract test was updated to the accepted UI and behavior: `Recalculate` posts `{ sync: true }` to the existing period recalculation endpoint and tells the manager that offline kiosks must sync at the terminal.

Local production-preview result: **82 passed, 0 failed**.

`.github/workflows/frontend_e2e_manual.yml` is manual only, uses the dedicated lockfile, pins its GitHub actions, cancels superseded runs, and uploads trace, screenshot, video, and HTML artifacts on failure. It is not a pull-request or release gate yet.

## Deliberately not accepted as gates

### Maestro

The PR83 Maestro flows still require a native test build, disposable persona accounts, a seeded backend, and a managed device/emulator runner. They are not represented as automated CI proof.

### Kiosk production release

The existing local acceptance MSI proves build and installation behavior. No signing identity or signed installer verification was added in CP9, so an unsigned EXE/MSI must not be published as a production release.

## Current CP9 status

| Area | Current status |
|---|---|
| Native tab route audit | Required CI check; green locally |
| Static frontend wiring audit | Required CI check; green locally |
| Attendance and kiosk backend contracts | Required CI check; 110 passed, 1 skipped locally |
| Vite Playwright | Manual workflow; 82/82 green locally |
| Playwright dependency reproducibility | Dedicated lockfile; zero known npm vulnerabilities |
| Failure artifacts | Enabled for manual Playwright workflow |
| Maestro | Manual specification only |
| Unsigned kiosk package | Build evidence only |
