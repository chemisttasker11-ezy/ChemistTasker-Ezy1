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

## Phase 2 Expo review in progress — 25 October 2026

- Started Phase 2 directly after the completed C008–C016 Phase 1 records. Frozen application baseline remains `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Reviewed and committed [C071](evidence/pr200_finish/out_C071.json) (**31** mobile shared/util and security files) and [C058](evidence/pr200_finish/out_C058.json) (**8** mobile parity screens). Prior `out_C059.json` existed and was preserved.
- New source-supported **unconfirmed** P1 findings: **C071-N1** asynchronous token refresh/profile bootstrap can restore former identity after logout or user switching, and **C071-N2** Expo logout does not unregister an active push token while backend notification delivery continues to look up active device tokens. Evidence includes mobile auth context, session/refresh storage, backend logout and device notification delivery. Both include negative/positive test contracts in C071; no runtime reproduction and no independent S2 verification.
- C058 traced attendance, ethical marketplace, finance, public marketplace, roster, ratings and reward entry paths to existing shared API calls; linked known B24/B25/B33/B35/B36/B41 and C009-N3 without creating duplicate findings. C058 creates no new candidate.
- **62/89 chunk reports complete; 27 remain.** Expected source-file count after regenerating the aggregate: **1407/2,151 (65.41%)** agent-reported S1 files. Checked-in CSV is stale and should not be described as updated. This does not certify S2 or S3. Expo Phase 2 still has **C054, C056–C057, C060–C061, C064–C070** remaining (C059 already done); F12 full web/mobile comparison outstanding. No application code, test, migration, merge or deployment changes. **NOT RELEASE READY.**

## Phase 2 Expo source-review milestone — 25 October 2026

- **Phase 2 assigned source-reporting work complete: all 15/15 outputs exist**, verified at PR head `eded1cbc312cc6b9a8cf374b13719ccf58f53081`: C054, C056, C057, C058, C059, C060, C061, C064, C065, C066, C067, C068, C069, C070 and C071. These contain **443 distinct mobile source-file verdicts**. All outputs reference frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06` or were read at that baseline.
- The earlier C054/C058/C059/C071 outputs were preserved; this continuation added **376** file verdicts across C056/C057/C060/C061/C064–C070. Overall **74/89** source chunks now reported with **15 other chunks** remaining; F12 cross-client flow is still absent.
- **Expected** source-file tally following regeneration of `MAIN_RELEASE_FINISH_LEDGER.csv`: **1,783/2,151 = 82.89%**; against the frozen main 2,149 paths, 82.97%. **The checked-in generated aggregate remains stale at 1,134/2,151**, so expected coverage is not a regenerated result. The global numeric 99% frozen-main threshold needs at least **345 additional qualifying main files**, plus required per-domain and security-critical criteria.
- New Phase 2 source-only findings: C071-N1 (auth refresh/bootstrap race after logout/account change), C071-N2 (push registration survives mobile logout), C070-N1 (globally keyed AsyncStorage applied/rejected markers can mix accounts when local persistence is enabled). **C070-N1 is P2 conditional**, given some board instances explicitly disable local persistence. It is not a proven cross-tenant backend information leak. No new distinct findings were reported in the other Phase 2 chunks; existing B-series/F-series issues are linked by ID and must be deduplicated/verified.
- **Integrity qualification:** chunk outputs represent first-pass S1 source inspection and business-call-path mapping. They DO NOT demonstrate independently validated full semantic correctness (S2), HTTP/PostgreSQL/browser/device tests (S3), or that every line of large UI files has independently been certified. Do not describe 'Phase 2 complete' as 'Expo verified safe' or 'production-ready'.
- **Next tasks:** regenerate and integrity-validate aggregate CSV from all 74 committed reports; independently verify conditional and high-impact findings, negative/positive auth and tenant tests, Android/iOS device evidence; complete 15 remaining source chunks, F12 client parity and source/release gates. No product source, migrations, tests or deployment changed during this audit phase. **PR remains DRAFT; NOT RELEASE READY.**


## Phase 3/4 continuation — 25 October 2026, ledger reconciled

