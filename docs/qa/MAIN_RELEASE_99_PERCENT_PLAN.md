# PR #200 — 99% release-audit coverage execution plan (senior revision)

**As checked on 25 October 2026, Brisbane time.** This revision supersedes earlier planning estimates. **AUDIT-ONLY:** do not edit product code, migrations or deploy/merge from this PR. Remediation and final release tests belong in separate, authorised implementation work.

## 1. Immutable baseline and truthful coverage accounting

- Target repository: chemisttasker11-ezy/ChemistTasker-Ezy1. Frozen production-code baseline and current remote main: **b77e9fd296bc2710350ef6f3cd402ce2529ffc06**. PR #200 head at this assessment: **793b83121d058f12f6e9fa1645b7a015f3bfd39c** (refresh head and main before starting another tranche).
- Frozen main production/source denominator: **2,149** tracked paths with source extensions (.py/.ts/.tsx/.js/.jsx/.mjs/.cjs/.rs) under existing inventory exclusions. The current finish ledger lists **2,151** because it also includes two PR200 audit Python scripts; keep these two separate in the headline baseline percentage.
- Automated Git-blob/static acquisition = **2,149/2,149 (100%)**, but is NOT source-semantic or runtime verification.
- Older independently fetched/outlined cohort = **1,054/2,149 (49.05%)** structural triage, NOT a second independent semantic numerator.
- New file-by-file agent pass = **1,134/2,151 (52.72%)** reported complete-file verdicts: 745 OK, 148 ISSUE, 64 NOTE, 177 NA. All 1,134 are frozen-main paths; **1,015 original-main source paths remain unreviewed**. 38/89 chunks and F12/12 end-to-end flow trace are pending. The same 1,134 should not be treated as independently accepted semantic certifications without validating evidence and context.
- **99% of the frozen main source inventory = ceil(0.99 × 2,149) = 2,128** qualifying files. This is **994 additional main-file reviews** above the 1,134 reported; 21 main paths could remain uncounted at the numerical threshold, but no high-risk file or entire domain may be excluded. For the 2,151-row audit ledger, 99% = 2,130 and 996 additional reviews. **Finish all 1,015 remaining main paths (100%) where possible** to avoid arbitrary exclusions.
- F01–F11 are source-traced but have no blanket runtime verification. Existing findings B01–B71 = 71 candidates; the finish pass adds 139 candidate reports (3 P0, 95 P1, 41 P2). **210 is the gross pre-deduplication count, not 210 independently proven distinct defects**. The finish-pass findings are unconfirmed; targeted tests were not executed in that pass.

**Never collapse these four measures:** (S0) automatically scanned, (S1) full-file reviewed, (S2) independently validated source/call-path reasoning, (S3) exercised and passed by exact-head HTTP/provider/database/browser/native tests. Print all four separately; do not call S1 99% semantic correctness or S3 production ready.

## 2. What a file must have before counting in S1 and S2

1. Path and exact frozen-main Git blob SHA; reviewer, actual review date and source-reading method; completed entire content (not just outline, grep or AST).
2. Verdict OK / ISSUE / NOTE / NA with a path-specific rationale. NA must show why it has no executable user or data effect; schema/data migrations, security-sensitive configs and deployment scripts do not default to NA.
3. For endpoints and production behavior: record inbound route, authentication and object-level/tenant authorization, caller and downstream service/serializer, mutations/transaction constraints/notifications, error handling, Vite/Next/Expo consumers, existing test coverage, a plausible denied case and a permitted case.
4. For purely declarative files/tests: record the actual contracts reviewed and why no further chain is applicable.
5. Every new issue gets an immutable source-line URL, positive/negative test contract, affected personas/tenant, factual impact, confidence and distinct issue ID. Do not mark an issue reproduced without execution evidence.
6. Cross-file S2 and all P0/P1 decisions require a second reviewer independent of the initial finder. Reviewed OK files in high-risk paths need independent spot-checks; a failed sample reopens the affected chunk.

**Current data-quality gaps:** the finish ledger has zero populated per-file test_contract fields; security_notes is written only for ISSUE rows; reviewed_at is hardcoded by merge.mjs; and proof_ref usually points to an agent chunk JSON rather than proof that every relevant cross-file behavior was checked. The merge script presently counts a row just because a path appears in an output. Fix these *audit accounting* defects before declaring verified S2 percentage. Preserve old results as reported S1 until validated, never silently inflate or discard them.

## 3. Remaining 38 chunks — ordered assignment queue, not just folder scanning

Use docs/qa/evidence/pr200_finish/chunks.json and files_Cxxx.txt as the authoritative chunk map. Each chunk must have one unique out_Cxxx.json with every assigned path exactly once; skip work already completed. Choose unassigned high-risk chunks before lower-risk utilities:

