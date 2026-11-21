# Independent senior audit — PR #267 Grill Me (2026-11-21)

**Status:** REVIEWED WITH REQUIRED CORRECTIONS; **not launch-signed-off**. This is a docs-only audit at PR #267 original head `58e9db8a0a91a6c649d4e66209f91c10f491ef85`, traced application head PR #249 `97c4543e051b43fe30ec7e2e61ad3d69957a918e`; consult PR history for later docs edits. No production tests were executed by this reviewer. Treat source-level findings, proposals and runtime acceptance separately.

## 1. What was independently checked

- Read PR #267 metadata (draft/open, base main, 43 files, +13,305 lines originally), exact 43-file list, 26 area documents, 15 senior-review records, README and consolidated queue.
- Read Issue #250's definition of review and historical #184 142-question JSON (confirmed exactly **142 unique question IDs** and **30 carried owner decisions**); checked the shift-lifecycle `OWNER_DECISION_REGISTER.md` and main release-decision register.
- Read relevant source at PR #249 pinned head: `backend/workforce/roster/worker_actions.py`, `backend/billing/checkout_reservations.py`, `backend/shifts/posting.py`, `backend/shifts/interest.py`, `backend/talent/serializers/explorer.py`, `backend/billing/shift_payments.py`.
- Compared PR #249 head against later PR #257 head `ad01356ee4689c8afaafc3028b5571c45101d925`: GitHub comparison reports **220 commits ahead**, **0 behind**, with mobile, backend, shared-core and web changes. PR #257 is NOT merged; its source should be assessed as an integration candidate, not production. PR #260 also carries chat fixes; PR #261 native CI remediation and #262 evidence ledger remain separate. No claim that #257 contains every later PR is implied.
- The ordinary Git checkout from this review container could not resolve GitHub; direct linked GitHub reads succeeded. CI was **not rerun** here. On PR #267's original head, GitHub API returned CodeQL and public security successes, Shared Core Consolidation in progress and three skipped runs. Combined-status API returned no individual statuses; this **does not mean all release gates passed**.

## 2. Verdict for all 26 areas (document coverage, NOT release sign-off)