- All remaining thirteen source-chunk outputs (C046,C048,C072,C073,C074,C076,C077,C078,C080,C082,C083,C084,C085) now have complete manifest path sets; existing C086 was preserved. No duplicate paths within those outputs; Phase 3/4 source acquisition is complete. These newly generated chunk reports intentionally say **SOURCE_FETCH_COMPLETE_SEMANTIC_PENDING** and must NOT be described as independent semantic S2 certification.
- Regenerated [MAIN_RELEASE_FINISH_LEDGER.csv](evidence/MAIN_RELEASE_FINISH_LEDGER.csv) from all 89 chunk outputs and the 2,151-row source inventory: **2,151 / 2,151 unique paths accounted for**; 0 missing paths, 0 unexpected paths, 0 duplicate paths. **323 fresh source-acquisition rows** have individual Git blob SHAs matching the inventory; earlier **1,828 agent-reported S1 rows** do not include individually independently re-fetched SHA in their chunk JSON. Two C082 PR-audit Python files do not exist on frozen main and must not contribute to the 2,149 frozen-main production-file denominator.
- The 2,151 figure is **source report inventory coverage, not 99% independent semantic coverage**; S0 existing static scanner unchanged; S1 existing 1,828 agent-reported records plus 323 new source acquisition/annotation, qualification outstanding; S2 independent cross-file certification remains incomplete, with three separately logged P0 source-supported traces from the earlier review; S3 actual targeted runtime/browser/PostgreSQL/Stripe/native testing NOT EXECUTED in this continuation. The F12 comparative worklog remains unfinished.
- Previously recorded B01–B71, all C/F candidates and the three P0 source-confirmed candidates remain preserved. The paediatric clinical release gate remains provisional pending independent validation, with no clinically incorrect dose demonstrated. **No production application source, migrations, tests, deployment or merge performed. PR stays DRAFT / NOT RELEASE READY.**
- Next required substantive gate is independent security/finance workflow causal tracing with second reviewer plus exact-head negative/positive execution. A source-retrieval milestone is not a production readiness approval.


## 25 October 2026 — F12 fourteen-action senior semantic continuation

- **Same draft PR #200:** source-verification commit `fffaa125fb4713fd92bf0012a57d48c2690d7f63`; frozen application baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. No application source, migrations, deployment, merge or real-payment actions changed.
- **S0:** 2,149/2,149 frozen-main files were statically inventoried in the existing audit. **S1:** 2,151/2,151 ledger paths are represented without duplicates, but 323 recently acquired paths are explicitly first-pass semantic-pending, and older 1,828 agent-reported rows are not independently re-certified; two extra audit-script paths are excluded from the frozen-main denominator. **S2:** bounded source challenges and 14 cross-client action traces, not 99% full-file independently validated semantic coverage. **S3:** no HTTP/PostgreSQL, browser, Stripe sandbox or native device test was run in this continuation.
- `SOURCE_CHALLENGE_20261025.json` now records **20 challenges**: 16 source-supported, 2 qualified source-supported (conditional/UI), 1 duplicated root, 1 refuted. Seven newly source-checked historic records: **B01, F07-N1, F08-N3, F09-N1, F10-N5, C064-N1 and F12-N1**. Each has immutable source links and negative/positive tests; these are NOT independent second-agent P1 certifications or runtime proof.
- The existing 101 C/F outputs and canonical raw findings already contain **155 findings (3 P0, 107 P1, 45 P2)**, including C064-N1 and F12-N1; the B01–B71 history remains in this tracker/discovery records and must not be mixed into or silently removed from the 155. Deduplication retains aliases and **C016-N2 is refuted for the cited ordinary Hub-group PATCH route**.
- The three original P0 candidates **F03-N1, F04-N1 and F04-N2** remain `CONFIRMED_SOURCE` only, without exploit reproduction. F12 now compares fourteen source-level actions spanning authentication, shifts, bookings, cancellations, Stripe, invoices, attendance, private Hub, chat and notifications. The public Next Hub and Next-to-Vite dashboard handoffs do NOT establish Next authenticated parity. See [F12 worklog](MAIN_RELEASE_F12_PARITY_WORKLOG_20261025.md) and [structured comparisons](evidence/pr200_finish/out_F12.json).
- **Not release-ready.** Correct blockers on a separate authorized implementation PR, then independently execute two-tenant negative and positive HTTP/PostgreSQL, browser, Stripe and Android/iOS device tests. Avoid substituting source comparison for S3.
