# PR165 review fixes â€” local only, 12 October 2026

Latest direction: work locally. No follow-up fixes have been pushed. PR165 remains draft; do not call it mergeable until the pending gates below are completed. Baseline is the local reviewed merge `4fcdf69` of remote main into design/pr165-skills (published PR head was `e449427`).

## Changes implemented

- Backend Docker contexts now include the canonical skills registry, packaged at `/opt/chemisttasker/skills_registry.json`. A single cached loader fails closed on missing/malformed data; validation no longer bypasses the catalog. Added packaged-path/malformed-resource tests.
- Shared web UI is an explicit local package with host peer dependencies. Next imports its package exports; shared UI no longer imports a Next-host RoleTile. Copied local packages resolve peers inside each host. Next standalone Docker context/tracing includes shared code.
- Vite dev aliases canonical compiled shared-core output; unified startup rebuilds core and forces dependency refresh, addressing the missing `automaticShiftEscalationDates` export.
- Private-booking partial PATCH derives allowed tiers after applying the effective booking state. HTTP tests cover description, slots, retarget and unauthorized edits.
- Pharmacy instant claims use the accepted membership role as employment approval. Claimed dispensing skills alone cannot assign an assistant to technician work without that approved role. Discovery/application still accept unverified role-eligible skill claims. Shared backend helper also covers staff engagement terms.
- Staging fixture composition moved from users to testing to remove the inherited onboarding/users module cycle; dependency allowlists unchanged.
- Payroll pharmacy overview reads the canonical `pharmacy_id` query key, fixing settings routing. Two GST separators restored to UTF-8 bullets.
- Wiring job uses the ref checkout already fetched, avoiding an unauthenticated fetch.
- Web posting form reduced from about 1,452 to about 740 lines. Timetable, pricing and template controllers own their work; one shared shifts-domain builder/validator constructs web/native posting payloads. Recurrence/rate-row identity remains in draftSlots. Native template and guide saves use shared domain APIs.
- Native Details includes travel, accommodation and urgency; Timetable includes flexible timing. Native Review projects the same payload through the actual native board card. No duplicate native payload builder.
- Shared-core artifact installation copies only the validated packed package, preserving locked host dependencies. CI package audit explicitly distinguishes copied local packages from mobile links. Generated `.ci-artifacts/` stays ignored.
- Hermetic browser runner explicitly excludes the separately hosted real Next/Django login journey; full-stack acceptance continues to include it.

## Evidence already collected

- Backend CI-label matrix: 946 tests, passed, 43 skips (SQLite-specific unavailable/concurrency cases are not acceptance successes).
- Additional backend suites: public hub 17; editorial 20; worker finance 51; 16 attendance/roster unittest commands all passed. System check passed, no model migration changes detected.
- Shared core: 27 files, 198 tests passed, including dedicated privacy, notification edit suppression, date-rate override, salary-contract and extras regressions.
- Vite, Next and Expo typechecks passed before clean-install repetition; fresh Expo typecheck also passed.
- Browser: 160 passed, 3 skipped; 24 appearance cases passed without baseline changes, including the eight reported pharmacy cases. One real-stack test failed because it was launched against the Vite-only preview. Dedicated authenticated rerun remains required.
- Architecture, core boundary, package/transport strict typing, native tab route and static wiring audits passed. No ownership allowlist expansion.
- Production backend and Next images built. Backend image imports/system check passed with packaged registry. Standalone Next `/login` and three static resources returned HTTP 200 (HTML alone is not hydrated login acceptance).
- API URL/migration/Celery identity and schema are identical. The complete multi-persona API replay is identical with APP_ENV=test and identical feature flags. Initial differences were local environment loading, not code changes.

## Pending gates and environment notes

1. Complete PostgreSQL migration/concurrency run, normalized API identity/replay, final exact-source backend gate including added resource tests.
2. Windows live Vite process held a native dependency DLL during npm ci. That broke the first authenticated run. Stop/restart only this checkout's development stack, restore locked dependencies, reinstall fresh core artifact and rerun the isolated authenticated suite.
3. Repeat clean Vite typecheck/build and hermetic browser suite. Next production build already exercises isolated npm ci and typecheck.
4. Android production bundle export passed after applying the repository-required postinstall patches (the initial install incorrectly skipped scripts). Emulator was initially deferred, then the user authorized installing one; official Android tools/JDK installation is now in progress. Device-level acceptance remains unverified; iOS/staging unavailable under local-only direction.
5. Record final wiring differences against main, update this ledger and local handovers; verify generated data remains ignored. No push under current instruction.

Logs, copied fixtures, generated artifacts and synthetic env files are under ignored `playground/`/`.e2e/`. Never force-add them. Earlier evidence is historical; do not claim current exact-commit or native/staging acceptance from it.

Update: live Vite browser import confirms automaticShiftEscalationDates and buildShiftPostingPayload are functions. Source alias was replaced by compiled output to preserve TypeScript type-only export erasure. PostgreSQL migration and 74 concurrency/HTTP tests passed. Final isolated login run and hermetic browser rerun remain in progress.

## Latest local gate update

- Final browser regression run: 160 passed, 3 skipped; all 24 appearance baselines unchanged. Earlier kiosk failure was bootstrap timing; test now waits for pharmacy scope and verifies the selected tab before checking the device. Targeted revoke passed, then the full suite passed.
- Backend: 946 passed, 43 skipped; PostgreSQL migrations and 74 concurrency/HTTP tests passed. Public hub/editorial/finance and all 16 additional attendance unittest commands passed. No existing database migrated.
- Shared core: 198 tests passed. Vite/Next/Expo typechecks passed; backend/Next production images built and booted. Android bundle export passed with required postinstall patches applied.
- API replay and URL/auth/permission/migration/task identity are identical to reviewed main-merge baseline, as is OpenAPI schema. Use APP_ENV=test to prevent local environment files affecting comparisons.
- Real authenticated Next/Vite/Django acceptance: 2/2 passed: owner cookie refresh, CSRF, scope and logout; delegated manager pharmacy isolation and unauthorized route recovery.
- Live development browser import confirms automaticShiftEscalationDates and buildShiftPostingPayload are functions in canonical compiled output.
- Emulator installation authorized and in progress. Android CLI/Temurin archives had verified SHA256 hashes. Native device and staging acceptance are still outstanding; no push performed.
