# ChemistTasker-Ezy — Phase 5 Completion Handover and Senior Package Testing Plan

**Date:** 25 October 2026 (Australia/Brisbane)  
**Priority:** Complete Phase 5 semantic production-readiness audit. Do **not** start Phase 6 while Phase 5 is open.  
**Repository:** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1  
**Audit PR:** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/200 — OPEN / DRAFT  
**Audit branch:** audit/main-release-blockers-coverage-tracker-20261024  
**Last tested PR head before this handover:** 10c92441453ab36af1b86a00c275a9af07c2431d — REFRESH HEAD before every new tranche.  
**Frozen application main:** b77e9fd296bc2710350ef6f3cd402ce2529ffc06 — independently rechecked as live main on this date.  
**Separate remediation PR:** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/201 — head 021d801d71b38279be08ca7f11b0137c9c7c786c, OPEN / DRAFT. DO NOT CHANGE THIS PR IN PHASE 5.  
**Release verdict:** NO-GO. No merge, deployment, application fix, migration or production access is authorised by this handover.

## A. Read-first references and precedence

The permanent **Senior Package Testing** handbook is in the user's Library as /ChemistTasker/Senior-package-testing-handbook.md (version 1.0, 14 October 2026) and a concise repository copy exists at docs/qa/SENIOR_PACKAGE_TESTING.md. Follow its current-head, job-by-job, Docker root-context, isolation, visual and platform-evidence rules. Also read the repository's latest decisions and architecture policies before deciding whether an apparently permissive workflow is a defect.

Read all of these **on the current PR head** in this order, before changing a test:

1. docs/qa/MAIN_RELEASE_AUDIT_TRACKER.md
2. docs/qa/MAIN_RELEASE_AUDIT_EVIDENCE.md
3. docs/qa/MAIN_RELEASE_FINISH_HANDOVER.md
4. docs/qa/MAIN_RELEASE_99_PERCENT_PLAN.md and docs/qa/MAIN_RELEASE_DEEP_REVIEW_PROGRESS.md
5. docs/qa/MAIN_RELEASE_FINISH_FINDINGS.md and docs/qa/MAIN_RELEASE_TARGETED_SEMANTIC_REVIEW_20261025.md
6. docs/qa/MAIN_RELEASE_F12_PARITY_WORKLOG_20261025.md
7. docs/qa/evidence/pr200_finish/VERIFIED.json
8. docs/qa/evidence/pr200_finish/PHASE5_CANONICAL_FINDING_STATUS_20261025.json
9. docs/qa/evidence/pr200_finish/SOURCE_CHALLENGE_20261025.json
10. docs/qa/evidence/pr200_finish/DEDUPLICATION_20261025.json
11. docs/qa/evidence/pr200_finish/raw_findings.json, out_F12.json, merge.mjs and relevant out_Cxxx.json
12. docs/qa/evidence/MAIN_RELEASE_FINISH_LEDGER.csv, chunks.json, files_Cxxx.txt, F01-F12 flow definitions, B01-B71 discovery waves and current PR #200 description.

**Precedence:** current immutable source + actual exact-head CI logs > canonical evidence registers > older handovers, plans, PR description, or agent assertions. An agent-reported reviewed file is not an independently certified S2 file.

## B. Verified checkpoint, accounting, and discrepancies

