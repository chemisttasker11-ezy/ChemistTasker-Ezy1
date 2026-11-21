# ChemistTasker Grill Me — consolidated queue (Issue #250)

**Status: READY FOR PARENT'S OWN FINAL REVIEW — not yet shown to the owner, no PR/branch created.**
**Head traced:** PR #249 API head `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (`fix/pr248-expo-production-waves-20261104`, open draft). The PR body text naming a "working head `26cae2d6`" is the short SHA of the last listed implementation commit, not the branch head — every area traced at `97c4543e`.
**Method:** 26 areas traced area by area (backend → Vite → Next → Expo, file/function/test/commit per claim), old #184 questions re-validated against current code before being asked, senior-reviewed (worker areas by the coordinator, re-run areas by the coordinator with independent spot-checks at head). Documentation/decisions only — no code changed.
**Bases:** main `8ccf8f7` (last commit 3 Nov 2026), PR #249 head `97c4543e`.

## 1. Per-area status table — all 26 areas

| Area | Status | Qs | First question (ask this first) | Deliverable file |
|---|---|---|---|---|
| GM-01 Sessions/auth | Traced + senior-reviewed (corrections applied) | 19 | GM01-Q04 — must a worker verify mobile before browsing anything? | `~/workspace/proactivity/chemisttasker-grill-gm01.md` |
| GM-02 Worker onboarding/credentials | Traced + senior-reviewed (pass with corrections) | 24 (22 OPEN, 1 SETTLED ON-Q10, 1 UNVERIFIED ON-Q15) | ON-P03 — which AHPRA lookup runs at launch? | `~/workspace/grill-gm02/GM-02-worker-onboarding-credentials.md` |
| GM-03 Pharmacy/owner setup | Traced + senior-reviewed (pass with corrections) | 12 | GM-03-Q01 — what must a pharmacy pass before posting to outside workers? | `~/workspace/chemisttasker-gm03-pharmacy-owner-setup.md` |
| GM-04 Organisations/chains/regions | Traced (re-run) + senior-reviewed PASS | 12 | GM-04-Q01 — how do organisations join? | `~/workspace/GM-04-organisations-chains-regions.md` |
| GM-05 Roles/membership/invites | Traced + senior-reviewed (pass with corrections) | 19 (16 OPEN, 2 NOT VERIFIED Q-16/Q-17, 1 code invariant Q-19) | Q-01 — should favourite locums be exempt from the AHPRA check on public shifts? | `~/workspace/chemisttasker-grill/gm-05-roles-membership-invites.md` |
| GM-06 Employment/leave | Traced (re-run) + senior-reviewed PASS | 9 | GM-06-Q06 — when leave is approved, what happens to the rostered shift? | `~/workspace/GM-06-employment-leave.md` |
| GM-07 Internal roster/cover/swap | Traced (re-run) + senior-reviewed PASS | 10 | GM-07-Q04 — must the swap/cover target accept before the manager approves? | `~/workspace/GM-07-internal-roster-cover-swap.md` |
| GM-08 Attendance/kiosk | Traced (re-run) + senior-reviewed PASS | 11 | GM-08-Q01 — who may clock in; may a verified locum with no booking walk in and work? | `~/workspace/gm08-attendance-kiosk-trace-BLOCKED-rate-limit.md` |
| GM-09 Timesheet/payroll | Traced (re-run) + senior-reviewed PASS | 10 | Q1 — who pays whom, and when? | `~/workspace/chemisttasker-grill-gm09/GM-09-timesheet-payroll.md` |
| GM-10 Shift posting/rates | Traced (re-run) + senior-reviewed PASS | 12 | GM-10-Q03 — fixed vs negotiable rate | `~/workspace/GM-10-shift-posting-rates.md` |
| GM-11 Audience/escalation | Traced (re-run) + senior-reviewed PASS | 13 | GM-11-Q01 — who is told on escalation, and when does it stop? | `~/workspace/goals/chemisttasker-grill-me/files/GM-11-audience-escalation-trace.md` |
| GM-12 Interest/offers | Traced (re-run) + senior-reviewed PASS | 26 | GM-12-Q01 — where must Verified + current AHPRA be enforced? | `~/workspace/grill-me/GM-12-interest-offers.md` |
| GM-13 Reservation/payment confirmation | Traced (re-run) + senior-reviewed PASS WITH NOTE | 13 | GM13-Q01 — D02 pay-by window does not exist; build D02 as decided | `~/workspace/grill-me-gm13-reservation-payment.md` |
| GM-14 Terms/Award/GST/super | Traced (re-run) + senior-reviewed PASS | 12 | GM14-Q03 — does the pharmacy accept the same agreement? | `~/workspace/chemisttasker-grill/GM-14-terms-award-gst-super.md` |
| GM-15 Cancellation/disputes/ratings | Traced + senior-reviewed PASS | 49 | GM15-01 — what cancellation can launch, given fees are not yet enforceable? | `~/workspace/grill-me/gm-15-cancellation-disputes-ratings.md` |
| GM-16 Subscriptions/Pills/fees | Traced (re-run) + senior-reviewed PASS | 18 | GM16-Q01-FIRST — confirm launch price table exactly as coded | `~/workspace/grill-me-gm16-subscriptions-pills-fees.md` |
| GM-17 Invoices/refunds | Traced + senior-reviewed PASS | 18 | GM17-Q01 — when a pharmacy cancels a paid booking, cash refund, platform credit, or nothing? | `~/workspace/grill-gm17-invoices-refunds.md` |
| GM-18 Talent/recruitment | Traced + senior-reviewed PASS | 26 | GM-18-Q01 — who can see the talent board? | See note † below |
| GM-19 Availability/matching | Traced (re-run) + senior-reviewed PASS | 13 | GM-19-Q03 — when does availability "match" a shift? | `~/workspace/grill-me/GM-19-availability-matching.md` |
| GM-20 Chat/Hubs | Traced + senior-reviewed PASS | 19 | GM20-Q01 — who can start a direct chat with whom? | `~/workspace/grill-gm20-chat-hubs.md` |
| GM-21 Ordinary/ethical marketplace | Traced (re-run) + senior-reviewed PASS | 20 | GM21-Q01 — launch scope (merged into LAUNCH-01, §2.1) | `~/workspace/grill-gm21/GM-21-ordinary-ethical-marketplace.md` |
| GM-22 Notifications/rewards | Traced (re-run) + senior-reviewed PASS | 28 (Q07, Q15 NOT RE-VALIDATED; Q03 partial) | GM22-04 — which channels carry those notices? | `~/workspace/goals/chemisttasker-grill-me/files/GM-22-notifications-rewards-trace.md` |
| GM-23 Calendars/operations | Traced (re-run) + senior-reviewed PASS | 29 | GM-23-01 — is the worker availability calendar the single live source of truth? (alt first: GM-23-23 timezone) | `~/workspace/grill-me/gm-23-calendars-operations.md` |
| GM-24 Explorer/public | Traced + senior-reviewed PASS | 32 | GM-24-Q01 — what can Explorers ("new to pharmacy") do with shifts? | `~/workspace/grill-me/gm-24-explorer-public.md` |
| GM-25 Web/Next/Expo parity/UX | Traced (re-run) + senior-reviewed PASS | 38 (C05, C06, C07, C10, C17, C18 NOT RE-VALIDATED) | GM25-Q01 — launch cut (merged into LAUNCH-01, §2.1) | `~/workspace/grill-me/GM-25-web-next-expo-parity.md` |
| GM-26 Admin/privacy/security/release | Traced (re-run) + senior-reviewed PASS WITH NOTE | 48 (Q07, Q12–Q20, Q22–Q26, Q33 NOT RE-VALIDATED; Q43 pentest UNKNOWN) | GM26-Q36 — launch cut (merged into LAUNCH-01, §2.1) | `~/workspace/grill-me/GM-26-admin-privacy-security-release.md` |

