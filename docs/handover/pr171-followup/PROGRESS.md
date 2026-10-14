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
