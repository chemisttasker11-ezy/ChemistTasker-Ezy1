# PR #200 — Deep causal source-review accounting (B43–B57)

**Frozen app baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. **Latest deep review:** discovery [waves 6](MAIN_RELEASE_DISCOVERY_WAVE_6.md), [7](MAIN_RELEASE_DISCOVERY_WAVE_7.md), [8](MAIN_RELEASE_DISCOVERY_WAVE_8.md), [9](MAIN_RELEASE_DISCOVERY_WAVE_9.md) and [10](MAIN_RELEASE_DISCOVERY_WAVE_10.md). All work audit-only.

## Actual measured progress

- **44 distinct backend/web/Expo source and test files** referenced in **64 code-line evidence occurrences** across **10 independent B43–B52 source findings**; each has a precise affected workflow and missing positive and negative test.
- **24 of those paths are newly reviewed outside the previously selected 538-source tranche**, while **20 overlap** the first selection. They are *not* added twice to the source-inventory coverage.
- These represent **function-level causal chain reviews**, often several interacting files per finding. **Do not convert the 44 references into 44 complete-file semantic certifications**. The entire 538-file tranche remains structurally examined, with deeper verification needed across most business flows.
- **0 reproduced security exploits, 0 payment/concurrency/real-device regressions executed**, zero code fixes. PR #200 remains draft. Candidate risk priorities are not independently proven exploit severities.

## Domains contributing to new source evidence

| Domain | Distinct source paths |
| --- | ---: |
| `backend/users` | 10 |
| `backend/chat` | 7 |
| `backend/onboarding` | 6 |
| `backend/pharmacy_hub` | 6 |
| `frontend_mobile` | 5 |
| `backend/core` | 3 |
| `backend/memberships` | 3 |
| `backend/client_profile` | 1 |
| `backend/dashboards` | 1 |
| `backend/notifications` | 1 |
| `frontend_web` | 1 |

## Evidence and next verification gates

The [immutable path register](evidence/MAIN_RELEASE_DEEP_SOURCE_PATHS.csv) contains source SHA, wave IDs, overlap grade and execution status. B43 token revocation needs web/native session replay; B44 invalid identity updates need persisted-file/transaction assertions; B45 invalid referee responses need HTTP check; B46/B48/ B50/B51 require private notification and revoked-member denial tests; B47 requires owner policy decision; B49 requires fake-PDF upload rejection; B52 requires Expo startup under denied server identity and browser comparison. For release, execute negative+positive tests on representative PostgreSQL/real-client fixtures and record the exact CI head and output. Never label a candidate reproduced without those records.

**Source audit work progressed; 99% manual semantic/release verification remains NOT achieved.**

## Combined deep register after wave 11 — 25 October 2026

- B43–B57: **15 new deep source candidates** across waves 6–11; B01–B42 historical findings remain unaffected. Overall **57 candidate findings, zero newly runtime-reproduced or fixed**.
- Existing waves 6–10: **44 distinct** source/test paths, with 24 outside and 20 inside prior 538-file tranche. Wave 11: **32 newly referenced distinct paths**, with 15 outside and 17 inside. Union **76 distinct** referenced paths, of which **39 outside** and **37 inside** original 538. *No overlap between old deep set and wave11 paths.* Data in [deep path register](evidence/MAIN_RELEASE_DEEP_SOURCE_PATHS.csv) and [wave 11 exact path/SHA ledger](evidence/MAIN_RELEASE_WAVE_11_PATH_LEDGER.csv).
- The prior 64 count referred to code-line reference occurrences in waves 6–10; wave 11 adds one ledger occurrence per new path. These are **different granularity**; do not claim their sum is 96 actual Markdown line-links, tests, files fully reviewed, or behavioral signoffs.
- Original **538/2,149** source-path cohort remains *structurally triaged*, of which 10 original were identified as deeper source call-path examinations and 528 outline-level only. The **76** newly aggregated deep references are *a separate overlay, not an additional 76 files added to the original structural cohort*. Applying either metric to a 99% semantic target would be misleading.
- Current scope still lacks executed positive/negative Stripe refunds/paid subscription lifecycle and competing-offer PostgreSQL transaction tests, concurrent cover approval and attendance corrections, two-organization separation matrices, kiosk native offline verification, authenticated Next/Vite/Expo journeys and real devices. **Release gating remains open.** See [wave 11](MAIN_RELEASE_DISCOVERY_WAVE_11.md).

## Second independent 516-file structural cohort

## Selected second tranche completed — 25 October 2026

