# PR 171 follow-up — live progress handover

Parent PR: #171 (remains open). Base: feat/light-verification-new-to-pharmacy. Branch: review/pr171-hardening-e2e.

## Objective
Correct integration defects without replacing the PR165/166 skills registry or shifting business logic into platform-specific UI. No merge or deployment without final acceptance.

## Status
- [x] Review PR171 source and prior handover; identify API and cross-platform gaps.
- [x] Create isolated follow-up branch from PR171 head.
- [x] History list contact redaction and HTTP regression test added (pending execution).
- [ ] Shared-core booked-shift rate presentation; Vite and Expo parity tests.
- [ ] AHPRA registration legacy projection and membership/assignment policy tests.
- [ ] Overseas skip visibility parity on Vite/Next/Expo.
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
