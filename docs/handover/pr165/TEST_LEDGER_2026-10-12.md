# Reusable test evidence — do not repeat unchanged passing work

This ledger records completed runs and their limitations. Read it before starting another broad test package. A new agent should inspect the current diff, reuse evidence for identical source/dependencies/configuration, and rerun only affected checks or unresolved acceptance. A new release commit still follows the workspace publication gate; never imply an old run tested a changed implementation.

## Tested checkpoints

- Base: `4fcdf69`, incorporating main `0a01085`. Identity/schema/replay comparisons use an archived copy of this base, identical APP_ENV=test/DEBUG=false and feature flags. No local env loading; Celery dispatch is intercepted.
- Application fixes: `53dc83f`.
- Final application checkpoint: `54dbc58b4fc0df2def15537853814784df6bad51` on `review/pr165-consolidated-20261012`.
- Follow-up after `54dbc58`: one stale Next source-contract test corrected; documentation updated. Application source, migrations and dependency locks remain identical. The route test rerun is explicitly listed below.

Raw logs are local ignored artifacts under `pr165-skills-design/playground/`. The counts/results and commands here travel with the PR; credentials, fixtures and generated artifacts do not. Previous branch evidence remains in `archive/` and is historical, not a new sign-off.

## Final application checkpoint gate

| Check and command | Result | Evidence / scope |
| --- | --- | --- |
| Backend CI label union: `python playground/publication-backend-ci.py` using the existing review venv | 948 tests run, OK; 43 explicit skips | `backend-ci-matrix.log`, `publication-backend-matrix.log`. 45 labels derived from repository workflows, disposable SQLite. Concurrency skips are not passing acceptance. |
| Extra backend: `python playground/review-extra-backend.py` | All commands exit 0 | `publication-backend-extra.log`: Django check; makemigrations check/dry-run; public hub 17; editorial 20; isolated worker finance 51; 16 attendance/roster unittest commands. |
| Shared core: `npx tsc --noEmit`; `vitest run`; `npx tsc` | Typecheck/build pass; 27 files, 198 tests pass | `publication-core-typecheck.log`, `publication-core-tests.log`, `publication-core-build.log`. Includes role mapping, claims, privacy, presets, recurrence/date rates and shared payload. |
| Vite: `npx tsc -p tsconfig.app.json --noEmit` | Pass | `publication-vite-typecheck.log`. |
| Next: `npx tsc --noEmit` | Pass | `publication-next-typecheck.log`. |
| Expo: `npx tsc --noEmit`; `expo lint` | Both pass | `publication-mobile-typecheck.log`, `publication-mobile-lint.log`. |
| Mobile compatibility/security regressions: `node --test scripts/dependency-security.test.cjs` | 7 pass | `publication-mobile-security-tests.log`. |
| Mobile installed dependency verification: `npm run security:dependencies` | Pass | `publication-mobile-dependencies-retry.log`. Raw npm metadata reports 24 entries / 2 advisories; existing installed patch fingerprints cover them, no new advisory accepted. Initial direct Node invocation failed because npm_execpath was absent; it was a harness mistake, not a passing run. |
| Web auth/WS: `node --test scripts/auth-flow.test.mjs scripts/ws-url.test.mjs` | 12 pass | `publication-web-auth-ws.log`. |
| Next URL/public routes: `node --test lib/api-root.test.mjs lib/public-route-contract.test.mjs` | 14 pass after stale test correction | `publication-next-route-retry.log`. Initial test expected removed inline label joins; corrected to the shared Required/Preferred/Software renderer without changing UI/eligibility. |
| Full web browser: `node frontend_web/e2e/run-tests.mjs --workers=2` (run from e2e) | 160 pass; 3 skipped | `publication-browser.log`, summary JSON records `54dbc58`. All 24 appearance baselines unchanged. Live Next test and 2 seeded checks are explicitly separate from this hermetic runner. |
| Visual states and UI ownership: web `audit-dashboard-visual-states.mjs`, `audit-ui-boundaries.mjs` | Both pass | `publication-visual-state.log`, `publication-ui-boundaries.log`. |
| Root audits: architecture-boundaries, shared-core-boundary/package/transport, native-tab-routes, frontend-static-wiring, api-v1-cutover; API cutover audit tests | All pass | Corresponding `publication-*.log`; SHARED_CORE_AUDIT_BASE=4fcdf69. No allowlist expansion. |
| Wiring comparison: `node scripts/audit-wiring-diff.mjs 4fcdf69 HEAD --json` | Pass; no removed wiring, 2 new shared template API strings | `publication-wiring.log`. 42 pre-existing migrated Vite/Next drift entries remain; static audit is not universal behavior proof. |
| Final backend image: `docker build -f backend/Dockerfile -t ct-pr165-review-backend .` then `docker run --rm --env-file <ignored synthetic env> ... python manage.py check` | Build and system check pass | `publication-backend-image.log`, `publication-backend-boot.log`. No source/shared-core mounts; registry is packaged in image. |

