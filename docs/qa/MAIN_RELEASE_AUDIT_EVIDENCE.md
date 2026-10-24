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