| Metric | Checked status | Meaning |
| --- | --- | --- |
| S0 source inventory | 2,149 / 2,149 (100%) | Frozen-main source files statically accounted for, **not** semantic review |
| Working ledger | 2,151 paths | Includes 2 audit-only Python scripts; do not include these in the frozen-main percentage |
| Source chunks | 89 represented | Representation / initial findings do **not** establish full independent semantic inspection |
| F12 bounded Vite/Next/Expo actions | 14 / 14 source comparisons | Zero full cross-platform runtime acceptance; do not mark parity verified |
| Original historical finding IDs | 226 | 71 B IDs + 155 C/F IDs; preserve **all** IDs and links, including aliases and refutations |
| Current canonical S3 | **41 distinct IDs / 45 accumulated failing safety assertions** | Recorded in VERIFIED.json and PHASE5_CANONICAL...; aggregated over multiple isolated Django/SQLite runs, NOT one test run or passing release suite |
| New B10 observation | **1 additional valid targeted failing negative assertion, not yet in canonical files** | Exact-head run 40188055560; two separately requested Pill debits returned the same ledger PK. After careful evidence reconciliation, expect 42 distinct IDs / 46 accumulated red assertions, subject to file consistency checks |
| B24 | **NOT VERIFIED — INVALID TEST SETUP/ERROR** | Exact-head run 40188055588: eight previously known red cases and one B24 error due to marketplace seller onboarding pre-save policy when confirming completion; do NOT count the error as proof |
| S2 independent semantic coverage | **NOT CERTIFIED** | Numeric 99% is unsupported; count only qualifying S2 file certificates |
| PR description | Outdated | It still begins with earlier B01–B61/wave-12 material; reconcile with current registers after Phase 5 progress |
| Deployment/release status | NO-GO | Audit tests intentionally fail; Phase 6 held |

Run links checked:
- B10 red isolated test: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40188055560 (1 test, 1 failing negative assertion, no fixture error).
- B24 invalid latest test: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40188055588 (9 tests; 8 existing safety-negative failures, **1 test error**, cannot certify B24).
- B04 empty checkout: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40187836775 (one red HTTP negative: empty obligation returns 200 + mocked Stripe checkout URL).
- Six controls B16/B17/B18/B19/B20/B22: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40187156554 (6 tests, 6 red negative, no errors).
- B21 cross-pharmacy cover service: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40187352244 (7 tests, 7 red negative including 6 repeats, no errors).
- B23 Chief Admin organization PATCH: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40187628658 (8 red, B24 fixture error; B23 policy-qualified).
- Original larger isolated run: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40185020636 (45 tests; 34 intentional negative failures, 11 passing controls).

**Precise severity limitations:** B54 demonstrates *sequential* duplicate paid-slot reservation with mocked billing, NOT a proven PostgreSQL race or actual double Stripe charge. B21 is reproduced via direct service call against forged-but-model-valid linked request; end-to-end API formation and exact persisted deletion consequence still need proof. B23 and B22 require explicit role/organization-sharing policy adjudication despite demonstrated responses. Synthetic provider webhooks do not establish actual provider charges.

## C. Autonomous execution instructions

Do not ask the owner to choose the next domain or to repeatedly say “continue.” Work through the sequence below using the highest-risk unresolved cases, committing small audited batches to **the same PR #200**. Do not block productive source review waiting for CI; queue targeted CI, then inspect exact run/job logs before promoting a candidate. Do not schedule or claim asynchronous work outside an active session. Do not move to Phase 6 until the Phase 5 exit record meets Section J.

Permitted in PR200: **audit-only Django/contract tests, analysis scripts/evidence, CI workflows narrowly scoped to audit tests, and docs**. Forbidden in PR200: product code, user-facing logic, migrations, implementation fixes, deployment secrets/commands, merges or updates to PR201. Do not force-push/rebase away historical evidence. Use expected-head branch-ref updates or ordinary guarded git pushes. Keep all 226 historical IDs.

### Batch 0 — reconcile current evidence first (mandatory)

