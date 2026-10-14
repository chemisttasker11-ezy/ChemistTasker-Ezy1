# PR 171 follow-up — live progress handover

Parent PR: #171 (remains open). Base: feat/light-verification-new-to-pharmacy. Branch: review/pr171-hardening-e2e.

## Objective
Correct integration defects without replacing the PR165/166 skills registry or shifting business logic into platform-specific UI. No merge or deployment without final acceptance.

## Status
- [x] Review PR171 source and prior handover; identify API and cross-platform gaps.
- [x] Create isolated follow-up branch from PR171 head.
- [x] History list contact redaction and HTTP regression test added (pending execution).
- [x] Shared-core booked-shift rate presenter, Vite/Expo wiring, unit tests added (execution pending).
- [ ] AHPRA registration legacy projection and membership/assignment policy tests.
- [x] Overseas skip visibility gated by subtype in Vite/Next/Expo; auth contract updated (execution pending).
- [ ] Diagnose shared-core boundary audit and remove any duplication.
- [ ] Run full Django SQLite/PostgreSQL, API replay, migration rehearsal, web/Expo gates and browser/device E2E.
- [ ] Record exact commands, results, screenshots, and unresolved risks.

## Evidence and safety
Original head: a51f49f022e8d3ab3701669d2a3a26ac3b16ed44. PR171 handover acknowledges full final regression and migration rehearsal remain outstanding. Earlier source-level audit identified History serializer email disclosure, worker booked-shift pay redaction gaps, and intern AHPRA compatibility inconsistency. A static contract audit is not a runtime E2E test.

## Required boundaries
Django owns authorisation and verification; shared-core owns canonical skills and cross-platform presentation decisions; Vite/Next/Expo only render and navigate. Do not rewrite canonical skill codes, membership/payroll policy or shift lifecycle without explicit contract tests. PR171 stays open; this PR stays draft until acceptance.

## Session 1 change log
- Created draft #172 targeting the PR171 feature branch, leaving #171 open.
- Requested failed-job reruns for PR171 CI workflows.
- Changed `backend/shifts/serialization/shifts.py` to omit assigned-user email from History list projection, preserving Confirmed email.
- Added `test_history_list_does_not_disclose_assigned_worker_email` to the existing shift listing contract suite. **Not yet executed**; needs PostgreSQL/SQLite HTTP validation.
- Next: inspect CI results and address rate redaction, verification and membership contracts. Do not infer E2E success from source changes.

## Session 2 changes
- Added `bookedShiftRateLabel` in shared-core, exported from both public and shifts domain facades. Vite and Expo cards now use it. Added Vitest cases for redaction, missing fixed rate, visible rate and award bonus.
- Corrected intern legacy AHPRA projection to use the checked registration field rather than the document flag.
- Added `newcomer_type` to login/refresh user payload and shared-core account contract, with a safe query helper. Overseas skip controls now require `EXPLORER + OVERSEAS` on Vite/Next/Expo; backend remains authoritative.
- Pending: check other current-user endpoints for subtype parity, membership policy, boundary audit, runtime E2E, PostgreSQL migration rehearsal, CI.

## Session 3 CI and environment
- Attempted public HTTPS Git clone in the execution container; network DNS cannot resolve github.com. This blocks local Django/PostgreSQL and Playwright execution in this runtime. GitHub connector remains available for code changes and hosted CI.
- Hosted CI on earlier head 12183e4: Frontend Static and Mobile Lint **passed**, Public Repository Security **passed**; backend, serializer, shared-core and E2E workflows were still running at observation. New commits require their own fresh gate results.
- Do not claim a full E2E run or migration rehearsal until hosted workflows provide specific execution evidence. No merge.

## Session 4 hosted CI diagnostics and corrections
- Head 88f496d: backend finalization PASS; serializer contracts PASS; E2E runner smoke PASS; frontend static/mobile lint PASS; public security PASS. Shared-core consolidation failed at Vite, Next and Expo TypeScript; each error was the missing `newcomer_type` property in its platform AuthContext User type. Corrected all three user contracts.
- Frontend E2E: 130 passed, 6 failed, 27 skipped. Six failures in `frontend-candidates.spec.mjs` use legacy `verified` / `gov_id_verified` fixture fields but the PR171 candidate UI now consumes canonical `verification`. Updated fixture profiles to include `verification: {identity:'verified',profile:'verified'}`. This is a test fixture correction, not weakening production checks.
- Other failure: Vite appearance job; investigate separately, do not claim visual parity.
- Fresh hosted CI required for the latest commit; no final acceptance yet.

## Acceptance principle — PR165/166 are design history, not immutable contracts
Review earlier PR handover reasoning and accepted decisions before changing behavior. Preserve canonical identity and security boundaries, but permit intentional improvements to eligibility, verification and UI where the newer requirement explicitly supersedes earlier behavior. Record the prior rule, new decision, affected callers and tests. Avoid blindly freezing or restoring older behavior.

