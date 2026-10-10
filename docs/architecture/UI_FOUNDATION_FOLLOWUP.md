# Accepted-policy UI foundation follow-up

Reviewed baseline: `ff42849f79adacb4823e90f6a23227820a17567e`. Work remains local in `feat/ui-foundation`. The new remote PR160 chat fix `22aaa6d9e847e2c0cb3dab98d72a0cc6d33da051` was integrated by fast-forward without conflicts. The final remote check found main unchanged at `a4fb05bd5caa3a68a639544729c419eea868015a`; both remote heads are ancestors of the local branch.

The user accepted all seven recorded backend policy rows, requested these follow-ups in this same branch, and excluded unavailable staging. The attachment's separate-PR recommendation is superseded. This is not a frontend-only branch. Approved eligibility, finance, dashboard and other policies remain unchanged by these follow-ups.

## Task ledger

| Stage | Outcome and evidence | Status |
| --- | --- | --- |
| 1 | Corrected roster attribution: main already rejected acknowledgement of non-published periods. `can_acknowledge` exposes the existing rule. Policy acceptance/staging exclusion recorded in closeout. | Complete |
| 2 | Expo reloads read mapped `userDetail`; failed reveals stop; dialog/rating requests reject stale selections. Web and Expo counteroffer reviews prefer the matching rich Interest profile. PLATFORM counteroffers reuse the revealed work-profile serializer and omit contact/CV fields. | Complete; native device interaction gate still outstanding |
| 3 | Both mobile worker dashboards reuse their existing card styles and show work status, recommendations and reason. Existing routes/API calls retained. Web E2E checks status distinctions and shift destinations; backend personalization contracts pass. | Implementation complete; mobile device acceptance outstanding |
| 4 | Fixed 106 by 20 pixel native date-text rectangles are excluded on the two affected desktop views. Input geometry is independently checked. No global pixel-count allowance; borders/icons/the rest of the screen are compared at the existing pixelmatch threshold. Baseline images unchanged. Loading completion is awaited before capture. | Complete; 24 appearance checks passed |
| 5 | Dashboard shell reduced from 951 to 297 lines. Workspace reconciliation has one owner; selectors, persona switcher, menu and pure model moved into focused modules. Static audit checks the new ownership, rather than requiring moved logic in the coordinator. Scope/persona/search/route tests pass. | Complete |
| 6 | Active shifts coordinator reduced from 1,178 to 295 lines. Review, payment, decisions, slot attention, lists and dialogs have separate owners. Existing service methods, request bodies, slot resolution, events and errors retained. Candidate/browser/backend gates pass. | Complete |
| 7 | Removed two dark global important rules in favor of owned MUI divider/table-cell overrides. Roster drag loop/listeners moved together into a hook; talent pure model extracted and shift form loaded on demand. Source/fixture whitespace normalized; Markdown hard breaks preserved through `.gitattributes`. | Bounded work complete; wider cleanup remains open below |
| 8 | Isolated `npm ci` for core, Vite, Next and mobile, then one packed core consumed as real packages by all three apps. Types/lint, both web builds, core unit tests and Windows browser/appearance suites exercised. Active checkout dependencies unchanged. | Complete |
| 9 | Fresh Python runtime audit, npm runtime audits and current/history credential hygiene checks run. Kiosk types/UI build, Android prebuild and Android/iOS JavaScript exports pass. Windows EXE attempted twice and failed on local Perl tooling; Android/iOS native binaries/device suites unavailable here. | Partially blocked; see release gates |
| 10 | Disposable SQLite backend and artificial users: real Next16.4 login, Vite handoff, requested workspace/pharmacy return URL, HTTP-only refresh cookie, Interested and counteroffer profile fields pass. Live Next public board additionally tested with controlled ranked/filter responses. | Web complete; mobile checkout/device E2E remains open |
| 11 | Latest main and PR160 history integrated without conflicts. URL/auth/permission/Celery identity, OpenAPI/model/migration schema and 3,136 API replay cases match the preceding baseline. Final combined frozen-source browser/backend gate follows the local commit. | Integration complete; exact gate result must be checked |
| 12 | Reviewed code/tests/report committed locally after checking staged paths. Generated users, databases, launchers, raw reports, native projects and dependency copies stay ignored. No new push, merge to main or deployment. | Local closeout; release approval withheld |

## Contract evidence and its limits

The backend matrix passed all 22 commands: 1,100 test invocations, including intentional overlap between suites, with 49 existing skips. This is one additional candidate contract test compared with the preceding 1,099-invocation baseline. The additional PostgreSQL run passed 52 roster/publication and candidate-profile tests. A dedicated 29-test shift-actions run also passed. No live database migration was applied.

Snapshot equality includes URL methods, view identities, authentication/permission classes, Celery task/routing identities, model fields, migration graph and OpenAPI. Replay covered 295 routes / 3,136 persona-method cases and produced identical results. This generic replay does not exercise every revealed-profile field; the dedicated serializer test and seeded browser acceptance cover the deliberate PLATFORM counteroffer response change. Rich work-profile fields are now returned after authorized reveal, without pre-booking email/phone/CV; non-PLATFORM and assigned-profile behavior is retained.

