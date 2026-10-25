# Main release audit — evidence and handover

**Baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`
**Review branch:** `audit/main-release-blockers-coverage-tracker-20261024`
**Decision:** NOT RELEASE-READY; this documentation-only branch is not a fix.
**Last verified date:** 2026-10-25 Australia/Brisbane.

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
| Full-file automated static inspection | 2149/2149 frozen-main sources, 2150/2150 at scanner commit | PASS on [run 40129505623](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40129505623); semantic cert 0 |
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


## Independent source review pass — 24 October 2026 (main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`)

**Method:** GitHub-connected `fetch_file` line-window inspection of frozen main, compare against the source-finding register, and read GitHub Actions failing job log. These are **static source observations**, not executing tests or reproducing an exploit. The audit branch contains only documentation, so frozen main's application blobs are its currently inherited application source. No user/staging data was accessed or modified. Product behavior and launch decisions still require owner confirmation.

**Correction to earlier worklog:** The complete 310-line archived `Senior-package-testing-handbook.md` *was independently retrieved and read* during the 24 October session, in addition to repository `docs/qa/SENIOR_PACKAGE_TESTING.md`. The prior statement that it was not retrievable applied to an earlier attempt.

### B01–B23 line-linked source findings — all pending regression proof

| ID | Source path and code lines (main SHA) | Precise observation | Confidence / next proof |
|---|---|---|---|
| B01 | `backend/billing/views.py:628-668` | `is_subscriber` is calculated but checkout uses the standard Stripe price ID for LOCUM and other work regardless. | Direct code gap; test subscriber and non-subscriber line items in Stripe test mode |
| B02 | `backend/billing/views.py:480-545` | Existing `stripe_extra_seat_subscription_id` produces HTTP 400 instead of adjusting the seat quantity. | Direct functional limitation; pricing/proration policy must be confirmed |
| B03 | `backend/memberships/views.py:112-135`; `backend/chat/models.py:104-120` | Membership destroy deletes participant links then deletes membership, while `Message.sender` is CASCADE; persisted message history can disappear. | Direct FK path; test retained messages, files and authorship across offboarding |
| B04 | `backend/billing/views.py:548-695` | With no slot/offer IDs, code still constructs a paid checkout quantity of one; no immutable unpaid-obligation binding is shown in this path. | Direct code path; assert empty, duplicate, concurrent and already-paid rejection |
| B05 | `backend/chat/consumers.py:19-118,189-225`; `backend/chat/signals.py:35-80` | Existing room socket authorises on connect and rechecks AHPRA, but does not re-check membership before `_create_message` or each room-group delivery. | Potential active-socket revocation gap; establish socket, revoke access, test sends/receives |
| B06 | `backend/team_calendar/views.py:450-519` | Organisation feed uses all `Pharmacy.objects.filter(organization_id=...)` for work notes; membership in one pharmacy grants its organisation ID. | Direct query-scope mismatch; cross-pharmacy owner/region/staff negative API test |
| B07 | `backend/team_calendar/views.py:127-153,241-306` | Calendar management consults org-level `MANAGE_ROSTER` / `MANAGE_ADMINS` capability but not a region member's assigned pharmacy list. | Direct permission predicate; test scoped admin create/update/delete and target movement |
| B08 | `backend/shifts/notifications.py:32-59` | Shift-manager notification selects all organisation `REGION_ADMIN` memberships, not only the pharmacy-assigned recipients. | Direct recipient query; verify zero cross-region notifications |
| B09 | `backend/shifts/base.py:153-168`; `backend/shifts/escalation.py:81-122` | Escalation runs when shift querysets are evaluated. No periodic delivery or per-tier audience notification is present in these reviewed routines. | Source-path gap; independently inventory schedulers then test clock-advanced zero-traffic escalation |
| B10 | `backend/rewards/views.py:150-270`; `backend/rewards/services.py:123-162,356-370` | Multi-unit Pills payment loops `spend_pills_for_shift_post`, which returns existing ledger for the same shift-wide idempotency key on every iteration. | Direct logical defect; test 2+ offers and concurrent requests on PostgreSQL |
| B11 | `backend/shifts/offers.py:329-410`; `backend/shifts/offers.py:175-182` | Accepting an offer sets `ACCEPTED_AWAITING_PAYMENT`; the reviewed expiry transition targets `PENDING` only. | Potential indefinitely locked slot; test expiry, re-opening and stale Stripe webhook; preserve PR #182 independently |
| B12 | `backend/ratings/views.py:54-94` | Both eligibility helpers check existence of an assignment and explicitly say 'any time', without actual completed shift date/status check. | Direct eligibility defect; create future assignment then attempt rating |
| B13 | `backend/users/api_account.py:65-100`; `backend/users/account_deletion.py:92-120` | Account deletion anonymises user and revokes tokens without handing over or releasing future assignments. | Direct missing lifecycle in inspected path; test future shifts and manager alert |
| B14 | `backend/shifts/pricing.py:47-55,185-210`; `backend/shifts/data/award_rates_casual_first_level.json`; `backend/workforce/award_rates.py:10-15,56-80`; `backend/shifts/data/public_holidays.json` | Static shift-price casual pharmacist weekday = 47.68 while July 2026 workforce rate table = 52.18; holiday table covers 2026 only. | Confirmed internal inconsistency; validate official award effective dates and all state holidays |
| B15 | `backend/billing/views.py:696-807,807-913` | Cancellation checkout sends `type=cancellation`, but any paid payment-type webhook with shift ID calls pending-offer finalization; no `fulfillment` guard. | Direct financial transition risk; negative cancellation vs fulfilment webhook tests |
| B16 | `backend/organizations/views.py:301-313,384-425,586-594`; `backend/organizations/serializers.py:603-665` | Pharmacy-admin endpoint inherits `ModelViewSet.update`; visibility-scoped queryset and serializer allow changing `user`, `pharmacy`, `membership`, `is_active`, `staff_role` without object-management capability check. | Direct authorization gap; PATCH/PUT reassignment to unrelated pharmacy negative tests |
| B17 | `backend/organizations/views.py:595-705`; `backend/organizations/serializers.py:577-602` | Dedicated `add_pharmacy` checks ownership but generic chain update accepts `pharmacy_ids` from all pharmacies. | Direct alternate write-path gap; cross-tenant chain PATCH/PUT and membership removal tests |
| B18 | `backend/organizations/claims.py:351-360,459-545`; `backend/organizations/serializers.py:487-528` | `UpdateModelMixin` implements PUT while owner-only workflow is enforced only by `partial_update`; status fields remain writable. | Direct alternate method gap; outsider/organisation PUT must never accept claims |
| B19 | `backend/memberships/views.py:189-225`; `backend/memberships/serializers.py:265-275`; `backend/memberships/models.py:233-247` | Invite-link generic PATCH can change pharmacy/category/expiry; application FK to invite-link uses CASCADE on deletion. | Direct mutable token scope/historical integrity risk; blocked retarget, archive-safe delete tests |
| B20 | `backend/shifts/offers.py:43-135`; `backend/shifts/serialization/interests.py:7-42,119-129` | Generic update of self-owned interest/rejection can write `shift` FK; no target-specific permission check in the reviewed serializer. | Direct mutable FK risk; negative cross-shift/other-owner request |
| B21 | `backend/shifts/serialization/worker_requests.py:7-27,77-91`; `backend/shifts/worker_requests.py:20-100,225-260`; `backend/workforce/roster/worker_actions.py:328-397` | Cover request permits independent `pharmacy` and `shift` assignment; release checks manager authority on the request pharmacy, then deletes the referenced assignment without checking its own pharmacy. | High-risk cross-pharmacy path; two-tenant release denial and unchanged assignment test |
| B22 | `backend/pharmacy_hub/polls.py:74-89`; `backend/pharmacy_hub/scoping.py:151-171`; `backend/pharmacy_hub/access.py:284-328` | Organisation poll aggregation includes pharmacy polls, whereas organisation hub post filtering only permits org-tagged posts; region roles can enter organisation hub. | Direct privacy scope inconsistency; private poll inaccessible via org list and direct ID |
| B23 | `backend/organizations/views.py:55-73`; `backend/users/org_roles.py:110-150,207-216`; `backend/users/permissions.py:7-44` | Organisation update/delete uses `ORG_WIDE_ADMIN_ROLES`, which includes CHIEF_ADMIN. | Direct role policy mismatch **if** Chief Admin is not allowed to edit org record; owner policy + negative tests needed |