- Refresh GitHub exact PR200 and PR201 heads, frozen main, changed-file set, and latest Actions. Confirm PR200 still changes only docs/qa, backend/qa_release and dedicated PR200 audit workflows. Recheck skipped/cancelled jobs; never infer pass.
- Independently validate B10 service and focused test: backend/rewards/services.py uses a shift-wide Pill ledger idempotency key and a second debit gets the original entry. Record **source-limited, sequential, non-provider** behavior and link run 40188055560; add B10 to VERIFIED.json, SOURCE_CHALLENGE, canonical status JSON and tracker/evidence. If accepted as distinct, adjust canonical S3 to **42 / 46**. Do not double-count repeated CI reruns.
- Repair B24 *test setup only*: latest test initially mocked the marketplace listing pre-save seller policy on creation but the policy executes again when listing availability is saved upon completion. Use a fully valid verified seller, or hold a narrowly scoped mock across both exchange-action HTTP requests, without mocking the exchange state machine. Run positive controls for an accepted exchange and negative ENQUIRY/TERMS_PROPOSED completion, both buyer/seller confirmations, version increments, terminal state, listing status, alternate propose-terms/cancel/decline and unauthorized party. An error or 500 due to fixture is TEST_INVALID, not S3.
- Inspect and clean any stale aggregate counters in PHASE5_CANONICAL...; do not overwrite prior VERIFIED evidence or lose the preserved C016-N2 refutation and F09-N4 runtime confirmation.
- Update this handover’s checkpoint and PR description only with observed results; source candidate and observed impact must remain separate.

### Batch 1 — finish all remaining P0 / P0-impact dispositions

Priority order, **no fresh re-review of settled findings** unless the source challenge needs an independent counterexample:
1. B24 marketplace exchange illegal state transitions (repair test as above).
2. B29 offline signed kiosk timestamp integrity: use attendance_tests/test_kiosk_offline_protocol.py and attendance/protocol.py; create correctly signed events with clock-anchor drift, monotonic rollback, backward timestamp and >7-day server drift. Positive normal clock-in; negative flagged evidence retained but zero live AttendanceEvent/AttendanceSession until review. Distinguish intentional provisional attendance policy from defect.
3. B14 Australian pharmacist casual awards / state public holidays: independently verify current **date-effective** Fair Work rates and 2026 onward holiday tables against authoritative Australian sources; inspect pricing.py, workforce/award_rates.py and all frontend displays. Establish actual wrong wage scenarios and policy; do not infer future rates without authority.
4. B10 Pills multiple-unit ledger and B04 empty checkout: qualify service behavior versus authenticated POST, requested selectors, multi-offer/different-slot outcomes and actual persistent ledger/payment states.
5. Revisit the three existing runtime P0 F03-N1, F04-N1, F04-N2 for correct root/fix-ready acceptance tests and impact — **do not duplicate historical IDs**.
6. The P0-impact issues B21, B23, B54 and other confirmed billing/tenant faults: determine impact and product-policy conditions; PostgreSQL race and Stripe test-mode proof may remain separate explicitly named acceptance items.

For each P0/P0-impact ID, final state must be one of REPRODUCED (precise boundary), REFUTED, POLICY-CONDITIONAL (specific owner decision or safe default), ROOT-ALIAS, or SOURCE-SUPPORTED with missing executable proof explicit. No P0 left as unexamined candidate.

### Batch 2 — resolve high-risk P1 by complete business call paths

Work through **every** remaining P1/P1-candidate in the 226-ID register, not just the notable examples. Prioritize:

**Finance and subscriptions:** B01/B02/B04/B10/B15/B53/B57/B58/B59/B68/B69/B70, C004-N2, F08-N2/F08-N5 and fee/refund/discount/seat/cancellation/overnight B66 issues. Test bad actor, ordinary positive checkout, idempotent replay, out-of-order events, unknown subscription IDs, state changes before and after DB commit, duplicate payment intents, refund/reversal accounting, accepted-awaiting-payment offer expiry and Stripe handler notification. Mocked provider is isolated S3 only; real Stripe test-mode/provider-side effects separately noted.

**Organization, pharmacy, staff and role separation:** B06/B07/B16–B23/B37/B38/B40/B41/B62/B65, F03-N1/F04-N1/F04-N2 and related C/F auth findings. Use Owner, Org Admin, Chief Admin, Region Admin, Manager, Roster Manager, Communications Manager, ordinary staff, locum, outsider and former member. Verify object scope both on list/retrieve **and on create, PUT, PATCH, delete, nested actions, cross-tenant FK assignment**, membership status and permissions. Confirm intended Chief Admin edit and organization-wide notes/polls policy rather than inventing it.