## Latest CI (1097419)
Backend finalization, serializer contracts, frontend static/mobile lint, E2E smoke, and public security passed. Frontend E2E still failed (vite-playwright and shift-filter appearance). Shared-core consolidation was in progress at observation. Remaining failures require exact failure analysis; do not refresh screenshots without visual comparison.

## Session 5 — exact follow-up on candidate and appearance tests
- Diagnosed six Playwright failures: the UI now uses the canonical `VerificationSummary` object (`verified`, `badges` etc.) and `Verified profile` / `Photo ID` labels. Initial fixture change had mistakenly supplied `identity/profile` keys, which the canonical normalizer ignores. Replaced them with actual summary shape and aligned text assertions to the current badge labels. Re-run required.
- Appearance job failures are real relative to the approved 3df951b baselines: shift filters move desktop date inputs down exactly 90px (832.14 -> 922.14), and 390px screenshots differ by ~5-6%. Do NOT waive or auto-approve; needs intended-layout decision against PR165/166 handovers and visual diff. Other 20 screenshots passed.
- Latest shared-core consolidation jobs (1097419) have passed shared-core, architecture, boundary, Vite, Next, Expo; PostgreSQL concurrency and release gate were pending when observed.
- PR171 handover explicitly leaves migration 0080 staging snapshot, real-device Expo, admin UI, referee email E2E and membership-role UI as outstanding. Keep those visible rather than falsely claiming complete acceptance.

## Session 6 — security and candidate regression follow-up
- Hosted CI at 9eb22cd: all workflows except frontend E2E passed. Playwright failures moved from verification label to obsolete `TEST_SKILL` fixture values: PR166 canonical registry excludes those fake codes. Replaced them with `PRESCRIPTION_DISPENSING` so the test checks a genuine claimed skill, without reintroducing unregistered skills.
- Security review found `verification.policy.evaluate` grandfathered an already-verified profile when base email/mobile/AHPRA evidence was missing, despite those being trust requirements. Changed to revoke stale verification on missing base evidence; grace remains only for optional tightened extras. Updated tests and policy documentation. This is an intentional security improvement over the older admin-preservation decision; run full backend regression and inspect admin correction workflows before accepting.
- Shift-filter visual baselines remain an open, real difference; not waived.

## Session 7 — original handover policy reconciliation
- Re-read PR171 handover D decisions and verification.policy. Earlier follow-up changed `evaluate` to auto-demote existing verified profiles whenever base evidence was missing. This conflicts with PR171 owner-approved D behavior: ordinary saves must not demote; explicit evidence changes revoke, and optional tightening has grace. Reverted the unapproved auto-demotion and restored its test. This is a policy correction, not a security bypass: separately audit assignment eligibility for registered roles.
- New candidate Playwright fixtures now use real registry skill `PRESCRIPTION_DISPENSING`, not `TEST_SKILL`; awaiting new hosted execution.
- GitHub Actions is the available execution environment; local container still cannot resolve github.com. Do not mark migration staging snapshot, real device, or visual signoff as done.

## Session 8 — independent hosted CI verification and candidate test correction
- Inspected final pre-correction head `b49cf836` in GitHub Actions run `38516851394`. Vite Playwright: **130 passed, 6 failed, 27 skipped**; all six failures asserted internal skill code `PRESCRIPTION_DISPENSING` as rendered text, while `frontend_web/shared/WorkerSkills.tsx` intentionally renders the registry label `Prescription dispensing`. Updated both repeated assertions (six test instances) to the exact displayed label. Code commit: `de34b02`. Full fresh-commit Playwright outcome remains unverified until workflows conclude.
- Appearance suite in the same run: **20 passed, 4 failed**, all in Shift filters on 390/1440 light/dark. Desktop input y = 922.140625 instead of approved 832.140625 (+90px); 390px screenshot mismatch 5-6%. Treat as unresolved product visual regression, not a timeout, Windows locale discrepancy, or permission to refresh baselines. Examine artifact `vite-appearance-artifacts` from run `38516851394` and the actual shift-filter layout before changing CSS.
- Confirmed last pre-correction head passed backend-finalization SQLite/PostgreSQL, serializer decomposition, security, static/mobile lint, and shared-core architecture/boundary/Vite/Next/Expo/PostgreSQL-concurrency checks. Authenticated browser and main backend workflow were still running at initial check. This is **not** the full migration 0080 staging-snapshot rehearsal.
- PR171 (the base) remains unmerged; PR172 remains a draft. Owner policy preserved: verified status is revoked for qualifying evidence changes, not ordinary saves. The unvalidated upgrade/staging migration and physical device acceptance remain release blockers.