Core passed 141 tests. The single tarball SHA256 is `7c28491f51eb78997d62446988164cc6eeb7b932398b15ed546612d16e4c3f07`. All 147 packaged files match the installed packages in Vite, Next and mobile byte for byte, and none is a symlink. Next types, production build and 14 public/API-root contracts passed. Web auth/WebSocket/appearance-comparator unit contracts passed 14 tests; both web UI audits, native route and frontend static wiring audits passed. Mobile clean types/lint passed; Android prebuild and both Hermes production exports passed.

All 24 Windows appearance comparisons passed against unchanged approved images. This covers the maintained light/dark desktop/mobile views, not every app screen or native device. Mobile dashboard content was changed to reflect accepted backend semantics using existing styles; its native appearance has not been compared on a device.

The talent shift form is now a dynamic import, deferring the approximately 220 kB form chunk until needed. The overall app chunk remains essentially unchanged: baseline 967.33 kB / 261.64 kB gzip, reviewed build 967.39 kB / 261.67 kB gzip. This is not evidence that all large chunks are solved. Public/private boards retain separate authentication, data-loading and ordering adapters; identical shift-filter presentation is already shared. Their semantic differences must not be erased by consolidating similarly named files.

## Dependency/security comparison

| Runtime audit | Before | After | Interpretation |
| --- | --- | --- | --- |
| Vite | 1 moderate | 0 | Compatible lock update, including Moment2.31 |
| Next | 1 critical, 2 high, 1 moderate | 0 | Next16.4/Moment2.31 and compatible Sharp/libvips updates; clean build/contracts passed |
| Mobile | 1 critical, 29 high, 5 moderate | 28 high, 5 moderate | Shell-quote critical issue removed; no forced framework upgrade/downgrade |
| Fresh resolved backend | requirements unchanged | 0 advisory findings; pip check passed | Python3.12 / Django5.2 runtime verified; release-evidence collector ran |

Remaining mobile advisory families include grpc-js, braces, image-size, node-forge and sprintf-js, plus dependency chains affected by them. Audit fix suggestions include incompatible parent/framework changes. A compatible image-size lock-only update was attempted, made no change, and did not remove its findings. Do not treat `fixAvailable` as proof of compatibility. No advisory was suppressed or accepted silently. Tracked credential patterns/filenames and 5,069 historical text blobs passed repository hygiene checks.

## Open release gates: ordered plan

1. **Resolve mobile dependencies.** Review the 33 runtime findings against actual packaged/runtime use; select supported Expo/React Native/Firebase dependencies and verify the changed dependency paths. Install in isolation, rerun types/lint/export/prebuild, then device suites. Do not use `npm audit fix --force` as a release decision.
2. **Run native binary/device acceptance on suitable hosts.** Windows kiosk needs a complete native Perl/OpenSSL build environment. Git's bundled Perl is present but lacks `Locale::Maketext::Simple`, so its retry did not produce an EXE. This Windows host has no Android SDK/JDK/adb; use the Android CI emulator/Maestro job. iOS requires the macOS/Xcode simulator job. Include the mobile checkout fallback, reload/reveal failures and both dashboard statuses/recommendations on devices. JavaScript export/prebuild is not a substitute for these gates.
3. **Publish only through PR160 when requested, then rerun hosted CI on that exact local commit.** Earlier hosted results cover an earlier SHA. Include Windows appearance/live Next, all backend/core/mobile matrices, kiosk/native platform jobs, runtime audit and CodeQL. Recheck remote main/PR immediately before integration and explain any new differences. Never push origin/main directly. Staging is explicitly excluded for now; production is not authorized.
4. **Continue bounded maintainability/appearance work.** RosterOwnerPage still has substantial orchestration; RosterGridViews, HorizontalCalendarGrid, RosterPlanningToolbar and RosterWorkerPage remain large. Extract one cohesive responsibility at a time with roster interactions and light/dark evidence. Remaining global important selectors and larger app/library chunks need their own visual/performance evidence. Keep public/authenticated talent flows distinct; consolidate adapters only where contracts and behavior match.

## Local evidence

Raw logs/reports live in ignored `playground/followup-release/`: `backend-all-ci.log`, `postgres-final.log`, `contracts-baseline.log`, `contracts-current.log`, `contract-comparison.json`, `core-tests-final.log`, `next-build-final.log`, `next-types-final.log`, `next-contracts-final.log`, `mobile-final-types.log`, `mobile-final-lint.log`, `mobile-native-export.log`, `mobile-prebuild.log`, `seeded-e2e.log`, `static-wiring-final.log`, `web-contracts-final.log`, `audit-*-baseline.json`, `audit-*-final.json`, `runtime-run.log`, `advisories.json`, `runtime-releases.log`, `secret_check_*.log`, `kiosk-build*.log`. Final exact-source reruns use `web-final-exact.log`, `backend-final-exact.log` and a source-identity manifest. These must show passing available gates before the local result is called verified.

The seeded backend was disposable; the screenshots' original Hassan account was not queried or modified. No credentials or generated artifacts are part of the commit. Source fixes are reviewable; unresolved mobile security/native gates mean this is not a blanket merge approval.