**Shift lifecycle, attendance, roster, concurrency:** B09/B11/B20/B21/B32/B36/B40/B41/B54/B55/B56/B60, rejected/removed membership, role qualification C020-N1, manual roster, booking, payment-reserved offers, expiry/reopen, escalation, worker cover/swap, multi-slot collision, no-show and correct overnight wage/penalty. Assert DB rows before and after, correct notifications and audit trail, negative competitor outcomes and positive legitimate worker journey.

**Private data, accounts, Hub/chat, kiosk:** B03/B05/B22/B29/B30/B43/B46/B48/B49/B50/B51/B63/B64, C071-N2, F09-N1/F09-N4 and unverified matching roots. Test old JWT refresh after reset, live WebSocket after offboarding, push/device token after logout, confidential mention/poll scope, chat history non-cascade, signed kiosk device revocation and one-time secret delivery.

**Marketplace and product semantics:** B24–B26/B31/B42, C010-N1/C011-N1 and F10-N5. Verify accepted terms, inventory ownership, transaction rollback, double transfer/reservation on PostgreSQL, duplicate enquiries, draft orphaning, ethical-only permissions and client messaging. A source-supported finding whose impact depends on product rules must clearly state which rule and the safe default.

For EACH candidate: independently read endpoint/router → authentication, role/object scopes → serializer input/validated fields → service/transaction/DB/FKs/indexes → webhook/background tasks/notifications → Vite/Next/Expo call sites → relevant existing tests. Produce exact frozen-source permalinks, boundary-specific negative AND positive tests, observed response and persisted effects, alternative explanations, impact/severity, duplication root and reviewer independent challenge. Only keep “P0/P1 blocker” designation when proportional to actual impact.

### Batch 3 — PostgreSQL concurrency and persistence proof

Use **PostgreSQL 16 disposable database**, not SQLite approximations or staging. Prioritize B10 ledger races, B31 ethical reservation, B54 competing paid-slot reservations, B55 cover approvals, B56 attendance correction, B60 leave overlaps, Stripe/webhook idempotency/invoice invariants, and cross-pharmacy FK writes. Coordinate two authenticated requests from **two independent DB connections**, deterministic barriers, transaction locking, unique constraints, final-row counts, loser outcome, notification/audit duplicates and repeat under contention. A serial HTTP two-request result is not a PostgreSQL concurrency proof. Do not access live databases. No migrations created; existing migrations may be applied inside disposable test database.

Read the handbook's Docker requirement: build with **repository root** context:

~~~bash
docker build -f backend/Dockerfile -t chemisttasker-qa-backend:local .
python3 backend/manage.py migrate --noinput --settings=core.postgres_test_settings
python3 backend/manage.py test client_profile.test_postgres_concurrency --settings=core.postgres_test_settings
~~~

Add new narrowly-scoped concurrency tests in backend/qa_release or the matching existing isolated test domain; only run on an isolated CI Postgres service. Keep logs and database identity free of private data.

### Batch 4 — F12 Vite / Next / Expo semantic and executable parity

14/14 existing F12 rows are **source-side comparisons only**. For each flow, capture canonical API route, verb, payload, entitlement/identity, visible and private fields, error paths, concurrency/business effect, screen transition and alert/notification behavior across Vite/Next/Expo. Verify shared-core ownership and no separate drift in Next/Vite/Expo; kiosk remains Windows native, not shared-core. Add focused shared-core contracts, backend HTTP tests and frontend hermetic Playwright/Expo harness tests for security-critical journeys. Run authenticated Vite-to-Next and Expo simulator paths where feasible without launching production/staging, marking unsupported device/browser scenarios pending Phase 6. Cover all personas and tiered shift audiences.

Use the actual handbook commands/workflows for npm install, shared-core typecheck, build and tests, architecture/transport audits, Vite, Next and Expo typecheck/lint, Playwright Chromium and 390/1440 Windows visual checks. **Do not update visual baselines automatically** or hide layout changes; only review the actual screenshots/diffs and commit intentional goldens with explicit approval. A Next typecheck or Expo compile is not a workflow parity test. Run native emulator/simulator flows if a security/functional claim needs them; physical devices and deployment remain Phase 6 unless specifically required to substantiate a Phase 5 claim.