- Independently acquired **all 516/516** selected, previously noncounted frozen-main source blobs and compared every returned Git blob SHA against the exact immutable inventory SHA. **516 successful matches; zero mismatches.** Source code was inspected for class/function outline, line count, and the first 20 also for additional token-based risk signals. This is **structural source triage**, not a claim that each full file was independently reasoned semantically.
- [Final 516-path manifest](evidence/MAIN_RELEASE_SECOND_TRANCHE_MANIFEST.csv), with `source_sha_verified=YES` and individual source blob, and [64 supporting numbered batch files](evidence/) preserving fetched SHA, source line count, outline and explicit `STATIC_OUTLINE_NOT_SEMANTIC` note. Batches 01–02 contain 10 rows each; 03–64 contain eight each. Total **20 + 62×8 = 516** distinct files.
- Coverage against the frozen 2,149-source inventory: first selected cohort 538 + second distinct cohort 516 = **1,054 / 2,149 = 49.0461%** independently fetched and *structurally* triaged. **49% structural review milestone reached, NOT 49% semantic/manual correctness verification**. Prior automated 2,149-file read is independent and not added to this count.
- Distribution of new 516: backend 210; shared-core 50; Vite 95; Next 50; Expo 95; auxiliary/tooling 16. Existing B01–B57 candidate findings unchanged. Deeper causal source-path register B43–B57 remains 76 paths. No new source candidate raised from outline patterns alone. **No tests/Stripe/PostgreSQL/browser/device runs or production fixes.** 1,095 of 2,149 baseline source paths remain **outside both independently structured cohorts**; even the inspected 1,054 require further full semantic and behavior checks for release gating. No changes to app code, deployments or other PRs.

## Wave12 independent deep source path accounting — B58–B61

- Previously 76 unique deep call-path source/test references for B43–B57. New wave12 references: **26** previously unlisted immutable baseline paths, independently inspected at their relevant source functions and captured in [wave12 exact-SHA ledger](evidence/MAIN_RELEASE_WAVE_12_PATH_LEDGER.csv). Combined register: **102 unique source/test paths** (not 102 semantically certified whole files); 11 wave12 paths had original first-cohort structural triage, 1 second-cohort, 14 were outside both.
- Distinct paths covered: internal invoice paid visibility; invoice revisions against retained payments; concurrent overlapping leave approvals; typed Expo payroll export mismatch. Zero targeted runtime tests. [Full candidate evidence](MAIN_RELEASE_DISCOVERY_WAVE_12.md).
- Separate structural result remains **1,054/2,149 = 49.0461%** retrieved and structurally triaged across two cohorts. **1,095 outside** them. Static full-source scan and deep function references are separate categories; neither establishes application correctness or 99% behavioral/semantic signoff.

## Independent semantic reasoning wave 13 (25 October 2026): B62–B65

- **Four new source candidates:** B62 assigned REGION_ADMIN with communication-only level passes generalized shift management and can trigger shift actions contrary to workforce capability rules; B63 conditional NATIVE_OFFLINE pairing code redeemable as WEB_ONLINE by platform claim; B64 kiosk pairing codes/PIN OTP are stored indefinitely in notifications and broadcast to push/WebSocket; B65 authenticated shift calculator uses real unrelated pharmacy guide rates, potentially bypassing redaction. Each finding has immutable source line proof, scope caveat, and positive/negative regression cases in [wave13](MAIN_RELEASE_DISCOVERY_WAVE_13.md).
- Source semantic traces: **38 distinct paths** categorized as bounded module, multi-module, client or test reasoning; **30 new to earlier 102 deep path register**, **132 unique source references total** after reconciliation. [Path-by-path scope ledger](evidence/MAIN_RELEASE_WAVE_13_SEMANTIC_PATH_LEDGER.csv). **Do not call 132 fully semantically approved files** or 49% semantic coverage. Positive rules were also checked (kiosk signatures/lockout, read-scoped REST notifications, accepted attendance membership); prior B29/B30/B32 preserved without duplication.
- Overall **65 provisional source-level candidates B01–B65**, zero new HTTP or PostgreSQL runtime reproductions, no tests executed, no fixes or product-source modifications. 1,054/2,149 independent structural acquisition unchanged. **Draft / NOT RELEASE READY**.

## Semantic wave 14 (25 October 2026), B66–B71

Six new source-level candidates after checking prior 65: B66 overnight shift cancellation wage goes negative; B67 generic DELETE removes paid-awaiting ShiftOffer; B68 untracked paid Stripe subscription ID activates customer account through customer fallback; B69 repeat cancellation penalty checkouts lack one-obligation-once reconciliation; B70 repeated base/addon checkout can create multiple recurring Stripe subscriptions; B71 post-transaction offer acceptance notification failure can return an error after the booking commits. Detailed immutable source-to-effect and positive/negative test plans: [wave14](MAIN_RELEASE_DISCOVERY_WAVE_14.md); [22-path review ledger](evidence/MAIN_RELEASE_WAVE_14_PATH_LEDGER.csv). 4 new paths in deep register; call-path source references are NOT complete-file semantic certification. B01–B65 retained. **71 provisional findings, 0 runtime reproduced in this wave, 0 tests executed, no app changes.** 1,054/2,149 structure-scanned cohort remains structural only; no 49% semantic coverage assertion. PR remains draft, not release-ready.
