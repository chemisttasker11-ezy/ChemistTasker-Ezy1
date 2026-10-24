# Main release audit — 99% coverage execution plan

**Frozen baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. **Branch:** `audit/main-release-blockers-coverage-tracker-20261024`.
**Status:** Owner clarified 25 October 2026: audit-only gap identification, NO application fixes. Complete-file static scan finished; behavior and manual semantic coverage not certified.

## Completed static-audit scope (not release approval)
- All 2,149 inherited main source files were fully read, Git-blob verified and static-scanned by [PR200 run 40129505623](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40129505623), plus the new scanner source file (2,150 total). No read/hash or Python AST parse failures.
- Per-file ledger and line-level heuristic queue under `docs/qa/evidence/`; [Gap verdicts](MAIN_RELEASE_GAP_VERDICTS_2026-10-25.md) classify all 23 source findings, a conditional cancellation policy gap and runtime/UX assurance gaps.
- User explicitly requested NO fixes on this PR. **99% source-file automated inspection != 99% semantic/behavioral correctness.** The following prior production release acceptance requirements are separately unfulfilled and remain for future authorization.

## Future production verification definition (not met)
- Review and record at least **2,128 of 2,149 applicable source-code paths** (99.02%) individually, at an exact commit SHA, with an inspection method and outcome. Directory enumeration alone earns no credit.
- All 23 findings B01–B23 receive independent triage: reproducible failing test or demonstrable false positive/accepted design, a minimal owning-domain fix where warranted, and passing negative/positive regressions on the final SHA. A source-level finding alone is not an exploit demonstration.
- Mandatory high-risk flows and permission matrices (all personas, two orgs/two pharmacies), payment concurrency, cancellation/expiry, staff removal, socket revocation, onboarding, timekeeping, invoice, escalation, hub and marketplace, and client parity need coverage even if the 99% file target is met.
- CI gate must pass on the **same final SHA**; skipped runs and historical passes remain unverified. Separate backend/SQLite, PostgreSQL/concurrency, Vite/Next/Expo/shared-core, Rust kiosk, authenticated browser, visual/390px, Android, iOS, staging, release migration and physical devices.

## Deterministic review pipeline
1. Freeze a source SHA. Export Git tree (path, blob SHA, bytes, domain). Define source-path denominator in tracker and record exceptions, if any, by path/reason.
2. Produce a per-file audit CSV under `docs/qa/evidence/` with columns `path,blob_sha,scope,review_method,reviewed_at,reviewer,security_notes,test_contract,conclusion,issue_id,proof_ref`. A row without evidence is **PENDING**, not reviewed.
3. Static gates: Python compile/lint/type checks, TypeScript compiler/ESLint, Rust checks, import boundaries, API routing and dead code; supplement with manual inspection of security-critical files. Never equate tool scan with semantic correctness.
4. Fix **tenant-security first** (B16/17/18/19/21/06/07/22/23); verify both denied and permitted access, unchanged logic for other personas, and cross-tenant data isolation.
5. Fix **payments and financial contracts** (B15/04/10/01/14/11/02); use disposable PostgreSQL for parallel payments, Stripe test mode and fake/late/duplicate webhook cases; never charge real cards.
6. Fix **offboarding/chat/privacy and events** (B03/05/08/20), then booking/reliability (B09/12/13), with exact-head tests.
7. Run handbook gate suite and capture jobs, screenshots, logs, test counts, and SHA in the evidence log. Rehearse fresh-install and populated-upgrade on disposable/restored anonymised DB; no live migrations without explicit authorisation.
8. Independent senior review and owner signoff; only merge/deploy when mandatory checks pass, blockers are resolved or explicitly deferred with compensating controls, and provenance remains complete.

## Stop/go rules
- Zero outstanding **confirmed** P0 blockers for unrestricted real-user launch. P1 may be deferred only with signed scope, mitigation and owner acceptance.
- Do not append speculative findings just to chase 100%. Record optional enhancements separately.
- Keep PR #182 independent, preserve the merged PR #198, and avoid cross-domain API or business-logic drift.
- Update `MAIN_RELEASE_AUDIT_TRACKER.md` and `MAIN_RELEASE_AUDIT_EVIDENCE.md` in every meaningful work commit.

## Handbook
`docs/qa/SENIOR_PACKAGE_TESTING.md` is read and authoritative for this PR. It refers to the longer archived Library handbook, which should be consulted before running all platform-native and visual gates. Never state that a gate has passed without exact SHA, command and result.

## 25 October 2026 — Current deep source continuation and 99% gate status

The wave 11 continuation on draft PR #200 adds **B53–B57 (five candidate risks)** after all prior B01–B52 records. Exactly 32 distinct new deep path references (17 inside and 15 outside the original 538 selected structural files) raise the separate causal-chain register from 44 to 76 distinct source/test paths. This is **not** 76 complete-file semantic certifications, and the structural ledger remains 538/2,149. Planned PostgreSQL concurrency, Stripe test-mode/refunds, tenancy authorization, kiosk, Vite, Next, Expo and native-device evidence has **not** been executed as part of the audit; all candidates remain source-only pending reproducible negative and passing positive tests. Source chains and file SHAs are in [wave 11](MAIN_RELEASE_DISCOVERY_WAVE_11.md) and [its ledger](evidence/MAIN_RELEASE_WAVE_11_PATH_LEDGER.csv). A 99% source-path, behavioral or production-readiness signoff remains unachieved.