### Batch 5 — independent S2 file-semantic certification to >=99%

The real denominator is **2,149 frozen-main source files**. A defensible 99% requires at least **ceil(0.99 × 2,149) = 2,128 independently qualifying files**, leaving at most 21 files uncertified — and **none** of those may be security-, payment-, tenant-, user-privacy-, shift-, role- or data-critical files. S2 certified count is presently **UNKNOWN / NOT CERTIFIED**, not “2,149 reviewed”.

Build an independent S2 certification ledger for every source file reviewed, containing:
- exact frozen path, blob SHA and full-read proof
- ownership/domain, callers, outbound effects and relevant auth/tenancy/transaction boundaries
- independent second-pass reviewer or separately challenged review and date
- specific existing/new negative and positive test IDs or justified NA evidence
- materially different alternate path checked; refuted/confirmed candidate links
- verdict, open uncertainty and immutable source permalink.

Give every S2 entry either ACCEPTED, NEEDS_MORE_EVIDENCE or NOT_APPLICABLE_WITH_EXPLANATION; generic “OK” based on filename, AST outline or copied agent summary does **not** qualify. Re-run individual spot checks and compare to full original file content, including portions marked NA. Prior agent S1 output (89 chunks and 2,151 path rows) is a work queue, not a certification. Prioritize high-risk domains then systematically fill the remaining denominator with independent workers; verify a representative random sample of their complete-file evidence before accepting a chunk. Regenerate and publish exact counts and percentages; if target cannot be met in the session, publish the real numerator/denominator and precisely enumerate the remaining paths, not a fabricated 99%.

### Batch 6 — finding dispositions, deduplication, evidence regeneration

Preserve all 226 raw IDs and all historical notes, but map them to genuine distinct root causes. Explicit statuses: RUNTIME_REPRODUCED (boundary-limited), SOURCE_SUPPORTED (unexecuted), REFUTED_SOURCE, POLICY_CONDITIONAL, ROOT_ALIAS, UNVERIFIED_CANDIDATE. Evidence grades: S0 static inventory; S1 first pass; S2 independently validated semantic; S3 executable. Keep severity separately from confidence and from whether the defect is already fixed elsewhere.

Ensure C016-N2 stays source-refuted for the reported ordinary PATCH route; F09-N4 null-membership bug stays runtime-reproduced; C012-N1 expired invitation stays runtime-reproduced after fixture correction; B06/B22/C004-N1 policy qualification is not silently erased. Distinguish grouped cases with a shared root while retaining each source ID and behavior. Reference baseline and exact test-head in every S3 row.

Regenerate docs/qa/evidence/pr200_finish/raw_findings.json, derived findings and ledger with **merge.mjs** only after inspecting its inputs/output effects; do not let an old chunk reset newer accepted findings. Update VERIFIED.json, SOURCE_CHALLENGE_20261025.json, DEDUPLICATION_20261025.json, PHASE5_CANONICAL_FINDING_STATUS_20261025.json, living tracker, audit evidence, 99% plan, F12 worklog and actual PR200 description. Commit deterministic evidence and a concise per-run provenance table.

### Batch 7 — focused Senior Package Testing gates, not premature Phase 6

The handbook mandates exact-head and isolated evidence. Run small suites first, continue review without waiting for a broad gate, then inspect actual jobs/logs and artifacts. Examples:

~~~bash
python3 backend/manage.py test qa_release.test_pr200_phase5_p0_authz --settings=core.contract_test_settings --noinput --verbosity=2
python3 backend/manage.py test qa_release.test_pr200_phase5_pills --settings=core.contract_test_settings --noinput --verbosity=2
python3 backend/manage.py test qa_release.test_pr200_phase5_money --settings=core.contract_test_settings --noinput --verbosity=2
python3 backend/manage.py test qa_release.test_pr200_phase5_sessions --settings=core.contract_test_settings --noinput --verbosity=2
node scripts/audit-shared-core-boundary.mjs --strict
node scripts/audit-architecture-boundaries.mjs
~~~