**Totals:** 540 questions as written across the 26 area files; **524 unique questions after de-duplication (§3)**. All OPEN; no owner decisions recorded for any question yet (except GM-02 ON-Q10 SETTLED by code, and GM-05 Q-19 which is a code invariant to confirm only, not a decision).

† GM-18: senior-review file is `~/workspace/chemisttasker-grill/senior-review-gm18-talent-recruitment.md` (verified findings, 26 questions GM-18-Q01–Q26). The worker trace file path was not recovered in this consolidation pass — locate it before the PR so the file index is complete.

**Senior-review records:**
- GM-01 corrections: `~/workspace/proactivity/chemisttasker-grill-gm01.md` (applied; see §4).
- GM-02: `~/workspace/chemisttasker-grill/senior-review-gm02-worker-onboarding-credentials.md`
- GM-03: `~/workspace/chemisttasker-grill/senior-review-gm03-pharmacy-owner-setup.md`
- GM-05: `~/workspace/chemisttasker-grill/senior-review-gm05-roles-membership-invites.md`
- GM-15: `~/workspace/chemisttasker-grill/senior-review-gm15-cancellation-disputes-ratings.md`
- GM-17: `~/workspace/chemisttasker-grill/senior-review-gm17-invoices-refunds.md`
- GM-18: `~/workspace/chemisttasker-grill/senior-review-gm18-talent-recruitment.md`
- GM-20: `~/workspace/chemisttasker-grill/senior-review-gm20-chat-hubs.md`
- GM-24: `~/workspace/chemisttasker-grill/senior-review-gm24-explorer-public.md`
- Re-run areas GM-04/06/07/08/09/10/11/12/13/14/16/19: `~/workspace/chemisttasker-grill/senior-review-rerun-areas-gm04-19.md` (11 PASS, 1 PASS WITH NOTE — GM-13)
- Re-run areas GM-21/22/23/25/26: `~/workspace/chemisttasker-grill/senior-review-rerun-areas-gm21-26.md` (4 PASS, 1 PASS WITH NOTE — GM-26)