### Independent CI and platform review

- Main SHA `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`, Full Isolated QA run [40019714397](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40019714397) = PASS; still historical baseline evidence, not an audit PR run.
- Main SHA staging QA run [40019714320](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40019714320) = FAIL, job `120640790121`, step 'Run isolated regression suite'; logs contain `fatal: ambiguous argument HEAD^` and `Shared-core boundary audit SKIPPED: no comparison base` near line 1224-1228, exit 1. Independently diagnose and fix shallow-history/explicit comparison base before relying on staging QA's architecture gate. The shared-core skip is an audit coverage failure; not proof of broken application logic.
- No GitHub Actions run exists for audit branch at inspection; no source/head tests executed. **Do not count main's green full QA as proof that B01–B23 are safe.**
- Inspected Vite `frontend_web/src/App.tsx` and `navigation.tsx`, Next `frontend_web/landing_next/next.config.ts`, Expo `frontend_mobile/app/_layout.tsx`, shared core `shared-core/src/domains/shifts/api.ts` and `shared-core/src/transport/client.ts`. Architecture uses domain shared API operations, Next proxy, and mobile role gates; actual browser transitions, device builds and 390/1440px visual behavior are **UNTESTED** here.
- Mobile `frontend_mobile/RELEASE_CHECKLIST.md` still displays unchecked production build, pinning, Google key restrictions, login persistence, background push, crash collection and iOS permission items. An unchecked checklist is **not proof** of a failed build; obtain signed/real-device evidence.

### Evidence completeness

23/23 registered issues have a source-level triage note in this pass; **0/23 reproducible failing tests; 0/23 fixed; 0/23 exact-head green regressions.** This is not 99% line/file audit completion. The 2,149-path inventory and current source inspections must be converted into per-file rows `docs/qa/evidence/` with review method, blob SHA and outcome. No test credentials or staging data belong in this document.

## 25 October 2026: audit-only completion of complete-file static inspection

[GitHub Actions run 40129505623](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40129505623) passed at `1d655a007dc49c219bc39d16f981afed1d4b6edc`: all 2,149 inherited main source files plus scanner script were fully read/static-scanned with verified Git blob IDs (2,150/2,150). 776 Python AST parses passed with zero failures. Zero read/hash errors. 284 distinct files had scanner signature hits; they are NOT confirmed defects. See `docs/qa/evidence/MAIN_RELEASE_AUTOMATED_STATIC_AUDIT.json`, `MAIN_RELEASE_SOURCE_COVERAGE.csv`, `MAIN_RELEASE_STATIC_FLAGS.csv` and [gap verdicts](MAIN_RELEASE_GAP_VERDICTS_2026-10-25.md). **Manual semantic certification and validated exploits remain 0; application code was not modified.**

