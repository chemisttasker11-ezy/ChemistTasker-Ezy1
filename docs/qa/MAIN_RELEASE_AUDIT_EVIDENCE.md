# Main release audit — evidence and handover

**Baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`
**Review branch:** `audit/main-release-blockers-coverage-tracker-20261024`
**Decision:** NOT RELEASE-READY; this documentation-only branch is not a fix.
**Last verified date:** 2026-10-24 Australia/Brisbane.

## Verified audit provenance
- Remote `main` matched the baseline SHA at branch creation.
- Exact Git tree inventory: 2,969 tracked files; 2,149 applicable code-source paths, using the documented extension rule. This is an *inventory* count, not inspection coverage.
- Findings B01–B23 were recorded as **SOURCE-FINDING**, not exploited, fixed or passed.
- Audited baseline's Full Isolated QA: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40019714397 (PASS on main baseline, not this audit branch).
- Audited baseline's Staging QA: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40019714320 (FAIL on main baseline).
- No tests, Docker suites, migrations, browser acceptance or physical-device acceptance have been executed against the current audit branch; all remain **PENDING**.
- Handbook read: `docs/qa/SENIOR_PACKAGE_TESTING.md`; its longer archived Library runbook is referenced but was not independently retrievable in this retry. It should be obtained before claiming complete senior-package verification.

## Actual worklog

| Item | Status | Proof |
|---|---|---|
| Branch created directly from frozen main | DONE | GitHub branch `audit/main-release-blockers-coverage-tracker-20261024` |
| All 23 findings documented | DONE — tracker only | `docs/qa/MAIN_RELEASE_AUDIT_TRACKER.md` |
| Prioritised correction sequence and strict 99% definition | DONE — plan only | `docs/qa/MAIN_RELEASE_99_PERCENT_PLAN.md` |
| Evidence log and explicit zero-baseline | DONE — evidence metadata only | This file |
| Fixes implemented | 0/23 | No implementation commits |
| Fixes fully tested on PR head | 0/23 | No PR-head gate evidence |
| Individually certified source paths | 0/2149 | No completed per-file evidence ledger |
| Mandatory release gates | PENDING | See senior package handbook |

## Future evidence requirements (one row per action, never infer)
Record time, exact SHA, domain/file set, source-blob SHA or diff, test command, platform/container and isolated database identity, result with counts, CI run/job URL, negative security case, visual artifacts, and reviewer verdict. A code edit without reproduction and retest is **implemented only**, not VERIFIED.

## Release gates
1. Role-boundary tests on two organisations / two pharmacies / all personas.
2. Stripe and Pills obligation-based settlement, retries, simultaneous requests, payment-expiry and cancellation webhooks.
3. PostgreSQL concurrency, migrations, fresh-install and populated-upgrade tests on disposable data.
4. Vite, Next, Expo shared-core contract/build and browser authenticated journeys; kiosk Windows independent.
5. Windows 390/1440 light/dark visual baselines and fixed geometry.
6. Android/iOS simulator and actual device release checks, signed release binaries and correctly configured keys.
7. Staging deployment/migration with permission, backups, smoke proof and normal production gate.
8. Owner signoff and exact-head all-required-checks green.

## Scope boundaries
Keep future remediation in owning modules, maintain existing user/business logic unless a proven defect requires change, do not reopen PR #198, and do not pull unmerged PR #182 into this branch. Optional improvements and unproven edge cases are follow-ups, not blockers.