## 2. Conflict resolutions — 12 single owner questions (no duplicates, no competing recommendations)

### 2.1 LAUNCH-01 — the single launch decision (merges GM21-Q01 + GM25-Q01 + GM26-Q36)

**Question:** What launches, on which surfaces, and only after which gates?
**Owner:** GM-26 (release gate) — record the answer in GM-21 and GM-25 ledgers too; do not ask GM21-Q01, GM25-Q01 or GM26-Q36 separately.
**Current behaviour:** PR #200 (draft, 24 Oct) audit says PRODUCTION NO-GO; Issue #250 open; CI red on main; staging deploys queued since October (PR #167, no self-hosted runner); marketplace is a read-only public catalogue at defaults with no payment path; Expo pays via `Linking.openURL` to Stripe Checkout with the return-to-app leg unverified; 480-file mobile rewrite (PR #248) unmerged.
**Recommendation (single):** A — no launch until the NO-GO is cleared; then Vite web + Next public first, Expo after Senior Package Testing, marketplace deferred from the launch cut.
**Options:** A (recommended) — no launch until NO-GO cleared, then Vite + Next public first, marketplace deferred, Expo after package testing. B — browse-only early access (no bookings, no payments). C — bookings live with manual/off-platform charges. D — full launch with recorded risk acceptance.
**Why one question:** GM-21's "defer marketplace", GM-25's "Vite + Next first, Expo after", and GM-26's "no launch until NO-GO cleared" are components of one decision, not three. Asking them separately could produce three answers that cannot all be true.

### 2.2 OFFER-01 — firm offer vs enquiry (merges GM-18-Q07 + GM-24-Q14 / TB-Q07)

**Question:** When a pharmacy contacts a talent-board worker, is it a firm offer or an enquiry/chat first?
**Owner:** GM-18 + GM-24 jointly — record the answer in both ledgers; do not ask GM18-Q07 and GM24-Q14 separately.
**Conflict:** GM-18-Q07 recommended KEEP the firm offer; GM-24-Q14 (TB-06/TB-Q07) recommended B — enquiry/chat first, then offer. Both cannot be the recommendation.
**Recommendation (single):** C — enquiry/chat first for public-board contacts, firm offer for favourites/members (keeps the GM-18 firm-offer mechanism for trusted relationships, adopts the GM-24 enquiry-first protection where identity is not yet established). The GM-18 and GM-24 files' recommendations are superseded by this one; their evidence (48h flat expiry, one offer per slot, identity leak) stands.
**Options:** A — keep firm offer everywhere (GM-18's original). B — enquiry/chat first everywhere, then offer (GM-24's original). C (recommended) — enquiry first on public contacts, firm offer for favourites/members. D — offer only after an availability check passes.

### 2.3 AHPRA-FAV-01 — favourite locums and the AHPRA check (merges GM-05 Q-01 + GM-02 ON-P01)

**Question:** Should favourite locums be exempt from the AHPRA check on public shifts?
**Owner:** GM-05 (Q-01 framing) — record the answer in GM-02 (ON-P01); do not ask twice.
**Recommendation:** A — employees exempt, favourites checked.
**Options:** A (recommended) — employees exempt, favourites checked. B — favourites exempt like employees. C — everyone checked, no exemptions.