Run these only against an isolated disposable environment, with exact existing CI env/test settings. For the special kiosk unittest suite inspect backend/attendance_tests/test_kiosk_offline_protocol.py and its dedicated attendance_tests.settings/schema bootstrapping; do not pretend it uses the ordinary Django test database runner.

GitHub audit workflows currently include .github/workflows/pr200_release_blocker_audit.yml, pr200_targeted_role_audit.yml, pr200_targeted_p0_authz.yml, pr200_targeted_empty_billing.yml and pr200_targeted_pills.yml. Use focused runs before full QA. A red test asserting unsafe behavior is a **successful discovery**, not a passing regression; zero fixture errors, observed positive control, request reached the intended handler and persisted postcondition where relevant are required. Tests that expect failure on frozen main are supposed to remain red until implementation is fixed elsewhere. **Do not** mark all CI green.

Full broader Senior Package Testing gates for Phase 6: Shared Core Consolidation, Backend Finalization, Serializer Decomposition, Public Repository Security, CodeQL, E2E Runner Smoke, Vite/Next/Expo tests, full isolated Docker QA, exact-head SQLite + PostgreSQL/migrations, authenticated Playwright Vite-to-Next, Windows 390/1440 visual baselines, native Android/iOS emulator/simulator, physical devices, safe staging snapshot recovery and release smoke. Mark pending/skipped as such, not green. PR172 Full Isolated QA is PR-number restricted, so a SKIPPED PR200 job is **not** acceptance. The mobile advisory GHSA-w74x-v6f9-j3xg / fast-uri affected an earlier gate; recheck its status, do not assume it was resolved. A physical device, real Stripe provider and staging acceptance are not proven by synthetic tests and are normally Phase 6.

Security housekeeping: .github/workflows/pr200_readonly_static_audit.yml still grants contents: write and can push on workflow_dispatch. Reduce/remove that unexpected write permission before any audit branch merge, with scope and workflow-history review; no permission to merge is implied.

### Batch 8 — Phase 5 closure report and handoff to Phase 6

Write docs/qa/MAIN_RELEASE_PHASE5_FINAL_VERDICT.md (or equivalent current dated document) with:
- frozen baseline/current PR exact head, full source/gate provenance, confirmation PR201 unaffected
- complete and deduplicated **226-ID disposition matrix**, every P0/P1 resolved to an evidence-backed audit verdict or explicitly unresolved blocker
- exact S0/S1/S2/S3 denominators, accepted S2 file list and coverage calculation
- each critical production workflow's endpoint/auth/service/DB/client proof, negative+positive controls and limitations
- all open fix-ready issues mapped to existing separate remediation PR #201 or future separate implementation work, **without changing PR201**
- policy questions escalated as definite release-blocking defaults when unanswered
- all skipped, invalid, cancelled and unavailable test gates labelled honestly
- explicit Phase 5 COMPLETED or INCOMPLETE, with remaining proof gaps and rationale
- production still NO-GO until separate implementation fixes and Phase 6 exact-head acceptance.

**Phase 5 can be declared COMPLETE despite discovered defects** only if the audit itself is complete: every P0/P1 finding adjudicated, 99% S2 independently certified with no risk-critical omissions, F12 source/action review credible with bounded executable evidence, cross-root finding reconciliation finished, and provenance and PR200 documents committed. Actual production fixes and release acceptance are not requirements to call the audit finished; they remain Phase 6 / separate remediation scope. If any exit condition is unmet, mark **Phase 5 INCOMPLETE** and give actual remaining work — never fake completion to meet the target.

## D. Extra case-specific cautions and evidence limitations