| Area | Assessment | Required closure before OWNER DECIDED / release verification |
|---|---|---|
| GM-01 Auth | Substantial backend + client trace; partly verified | Session duration inversion; logout/refresh races; mobile OTP; actual Next deployment; synthetic session and denied-role tests |
| GM-02 Worker onboarding | Partial client inspection; 429 caveat explicit | Refresh mobile onboarding and credential status under later combined mobile head; enforce current AHPRA at external booking actions |
| GM-03 Owner/pharmacy setup | Core trace, Next unknown | Verify backend pharmacy public-posting/ABN gate; form parity; no implicit onboarding bypass; real group setup journey |
| GM-04 Organisations | Source-level structure verified, claims API unknown | Claim acceptance, membership scoping, cross-site authority, cumulative earlier-tier visibility and region-role permissions |
| GM-05 Membership/invites | Comprehensive questions, mobile Q16/Q17 unverified | Targeted mobile screens, role matrix, invite expiry/revocation, manager vs owner, three-pharmacy cap |
| GM-06 Employment/leave | Backend evidence, client screens uninspected | Leave-approved effect on shifts; approved date-range overlap; employment end; privacy and junior Award test cases |
| GM-07 Roster/cover/swap | R04C target-consent violation confirmed | Implement existing R04A/R04C/R06 decisions without reopening; concurrency, target decline, manager approval and notifications |
| GM-08 Attendance/kiosk | Trace and QR scope, native live proof absent | PIN/offline replay/clock-skew, no-show, provisional approvals, worker/manager/locum, cross-device physical journey |
| GM-09 Timesheets/payroll | Builder uses minutes, money path unresolved | Payer ownership, hours freeze, correction/reconciliation, paid breaks, TFN access, tenant-safe exports |
| GM-10 Posting/rates | `Decimal('0.00')` fallback independently confirmed | Nonzero payable rate validation in actual serializer/publishing path, timezone/DST, total cost and edit/withdraw |
| GM-11 Audience/escalation | Lazy escalation and stopping noted | Deterministic scheduler; earlier audience retention per approved E01A; notified-on-escalation; resume after declined interests |
| GM-12 Interest/offers | Strong backend trace, screens partial | Acceptance-stage re-verification, concurrent selection, expiry at start, competing offers, role/tenant/payment states |
| GM-13 Reservation/payment | Stripe provider expiry confirmed; **D02/D03 not implemented** | Implement approved deadline schedule, same-audience release, payment/webhook replay and reconciliation test |
| GM-14 Terms/Award/GST/super | Financial/legal model partially traced | Pharmacy+worker versioned acceptance, employment-classification legal review, super/GST/invoicing, award-update ownership |
| GM-15 Cancellation/disputes | Broad trace and 49 questions | Separate fee, worker compensation, platform charge, decision/appeal, no-show, ledger and legally reviewed cancellation terms |
| GM-16 Subscriptions/Pills | Broad but live Stripe values unknown | Actual configured prices/discounts, subscription lapse, pay card total, credits, GST, refund and charge switches |
| GM-17 Invoices/refunds | Broad and honest about no live payment run | Idempotent paid/void/credit-note/refund paths, tax invoice requirements, reconciliation, invoice authorisation |
| GM-18 Talent/recruitment | **INCOMPLETE PRIMARY DELIVERABLE** | Reconstruct the missing full worker trace with per-question alternatives/evidence; the 39-line senior-review summary does not replace it |
| GM-19 Availability/matching | Substantial verification but missing caller details | Conflict with booked/leave time, multi-slot matching, permissions, timezone, snapshot consistency |
| GM-20 Chat/hubs | Broad trace, but changes in later PR #257/#260 | Rebase chat claims on latest candidate, revoked participant/room access, unread pagination, attachments and moderation |
| GM-21 Goods/ethical marketplace | Broad read, but backend and Next changed later | Revalidate later M4 changes (PR #257), stock/hold lifecycle, moderation, identity, prohibited products, fulfillment |
| GM-22 Notifications/rewards | Broad read with residual search-only claims | Per-event recipient matrix, anonymised pharmacy notices, delivery/outbox, retries, quiet hours, stale notices and cross-tenant tests |
| GM-23 Calendars/operations | Broad time/availability analysis | Pharmacy-local scheduling, DST incl. Broken Hill, approved leave, recurrence weekday mismatch and both calendar views |
| GM-24 Explorer/public | Broad trace, some screens uninspected | Unverified Explorer dead-ends, underage identity, anonymous public board, live sitemap/share links and moderation |
| GM-25 Vite/Next/Expo parity | **PARTIAL**: structural and some file trace | Revalidate #257 and #260, physical iOS/Android, correct route inventory, 10 UI states and accessible 1.6x text |
| GM-26 Admin/privacy/release | **PARTIAL**: many questions NOT RE-VALIDATED | B62–B65 negative tests, B64 fix, full admin audit trail, data deletion/retention, production env, penetration test, CI, staging/device rollout |

**Verdict conventions:** “broad” means documentation and cited source exist, not that complete normal/failure/concurrent web+Expo tests passed. A PR, a test file's existence, a green typecheck or a senior-review “PASS” does not substitute for a run at an exact commit.

## 3. Confirmed correctness errors in the previous consolidated queue (corrected there)

1. **Approval versus implementation is conflated.** Previously approved R04A, R04C, R06 and E01A were incorrectly labelled as superseded when code fails them. A broken implementation **cannot revoke an owner decision**. Treat as APPROVED + IMPLEMENTATION GAP, with acceptance tests. Only a subsequent explicit owner-approved change may supersede the rule.
2. **D02/D03 wrongly returned to the owner's question queue.** D02 approved windows are 24h / 6h / 2h / 30min capped at start. D03 requires same-audience release, notices and no penalty. `checkout_reservations.py` stores provider session expiry but not D02. Build/verify rather than asking the same question anew.
3. **Question count is overstated as independently deduplicated.** 540 - 16 = 524 is arithmetically true, but 524 is NOT a verified unique count after all cross-area repetitions and adopted questions. Example: GM-19 availability questions recur as GM-23 references; verification, Explorer and privacy questions repeat in GM-02/05/24/26. Canonical-ID graph is required.
4. **Stale local paths and scaffold text.** Status table linked to `~/workspace/...` locations not available to a reviewer, and the consolidated file claimed no PR existed after PR #267 was opened. Repository-relative links and PR status are corrected in the queue.
5. **GM-18 missing primary source.** Area file is a 39-line copy of senior review; 26 full original question records are absent. Mark INCOMPLETE rather than calling all 26 per-question traces present.
6. **Later mobile integration is outside the stated traced snapshot.** PR #257 is ahead of #249 by 220 commits and changes shift posting, candidates, chat, marketplace, web and shared-core. Do not claim #249's observed parity defects necessarily persist or were resolved in #257 without re-reading both.
7. **GM-25 and GM-26 “PASS” labels overstate residual verification.** More accurate verdict: DOCUMENTATION REVIEWED / PARTIAL SOURCE-VERIFIED / RELEASE TESTS OPEN.
8. **“Next parity” needs a route-purpose matrix.** Next public landing pages need not implement authenticated owner dashboards when Vite owns them; decide canonical surfaces first and test that navigation/handoff is explicit, not pixel-for-pixel duplication.
9. **Money and legal rules need a stop gate.** Legacy cancellation charge route `charge_penalty` exists and computes 10/20% but calls `assert_can_create_shift_charge("cancellation")`. Check production capability and consumer-facing disclosure; a route existing does not mean charges are currently enabled.
10. **Read-only evidence cannot certify CI/physical tests or production configuration.** Recorded environment/Stripe/AHPRA/Expo values are unknown until staging/production verification. No production release approval inferred.

## 4. Missing review deliverables / concrete actions

### P0: fix documentation and evidence
- Publish `OWNER_DECISION_LEDGER.md` with source, effective date/context, status and rule-owner; mark historical 30 decisions APPROVED, not “OPEN”.
- Recover/reconstruct GM-18 primary trace with the full format and cite the exact head.
- Reconcile all 540 entries via canonical IDs and cross-references: **owner decision question**, **already-approved policy**, **source mismatch**, **verification item** or **referenced copy**. Recalculate genuinely unanswered count; don't silently drop unique questions.
- Create evidence deltas for PR #257/#260 and relevant #261/#262 testing claims, including exact commit. Reinspect changed backend/client files and reconcile GM-10/12/18/20/21/25 before asking.
- Finish the explicitly NOT RE-VALIDATED GM-02/05/22/25/26 items. A single historical source file or default-branch code-search hit is not exact-head verification.
- Link every status-table row to a repo file (already corrected in queue). Build a machine-readable decision map and mark owner answers separately from implementation work when interview begins.

### P0: launch-condition verification (separate implementation programme, **not authorised in this docs PR**)
- Talent anonymity: field-level server-side redaction in authenticated/public feeds, free-text PII moderation, test roles/tenant/age.
- Verified/AHPRA gates: check at irreversible acceptance/booking, including favourite/member/direct offers; re-evaluate expired/suspended status and define failure recovery.
- Payments: D02/D03 independent server deadline; cancel/checkouts; idempotent webhook and expiry races, late payment, orphaned attempts, refunds and reconciliation.
- Money integrity: nonzero fixed rate, correct super/GST/award handling, accepted versioned terms, worker consent for transfers, privacy.
- Native CI + staging + device: exact-head pipeline, Android+iOS from install to payment return/QR/auth/logout/offline, 10 mandatory UI states, accessibility, slow connection and notification permission denied.

### P1: strengthen workflow completeness
- Each functional workflow should have unique ID, actual backend authority, Vite/Next/Expo availability, normal/denied/duplicate/concurrent/offline states, data mutations, emails/push, rollback, owner decision ID, linked test IDs and last verified SHA.
- Add explicit role matrix: OWNER vs MANAGER vs PHARMACY_ADMIN vs ORG_STAFF vs REGION_ADMIN vs PHARMACIST vs OTHER_STAFF vs EXPLORER and employed vs external. Cover selected-pharmacy switch and cross-tenant isolation.
- Add pharmacy setup UX question only if missing from GM-03/05/23: owner-configurable “Build My Own” dashboard/features (roster, timesheets, chat, favourites, escalation, marketplace, invoicing); defaults and role permissions must be consistent across web/Expo.
- Add explicit source of truth for public-holiday calendars, state/council-specific dates, pharmacy-timezone and Award rate snapshot for overnight/multi-date shifts; do not use user's device timezone for the legal work date without a policy decision.
- Do not redesign existing architecture under this Grill. Keep shared-core business transport and device-specific native adapters unless a concrete reproducible defect demands change.

## 5. Recommended owner interview protocol

1. First show owner LAUNCH-01 with current no-go gates and a realistic limited/browse-only option. No “launch at any risk” default.
2. Next ask only *genuinely unanswered* priority questions, after highlighting the historical approved rule and why it is not being asked again.
3. For each answer save: canonical question ID; exact answer/option/owner words; source link; timestamp; product surface; affected roles; acceptance-test scenarios; conflicting decisions; effective version.
4. If source mismatches an existing approved rule, record a defect and test first; **do not transform it into a new policy decision**. The owner may explicitly request a new policy separately.
5. Issue #250 finishes only after every area has an explicit status: decided/deferred, fix backlog accepted, web/Expo evidence or stated release exclusion, and no untracked P0 risk. This docs PR is an input to that work, not the finished Grill.

## 6. Precise provenance

- Docs PR: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/267 (original head `58e9db8a0a91a6c649d4e66209f91c10f491ef85`)
- Source head audited: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/tree/97c4543e051b43fe30ec7e2e61ad3d69957a918e
- Later candidate: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/257 (`ad01356e...` at time checked; still draft, based on its own integration branch)
- Separate chat fix: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/260 (`ad01356e...`)
- Existing owner decisions: `docs/qa/shift-lifecycle/OWNER_DECISION_REGISTER.md` at PR #184 history; original question sources PR #184.
- Release evidence register: `docs/qa/RELEASE_DECISIONS_20261102.md` at main; draft PR #200 no-go.