### 2.4 PHARM-GATE-01 — pharmacy posting gate (merges GM-02 ON-Q11/Q13/Q14 into GM-03 Q01/Q03/Q04)

**Question:** What must a pharmacy pass before posting to outside workers — and what is checked when?
**Owner:** GM-03 (Q01/Q03/Q04 framing) — GM-02's ON-Q11/Q13/Q14 cross-reference this answer; do not ask in GM-02 framing.
**Current behaviour:** `post_shift()` checks neither `Pharmacy.verified` nor `abn_verified`; $0.00 FIXED-rate fallback; `lookup_abn` always returns `abn_verified: False`.
**Recommendation:** D — ABN for chain/org, ABN + admin check for public.

### 2.5 REFUND-01 — refund vs credit on cancellation (merges GM-17 Q01/Q02/Q04/Q05 + GM-15 Q19–Q22)

**Question:** When a pharmacy cancels a paid booking, does it get its booking fee back — cash refund, platform credit, or nothing?
**Owner:** GM-17 (Q01) — GM-15 Q19–Q22 adopt this answer; do not ask in GM-15 framing.
**Recommendation:** C — refund over 72h, credit inside (launch-gating).
**Options:** A — cash refund always. B — platform credit always. C (recommended) — refund over 72h, credit inside. D — nothing, fee is kept.

### 2.6 ACCEPT-01 — pharmacy acceptance of the agreement (merges GM-14-Q03 + GM-16-Q18)

**Question:** Does the pharmacy accept the same agreement the worker accepts, and is that acceptance logged?
**Owner:** GM-14 (Q03 framing) — GM-16 Q18 adopts this answer.
**Current behaviour:** zero pharmacy-acceptance patterns in `backend/shifts/engagement.py`; super notice present, `super_review_required: True`, `super_payable_confirmed: False` always.
**Recommendation:** A — yes, when it sends/approves, logged with time + version.

### 2.7 VERIFY-GATE-01 — where Verified + current AHPRA are enforced (merges GM-11-Q11 + GM-12-Q01)

**Question:** Where must Verified + current AHPRA be enforced — at posting, at interest, at offer, or at acceptance?
**Owner:** GM-12 (Q01 framing, proven end-to-end) — GM-11 Q11 records the same answer.
**Current behaviour:** the Q01 hole is proven end-to-end (adopted GM-02/GM-05 verified verdicts); match emails are PLATFORM-only; no Verified filter on match alerts.

### 2.8 AUDIENCE-01 — who can see the talent board and contact workers (merges GM-18-Q01 + GM-20 TB-Q02)

**Question:** Who can see the talent board, and who may contact a worker from it?
**Owner:** GM-18 (Q01 framing) — GM-20 TB-Q02 records the same answer; decide jointly, because the contact rule is the same decision as the visibility rule.
**Current behaviour:** identity leak (P0) — `ExplorerPostReadSerializer` exposes `explorer_name`, `author_user_id`, `explorer_user_id`; write serializer has no scrubbing.
**Recommendation:** B — employers + own post only, plus public masked, server-side enforced.

### 2.9 MOBILE-PARITY-01 — mobile onboarding parity (merges GM-02 ON-Q15 + GM-03-Q05 + GM-05 Q-16)

**Question:** What onboarding/parity must the mobile app provide that the web app already does, and in which order is it verified?
**Owner:** GM-02 (ON-Q15 framing) — GM-03 Q05 and GM-05 Q-16 cross-reference; ask once, after ONE joint re-inspection pass (GM-05 backlog B-17 is the vehicle), not three separate passes.
**Status:** all three are currently NOT VERIFIED / NOT RE-VALIDATED — do not ask until the joint pass is done.

### 2.10 RATE-01 — rate rule, Award floor, payer model (sequencing, not a merge)

**Question:** Is the shift rate fixed or negotiable, and against what floor?
**Owner:** GM-10 (Q03/Q12) — but ask only AFTER GM-09-Q01 (who pays whom, and when?) and the GM-14 Award floor (MA000012, hard-coded rates) are decided. The rate rule cannot be answered before the payer model and the Award floor are known.
**Current behaviour:** FIXED shift can be created at $0.00 (`posting.py`: `validated_data['fixed_rate'] = default_fixed or weekday_rate or slot_rate or Decimal('0.00')`); no GST anywhere except an unused `gst_registered` flag; no tax invoice.

### 2.11 PAYBY-01 — D02 pay-by window cascade (sequencing, not a merge)