- B10: the service-level red test proves a second shift-wide charge returns the first ledger entry; it does **not** prove a concurrent race, actual Stripe event, or successful real multi-offer payout. Add database postconditions and full HTTP later.
- B24: seller verification error in run 40188055588 arose during listing availability save after acting on exchange; failed fixture must be repaired independently before state-machine verdict. Mock only upstream seller policy if isolating downstream behavior, then supplement with fully validated seller positive controls.
- B04: mock-only Stripe Session.create showed an invalid checkout request is constructed. No real charge is established.
- B23: Chief Admin PATCH returned 200; organisation record ownership policy controls severity. Product role definition currently grants Chief Admin broad organization capabilities; need explicit organization-record edit restriction or legitimate permission conclusion.
- B22: sibling pharmacy poll appeared in organisation feed; organisation-wide poll sharing policy must be checked; pharmacy posts are currently scoped more tightly.
- B21: direct release service failed to reject another pharmacy's linked assignment; prove full creation/approval route, postcondition and any compensating guard.
- B54: **sequential** duplicate payment-required slot reservation is reproduced, PostgreSQL simultaneous requests and real provider double-billing **unproven**.
- Kiosk clock integrity B29 remains source-supported; signed-event negative runtime and provisional-attendance policy unresolved.
- No remaining ambiguity justifies deleting a finding without preserving ID, root alias and evidence of refutation.

## E. Operating contract for the incoming agent

1. **Begin immediately** with Batch 0 and the P0 queue, without asking the user to select the next area.
2. Keep CI jobs running while source work progresses; run **targeted** cases, inspect exact-job logs and artifacts when ready. Do not repeatedly trigger full suites on every audit-document commit.
3. Maintain immutable source links and audit evidence in the **same draft PR200**; no product edits or PR201 changes.
4. Continue through every outstanding P1 and true second-pass S2 review, not another structural inventory.
5. Do not change severity/status merely to make percentages look better. Separate refutation, conditional policy, aliases, source-only and runtime proof.
6. Report concise progress updates without stopping the work to ask permission. Never claim future background execution that has not been scheduled or initiated; complete everything possible within the active session.
7. Finish Phase 5 with a reproducible closure document and actual coverage result, or a precise numbered remaining-gap ledger if infeasible. **DO NOT start Phase 6 before qualifying Phase 5 completion.**


## 25 October 2026 — active Phase 5 continuation: independent checkpoint

**PR200 initial head:** `f0330f32d3839e2b1c2429e7d7344ce054ed8cb8`; **frozen main** remains `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`; **PR201** verified unchanged at `021d801d71b38279be08ca7f11b0137c9c7c786c`. PR200 changed-file listing was 346, exclusively `docs/qa`, `backend/qa_release` and dedicated `.github/workflows/pr200_*` files. No application, migration or deployment changes.

**B10 evidence repaired and reconciled:** run [40188055560](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40188055560), one isolated SQLite service test, first debit and balance positive assertions pass, second same-shift call returns the *same* ledger PK; one intentional red negative assertion; no setup errors. Source `backend/rewards/services.py:352-368` has shift-wide `shift:{id}:pill-payment` idempotency key. `VERIFIED.json` and canonical status updated to **42 distinct reproduced IDs and 46 cumulative negative red assertions**, one addition beyond previous 41/45. **Scope caveat:** not a validated two-slot API/payment scenario, provider debit or PostgreSQL concurrency; product rule for per-shift versus per-slot Pill charging must be confirmed.

**B24 invalid fixture corrected in audit tests only:** `backend/qa_release/test_pr200_phase5_p0_authz.py` now holds the mock seller-policy decision during synthetic listing completion save as well as creation, without mocking exchange action state machine. Added independent synthetic tests for ENQUIRY and TERMS_PROPOSED illegal completion, ACCEPTED legitimate two-party completion and non-party 404. Previous run [40188055588](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40188055588) produced 1 ERROR from `ONBOARDING_INCOMPLETE` during signal pre_save, so **B24 remains TEST_INVALID until corrected GitHub job logs show all fixture paths reached**. Not counted among 42.