**Wave A — security-critical Django business logic (C008–C016; 9 chunks).** Audit core permissions, dashboards, marketplace/ethical stock, memberships, onboarding/AHPRA, organisations and pharmacy hub. Trace tenancy and permission grants into database writes and notifications. Also verify the high-confidence P0 chains F03-N1 and F04-N1/F04-N2 against exact code; no remediation on this PR.

**Wave B — worker and admin mobile journeys (C054, C056–C058, C060–C061; 6 chunks).** Expo account switching/auth guard, shift browsing and pay/booking, organisation/manager routes, pharmacist and other-staff dashboards, rosters, attendance and parity. Test-plan no stale auth or cross-role UI after revocation/log-out.

**Wave C — Expo shared business components (C064–C071; 8 chunks).** Shared messages/hub, invoices, pharmacy forms, shift posting/booking and talent cards. Validate request mapping to shared-core, response contracts, accessibility and user-facing errors.

**Wave D — Vite/Next and web test infrastructure (C046, C048, C072–C078; 9 chunks).** Shift and chat/hub UI, authenticated Playwright fixtures, Next public pages, migrated Next components, SEO/public privacy, API proxies, SSR, public/private separation and route parity.

**Wave E — operational/runtime and skill scripts (C080, C082–C086; 6 chunks).** Security-sensitive utilities, AHPRA extension, audited automation scripts, archived sources and development tooling. Document a narrow supported exception for truly non-production sources; do not exclude executable production tools by convenience.

**F12 — complete web/mobile comparison** concurrently with Waves B–D. Compare apply, accept, counter-offer, cancellation, clock-in/out, invoice send and chat send across Vite/Next where applicable, shared-core, Expo and the same backend. Record differences in auth, request data, status transitions, error text and user-visible state.

The five waves above account for exactly **38 pending chunk IDs**. Rescan the directory for out_Cxxx.json and remeasure the ledger after each committed output; do not duplicate another worker's completed chunk.

## 4. Senior semantic validation: required workflow matrix beyond file counts

The 12 existing F01–F12 flow reports are a starting index, not a complete release acceptance inventory. Break each into atomic transition/role/tenant cases with explicit required outputs.

**Personas:** anonymous, Explorer, owner, pharmacy manager, organisation chief/admin/region/communications-only, internal and external pharmacist, favourite locum, intern, technician, assistant/other staff, suspended user, removed staff member and revoked admin. Set up **two unrelated organisations, two pharmacies in each**, plus a shared-owner multi-site case.

**Cross-tenant negative matrix:** GET list/detail/search, POST, PATCH/PUT, DELETE, background task, signed file URL, chat/WebSocket, push and Expo cache. Attack surface includes URL IDs, nested POST/PATCH foreign keys, query filters, role/scope switches, inactive memberships, removed admin records and delayed callbacks. Test also the legitimate same-tenant permitted path: denial alone is not sufficient.

**Money and Stripe:** checkout quantity and amount, subscriber discounts, competing offers/slot capacity, failed/duplicate/late webhooks, refunds, repeated cancellation fee sessions, plan/seat changes, free trials, disputed paid invoices, credits and paid-once idempotency. Require PostgreSQL transactions with genuine concurrent requests and Stripe test-mode or verifiable fake events; never live card charges.

**Worker lifecycle:** shift publish/list/apply/counter/accept/confirm/cancel/repost/escalate/cover/swap; offboarding and re-invite; membership/admin grant/revoke; roster attendance/correction, breaks, leave overlap, payroll export and kiosk offline replay; notification delivery and failure-after-commit semantics.

**Other surface:** AHPRA/onboarding and identity storage, chat/hub/DM participation/mentions, talents/marketplace and anonymous/public Next pages, all user roles, attachment/file handling, authentication refresh/recovery/logout, privacy and rate limiting.

**Acceptance:** 100% of identified P0/security/finance/tenant-boundary routes and state transitions must have complete causal S2 traces. Critical cross-platform user journeys must have verified positive AND negative scenarios. 99% global source-path counting cannot hide any missing critical workflow.

## 5. Deduplicate and independently verify findings