**Question:** What is the pay-by window, and what happens on expiry?
**Owner:** GM-13 (Q01 — build D02 as decided) — decide FIRST; GM-16 Q05/Q07 and GM-19 alert timing adopt it. GM-13's finding (D02 does not exist; LA-P01 still valid and worse — cancel declines `ACCEPTED_AWAITING_PAYMENT` offers but never touches checkout/reservation or Stripe session) cascades to those areas.
**Recommendation:** A — 24h/6h/2h/30min + expiry job + D03.
**Pass-with-note (GM-13):** my own fetch of `backend/billing/checkout_reservations.py` failed (exit 1, cause unknown, not retried); the finding is corroborated three other ways, including my earlier read of `CELERY_BEAT_SCHEDULE` (no expiry/reservation job) and GM-12/GM-19 finding no `reservations.py`. The file should be re-read before the PR.

### 2.12 CARRIED-01 — carried decisions superseded by re-trace (supersession, not a merge)

**Question set:** GM-07 carried R04C/R04A/R06 and GM-15 LA-P01 are superseded by the re-trace — confirm the supersession, do not re-ask the old questions as if they were still open.
**Owner:** GM-07 (Q04 decides R04C: the target never accepts, contradicting carried R04C; R04A has no mechanism — `auto_publish_worker_requests` is read by no backend code; R06 has no "needs cover" display) and GM-15/GM-13 (LA-P01 payment-reset is decided by PAYBY-01 + REFUND-01, §2.11/§2.5).
**Rule applied everywhere:** a carried #184 decision that the re-trace proves false is recorded as SUPERSEDED with its evidence, not re-asked.

### Ownership splits already resolved (not duplicates — recorded so they are not re-raised)

- **GM-22 vs GM-23 (escalation/reminder):** GM-22 owns only notice/channel/recipient decisions; GM-11/GM-23 own the mechanics. GM-22-Q04 is the first GM-22 question on that split.
- **GM-25 C12–C15 adopt GM-18:** C12 STILL VALID, C13 STILL VALID, C14 new shape, C15 STILL VALID — not re-asked.
- **GM-26 Q01–Q05 adopt GM-06/GM-12/GM-13:** not re-asked.
- **GM-05 Q-17 (talent-board booking-permission parity):** NOT VERIFIED — ask after GM-18 Q15 (one hiring-role policy) is decided, not in parallel.
- **GM-17 owns refund-vs-credit:** GM-13/GM-16 adopt GM17-Q01 (see §2.5).

## 3. De-duplication accounting

540 questions as written → **524 unique questions** after 16 merges:

| Merge | Questions merged | Removed |
|---|---|---|
| LAUNCH-01 (§2.1) | GM21-Q01 + GM25-Q01 + GM26-Q36 → 1 | −2 |
| OFFER-01 (§2.2) | GM18-Q07 + GM24-Q14 → 1 | −1 |
| AHPRA-FAV-01 (§2.3) | GM05 Q-01 + GM02 ON-P01 → 1 | −1 |
| PHARM-GATE-01 (§2.4) | GM02 ON-Q11/Q13/Q14 → GM03 Q01/Q03/Q04 | −3 |
| REFUND-01 (§2.5) | GM17 Q01/Q02/Q04/Q05 ↔ GM15 Q19–Q22 → 4 | −4 |
| ACCEPT-01 (§2.6) | GM14-Q03 + GM16-Q18 → 1 | −1 |
| VERIFY-GATE-01 (§2.7) | GM11-Q11 + GM12-Q01 → 1 | −1 |
| AUDIENCE-01 (§2.8) | GM18-Q01 + GM20 TB-Q02 → 1 | −1 |
| MOBILE-PARITY-01 (§2.9) | GM02 ON-Q15 + GM03-Q05 + GM05 Q-16 → 1 | −2 |
| **Total** | | **−16** |

Sequencing dependencies (§2.10 RATE-01, §2.11 PAYBY-01) and supersessions (§2.12 CARRIED-01) remove no questions — they order them.

## 4. GM-01 senior-review corrections — applied to the GM-01 file

