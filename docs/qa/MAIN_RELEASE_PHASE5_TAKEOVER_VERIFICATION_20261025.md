# PR #200 Phase 5 — independent takeover and GitHub evidence reconciliation (25 October 2026)

**AUDIT ONLY. PHASE 5 OPEN. PHASE 6 RELEASE ACCEPTANCE NOT STARTED. PRODUCTION NO-GO.**

## Source of truth and limits

- Repo: `chemisttasker11-ezy/ChemistTasker-Ezy1`; draft PR [#200](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/200), branch `audit/main-release-blockers-coverage-tracker-20261024`.
- Frozen main application baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Exact PR branch head independently inspected before takeover: `2fe2ce27b90c2de181041c5a6073bcc56e27ff5c`.
- Independently compared live PR metadata, 333 changed filenames, frozen-main commit comparison, handover, tracker, source-path inventory claims, findings register, actual GitHub Actions jobs/logs, and the password reset/refresh source path.
- This continuation makes **documentation/verification-register changes only**. No app source, migrations, deployments, staging, fixes, merge or separate remediation PR #201 changed. PR #201 is another draft based on the same frozen main.

## Handover assertions versus GitHub evidence

| Handover/report claim | Checked against actual state | Correct conclusion |
|---|---|---|
| All 89 source chunks and 2,151 ledger paths represented | Source manifest and living audit records; PR includes two audit-only scripts outside frozen-main source denominator | **S0 source inventory accounted for**, not 99% independent semantic verification. Frozen production-source denominator is 2,149. Earlier 1,828 first-pass S1 verdicts are agent-reported and later 323 are fetch/annotation marked semantic pending. |
| 14 of 14 F12 bounded actions | F12 worklog/out_F12 evidence | Source-side comparisons only. Authenticated Vite/Next/Expo parity and device/browser evidence are still missing. |
| 226 total raw candidates | Canonical register includes 71 B and 155 C/F entries; duplicated roots and a source refutation are retained | **226 historical raw IDs is not 226 distinct confirmed defects.** Conditional and aliased cases must not be counted as independent production blockers. |
| Latest handover 40 tests / 29 red / 11 pass / 26 distinct IDs | [Exact-head PR200 test run 40179425592](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40179425592), job `121127079571` | **41 tests; 30 failing negative assertions; 11 passing controls; zero test fixture errors; 27 distinct runtime-reproduced IDs**, including B43. A red test suite is deliberately failing on vulnerable frozen main; it is not a green release gate. |
| `PHASE5_CANONICAL_FINDING_STATUS_20261025.json` 37 tests / 26 red / 11 pass / 23 IDs | Compared to VERIFIED.json (26 IDs pre-takeover) and hosted 41-test log | The canonical file lagged the latest 40-test agent evidence and the new B43 result. Reconciled here to 41 / 30 / 11 / 27, with four original entries upgraded: B43, B66, C071-N2 and C012-N1. |
| No application fixes on PR200 | The PR has docs/qa evidence, `backend/qa_release` tests and two PR audit workflows | Confirmed **audit-only** relative to frozen main. |
| All release gates passed | [Exact-head workflow results](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions?query=branch%3Aaudit%2Fmain-release-blockers-coverage-tracker-20261024) | False. PR200 negative contracts intentionally FAIL; Shared Core Consolidation FAILS its mobile dependency-security audit; Full Isolated QA and iOS Native Repair Acceptance were SKIPPED. CodeQL, Public Repository Security, Backend Finalization Contracts, Serializer Decomposition Contracts and E2E Runner Smoke passed on the inspected head. These do not constitute end-to-end acceptance. |

## Newly independently challenged B43 — old refresh works after password reset

- Frozen-main source: [password-reset-confirm handler](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/api_passwords.py#L20-L56) validates token, sets new password and saves the user, but does not revoke outstanding SimpleJWT refresh tokens.
- [Refresh view](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/api_auth.py#L115-L152) accepts the old refresh; [serializer](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/serializers.py#L515-L544) validates/rotates without a password-reset session-version gate.
- [Exact test](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/2fe2ce27b90c2de181041c5a6073bcc56e27ff5c/backend/qa_release/test_pr200_phase5_sessions.py#L76-L104) proves reset returned 200 **and** password changed, then old pre-reset refresh returned **HTTP 200**; the expected 401/403 assertion failed.
- Source and actual job log independently challenged. **P0 security-release candidate, reproduced at isolated HTTP/SQLite boundary**. Not proof of compromise or production exploit. Test remaining access-token expiry/session-epoch semantics and intended revocation policy before asserting fix acceptance.
- Positive controls in the full suite passed; no fixture or migration errors in the latest run.

## Outstanding blockers for Phase 5 closure

1. Source-findings dedup and independent security/finance policy adjudication for unverified P0/P1 candidates. Preserve `C016-N2` source-refuted and `C004-N1` runtime-conditional, plus canonical root aliases; do not count 226 raw IDs as 226 confirmed defects.
2. Additional valid negative **and** positive tests: cross-tenant role matrix; unauthorised shift and payment state transitions; Stripe webhook idempotency/refund/double-subscription; PostgreSQL concurrent booking/leave/invoice; kiosk pairing/offline replay; reset/logout/push privacy; client cross-platform parity. The 41-test batch is SQLite with synthetic Stripe, not live charge/concurrency proof.
3. Confirm all historical S1 chunk outputs with independent cross-call-path S2 evidence; ledger coverage does not meet the promised 99% independent semantic standard.
4. Explicitly identify actual fix-ready root causes, severities and test acceptance cases before updating separate remediation PR #201. Do **not** make fixes in PR200.
5. Resolve mobile advisory `GHSA-w74x-v6f9-j3xg` / `fast-uri` in implementation scope; the [exact-head shared-core run](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40179425597) failed dependency security while other named jobs passed. The PR201 remediation work is separate and was not validated by this audit.
6. `.github/workflows/pr200_readonly_static_audit.yml` still grants `contents: write` and performs a push from `workflow_dispatch`. Remove or reduce it to read-only before any audit work is merged; avoid modifying the workflow while merely reconciling findings.

**Takeover checkpoint:** 41 run / 30 RED / 11 PASS / 27 runtime-distinct IDs; S0 2,149/2,149; S1 ledger 2,151 including audit scripts; independent S2 99% **NOT CERTIFIED**; F12 native parity **NOT COMPLETE**; Phase 5 **OPEN**; Phase 6 **ON HOLD**. Keep PR200 DRAFT, no production deployment.