The orchestrator `playground/review-publication-gate.mjs` records commit and per-command exits in `publication-frontend-summary.json`, `publication-backend-summary.json`, `publication-browser-summary.json`. Preserve initial failed command logs alongside successful targeted reruns; do not silently relabel them.

## Real API/browser and baseline evidence

| Check | Result / checkpoint | Evidence and limits |
| --- | --- | --- |
| Current-role booked profile HTTP regression | Red old pharmacist biography, then green current Student bio/CV/contact; included in 948 final tests | `review-booked-profile-red.log`, `review-booked-profile-detail.log`; `AssignedProfileTests.test_booked_profile_contact_and_cv_follow_the_current_worker_role`. Signed storage URLs are compared by parsed path. Historical row retained. |
| Pay visibility query regression | Pass in final matrix | `test_feed_reuses_pay_visibility_per_pharmacy_and_never_across_requests`: after first decision, 50 lookups across three serializers issue 0 queries; new request reflects manager permission. Per distinct pharmacy still needs a lookup. |
| Fresh Student onboarding save/reload | Pass | `review-candidate-api.log`: claims initially empty, real mobile login then PATCH `otherstaff/onboarding/me/` with tab=skills, GET preserves dispensing/software IDs. No out-of-role vaccination in happy fixture. Admin fixture flags are synthetic, not evidence of real qualifications. |
| Live seeded Next login → Vite candidate review/reveal | 2 browser tests pass after fresh API saves | `review-seeded-browser.log`: real backend auth/profiles/reveal; anonymous counteroffer before reveal, role/experience/ID badge, skill/software IDs, no email/CV after reveal. Second test uses mocked board data to verify ranking/filter transport. |
| Isolated authenticated Next/Vite/Django suite | 2/2 pass at application packaging checkpoint | `review-authenticated.log`: owner cookies/refresh/CSRF/scope/logout; delegated manager assigned pharmacy 200, foreign pharmacy 403, route recovery. Backend changes since are current-role read projection/cache; final backend tests cover them. |
| Live Vite logo → Next home | 1/1 pass | `review-live-next.log`. |
| Live compiled core module | Pass | `review-live-module.log`, `review-vite-export.json`: escalation/payload exports are functions. The initial source alias exposed a type-only export; compiled alias fixes it. |
| API identity/schema/full multi-persona replay | Final repetition at 54dbc58: all three identical to 4fcdf69 | `publication-contracts.log`, `contract-summary.json`, identity/schema/replay logs. Matching environment is essential; initial local-env differences were corrected, not ignored. |
| PostgreSQL migration/concurrency/HTTP | Final application checkpoint: migration rehearsal and 74 tests pass, 0 skips | `publication-postgres.log`: 74 tests in 500.240 seconds. Fresh isolated postgres:16 database; no existing live database migrated. Earlier passing run remains in `review-postgres.log`. Slow final run was database file sync during fixture TRUNCATE, not an application deadlock. |
| Standalone Next production image build/boot | Pass at 53dc83f; runtime application unchanged since | `review-next-image.log`, `review-next-boot.json`: login HTML and 3 static assets HTTP 200. Hydrated login is established separately by authenticated tests, not this boot check. |
| Clean locked installs | Vite/Next production image and Expo installs/checks passed at 53dc83f | `review-vite-install.log`, image/typecheck logs. Dependency locks unchanged at final checkpoint. Required Expo postinstall patches applied; initial ignore-scripts export failure is not acceptance. |

## Native and unavailable gates — resume these only

| Attempt | Outcome | Next action |
| --- | --- | --- |
| Android production JS export | Pass after required dependency patches | Existing export evidence; rerun only if native JS/config/deps change. |
| Official SDK/JDK/API35 emulator installation | Complete; checksum-verified tools, WHPX usable, boot_completed=1 | Ignored workspace-level playground/native-tools. No system driver/security changes. |
| Isolated Android prebuild/debug APK | Build successful, 630 tasks; APK installed successfully | `review-android-ninja12-build.log`. Synthetic Firebase project, localreview package, remote updates disabled. Original CMake/Ninja failures documented; installed Ninja1.12 fixed old tool's long prefab-path reads. No app/vendor patch published. |
| Android runtime journeys | Synthetic owner login, dashboard, Shift Center and candidate Counter Offer review dialog passed visually; onboarding, talent, post-shift preview and roster not yet accepted | `review-native-metro-index.log`, `review-native-runtime.log`, `review-native-screen.png`; candidate dialog screenshot `playground/review-native-candidate.png` (ignored). The dialog showed Student role, skill/software claims, verification badges and proposed terms. Emulator System UI ANR, dev-client timeout then wrong entry were resolved in the ignored copied/junctioned harness with an index wrapper. Fast input dropped characters; paced synthetic password entry succeeded. |
| Kiosk `cargo test --locked --offline` on Windows | Blocked before tests | `publication-kiosk.log`, `publication-kiosk-retry.log`: missing Perl, then bundled Git Perl lacks Locale::Maketext::Simple for OpenSSL. Use Linux CI/native complete toolchain. No kiosk source changed. |
| iOS native | Not run | Mac/iOS runner required. |
| Hosted CI/runtime audit/platform jobs and staging | Not run locally | Successor PR's real hosted results and staging multi-persona acceptance required before merge/release. |