Applied to `~/workspace/proactivity/chemisttasker-grill-gm01.md` and verified at head:
(a) CG-05/Q19 downgraded — `MOBILE_OTP_DISPLAY_IN_APP` is code-gated (`backend/core/settings.py:654-658`, `default=DEBUG` AND `APP_ENV` in {local, dev, development, test, staging}), so it cannot be on in production via default; residual risk is staging/local misconfiguration.
(b) OTP lockout constants live in `backend/users/otp.py` (`OTP_MAX_FAILED_ATTEMPTS = 5` at line 14, `OTP_LOCKOUT_MINUTES = 15` at line 17), not `api_otp.py`.
(c) TO-CONFIRM flags kept as-is.
(d) The byte-identical claim is qualified as spot-checked for one file, not a full audit.

## 5. Consolidated ask order (one question at a time in conversation)

Ask the merged questions once, in this dependency order. Each area's remaining questions follow its own first question; the full question text lives in the area file.

1. **LAUNCH-01** (§2.1) — defines what "launch" means; everything else is framed by it.
2. **VERIFY-GATE-01** (§2.7, GM-12-Q01) — where Verified + AHPRA is enforced.
3. **GM01-Q04** — mobile verification before browsing.
4. **ON-P03** (GM-02) — which AHPRA lookup runs at launch.
5. **AUDIENCE-01** (§2.8, GM-18-Q01) — who can see the talent board.
6. **PHARM-GATE-01** (§2.4, GM-03-Q01) — pharmacy posting gate.
7. **AHPRA-FAV-01** (§2.3, GM-05 Q-01) — favourite locums and the AHPRA check.
8. **GM-24-Q01** — what Explorers can do with shifts.
9. **OFFER-01** (§2.2) — firm offer vs enquiry.
10. **PAYBY-01** (§2.11, GM13-Q01) — D02 pay-by window.
11. **REFUND-01** (§2.5, GM17-Q01) — refund vs credit.
12. **GM-09-Q01** — who pays whom, and when?
13. **ACCEPT-01** (§2.6, GM14-Q03) — pharmacy acceptance of the agreement.
14. **RATE-01** (§2.10, GM-10-Q03) — fixed vs negotiable rate (after 12–13).
15. **GM15-01** — what cancellation can launch, given fees are not yet enforceable?
16. **GM16-Q01-FIRST** — confirm launch price table exactly as coded.
17. **GM-04-Q01** — how do organisations join?
18. **GM-06-Q06** — when leave is approved, what happens to the rostered shift?
19. **GM-07-Q04** — must the swap/cover target accept before the manager approves?
20. **GM-08-Q01** — who may clock in; walk-in verified locum?
21. **GM-11-Q01** — who is told on escalation, and when does it stop?
22. **GM-19-Q03** — when does availability "match" a shift?
23. **GM20-Q01** — who can start a direct chat with whom?
24. **GM22-04** — which channels carry those notices?
25. **GM-23-01** — is the worker availability calendar the single live source of truth? (alt: GM-23-23 timezone)
26. **MOBILE-PARITY-01** (§2.9) — after the joint re-inspection pass (B-17), not before.

## 6. Honest caveats for the parent's final review

- **Not re-validated — do not ask until re-validated:** GM-02 ON-Q15 (folded into MOBILE-PARITY-01, §2.9); GM-05 Q-16/Q-17 (Q-16 folded into §2.9; Q-17 after GM-18 Q15); GM-22 Q07, Q15, and Q03's cancel half; GM-25 C05, C06, C07, C10, C17, C18; GM-26 Q07, Q12–Q20, Q22–Q26, Q33. GM-26 Q43 (pentest) is UNKNOWN — nothing evidenced.
- **GM-13 note:** parent's own fetch of `backend/billing/checkout_reservations.py` failed (exit 1, cause unknown, not retried); re-read before the PR.
- **GM-26 note:** B62/B63/B65 negative tests, B64 fix verification, exact-head CI, live staging check, production env values, and Expo privacy parity are still open — the worker flags them itself.
- **GM-21/GM-22 caveat:** `search_code` results reflect the default branch (`main`), not the PR head — flagged wherever a finding rests on search alone.
- **GM-18 file path:** worker trace file not recovered in this pass — locate before the PR (§1, †).
- **GM-01 file:** the GM-01 senior-review corrections (§4) are recorded here; verify they are present in the file itself before the PR.
- **Legacy HTML page:** the Grill Me HTML artifact (`grill-me`) still carries the 142 stale #184 questions with the "Stale — re-trace needed" stamp; it is NOT the consolidated queue in this file. The PR should carry this consolidated queue (524 unique questions), not the stale 142.
- **No owner decisions recorded yet** for any question. No PR/branch created. Owner not notified.