1. Freeze and de-duplicate the **71 B-IDs + 139 new IDs** by root cause, code path and effect, not by title. Maintain alias IDs and previous evidence, including B66–B71 added after earlier agents started. Keep rejection and duplicates visible.
2. Verify **all 3 P0 and 95 P1 new candidates**, plus outstanding historical high-severity B findings, with a different reviewer from the finder. Exact line proof alone can support SOURCE-CONFIRMED, not RUNTIME-REPRODUCED. Classify each as CONFIRMED_SOURCE, REPRODUCED, REJECTED with reason, DUPLICATE_OF, or CONDITIONAL/POLICY.
3. Prioritize F03-N1 (revoked admin regain), F04-N2 (cross-tenant shift movement/rate defaults/payment_status), F04-N1 (worker can list another pharmacy's staff), and then subscriptions, double-payment, refund/credit, offboarding and notification data exposure.
4. When source is inconclusive, run isolated negative HTTP/PostgreSQL/Stripe tests; capture exact command, commit, fixture, expected vs actual, and relevant logs. Run legitimate positive control to guard against false fixes.
5. Classify each real issue as **FIX** (obvious correctness/security defect) or **GRILL** (genuine unresolved owner business-policy decision), with a recommended minimal behavior and known settled policy. Do not send the owner hundreds of duplicate scenarios.

Keep PR200 audit-only. Implement corrections on an independently controlled remediation branch based on current remote main, not on PR200 and not on unmerged PR182, after the owner grants implementation authority.

## 6. Source-review integrity gates and milestone checkpoints

Enhance audit-only merge/validation tooling before relying on numerical coverage: enforce unique inventory paths, exact SHA, complete chunk coverage, required reviewer/verdict/proof, valid issue references, stale/out-of-baseline detection, exclusion rationale and no duplicate source-file counting. Reviewer-report JSON alone is not independent code proof.

At the frozen **2,149**-file baseline:
| Milestone | Qualifying main source files | Additional from 1,134 |
| --- | ---: | ---: |
| 60% | 1,290 | 156 |
| 75% | 1,612 | 478 |
| 90% | 1,935 | 801 |
| 99% | 2,128 | 994 |
| Stretch 100% | 2,149 | 1,015 |

Require 99% *within each production domain*, not just globally; strive for 100% in backend sensitive routes, shared-core transport, production UI routes and Expo critical journeys. The old 1,054 structurally outlined files never increase the S1 numerator unless a later full-file review was recorded. For each milestone publish S0/S1/S2/S3 separately and commit the exact-latest ledger, risk status and next chunk queue.

## 7. Separate release verification after audit completion

PR200's 99% source audit is **not** a release approval. Follow docs/qa/SENIOR_PACKAGE_TESTING.md on the remediation head: backend SQLite and real PostgreSQL/concurrency; serializer/API boundary checks; shared-core, Vite, Next, Expo typecheck/lint/build; CodeQL and dependency/security; isolated Docker QA; authenticated Playwright and 390/1440 light/dark visual review; Windows Rust kiosk, offline queue/replay; Android and iOS emulator AND physical device; Stripe test-mode; migrations fresh-install/populated-upgrade/rollback on disposable databases; permitted staging smoke and log/alert review. Capture pass/fail/skip per exact final SHA.

**Release stop conditions:** no confirmed P0, no unresolved security/tenancy/financially consequential P1 without explicit controlled mitigation and owner acceptance, all required behavioral negatives/positives passed, no unexplained skipped critical CI, and no cross-platform or migration data-loss regression. Report NOT RELEASE READY until all are met.

**PR hygiene:** .github/workflows/pr200_readonly_static_audit.yml currently grants contents: write and supports workflow_dispatch, despite its read-only name. Remove the workflow from main-bound changes or make its permissions truly read-only before any merge; it should not accidentally ship as-is.

## 8. Living evidence deliverables and exact handover rule

- Update docs/qa/MAIN_RELEASE_AUDIT_TRACKER.md and MAIN_RELEASE_AUDIT_EVIDENCE.md with each meaningful tranche.
- Preserve the reported S1 ledger docs/qa/evidence/MAIN_RELEASE_FINISH_LEDGER.csv, but add explicit S2 validation and test-contract columns or a joinable, SHA-pinned review evidence file. Do not overwrite honest statuses with guessed passes.
- Populate docs/qa/evidence/pr200_finish/VERIFIED.json with independent findings decisions; add one atomic route/role/tenant matrix and a test-execution record with exact SHAs.
- Update MAIN_RELEASE_FINISH_HANDOVER.md, de-duplicated findings and PR description at milestones, naming only the incomplete chunks/flows and next owner.
- Do not merge PR200 to make it production ready; audit-only evidence and any fixes/releases are separate deliverables.

**Current decision: 99% NOT ACHIEVED; NOT RELEASE READY.** The next concrete action is to lock the ledger validator and independently verify the three P0 paths while the first previously unreviewed high-risk chunk (C008) is completed.

## Status amendment — Phase 1 completed (25 October 2026)

All nine priority backend chunk outputs **C008–C016 are now committed**. See [tracker](MAIN_RELEASE_AUDIT_TRACKER.md) and [handover](MAIN_RELEASE_FINISH_HANDOVER.md). This phase's 234 files have reviewer verdicts; **60/89 chunks** have outputs across the repository. The expected full-file count following regeneration is **1,368/2,151 (63.60%)** versus a currently stale generated CSV of 1,134. This is S1 reported review accounting only, **not S2 independent semantic certification or S3 executed safety tests**. Eight new provisional P1s from C010–C016 need deduplication and verification. **Phase 2 Expo, Phase 3 web/Next, Phase 4 operational, F12 parity and source-independent/regression test gates remain uncompleted.** The earlier queue text under section 3 should now be read as historical assignment order; skip all completed C008–C016 outputs.