**CI:** PR200 audit-only contracts are configured on pull_request head. Following test commit `1d08ac432410b1520f43d419e4cf5d9ccf5a89d2`, targeted jobs appeared in run listings (including [focused P0 audit 40189339360](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40189339360)); queued or running jobs were **NOT counted as passed**. Repeated documentation-only pushes can supersede runs; use latest *completed exact test commit* for B24 before changing its evidence status. Full Isolated QA / iOS jobs are PR-restricted and SKIPPED on this draft PR.

**S2 gate:** 2,149 frozen-main files remain denominator, 2,128 qualifying independent file certificates are required. No defensible S2 numerator has been established. 226 historical IDs are preserved. Phase 5 is **INCOMPLETE**, Phase 6 **NOT STARTED**, release **NO-GO**. Next highest-value action is to inspect corrected B24 targeted logs, repair fixture only if needed, then resume B29/B14 P0 impact verification and the independent S2 certification queue without re-counting generic S1 reports as approved S2.


## 25 October 2026 — targeted CI results after fixture repair (supersedes any earlier pending statements)

**Current executed finding accounting: 45 distinct IDs with targeted negative-test evidence; 53 cumulative expected-red negative assertions over separate runs.** Of these, 44 IDs have isolated Django/SQLite service/API/protocol evidence and B14 is *isolated pure-function/source data only*, not SQLite or observed employee payroll. No combined 53-failure release suite is asserted. 226 original raw IDs remain in the canonical ledger.

- **B24**: [run 40189568324](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40189568324), exact test commit `51db9da375c2555490c07d0a87e752709bca1d57`. Four fixture-valid HTTP tests: **two negative expected-red** (ENQUIRY and unaccepted TERMS_PROPOSED allow completion confirmation), **two positive pass** (proper accepted completion and unrelated user denied). No B24 errors in run. Earlier B24 fixture-invalid runs remain excluded. Documented in `evidence/pr200_finish/VERIFIED.json`.
- **B29**: [run 40189842660](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40189842660), test commit `9c0d0f0e658d24c8c2beb2795a429f9659f4dd08`. Three valid Ed25519 signed events on standalone attendance SQLite: **one healthy positive passed**, **two negative expected-red** (clock-anchor drift and server drift mark NEEDS_REVIEW but still persist linked live attendance events). No fixture errors. Payroll/export consequence unverified.
- **B14**: [run 40189946286](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40189946286), commit `07bcf99553849e0f2734526f33ef4480f1310975`. Five pure-function/static-data contracts: **two positives pass** (updated workforce 2026 pharmacist rate, ordinary 2027 weekday) and **three negative expected-red** (outdated pharmacist and assistant casual shift-guide weekday rates and QLD Australia Day 2027 not classified as public holiday). No fixture errors. Official primary Fair Work 2026 Award source checked; **no evidence of a real wage underpayment**. Treat B14 separately from SQLite reproductions.
- **B10**: [run 40188055560](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40188055560) remains **one service-only red**, first debit and balance positive controls passed; true per-unit charge semantics and concurrency not established.

Phase 5 **INCOMPLETE**, 99% independent S2 **NOT CERTIFIED** (accepted full-file count unknown), F12 authenticated parity open, 226 historical finding roots not all adjudicated, PostgreSQL concurrency open, release **NO-GO**, Phase 6 **NOT STARTED**. These targeted intentionally-red audit workflows should **not** be treated as failures of existing production-code green regression gates. Do not mark any queued, skipped, cancelled or incomplete CI as PASS.

## 25 October 2026 — S2 certificate invariant test added

Audit-only `.github/workflows/pr200_s2_certificate_integrity.yml` validates the 18 second-reader source certificates and `merge.mjs` on Node22, regenerates the ledger in disposable checkout, checks exact baseline SHA, blob SHA, distinct first/second reviewers, contract text, and **18 independently reviewed rows out of 2,149 source files** while preserving 2,151 baseline plus audit rows. It never pushes to GitHub or modifies product code. The status remains partial Phase5; expected-red API tests are separate.