## Session 9 — container, screenshots, mobile regression and expanded CI
- Tried the available container runtime directly: `git` installed but GitHub DNS lookup fails; repository is not mounted and Django is not preinstalled. No execution should be claimed in that container.
- Retrieved `vite-appearance-artifacts` ZIP from hosted run `38516851394` and visually compared expected/actual images. The new Shift Centre header/tabs account for the desktop layout displacement. The mobile current screenshot also showed crowded five-choice nested tabs rather than a stable readable row.
- Fixed the nested public shift list only: `SegmentTabs.mobileWrap` opt-in allows multiple mobile rows instead of five squeezed labels. Kept the four global tabs and every route/handler unchanged. Added a 390px Playwright contract checking five tabs, no clipped content and no overlapping tab boxes; awaiting fresh CI results. Screenshot baselines have NOT been silently updated or waived.
- Added `.github/workflows/pr172_full_qa.yml`, running the existing isolated staging-style QA script on this PR with PostgreSQL, including shared core, Vite, Next, Expo type/lint, Django and Rust. This is a synthetic CI dataset, not a recoverable staging snapshot or real-device acceptance.
- All new commits require a completed exact-head acceptance cycle. Existing Windows shift-filter visual snapshots remain expected to fail against the intentionally changed header until reviewed and updated with explicit baseline evidence. Migration 0080 staging snapshot and real Android/iOS flows remain separate required gates.

## Session 10 — fixing PR172 failed checks (2026-10-14)
- Last completed head `53400f38`: main Linux Playwright **136 passed, 27 skipped, 0 failed**; Vite-to-Next and wiring jobs passed. Windows appearance **20 passed, 4 failed**, all Shift filters: two 390px test assertions showed tab `scrollWidth=56` vs `clientWidth=55` and two desktop tests compared an old date field y=832.140625 with new y=922.140625.
- Updated `SegmentTabs.mobileWrap` to style both `.MuiTabs-list` (current MUI) and `.MuiTabs-flexContainer` (legacy), with responsive per-tab flex basis; no change to routing, roles or business handlers. A 390px DOM no-overlap/no-clipping assertion is retained.
- Full isolated QA failed at `docker build -t ... backend` because `backend/Dockerfile` uses `COPY shared-core/skills_registry.json` and `COPY backend/...`, which require the repository root as the build context. Fixed it to `docker build -f backend/Dockerfile -t "$backend_image" .`. Previous JavaScript QA ran 209 shared-core tests successfully.
- Added a **separate** Windows `appearance-baseline-candidate` job and opt-in `CT_CAPTURE_SHIFT_BASELINE` to capture proposed Shift Centre baselines without overwriting or relaxing the original visual gate. Review newly captured images, then commit only approved screenshot files and fixed date geometry. Until then, the old Shift Centre golden intentionally fails due to the accepted layout redesign. Do not report 100% acceptance.
- No staging/production access, migration 0080 execution, native-device validation, or merges occurred in this session. PR173 was not modified. Final CI rerun underway on `fbc1b4f` after these changes.


## Session 11 — independent review corrections (2026-10-14)
- Reused the canonical `users.serializers._newcomer_type` in `_build_authenticated_user_payload`, so the authenticated `/api/v1/users/me/` restore contains the same newcomer subtype as login/refresh. Added HTTP tests for overseas, junior, and non-explorer session payloads.
- History assigned-worker list now obeys the existing `assigned_profile_contact` policy flag, avoiding class-name tests; existing Confirmed and History HTTP regression tests remain.
- Enabled opt-in phone wrapping for the Community five-tab shift list to match Public. Added a cross-page 390px no-overlap/no-clipping Playwright contract; golden appearance snapshots are deliberately unchanged.
- Centralised the overseas mobile-skip presentation condition in shared-core, consumed by Vite/Next/Expo, with role/subtype unit tests. Backend skip authorisation remains authoritative.
- Introduced a shared visible-bonus predicate consumed by the booked-rate label and pill tone in both web and Expo. Hidden rates cannot indirectly advertise the bonus colour.
- Replaced the PR-number-specific isolated QA workflow with a general pull-request and main-push workflow using the same existing QA script and PostgreSQL service. No CI checks are represented as passed until the exact new commit finishes.
- PR171 remains open and PR172 draft; no merge, deployment, live data change, legacy skills migration, or unapproved snapshot regeneration.


## Session 12 — regression-suite discovery and safe shared API retention
- The isolated QA script originally only selected `users.tests` and several other named modules; this does **not** run the new `users.test_current_user_newcomer_contract`. Added explicit execution of that HTTP test plus `shifts.test_shift_listing_contract.AssignedProfileTests` in the existing Docker backend test phase, under `core.contract_test_settings`.
- Checked the exact PR172 head rather than GitHub's default-branch code-search results: on PR172, mobile and web candidate-profile components use `WorkerSkillRows` instead of `groupWorkProfileSkills`. Removed the now-dead helper, its unused registry imports and its obsolete test assertion, while retaining active canonical-skill coverage in other modules. The earlier main-branch references do not represent this feature branch.
- These checks require a fresh head CI run. The exact source commit and final results must be verified, not inferred.