Official independent check: current casual pharmacist ordinary weekday $52.18 under [Fair Work MA000012](https://awards.fairwork.gov.au/MA000012.html) compared with legacy $47.68 in shift JSON. Queensland [2027 public holidays](https://www.qld.gov.au/recreation/travel/holidays/public) available but not in shift holiday JSON. Current mobile dependency security failure is GHSA-w74x-v6f9-j3xg; neither was fixed. This is audit evidence, NOT production readiness.

## 25 October 2026 — B24–B32 new source discovery

Previous B01–B23 were not re-reviewed. New marketplace, ethical marketplace, timesheet, attendance/kiosk and notification source paths and existing test contracts were independently traced against frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. New source findings: **9 (B24–B32)**, details [MAIN_RELEASE_DISCOVERY_WAVE_2.md](MAIN_RELEASE_DISCOVERY_WAVE_2.md). P0-impact candidates B24, B29; others conditional P1. No runtime exploit or regression was run and 0 code fixes were made. The specific missing negative tests are documented. New findings are **not** verified defects until executed against an isolated representative data fixture.

## 25 October 2026 — discovery wave 3

Two NEW source findings B33–B34 after tracking B24–B32, via independent tracing of `backend/invoicing/views.py` → `serializers.py` → `models.py` and `backend/talent/views/explorer.py` → `models.py` → read serializer. See [MAIN_RELEASE_DISCOVERY_WAVE_3.md](MAIN_RELEASE_DISCOVERY_WAVE_3.md). Priority provisional, no reproduction and no code modifications; **34 source findings tracked**.

## 25 October 2026 — actual second-quarter read evidence

**48/538** selected immutable baseline source files individually fetched in six batches of eight and compared with exact GitHub blob SHAs from the quarter manifest; all reported SHA match and were read/triaged. Additional request→serializer→service→model source evidence, and existing roster HTTP regression tests, inspected for newly discovered B35–B40. See [MAIN_RELEASE_DISCOVERY_WAVE_4.md](MAIN_RELEASE_DISCOVERY_WAVE_4.md). No runtime exploit was run; no application fixes. Automated GitHub Actions quarter scan is distinct from these manual source reads and does not certify 538 human reviews.

## 25 October 2026 — Source reading 49–167, B41–B42

167/538 selected frozen-main source paths now independently fetched and triaged by assistant via connected GitHub; only traced files labelled SOURCE_CALLPATH_REVIEWED, the rest SOURCE_TOOL_FETCHED_OUTLINE_TRIAGED. Audit-source SHA unchanged. Two new P1 candidates B41 (private community shifts/notifications expose active-but-unaccepted members) and B42 (marketplace draft PATCH partially commits before delivery validation); full evidence in [wave 5](MAIN_RELEASE_DISCOVERY_WAVE_5.md). No negative test executed.

## 25 October 2026 — Completion of selected 538-file source acquisition and structural review

Following [wave 5](MAIN_RELEASE_DISCOVERY_WAVE_5.md), files #168–538 (371 additional selected source files) were individually fetched by immutable blob SHA from the connected GitHub repo and inspected via their full contents for source-level structure, code paths, and line-numbered signals. Previous 167 files were already recorded. **Final 538/538 selected files now direct GitHub fetched + structurally triaged**. 10 marked `SOURCE_CALLPATH_REVIEWED`; 528 `SOURCE_TOOL_FETCHED_OUTLINE_TRIAGED`. [GitHub Actions 40133515923](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40133515923) separately matched byte SHA for all 538 with zero errors. Full evidence in [completion report](MAIN_RELEASE_FIRST_QUARTER_COMPLETION.md) and [quarter ledger](evidence/MAIN_RELEASE_QUARTER_2_FILE_LEDGER.csv). **Do not claim 538 full semantic signoffs, runtime reproduced vulnerabilities, or production readiness**. Source finding register B01–B42 unchanged and application code untouched.

## 25 October 2026 — Deep contextual tracing and three new source findings B43–B45

Read complete endpoint, serializer, permission/model, settings, storage and previous test paths for: password reset & SimpleJWT 90-day refresh revocation; per-role ID-tab file cleanup before validation; signed referee submissions with optional `would_rehire` but unconditional non-'No' confirmation. The analysis has direct frozen-main source links and precise missing negative cases in [wave 6](MAIN_RELEASE_DISCOVERY_WAVE_6.md). **45** tracked source findings, **no runtime exploit reproduction or product source fixes**. Existing B01–B42 were not revisited.

## 25 October 2026 — Wave 7 B46–B48; private Hub + org invitation deep review

Checked membership status/default vs lifecycle invite, Hub scope resolver (pharmacy/group/org), post create/list, member directory, tagged membership serializer, full-body notification/email, organisation invite immediate write, org membership role permission, org dashboard, and pre-existing region admin/pharmacy admin invite contract tests. Three independent source-level candidate gaps **B46–B48** documented with immutable main links and complete negative/positive fixtures in [wave 7](MAIN_RELEASE_DISCOVERY_WAVE_7.md). **48 tracked candidates**, none runtime reproduced in this wave; product code unchanged.

## 25 October 2026 — Deep tracing B49–B50

Traced file-validation extension/MIME/magic type fallback through Hub and Chat attachment persistence and found that malicious bytes under declared PDF can pass fallback; separately traced pharmacy chat eligibility via Membership status, Conversation queryset, ConversationListSerializer last_message and stricter message route. Independent source evidence/negative tests in [wave 8](MAIN_RELEASE_DISCOVERY_WAVE_8.md). **50 source-level candidates tracked; 0 runtime reproduced or fixed**.

## 25 October 2026 — B51 direct HTTP community chat authorization

Independently traced `MessageViewSet.create` → `Participant` and current `Membership` flags → `MembershipViewSet.perform_update` → realtime `participant_can_receive_chat_updates` and existing REST/WS tests. Dedicated messages POST lacks active/ACCEPTED check even after revocation, while realtime helper demands both. [Wave 9 detailed report](MAIN_RELEASE_DISCOVERY_WAVE_9.md). **51 source-level candidates; B51 is not HTTP-reproduced and no fix was made**.

## 25 October 2026 — Deep source-path accounting (B43–B51)

Added per-file baseline SHA and occurrence-to-wave mapping for 38 distinct backend source/test paths cited in detailed new findings B43–B51. See [register](evidence/MAIN_RELEASE_DEEP_SOURCE_PATHS.csv) and [measured summary](MAIN_RELEASE_DEEP_REVIEW_PROGRESS.md). This measures multi-module causal investigation; it neither expands 538-file tranche count nor equates to fully certified semantic correctness. No test reproduction or app code fixes.

## 25 October 2026 — B52 independent Expo/web session authority comparison

Traced Expo secure token and cached user hydration, local JWT expiry, `/users/me/` failure handling, UI `AuthGate` role routing, Axios 401 interceptor and Vite cookie identity bootstrap. Source indicates Expo can restore cached role after server 401/403 when stale access remains. Evidence and different-status signed-device tests in [wave 10](MAIN_RELEASE_DISCOVERY_WAVE_10.md). **52 source candidates; 0 B52 runtime proof; 0 code fixes.**

## 25 October 2026 — Accurate B43–B52 new-path accounting

Reconciled every immutable GitHub source line reference across waves 6–10 against frozen-main Git tree and first 538-file manifest. **44 unique source/test paths**, **24 genuinely outside first tranche** and **20 intersecting existing structural review**; hashes and references in [deep path CSV](evidence/MAIN_RELEASE_DEEP_SOURCE_PATHS.csv), [summary](MAIN_RELEASE_DEEP_REVIEW_PROGRESS.md). No crossplatform runtime tests executed or app source edited.

## 25 October 2026 — Independent wave 11 (five new source candidates, no execution)

After rereading the exact PR #200 head, evidence, tracker, previous ten waves and both source-coverage ledgers, independently traced 32 additional distinct source/test paths on immutable main baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. [Wave 11](MAIN_RELEASE_DISCOVERY_WAVE_11.md) documents B53–B57, each with endpoint, authorization, service, DB and notification state, shared-core and available Vite/Expo paths, existing test protections, and precise negative/positive regression cases. [Per-path SHA ledger](evidence/MAIN_RELEASE_WAVE_11_PATH_LEDGER.csv) proves 32 unique wave11 paths, 17 inside the first 538 and 15 outside; none duplicated B43–B52 deep register entries. Combined deep path registry is 76 distinct paths, 39 outside structural tranche.

These are **five NEW source-level candidates**: B53 subscription event reordering/base entitlement, B54 overlapping paid accepted offers, B55 unlinked cover-request approval race, B56 attendance correction write skew, B57 conditional reversal/refund reconciliation. **No tests or payment-provider events run, no user sessions or staging used, no fix implemented.** Source evidence is not release approval. Further source-only review does not replace isolated PostgreSQL race, negative permission, Stripe test-mode, Vite/Next/Expo, kiosk and real-device gates.

## 25 October 2026 — Second structural source tranche: actual first 20

From the 2,149-file immutable inventory selected 516 additional, unique previously unreviewed paths (manifest linked in [progress report](MAIN_RELEASE_SECOND_TRANCHE_PROGRESS.md)). The first two groups of ten were individually retrieved via connected GitHub, compared to the frozen-main Git-blob SHA and inspected by complete content, function outline, line counts and targeted risk tokens. 20/20 reads and hashes matched; 496 remained queued. This establishes **558/2,149 = 25.9656%** independent structural review, not the requested 49%, not 558 semantic signoffs. No targeted tests executed, no novel defects elevated without full cross-path proof, no product files edited.

## Second tranche verification checkpoint: manifest entries 20–99

80 more selected distinct GitHub frozen-main files were individually fetched, content inspected for function/class outlines, Git blob SHA matched in all 80, and recorded with explicit no-semantic-certification note. Ten corresponding evidence batch blobs committed in the same PR. First tranche 538 + this second tranche 100 = 638/2149 structural paths, 416 additional queued for 49.0461% selected goal. Source only; 0 tests executed, new issue IDs 0.

## Frozen source read provenance — second cohort complete

## Selected second tranche completed — 25 October 2026

- Independently acquired **all 516/516** selected, previously noncounted frozen-main source blobs and compared every returned Git blob SHA against the exact immutable inventory SHA. **516 successful matches; zero mismatches.** Source code was inspected for class/function outline, line count, and the first 20 also for additional token-based risk signals. This is **structural source triage**, not a claim that each full file was independently reasoned semantically.
- [Final 516-path manifest](evidence/MAIN_RELEASE_SECOND_TRANCHE_MANIFEST.csv), with `source_sha_verified=YES` and individual source blob, and [64 supporting numbered batch files](evidence/) preserving fetched SHA, source line count, outline and explicit `STATIC_OUTLINE_NOT_SEMANTIC` note. Batches 01–02 contain 10 rows each; 03–64 contain eight each. Total **20 + 62×8 = 516** distinct files.
- Coverage against the frozen 2,149-source inventory: first selected cohort 538 + second distinct cohort 516 = **1,054 / 2,149 = 49.0461%** independently fetched and *structurally* triaged. **49% structural review milestone reached, NOT 49% semantic/manual correctness verification**. Prior automated 2,149-file read is independent and not added to this count.
- Distribution of new 516: backend 210; shared-core 50; Vite 95; Next 50; Expo 95; auxiliary/tooling 16. Existing B01–B57 candidate findings unchanged. Deeper causal source-path register B43–B57 remains 76 paths. No new source candidate raised from outline patterns alone. **No tests/Stripe/PostgreSQL/browser/device runs or production fixes.** 1,095 of 2,149 baseline source paths remain **outside both independently structured cohorts**; even the inspected 1,054 require further full semantic and behavior checks for release gating. No changes to app code, deployments or other PRs.

## 25 October 2026 — Independent B58–B61 source continuation (wave12)

- Duplicates avoided after reading latest `e6dc9136ba35bcc4cd54bb1353d3b58bc6ee8d4a` tracker/evidence/deep-source register and waves B01–B57. Four new source candidates from worker-finance invoice state and payment revision, manager leave approval concurrency, Expo payroll export. [Individual source→authorization→service/DB→client→tests](MAIN_RELEASE_DISCOVERY_WAVE_12.md).
- 26 baseline source/test paths with exact Git blob SHA in [wave12 ledger](evidence/MAIN_RELEASE_WAVE_12_PATH_LEDGER.csv), all newly referenced relative to 76 previously registered deep paths; current deep overlay 102. Function-level reading, not exhaustive whole-file semantics; independent first/second structural cohorts remain 1,054/2,149.
- Existing tests read but none executed; no HTTP/Stripe/PostgreSQL/Expo/browser/device verification. Finance manual-paid/credit business policies remain unresolved; SQL race needs true concurrent transactions; CSV needs an approved worker fixture and actual native export. No changes to app code, configs, migrations, deployments or other PRs.

## Independent semantic reasoning wave 13 (25 October 2026): B62–B65

- **Four new source candidates:** B62 assigned REGION_ADMIN with communication-only level passes generalized shift management and can trigger shift actions contrary to workforce capability rules; B63 conditional NATIVE_OFFLINE pairing code redeemable as WEB_ONLINE by platform claim; B64 kiosk pairing codes/PIN OTP are stored indefinitely in notifications and broadcast to push/WebSocket; B65 authenticated shift calculator uses real unrelated pharmacy guide rates, potentially bypassing redaction. Each finding has immutable source line proof, scope caveat, and positive/negative regression cases in [wave13](MAIN_RELEASE_DISCOVERY_WAVE_13.md).
- Source semantic traces: **38 distinct paths** categorized as bounded module, multi-module, client or test reasoning; **30 new to earlier 102 deep path register**, **132 unique source references total** after reconciliation. [Path-by-path scope ledger](evidence/MAIN_RELEASE_WAVE_13_SEMANTIC_PATH_LEDGER.csv). **Do not call 132 fully semantically approved files** or 49% semantic coverage. Positive rules were also checked (kiosk signatures/lockout, read-scoped REST notifications, accepted attendance membership); prior B29/B30/B32 preserved without duplication.
- Overall **65 provisional source-level candidates B01–B65**, zero new HTTP or PostgreSQL runtime reproductions, no tests executed, no fixes or product-source modifications. 1,054/2,149 independent structural acquisition unchanged. **Draft / NOT RELEASE READY**.

## Semantic wave 14 (25 October 2026), B66–B71

Six new source-level candidates after checking prior 65: B66 overnight shift cancellation wage goes negative; B67 generic DELETE removes paid-awaiting ShiftOffer; B68 untracked paid Stripe subscription ID activates customer account through customer fallback; B69 repeat cancellation penalty checkouts lack one-obligation-once reconciliation; B70 repeated base/addon checkout can create multiple recurring Stripe subscriptions; B71 post-transaction offer acceptance notification failure can return an error after the booking commits. Detailed immutable source-to-effect and positive/negative test plans: [wave14](MAIN_RELEASE_DISCOVERY_WAVE_14.md); [22-path review ledger](evidence/MAIN_RELEASE_WAVE_14_PATH_LEDGER.csv). 4 new paths in deep register; call-path source references are NOT complete-file semantic certification. B01–B65 retained. **71 provisional findings, 0 runtime reproduced in this wave, 0 tests executed, no app changes.** 1,054/2,149 structure-scanned cohort remains structural only; no 49% semantic coverage assertion. PR remains draft, not release-ready.

## 25 October 2026 — Senior PR200 99% coverage plan checkpoint

- Rechecked PR200 head `793b83121d058f12f6e9fa1645b7a015f3bfd39c` at start; source baseline main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06` remained unchanged.
- Inspected the 2,151-row finish ledger, 51 finished chunk outputs, 11 finished flow reports, 139 candidate finding records, known B01–B71 index, and SENIOR_PACKAGE_TESTING.md.
- Counted by scope: backend 490/724, shared-core 146/146, frontend_web 347/640, frontend_mobile 143/558, scripts 8/33, .agents 0/46, docs audit/archive source 0/4; 1,017 finish ledger rows pending including two PR-added audit scripts. Frozen-main source target 2,128/2,149, current agent-reported 1,134/2,149, requires 994 additional baseline-file reviews.
- Existing per-file CSV has 0 populated test_contract entries: reviewing a file and S2 independent cross-file semantic validation or S3 runtime exercise MUST be reported separately.
- Inspected immutable baseline code for F03-N1 (organizations/views.py:313-344, 586-591), F04-N2 (shifts/base.py:120-137, shifts/serialization/shifts.py:48-51 and 330-350, shifts/posting.py:173-201), F04-N1 (shifts/lifecycle.py:287-290, shifts/candidates.py:212-279): serious source-supported candidates, no HTTP reproduction executed.
- Updated MAIN_RELEASE_99_PERCENT_PLAN.md at `5b4bf9f4a43342a1e3bf4c795ff50ddd016fa627` and living tracker at `926eaad812c0f688ba2cf3d7548e5710dc930351`, including ordered 38-chunk queue, F12, 99% integer threshold, S0-S3 separation, dedupe and release test gates. No product code, migrations, tests or deployment changed.
- Still audit-only, NOT RELEASE READY. Next independent workflow must refresh latest head and skip completed output chunks; do not count plan/report commits as semantic coverage.

## Execution continuation — C008 plus independent P0 source verification (25 October 2026)

- Completed new C008 output for all 36 frozen-main backend/core files: [source review](evidence/pr200_finish/out_C008.json), SHA `0b5d4ed8ce08b77ee64dd4e16ff690f78e812adc`. No new unique production finding. Mapped file-validation sniff/MIME fallback to historical B49 and early identity-file cleanup to B44.
- Independent reviewer checked F03-N1, F04-N1, F04-N2 against current baseline source, invite and shift existing tests. All marked **CONFIRMED_SOURCE** in [VERIFIED.json](evidence/pr200_finish/VERIFIED.json). None is **RUNTIME_REPRODUCED** and zero targeted tests executed; negative/positive test contracts preserved.
- **Outputs:** 52 of 89 chunk outputs now committed; 37 chunks remain, F12 flow remains. Aggregated per-file CSV still 1,134 until `merge.mjs` is rerun; a correct rebuild should produce **1,170 / 2,151 (54.39%)** reported full-file reviews, including 2 PR-added audit scripts in denominator. Do not update measured ledger percentage before merge.
- **No product code, migrations, fixes or staging changes**. Audit remains DRAFT, not release-ready.

## Next-phase continuation — C009 complete (25 October 2026)

- Completed [C009](evidence/pr200_finish/out_C009.json) with **24 full-file verdicts** in core task/OTP/URL contracts, all dashboard views/tests and ethical marketplace schema, administration and import-commit path. Commit `342e42f001c3e363b9fa2f85e522e8ca79e0a15c`.
- **Three new unconfirmed source candidates:** C009-N1 P2 audience leakage through pharmacist/otherstaff dashboard community_shifts query (not the same as worker eligibility filter); C009-N2 P2 mobile 'Total Income This Month' populated by lifetime invoiced totals including drafts; C009-N3 P1 ethical import-commit stock mutation does not check `ETHICAL_INVENTORY_ENABLED` after an import was staged. Each has expected denial/permitted test requirements. No app code or test execution.
- Existing findings, including B41, were checked to avoid duplicates. The count is now **53/89 completed chunks, 36 remain**. Last generated ledger CSV remains **1,134/2,151** until `node docs/qa/evidence/pr200_finish/merge.mjs` is run. A rebuild including C008 (36) and C009 (24) would yield **1,194/2,151 = 55.51%** reported complete-file review; do not present it as a committed recalculated ledger or runtime/S2 certification.
- F12 remains pending. Further deep review of C010 ethical marketplace/invoicing is underway but **NOT counted complete**. Source-inspection only, zero new runtime reproductions and no production modifications. Next continuation first refresh PR head and existing out_C files, then finish C010 with a complete JSON verdict for every file.

## Phase 1 source-review completion — 25 October 2026 (C008–C016)

- **All nine Phase 1 chunk output files now exist and were confirmed on PR #200:** [C008](evidence/pr200_finish/out_C008.json), [C009](evidence/pr200_finish/out_C009.json), [C010](evidence/pr200_finish/out_C010.json), [C011](evidence/pr200_finish/out_C011.json), [C012](evidence/pr200_finish/out_C012.json), [C013](evidence/pr200_finish/out_C013.json), [C014](evidence/pr200_finish/out_C014.json), [C015](evidence/pr200_finish/out_C015.json), [C016](evidence/pr200_finish/out_C016.json). This closes the defined *Phase 1 file/chunk source-review reporting* scope; it does **not** assert independently proven semantic correctness of all code or runtime safety.
- Batch source-file verdicts: C008=36, C009=24, C010=33, C011=24, C012=37, C013=20, C014=15, C015=24, C016=21; **234 paths added** beyond the prior 1,134 reported. C010–C016 themselves add **174 paths**. Overall: **60/89 chunk reports**, **29 remaining** and F12 web/mobile semantic-parity flow still pending.
- **Expected after regenerating the merge ledger:** 1,368/2,151 = **63.60% agent-reported file-review verdicts**; 1,368/2,149 = **63.66% against frozen remote main**, requiring **760 additional main paths** to reach the *numerical* 99% source-file threshold of 2,128/2,149. The checked-in aggregate `MAIN_RELEASE_FINISH_LEDGER.csv` remains **stale at 1,134**; do not represent 1,368 as an already regenerated ledger or as verified S2/S3 coverage. Run `node docs/qa/evidence/pr200_finish/merge.mjs` from a local checkout, then verify each output ID and count before pushing generated artifacts.
- Eight **new, unconfirmed source-supported P1 candidates in C010–C016**: **C010-N1** ethical draft cross-pharmacy/product reassignment; **C011-N1** duplicate marketplace enquiries under concurrent same-ID requests; **C011-N2** notifications to revoked inviters; **C012-N1** generic membership-application create bypasses active magic link; **C012-N2** generic DELETE erases membership application review records; **C015-N1** AHPRA suspension details sent to out-of-scope region administrators; **C016-N1** pharmacy nonmembers of private hub groups can list groups and memberships; **C016-N2** hub group PATCH can move group across pharmacies. Each includes immutable baseline path/line evidence, scenario and an executable negative test contract in its chunk output. They are **not runtime reproduced, not independently S2-verified, and subject to root-cause deduplication**; prior B01–B71 and earlier F findings remain separately tracked.
- No new distinct C013/C014 findings. Historic/source-confirmed **F03-N1**, **F04-N1**, **F04-N2** remain three source-confirmed but **not runtime-reproduced** P0 candidates in `evidence/pr200_finish/VERIFIED.json`.
- **Next execution priority:** deduplicate the eight new candidates against older B/F issues and independently verify each P1, then continue the 29 unreviewed source chunks and F12; maintain separate S0/S1/S2/S3 metrics, exact SHA testing and release-gate status. No product code, migrations, runtime tests or deploy occurred in Phase 1. **NOT RELEASE READY.**

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

## Phase 3 checkpoint — 25 October 2026

- Finished and committed [C075](evidence/pr200_finish/out_C075.json), 43 Next.js/BFF/public-route source-file verdicts, at frozen application baseline `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Reviewed request-origin validation, header allowlisting and cache prevention in `platform-proxy.ts`, browser CSRF/token refresh/logout, and Next public shift/OTP/account pages. No additional novel candidate established; linked historical B43 and F11-N3.
- **75/89** chunk reports now complete, **14** remain, with F12 still outstanding. Expected post-merge S1 file tally **1,826/2,151 (84.89%)**; generated CSV is still stale and has not been recomputed. No S2 independent assurance, S3 runtime tests, or production source modification. PR remains draft and NOT RELEASE READY.


## 25 October 2026 — new bounded Next clinical and F12 parity evidence, plus C086 S1

- [Next clinical release gate and BFF/ethical UI trace](MAIN_RELEASE_NEXT_CALCULATOR_BOUNDARY_REVIEW_20261025.md) committed. Public dosing exposure and lack of independent clinical sign-off are source-supported; incorrect doses and harm are NOT proven. Candidate P1 release-governance action only; requires negative/positive tests and independent clinical validation.
- [F12 Vite/Next/Expo parity worklog](MAIN_RELEASE_F12_PARITY_WORKLOG_20261025.md) committed, covering partially traced counter-offer, chat, invoice, clocking and accept/cancel call paths. F12 remains INCOMPLETE; do not claim web/mobile semantic equivalence or executed E2E.
- [C086](evidence/pr200_finish/out_C086.json) commits two first-pass S1 verdicts for design-skill validators and associated test source: **76/89 output chunks; 13 pending**. Expected source-file reports after aggregate rebuild **1,828/2,151 = 84.98%**; existing CSV remains stale and this is **not a measured regenerated figure**. Remaining assigned paths 323. Whole-file S2 and S3 new certifications **zero**; no test run and no product source change.
- P0 candidates F03-N1/F04-N1/F04-N2 still CONFIRMED_SOURCE only; retain B01–B71 and C/F findings. PR draft and NOT RELEASE READY.


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


## 25 October 2026 — high-risk audit continuation and actual CI release gate

- Source-audit-only commit `005e3977357d1bd3ecccfdbf56dbd91f122adf30`, frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Rechecked ten existing B-series high-risk candidates **B03/B06/B07/B15/B29/B33/B36/B68/B69/B70**, with exact source calls, positive and negative test contracts and qualified status. See [senior challenge report](MAIN_RELEASE_HIGH_RISK_SOURCE_CHALLENGE_20261025.md). No new duplicate finding IDs.
- `SOURCE_CHALLENGE_20261025.json` contains **30** challenged entries: 24 source-supported, 4 source-supported with qualification, one duplicate-root and one refuted. All source reviews here by the same assistant; **0 new independent second-agent P1 sign-offs and 0 exploit reproductions**.
- **Refutation:** Next `dedicated_user` handoff is protected by backend `protect_direct_booking`, `announce_posted_shift` and `announce_availability_matches`. The old narrow 'general notify flags leak direct booking to other staff' subclaim is contradicted by code; do NOT treat every booking path or user flow as signed off.
- **Actual GitHub CI checked:** [Shared Core Consolidation run](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40166190041) on audit commit `c8fe2c8e` completed **FAILURE** (mobile dependency gate and release-gate). Backend, PostgreSQL concurrency, kiosk, Vite, Next, shared-core, architectural and boundary checks passed in that run; CodeQL and public repository secret scan succeeded; native iOS acceptance skipped. Passing general CI does not clear the historical P0s.
- **Mobile blocker:** npm's advisory `GHSA-w74x-v6f9-j3xg` reported at `frontend_mobile/scripts/verify-dependency-security.cjs` against locked `fast-uri@3.1.8` (dependency via Expo `ajv`; patched 3.x version 3.1.9). This establishes failing CI and the remediation requirement, **not live app exploitation**. Structured data: [CI_GATE_OBSERVED_20261025.json](evidence/pr200_finish/CI_GATE_OBSERVED_20261025.json).
- Coverage stays split: **S0 source inventory complete; S1 source paths reconciled 2,151 but not all deep semantic; S2 independent 99% unproven; S3 targeted payment/tenant/browser/native acceptance unexecuted by this audit**. NO-GO; no code, migrations, deployment, merge, or payment touched.


## PR200 isolated red-test reproduction — 25 October 2026

**Executed [GitHub Actions PR200 audit test workflow](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40169055953) on exact PR head `d9a278031c251584589aa5f20b5e9831394d30a9`, frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. 10 tests ran, 8 failed negative assertions, 2 passed positive controls. These eight are **observed failing production-safety contracts** under isolated Django SQLite; not a live attack, real Stripe settlement, or successful release gate. The failure was intentional red-first testing, not infrastructure failure.

- B07 calendar event and note cross-pharmacy PATCH returned HTTP 200.
- B33 unrelated authenticated user created foreign paid invoice via legacy POST: HTTP 201.
- B36 unrelated authenticated user created roster shift in other pharmacy: HTTP 201.
- F04-N2 source-authorized shift PATCH changed target pharmacy and payment_status PAID: HTTP 200.
- B15 synthetic signed Stripe cancellation checkout event called fulfillment finalizer.
- F10-N5 valid ethical application POST produced HTTP 500 due undefined `creating`.
- B06 ordinary staff saw sibling pharmacy work note via org feed; policy scope still needs ratification.

Evidence: [structured runtime run](evidence/pr200_finish/RUNTIME_REPRODUCTION_20261025.json), [VERIFIED](evidence/pr200_finish/VERIFIED.json), [negative contract source](../qa_release/test_pr200_blockers.py). **No application code changed and no remediation completed. NO-GO remains.**


## Phase 5 source verification continuation — 25 October 2026

- Audit-only P0/P1 validation commit `6865b99e3c7ff567e5125d76a01aeaa714715c17` adds five real authenticated negative contracts without modifying product logic or migrations. Exact frozen-main SHA `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`; [workflow run 40174286021](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40174286021) was **IN PROGRESS at inspection; results not yet classified**.
- New contracts: F03-N1 removed pharmacy-admin still active staff must not regain privileges using the old invitation (GET listing AND POST accept); F04-N1 ordinary platform shift can be viewed but member-response/staff directory requires manager authority; F09-N1 deleting a private Hub group must not promote restricted posts into pharmacy-wide audience; B03 offboarding must retain historic chat messages for coworkers. Positive controls exercise owner response visibility and authorised private-group reads.
- Earlier [baseline runtime run 40169055953](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40169055953) demonstrated eight failed negative tests over seven distinct IDs; separate [remediation PR #201](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/201) has 17 green targeted tests on an earlier code SHA. **Do not conflate the fix-branch green tests with source-baseline S3 or declare Phase 5 complete.**
- SOURCE_CHALLENGE currently has 30 challenged entries, 155 C/F candidate rows are in canonical raw findings, plus historical B01–B71. Most P1 candidate records still lack independent verification or runtime contracts. S0 static 2,149/2,149; S1 ledger 2,151 unique (including two audit scripts); S2 cannot honestly be expressed as 99% independent; S3 bounded baseline HTTP/SQLite only. F12 fourteen source comparisons are not native/Next/Vite runtime parity.
- Phase 5 gate remains **OPEN** pending full P1/root-cause reconciliation, negative/positive checks, per-domain independently verified S2 coverage, definitive test classifications, and corrected canonical status counts. **Release NO-GO.**


## Phase 5 verified RED findings — 25 October 2026

- [PR200 run 40174286021](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40174286021) against frozen main yielded **20 Django tests: 12 failing negative assertions, 1 fixture ERROR and 7 passes**. The 8 older failures remain. New verified F03-N1 (both GET/POST old admin invite), F04-N1 (outsider member-status disclosure), F09-N1 (private group deletion widens pharmacy feed) all reproduced in SQLite HTTP tests.
- B03 chat-retention test was **TEST_INFRA_BLOCKED** by a unique pharmacy conversation fixture, not classified as reproduced. Fixed the test fixture on separate audit commit `13661c46ff9b82699ece08713a2b2bfac1fd7511`; rerun pending.
- These findings are baseline red tests and not production attacks. They do not establish whole-repository 99% independent S2. Phase 5 still open for unresolved P1s and root checks.


## Phase 5 B03 retention fixture corrected and reproduced — 25 October 2026

- [Baseline frozen-main rerun 40174581937](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40174581937) used a corrected chat-room fixture (not conflicting with unique pharmacy community chat) and ran **20 tests, 13 failed negative assertions and 7 passed controls**; **zero fixture errors**.
- New distinct runtime evidence B03: approved staff-membership deletion erased that worker's existing chat messages through Message.sender CASCADE. Historical chat retention is broken in the isolated SQLite workflow. This is a baseline finding, not a claim of a real production incident. F03-N1 two scenarios, F04-N1 and F09-N1 remain red.
- Counting unique baseline source findings with S3 isolated runtime reproductions in this recorded battery: **11 IDs across 13 failed negative tests** (B03/B06/B07/B15/B33/B36/F03-N1/F04-N1/F04-N2/F09-N1/F10-N5). Most other P1 findings still source-only. Phase 5 remains incomplete; do not claim 99% S2.