## Reuse rules for the next agent

1. Compare implementation, migrations, locks and relevant config to `54dbc58`; read any later test/doc-only diff before repeating suites.
2. For unchanged implementations, retain the evidence above. Do not rerun 948 backend / 160 browser / 198 core tests merely to rediscover completed results.
3. Resume remaining Android runtime (onboarding, talent, post-shift preview, roster), iOS, kiosk/platform CI and staging acceptance. Candidate review is confirmed; rebuild the APK before validating the later shared preview refactor. A fixture/toolchain change calls for that acceptance check, not unrelated application regression packages.
4. If source changes, run meaningful affected regressions and required outgoing gates. Record the new tested commit, result and why the earlier evidence no longer covers it.
5. Never derive policy from early seeded users, mark skips as passed, bless appearance baselines to hide changes, or claim merge/release readiness from build/typecheck alone.

## Verification refresh — working tree after `54dbc58`

The source tree has since received a focused posting-preview refactor. These results apply to the current working tree as checked on 12 October 2026; they are supplemental to, and do not replace, the exact-commit matrix above.

| Check | Result | Scope / evidence |
| --- | --- | --- |
| Shared posting draft + recurrence tests: `npx vitest run src/domains/shifts/postingDraft.test.ts src/domains/shifts/draftSlots.test.ts` | 9/9 pass | Current `shared-core` worktree. Exercises centralized preview mapping, weekly occurrence expansion, custom rates and payload defaults. |
| Shared-core typecheck/build: `npx tsc --noEmit`; `npx tsc` | Pass | Current shared posting contract and preview helper. |
| Expo typecheck: `npx tsc --noEmit` | Pass | Current native posting screen uses the shared preview builder. |
| Vite typecheck: `npx tsc -p tsconfig.app.json --noEmit` | Pass | Current shared web posting form and helper cleanup. |
| Next typecheck + route contract tests | Pass; route tests 14/14 | Current Next package; refreshed route test asserts the shared Required/Preferred/Software renderer. |
| Android candidate review dialog | Pass, visual runtime check | On isolated API 35 emulator, opened a synthetic Student's counter-offer review. It rendered Student role, profile/ID badges, claimed Prescription dispensing skill, LOTS (Corum) software, and proposed date/time/rate. Screenshot: ignored `playground/review-native-candidate.png`. This confirms the candidate-review path only, not full onboarding/talent/posting/roster journeys. |

The current shared preview helper/source changes were made after the recorded APK build, so that APK does not verify the latest posting-preview refactor. Rebuild/install the Android app before accepting the native post-shift preview path. Earlier full regression evidence still covers unchanged modules only; do not describe this worktree as having rerun the full matrix. iOS, kiosk toolchain/CI, hosted PR checks and staging acceptance remain outstanding.

## Review follow-up after 54dbc58 (uncommitted at time of writing)

Source changed: shared `buildShiftPostingPreview` and `SUPER_GUARANTEE_PERCENT` (postingDraft), web/native Review use the shared preview, native PharmacyForm GST line and `.gitignore` headers restored from main. Affected checks only:

| Check | Result |
| --- | --- |
| Shared core `npx tsc --noEmit`, `vitest run`, `npx tsc` | Pass; 27 files, 200 tests (198 + 2 new preview/super tests) |
| Packed core installed into each host via `scripts/install-shared-core-artifact.mjs` (run from PowerShell; Git Bash `tar` misreads `C:` as a remote host) | Installed |
| Vite `tsc -p tsconfig.app.json --noEmit`, Next `tsc --noEmit`, Expo `tsc --noEmit` and `expo lint` | All pass |
| Architecture, shared-core boundary/package/transport, frontend static wiring, web UI boundaries | All pass |

Not rerun: backend (no backend change), full browser runner (web Review mapping is unchanged code moved into shared-core), full native journeys (only the candidate review dialog was confirmed; the latest posting-preview edits postdate the APK build).
