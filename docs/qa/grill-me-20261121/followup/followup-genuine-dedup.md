# ChemistTasker Grill Me — genuine de-duplication (follow-up to PR #267)

**Date:** 2026-11-21 · **Status:** read-only analysis, no GitHub writes, no owner notification.
**Sources:** the 26 per-area trace files listed in the task (GM-16 found at `~/workspace/grill-me-gm16-subscriptions-pills-fees.md`, not the path in the queue index), plus the corrected consolidated queue, the independent senior audit, and the Owner Decision Ledger — all at `/tmp/grill267/`.
**Head traced:** PR #249 `97c4543e`.

## 1. Headline result

| Measure | Count |
|---|---|
| Entries as written (all 26 areas) | **540** |
| (1) Genuine unanswered owner decisions | **311** |
| (2) Already-approved policy (not a question) | 9 |
| (3) Implementation gap (not a question) | 20 |
| (4) Verification item (not a question) | 4 |
| (5) Referenced copy / duplicate (merged) | 196 |
| **Total classified** | **540** |

**The PR #267 claim "524 unique" is arithmetically true (540 − 16 documented merges) but not a genuine count.**
Reconciliation: 524 − 180 newly identified duplicates − 9 already-approved − 20 implementation gaps − 4 verification items = **311 genuinely different unanswered owner decisions**.
Of the 196 bucket-(5) duplicates, 16 were already merged in the queue (§3) and **180 are newly identified here**.

### Layers inside the 311

| Layer | Count | Meaning |
|---|---|---|
| Askable now (verified title, validated, non-marketplace) | **277** | The owner interview queue |
| Marketplace-contingent | 19 | GM-21-Q02–Q20 — ask only if LAUNCH-01 keeps the goods marketplace |
| GM-18 title-unrecovered | 8 | Counted as written, but the worker trace is missing — reconstruct before asking (see §6) |
| Re-validation-blocked | 7 | GM-14-Q07–Q10, GM-26-Q20, GM-22-Q24/Q25 (partial) — do not ask until re-validated |
| **Total genuine** | **311** | |

277 + 19 + 8 + 7 = 311. The 8 + 7 are genuine decisions, not duplicates — they are counted, but flagged so nobody asks them on unverified evidence.

## 2. Method

1. **Extraction, verified against the queue.** Every question entry was extracted from the 26 files (headings `###/####/## GM-…-Q…`, bold `**GM16-Q…**` / `**GM25-Q…/C…**` lines, GM-02 `ON-…` headings, GM-05 `Q-…` headings, GM-09 `Q…` headings). Per-area counts reproduce the queue exactly: GM-01 19, GM-02 24, GM-03 12, GM-04 12, GM-05 19, GM-06 9, GM-07 10, GM-08 11, GM-09 10, GM-10 12, GM-11 13, GM-12 26, GM-13 13, GM-14 12, GM-15 49, GM-16 18, GM-17 18, GM-18 26, GM-19 13, GM-20 19, GM-21 20, GM-22 28, GM-23 29, GM-24 32, GM-25 38, GM-26 48 — **total 540**. Within-file repeats (each file re-states its first question in Part D) were de-duplicated before counting, so 540 is entries as written, not heading occurrences.
2. **Semantic comparison, not ID matching.** Entries were grouped by the decision they ask the owner to make: one owner answer settles all members of a group. The underlying #184 question ID (ON-/CX-/AG-/BK-/PO-/LA-/TB-/AV-/SH-) was used as a cross-check, but groups were formed on meaning — e.g. GM-24-Q01, ON-Q05, GM-05 Q-03, GM-12-Q05 and GM-25-C04 are five wordings of one Explorer decision.
3. **Classification rules applied per entry.** (1) Genuine only if no owner answer exists anywhere in the ledger/queue and the entry asks for a choice among alternatives. (2) Approved if the Owner Decision Ledger records the rule as APPROVED (R04A/R04C/R06/E01A/D02/D03/E01/E01B/D01/R04B-direction). (3) Gap if the substance is "code must do X" / "fix before launch?" with no policy choice. (4) Verification if the substance is "confirm/test whether X is true". (5) Duplicate if another entry in the same group is the canonical wording. Split questions (one entry spanning two decisions, e.g. GM-12-Q24 countdown + payment-fail) were assigned to the canonical of one half with the other half cross-referenced, and counted once.
4. **Machine-checked coverage.** Every one of the 540 entries is assigned to exactly one group; the check reports 0 unassigned, 0 double-assigned, 0 references to non-existent entries.

## 3. Per-area bucket table

| Area | As written | (1) Genuine | (2) Approved | (3) Gap | (4) Verify | (5) Duplicate |
|---|---:|---:|---:|---:|---:|---:|
| GM-01 | 19 | 14 | 0 | 1 | 0 | 4 |
| GM-02 | 24 | 21 | 0 | 0 | 0 | 3 |
| GM-03 | 12 | 7 | 0 | 0 | 0 | 5 |
| GM-04 | 12 | 5 | 0 | 0 | 0 | 7 |
| GM-05 | 19 | 11 | 0 | 1 | 0 | 7 |
| GM-06 | 9 | 9 | 0 | 0 | 0 | 0 |
| GM-07 | 10 | 6 | 4 | 0 | 0 | 0 |
| GM-08 | 11 | 6 | 0 | 0 | 1 | 4 |
| GM-09 | 10 | 8 | 0 | 0 | 0 | 2 |
| GM-10 | 12 | 10 | 0 | 0 | 0 | 2 |
| GM-11 | 13 | 7 | 2 | 2 | 0 | 2 |
| GM-12 | 26 | 15 | 1 | 1 | 0 | 9 |
| GM-13 | 13 | 4 | 2 | 1 | 0 | 6 |
| GM-14 | 12 | 11 | 0 | 0 | 0 | 1 |
| GM-15 | 49 | 36 | 0 | 2 | 0 | 11 |
| GM-16 | 18 | 9 | 0 | 1 | 0 | 8 |
| GM-17 | 18 | 7 | 0 | 0 | 0 | 11 |
| GM-18 | 26 | 11 | 0 | 0 | 0 | 15 |
| GM-19 | 13 | 13 | 0 | 0 | 0 | 0 |
| GM-20 | 19 | 17 | 0 | 1 | 0 | 1 |
| GM-21 | 20 | 20 | 0 | 0 | 0 | 0 |
| GM-22 | 28 | 14 | 0 | 0 | 1 | 13 |
| GM-23 | 29 | 15 | 0 | 0 | 0 | 14 |
| GM-24 | 32 | 8 | 0 | 1 | 1 | 22 |
| GM-25 | 38 | 17 | 0 | 5 | 0 | 16 |
| GM-26 | 48 | 10 | 0 | 4 | 1 | 33 |
| TOTAL | 540 | 311 | 9 | 20 | 4 | 196 |

Reading notes: GM-24 and GM-26 are mostly re-askings of decisions owned elsewhere (22 and 33 duplicates respectively) — GM-26-Q01–Q28 are largely a privacy-angle restatement of GM-02/GM-15/GM-19 decisions, and GM-24-Q01–Q20 restate GM-02/GM-05/GM-11/GM-12/GM-18. GM-06, GM-19 and GM-21 have zero duplicates — their questions are all home-grown. GM-07 holds 4 of the 9 approved-policy entries.

## 4. Largest merge groups

| Canonical decision | Entries merged | Removed | Why one decision |
|---|---:|---:|---|
| REFUND-01 — refund vs credit (GM-17-Q01) | 10 | 9 | One refund-vs-credit policy; GM-17-Q02/Q03/Q05 + GM-15-Q19–Q22 (CX-Q19–Q22) + GM-16-Q12 + GM-26-Q21 are its approver / scenario facets |
| VERIFY-GATE — where Verified + AHPRA is enforced (GM-12-Q01) | 9 | 8 | One enforcement-point decision; GM-04-Q04 (chain/org tiers), GM-15-Q48 (LA-P03) and GM-18-Q11 are tier facets of it |
| PRE-VERIFIED — what a worker can do before Verified (ON-Q02) | 7 | 6 | One capability-scope decision; GM-01-Q04 (mobile before browsing) is its mobile facet |
| LAUNCH-01 — what launches, where, after which gates (GM-21-Q01) | 6 | 5 | One launch-cut decision (queue §2.1) + GM-18-Q25/Q26 launch timing + GM-20-Q19 launch-blocking parity |
| PHARM-GATE — pharmacy posting gate (GM-03-Q01) | 6 | 5 | One gate decision (queue §2.4); GM-10-Q08 is the per-audience facet |
| MOBILE-PARITY — onboarding on mobile at launch (ON-Q15) | 6 | 5 | One parity-gate decision (queue §2.9); GM-01-Q10 is the auth-screen facet |
| EXPLORER — what Explorers can do (ON-Q05) | 5 | 4 | One decision, asked in five areas |
| SAVE-PAYMENT — pharmacies save a payment method (ON-Q13) | 5 | 4 | One decision, asked in five areas |
| PAYREADY — when worker pay details must be ready (ON-Q04) | 5 | 4 | One decision, asked in five areas |
| ESCALATION-NOTIFY — who is told on escalation, when it stops (GM-11-Q01) | 5 | 4 | One notice decision (PO-Q08); GM-12-Q19 and GM-25-C20 also carry pause/late halves |
| AUDIENCE-01 — who sees the talent board (GM-18-Q01) | 5 | 4 | One visibility decision (queue §2.8); GM-24-Q26 is the anonymous-visitor facet |
| URGENT-OPTIN — separate opt-in for urgent alerts (GM-19-Q08) | 5 | 4 | One decision (AV-Q08), asked in five areas |
| AHPRA-EXEMPT — favourites exempt from the AHPRA check (GM-05 Q-01) | 4 | 3 | One decision (queue §2.3 AHPRA-FAV-01) |
| SIGNUP-TRACKS — worker sign-up tracks (ON-Q01) | 4 | 3 | One decision, asked in four areas |
| ID-CHECK — who must pass an ID check (ON-Q08) | 4 | 3 | One decision, asked in four areas |
| GM-18 availability (Q16/Q17/Q19/Q20/Q21) | 5 | 5 | Duplicates of the GM-19 availability decisions; per-question mapping needs the lost trace |

## 5. Bucket (2) — already-approved policy (9 entries, not questions)

| Entry | Approved rule | Why it is not re-asked |
|---|---|---|
| GM-07-Q04 | **R04C** — replacement accepts, passes role/conflict, then manager approves | Code transfers without target consent (`worker_actions.py`) — implementation gap, not a policy gap |
| GM-07-Q05 | **R04B** (direction) — named eligible colleagues; widening to favourites/public requires manager | Direction decided; only the widening mechanics detail is open (see §8, new question needed) |
| GM-07-Q06 | **R04A** — per-pharmacy owner setting controls worker-initiated cover publication | Setting has no evidenced backend consumer — build it |
| GM-07-Q07 | **R06** — vacancy/needs-cover uses the SAME Shift/Slot, linked roster occurrence | Visible needs-cover state not built — build it |
| GM-11-Q11 | **E01/E01A** — cumulative tier access; notification skip is not access revocation | Tier visibility decided; gating half is VERIFY-GATE |
| GM-11-Q13 | **E01A** — widened audiences retain earlier eligible visibility | Favourite losing visibility on widening is drift — fix + negative test |
| GM-12-Q15 | **D01** — external offer acceptance reserves; verified booking payment confirms | First-acceptance hold is the reserve rule; concurrency tests remain |
| GM-13-Q01 | **D02** — 24h/6h/2h/30min pay-by windows, never beyond start | No D02 policy in `checkout_reservations.py` — build server-owned deadline + expiry worker |
| GM-13-Q02 | **D03** — unpaid expiry releases the SAME audience, notices, no penalty | No scheduled expiry evidenced — build idempotent release |

## 6. Bucket (3) — implementation gap (20 entries, canonical gaps)

| Canonical gap entry | Gap |
|---|---|
| GM-01-Q07 | "Keep me signed in" inversion (ticked = 7 days, unticked = 90 days) — fix once SESSION-DURATION decides durations |
| GM-05 Q-17 | Web/mobile disagree on Talent Board booking permissions (LA-Q15/TB-07) — fix drift once HIRING-ROLE is decided |
| GM-11-Q04 | Scheduled escalation only runs when someone loads a shift list (SH-05/LA-Q08) — deterministic scheduler needed |
| GM-11-Q05 | Match emails miss escalated shifts, reach unverified workers (LA-Q17/AV-04) — fix once VERIFY-GATE is decided |
| GM-12-Q26 | Code-gap timing bundle (LAUNCH slice) — timing via LAUNCH-01 |
| GM-13-Q13 | AHPRA cancellation strands the payment reservation (LA-P01) — fix the release, respecting D02/D03 + REFUND-01 |
| GM-15-Q45 | AHPRA cancellations bypass cancellation policy + notices (LA-P02) — apply the policy |
| GM-15-Q47 | Accepted terms omit the cancellation table / terms version (LA-Q10/SH-09) — include them |
| GM-16-Q02 | Subscribers charged full price; Stripe price IDs hard-coded (LA-Q07/SH-03) |
| GM-20-Q15 | `?unread=1` filter — fix it or remove it |
| GM-24-Q13 | Anonymous talent posts expose full names to any signed-in account (P0) — server-side masking |
| GM-25-C08 | Mobile "add personal profile" drops pharmacist data / sends other staff to not-found (LA-Q02/ON-04) |
| GM-25-C09 | Reachable mobile screens dead-end or send unsupported fields (LA-Q03/ON-05) |
| GM-25-C10 | Profile progress % does not match what Verified needs (LA-Q04/ON-10) |
| GM-25-C11 | Auto-publish setting contradicts R06/R04B, missing on mobile (LA-Q11/SH-11); backend `approve()` never reads the flag |
| GM-25-C13 | Talent board downloads every post, filters in the app (LA-Q14/TB-04) |
| GM-26-Q05 | Hidden, stale and lapsed-credential posts can still be read |
| GM-26-Q35 | Booking never refreshes AHPRA registration from the public register |
| GM-26-Q44 | Kiosk codes + worker PIN OTPs persist in notifications (PR #200 B64) |
| GM-26-Q45 | Region Admin cross-tenant actions; pairing-code downgrade; pricing-preview leakage (PR #200 B62/B63/B65) |

## 7. Bucket (4) — verification item (4 entries, not owner decisions)

| Entry | What needs evidence/test instead |
|---|---|
| GM-08-Q07 | Confirm the current QR parameters; change nothing (scope freeze) |
| GM-22-Q27 | Per-event negative tests: can a notification leak one tenant information to another (NOT RE-VALIDATED) |
| GM-24-Q32 | Launch-gate check: are the mobile dead-ends fixed? |
| GM-26-Q43 | Has anyone pentested this (UNKNOWN — nothing evidenced)? Needs a pentest, not a policy answer |

## 8. Caveats, borderline calls, and follow-ups

### GM-18 — the trace is still missing; 8 of the 311 are title-unrecovered

Only the 39-line senior-review summary survives. The 26 GM-18 questions were counted as written and grouped from the senior review's own grouping (audience/reveal/masking Q01–Q03; filters Q04/Q22; ratings Q05/Q06; commercial model Q07–Q10; Verified/AHPRA Q11/Q12; lifecycle Q13/Q14/Q18; hiring-role Q15; availability Q16/Q17/Q19/Q20/Q21; disclosure Q24; launch timing Q25/Q26; Q23 unknown). 15 of the 26 merge into decisions owned elsewhere. The 11 counted as genuine GM-18 canonicals are: TALENT-FILTERS (Q04), GM-18-Q08/Q09/Q10 (commercial model), GM-18-Q13/Q14 (lifecycle), HIRING-ROLE (Q15), GM-18-Q23 (unknown), GM-18-Q24 (disclosure). Of those 11, **8 have unrecovered titles (Q04, Q08, Q09, Q10, Q13, Q14, Q23, Q24)** — they are counted, but must not be asked until the worker trace is recovered or reconstructed at head `97c4543e`. If reconstruction shows Q08–Q10 or Q13/Q14 are the same decision, the true count falls further; if Q23 duplicates another area, likewise. Q04/Q22 were treated as one filter decision — if they are two distinct filter decisions, the true count rises by 1.

### Do-not-ask-until-re-validated (genuine decisions, blocked on evidence)

- GM-14-Q07, Q08, Q09, Q10 (change-consent chain, AG-Q05–Q08) — file flags NOT RE-VALIDATED.
- GM-26-Q20 (off-platform hiring rule) — NOT RE-VALIDATED.
- GM-22-Q24 (rating/badge notices — incidents half) and GM-22-Q25 (AHPRA-status notices — grant/lapse half) — partially NOT RE-VALIDATED; the validated halves may be asked.
- GM-22-Q03 (cancel-notify — cancel half) — partially NOT RE-VALIDATED; canonical is GM-15-Q38, which is validated.
- All bucket-(5) copies carrying a NOT RE-VALIDATED flag inherit the block from their canonical only where the canonical itself is unvalidated — in this de-dup every such canonical is validated except the seven above.

### Borderline merges (judgement calls — flag if the parent disagrees)

- **GM-01-Q04 → PRE-VERIFIED.** Mobile-verify-before-browsing folded into ON-Q02 as its mobile facet. If the owner treats mobile verification as a separate gate from Verified status, split it back out (+1).
- **GM-10-Q05 → TIMEZONE.** Posting date/timezone guards folded into GM-23-Q23 (whose time is a shift time). If posting guards are a separate decision, split it back out (+1).
- **GM-11-Q12 → split.** Broadcast half is APPROVED E01B; flags half merges into GM-22-Q20 (notification prefs). Counted once, under GM-22-Q20.
- **GM-12-Q15 → D01 (approved).** First-acceptance hold read as the D01 reserve rule. If the owner reads D01 more narrowly (offer acceptance only, not payment-pending holds), this becomes a genuine question (+1).
- **GM-15-Q04 (boundary bands) → genuine, with conflict.** GM-16's carried-decision note asserts the CX-Q04 boundary rule as KEEP (milder band); GM-15 still asks it. Treated as open until the owner confirms — if the KEEP is in fact a carried owner decision, move it to bucket (2) (−1).
- **GM-19-Q10 → genuine (validation rules).** "Add validation" is a gap; "what must it reject" is the counted decision. GM-23-Q17 merges into it.
- **GM-26-Q43 → verification.** The vulnerability-handling-process half is a genuine sub-decision with no entry among the 540 — needs a new narrow question (see below).
- **GM-24-Q26 → AUDIENCE-01.** Non-anonymous posts visible to anonymous visitors folded into the visibility decision as its anonymous-visitor facet.
- **GM-21 marketplace (19) → genuine but contingent.** They are real decisions, but moot if LAUNCH-01 defers the marketplace. Excluding them, the non-marketplace genuine count is 292.

### New narrow questions the interview still needs (not among the 540)

1. R04B widening mechanics: how does a manager widen cover beyond named colleagues (invite/accept/escalate flow)?
2. R04C timeout/decline: how long does a cover target have to accept, and what happens on decline/timeout?
3. Vulnerability-handling process (from GM-26-Q43): who triages, what SLA, how are reporters credited/paid?
4. GM-15-Q04 confirmation: is the P09 boundary rule (milder band at exactly 72/24/12/2h) a carried owner decision, or still open?

## 9. Full merge table — canonical question → merged duplicates → why

Each row is one canonical group. "Bucket" is the canonical entry's bucket; every non-canonical member is bucket (5) unless the group note says otherwise. Question texts are as written in the area files (truncated where long).

<!-- machine-check: buckets {1: 311, 2: 9, 3: 20, 4: 4, 5: 196}, total 540, groups 346 -->

### LAUNCH-01 — canonical: GM-21 GM-21-Q01 (bucket 1)

- **Canonical:** GM21-Q01 — Do we launch the goods marketplace at all, and for whom? [FIRST — see Part D] — VERIFIED, recommendation strengthened
- **Merged duplicates (5):**
  - GM-25 GM-25-Q01 — GM25-Q01 — What is the launch cut across Vite web, Next web, and Expo?
  - GM-26 GM-26-Q36 — GM26-Q36 — [P0 · decision] What is the launch cut for GM-26 — which release blockers must close before the first real user?
  - GM-18 GM-18-Q25 — GM-18 GM-18-Q25 — Launch timing (title unrecovered)
  - GM-18 GM-18-Q26 — GM-18 GM-18-Q26 — Launch timing (title unrecovered)
  - GM-20 GM-20-Q19 — GM20-Q19 — Web/Expo parity: which gaps are launch-blocking?
- **Why one decision:** Single launch decision (queue s2.1). GM-18-Q25/Q26 launch timing + GM-20-Q19 launch-blocking parity fold in. Canonical label GM-21-Q01 per queue ask order; GM-26-Q36 is the release-gate wording of the same decision.
- **Flag:** GM-18-Q25/Q26 titles unrecovered (senior-review grouping: launch timing)

### MARKETPLACE-TRADE — canonical: GM-21 GM-21-Q02 (bucket 1)

- **Canonical:** GM21-Q02 — What may be traded, and what is banned? — VERIFIED
- **Why one decision:** What may be traded / banned. Ask only if marketplace proceeds (LAUNCH-01).

### MARKETPLACE-SELLER — canonical: GM-21 GM-21-Q03 (bucket 1)

- **Canonical:** GM21-Q03 — Who can sell personally, and who can sell for a pharmacy? — VERIFIED
- **Why one decision:** Who can sell personally / for a pharmacy. Ask only if marketplace proceeds.

### MARKETPLACE-BUYER — canonical: GM-21 GM-21-Q04 (bucket 1)

- **Canonical:** GM21-Q04 — Who can buy, and how far does a listing travel? — CHANGED (public catalogue is wider than the model promises)
- **Why one decision:** Who can buy; how far a listing travels. Ask only if marketplace proceeds.

### MARKETPLACE-IDCHECK — canonical: GM-21 GM-21-Q05 (bucket 1)

- **Canonical:** GM21-Q05 — What identity check must a trader pass before listing or buying? — VERIFIED
- **Why one decision:** Trader identity check before listing/buying. Ask only if marketplace proceeds.

### MARKETPLACE-TERMS — canonical: GM-21 GM-21-Q06 (bucket 1)

- **Canonical:** GM21-Q06 — Which marketplace terms must a user accept, and when? — VERIFIED
- **Why one decision:** Which marketplace terms, when accepted. Ask only if marketplace proceeds.

### MARKETPLACE-REVIEW — canonical: GM-21 GM-21-Q07 (bucket 1)

- **Canonical:** GM21-Q07 — How does listing review work, and how fast? — VERIFIED
- **Why one decision:** Listing review, how fast. Ask only if marketplace proceeds.

### MARKETPLACE-PRICE — canonical: GM-21 GM-21-Q08 (bucket 1)

- **Canonical:** GM21-Q08 — Sell, swap, free: what are the price rules? — VERIFIED
- **Why one decision:** Sell / swap / free price rules. Ask only if marketplace proceeds.

### MARKETPLACE-AUDIENCE — canonical: GM-21 GM-21-Q09 (bucket 1)

- **Canonical:** GM21-Q09 — Audience circles and escalation: who sees it first, and when does it widen? — VERIFIED
- **Why one decision:** Audience circles + escalation for goods (distinct from shift escalation). Ask only if marketplace proceeds.

### MARKETPLACE-EXCHANGE — canonical: GM-21 GM-21-Q10 (bucket 1)

- **Canonical:** GM21-Q10 — Enquiry or firm offer: what is an exchange, and when is a listing held? — CHANGED (reservations never expire)
- **Why one decision:** Enquiry vs firm offer for goods; when a listing is held (distinct from OFFER-01 talent board). Ask only if marketplace proceeds.

### MARKETPLACE-MONEY — canonical: GM-21 GM-21-Q11 (bucket 1)

- **Canonical:** GM21-Q11 — How is money handled — in-platform, or off-platform? — VERIFIED (no payment path exists)
- **Why one decision:** Money handling in-platform vs off-platform. Ask only if marketplace proceeds.

### MARKETPLACE-DELIVERY — canonical: GM-21 GM-21-Q12 (bucket 1)

- **Canonical:** GM21-Q12 — Delivery and pickup: who pays, who organises, what proves it arrived? — VERIFIED
- **Why one decision:** Delivery/pickup: who pays, organises, proves arrival. Ask only if marketplace proceeds.

### MARKETPLACE-TRANSFER — canonical: GM-21 GM-21-Q13 (bucket 1)

- **Canonical:** GM21-Q13 — Internal transfers between a owner's pharmacies: transfer or listing? — CHANGED (no destination acceptance exists)
- **Why one decision:** Internal transfers between an owner pharmacies: transfer or listing. Ask only if marketplace proceeds.

### MARKETPLACE-MODERATION — canonical: GM-21 GM-21-Q14 (bucket 1)

- **Canonical:** GM21-Q14 — Moderation, reports, restrictions: who acts, how fast, can it be appealed? — VERIFIED
- **Why one decision:** Moderation / reports / restrictions / appeal. Ask only if marketplace proceeds.

### MARKETPLACE-ETHICAL — canonical: GM-21 GM-21-Q15 (bucket 1)

- **Canonical:** GM21-Q15 — The ethical marketplace (medicines): who can use it, and what are the "ethical" rules? — VERIFIED (whole app traced)
- **Why one decision:** Ethical marketplace (medicines): who can use it, ethical rules. Ask only if marketplace proceeds.

### MARKETPLACE-NOTIFY — canonical: GM-21 GM-21-Q16 (bucket 1)

- **Canonical:** GM21-Q16 — What are buyers and sellers told, and what happens when a notification fails? — VERIFIED (no notifications exist)
- **Why one decision:** What buyers/sellers are told; notification failure. Ask only if marketplace proceeds.

### MARKETPLACE-PHOTOS — canonical: GM-21 GM-21-Q17 (bucket 1)

- **Canonical:** GM21-Q17 — Photos: what shows before review, and what is banned in images? — VERIFIED
- **Why one decision:** Photos: what shows before review; banned images. Ask only if marketplace proceeds.

### MARKETPLACE-CATALOGUE — canonical: GM-21 GM-21-Q18 (bucket 1)

- **Canonical:** GM21-Q18 — Catalogue products and imports: who adds products, and who checks the rights? — VERIFIED
- **Why one decision:** Catalogue products/imports: who adds, who checks rights. Ask only if marketplace proceeds.

### MARKETPLACE-PARITY — canonical: GM-21 GM-21-Q19 (bucket 1)

- **Canonical:** GM21-Q19 — Web vs Expo parity: which marketplace screens exist on each client? — VERIFIED
- **Why one decision:** Which marketplace screens exist on each client. Ask only if marketplace proceeds.

### MARKETPLACE-FEES — canonical: GM-21 GM-21-Q20 (bucket 1)

- **Canonical:** GM21-Q20 — Fees and commission: does the platform charge for trades? — VERIFIED (no fee anywhere)
- **Why one decision:** Fees/commission on trades. Ask only if marketplace proceeds.

### VERIFY-GATE — canonical: GM-12 GM-12-Q01 (bucket 1)

- **Canonical:** GM-12-Q01 — Where must Verified + current AHPRA be enforced? [FIRST — see §4]
- **Merged duplicates (8):**
  - GM-02 ON-Q03 — ON-Q03 — Where must role-appropriate verification be enforced?
  - GM-05 Q-02 — Q-02 — [ON-Q03] Where must role-appropriate verification be enforced?
  - GM-24 GM-24-Q03 — GM-24-Q03 — Where must role-appropriate verification be enforced?
  - GM-25 GM-25-C03 — GM25-C03 — ON-Q03. Where must role-appropriate verification be enforced?
  - GM-26 GM-26-Q09 — GM26-Q09 — [P1 · decision] Where must role-appropriate verification be enforced?
  - GM-04 GM-04-Q04 — GM-04-Q04 — Where must Verified / current AHPRA be enforced for chain and organisation tiers? [ex-#184 ON-Q03 + LA-P03] — STILL VALID, safety-critical
  - GM-15 GM-15-48 — GM15-48 — LA-P03 (context, GM-15 adjacent) · Chain and organisation shifts skip the AHPRA gate [STILL VALID — noted, owned by GM-02/GM-04]
  - GM-18 GM-18-Q11 — GM-18 GM-18-Q11 — Verified / AHPRA gate (title unrecovered)
- **Why one decision:** Where Verified + current AHPRA is enforced (queue s2.7 VERIFY-GATE-01). GM-04-Q04 is the chain/org-tier facet; GM-15-Q48 (LA-P03) is the same tier facet; GM-18-Q11 is the public-shifts-only facet.
- **Flag:** GM-18-Q11 title unrecovered (senior-review grouping: Verified/AHPRA)

### PRE-VERIFIED — canonical: GM-02 ON-Q02 (bucket 1)

- **Canonical:** ON-Q02 — What can a worker do before they are Verified?
- **Merged duplicates (6):**
  - GM-12 GM-12-Q02 — GM-12-Q02 — What can a worker do before they are Verified?
  - GM-24 GM-24-Q02 — GM-24-Q02 — What can a worker do before they are Verified?
  - GM-25 GM-25-C02 — GM25-C02 — ON-Q02. What can a worker do before they are Verified?
  - GM-26 GM-26-Q08 — GM26-Q08 — [P1 · decision] What can a worker do before they are Verified? (gate scope)
  - GM-01 GM-01-Q04 — GM01-Q04 — Must a worker verify their mobile before they can browse anything? (carried ON-Q02, re-asked — FIRST QUESTION, see Part D)
  - GM-05 Q-12 — Q-12 — [ON-Q02 + ON-11] What can a worker do before Verified, and when do they learn about payment blockers?
- **Why one decision:** What a worker can do before Verified (ON-Q02). GM-01-Q04 (mobile verify before browsing) is the mobile facet of the same capability decision. GM-05 Q-12 also carries ON-Q11 (pay-readiness notice) — that half is covered by PAYREADY.

### AHPRA-EXEMPT — canonical: GM-05 Q-01 (bucket 1)

- **Canonical:** Q-01 — [ON-P01] ★ FIRST QUESTION — see Section 4
- **Merged duplicates (3):**
  - GM-02 ON-P01 — ON-P01 — Who is exempt from AHPRA gates on public shifts?
  - GM-12 GM-12-Q03 — GM-12-Q03 — Who is exempt from AHPRA gates on public shifts?
  - GM-24 GM-24-Q04 — GM-24-Q04 — Who is exempt from AHPRA gates on public shifts?
- **Why one decision:** Favourite locums exempt from the AHPRA check on public shifts? (queue s2.3 AHPRA-FAV-01).

### SIGNUP-TRACKS — canonical: GM-02 ON-Q01 (bucket 1)

- **Canonical:** ON-Q01 — Which sign-up tracks should workers get at launch?
- **Merged duplicates (3):**
  - GM-01 GM-01-Q02 — GM01-Q02 — Which sign-up tracks should workers get at launch? (carried ON-Q01, corrected)
  - GM-05 Q-10 — Q-10 — [ON-Q01] Which sign-up tracks should workers get at launch? (revalidated)
  - GM-24 GM-24-Q05 — GM-24-Q05 — Which sign-up tracks should workers get at launch?
- **Why one decision:** Which sign-up tracks workers get at launch (ON-Q01).

### EXPLORER — canonical: GM-02 ON-Q05 (bucket 1)

- **Canonical:** ON-Q05 — What can Explorers (new to pharmacy) do with shifts?
- **Merged duplicates (4):**
  - GM-05 Q-03 — Q-03 — [ON-Q05] What can Explorers (new to pharmacy) do with shifts?
  - GM-12 GM-12-Q05 — GM-12-Q05 — What can Explorers (new to pharmacy) do with shifts?
  - GM-24 GM-24-Q01 — GM-24-Q01 — What can Explorers ("new to pharmacy") do with shifts? [FIRST QUESTION — ask this first]
  - GM-25 GM-25-C04 — GM25-C04 — ON-Q05. What can Explorers (new to pharmacy) do with shifts?
- **Why one decision:** What Explorers (new to pharmacy) can do with shifts (ON-Q05).

### ID-CHECK — canonical: GM-02 ON-Q08 (bucket 1)

- **Canonical:** ON-Q08 — Who must pass an ID check?
- **Merged duplicates (3):**
  - GM-05 Q-15 — Q-15 — [ON-Q08] Who must pass an ID check?
  - GM-24 GM-24-Q06 — GM-24-Q06 — Who must pass an ID check?
  - GM-26 GM-26-Q07 — GM26-Q07 — [P1 · decision] Who must pass an ID check?
- **Why one decision:** Who must pass an ID check (ON-Q08).
- **Flag:** GM-26-Q07 NOT RE-VALIDATED — do not ask until re-validated

### AHPRA-RECHECK — canonical: GM-02 ON-Q06 (bucket 1)

- **Canonical:** ON-Q06 — How should AHPRA be re-checked after sign-up?
- **Merged duplicates (1):**
  - GM-26 GM-26-Q10 — GM26-Q10 — [P1 · decision] How should AHPRA be re-checked after sign-up?
- **Why one decision:** How AHPRA is re-checked after sign-up (ON-Q06).
- **Flag:** GM-26-Q10 NOT RE-VALIDATED — do not ask until re-validated

### AHPRA-LOOKUP — canonical: GM-02 ON-P03 (bucket 1)

- **Canonical:** ON-P03 — Which AHPRA lookup should run at launch?
- **Merged duplicates (2):**
  - GM-26 GM-26-Q11 — GM26-Q11 — [P1 · decision] Which AHPRA lookup should run at launch? (ScrapingBee vs desktop verifier)
  - GM-18 GM-18-Q12 — GM-18 GM-18-Q12 — AHPRA defaults / lookup (title unrecovered)
- **Why one decision:** Which AHPRA lookup runs at launch (ON-P03).
- **Flag:** GM-26-Q11 NOT RE-VALIDATED; GM-18-Q12 title unrecovered (senior-review grouping: Verified/AHPRA)

### AHPRA-UNCONFIRMED — canonical: GM-02 ON-Q07 (bucket 1)

- **Canonical:** ON-Q07 — If current registration cannot be confirmed, what happens to future bookings?
- **Merged duplicates (1):**
  - GM-26 GM-26-Q12 — GM26-Q12 — [P1 · decision] If current registration cannot be confirmed, what happens to future bookings?
- **Why one decision:** If current registration cannot be confirmed, what happens to future bookings (ON-Q07).
- **Flag:** GM-26-Q12 NOT RE-VALIDATED — do not ask until re-validated

### AHPRA-SUSPENDED — canonical: GM-02 ON-P02 (bucket 1)

- **Canonical:** ON-P02 — When the register shows Suspended or Cancelled, what happens?
- **Merged duplicates (2):**
  - GM-26 GM-26-Q13 — GM26-Q13 — [P1 · decision] When the register shows Suspended or Cancelled, what happens?
  - GM-17 GM-17-Q11 — GM17-Q11 — AHPRA auto-cancellation: fee, refund, notices (ON-P02 + LA-P02)
- **Why one decision:** When the register shows Suspended/Cancelled, what happens (ON-P02). GM-17-Q11 also carries LA-P02 + refund halves — covered by LA-P02 gap (GM-15-Q45) and REFUND-01.
- **Flag:** GM-26-Q13 NOT RE-VALIDATED — do not ask until re-validated

### INDEMNITY — canonical: GM-02 ON-Q09 (bucket 1)

- **Canonical:** ON-Q09 — Which workers must prove professional indemnity cover?
- **Merged duplicates (1):**
  - GM-26 GM-26-Q14 — GM26-Q14 — [P1 · decision] Which workers must prove professional indemnity cover?
- **Why one decision:** Which workers must prove professional indemnity cover (ON-Q09).
- **Flag:** GM-26-Q14 NOT RE-VALIDATED — do not ask until re-validated

### RETENTION — canonical: GM-02 ON-R01 (bucket 1)

- **Canonical:** ON-R01 — How long should verification evidence be kept?
- **Merged duplicates (1):**
  - GM-26 GM-26-Q06 — GM26-Q06 — [P1 · decision] How long should verification evidence be kept? (retention / APP 11)
- **Why one decision:** How long verification evidence is kept (ON-R01).

### SUPER-SHOW — canonical: GM-02 ON-Q10 (bucket 1)

- **Canonical:** ON-Q10 — How should super show on ABN contractor terms?
- **Why one decision:** How super shows on ABN contractor terms (ON-Q10). Distinct from GM-14-Q01 (who decides super is payable).

### COUNTER-VERIFY — canonical: GM-02 GM-02-Q20 (bucket 1)

- **Canonical:** GM02-Q20 — Should submitting a counter-offer on a public shift require Verified/AHPRA, like applying does?
- **Why one decision:** Counter-offer on a public shift requires Verified/AHPRA like applying does?

### OFFER-UNVERIFIED — canonical: GM-02 GM-02-Q21 (bucket 1)

- **Canonical:** GM02-Q21 — Should a manager be warned or blocked from offering a shift to an unverified or suspended worker?
- **Why one decision:** Manager warned/blocked from offering a shift to an unverified or suspended worker?

### AHPRA-EXPIRY-BLOCK — canonical: GM-02 GM-02-Q22 (bucket 1)

- **Canonical:** GM02-Q22 — Should a passed AHPRA expiry date itself block new public applications, even without a fresh lookup?
- **Why one decision:** Passed AHPRA expiry date itself blocks new public applications, even without a fresh lookup?

### INTERN-AHPRA — canonical: GM-02 GM-02-Q23 (bucket 1)

- **Canonical:** GM02-Q23 — Should intern talent posts get the same AHPRA-expiry check pharmacist posts get?
- **Why one decision:** Intern talent posts get the same AHPRA-expiry check pharmacist posts get?

### MOBILE-SKIP — canonical: GM-02 GM-02-Q24 (bucket 1)

- **Canonical:** GM02-Q24 — Who may skip the Australian mobile check, and what must they prove instead?
- **Why one decision:** Who may skip the Australian mobile check, and what must they prove instead?

### PHARM-GATE — canonical: GM-03 GM-03-Q01 (bucket 1)

- **Canonical:** GM-03-Q01 — What must a pharmacy pass before posting to outside workers?
- **Merged duplicates (5):**
  - GM-02 ON-Q11 — ON-Q11 — What must a pharmacy pass before posting to outside workers?
  - GM-04 GM-04-Q03 — GM-04-Q03 — What must a pharmacy pass before posting to outside workers (including its own chain/org)? [ex-#184 ON-Q11] — STILL VALID
  - GM-10 GM-10-Q08 — GM-10-Q08 — Must a pharmacy pass any verification check before posting, and does it differ by audience?
  - GM-24 GM-24-Q07 — GM-24-Q07 — What must a pharmacy pass before posting to outside workers?
  - GM-25 GM-25-C06 — GM25-C06 — ON-Q11. What must a pharmacy pass before posting to outside workers?
- **Why one decision:** What a pharmacy must pass before posting to outside workers (queue s2.4 PHARM-GATE-01). GM-10-Q08 is the per-audience facet.
- **Flag:** GM-25-C06 NOT RE-VALIDATED — do not ask until re-validated

### SITE-BRIEF — canonical: GM-02 ON-Q12 (bucket 1)

- **Canonical:** ON-Q12 — Which site brief fields are required before the first post?
- **Merged duplicates (1):**
  - GM-03 GM-03-Q02 — GM-03-Q02 — Which site-brief fields are required before the first post?
- **Why one decision:** Which site-brief fields are required before the first post (ON-Q12).

### SAVE-PAYMENT — canonical: GM-02 ON-Q13 (bucket 1)

- **Canonical:** ON-Q13 — Should pharmacies save a payment method during setup?
- **Merged duplicates (4):**
  - GM-03 GM-03-Q03 — GM-03-Q03 — Should pharmacies save a payment method during setup?
  - GM-13 GM-13-Q10 — GM13-Q10 — Should pharmacies save a payment method during setup? (carried ON-Q13 / ON-08)
  - GM-16 GM-16-Q05 — GM16-Q05 — [ON-Q13 / ON-08] Should pharmacies save a payment method during setup? — ✅ STILL VALID (now verified)
  - GM-25 GM-25-C07 — GM25-C07 — ON-Q13. Should pharmacies save a payment method during setup?
- **Why one decision:** Should pharmacies save a payment method during setup (ON-Q13).
- **Flag:** GM-25-C07 NOT RE-VALIDATED — do not ask until re-validated

### ORG-JOIN — canonical: GM-02 ON-Q14 (bucket 1)

- **Canonical:** ON-Q14 — How do organisations (multi-site groups) join?
- **Merged duplicates (3):**
  - GM-03 GM-03-Q04 — GM-03-Q04 — How do organisations (multi-site groups) join?
  - GM-04 GM-04-Q01 — GM-04-Q01 — How do organisations (multi-site groups) join? [ex-#184 ON-Q14] — STILL VALID
  - GM-05 Q-13 — Q-13 — [ON-Q14] How do organisations (multi-site groups) join? (revalidated)
- **Why one decision:** How organisations (multi-site groups) join (ON-Q14).

### PAYREADY — canonical: GM-02 ON-Q04 (bucket 1)

- **Canonical:** ON-Q04 — When must a worker's pay details (ABN or TFN, bank, super) be ready?
- **Merged duplicates (4):**
  - GM-12 GM-12-Q04 — GM-12-Q04 — When must a worker's pay details (ABN/TFN, bank, super) be ready?
  - GM-13 GM-13-Q11 — GM13-Q11 — When must worker pay details be ready — and who sees the gap early? (carried ON-Q04 / ON-11; GM-14 owns the wording)
  - GM-14 GM-14-Q05 — GM14-Q05 — When must worker pay details be ready — and who sees the gap early? (carried ON-Q04 / ON-11)
  - GM-25 GM-25-C05 — GM25-C05 — ON-Q04 / LA-Q05. When must a worker's pay details be ready, and must both apps show it early?
- **Why one decision:** When worker pay details (ABN/TFN, bank, super) must be ready, and who sees the gap early (ON-Q04). GM-14 owns the wording.
- **Flag:** GM-25-C05 NOT RE-VALIDATED — do not ask until re-validated

### MOBILE-PARITY — canonical: GM-02 ON-Q15 (bucket 1)

- **Canonical:** ON-Q15 — Must every onboarding step work on mobile at launch?
- **Merged duplicates (5):**
  - GM-03 GM-03-Q05 — GM-03-Q05 — Must every owner-setup step work on mobile (Expo) at launch — and what about Next?
  - GM-05 Q-16 — Q-16 — [ON-Q15 / LA-Q02 / LA-Q03] Must onboarding and account upgrades work fully on mobile at launch?
  - GM-25 GM-25-C01 — GM25-C01 — ON-Q15. Must every onboarding step work on mobile at launch?
  - GM-26 GM-26-Q48 — GM26-Q48 — [P2 · decision] Must every onboarding step work on mobile at launch? (parity gate for GM-26-adjacent onboarding)
  - GM-01 GM-01-Q10 — GM01-Q10 — Should every onboarding/auth step work on mobile, including the password and OTP screens?
- **Why one decision:** Must every onboarding step work on mobile at launch (queue s2.9 MOBILE-PARITY-01). GM-01-Q10 (auth/OTP screens on mobile) is the auth facet.
- **Flag:** ON-Q15 / Q-16 NOT VERIFIED — ask only after the joint re-inspection pass (GM-05 backlog B-17)

### OWNER-SKIP — canonical: GM-03 GM-03-Q06 (bucket 1)

- **Canonical:** GM-03-Q06 — Can an owner skip adding a pharmacy forever, and should anything remind them?
- **Why one decision:** Can an owner skip adding a pharmacy forever, and should anything remind them?

### OWNER-VS-PHARMACY — canonical: GM-03 GM-03-Q07 (bucket 1)

- **Canonical:** GM-03-Q07 — Owner profile vs pharmacy profile: who is the legal party, and what happens when the owner isn't a pharmacist?
- **Why one decision:** Owner profile vs pharmacy profile: who is the legal party; owner is not a pharmacist?

### PHARM-EDIT-LOCK — canonical: GM-03 GM-03-Q09 (bucket 1)

- **Canonical:** GM-03-Q09 — Can the owner change a pharmacy after shifts are posted — and what locks when?
- **Why one decision:** Can the owner change a pharmacy after shifts are posted — and what locks when?

### PHARM-DOCS — canonical: GM-03 GM-03-Q10 (bucket 1)

- **Canonical:** GM-03-Q10 — Which pharmacy documents are required, who reviews them, and do they expire?
- **Why one decision:** Which pharmacy documents are required, who reviews them, do they expire?

### DEFAULT-RATES — canonical: GM-03 GM-03-Q11 (bucket 1)

- **Canonical:** GM-03-Q11 — Default rates and the payroll switch: where do they belong, and what is the default?
- **Why one decision:** Default rates + payroll switch: where do they belong, what is the default? Distinct from GM-10-Q03 (per-shift fixed vs negotiable).

### PHARM-VERIFY — canonical: GM-03 GM-03-Q12 (bucket 1)

- **Canonical:** GM-03-Q12 — Who verifies a pharmacy (`verified` flag), on what evidence, and is the owner told?
- **Why one decision:** Who verifies a pharmacy (verified flag), on what evidence, is the owner told?

### ORG-TAXONOMY — canonical: GM-04 GM-04-Q02 (bucket 1)

- **Canonical:** GM-04-Q02 — What is an organisation, a chain, and a region — and can one pharmacy belong to more than one? [NEW, refined by code]
- **Merged duplicates (1):**
  - GM-03 GM-03-Q08 — GM-03-Q08 — One owner, several pharmacies: chain, organisation, or just "my pharmacies"?
- **Why one decision:** What an organisation / chain / region is; can one pharmacy belong to more than one? GM-03-Q08 (one owner, several pharmacies) is the same modelling decision.

### ORG-ADMIN — canonical: GM-04 GM-04-Q05 (bucket 1)

- **Canonical:** GM-04-Q05 — What can an organisation admin do? (hierarchy, pharmacies, members, shifts) [NEW, refined]
- **Why one decision:** What can an organisation admin do (hierarchy, pharmacies, members, shifts)?

### ORG-RATES — canonical: GM-04 GM-04-Q06 (bucket 1)

- **Canonical:** GM-04-Q06 — Are there org-level rates, policies or defaults (or is everything per pharmacy)? [NEW]
- **Why one decision:** Org-level rates, policies or defaults, or everything per pharmacy?

### ORG-VISIBILITY — canonical: GM-04 GM-04-Q07 (bucket 1)

- **Canonical:** GM-04-Q07 — How does org membership affect shift visibility and booking? (who counts as "in the org"?) [ex-#184 ON-Q03 context + E01/E01A] — CHANGED (member now partly defined)
- **Why one decision:** How org membership affects shift visibility and booking (who counts as "in the org"?). E01/E01A retention half is APPROVED — only the membership-definition half is open.

### SOURCE-FROZEN — canonical: GM-15 GM-15-31 (bucket 1)

- **Canonical:** GM15-31 — CX-Q31 · When is a worker's source (favourite, chain, org, public) frozen, and which wins if several apply? [STILL VALID]
- **Merged duplicates (1):**
  - GM-04 GM-04-Q09 — GM-04-Q09 — When is a worker's source (favourite, chain, org, public) frozen, and which wins if several apply? [ex-#184 CX-Q31] — NOT RE-VALIDATED
- **Why one decision:** When a worker source (favourite, chain, org, public) is frozen, and which wins if several apply (CX-Q31).
- **Flag:** GM-04-Q09 NOT RE-VALIDATED — do not ask until re-validated

### REGION — canonical: GM-04 GM-04-Q10 (bucket 1)

- **Canonical:** GM-04-Q10 — Do regions exist as a product concept, and if so what do they scope? [NEW] — CHANGED (role exists, geography still doesn't)
- **Why one decision:** Do regions exist as a product concept, and if so what do they scope?

### ORG-INCIDENTS — canonical: GM-15 GM-15-27 (bucket 1)

- **Canonical:** GM15-27 — CX-Q27 · Do favourite, chain and organisation incidents count toward the platform ladder? [STILL VALID]
- **Merged duplicates (1):**
  - GM-04 GM-04-Q11 — GM-04-Q11 — Do favourite, chain and organisation incidents count toward the platform ladder? [ex-#184 CX-Q27] — NOT RE-VALIDATED
- **Why one decision:** Do favourite, chain and organisation incidents count toward the platform ladder (CX-Q27)?
- **Flag:** GM-04-Q11 NOT RE-VALIDATED — do not ask until re-validated

### INVITE-NOACCOUNT — canonical: GM-05 Q-04 (bucket 1)

- **Canonical:** Q-04 — [NEW] When a pharmacy invites someone with no account, should they become an active member immediately?
- **Why one decision:** Pharmacy invites someone with no account — active member immediately?

### INVITE-EXPIRY — canonical: GM-05 Q-05 (bucket 1)

- **Canonical:** Q-05 — [NEW] Should a direct email invite ever expire, and can it be revoked?
- **Why one decision:** Direct email invite: expire, revocable?

### ORGSTAFF-REGION — canonical: GM-05 Q-06 (bucket 1)

- **Canonical:** Q-06 — [NEW] Who can create ORG_STAFF accounts and organisation memberships, and what does REGION_ADMIN actually scope?
- **Why one decision:** Who can create ORG_STAFF accounts / organisation memberships; what does REGION_ADMIN scope?

### MANAGER-EQUALS-OWNER — canonical: GM-05 Q-07 (bucket 1)

- **Canonical:** Q-07 — [NEW] A Manager has exactly the same powers as the Owner. Keep that?
- **Why one decision:** Manager has exactly the same powers as the Owner — keep that?

### INVITE-LINKS — canonical: GM-05 Q-08 (bucket 1)

- **Canonical:** Q-08 — [NEW] Invite links: who can generate them, how long do they live, and what stops abuse?
- **Why one decision:** Invite links: who generates, how long they live, what stops abuse?

### MEMBER-REMOVED — canonical: GM-05 Q-09 (bucket 1)

- **Canonical:** Q-09 — [NEW] What happens when a member is removed — bookings, roster, history?
- **Why one decision:** Member removed — bookings, roster, history?

### MANAGER-SWITCH — canonical: GM-05 Q-11 (bucket 1)

- **Canonical:** Q-11 — [NEW] The Pharmacy Manager one-time switch: what exactly happens, and is once really once?
- **Why one decision:** Pharmacy Manager one-time switch: what exactly happens, is once really once?

### HEART — canonical: GM-05 Q-14 (bucket 1)

- **Canonical:** Q-14 — [TB-Q08] What should the heart on a talent card do?
- **Merged duplicates (1):**
  - GM-25 GM-25-C17 — GM25-C17 — TB-Q08. What should the heart on a talent card do?
- **Why one decision:** What should the heart on a talent card do (TB-Q08)?
- **Flag:** GM-25-C17 NOT RE-VALIDATED — do not ask until re-validated

### MEMBERSHIP-CAP — canonical: GM-05 Q-18 (bucket 1)

- **Canonical:** Q-18 — [NEW] The 3-pharmacy membership cap: keep it, raise it, or scope it?
- **Why one decision:** 3-pharmacy membership cap: keep, raise, or scope it?

### OWNER-MEMBERSHIP — canonical: GM-05 Q-19 (bucket 1)

- **Canonical:** Q-19 — [NEW] Should the owner's own membership really be untouchable through the normal membership screen?
- **Why one decision:** Should the owner own membership really be untouchable through the normal membership screen?

### EMPLOY-PAY-AGREEMENT — canonical: GM-06 GM-06-Q01 (bucket 1)

- **Canonical:** GM-06-Q01 — Should every employed worker have a dated pay agreement (engagement), and who sets it?
- **Why one decision:** Every employed worker has a dated pay agreement (engagement) — who sets it?

### EMPLOY-AWARD-JUNIOR — canonical: GM-06 GM-06-Q02 (bucket 1)

- **Canonical:** GM-06-Q02 — Award or above Award — and what happens when the worker has a birthday (junior rates)?
- **Why one decision:** Award or above Award; birthday (junior rates)?

### EMPLOY-PT-HOURS — canonical: GM-06 GM-06-Q03 (bucket 1)

- **Canonical:** GM-06-Q03 — Part-time contracted hours: what does the roster owe a part-timer?
- **Why one decision:** Part-time contracted hours: what does the roster owe a part-timer?

### EMPLOY-LEAVE-TYPES — canonical: GM-06 GM-06-Q04 (bucket 1)

- **Canonical:** GM-06-Q04 — Which leave types exist, and is leave paid, unpaid, or "the roster just changes"?
- **Why one decision:** Which leave types exist; paid, unpaid, or "roster just changes"?

### EMPLOY-LEAVE-BALANCES — canonical: GM-06 GM-06-Q05 (bucket 1)

- **Canonical:** GM-06-Q05 — Should the product track leave balances and entitlements, or stay request-only?
- **Why one decision:** Track leave balances/entitlements, or stay request-only?

### EMPLOY-LEAVE-APPROVED — canonical: GM-06 GM-06-Q06 (bucket 1)

- **Canonical:** GM-06-Q06 — When leave is approved, what happens to the rostered shift? (FIRST QUESTION, see Part D)
- **Why one decision:** When leave is approved, what happens to the rostered shift?

### EMPLOY-LEAVE-RANGE — canonical: GM-06 GM-06-Q07 (bucket 1)

- **Canonical:** GM-06-Q07 — Leave for a date range: who sees it, and should it block rostering inside the range?
- **Why one decision:** Leave for a date range: who sees it; block rostering inside the range?

### EMPLOY-END — canonical: GM-06 GM-06-Q08 (bucket 1)

- **Canonical:** GM-06-Q08 — When employment ends, what happens to the roster, the bookings, and the leave?
- **Why one decision:** When employment ends: roster, bookings, leave?

### EMPLOY-MIN-STAFFING — canonical: GM-06 GM-06-Q09 (bucket 1)

- **Canonical:** GM-06-Q09 — Minimum staffing (coverage requirements): a rule, a warning, or decoration?
- **Why one decision:** Minimum staffing (coverage requirements): rule, warning, or decoration?

### ROSTER-SHAPE — canonical: GM-07 GM-07-Q01 (bucket 1)

- **Canonical:** GM-07-Q01 — Is the weekly draft → validate → publish → acknowledge roster the right shape?
- **Why one decision:** Weekly draft → validate → publish → acknowledge roster — the right shape?

### ROSTER-BUILDER — canonical: GM-07 GM-07-Q02 (bucket 1)

- **Canonical:** GM-07-Q02 — Who can build and publish a roster — owner, manager, roster manager, org admin?
- **Why one decision:** Who can build and publish a roster — owner, manager, roster manager, org admin?

### ROSTER-ACK — canonical: GM-07 GM-07-Q03 (bucket 1)

- **Canonical:** GM-07-Q03 — Workers are asked to acknowledge the roster — what if they never do?
- **Why one decision:** Workers asked to acknowledge the roster — what if they never do?

### R04C-APPROVED — canonical: GM-07 GM-07-Q04 (bucket 2)

- **Canonical:** GM-07-Q04 — Should the swap/cover target have to accept before the manager approves? (carried R04C — CONTRADICTED BY THE CODE — FIRST QUESTION, see Part D)
- **Why one decision:** APPROVED R04C + IMPLEMENTATION_GAP: replacement accepts, passes role/conflict, then manager approves transfer. Code transfers without target consent (worker_actions.py). NOT a question to re-ask. Open follow-up detail (not among the 540): timeout/decline handling for the target.

### R04B-APPROVED — canonical: GM-07 GM-07-Q05 (bucket 2)

- **Canonical:** GM-07-Q05 — Who can be asked to cover — named colleagues only, or favourites and the public too? (carried R04B)
- **Why one decision:** APPROVED R04B (direction) + IMPLEMENTATION_GAP: named eligible colleagues for cover; widening to favourites/public requires manager. Direction is decided; only the widening mechanics detail is still open (needs a new narrow question — not among the 540).

### R04A-APPROVED — canonical: GM-07 GM-07-Q06 (bucket 2)

- **Canonical:** GM-07-Q06 — The "publish cover" setting: build it, or delete it? (carried R04A + LA-Q11)
- **Why one decision:** APPROVED R04A + IMPLEMENTATION_GAP: per-pharmacy owner setting controls worker-initiated cover publication; setting has no evidenced backend consumer. Build it — do not re-ask "build or delete".

### R06-APPROVED — canonical: GM-07 GM-07-Q07 (bucket 2)

- **Canonical:** GM-07-Q07 — When cover is needed, should the shift become a visible vacancy ("needs cover")?
- **Why one decision:** APPROVED R06 + IMPLEMENTATION_GAP: vacancy/needs-cover uses the SAME Shift/Slot and linked roster occurrence; visible needs-cover state not built. Build it — do not re-ask.

### COVER-TIMING — canonical: GM-07 GM-07-Q08 (bucket 1)

- **Canonical:** GM-07-Q08 — How late can a swap or cover request come in — and what happens near the start?
- **Why one decision:** How late can a swap/cover request come in — what happens near the start?

### COVER-PAY-TERMS — canonical: GM-07 GM-07-Q09 (bucket 1)

- **Canonical:** GM-07-Q09 — When a shift changes hands, whose pay terms apply — and what does the worker see?
- **Why one decision:** When a shift changes hands, whose pay terms apply — what does the worker see?

### COVER-RELEASE-TIER — canonical: GM-07 GM-07-Q10 (bucket 1)

- **Canonical:** GM-07-Q10 — Release to the marketplace: which audience, and who decides the tier?
- **Why one decision:** Release to the marketplace: which audience, who decides the tier?

### CLOCKIN-WALKIN — canonical: GM-08 GM-08-Q01 (bucket 1)

- **Canonical:** GM-08-Q01 — Who is allowed to clock in — and should a verified locum with no booking be able to walk in and work? (FIRST QUESTION, see Part D)
- **Why one decision:** Who may clock in; may a verified locum with no booking walk in and work?

### PROVISIONAL — canonical: GM-08 GM-08-Q02 (bucket 1)

- **Canonical:** GM-08-Q02 — Provisional attendance: who approves it, how fast, and what if nobody does?
- **Why one decision:** Provisional attendance: who approves, how fast, what if nobody does?

### NOSHOW — canonical: GM-15 GM-15-11 (bucket 1)

- **Canonical:** GM15-11 — CX-Q11 · When does a missing worker become a no-show? [STILL VALID]
- **Merged duplicates (1):**
  - GM-08 GM-08-Q03 — GM-08-Q03 — When does a missing worker become a no-show? (carried CX-Q11) — STILL VALID
- **Why one decision:** When does a missing worker become a no-show (CX-Q11)?

### LATE-EARLY — canonical: GM-15 GM-15-12 (bucket 1)

- **Canonical:** GM15-12 — CX-Q12 · How is late arrival treated? [STILL VALID]
- **Merged duplicates (1):**
  - GM-08 GM-08-Q04 — GM-08-Q04 — Late arrival, early departure, early finish: is there a grace period, and what counts? (carried CX-Q12) — STILL VALID
- **Why one decision:** Late arrival, early departure, early finish: grace period, what counts (CX-Q12)?

### KIOSK-OFFLINE — canonical: GM-08 GM-08-Q05 (bucket 1)

- **Canonical:** GM-08-Q05 — Offline kiosk: how long may it run offline, and what happens to suspicious events?
- **Why one decision:** Offline kiosk: how long may it run offline; suspicious events?

### KIOSK-PIN — canonical: GM-08 GM-08-Q06 (bucket 1)

- **Canonical:** GM-08-Q06 — PIN clock-in: keep it, who sets the PIN, and is 5-tries / 15-minutes right? (NEW)
- **Why one decision:** PIN clock-in: keep it, who sets the PIN, is 5-tries/15-minutes right?

### QR-PARAMS-VERIFY — canonical: GM-08 GM-08-Q07 (bucket 4)

- **Canonical:** GM-08-Q07 — QR scanning: confirm the current parameters and change nothing (scope freeze)
- **Why one decision:** Verification item, not an owner decision: confirm the current QR parameters and change nothing (scope freeze). Needs evidence, not an owner choice.

### BREAKS — canonical: GM-08 GM-08-Q09 (bucket 1)

- **Canonical:** GM-08-Q09 — Breaks: paid or unpaid, how long, and who decides? (NEW, boundary with GM-09/GM-14)
- **Why one decision:** Breaks: paid or unpaid, how long, who decides? (boundary GM-09/GM-14)

### MANAGER-CLOCKIN — canonical: GM-08 GM-08-Q10 (bucket 1)

- **Canonical:** GM-08-Q10 — Can a manager clock someone in or out for them? (MANAGER source) (NEW)
- **Why one decision:** Can a manager clock someone in or out for them?

### PAYER-MODEL — canonical: GM-09 Q1 (bucket 1)

- **Canonical:** Q1 — Who pays whom, and when? (payment ownership — ASK FIRST, see §4)
- **Why one decision:** Who pays whom, and when? (payment ownership — RATE-01 depends on this.)

### TIMESHEET-SOURCE — canonical: GM-09 Q2 (bucket 1)

- **Canonical:** Q2 — How is a timesheet created, and from what source of truth?
- **Why one decision:** How is a timesheet created, and from what source of truth?

### TIMESHEET-APPROVAL — canonical: GM-09 Q3 (bucket 1)

- **Canonical:** Q3 — Who approves a timesheet, by when, and what happens if nobody does?
- **Why one decision:** Who approves a timesheet, by when, what happens if nobody does?

### TIMESHEET-CORRECTIONS — canonical: GM-09 Q4 (bucket 1)

- **Canonical:** Q4 — How are corrections handled before and after approval?
- **Why one decision:** How are corrections handled before and after approval?

### PAYROLL-EXPORT — canonical: GM-09 Q6 (bucket 1)

- **Canonical:** Q6 — What does the payroll export contain, and where does it go?
- **Why one decision:** What does the payroll export contain, and where does it go?

### ABN-TFN — canonical: GM-09 Q7 (bucket 1)

- **Canonical:** Q7 — ABN and TFN: what is collected, from whom, and how is it stored?
- **Why one decision:** ABN and TFN: collected from whom, how stored?

### PAY-RECORDS — canonical: GM-09 Q9 (bucket 1)

- **Canonical:** Q9 — What records are kept, for how long, and who can see a worker's pay history?
- **Why one decision:** What records are kept, for how long, who can see a worker pay history? Distinct from ON-R01 (verification-evidence retention).

### PAY-FAILURE-PATHS — canonical: GM-09 Q10 (bucket 1)

- **Canonical:** Q10 — What happens on the failure paths: no-show, early departure, shift cancelled mid-way, kiosk offline?
- **Why one decision:** Failure paths: no-show, early departure, shift cancelled mid-way, kiosk offline?

### POST-WHO — canonical: GM-10 GM-10-Q01 (bucket 1)

- **Canonical:** GM-10-Q01 — Who can post a shift, and from where?
- **Why one decision:** Who can post a shift, and from where?

### POST-FIELDS — canonical: GM-10 GM-10-Q02 (bucket 1)

- **Canonical:** GM-10-Q02 — What fields are required to post a shift, and what happens when one is missing?
- **Why one decision:** What fields are required to post a shift; what happens when one is missing?

### RATE-01 — canonical: GM-10 GM-10-Q03 (bucket 1)

- **Canonical:** GM-10-Q03 — Must a shift carry a fixed hourly rate at posting, or can the rate be open/negotiable? [FIRST — see §3]
- **Why one decision:** Fixed vs negotiable rate (queue s2.10 RATE-01). Ask only AFTER PAYER-MODEL (GM-09-Q01) and the GM-14 Award floor are decided.

### LOADINGS — canonical: GM-10 GM-10-Q04 (bucket 1)

- **Canonical:** GM-10-Q04 — How are overtime, weekend and public-holiday loadings handled?
- **Merged duplicates (1):**
  - GM-09 Q5 — Q5 — Which rate applies: base, overtime, weekend and public-holiday premiums?
- **Why one decision:** How overtime, weekend and public-holiday loadings are handled (GM-10-Q04 = GM-09-Q5, same rule).

### POST-EDIT — canonical: GM-10 GM-10-Q06 (bucket 1)

- **Canonical:** GM-10-Q06 — Can a posted shift be edited, and what changes after interest or acceptance?
- **Why one decision:** Can a posted shift be edited; what changes after interest or acceptance?

### POST-WITHDRAW — canonical: GM-10 GM-10-Q07 (bucket 1)

- **Canonical:** GM-10-Q07 — Can a posted shift be withdrawn, and what happens to workers who already saw it or applied?
- **Why one decision:** Can a posted shift be withdrawn; what happens to workers who saw/applied?

### POST-DRAFTS — canonical: GM-10 GM-10-Q09 (bucket 1)

- **Canonical:** GM-10-Q09 — Do drafts exist, and what does publishing a draft do?
- **Why one decision:** Do drafts exist; what does publishing a draft do?

### POST-REPOST — canonical: GM-10 GM-10-Q10 (bucket 1)

- **Canonical:** GM-10-Q10 — How does reposting work, and what carries over?
- **Why one decision:** How does reposting work; what carries over?

### POST-TRIGGERS — canonical: GM-10 GM-10-Q11 (bucket 1)

- **Canonical:** GM-10-Q11 — What does posting trigger (notifications, fees, matching), and what do edit/withdraw/repost trigger?
- **Why one decision:** What does posting trigger (notifications, fees, matching); what do edit/withdraw/repost trigger? Notification half is settled by EVENT-CATALOGUE once decided.

### POST-ZERO — canonical: GM-10 GM-10-Q12 (bucket 1)

- **Canonical:** GM-10-Q12 — NEW: Can a shift ever be posted, displayed or paid at $0.00?
- **Why one decision:** Can a shift ever be posted, displayed or paid at $0.00?

### ESCALATION-NOTIFY — canonical: GM-11 GM-11-Q01 (bucket 1)

- **Canonical:** GM-11-Q01 — When a shift escalates, who is told, and when does escalation stop? 🔴 [FIRST — see §4]
- **Merged duplicates (4):**
  - GM-22 GM-22-01 — GM22-01 · PO-Q08 — When a shift escalates, who is told, and when does escalation stop? 🔴 decision · gap SH-06 — CHANGED
  - GM-24 GM-24-Q10 — GM-24-Q10 — When a shift escalates, who is told, and when does escalation stop?
  - GM-25 GM-25-C20 — GM25-C20 — PO-Q08 / PO-Q10. Escalation: who is told, and how late may it fire?
  - GM-12 GM-12-Q19 — GM-12-Q19 — When a shift escalates, who is told, and does a pending offer pause it?
- **Why one decision:** When a shift escalates, who is told, and when does escalation stop (PO-Q08). GM-25-C20 and GM-12-Q19 also carry the PO-Q10 / PO-Q09 halves — covered by ESCALATION-LATE and ESCALATION-PAUSE.

### ESCALATION-PAUSE — canonical: GM-11 GM-11-Q02 (bucket 1)

- **Canonical:** GM-11-Q02 — Should escalation pause while an offer waits for an answer? 🟠
- **Merged duplicates (1):**
  - GM-22 GM-22-13 — GM22-13 · PO-Q09 — Should escalation pause while an offer waits for an answer? 🟡 decision — CHANGED
- **Why one decision:** Should escalation pause while an offer waits for an answer (PO-Q09)?

### ESCALATION-LATE — canonical: GM-11 GM-11-Q03 (bucket 1)

- **Canonical:** GM-11-Q03 — How late may a scheduled escalation fire? 🔴 (code gap once decided)
- **Merged duplicates (1):**
  - GM-22 GM-22-11 — GM22-11 · PO-Q10 — How late may a scheduled escalation fire? 🟠 code · gap SH-05 — CHANGED
- **Why one decision:** How late may a scheduled escalation fire (PO-Q10)?

### LAZY-ESCALATION-GAP — canonical: GM-11 GM-11-Q04 (bucket 3)

- **Canonical:** GM-11-Q04 — Fix before launch? Scheduled escalation only runs when someone loads a shift list. 🔴 (code gap)
- **Merged duplicates (1):**
  - GM-22 GM-22-12 — GM22-12 · LA-Q08 — Fix before launch? Scheduled escalation only runs when someone loads a shift list. 🔴 code · gap SH-05 — CHANGED
- **Why one decision:** Implementation gap: scheduled escalation only runs when someone loads a shift list (SH-05 / LA-Q08). Build a deterministic scheduler; the owner picks timing only via LAUNCH-01.

### MATCH-EMAILS-GAP — canonical: GM-11 GM-11-Q05 (bucket 3)

- **Canonical:** GM-11-Q05 — Fix before launch? Match emails miss escalated shifts and reach unverified workers. 🟠 (code gap)
- **Merged duplicates (3):**
  - GM-22 GM-22-10 — GM22-10 · LA-Q17 — Fix before launch? Match emails miss escalated shifts and reach unverified workers. 🔴 code · gap AV-04 — CHANGED (partial)
  - GM-23 GM-23-16 — GM-23-16 — LA-Q17 / AV-04. Match emails miss escalated shifts and reach unverified workers. Fix before launch? (re-verified this trace)
  - GM-24 GM-24-Q19 — GM-24-Q19 — Should match emails go to unverified workers, and should escalated shifts notify?
- **Why one decision:** Implementation gap: match emails miss escalated shifts and reach unverified workers (LA-Q17 / AV-04). Fix once VERIFY-GATE is decided. GM-24-Q19 also carries the VERIFY-GATE half.

### LATER-TIER — canonical: GM-11 GM-11-Q06 (bucket 1)

- **Canonical:** GM-11-Q06 — Who can start at a later tier, and can a tier be skipped entirely? 🟡
- **Why one decision:** Who can start at a later tier; can a tier be skipped entirely?

### ANON-HIDDEN — canonical: GM-11 GM-11-Q07 (bucket 1)

- **Canonical:** GM-11-Q07 — On an anonymous public post, what is hidden? 🟡
- **Merged duplicates (3):**
  - GM-24 GM-24-Q08 — GM-24-Q08 — On an anonymous public post, what is hidden?
  - GM-26 GM-26-Q15 — GM26-Q15 — [P1 · decision] On an anonymous public post, what is hidden? (pharmacy anonymity)
  - GM-24 GM-24-Q25 — GM-24-Q25 — NEW: Anonymous pharmacy detail keeps postcode + script volume — hide more?
- **Why one decision:** On an anonymous public post, what is hidden (pharmacy anonymity)? GM-24-Q25 (postcode + script volume) is the detail facet.

### ANON-REVEAL — canonical: GM-11 GM-11-Q08 (bucket 1)

- **Canonical:** GM-11-Q08 — When does an anonymous pharmacy's name reach the worker? 🟠
- **Merged duplicates (3):**
  - GM-22 GM-22-14 — GM22-14 · PO-Q12 — When does an anonymous pharmacy's name reach the worker? 🟠 decision — CHANGED (leak wider than Oct)
  - GM-24 GM-24-Q09 — GM-24-Q09 — When does an anonymous pharmacy's name reach the worker?
  - GM-26 GM-26-Q16 — GM26-Q16 — [P1 · decision] When does an anonymous pharmacy's name reach the worker?
- **Why one decision:** When does an anonymous pharmacy name reach the worker (PO-Q12)?

### URGENCY — canonical: GM-11 GM-11-Q09 (bucket 1)

- **Canonical:** GM-11-Q09 — What makes a shift "urgent", and does urgency change the audience/escalation? 🟡
- **Why one decision:** What makes a shift "urgent"; does urgency change audience/escalation? Distinct from URGENT-OPTIN (separate opt-in for alerts).

### E01-APPROVED — canonical: GM-11 GM-11-Q11 (bucket 2)

- **Canonical:** GM-11-Q11 — Who sees a shift, and can apply, at each tier — and what is gated? 🟡
- **Why one decision:** APPROVED E01/E01A: cumulative staff/favourites/owner-chain/org/public eligible access; notification skip is not access revocation. The tier-visibility half is decided; the gating half is VERIFY-GATE.

### E01B-NOTIF-FLAGS — canonical: GM-22 GM-22-20 (bucket 1)

- **Canonical:** GM22-20 · NEW — What notification preferences can a worker (and a pharmacy) set — including quiet hours? 🟡 decision — TRACED
- **Merged duplicates (1):**
  - GM-11 GM-11-Q12 — GM-11-Q12 — Do notification flags control escalation notices per tier, and is there an organisation-wide broadcast? 🟡
- **Why one decision:** Notification preferences (incl. quiet hours) — canonical GM-22-Q20. GM-11-Q12 also carries the org-wide-broadcast half, which is APPROVED E01B (no organisation-wide worker broadcast); its flags half merges here.

### E01A-APPROVED — canonical: GM-11 GM-11-Q13 (bucket 2)

- **Canonical:** GM-11-Q13 — NEW: A favourite loses visibility when the shift escalates past LOCUM_CASUAL — keep it or fix it? 🟠
- **Why one decision:** APPROVED E01A + IMPLEMENTATION_GAP: widened audiences retain earlier eligible visibility. A favourite losing visibility on widening is a drift to fix (negative visibility test), not a policy choice.

### SHIFT-WAYS — canonical: GM-12 GM-12-Q06 (bucket 1)

- **Canonical:** GM-12-Q06 — Which ways can a worker get a shift at launch?
- **Why one decision:** Which ways can a worker get a shift at launch?

### INSTANT-BOOK — canonical: GM-12 GM-12-Q07 (bucket 1)

- **Canonical:** GM-12-Q07 — Who may instant-book or be auto-accepted?
- **Why one decision:** Who may instant-book or be auto-accepted?

### APPLICANT-ORDER — canonical: GM-12 GM-12-Q08 (bucket 1)

- **Canonical:** GM-12-Q08 — How should applicants be ordered for the pharmacy?
- **Why one decision:** How should applicants be ordered for the pharmacy?

### APPLICANT-REVEAL — canonical: GM-12 GM-12-Q09 (bucket 1)

- **Canonical:** GM-12-Q09 — What should the pharmacy see on each applicant? (incl. reveal)
- **Why one decision:** What should the pharmacy see on each applicant (incl. reveal)? Shift-applicant reveal; distinct from TALENT-REVEAL (talent board).

### OFFER-EXPIRY — canonical: GM-12 GM-12-Q10 (bucket 1)

- **Canonical:** GM-12-Q10 — How long does an offer stay open?
- **Merged duplicates (2):**
  - GM-13 GM-13-Q05 — GM13-Q05 — How long does an offer stay open? (carried BK-Q05 / LA-Q09 / SH-07)
  - GM-18 GM-18-Q18 — GM-18 GM-18-Q18 — Lifecycle — 48h flat offer expiry (confirmed fact)
- **Why one decision:** How long does an offer stay open (BK-Q05 / LA-Q09 / SH-07; 48h flat today)?
- **Flag:** GM-18-Q18 title unrecovered (senior-review grouping: lifecycle)

### OFFER-DECLINED — canonical: GM-12 GM-12-Q11 (bucket 1)

- **Canonical:** GM-12-Q11 — When an offer is declined or expires, what happens to the shift?
- **Merged duplicates (3):**
  - GM-11 GM-11-Q10 — GM-11-Q10 — When an offer is declined or expires, what happens to the shift's audience? 🟠
  - GM-13 GM-13-Q06 — GM13-Q06 — When an offer is declined or expires, what happens to the shift? (carried BK-Q06)
  - GM-22 GM-22-02 — GM22-02 · BK-Q06 — When an offer is declined or expires, what happens to the shift? 🟠 decision · gap D06 — CHANGED
- **Why one decision:** When an offer is declined or expires, what happens to the shift (BK-Q06)?

### MULTI-OFFER — canonical: GM-12 GM-12-Q12 (bucket 1)

- **Canonical:** GM-12-Q12 — Can a pharmacy offer one shift to several workers at once?
- **Merged duplicates (1):**
  - GM-13 GM-13-Q07 — GM13-Q07 — Can a pharmacy offer one shift to several workers at once? (carried BK-Q07)
- **Why one decision:** Can a pharmacy offer one shift to several workers at once (BK-Q07)?

### COUNTER — canonical: GM-12 GM-12-Q13 (bucket 1)

- **Canonical:** GM-12-Q13 — What can a worker counter?
- **Why one decision:** What can a worker counter?

### COUNTER-ACCEPT — canonical: GM-12 GM-12-Q14 (bucket 1)

- **Canonical:** GM-12-Q14 — If the pharmacy accepts a counter-offer, is the worker booked?
- **Why one decision:** If the pharmacy accepts a counter-offer, is the worker booked?

### D01-APPROVED — canonical: GM-12 GM-12-Q15 (bucket 2)

- **Canonical:** GM-12-Q15 — NEW: When payment is required, should the first acceptance hold the slot against rival offers?
- **Why one decision:** APPROVED D01: external offer acceptance reserves; verified booking payment confirms. First acceptance holding the slot against rival offers is the reserve rule. Concurrency tests remain (verification), not a new policy question.

### WITHDRAW-OFFER — canonical: GM-12 GM-12-Q16 (bucket 1)

- **Canonical:** GM-12-Q16 — NEW: Can the pharmacy withdraw a pending offer? What is the worker told?
- **Why one decision:** Can the pharmacy withdraw a pending offer? What is the worker told?

### WITHDRAW-INTEREST — canonical: GM-12 GM-12-Q17 (bucket 1)

- **Canonical:** GM-12-Q17 — NEW: Should withdrawing interest tell the pharmacy?
- **Why one decision:** Should withdrawing interest tell the pharmacy?

### OFFER-01 — canonical: GM-18 GM-18-Q07 (bucket 1)

- **Canonical:** GM-18 GM-18-Q07 — Firm offer vs enquiry (senior review: KEEP, superseded by OFFER-01)
- **Merged duplicates (3):**
  - GM-12 GM-12-Q18 — GM-12-Q18 — Is "Request booking" (Talent Board) a firm offer or an enquiry?
  - GM-24 GM-24-Q14 — GM-24-Q14 — Is "Request booking" a firm offer or an enquiry?
  - GM-25 GM-25-C16 — GM25-C16 — TB-Q07. Is "Request booking" a firm offer or an enquiry?
- **Why one decision:** Firm offer vs enquiry when a pharmacy contacts a talent-board worker (queue s2.2 OFFER-01). Recommended C: enquiry first on public contacts, firm offer for favourites/members.
- **Flag:** GM-18-Q07 title confirmed by senior review (firm offer, KEEP recommendation superseded by OFFER-01 option C)

### OVERLAP-APPLICATIONS — canonical: GM-12 GM-12-Q21 (bucket 1)

- **Canonical:** GM-12-Q21 — When a worker is booked, what happens to their overlapping applications?
- **Why one decision:** When a worker is booked, what happens to their overlapping applications?

### OVERLAP-HOLD — canonical: GM-12 GM-12-Q22 (bucket 1)

- **Canonical:** GM-12-Q22 — Can a worker hold a reservation that overlaps another booking or roster shift?
- **Why one decision:** Can a worker hold a reservation that overlaps another booking or roster shift?

### MUST-HAVE — canonical: GM-12 GM-12-Q23 (bucket 1)

- **Canonical:** GM-12-Q23 — Should must-have requirements block applying?
- **Why one decision:** Should must-have requirements block applying?

### GM12-TIMING-GAP — canonical: GM-12 GM-12-Q26 (bucket 3)

- **Canonical:** GM-12-Q26 — Code-gap timing questions (LAUNCH area, GM-12 slice)
- **Why one decision:** Implementation-gap timing bundle (LAUNCH area, GM-12 slice). No owner policy choice; timing via LAUNCH-01.

### D02-APPROVED — canonical: GM-13 GM-13-Q01 (bucket 2)

- **Canonical:** GM13-Q01 — The pay-by window does not exist. Should D02 be built as decided, or is Stripe's 24 hours the rule? (carried D02 — FIRST QUESTION, see Part D)
- **Why one decision:** APPROVED D02 + IMPLEMENTATION_GAP: 24h / 6h / 2h / 30min pay-by windows, never beyond start. Stripe provider expiry is not the D02 policy. Build the server-owned deadline + expiry worker (queue s2.11 PAYBY-01).

### D03-APPROVED — canonical: GM-13 GM-13-Q02 (bucket 2)

- **Canonical:** GM13-Q02 — When a reservation expires unpaid, what exactly happens? (carried D03)
- **Why one decision:** APPROVED D03 + IMPLEMENTATION_GAP: unpaid expiry releases the SAME existing audience, not a wider tier; worker + manager notified; no penalty. Build idempotent release + notices.

### COUNTDOWN — canonical: GM-13 GM-13-Q03 (bucket 1)

- **Canonical:** GM13-Q03 — Should reservations show a live payment countdown? (carried BK-Q13)
- **Merged duplicates (2):**
  - GM-12 GM-12-Q24 — GM-12-Q24 — Should reservations show a live payment countdown? / What happens after booking payment fails?
  - GM-25 GM-25-C18 — GM25-C18 — BK-Q13. Should reservations show a live payment countdown?
- **Why one decision:** Should reservations show a live payment countdown (BK-Q13)? GM-12-Q24 also carries the BK-R01 half — covered by PAYMENT-FAIL.
- **Flag:** GM-25-C18 NOT RE-VALIDATED — do not ask until re-validated

### DROP-RESERVATION — canonical: GM-13 GM-13-Q04 (bucket 1)

- **Canonical:** GM13-Q04 — Can a worker drop a reservation before payment without an incident? (carried BK-Q14)
- **Merged duplicates (2):**
  - GM-12 GM-12-Q20 — GM-12-Q20 — Can a worker drop a reservation before payment without an incident?
  - GM-15 GM-15-40 — GM15-40 — BK-Q14 · Can a worker drop a reservation before payment without an incident? [STILL VALID]
- **Why one decision:** Can a worker drop a reservation before payment without an incident (BK-Q14)?

### PAYMENT-FAIL — canonical: GM-13 GM-13-Q08 (bucket 1)

- **Canonical:** GM13-Q08 — What happens after booking payment fails? (carried BK-R01; SH-13 has no definition)
- **Merged duplicates (2):**
  - GM-15 GM-15-41 — GM15-41 — BK-R01 · What happens after booking payment fails? [STILL VALID — strengthened]
  - GM-16 GM-16-Q07 — GM16-Q07 — [BK-R01 / SH-13] What happens after booking payment fails? — 🔄 CHANGED (mechanism verified; SH-13 undefined)
- **Why one decision:** What happens after booking payment fails (BK-R01)?

### LATE-PAYMENT — canonical: GM-13 GM-13-Q09 (bucket 1)

- **Canonical:** GM13-Q09 — Payment arrives after expiry: credit, refund, or nothing — and who decides? (carried F04; GM-17 boundary)
- **Why one decision:** Payment arrives after expiry: credit, refund, or nothing — who decides? Distinct scenario from REFUND-01 (pharmacy cancels a paid booking); same policy family.

### LEGACY-PENALTY — canonical: GM-16 GM-16-Q03 (bucket 1)

- **Canonical:** GM16-Q03 — [LA-Q06 / SH-02] Fix before launch? The old 10%/20% penalty route is still live. — ✅ STILL VALID as code-present (routing now verified)
- **Merged duplicates (3):**
  - GM-13 GM-13-Q12 — GM13-Q12 — The old 10%/20% penalty route is still live. Remove it? (carried LA-Q06 / SH-02; GM-16 owns the charge)
  - GM-15 GM-15-46 — GM15-46 — LA-Q06 / SH-02 · The old 10%/20% penalty route is still live [CHANGED — WORSE + GATED]
  - GM-17 GM-17-Q17 — GM17-Q17 — Cancellation penalty: fix the charge before it can ever be used? (NEW, code gap with decision attached)
- **Why one decision:** The old 10%/20% penalty route is still live (LA-Q06 / SH-02): remove it, or replace with the P09 table? Gated by LEGAL-REVIEW. GM-17-Q17 is the same charge-fix question.

### SUPER-PAYABILITY — canonical: GM-14 GM-14-Q01 (bucket 1)

- **Canonical:** GM14-Q01 — Who ever decides whether super is payable for an ABN contractor — and what happens until they do? (new, from verified code)
- **Why one decision:** Who ever decides whether super is payable for an ABN contractor — what happens until they do?

### WORKER-SEES — canonical: GM-14 GM-14-Q02 (bucket 1)

- **Canonical:** GM14-Q02 — What must the worker see before accepting? (carried AG-Q01 / SH-09)
- **Merged duplicates (1):**
  - GM-12 GM-12-Q25 — GM-12-Q25 — What must the worker see before accepting? Does the pharmacy accept the same agreement?
- **Why one decision:** What must the worker see before accepting (AG-Q01 / SH-09)? GM-12-Q25 also carries the AG-Q02 half — covered by ACCEPT-01.

### ACCEPT-01 — canonical: GM-14 GM-14-Q03 (bucket 1)

- **Canonical:** GM14-Q03 — Does the pharmacy accept the same agreement? (carried AG-Q02 / SH-09 — FIRST QUESTION, see Part D)
- **Merged duplicates (1):**
  - GM-16 GM-16-Q18 — GM16-Q18 — [AG-Q01/AG-Q02, GM-16 angle] Does the pharmacy ever agree the fee/subscription terms that bind it? — ✅ STILL VALID (now verified via GM-14)
- **Why one decision:** Does the pharmacy accept the same agreement the worker accepts, logged with time + version (queue s2.6 ACCEPT-01, AG-Q02)?

### EMPLOYMENT-STATUS — canonical: GM-14 GM-14-Q04 (bucket 1)

- **Canonical:** GM14-Q04 — How is employee vs contractor status decided? (carried AG-Q04)
- **Why one decision:** How is employee vs contractor status decided (AG-Q04)?

### PDF-COPY — canonical: GM-14 GM-14-Q06 (bucket 1)

- **Canonical:** GM14-Q06 — Should both sides get a PDF copy of the agreement? (carried AG-Q03)
- **Merged duplicates (1):**
  - GM-22 GM-22-15 — GM22-15 · AG-Q03 — Should both sides get a PDF copy of the agreement? 🟡 decision — NOT RE-VALIDATED
- **Why one decision:** Should both sides get a PDF copy of the agreement (AG-Q03)?
- **Flag:** GM-22-Q15 NOT RE-VALIDATED — do not ask until re-validated

### CHANGE-CONSENT — canonical: GM-14 GM-14-Q07 (bucket 1)

- **Canonical:** GM14-Q07 — Which changes after booking need the worker's new consent? (carried AG-Q05 / SH-08 — NOT RE-VALIDATED)
- **Why one decision:** Which changes after booking need the worker new consent (AG-Q05 / SH-08)?
- **Flag:** File flags NOT RE-VALIDATED — do not ask until re-validated

### TERMS-UNTIL-ANSWER — canonical: GM-14 GM-14-Q08 (bucket 1)

- **Canonical:** GM14-Q08 — Until the worker answers a change, which terms apply? (carried AG-Q06 — NOT RE-VALIDATED)
- **Why one decision:** Until the worker answers a change, which terms apply (AG-Q06)?
- **Flag:** File flags NOT RE-VALIDATED — do not ask until re-validated

### REJECT-CHANGE — canonical: GM-14 GM-14-Q09 (bucket 1)

- **Canonical:** GM14-Q09 — If the worker rejects the change, what happens? (carried AG-Q07 — NOT RE-VALIDATED)
- **Why one decision:** If the worker rejects the change, what happens (AG-Q07)?
- **Flag:** File flags NOT RE-VALIDATED — do not ask until re-validated

### LOCK-FIELDS — canonical: GM-14 GM-14-Q10 (bucket 1)

- **Canonical:** GM14-Q10 — Until re-consent is built, lock key fields after the first acceptance? (carried AG-Q08 / SH-08 — NOT RE-VALIDATED)
- **Why one decision:** Until re-consent is built, lock key fields after the first acceptance (AG-Q08 / SH-08)?
- **Flag:** File flags NOT RE-VALIDATED — do not ask until re-validated

### AWARD-UPDATER — canonical: GM-14 GM-14-Q12 (bucket 1)

- **Canonical:** GM14-Q12 — (new) Who updates the Award rates, and when? (from verified code)
- **Why one decision:** Who updates the Award rates, and when?

### REFUND-01 — canonical: GM-17 GM-17-Q01 (bucket 1)

- **Canonical:** GM17-Q01 — FIRST QUESTION (ask this first)
- **Merged duplicates (9):**
  - GM-17 GM-17-Q02 — GM17-Q02 — Worker cancels or no-shows: what happens to the booking fee?
  - GM-17 GM-17-Q03 — GM17-Q03 — Who approves refunds and credits, and how fast?
  - GM-17 GM-17-Q05 — GM17-Q05 — How is the worker's cancellation pay paid out?
  - GM-15 GM-15-19 — GM15-19 — CX-Q19 · When the pharmacy cancels a paid booking, what happens to the booking fee? [STILL VALID]
  - GM-15 GM-15-20 — GM15-20 — CX-Q20 · When the worker cancels or no-shows, what happens to the booking fee? [STILL VALID]
  - GM-15 GM-15-21 — GM15-21 — CX-Q21 · Who approves refunds and credits? [STILL VALID]
  - GM-15 GM-15-22 — GM15-22 — CX-Q22 · How is the worker's cancellation pay paid out? [STILL VALID]
  - GM-16 GM-16-Q12 — GM16-Q12 — [CX-Q19 / CX-Q20 / CX-Q21 / CX-Q22] Booking-fee refunds/credits and cancellation pay — ✅ STILL VALID as "not built" (now verified)
  - GM-26 GM-26-Q21 — GM26-Q21 — [P1 · decision] Who approves refunds and credits? (platform admin finance role)
- **Why one decision:** When a pharmacy cancels a paid booking: cash refund, platform credit, or nothing (queue s2.5 REFUND-01; recommended C — refund over 72h, credit inside). GM-17-Q03/Q05 and GM-15-Q21/Q22 (CX-Q21/Q22) are the approver + cancellation-pay facets of the same decision.
- **Flag:** GM-26-Q21 NOT RE-VALIDATED — do not ask until re-validated

### CANCEL-LAUNCH — canonical: GM-15 GM-15-01 (bucket 1)

- **Canonical:** GM15-01 — CX-Q01 · What cancellation can launch, given fees are not yet enforceable? [STILL VALID]
- **Why one decision:** What cancellation can launch, given fees are not yet enforceable (CX-Q01)?

### OWNER-FEE — canonical: GM-15 GM-15-02 (bucket 1)

- **Canonical:** GM15-02 — CX-Q02 · Who receives the owner cancellation fee? [STILL VALID]
- **Merged duplicates (2):**
  - GM-16 GM-16-Q11 — GM16-Q11 — [CX-Q02 + P09 + NOPEN] Who receives the owner cancellation fee, and does the legacy penalty conflict? — ❓ + verified conflict
  - GM-17 GM-17-Q04 — GM17-Q04 — Who receives the owner cancellation fee (the 10%/20% penalty)?
- **Why one decision:** Who receives the owner cancellation fee (CX-Q02)? P09 bands themselves are carried; the recipient is open. GM-16-Q11 also carries the legacy-penalty conflict — covered by LEGACY-PENALTY.

### UNPAID-FEE — canonical: GM-15 GM-15-03 (bucket 1)

- **Canonical:** GM15-03 — CX-Q03 · If the pharmacy cancels an unpaid reservation, is any fee due? [STILL VALID]
- **Merged duplicates (1):**
  - GM-16 GM-16-Q13 — GM16-Q13 — [CX-Q03] If the pharmacy cancels an unpaid reservation, is any fee due? — ✅ STILL VALID (now verified)
- **Why one decision:** If the pharmacy cancels an unpaid reservation, is any fee due (CX-Q03)?

### BOUNDARY-BANDS — canonical: GM-15 GM-15-04 (bucket 1)

- **Canonical:** GM15-04 — CX-Q04 · At exactly 72h / 24h / 12h / 2h, which band applies? [CHANGED]
- **Why one decision:** At exactly 72h / 24h / 12h / 2h, which P09 band applies (CX-Q04)? CONFLICT NOTE: GM-16 carried-decision note asserts the boundary rule as KEEP (milder band); GM-15 still asks it. Confirm with the owner rather than assuming.

### NOTICE-WINDOW — canonical: GM-15 GM-15-05 (bucket 1)

- **Canonical:** GM15-05 — CX-Q05 · How much notice counts as "enough window" for a normal manager approval? [STILL VALID]
- **Why one decision:** How much notice counts as "enough window" for a normal manager approval (CX-Q05)?

### ALERT-SPEED — canonical: GM-15 GM-15-06 (bucket 1)

- **Canonical:** GM15-06 — CX-Q06 · Inside the window, who is alerted and how fast? [STILL VALID]
- **Merged duplicates (1):**
  - GM-22 GM-22-07 — GM22-07 · CX-Q06 — Inside the window, who is alerted and how fast? 🔴 decision · gap R04D — NOT RE-VALIDATED
- **Why one decision:** Inside the window, who is alerted and how fast (CX-Q06)?
- **Flag:** GM-22-Q07 NOT RE-VALIDATED — do not ask until re-validated

### NO-MANAGER-ANSWER — canonical: GM-15 GM-15-07 (bucket 1)

- **Canonical:** GM15-07 — CX-Q07 · If no manager answers before start and the worker doesn't come, what is it? [STILL VALID]
- **Why one decision:** If no manager answers before start and the worker does not come, what is it (CX-Q07)?

### MUTUAL-CANCEL — canonical: GM-15 GM-15-08 (bucket 1)

- **Canonical:** GM15-08 — CX-Q08 · How is a mutually agreed cancellation proven and approved? [STILL VALID]
- **Why one decision:** How is a mutually agreed cancellation proven and approved (CX-Q08)?

### ILLNESS-EVIDENCE — canonical: GM-15 GM-15-09 (bucket 1)

- **Canonical:** GM15-09 — CX-Q09 · What evidence may support an illness or emergency exemption? [STILL VALID]
- **Why one decision:** What evidence may support an illness or emergency exemption (CX-Q09)?

### PHARMACY-EMERGENCY — canonical: GM-15 GM-15-10 (bucket 1)

- **Canonical:** GM15-10 — CX-Q10 · Can a pharmacy emergency (closure, outage) waive the owner fee? [STILL VALID]
- **Why one decision:** Can a pharmacy emergency (closure, outage) waive the owner fee (CX-Q10)?

### NOSHOW-CONFIRM — canonical: GM-15 GM-15-13 (bucket 1)

- **Canonical:** GM15-13 — CX-Q13 · How is a no-show confirmed? [STILL VALID]
- **Why one decision:** How is a no-show confirmed (CX-Q13)?

### MULTIDATE-INCIDENTS — canonical: GM-15 GM-15-14 (bucket 1)

- **Canonical:** GM15-14 — CX-Q14 · If a worker cancels several dates of one booking, how many incidents is that? [STILL VALID]
- **Why one decision:** If a worker cancels several dates of one booking, how many incidents is that (CX-Q14)?

### REOPEN-AFTER-CANCEL — canonical: GM-15 GM-15-15 (bucket 1)

- **Canonical:** GM15-15 — CX-Q15 · After a confirmed booking is cancelled, how does the shift reopen? [STILL VALID]
- **Why one decision:** After a confirmed booking is cancelled, how does the shift reopen (CX-Q15)?

### RELEASE-NOSHOW-SLOT — canonical: GM-15 GM-15-16 (bucket 1)

- **Canonical:** GM15-16 — CX-Q16 · Can the manager release a no-show's slot and repost straight away? [STILL VALID]
- **Why one decision:** Can the manager release a no-show slot and repost straight away (CX-Q16)?

### REPLACEMENT-INCIDENT — canonical: GM-15 GM-15-17 (bucket 1)

- **Canonical:** GM15-17 — CX-Q17 · If a worker's cancelled shift is filled by a replacement, what happens to the incident? [STILL VALID]
- **Why one decision:** If a worker cancelled shift is filled by a replacement, what happens to the incident (CX-Q17)?

### REPLACEMENT-WAIVER — canonical: GM-15 GM-15-18 (bucket 1)

- **Canonical:** GM15-18 — CX-Q18 · If the pharmacy cancels but offers the worker equal replacement work, is the fee waived? [STILL VALID]
- **Why one decision:** If the pharmacy cancels but offers equal replacement work, is the fee waived (CX-Q18)?

### DISPUTE-REVIEWER — canonical: GM-15 GM-15-23 (bucket 1)

- **Canonical:** GM15-23 — CX-Q23 · Who reviews disputes and appeals? [STILL VALID]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q22 — GM26-Q22 — [P1 · decision] Who reviews disputes and appeals?
- **Why one decision:** Who reviews disputes and appeals (CX-Q23)?
- **Flag:** GM-26-Q22 NOT RE-VALIDATED — do not ask until re-validated

### APPEAL-TIMING — canonical: GM-15 GM-15-24 (bucket 1)

- **Canonical:** GM15-24 — CX-Q24 · How long to appeal, and how fast must support answer? [STILL VALID]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q23 — GM26-Q23 — [P2 · decision] How long to appeal, and how fast must support answer?
- **Why one decision:** How long to appeal, and how fast must support answer (CX-Q24)?
- **Flag:** GM-26-Q23 NOT RE-VALIDATED — do not ask until re-validated

### DISPUTE-VISIBILITY — canonical: GM-15 GM-15-25 (bucket 1)

- **Canonical:** GM15-25 — CX-Q25 · Who can see each part of a dispute? [STILL VALID]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q24 — GM26-Q24 — [P1 · decision] Who can see each part of a dispute?
- **Why one decision:** Who can see each part of a dispute (CX-Q25)?
- **Flag:** GM-26-Q24 NOT RE-VALIDATED — do not ask until re-validated

### INCIDENT-EVENTS — canonical: GM-15 GM-15-26 (bucket 1)

- **Canonical:** GM15-26 — CX-Q26 · Which events count as an incident? [STILL VALID]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q26 — GM26-Q26 — [P2 · decision] Which events count as an incident? / How far back does the ladder count? / When does the reliability badge disappear?
- **Why one decision:** Which events count as an incident (CX-Q26)? GM-26-Q26 also bundles CX-Q28/Q29 — covered by LOOKBACK and BADGE.

### LOOKBACK — canonical: GM-15 GM-15-28 (bucket 1)

- **Canonical:** GM15-28 — CX-Q28 · How far back does the ladder count? [STILL VALID]
- **Why one decision:** How far back does the ladder count (CX-Q28)? GM-26-Q26 bundles this — see INCIDENT-EVENTS.

### BADGE — canonical: GM-15 GM-15-29 (bucket 1)

- **Canonical:** GM15-29 — CX-Q29 · When should the reliability badge disappear? [STILL VALID]
- **Why one decision:** When should the reliability badge disappear (CX-Q29)? GM-26-Q26 bundles this — see INCIDENT-EVENTS.

### SUSPENSION-PROCESS — canonical: GM-15 GM-15-30 (bucket 1)

- **Canonical:** GM15-30 — CX-Q30 · What process applies before permanent suspension? [STILL VALID]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q25 — GM26-Q25 — [P1 · decision] What process applies before permanent suspension?
- **Why one decision:** What process applies before permanent suspension (CX-Q30)?
- **Flag:** GM-26-Q25 NOT RE-VALIDATED — do not ask until re-validated

### SHIFT-COMPLETE — canonical: GM-15 GM-15-32 (bucket 1)

- **Canonical:** GM15-32 — CX-Q32 · What marks a shift complete? [STILL VALID]
- **Merged duplicates (2):**
  - GM-08 GM-08-Q11 — GM-08-Q11 — What does attendance hand to the timesheet — and what marks a shift complete? (carried CX-Q32 / CX-R01, GM-09 boundary)
  - GM-17 GM-17-Q16 — GM17-Q16 — What marks a shift complete, so wages become payable? (CX-Q32)
- **Why one decision:** What marks a shift complete (CX-Q32)?

### DISPUTED-HOURS — canonical: GM-15 GM-15-33 (bucket 1)

- **Canonical:** GM15-33 — CX-Q33 · How are disputed hours settled? [STILL VALID — PARTIAL]
- **Merged duplicates (2):**
  - GM-08 GM-08-Q08 — GM-08-Q08 — Manager corrections: who can correct, and how does a worker dispute one? (carried CX-Q33) — STILL VALID
  - GM-09 Q8 — Q8 — How does a worker or pharmacy dispute hours or pay, and who decides?
- **Why one decision:** How are disputed hours settled (CX-Q33)?

### EARLY-FINISH — canonical: GM-15 GM-15-34 (bucket 1)

- **Canonical:** GM15-34 — CX-R01 · How are early finishes and extra hours paid? [STILL VALID]
- **Why one decision:** How are early finishes and extra hours paid (CX-R01)?

### WHO-CAN-RATE — canonical: GM-15 GM-15-35 (bucket 1)

- **Canonical:** GM15-35 — CX-Q34 · Who can rate, and when? [CHANGED]
- **Merged duplicates (3):**
  - GM-24 GM-24-Q17 — GM-24-Q17 — Who can rate, and when?
  - GM-26 GM-26-Q27 — GM26-Q27 — [P1 · decision] Who can rate, and when? / Should internal roster ratings appear on the public talent board?
  - GM-18 GM-18-Q05 — GM-18 GM-18-Q05 — Ratings (title unrecovered)
- **Why one decision:** Who can rate, and when (CX-Q34)? GM-26-Q27 also carries the CX-Q35 half — covered by ROSTER-RATINGS.
- **Flag:** GM-26-Q27 NOT RE-VALIDATED; GM-18-Q05 title unrecovered (senior-review grouping: ratings)

### ROSTER-RATINGS — canonical: GM-15 GM-15-36 (bucket 1)

- **Canonical:** GM15-36 — CX-Q35 · Should ratings from internal roster shifts appear on the public talent board? [STILL VALID]
- **Merged duplicates (1):**
  - GM-24 GM-24-Q18 — GM-24-Q18 — Should ratings from internal roster shifts appear on the public talent board?
- **Why one decision:** Should ratings from internal roster shifts appear on the public talent board (CX-Q35)?

### HISTORY — canonical: GM-15 GM-15-37 (bucket 1)

- **Canonical:** GM15-37 — CX-Q36 · Do cancelled, expired and no-show shifts stay in both sides' history? [STILL VALID]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q28 — GM26-Q28 — [P2 · decision] Do cancelled, expired and no-show shifts stay in both sides' history?
- **Why one decision:** Do cancelled, expired and no-show shifts stay in both sides history (CX-Q36)?
- **Flag:** GM-26-Q28 NOT RE-VALIDATED — do not ask until re-validated

### REVIEWS-DISPLAY — canonical: GM-15 GM-15-42 (bucket 1)

- **Canonical:** GM15-42 — TB-Q05 · How should reviews and reliability show? [STILL VALID]
- **Merged duplicates (2):**
  - GM-24 GM-24-Q16 — GM-24-Q16 — How should reviews and reliability show?
  - GM-18 GM-18-Q06 — GM-18 GM-18-Q06 — Ratings — "0.0 (0)" for new workers (confirmed fact)
- **Why one decision:** How should reviews and reliability show (TB-Q05)? GM-18-Q06 is the "0.0 (0) for new workers" facet.
- **Flag:** GM-18-Q06 title unrecovered (senior-review grouping: ratings; confirmed fact: 0.0 (0) display)

### BLOCK-WORKER — canonical: GM-15 GM-15-43 (bucket 1)

- **Canonical:** GM15-43 — TB-Q09 · Can a pharmacy block a worker? [STILL VALID]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q19 — GM26-Q19 — [P1 · decision] Can a pharmacy block a worker?
- **Why one decision:** Can a pharmacy block a worker (TB-Q09)?
- **Flag:** GM-26-Q19 NOT RE-VALIDATED — do not ask until re-validated

### LEGAL-REVIEW — canonical: GM-15 GM-15-49 (bucket 1)

- **Canonical:** GM15-49 — LA-R02 · May cancellation charges launch before Australian legal review? [STILL VALID]
- **Merged duplicates (2):**
  - GM-16 GM-16-Q14 — GM16-Q14 — [LA-R02 / SH-16] May cancellation charges launch before Australian legal review? — ✅ still open (decision)
  - GM-26 GM-26-Q31 — GM26-Q31 — [P0 · decision] May cancellation charges launch before Australian legal review?
- **Why one decision:** May cancellation charges launch before Australian legal review (LA-R02 / SH-16)?
- **Flag:** GM-26-Q31 NOT RE-VALIDATED — do not ask until re-validated

### CANCEL-NOTIFY — canonical: GM-22 GM-22-03 (bucket 1)

- **Canonical:** GM22-03 · AG-Q09 — Who is told when a shift is cancelled, covered or replaced? 🔴 decision · gap D07 — CHANGED (partial)
- **Merged duplicates (2):**
  - GM-15 GM-15-38 — GM15-38 — AG-Q09 · Who is told when a shift is cancelled, covered or replaced? [STILL VALID]
  - GM-04 GM-04-Q08 — GM-04-Q08 — Who is told when a shift is cancelled, covered or replaced — are org admins told? [ex-#184 AG-Q09] — STILL VALID
- **Why one decision:** Who is told when a shift is cancelled, covered or replaced (AG-Q09)? GM-04-Q08 is the org-admin facet. Canonical GM-22-Q03 (GM-22 owns notice decisions).
- **Flag:** GM-22-Q03 cancel half NOT RE-VALIDATED per queue caveats

### CHANNELS — canonical: GM-22 GM-22-04 (bucket 1)

- **Canonical:** GM22-04 · AG-Q10 — Which channels carry those notices? 🔴 decision · gap D07 — ★ FIRST QUESTION (see Part D) — CHANGED
- **Merged duplicates (1):**
  - GM-15 GM-15-39 — GM15-39 — AG-Q10 · Which channels carry those notices? [STILL VALID]
- **Why one decision:** Which channels carry those notices (AG-Q10)?

### LAP01-GAP — canonical: GM-13 GM-13-Q13 (bucket 3)

- **Canonical:** GM13-Q13 — AHPRA cancellation strands the payment reservation. Fix the release? (carried LA-P01)
- **Merged duplicates (1):**
  - GM-15 GM-15-44 — GM15-44 — LA-P01 · AHPRA cancellation leaves a shift stuck as waiting for payment [CHANGED — PARTIAL]
- **Why one decision:** Implementation gap (LA-P01): AHPRA cancellation strands the payment reservation — fix the release. Must respect D02/D03 and the still-open REFUND-01; not a new policy question.

### LAP02-GAP — canonical: GM-15 GM-15-45 (bucket 3)

- **Canonical:** GM15-45 — LA-P02 · AHPRA cancellations bypass the cancellation policy and notices [STILL VALID]
- **Merged duplicates (1):**
  - GM-22 GM-22-16 — GM22-16 · LA-P02 — Fix before launch? AHPRA cancellations bypass the cancellation policy and notices. 🔴 code — CHANGED (partial)
- **Why one decision:** Implementation gap (LA-P02): AHPRA cancellations bypass the cancellation policy and notices — apply the policy + notices. Policy half is AHPRA-SUSPENDED.

### TERMS-TABLE-GAP — canonical: GM-15 GM-15-47 (bucket 3)

- **Canonical:** GM15-47 — LA-Q10 / SH-09 · Accepted terms don't include the cancellation table or terms version [CHANGED — PARTIAL]
- **Merged duplicates (1):**
  - GM-26 GM-26-Q32 — GM26-Q32 — [P1 · code gap, timing decision] Fix before launch? Accepted terms don't include the cancellation table or terms version.
- **Why one decision:** Implementation gap (LA-Q10 / SH-09): accepted terms do not include the cancellation table or terms version. Include them; no owner choice among alternatives.
- **Flag:** GM-26-Q32 NOT RE-VALIDATED — do not ask until re-validated

### FEE-LENGTH — canonical: GM-16 GM-16-Q01 (bucket 1)

- **Canonical:** GM16-Q01 — [PO-Q16 / SH-03] Should the booking fee depend on shift length? — 🔄 CHANGED (partly)
- **Merged duplicates (1):**
  - GM-17 GM-17-Q08 — GM17-Q08 — Should the booking fee depend on shift length? (PO-Q16, changed in part)
- **Why one decision:** Should the booking fee depend on shift length (PO-Q16 / SH-03)?

### SUBSCRIBER-PRICE-GAP — canonical: GM-16 GM-16-Q02 (bucket 3)

- **Canonical:** GM16-Q02 — [LA-Q07 / SH-03] Fix before launch? Subscribers charged full price; Stripe price IDs hard-coded. — 🟢 PART-FIXED
- **Merged duplicates (1):**
  - GM-26 GM-26-Q34 — GM26-Q34 — [P1 · code gap, timing decision] Fix before launch? Subscribers are charged full price, and Stripe price IDs are hard-coded.
- **Why one decision:** Implementation gap (LA-Q07 / SH-03): subscribers charged full price; Stripe price IDs hard-coded. Fix the pricing path; no owner policy choice.
- **Flag:** GM-26-Q34 NOT RE-VALIDATED — do not ask until re-validated

### FEE-START — canonical: GM-16 GM-16-Q04 (bucket 1)

- **Canonical:** GM16-Q04 — [PO-Q15 / SH-04] When should booking fees start? — 🔄 CHANGED (mechanism fully verified now)
- **Merged duplicates (1):**
  - GM-17 GM-17-Q07 — GM17-Q07 — Booking-fee trial and going live (PO-Q15, changed)
- **Why one decision:** When should booking fees start (PO-Q15 / SH-04)?

### FULL-COST — canonical: GM-16 GM-16-Q06 (bucket 1)

- **Canonical:** GM16-Q06 — [PO-Q04] Should the pharmacy see the full cost before posting? — 🔄 CHANGED (pay-time half verified; pre-posting half not re-validated)
- **Merged duplicates (1):**
  - GM-17 GM-17-Q10 — GM17-Q10 — Should the pharmacy see the full cost before posting? (PO-Q04)
- **Why one decision:** Should the pharmacy see the full cost before posting (PO-Q04)?

### TRIALLING-DISCOUNT — canonical: GM-16 GM-16-Q08 (bucket 1)

- **Canonical:** GM16-Q08 — (new, from verified webhook code) Does a trialling subscription get the 50% discount? — verified mechanism, decision open
- **Why one decision:** Does a trialling subscription get the 50% discount?

### SUBSCRIPTION-LAPSE — canonical: GM-16 GM-16-Q09 (bucket 1)

- **Canonical:** GM16-Q09 — (new, from verified webhook code) What happens the day a subscription lapses? — verified mechanism, decision open
- **Why one decision:** What happens the day a subscription lapses?

### EXTRA-SEATS — canonical: GM-16 GM-16-Q10 (bucket 1)

- **Canonical:** GM16-Q10 — (new, from verified webhook code) What happens to staff over 5 when extra seats drop? — verified reset; gating UNKNOWN
- **Why one decision:** What happens to staff over 5 when extra seats drop?

### GST — canonical: GM-14 GM-14-Q11 (bucket 1)

- **Canonical:** GM14-Q11 — Booking fees: GST and tax invoice? (carried LA-R01 / SH-15; jointly GM-16-Q15 / GM-17-Q06)
- **Merged duplicates (3):**
  - GM-16 GM-16-Q15 — GM16-Q15 — [LA-R01 / SH-15] Booking fees: GST and tax invoice? — ✅ STILL VALID (now verified)
  - GM-17 GM-17-Q06 — GM17-Q06 — Booking fee GST and platform tax invoice (launch-gating)
  - GM-26 GM-26-Q33 — GM26-Q33 — [P1 · code gap, timing decision] Fix before launch? Booking fees lack explicit GST and tax-invoice treatment.
- **Why one decision:** Booking fees: GST and tax invoice (LA-R01 / SH-15)?
- **Flag:** GM-26-Q33 NOT RE-VALIDATED — do not ask until re-validated

### SUBSCRIPTION-MGMT — canonical: GM-16 GM-16-Q16 (bucket 1)

- **Canonical:** GM16-Q16 — Subscription management: where, by whom, and what does cancelling do? — ✅ VERIFIED (screens now traced)
- **Why one decision:** Subscription management: where, by whom, what does cancelling do?

### PILLS — canonical: GM-16 GM-16-Q17 (bucket 1)

- **Canonical:** GM16-Q17 — Pills: what are they, what are they worth, do they touch money? — ✅ VERIFIED (fully traced this re-run)
- **Why one decision:** Pills: what are they, what are they worth, do they touch money?

### WORKER-SEES-PAY — canonical: GM-17 GM-17-Q09 (bucket 1)

- **Canonical:** GM17-Q09 — What should workers see: rate, super, GST, shift total? (PO-Q03)
- **Why one decision:** What should workers see: rate, super, GST, shift total (PO-Q03)?

### INVOICE-CORRECTIONS — canonical: GM-17 GM-17-Q12 (bucket 1)

- **Canonical:** GM17-Q12 — Worker invoice corrections: credit notes, void, reversals (NEW)
- **Why one decision:** Worker invoice corrections: credit notes, void, reversals?

### OVERDUE-INVOICES — canonical: GM-17 GM-17-Q13 (bucket 1)

- **Canonical:** GM17-Q13 — Overdue worker invoices: reminders, escalation, late fees? (NEW)
- **Why one decision:** Overdue worker invoices: reminders, escalation, late fees?

### SUBSCRIPTION-INVOICE — canonical: GM-17 GM-17-Q14 (bucket 1)

- **Canonical:** GM17-Q14 — Subscription paid by invoice: what if it is never paid? (NEW)
- **Why one decision:** Subscription paid by invoice: what if it is never paid?

### RECONCILIATION-QUEUE — canonical: GM-17 GM-17-Q15 (bucket 1)

- **Canonical:** GM17-Q15 — Reconciliation queue: who works flagged payments? (NEW)
- **Why one decision:** Reconciliation queue: who works flagged payments?

### INVOICE-NUMBERING — canonical: GM-17 GM-17-Q18 (bucket 1)

- **Canonical:** GM17-Q18 — Invoice numbering, tax-invoice wording and duplicate protection (NEW)
- **Why one decision:** Invoice numbering, tax-invoice wording and duplicate protection?

### AUDIENCE-01 — canonical: GM-18 GM-18-Q01 (bucket 1)

- **Canonical:** GM-18 GM-18-Q01 — Who can see the talent board? (confirmed by senior review)
- **Merged duplicates (4):**
  - GM-24 GM-24-Q11 — GM-24-Q11 — Who can see the talent board?
  - GM-26 GM-26-Q01 — GM26-Q01 — [P0 · decision] Who can see the talent board, and are anonymous candidates really anonymous?
  - GM-04 GM-04-Q12 — GM-04-Q12 — Who can see the talent board, and does "organisation" count as an employer there? [ex-#184 TB-Q01] — STILL VALID (adopted from GM-01)
  - GM-24 GM-24-Q26 — GM-24-Q26 — NEW: Non-anonymous talent posts expose identity to anonymous visitors — intended?
- **Why one decision:** Who can see the talent board, and who may contact a worker from it (queue s2.8 AUDIENCE-01). GM-24-Q26 (non-anonymous posts visible to anonymous visitors) is the anonymous-visitor facet.
- **Flag:** GM-18-Q01 title confirmed by senior review

### TALENT-REVEAL — canonical: GM-26 GM-26-Q02 (bucket 1)

- **Canonical:** GM26-Q02 — [P0 · decision] When is an anonymous candidate's identity revealed?
- **Merged duplicates (2):**
  - GM-24 GM-24-Q12 — GM-24-Q12 — When is an anonymous candidate's identity revealed?
  - GM-18 GM-18-Q02 — GM-18 GM-18-Q02 — Audience / reveal / masking (title unrecovered)
- **Why one decision:** When is an anonymous candidate identity revealed?
- **Flag:** GM-26-Q02 NOT RE-VALIDATED; GM-18-Q02 title unrecovered (senior-review grouping: audience/reveal/masking)

### TALENT-HIDDEN — canonical: GM-26 GM-26-Q03 (bucket 1)

- **Canonical:** GM26-Q03 — [P0 · decision] What stays hidden before identity reveal?
- **Merged duplicates (2):**
  - GM-18 GM-18-Q03 — GM-18 GM-18-Q03 — Audience / reveal / masking (title unrecovered)
  - GM-01 GM-01-Q16 — GM01-Q16 — Should a signed-in worker be able to see an anonymous talent poster's real name? (carried LA-Q12)
- **Why one decision:** What stays hidden before identity reveal (talent anonymity)? GM-01-Q16 (signed-in worker seeing an anonymous poster real name) is the same rule from the auth side.
- **Flag:** GM-18-Q03 title unrecovered (senior-review grouping: audience/reveal/masking)

### TALENT-FILTERS — canonical: GM-18 GM-18-Q04 (bucket 1)

- **Canonical:** GM-18 GM-18-Q04 — Filters (title unrecovered)
- **Merged duplicates (1):**
  - GM-18 GM-18-Q22 — GM-18 GM-18-Q22 — Filters (title unrecovered)
- **Why one decision:** Talent-board filters (GM-18-Q04 + Q22 grouped as "filters" by senior review).
- **Flag:** Both titles unrecovered — reconstruct from the lost worker trace before interview; Q04/Q22 may be two distinct filter decisions

### TALENT-COMMERCIAL-Q08 — canonical: GM-18 GM-18-Q08 (bucket 1)

- **Canonical:** GM-18 GM-18-Q08 — Commercial model (title unrecovered)
- **Why one decision:** Commercial model question (GM-18-Q08).
- **Flag:** TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis

### TALENT-COMMERCIAL-Q09 — canonical: GM-18 GM-18-Q09 (bucket 1)

- **Canonical:** GM-18 GM-18-Q09 — Commercial model (title unrecovered)
- **Why one decision:** Commercial model question (GM-18-Q09).
- **Flag:** TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis

### TALENT-COMMERCIAL-Q10 — canonical: GM-18 GM-18-Q10 (bucket 1)

- **Canonical:** GM-18 GM-18-Q10 — Commercial model (title unrecovered)
- **Why one decision:** Commercial model question (GM-18-Q10).
- **Flag:** TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis

### TALENT-LIFECYCLE-Q13 — canonical: GM-18 GM-18-Q13 (bucket 1)

- **Canonical:** GM-18 GM-18-Q13 — Lifecycle (title unrecovered)
- **Why one decision:** Lifecycle question (GM-18-Q13).
- **Flag:** TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis

### TALENT-LIFECYCLE-Q14 — canonical: GM-18 GM-18-Q14 (bucket 1)

- **Canonical:** GM-18 GM-18-Q14 — Lifecycle (title unrecovered)
- **Why one decision:** Lifecycle question (GM-18-Q14).
- **Flag:** TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis

### HIRING-ROLE — canonical: GM-18 GM-18-Q15 (bucket 1)

- **Canonical:** GM-18 GM-18-Q15 — One hiring-role policy (title unrecovered)
- **Why one decision:** One hiring-role policy: who may request a booking (GM-18-Q15). The web/mobile drift itself is HIRING-ROLE-GAP (bucket 3).
- **Flag:** Ask GM-18-Q15 before the drift fix; GM-05 Q-17 is the gap, not the policy

### HIRING-ROLE-GAP — canonical: GM-05 Q-17 (bucket 3)

- **Canonical:** Q-17 — [LA-Q15] Web and mobile disagree on talent-board booking permissions — fix before launch?
- **Merged duplicates (3):**
  - GM-24 GM-24-Q15 — GM-24-Q15 — Who can request a booking — fix the web/mobile drift?
  - GM-25 GM-25-C14 — GM25-C14 — LA-Q15 (code, TB-07). Fix before launch? Web and mobile disagree on Talent Board booking permissions.
  - GM-26 GM-26-Q29 — GM26-Q29 — [P1 · code gap, timing decision] Fix before launch? Web and mobile disagree on Talent Board booking permissions.
- **Why one decision:** Implementation gap (LA-Q15 / TB-07): web and mobile disagree on Talent Board booking permissions. Fix the drift once HIRING-ROLE is decided.
- **Flag:** GM-05 Q-17 NOT VERIFIED; GM-26-Q29 NOT RE-VALIDATED — fix only after re-validation + policy

### GM18-Q23-UNKNOWN — canonical: GM-18 GM-18-Q23 (bucket 1)

- **Canonical:** GM-18 GM-18-Q23 — Topic unknown (title unrecovered)
- **Why one decision:** GM-18-Q23 — topic unknown.
- **Flag:** TITLE AND TOPIC UNRECOVERED — worker trace missing; counted as written, do not ask on this basis

### GM18-Q24-DISCLOSURE — canonical: GM-18 GM-18-Q24 (bucket 1)

- **Canonical:** GM-18 GM-18-Q24 — Disclosure (title unrecovered)
- **Why one decision:** Disclosure question (GM-18-Q24, senior-review grouping: disclosure).
- **Flag:** TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis

### TALENT-LAPSE — canonical: GM-01 GM-01-Q17 (bucket 1)

- **Canonical:** GM01-Q17 — Should a talent post disappear when its author loses Verified status or their AHPRA lapses? (carried LA-Q13, lapsed-credential half)
- **Why one decision:** Should a talent post disappear when its author loses Verified status or their AHPRA lapses (LA-Q13 lapsed-credential half)? GM-26-Q05 is the code gap (stale posts still readable) — see STALE-POSTS-GAP.

### IDENTITY-LEAK-GAP — canonical: GM-24 GM-24-Q13 (bucket 3)

- **Canonical:** GM-24-Q13 — Fix before launch? Anonymous talent posts expose full names to any signed-in account.
- **Merged duplicates (2):**
  - GM-26 GM-26-Q04 — GM26-Q04 — [P0 · code gap, timing decision] Fix before launch? Anonymous talent posts expose full names to any signed-in account.
  - GM-25 GM-25-C12 — GM25-C12 — LA-Q12 (code, TB-01). Fix before launch? Anonymous talent posts expose full names to any signed-in account.
- **Why one decision:** Implementation gap (P0): anonymous talent posts expose full names to any signed-in account — server-side masking/redaction missing. Policy half is TALENT-HIDDEN.

### STALE-POSTS-GAP — canonical: GM-26 GM-26-Q05 (bucket 3)

- **Canonical:** GM26-Q05 — [P1 · code gap, timing decision] Fix before launch? Hidden, stale and lapsed-credential posts can still be read.
- **Why one decision:** Implementation gap: hidden, stale and lapsed-credential posts can still be read. Policy half is TALENT-LAPSE.

### FULL-DOWNLOAD-GAP — canonical: GM-25 GM-25-C13 (bucket 3)

- **Canonical:** GM25-C13 — LA-Q14 (code, TB-04). Fix before launch? The talent board downloads every post and filters in the app.
- **Merged duplicates (1):**
  - GM-26 GM-26-Q30 — GM26-Q30 — [P1 · code gap, timing decision] Fix before launch? The talent board downloads every post and filters in the app.
- **Why one decision:** Implementation gap (LA-Q14 / TB-04): the talent board downloads every post and filters in the app. Server-side filtering needed.
- **Flag:** GM-26-Q30 NOT RE-VALIDATED — do not ask until re-validated

### AVAIL-SET — canonical: GM-19 GM-19-Q01 (bucket 1)

- **Canonical:** GM-19-Q01 (ex AV-Q01) — How should workers set availability? — ✅ STILL VALID (screens now verified)
- **Merged duplicates (1):**
  - GM-23 GM-23-02 — GM-23-02 — AV-Q01. How should workers set availability? (ADOPTED GM-19)
- **Why one decision:** How should workers set availability (AV-Q01)?

### AVAIL-REPEAT — canonical: GM-19 GM-19-Q02 (bucket 1)

- **Canonical:** GM-19-Q02 (ex AV-Q02) — How far can a repeating availability run? — 🔄 CHANGED (Oct claim wrong)
- **Merged duplicates (1):**
  - GM-23 GM-23-03 — GM-23-03 — AV-Q02 / AV-02. How far can a repeating availability run? (ADOPTED GM-19 + this trace)
- **Why one decision:** How far can a repeating availability run (AV-Q02)?

### AVAIL-MATCH — canonical: GM-19 GM-19-Q03 (bucket 1)

- **Canonical:** GM-19-Q03 (ex AV-Q03) — When does availability "match" a shift? ★ FIRST QUESTION — see §4
- **Merged duplicates (1):**
  - GM-23 GM-23-04 — GM-23-04 — AV-Q03 / AV-03. When does availability "match" a shift? (ADOPTED GM-19)
- **Why one decision:** When does availability "match" a shift (AV-Q03)?

### AVAIL-VISIBILITY — canonical: GM-19 GM-19-Q04 (bucket 1)

- **Canonical:** GM-19-Q04 (ex AV-Q04) — Who can see a worker's availability? — ✅ STILL VALID (now fully verified)
- **Merged duplicates (2):**
  - GM-23 GM-23-05 — GM-23-05 — AV-Q04 / AV-06. Who can see a worker's availability? (ADOPTED GM-19)
  - GM-26 GM-26-Q17 — GM26-Q17 — [P1 · decision] Who can see a worker's availability?
- **Why one decision:** Who can see a worker availability (AV-Q04 / AV-Q06)?
- **Flag:** GM-26-Q17 NOT RE-VALIDATED — do not ask until re-validated

### AVAIL-BLOCK — canonical: GM-19 GM-19-Q05 (bucket 1)

- **Canonical:** GM-19-Q05 (ex AV-Q05) — Should confirmed bookings block that time automatically? — 🔄 CHANGED (alert side now VERIFIED: they do not)
- **Merged duplicates (1):**
  - GM-23 GM-23-06 — GM-23-06 — AV-Q05. Should confirmed bookings block that time automatically? (ADOPTED GM-19)
- **Why one decision:** Should confirmed bookings block that time automatically (AV-Q05)?

### AVAIL-STOP — canonical: GM-19 GM-19-Q06 (bucket 1)

- **Canonical:** GM-19-Q06 (ex AV-Q06) — When should a talent post stop showing? — ✅ STILL VALID (feeds now verified to call the rule)
- **Merged duplicates (1):**
  - GM-23 GM-23-07 — GM-23-07 — AV-Q06 / AV-02. When should a talent post stop showing? (ADOPTED GM-19)
- **Why one decision:** When should a talent post stop showing (AV-Q06)?

### AVAIL-CONFIRMED — canonical: GM-19 GM-19-Q07 (bucket 1)

- **Canonical:** GM-19-Q07 (ex AV-Q07) — Should availability show when it was last confirmed? — ✅ STILL VALID (model verified, no field)
- **Merged duplicates (1):**
  - GM-23 GM-23-08 — GM-23-08 — AV-Q07. Should availability show when it was last confirmed? (ADOPTED GM-19)
- **Why one decision:** Should availability show when it was last confirmed (AV-Q07)?

### URGENT-OPTIN — canonical: GM-19 GM-19-Q08 (bucket 1)

- **Canonical:** GM-19-Q08 (ex AV-Q08) — Should urgent-shift alerts need a separate opt-in? — ✅ VERIFIED (single flag; no separate urgent consent)
- **Merged duplicates (4):**
  - GM-22 GM-22-08 — GM22-08 · AV-Q08 — Should urgent-shift alerts need a separate opt-in? 🟡 decision — CHANGED
  - GM-23 GM-23-09 — GM-23-09 — AV-Q08. Should urgent-shift alerts need a separate opt-in? (ADOPTED GM-19 + new context)
  - GM-24 GM-24-Q20 — GM-24-Q20 — Should urgent-shift alerts need a separate opt-in?
  - GM-26 GM-26-Q18 — GM26-Q18 — [P2 · decision] Should urgent-shift alerts need a separate opt-in?
- **Why one decision:** Should urgent-shift alerts need a separate opt-in (AV-Q08)? Distinct from URGENCY (what counts as urgent).
- **Flag:** GM-26-Q18 NOT RE-VALIDATED — do not ask until re-validated

### DISTANCE-RATE — canonical: GM-19 GM-19-Q09 (bucket 1)

- **Canonical:** GM-19-Q09 (ex AV-Q09) — Should workers set a max distance and minimum rate for alerts? — 🔄 SPLIT (distance verified, rate verified absent)
- **Merged duplicates (2):**
  - GM-22 GM-22-09 — GM22-09 · AV-Q09 — Should workers set a max distance and minimum rate for alerts? 🟡 decision — CHANGED (partial)
  - GM-23 GM-23-10 — GM-23-10 — AV-Q09. Should workers set a max distance and minimum rate for alerts? (ADOPTED GM-19)
- **Why one decision:** Should workers set a max distance and minimum rate for alerts (AV-Q09)?

### AVAIL-VALIDATION — canonical: GM-19 GM-19-Q10 (bucket 1)

- **Canonical:** GM-19-Q10 (NEW) — Should availability validation be added, and what must it reject? — ✅ VERIFIED (no validation)
- **Merged duplicates (1):**
  - GM-23 GM-23-17 — GM-23-17 — LA-Q18 / AV-05. Availability input has no validation. Fix before launch? (ADOPTED GM-18/GM-19)
- **Why one decision:** Should availability validation be added, and what must it reject (AV-05 / LA-Q18)? The "add it" half is a code gap; the "what must it reject" half is the owner decision counted here.

### ROSTER-AVAIL-WARNING — canonical: GM-19 GM-19-Q11 (bucket 1)

- **Canonical:** GM-19-Q11 (NEW) — Should a roster availability warning block placement, or stay a warning? — ✅ VERIFIED (warning only)
- **Why one decision:** Should a roster availability warning block placement, or stay a warning?

### AVAIL-SYNC — canonical: GM-19 GM-19-Q12 (bucket 1)

- **Canonical:** GM-19-Q12 (NEW) — Should the talent-post availability snapshot sync with the calendar? — ✅ VERIFIED (structural; never syncs)
- **Merged duplicates (2):**
  - GM-23 GM-23-01 — GM-23-01 — LA-Q16 / AV-01. Talent-post availability is copied once and never syncs with the calendar. Fix before launch? — FIRST QUESTION (Part D)
  - GM-25 GM-25-C15 — GM25-C15 — LA-Q16 (code, AV-01). Fix before launch? Talent post availability is copied once and never syncs with the calendar.
- **Why one decision:** Should the talent-post availability snapshot sync with the calendar (AV-01 / LA-Q16)? GM-23-Q01 is the same decision from the calendar side.

### AVAIL-NEXT — canonical: GM-19 GM-19-Q13 (bucket 1)

- **Canonical:** GM-19-Q13 (NEW) — Next web: does an availability surface exist, and must it match Vite/Expo? — ✅ VERIFIED ABSENT
- **Why one decision:** Next web: does an availability surface exist, and must it match Vite/Expo?

### GM18-AVAILABILITY — canonical: (no separate canonical — members merge into the decisions named in the note) (bucket 5)

- **Merged duplicates (5):**
  - GM-18 GM-18-Q16 — GM-18 GM-18-Q16 — Availability (title unrecovered)
  - GM-18 GM-18-Q17 — GM-18 GM-18-Q17 — Availability (title unrecovered)
  - GM-18 GM-18-Q19 — GM-18 GM-18-Q19 — Availability (title unrecovered)
  - GM-18 GM-18-Q20 — GM-18 GM-18-Q20 — Availability (title unrecovered)
  - GM-18 GM-18-Q21 — GM-18 GM-18-Q21 — Availability (title unrecovered)
- **Why one decision:** GM-18 availability questions (Q16/Q17/Q19/Q20/Q21) — duplicates of the GM-19 availability decisions (AVAIL-SET … AVAIL-SYNC above). No separate canonical entry; each GM-18 item maps to its GM-19 AV counterpart once the lost trace is recovered.
- **Flag:** Per-question mapping UNRECOVERED — worker trace missing; group-level merge only

### CHAT-WHO — canonical: GM-20 GM-20-Q01 (bucket 1)

- **Canonical:** GM20-Q01 — Who can start a direct chat with whom? [FIRST QUESTION — see §3]
- **Why one decision:** Who can start a direct chat with whom?

### CHAT-TIMING — canonical: GM-20 GM-20-Q02 (bucket 1)

- **Canonical:** GM20-Q02 — When can a worker and a pharmacy chat — before or only after a booking?
- **Why one decision:** When can a worker and a pharmacy chat — before or only after a booking?

### CHAT-THREAD — canonical: GM-20 GM-20-Q03 (bucket 1)

- **Canonical:** GM20-Q03 — Should a chat thread be linked to a shift?
- **Why one decision:** Should a chat thread be linked to a shift?

### CHAT-COMMUNITY — canonical: GM-20 GM-20-Q04 (bucket 1)

- **Canonical:** GM20-Q04 — Who belongs in a pharmacy's community chat, and can a pharmacy opt out?
- **Why one decision:** Who belongs in a pharmacy community chat; can a pharmacy opt out?

### CHAT-GROUP — canonical: GM-20 GM-20-Q05 (bucket 1)

- **Canonical:** GM20-Q05 — Who can create a custom group chat?
- **Why one decision:** Who can create a custom group chat?

### CHAT-ABUSE — canonical: GM-20 GM-20-Q06 (bucket 1)

- **Canonical:** GM20-Q06 — How are abusive, spam, or wrong messages handled in chat? (report / block / mute)
- **Why one decision:** How are abusive, spam, or wrong messages handled (report / block / mute)?

### CHAT-HISTORY — canonical: GM-20 GM-20-Q07 (bucket 1)

- **Canonical:** GM20-Q07 — How long is chat history kept?
- **Why one decision:** How long is chat history kept?

### CHAT-IDENTITY — canonical: GM-20 GM-20-Q08 (bucket 1)

- **Canonical:** GM20-Q08 — What identity does chat show? (anonymous talent authors, emails, photos)
- **Why one decision:** What identity does chat show (anonymous talent authors, emails, photos)? Anonymous-author half follows TALENT-HIDDEN.

### CHAT-FILES — canonical: GM-20 GM-20-Q09 (bucket 1)

- **Canonical:** GM20-Q09 — What files can be sent in chat (and in hub posts)?
- **Why one decision:** What files can be sent in chat (and in hub posts)?

### CHAT-NOTIFY — canonical: GM-20 GM-20-Q10 (bucket 1)

- **Canonical:** GM20-Q10 — How are people notified of messages, and can they mute a room?
- **Merged duplicates (1):**
  - GM-22 GM-22-28 — GM22-28 · NEW — Do chat / hub messages notify, and where does GM-22 end and GM-20 (Chat/Hubs) begin? 🟡 decision — TRACED (boundary)
- **Why one decision:** How are people notified of messages; can they mute a room? GM-22-Q28 (where GM-22 ends and GM-20 begins) is the same boundary — the notify rule lives here.

### CHAT-RECEIPTS — canonical: GM-20 GM-20-Q11 (bucket 1)

- **Canonical:** GM20-Q11 — Read receipts, typing, presence: what do people see?
- **Why one decision:** Read receipts, typing, presence: what do people see?

### CHAT-MODERATION — canonical: GM-20 GM-20-Q12 (bucket 1)

- **Canonical:** GM20-Q12 — Who can edit, delete, or pin — and can an admin remove someone else's message?
- **Why one decision:** Who can edit, delete, or pin — can an admin remove someone else message?

### CHAT-REACTIONS — canonical: GM-20 GM-20-Q13 (bucket 1)

- **Canonical:** GM20-Q13 — Should chat reactions include 💩?
- **Why one decision:** Should chat reactions include the poo emoji?

### CHAT-REVOKED — canonical: GM-20 GM-20-Q14 (bucket 1)

- **Canonical:** GM20-Q14 — What happens to chat when a membership is revoked or an AHPRA registration is suspended?
- **Why one decision:** What happens to chat when a membership is revoked or an AHPRA registration is suspended?

### UNREAD-FILTER-GAP — canonical: GM-20 GM-20-Q15 (bucket 3)

- **Canonical:** GM20-Q15 — Unread counts: fix the `?unread=1` filter or remove it?
- **Why one decision:** Implementation gap: fix the `?unread=1` filter or remove it. Code fix, not a policy choice.

### HUB-POSTERS — canonical: GM-20 GM-20-Q16 (bucket 1)

- **Canonical:** GM20-Q16 — Who can post in the hubs — and is OTP verification enough, or must posters be Verified workers?
- **Why one decision:** Who can post in the hubs — is OTP verification enough, or must posters be Verified workers?

### HUB-PUBLIC — canonical: GM-20 GM-20-Q17 (bucket 1)

- **Canonical:** GM20-Q17 — Is the public hub (articles + community posts) on at launch, and who moderates it?
- **Why one decision:** Is the public hub (articles + community posts) on at launch, and who moderates it?

### HUB-RULES — canonical: GM-20 GM-20-Q18 (bucket 1)

- **Canonical:** GM20-Q18 — Hub posts: edit windows, pinning, tagging, polls — keep today's rules?
- **Why one decision:** Hub posts: edit windows, pinning, tagging, polls — keep today rules?

### REMINDERS — canonical: GM-22 GM-22-05 (bucket 1)

- **Canonical:** GM22-05 · AG-Q11 — Which shifts get pre-shift reminders, and when? 🟠 decision · gap D12 — CHANGED
- **Merged duplicates (2):**
  - GM-23 GM-23-11 — GM-23-11 — AG-Q11. Which shifts get pre-shift reminders, and when? (re-verified this trace)
  - GM-25 GM-25-C19 — GM25-C19 — AG-Q11. Which shifts get pre-shift reminders, and when?
- **Why one decision:** Which shifts get pre-shift reminders, and when (AG-Q11)?

### REMINDER-CHANGE — canonical: GM-22 GM-22-06 (bucket 1)

- **Canonical:** GM22-06 · AG-Q12 — If a shift changes inside 12 hours of start, what happens to reminders? 🟠 decision · gap D12 — CHANGED
- **Merged duplicates (1):**
  - GM-23 GM-23-12 — GM-23-12 — AG-Q12. If a shift changes inside 12 hours of start, what happens to reminders? (re-verified this trace)
- **Why one decision:** If a shift changes inside 12 hours of start, what happens to reminders (AG-Q12)?

### NOTIF-CENTRE — canonical: GM-22 GM-22-17 (bucket 1)

- **Canonical:** GM22-17 · NEW — Is there an in-app notification centre, and what does it do? 🟠 decision — TRACED
- **Why one decision:** Is there an in-app notification centre, and what does it do?

### PUSH-PERMISSION — canonical: GM-22 GM-22-18 (bucket 1)

- **Canonical:** GM22-18 · NEW — How do Expo push notifications work, and what happens when permission is denied? 🔴 decision — TRACED
- **Why one decision:** How do Expo push notifications work; what happens when permission is denied?

### EMAIL-SENDER — canonical: GM-22 GM-22-19 (bucket 1)

- **Canonical:** GM22-19 · NEW — Who sends the emails, and what happens when one fails? 🟠 decision/code — TRACED
- **Why one decision:** Who sends the emails; what happens when one fails?

### EVENT-CATALOGUE — canonical: GM-22 GM-22-21 (bucket 1)

- **Canonical:** GM22-21 · NEW — Master event catalogue: which event notifies whom, on which channel? 🔴 decision — TRACED (draft table now filled)
- **Why one decision:** Master event catalogue: which event notifies whom, on which channel?

### PILLS-NOTIFY — canonical: GM-22 GM-22-22 (bucket 1)

- **Canonical:** GM22-22 · NEW — What Pills / rewards notifications exist (earn, spend, expiry, low balance)? 🟡 decision — TRACED
- **Why one decision:** What Pills / rewards notifications exist (earn, spend, expiry, low balance)?

### PAYMENT-NOTIFY — canonical: GM-22 GM-22-23 (bucket 1)

- **Canonical:** GM22-23 · NEW — Which payment / invoice / refund events notify whom? 🟠 decision — TRACED
- **Why one decision:** Which payment / invoice / refund events notify whom?

### RATING-NOTIFY — canonical: GM-22 GM-22-24 (bucket 1)

- **Canonical:** GM22-24 · NEW — Is either side told when a rating is left, or when a reliability badge / incident is applied? 🟡 decision — TRACED (ratings) / NOT RE-VALIDATED (incidents)
- **Why one decision:** Is either side told when a rating is left, or when a reliability badge / incident is applied? (incidents half NOT RE-VALIDATED)

### AHPRA-NOTIFY — canonical: GM-22 GM-22-25 (bucket 1)

- **Canonical:** GM22-25 · NEW — Are verification / AHPRA status changes notified (granted, lapsed, suspended, revoked)? 🟠 decision — TRACED (suspension) / NOT RE-VALIDATED (grant/lapse)
- **Why one decision:** Are verification / AHPRA status changes notified (granted, lapsed, suspended, revoked)? (grant/lapse half NOT RE-VALIDATED)

### NOTIF-DEDUP — canonical: GM-22 GM-22-26 (bucket 1)

- **Canonical:** GM22-26 · NEW — How are duplicate, failed and stale notifications handled — and is there an audit log? 🟠 code/decision — TRACED
- **Why one decision:** How are duplicate, failed and stale notifications handled — is there an audit log? (Distinct from GM-26-Q38 admin-action audit trail.)

### CROSSTENANT-LEAK-VERIFY — canonical: GM-22 GM-22-27 (bucket 4)

- **Canonical:** GM22-27 · NEW — Can a notification leak one tenant's information to another (wrong pharmacy, wrong worker, wrong role)? 🟠 decision/code — TRACED (mechanism) / NOT RE-VALIDATED (per-event negative tests)
- **Why one decision:** Verification item: can a notification leak one tenant information to another? Needs per-event negative tests (NOT RE-VALIDATED), not a new owner policy — tenant isolation is already the rule.

### MULTIDATE-SAME-WORKER — canonical: GM-23 GM-23-13 (bucket 1)

- **Canonical:** GM-23-13 — PO-Q05. For multi-date posts, how is "same worker for every date" set? (re-verified this trace, first half)
- **Why one decision:** For multi-date posts, how is "same worker for every date" set (PO-Q05)?

### RECURRING-HORIZON — canonical: GM-23 GM-23-14 (bucket 1)

- **Canonical:** GM-23-14 — PO-Q06. How far ahead can recurring shifts run? (re-verified this trace — CHANGED)
- **Why one decision:** How far ahead can recurring shifts run (PO-Q06)?

### REPEAT-PAST-SHIFT — canonical: GM-23 GM-23-15 (bucket 1)

- **Canonical:** GM-23-15 — PO-Q07. How should owners repeat a past shift? (re-verified as far as traced)
- **Why one decision:** How should owners repeat a past shift (PO-Q07)?

### CALENDAR-VIEWS — canonical: GM-23 GM-23-18 (bucket 1)

- **Canonical:** GM-23-18 — NEW. Team calendar views: day / week / month — what does each role see? (verified this trace)
- **Why one decision:** Team calendar views day / week / month — what does each role see?

### OPS-RULES — canonical: GM-23 GM-23-19 (bucket 1)

- **Canonical:** GM-23-19 — NEW. Operations tasks / rules engine: what rules run, when, and who acts on them? (verified this trace — the engine is gone)
- **Why one decision:** Operations tasks / rules engine: what rules run, when, who acts on them? (Engine is gone.)

### LEAVE-ON-CALENDAR — canonical: GM-23 GM-23-20 (bucket 1)

- **Canonical:** GM-23-20 — NEW. Leave on the calendar: how do leave / roster / cover requests appear? (verified this trace)
- **Why one decision:** Leave on the calendar: how do leave / roster / cover requests appear? Display decision; the shift effect is EMPLOY-LEAVE-APPROVED.

### SHIFT-DISPLAY — canonical: GM-23 GM-23-21 (bucket 1)

- **Canonical:** GM-23-21 — NEW. Shift display on the calendar: what state does each entry show? (verified this trace)
- **Why one decision:** Shift display on the calendar: what state does each entry show?

### OPS-DASHBOARD — canonical: GM-23 GM-23-22 (bucket 1)

- **Canonical:** GM-23-22 — NEW. Operations dashboard: what does it show, to whom, and how fresh is it? (verified this trace — NOT BUILT)
- **Why one decision:** Operations dashboard: what does it show, to whom, how fresh? (NOT BUILT.)

### TIMEZONE — canonical: GM-23 GM-23-23 (bucket 1)

- **Canonical:** GM-23-23 — NEW. Clock / timezone: whose time is a shift time? (verified this trace — ALTERNATE FIRST QUESTION)
- **Merged duplicates (1):**
  - GM-10 GM-10-Q05 — GM-10-Q05 — Dates, times and timezones: what guards exist, and what time does the worker see?
- **Why one decision:** Clock / timezone: whose time is a shift time? GM-10-Q05 (dates, times, timezones at posting) is the posting-side facet of the same decision.

### CALENDAR-PERMS — canonical: GM-23 GM-23-24 (bucket 1)

- **Canonical:** GM-23-24 — NEW. Calendar permissions: who can create / edit / delete calendar entries, per role and per pharmacy? (verified server-side this trace)
- **Why one decision:** Calendar permissions: who can create / edit / delete entries, per role and per pharmacy?

### EXTERNAL-CALENDAR — canonical: GM-23 GM-23-25 (bucket 1)

- **Canonical:** GM-23-25 — NEW. External calendar: export / sync to Google / Outlook / Apple, or ICS download? (verified this trace — NOT BUILT)
- **Why one decision:** External calendar: export / sync to Google / Outlook / Apple, or ICS download? (NOT BUILT.)

### CALENDAR-NOTIFY — canonical: GM-23 GM-23-26 (bucket 1)

- **Canonical:** GM-23-26 — NEW. Calendar notifications: which calendar events notify, on which channel, and can the worker turn them off? (verified this trace)
- **Why one decision:** Calendar notifications: which calendar events notify, on which channel, can the worker turn them off? Notification half is settled by EVENT-CATALOGUE once decided.

### ROSTER-PUBLISHING — canonical: GM-23 GM-23-27 (bucket 1)

- **Canonical:** GM-23-27 — NEW. Roster publishing: what does publishing a roster do to calendars, and can it be undone? (verified this trace)
- **Why one decision:** Roster publishing: what does publishing do to calendars, can it be undone?

### NEEDS-COVER-CALENDAR — canonical: GM-23 GM-23-28 (bucket 1)

- **Canonical:** GM-23-28 — NEW. "Needs cover" on the calendar: who sees it, and how is it filled without double-booking? (verified this trace)
- **Why one decision:** "Needs cover" on the calendar: who sees it, how is it filled without double-booking? Display is APPROVED R06; who-sees + fill rule are open.

### CALENDAR-AUDIT — canonical: GM-23 GM-23-29 (bucket 1)

- **Canonical:** GM-23-29 — NEW. Calendar history / audit: can the owner see who changed what, when? (verified this trace — split)
- **Why one decision:** Calendar history / audit: can the owner see who changed what, when?

### EXPLORER-ROLES-VISIBLE — canonical: GM-24 GM-24-Q21 (bucket 1)

- **Canonical:** GM-24-Q21 — NEW: Should anonymous visitors see every role on the public job board?
- **Why one decision:** Should anonymous visitors see every role on the public job board?

### EXPLORER-COMMUNITY — canonical: GM-24 GM-24-Q22 (bucket 1)

- **Canonical:** GM-24-Q22 — NEW: The Explorer Community tab is always empty — hide it or open community to Explorers?
- **Why one decision:** Explorer Community tab is always empty — hide it or open community to Explorers?

### SHARE-LINKS — canonical: GM-24 GM-24-Q23 (bucket 1)

- **Canonical:** GM-24-Q23 — NEW: Share-link sitemap URLs are dead, and share tokens never expire?
- **Why one decision:** Share-link sitemap URLs are dead, and share tokens never expire?

### EXPLORER-DEADEND — canonical: GM-24 GM-24-Q27 (bucket 1)

- **Canonical:** GM-24-Q27 — NEW: Explorer interest that can never become a booking — fail fast?
- **Why one decision:** Explorer interest that can never become a booking — fail fast?

### ROLE-FILTER — canonical: GM-24 GM-24-Q28 (bucket 1)

- **Canonical:** GM-24-Q28 — NEW: Public-board role filter has no Explorer option — add it?
- **Why one decision:** Public-board role filter has no Explorer option — add it?

### DAILY-LIMIT — canonical: GM-24 GM-24-Q29 (bucket 1)

- **Canonical:** GM-24-Q29 — NEW: Daily public-shift limit is 10 per pharmacy per day — keep?
- **Why one decision:** Daily public-shift limit is 10 per pharmacy per day — keep?

### VIEW-COUNTS — canonical: GM-24 GM-24-Q30 (bucket 1)

- **Canonical:** GM-24-Q30 — NEW: Talent view counts — every authenticated view counts, no cap — keep?
- **Why one decision:** Talent view counts — every authenticated view counts, no cap — keep?

### TALENT-STALENESS — canonical: GM-24 GM-24-Q31 (bucket 1)

- **Canonical:** GM-24-Q31 — NEW: Talent-post staleness — undated and full-time posts stay visible forever?
- **Why one decision:** Talent-post staleness — undated and full-time posts stay visible forever?

### MOBILE-DEADENDS-VERIFY — canonical: GM-24 GM-24-Q32 (bucket 4)

- **Canonical:** GM-24-Q32 — Launch-gate check: are the mobile dead-ends fixed?
- **Why one decision:** Verification item (launch-gate check): are the mobile dead-ends fixed? Needs evidence, not an owner policy choice. Underlying gaps are MOBILE-PROFILE-GAP / DEADEND-SCREENS-GAP.

### VITE-NEXT — canonical: GM-25 GM-25-Q02 (bucket 1)

- **Canonical:** GM25-Q02 — Vite vs Next: which routes live where, and is the migration finished, frozen, or rolled back?
- **Merged duplicates (1):**
  - GM-24 GM-24-Q24 — GM-24-Q24 — NEW: Which public site is canonical — Vite or Next — and who owns the public pages?
- **Why one decision:** Vite vs Next: which routes live where; is the migration finished, frozen, or rolled back? GM-24-Q24 (which public site is canonical) is the public-site facet.

### DUPLICATED-BOARDS — canonical: GM-25 GM-25-Q03 (bucket 1)

- **Canonical:** GM25-Q03 — Duplicated public boards: one implementation or tolerated twins?
- **Why one decision:** Duplicated public boards: one implementation or tolerated twins?

### SHARED-CORE — canonical: GM-25 GM-25-Q04 (bucket 1)

- **Canonical:** GM25-Q04 — Shared-core scope: which flows must go through shared-core, and what happens to direct client API calls?
- **Why one decision:** Shared-core scope: which flows must go through shared-core; direct client API calls?

### DEAD-SCREENS — canonical: GM-25 GM-25-Q05 (bucket 1)

- **Canonical:** GM25-Q05 — Dead, half-built, and "coming soon" screens: delete, hide, or fix before launch?
- **Why one decision:** Dead, half-built, "coming soon" screens: delete, hide, or fix before launch? (Policy; the specific mobile instances are MOBILE-PROFILE-GAP / DEADEND-SCREENS-GAP.)

### NAV-PARITY — canonical: GM-25 GM-25-Q06 (bucket 1)

- **Canonical:** GM25-Q06 — Navigation and routing parity: one nav model, or one per client?
- **Why one decision:** Navigation and routing parity: one nav model, or one per client?

### AUTH-PARITY — canonical: GM-25 GM-25-Q07 (bucket 1)

- **Canonical:** GM25-Q07 — Auth and session parity: same rules on all three surfaces?
- **Why one decision:** Auth and session parity: same rules on all three surfaces? (Parity decision; the session rules themselves are the GM-01 decisions.)

### LOGGEDOUT-SURFACES — canonical: GM-25 GM-25-Q08 (bucket 1)

- **Canonical:** GM25-Q08 — Logged-out public surfaces: what must a visitor be able to do on each surface?
- **Why one decision:** Logged-out public surfaces: what must a visitor be able to do on each surface?

### OFFLINE-PROMISE — canonical: GM-25 GM-25-Q09 (bucket 1)

- **Canonical:** GM25-Q09 — Offline and poor-network behaviour on Expo: what is the promise?
- **Why one decision:** Offline and poor-network behaviour on Expo: what is the promise?

### EXPO-PAYMENT — canonical: GM-25 GM-25-Q10 (bucket 1)

- **Canonical:** GM25-Q10 — How does Expo take payment?
- **Why one decision:** How does Expo take payment?

### NOTIF-PARITY — canonical: GM-25 GM-25-Q11 (bucket 1)

- **Canonical:** GM25-Q11 — Notification parity: email vs push — same events, same timing?
- **Why one decision:** Notification parity: email vs push — same events, same timing?

### KIOSK-EXPO — canonical: GM-25 GM-25-Q12 (bucket 1)

- **Canonical:** GM25-Q12 — Kiosk: web-only, or does Expo do kiosk too?
- **Why one decision:** Kiosk: web-only, or does Expo do kiosk too?

### ACCESSIBILITY — canonical: GM-25 GM-25-Q13 (bucket 1)

- **Canonical:** GM25-Q13 — Accessibility and text scaling: is 1.6× text a launch gate for both clients?
- **Why one decision:** Accessibility and text scaling: is 1.6x text a launch gate for both clients?

### ERROR-UX — canonical: GM-25 GM-25-Q14 (bucket 1)

- **Canonical:** GM25-Q14 — Error, retry, and crash UX: one standard across clients?
- **Why one decision:** Error, retry, and crash UX: one standard across clients?

### COMING-SOON-POLICY — canonical: GM-25 GM-25-Q15 (bucket 1)

- **Canonical:** GM25-Q15 — "Coming soon" policy: what may ship labelled coming-soon?
- **Why one decision:** "Coming soon" policy: what may ship labelled coming-soon?

### INSTALL-HANDOFF — canonical: GM-25 GM-25-Q16 (bucket 1)

- **Canonical:** GM25-Q16 — Web ↔ app install handoff: where does web send phone users, and does the app link back?
- **Why one decision:** Web ↔ app install handoff: where does web send phone users; does the app link back?

### SIGNOFF-EVIDENCE — canonical: GM-25 GM-25-Q17 (bucket 1)

- **Canonical:** GM25-Q17 — Launch sign-off evidence: what proves each surface ready?
- **Why one decision:** Launch sign-off evidence: what proves each surface ready?

### TWIN-DRIFT — canonical: GM-25 GM-25-Q18 (bucket 1)

- **Canonical:** GM25-Q18 — Twin-drift prevention after launch: who owns parity?
- **Why one decision:** Twin-drift prevention after launch: who owns parity?

### MOBILE-PROFILE-GAP — canonical: GM-25 GM-25-C08 (bucket 3)

- **Canonical:** GM25-C08 — LA-Q02 (code, ON-04). Fix before launch? Mobile "add personal profile" drops pharmacist data and sends other staff to not-found.
- **Why one decision:** Implementation gap (LA-Q02 / ON-04): mobile "add personal profile" drops pharmacist data and sends other staff to not-found.

### DEADEND-SCREENS-GAP — canonical: GM-25 GM-25-C09 (bucket 3)

- **Canonical:** GM25-C09 — LA-Q03 (code, ON-05). Fix before launch? Reachable mobile screens can dead-end or send unsupported fields.
- **Why one decision:** Implementation gap (LA-Q03 / ON-05): reachable mobile screens can dead-end or send unsupported fields.
- **Flag:** NOT RE-VALIDATED in GM-25 (C09 not in the queue not-revalidated list, but the file flags the underlying screens) — re-validate before fixing

### PROGRESS-PCT-GAP — canonical: GM-25 GM-25-C10 (bucket 3)

- **Canonical:** GM25-C10 — LA-Q04 (code, ON-10). Fix before launch? Profile progress % doesn't match what Verified needs.
- **Why one decision:** Implementation gap (LA-Q04 / ON-10): profile progress % does not match what Verified needs.
- **Flag:** NOT RE-VALIDATED — do not fix on this evidence alone

### AUTOPUBLISH-GAP — canonical: GM-25 GM-25-C11 (bucket 3)

- **Canonical:** GM25-C11 — LA-Q11 (code, SH-11). Fix before launch? The auto-publish setting contradicts R06/R04B and is missing on mobile.
- **Why one decision:** Implementation gap (LA-Q11 / SH-11): the auto-publish setting contradicts R06/R04B and is missing on mobile. Backend approve() always publishes, never reads the flag. R04A/R06 are APPROVED — build the setting.

### MOBILE-BUNDLE-Q47 — canonical: (no separate canonical — members merge into the decisions named in the note) (bucket 5)

- **Merged duplicates (1):**
  - GM-26 GM-26-Q47 — GM26-Q47 — [P2 · code gap, timing decision] Fix before launch? Mobile 'add personal profile' drops pharmacist data / sends other staff to not-found; profile progress % doesn't match Verified; payment readiness only visible at acceptance.
- **Why one decision:** Duplicate bundle: GM-26-Q47 restates MOBILE-PROFILE-GAP + PROGRESS-PCT-GAP + the PAYREADY visibility facet. No separate decision; merged into those three.

### OFFPLATFORM-HIRING — canonical: GM-26 GM-26-Q20 (bucket 1)

- **Canonical:** GM26-Q20 — [P1 · decision] What is the rule for hiring a worker directly, off the platform?
- **Why one decision:** What is the rule for hiring a worker directly, off the platform?
- **Flag:** NOT RE-VALIDATED — do not ask until re-validated

### ADMIN-IDENTITY — canonical: GM-26 GM-26-Q37 (bucket 1)

- **Canonical:** GM26-Q37 — [P0 · decision] Who is a platform admin, how do they get the power, and what can they do that nobody else can?
- **Why one decision:** Who is a platform admin, how do they get the power, what can they do that nobody else can?

### ADMIN-AUDIT — canonical: GM-26 GM-26-Q38 (bucket 1)

- **Canonical:** GM26-Q38 — [P1 · decision] What is the audit trail for admin actions, and who can read it?
- **Why one decision:** What is the audit trail for admin actions, and who can read it?

### DATA-SHARING-MAP — canonical: GM-26 GM-26-Q39 (bucket 1)

- **Canonical:** GM26-Q39 — [P1 · decision] What personal data is shown to whom — the full data-sharing map?
- **Why one decision:** What personal data is shown to whom — the full data-sharing map?

### ACCOUNT-DELETION — canonical: GM-26 GM-26-Q40 (bucket 1)

- **Canonical:** GM26-Q40 — [P1 · decision] Account deletion: what is deleted, what is kept (and why), and how long does it take?
- **Why one decision:** Account deletion: what is deleted, what is kept (and why), how long does it take?

### PRIVACY-POLICY — canonical: GM-26 GM-26-Q41 (bucket 1)

- **Canonical:** GM26-Q41 — [P1 · decision] Privacy policy / terms: are they APP-compliant, versioned, and shown on Expo as well as web?
- **Why one decision:** Privacy policy / terms: APP-compliant, versioned, shown on Expo as well as web?

### PROD-CONFIG — canonical: GM-26 GM-26-Q42 (bucket 1)

- **Canonical:** GM26-Q42 — [P0 · security, decision + code gap] Secrets, DEBUG and ALLOWED_HOSTS: what is the production configuration, and who can see it?
- **Why one decision:** Secrets, DEBUG and ALLOWED_HOSTS: what is the production configuration, and who can see it?

### PENTEST-VERIFY — canonical: GM-26 GM-26-Q43 (bucket 4)

- **Canonical:** GM26-Q43 — [P1 · security, decision] Has anyone pentested this, and what is the vulnerability-handling process?
- **Why one decision:** Verification item: has anyone pentested this (UNKNOWN — nothing evidenced)? Needs a pentest, not an owner policy choice. Sub-question needing a NEW narrow owner question (not among the 540): the vulnerability-handling process.

### NOTIF-SECRETS-GAP — canonical: GM-26 GM-26-Q44 (bucket 3)

- **Canonical:** GM26-Q44 — [P1 · security, code gap] Kiosk codes and worker PIN OTPs in notifications (PR #200 B64)
- **Why one decision:** Implementation gap (PR #200 B64): kiosk codes and worker PIN OTPs persist in notifications. Remove them; no owner policy choice.

### B62-B65-GAP — canonical: GM-26 GM-26-Q45 (bucket 3)

- **Canonical:** GM26-Q45 — [P1 · security, code gap] Region Admin cross-tenant shift actions; native pairing-code downgrade; pricing-preview leakage (PR #200 B62/B63/B65)
- **Why one decision:** Implementation gaps (PR #200 B62/B63/B65): Region Admin cross-tenant shift actions; native pairing-code downgrade; pricing-preview leakage. Fix + negative tests; no owner policy choice.

### DEPLOY-PATH — canonical: GM-26 GM-26-Q46 (bucket 1)

- **Canonical:** GM26-Q46 — [P1 · release, decision] Staging, migration rehearsal and rollback: what is the deploy path to production?
- **Why one decision:** Staging, migration rehearsal and rollback: what is the deploy path to production?

### AHPRA-REFRESH-GAP — canonical: GM-26 GM-26-Q35 (bucket 3)

- **Canonical:** GM26-Q35 — [P1 · code gap, timing decision] Fix before launch? Booking never refreshes AHPRA registration from the public register.
- **Why one decision:** Implementation gap: booking never refreshes AHPRA registration from the public register. The re-check cadence is AHPRA-RECHECK; the missing refresh is the gap.

### SESSION-DURATION — canonical: GM-01 GM-01-Q01 (bucket 1)

- **Canonical:** GM01-Q01 — How long should a sign-in last, and should "Keep me signed in" exist on mobile too?
- **Why one decision:** How long should a sign-in last; should "Keep me signed in" exist on mobile too?

### UNVERIFIED-EMAIL — canonical: GM-01 GM-01-Q03 (bucket 1)

- **Canonical:** GM01-Q03 — Should an unverified email block sign-in entirely, or let the worker in to finish verifying?
- **Why one decision:** Should an unverified email block sign-in entirely, or let the worker in to finish verifying? Distinct from PRE-VERIFIED (Verified-status capabilities).

### TWO-FACTOR — canonical: GM-01 GM-01-Q05 (bucket 1)

- **Canonical:** GM01-Q05 — Should sign-in get a second factor (authenticator app), or is email code + mobile check enough?
- **Why one decision:** Second factor (authenticator app), or is email code + mobile check enough?

### DEVICES — canonical: GM-01 GM-01-Q06 (bucket 1)

- **Canonical:** GM01-Q06 — How many devices can stay signed in, and should there be a "sign out everywhere" button?
- **Why one decision:** How many devices can stay signed in; "sign out everywhere" button?

### KEEP-SIGNED-IN-GAP — canonical: GM-01 GM-01-Q07 (bucket 3)

- **Canonical:** GM01-Q07 — Fix the "Keep me signed in" inversion? (ticked = 7 days, unticked = 90 days)
- **Why one decision:** Implementation gap: "Keep me signed in" inversion (ticked = 7 days, unticked = 90 days). Fix the inversion once SESSION-DURATION decides the durations.

### SESSION-EXPIRY-UX — canonical: GM-01 GM-01-Q08 (bucket 1)

- **Canonical:** GM01-Q08 — When a session expires mid-use, what should the worker see?
- **Why one decision:** When a session expires mid-use, what should the worker see?

### RETURN-TOPAGE — canonical: GM-01 GM-01-Q09 (bucket 1)

- **Canonical:** GM01-Q09 — After sign-in, should the worker return to the page that sent them there? (Web parity)
- **Why one decision:** After sign-in, return to the page that sent them there (web parity)?

### BIOMETRICS — canonical: GM-01 GM-01-Q11 (bucket 1)

- **Canonical:** GM01-Q11 — Biometrics on the phone: keep it, and should the web get passkeys? (Expo-only feature)
- **Why one decision:** Biometrics on the phone: keep it; should the web get passkeys?

### OFFLINE-SIGNOUT — canonical: GM-01 GM-01-Q12 (bucket 1)

- **Canonical:** GM01-Q12 — If sign-out fails (offline), should the app sign you out anyway or stay signed in?
- **Why one decision:** If sign-out fails (offline), sign out anyway or stay signed in?

### PASSWORD-RESET — canonical: GM-01 GM-01-Q13 (bucket 1)

- **Canonical:** GM01-Q13 — Password reset signs every device out — keep that, and should the reset link expire?
- **Why one decision:** Password reset signs every device out — keep that; should the reset link expire?

### LOCKOUT-CAPTCHA — canonical: GM-01 GM-01-Q14 (bucket 1)

- **Canonical:** GM01-Q14 — Login defences: keep 5-fails / 1-hour lockout, and should sign-in get a CAPTCHA?
- **Why one decision:** Login defences: keep 5-fails / 1-hour lockout; CAPTCHA on sign-in?

### DENIED-PAGE-UX — canonical: GM-01 GM-01-Q15 (bucket 1)

- **Canonical:** GM01-Q15 — When a worker opens a page they are not allowed to see, should the app say so or silently send them home?
- **Why one decision:** Worker opens a page they are not allowed to see: say so or silently send them home?

### MOBILE-NUMBERS — canonical: GM-01 GM-01-Q18 (bucket 1)

- **Canonical:** GM01-Q18 — Mobile numbers: Australian only, locked forever once verified — keep that?
- **Why one decision:** Mobile numbers: Australian only, locked forever once verified — keep that? Distinct from MOBILE-SKIP (who may skip the check).

### CODE-PARAMS — canonical: GM-01 GM-01-Q19 (bucket 1)

- **Canonical:** GM01-Q19 — Email/mobile codes: keep 6 digits / 10 minutes / 5 tries, and is the test-mode code display safely off in production?
- **Why one decision:** Email/mobile codes: keep 6 digits / 10 minutes / 5 tries; is the test-mode code display safely off in production? Test-mode display is code-gated (senior review) — residual risk is staging/local misconfiguration, a verification item inside this decision.

## 10. Full canonical list — the 311 genuine decisions

Grouped by theme. Canonical entry first, then the decision in the file's own words.

### Launch & scope

1. **LAUNCH-01** (`GM-21 GM-21-Q01`) — GM21-Q01 — Do we launch the goods marketplace at all, and for whom? [FIRST — see Part D] — VERIFIED, recommendation strengthened — ⚠ GM-18-Q25/Q26 titles unrecovered (senior-review grouping: launch timing)
2. **MARKETPLACE-TRADE** (`GM-21 GM-21-Q02`) — GM21-Q02 — What may be traded, and what is banned? — VERIFIED
3. **MARKETPLACE-SELLER** (`GM-21 GM-21-Q03`) — GM21-Q03 — Who can sell personally, and who can sell for a pharmacy? — VERIFIED
4. **MARKETPLACE-BUYER** (`GM-21 GM-21-Q04`) — GM21-Q04 — Who can buy, and how far does a listing travel? — CHANGED (public catalogue is wider than the model promises)
5. **MARKETPLACE-IDCHECK** (`GM-21 GM-21-Q05`) — GM21-Q05 — What identity check must a trader pass before listing or buying? — VERIFIED
6. **MARKETPLACE-TERMS** (`GM-21 GM-21-Q06`) — GM21-Q06 — Which marketplace terms must a user accept, and when? — VERIFIED
7. **MARKETPLACE-REVIEW** (`GM-21 GM-21-Q07`) — GM21-Q07 — How does listing review work, and how fast? — VERIFIED
8. **MARKETPLACE-PRICE** (`GM-21 GM-21-Q08`) — GM21-Q08 — Sell, swap, free: what are the price rules? — VERIFIED
9. **MARKETPLACE-AUDIENCE** (`GM-21 GM-21-Q09`) — GM21-Q09 — Audience circles and escalation: who sees it first, and when does it widen? — VERIFIED
10. **MARKETPLACE-EXCHANGE** (`GM-21 GM-21-Q10`) — GM21-Q10 — Enquiry or firm offer: what is an exchange, and when is a listing held? — CHANGED (reservations never expire)
11. **MARKETPLACE-MONEY** (`GM-21 GM-21-Q11`) — GM21-Q11 — How is money handled — in-platform, or off-platform? — VERIFIED (no payment path exists)
12. **MARKETPLACE-DELIVERY** (`GM-21 GM-21-Q12`) — GM21-Q12 — Delivery and pickup: who pays, who organises, what proves it arrived? — VERIFIED
13. **MARKETPLACE-TRANSFER** (`GM-21 GM-21-Q13`) — GM21-Q13 — Internal transfers between a owner's pharmacies: transfer or listing? — CHANGED (no destination acceptance exists)
14. **MARKETPLACE-MODERATION** (`GM-21 GM-21-Q14`) — GM21-Q14 — Moderation, reports, restrictions: who acts, how fast, can it be appealed? — VERIFIED
15. **MARKETPLACE-ETHICAL** (`GM-21 GM-21-Q15`) — GM21-Q15 — The ethical marketplace (medicines): who can use it, and what are the "ethical" rules? — VERIFIED (whole app traced)
16. **MARKETPLACE-NOTIFY** (`GM-21 GM-21-Q16`) — GM21-Q16 — What are buyers and sellers told, and what happens when a notification fails? — VERIFIED (no notifications exist)
17. **MARKETPLACE-PHOTOS** (`GM-21 GM-21-Q17`) — GM21-Q17 — Photos: what shows before review, and what is banned in images? — VERIFIED
18. **MARKETPLACE-CATALOGUE** (`GM-21 GM-21-Q18`) — GM21-Q18 — Catalogue products and imports: who adds products, and who checks the rights? — VERIFIED
19. **MARKETPLACE-PARITY** (`GM-21 GM-21-Q19`) — GM21-Q19 — Web vs Expo parity: which marketplace screens exist on each client? — VERIFIED
20. **MARKETPLACE-FEES** (`GM-21 GM-21-Q20`) — GM21-Q20 — Fees and commission: does the platform charge for trades? — VERIFIED (no fee anywhere)

### Verification, AHPRA, gates

21. **VERIFY-GATE** (`GM-12 GM-12-Q01`) — GM-12-Q01 — Where must Verified + current AHPRA be enforced? [FIRST — see §4] — ⚠ GM-18-Q11 title unrecovered (senior-review grouping: Verified/AHPRA)
22. **PRE-VERIFIED** (`GM-02 ON-Q02`) — ON-Q02 — What can a worker do before they are Verified?
23. **AHPRA-EXEMPT** (`GM-05 Q-01`) — Q-01 — [ON-P01] ★ FIRST QUESTION — see Section 4
24. **SIGNUP-TRACKS** (`GM-02 ON-Q01`) — ON-Q01 — Which sign-up tracks should workers get at launch?
25. **EXPLORER** (`GM-02 ON-Q05`) — ON-Q05 — What can Explorers (new to pharmacy) do with shifts?
26. **ID-CHECK** (`GM-02 ON-Q08`) — ON-Q08 — Who must pass an ID check? — ⚠ GM-26-Q07 NOT RE-VALIDATED — do not ask until re-validated
27. **AHPRA-RECHECK** (`GM-02 ON-Q06`) — ON-Q06 — How should AHPRA be re-checked after sign-up? — ⚠ GM-26-Q10 NOT RE-VALIDATED — do not ask until re-validated
28. **AHPRA-LOOKUP** (`GM-02 ON-P03`) — ON-P03 — Which AHPRA lookup should run at launch? — ⚠ GM-26-Q11 NOT RE-VALIDATED; GM-18-Q12 title unrecovered (senior-review grouping: Verified/AHPRA)
29. **AHPRA-UNCONFIRMED** (`GM-02 ON-Q07`) — ON-Q07 — If current registration cannot be confirmed, what happens to future bookings? — ⚠ GM-26-Q12 NOT RE-VALIDATED — do not ask until re-validated
30. **AHPRA-SUSPENDED** (`GM-02 ON-P02`) — ON-P02 — When the register shows Suspended or Cancelled, what happens? — ⚠ GM-26-Q13 NOT RE-VALIDATED — do not ask until re-validated
31. **INDEMNITY** (`GM-02 ON-Q09`) — ON-Q09 — Which workers must prove professional indemnity cover? — ⚠ GM-26-Q14 NOT RE-VALIDATED — do not ask until re-validated
32. **RETENTION** (`GM-02 ON-R01`) — ON-R01 — How long should verification evidence be kept?
33. **SUPER-SHOW** (`GM-02 ON-Q10`) — ON-Q10 — How should super show on ABN contractor terms?
34. **COUNTER-VERIFY** (`GM-02 GM-02-Q20`) — GM02-Q20 — Should submitting a counter-offer on a public shift require Verified/AHPRA, like applying does?
35. **OFFER-UNVERIFIED** (`GM-02 GM-02-Q21`) — GM02-Q21 — Should a manager be warned or blocked from offering a shift to an unverified or suspended worker?
36. **AHPRA-EXPIRY-BLOCK** (`GM-02 GM-02-Q22`) — GM02-Q22 — Should a passed AHPRA expiry date itself block new public applications, even without a fresh lookup?
37. **INTERN-AHPRA** (`GM-02 GM-02-Q23`) — GM02-Q23 — Should intern talent posts get the same AHPRA-expiry check pharmacist posts get?
38. **MOBILE-SKIP** (`GM-02 GM-02-Q24`) — GM02-Q24 — Who may skip the Australian mobile check, and what must they prove instead?

### Pharmacy setup & posting gate

39. **PHARM-GATE** (`GM-03 GM-03-Q01`) — GM-03-Q01 — What must a pharmacy pass before posting to outside workers? — ⚠ GM-25-C06 NOT RE-VALIDATED — do not ask until re-validated
40. **SITE-BRIEF** (`GM-02 ON-Q12`) — ON-Q12 — Which site brief fields are required before the first post?
41. **SAVE-PAYMENT** (`GM-02 ON-Q13`) — ON-Q13 — Should pharmacies save a payment method during setup? — ⚠ GM-25-C07 NOT RE-VALIDATED — do not ask until re-validated
42. **ORG-JOIN** (`GM-02 ON-Q14`) — ON-Q14 — How do organisations (multi-site groups) join?
43. **PAYREADY** (`GM-02 ON-Q04`) — ON-Q04 — When must a worker's pay details (ABN or TFN, bank, super) be ready? — ⚠ GM-25-C05 NOT RE-VALIDATED — do not ask until re-validated
44. **MOBILE-PARITY** (`GM-02 ON-Q15`) — ON-Q15 — Must every onboarding step work on mobile at launch? — ⚠ ON-Q15 / Q-16 NOT VERIFIED — ask only after the joint re-inspection pass (GM-05 backlog B-17)
45. **OWNER-SKIP** (`GM-03 GM-03-Q06`) — GM-03-Q06 — Can an owner skip adding a pharmacy forever, and should anything remind them?
46. **OWNER-VS-PHARMACY** (`GM-03 GM-03-Q07`) — GM-03-Q07 — Owner profile vs pharmacy profile: who is the legal party, and what happens when the owner isn't a pharmacist?
47. **PHARM-EDIT-LOCK** (`GM-03 GM-03-Q09`) — GM-03-Q09 — Can the owner change a pharmacy after shifts are posted — and what locks when?
48. **PHARM-DOCS** (`GM-03 GM-03-Q10`) — GM-03-Q10 — Which pharmacy documents are required, who reviews them, and do they expire?
49. **DEFAULT-RATES** (`GM-03 GM-03-Q11`) — GM-03-Q11 — Default rates and the payroll switch: where do they belong, and what is the default?
50. **PHARM-VERIFY** (`GM-03 GM-03-Q12`) — GM-03-Q12 — Who verifies a pharmacy (`verified` flag), on what evidence, and is the owner told?

### Organisations, chains, regions

51. **ORG-TAXONOMY** (`GM-04 GM-04-Q02`) — GM-04-Q02 — What is an organisation, a chain, and a region — and can one pharmacy belong to more than one? [NEW, refined by code]
52. **ORG-ADMIN** (`GM-04 GM-04-Q05`) — GM-04-Q05 — What can an organisation admin do? (hierarchy, pharmacies, members, shifts) [NEW, refined]
53. **ORG-RATES** (`GM-04 GM-04-Q06`) — GM-04-Q06 — Are there org-level rates, policies or defaults (or is everything per pharmacy)? [NEW]
54. **ORG-VISIBILITY** (`GM-04 GM-04-Q07`) — GM-04-Q07 — How does org membership affect shift visibility and booking? (who counts as "in the org"?) [ex-#184 ON-Q03 context + E01/E01A] — CHANGED (member now partly defined)
55. **SOURCE-FROZEN** (`GM-15 GM-15-31`) — GM15-31 — CX-Q31 · When is a worker's source (favourite, chain, org, public) frozen, and which wins if several apply? [STILL VALID] — ⚠ GM-04-Q09 NOT RE-VALIDATED — do not ask until re-validated
56. **REGION** (`GM-04 GM-04-Q10`) — GM-04-Q10 — Do regions exist as a product concept, and if so what do they scope? [NEW] — CHANGED (role exists, geography still doesn't)
57. **ORG-INCIDENTS** (`GM-15 GM-15-27`) — GM15-27 — CX-Q27 · Do favourite, chain and organisation incidents count toward the platform ladder? [STILL VALID] — ⚠ GM-04-Q11 NOT RE-VALIDATED — do not ask until re-validated

### Roles, membership, invites

58. **INVITE-NOACCOUNT** (`GM-05 Q-04`) — Q-04 — [NEW] When a pharmacy invites someone with no account, should they become an active member immediately?
59. **INVITE-EXPIRY** (`GM-05 Q-05`) — Q-05 — [NEW] Should a direct email invite ever expire, and can it be revoked?
60. **ORGSTAFF-REGION** (`GM-05 Q-06`) — Q-06 — [NEW] Who can create ORG_STAFF accounts and organisation memberships, and what does REGION_ADMIN actually scope?
61. **MANAGER-EQUALS-OWNER** (`GM-05 Q-07`) — Q-07 — [NEW] A Manager has exactly the same powers as the Owner. Keep that?
62. **INVITE-LINKS** (`GM-05 Q-08`) — Q-08 — [NEW] Invite links: who can generate them, how long do they live, and what stops abuse?
63. **MEMBER-REMOVED** (`GM-05 Q-09`) — Q-09 — [NEW] What happens when a member is removed — bookings, roster, history?
64. **MANAGER-SWITCH** (`GM-05 Q-11`) — Q-11 — [NEW] The Pharmacy Manager one-time switch: what exactly happens, and is once really once?
65. **HEART** (`GM-05 Q-14`) — Q-14 — [TB-Q08] What should the heart on a talent card do? — ⚠ GM-25-C17 NOT RE-VALIDATED — do not ask until re-validated
66. **MEMBERSHIP-CAP** (`GM-05 Q-18`) — Q-18 — [NEW] The 3-pharmacy membership cap: keep it, raise it, or scope it?
67. **OWNER-MEMBERSHIP** (`GM-05 Q-19`) — Q-19 — [NEW] Should the owner's own membership really be untouchable through the normal membership screen?

### Employment & leave

68. **EMPLOY-PAY-AGREEMENT** (`GM-06 GM-06-Q01`) — GM-06-Q01 — Should every employed worker have a dated pay agreement (engagement), and who sets it?
69. **EMPLOY-AWARD-JUNIOR** (`GM-06 GM-06-Q02`) — GM-06-Q02 — Award or above Award — and what happens when the worker has a birthday (junior rates)?
70. **EMPLOY-PT-HOURS** (`GM-06 GM-06-Q03`) — GM-06-Q03 — Part-time contracted hours: what does the roster owe a part-timer?
71. **EMPLOY-LEAVE-TYPES** (`GM-06 GM-06-Q04`) — GM-06-Q04 — Which leave types exist, and is leave paid, unpaid, or "the roster just changes"?
72. **EMPLOY-LEAVE-BALANCES** (`GM-06 GM-06-Q05`) — GM-06-Q05 — Should the product track leave balances and entitlements, or stay request-only?
73. **EMPLOY-LEAVE-APPROVED** (`GM-06 GM-06-Q06`) — GM-06-Q06 — When leave is approved, what happens to the rostered shift? (FIRST QUESTION, see Part D)
74. **EMPLOY-LEAVE-RANGE** (`GM-06 GM-06-Q07`) — GM-06-Q07 — Leave for a date range: who sees it, and should it block rostering inside the range?
75. **EMPLOY-END** (`GM-06 GM-06-Q08`) — GM-06-Q08 — When employment ends, what happens to the roster, the bookings, and the leave?
76. **EMPLOY-MIN-STAFFING** (`GM-06 GM-06-Q09`) — GM-06-Q09 — Minimum staffing (coverage requirements): a rule, a warning, or decoration?

### Roster, cover, swap

77. **ROSTER-SHAPE** (`GM-07 GM-07-Q01`) — GM-07-Q01 — Is the weekly draft → validate → publish → acknowledge roster the right shape?
78. **ROSTER-BUILDER** (`GM-07 GM-07-Q02`) — GM-07-Q02 — Who can build and publish a roster — owner, manager, roster manager, org admin?
79. **ROSTER-ACK** (`GM-07 GM-07-Q03`) — GM-07-Q03 — Workers are asked to acknowledge the roster — what if they never do?
80. **COVER-TIMING** (`GM-07 GM-07-Q08`) — GM-07-Q08 — How late can a swap or cover request come in — and what happens near the start?
81. **COVER-PAY-TERMS** (`GM-07 GM-07-Q09`) — GM-07-Q09 — When a shift changes hands, whose pay terms apply — and what does the worker see?
82. **COVER-RELEASE-TIER** (`GM-07 GM-07-Q10`) — GM-07-Q10 — Release to the marketplace: which audience, and who decides the tier?

### Attendance & kiosk

83. **CLOCKIN-WALKIN** (`GM-08 GM-08-Q01`) — GM-08-Q01 — Who is allowed to clock in — and should a verified locum with no booking be able to walk in and work? (FIRST QUESTION, see Part D)
84. **PROVISIONAL** (`GM-08 GM-08-Q02`) — GM-08-Q02 — Provisional attendance: who approves it, how fast, and what if nobody does?
85. **NOSHOW** (`GM-15 GM-15-11`) — GM15-11 — CX-Q11 · When does a missing worker become a no-show? [STILL VALID]
86. **LATE-EARLY** (`GM-15 GM-15-12`) — GM15-12 — CX-Q12 · How is late arrival treated? [STILL VALID]
87. **KIOSK-OFFLINE** (`GM-08 GM-08-Q05`) — GM-08-Q05 — Offline kiosk: how long may it run offline, and what happens to suspicious events?
88. **KIOSK-PIN** (`GM-08 GM-08-Q06`) — GM-08-Q06 — PIN clock-in: keep it, who sets the PIN, and is 5-tries / 15-minutes right? (NEW)
89. **BREAKS** (`GM-08 GM-08-Q09`) — GM-08-Q09 — Breaks: paid or unpaid, how long, and who decides? (NEW, boundary with GM-09/GM-14)
90. **MANAGER-CLOCKIN** (`GM-08 GM-08-Q10`) — GM-08-Q10 — Can a manager clock someone in or out for them? (MANAGER source) (NEW)

### Timesheet & payroll

91. **PAYER-MODEL** (`GM-09 Q1`) — Q1 — Who pays whom, and when? (payment ownership — ASK FIRST, see §4)
92. **TIMESHEET-SOURCE** (`GM-09 Q2`) — Q2 — How is a timesheet created, and from what source of truth?
93. **TIMESHEET-APPROVAL** (`GM-09 Q3`) — Q3 — Who approves a timesheet, by when, and what happens if nobody does?
94. **TIMESHEET-CORRECTIONS** (`GM-09 Q4`) — Q4 — How are corrections handled before and after approval?
95. **PAYROLL-EXPORT** (`GM-09 Q6`) — Q6 — What does the payroll export contain, and where does it go?
96. **ABN-TFN** (`GM-09 Q7`) — Q7 — ABN and TFN: what is collected, from whom, and how is it stored?
97. **PAY-RECORDS** (`GM-09 Q9`) — Q9 — What records are kept, for how long, and who can see a worker's pay history?
98. **PAY-FAILURE-PATHS** (`GM-09 Q10`) — Q10 — What happens on the failure paths: no-show, early departure, shift cancelled mid-way, kiosk offline?

### Shift posting & rates

99. **POST-WHO** (`GM-10 GM-10-Q01`) — GM-10-Q01 — Who can post a shift, and from where?
100. **POST-FIELDS** (`GM-10 GM-10-Q02`) — GM-10-Q02 — What fields are required to post a shift, and what happens when one is missing?
101. **RATE-01** (`GM-10 GM-10-Q03`) — GM-10-Q03 — Must a shift carry a fixed hourly rate at posting, or can the rate be open/negotiable? [FIRST — see §3]
102. **LOADINGS** (`GM-10 GM-10-Q04`) — GM-10-Q04 — How are overtime, weekend and public-holiday loadings handled?
103. **POST-EDIT** (`GM-10 GM-10-Q06`) — GM-10-Q06 — Can a posted shift be edited, and what changes after interest or acceptance?
104. **POST-WITHDRAW** (`GM-10 GM-10-Q07`) — GM-10-Q07 — Can a posted shift be withdrawn, and what happens to workers who already saw it or applied?
105. **POST-DRAFTS** (`GM-10 GM-10-Q09`) — GM-10-Q09 — Do drafts exist, and what does publishing a draft do?
106. **POST-REPOST** (`GM-10 GM-10-Q10`) — GM-10-Q10 — How does reposting work, and what carries over?
107. **POST-TRIGGERS** (`GM-10 GM-10-Q11`) — GM-10-Q11 — What does posting trigger (notifications, fees, matching), and what do edit/withdraw/repost trigger?
108. **POST-ZERO** (`GM-10 GM-10-Q12`) — GM-10-Q12 — NEW: Can a shift ever be posted, displayed or paid at $0.00?

### Audience & escalation

109. **ESCALATION-NOTIFY** (`GM-11 GM-11-Q01`) — GM-11-Q01 — When a shift escalates, who is told, and when does escalation stop? 🔴 [FIRST — see §4]
110. **ESCALATION-PAUSE** (`GM-11 GM-11-Q02`) — GM-11-Q02 — Should escalation pause while an offer waits for an answer? 🟠
111. **ESCALATION-LATE** (`GM-11 GM-11-Q03`) — GM-11-Q03 — How late may a scheduled escalation fire? 🔴 (code gap once decided)
112. **LATER-TIER** (`GM-11 GM-11-Q06`) — GM-11-Q06 — Who can start at a later tier, and can a tier be skipped entirely? 🟡
113. **ANON-HIDDEN** (`GM-11 GM-11-Q07`) — GM-11-Q07 — On an anonymous public post, what is hidden? 🟡
114. **ANON-REVEAL** (`GM-11 GM-11-Q08`) — GM-11-Q08 — When does an anonymous pharmacy's name reach the worker? 🟠
115. **URGENCY** (`GM-11 GM-11-Q09`) — GM-11-Q09 — What makes a shift "urgent", and does urgency change the audience/escalation? 🟡

### Interest & offers

116. **SHIFT-WAYS** (`GM-12 GM-12-Q06`) — GM-12-Q06 — Which ways can a worker get a shift at launch?
117. **INSTANT-BOOK** (`GM-12 GM-12-Q07`) — GM-12-Q07 — Who may instant-book or be auto-accepted?
118. **APPLICANT-ORDER** (`GM-12 GM-12-Q08`) — GM-12-Q08 — How should applicants be ordered for the pharmacy?
119. **APPLICANT-REVEAL** (`GM-12 GM-12-Q09`) — GM-12-Q09 — What should the pharmacy see on each applicant? (incl. reveal)
120. **OFFER-EXPIRY** (`GM-12 GM-12-Q10`) — GM-12-Q10 — How long does an offer stay open? — ⚠ GM-18-Q18 title unrecovered (senior-review grouping: lifecycle)
121. **OFFER-DECLINED** (`GM-12 GM-12-Q11`) — GM-12-Q11 — When an offer is declined or expires, what happens to the shift?
122. **MULTI-OFFER** (`GM-12 GM-12-Q12`) — GM-12-Q12 — Can a pharmacy offer one shift to several workers at once?
123. **COUNTER** (`GM-12 GM-12-Q13`) — GM-12-Q13 — What can a worker counter?
124. **COUNTER-ACCEPT** (`GM-12 GM-12-Q14`) — GM-12-Q14 — If the pharmacy accepts a counter-offer, is the worker booked?
125. **WITHDRAW-OFFER** (`GM-12 GM-12-Q16`) — GM-12-Q16 — NEW: Can the pharmacy withdraw a pending offer? What is the worker told?
126. **WITHDRAW-INTEREST** (`GM-12 GM-12-Q17`) — GM-12-Q17 — NEW: Should withdrawing interest tell the pharmacy?
127. **OFFER-01** (`GM-18 GM-18-Q07`) — GM-18 GM-18-Q07 — Firm offer vs enquiry (senior review: KEEP, superseded by OFFER-01) — ⚠ GM-18-Q07 title confirmed by senior review (firm offer, KEEP recommendation superseded by OFFER-01 option C)
128. **OVERLAP-APPLICATIONS** (`GM-12 GM-12-Q21`) — GM-12-Q21 — When a worker is booked, what happens to their overlapping applications?
129. **OVERLAP-HOLD** (`GM-12 GM-12-Q22`) — GM-12-Q22 — Can a worker hold a reservation that overlaps another booking or roster shift?
130. **MUST-HAVE** (`GM-12 GM-12-Q23`) — GM-12-Q23 — Should must-have requirements block applying?

### Reservation & payment

131. **COUNTDOWN** (`GM-13 GM-13-Q03`) — GM13-Q03 — Should reservations show a live payment countdown? (carried BK-Q13) — ⚠ GM-25-C18 NOT RE-VALIDATED — do not ask until re-validated
132. **DROP-RESERVATION** (`GM-13 GM-13-Q04`) — GM13-Q04 — Can a worker drop a reservation before payment without an incident? (carried BK-Q14)
133. **PAYMENT-FAIL** (`GM-13 GM-13-Q08`) — GM13-Q08 — What happens after booking payment fails? (carried BK-R01; SH-13 has no definition)
134. **LATE-PAYMENT** (`GM-13 GM-13-Q09`) — GM13-Q09 — Payment arrives after expiry: credit, refund, or nothing — and who decides? (carried F04; GM-17 boundary)
135. **LEGACY-PENALTY** (`GM-16 GM-16-Q03`) — GM16-Q03 — [LA-Q06 / SH-02] Fix before launch? The old 10%/20% penalty route is still live. — ✅ STILL VALID as code-present (routing now verified)
136. **REFUND-01** (`GM-17 GM-17-Q01`) — GM17-Q01 — FIRST QUESTION (ask this first) — ⚠ GM-26-Q21 NOT RE-VALIDATED — do not ask until re-validated

### Terms, Award, GST, super

137. **SUPER-PAYABILITY** (`GM-14 GM-14-Q01`) — GM14-Q01 — Who ever decides whether super is payable for an ABN contractor — and what happens until they do? (new, from verified code)
138. **WORKER-SEES** (`GM-14 GM-14-Q02`) — GM14-Q02 — What must the worker see before accepting? (carried AG-Q01 / SH-09)
139. **ACCEPT-01** (`GM-14 GM-14-Q03`) — GM14-Q03 — Does the pharmacy accept the same agreement? (carried AG-Q02 / SH-09 — FIRST QUESTION, see Part D)
140. **EMPLOYMENT-STATUS** (`GM-14 GM-14-Q04`) — GM14-Q04 — How is employee vs contractor status decided? (carried AG-Q04)
141. **PDF-COPY** (`GM-14 GM-14-Q06`) — GM14-Q06 — Should both sides get a PDF copy of the agreement? (carried AG-Q03) — ⚠ GM-22-Q15 NOT RE-VALIDATED — do not ask until re-validated
142. **CHANGE-CONSENT** (`GM-14 GM-14-Q07`) — GM14-Q07 — Which changes after booking need the worker's new consent? (carried AG-Q05 / SH-08 — NOT RE-VALIDATED) — ⚠ File flags NOT RE-VALIDATED — do not ask until re-validated
143. **TERMS-UNTIL-ANSWER** (`GM-14 GM-14-Q08`) — GM14-Q08 — Until the worker answers a change, which terms apply? (carried AG-Q06 — NOT RE-VALIDATED) — ⚠ File flags NOT RE-VALIDATED — do not ask until re-validated
144. **REJECT-CHANGE** (`GM-14 GM-14-Q09`) — GM14-Q09 — If the worker rejects the change, what happens? (carried AG-Q07 — NOT RE-VALIDATED) — ⚠ File flags NOT RE-VALIDATED — do not ask until re-validated
145. **LOCK-FIELDS** (`GM-14 GM-14-Q10`) — GM14-Q10 — Until re-consent is built, lock key fields after the first acceptance? (carried AG-Q08 / SH-08 — NOT RE-VALIDATED) — ⚠ File flags NOT RE-VALIDATED — do not ask until re-validated
146. **AWARD-UPDATER** (`GM-14 GM-14-Q12`) — GM14-Q12 — (new) Who updates the Award rates, and when? (from verified code)
147. **GST** (`GM-14 GM-14-Q11`) — GM14-Q11 — Booking fees: GST and tax invoice? (carried LA-R01 / SH-15; jointly GM-16-Q15 / GM-17-Q06) — ⚠ GM-26-Q33 NOT RE-VALIDATED — do not ask until re-validated

### Cancellation, disputes, ratings

148. **CANCEL-LAUNCH** (`GM-15 GM-15-01`) — GM15-01 — CX-Q01 · What cancellation can launch, given fees are not yet enforceable? [STILL VALID]
149. **OWNER-FEE** (`GM-15 GM-15-02`) — GM15-02 — CX-Q02 · Who receives the owner cancellation fee? [STILL VALID]
150. **UNPAID-FEE** (`GM-15 GM-15-03`) — GM15-03 — CX-Q03 · If the pharmacy cancels an unpaid reservation, is any fee due? [STILL VALID]
151. **BOUNDARY-BANDS** (`GM-15 GM-15-04`) — GM15-04 — CX-Q04 · At exactly 72h / 24h / 12h / 2h, which band applies? [CHANGED]
152. **NOTICE-WINDOW** (`GM-15 GM-15-05`) — GM15-05 — CX-Q05 · How much notice counts as "enough window" for a normal manager approval? [STILL VALID]
153. **ALERT-SPEED** (`GM-15 GM-15-06`) — GM15-06 — CX-Q06 · Inside the window, who is alerted and how fast? [STILL VALID] — ⚠ GM-22-Q07 NOT RE-VALIDATED — do not ask until re-validated
154. **NO-MANAGER-ANSWER** (`GM-15 GM-15-07`) — GM15-07 — CX-Q07 · If no manager answers before start and the worker doesn't come, what is it? [STILL VALID]
155. **MUTUAL-CANCEL** (`GM-15 GM-15-08`) — GM15-08 — CX-Q08 · How is a mutually agreed cancellation proven and approved? [STILL VALID]
156. **ILLNESS-EVIDENCE** (`GM-15 GM-15-09`) — GM15-09 — CX-Q09 · What evidence may support an illness or emergency exemption? [STILL VALID]
157. **PHARMACY-EMERGENCY** (`GM-15 GM-15-10`) — GM15-10 — CX-Q10 · Can a pharmacy emergency (closure, outage) waive the owner fee? [STILL VALID]
158. **NOSHOW-CONFIRM** (`GM-15 GM-15-13`) — GM15-13 — CX-Q13 · How is a no-show confirmed? [STILL VALID]
159. **MULTIDATE-INCIDENTS** (`GM-15 GM-15-14`) — GM15-14 — CX-Q14 · If a worker cancels several dates of one booking, how many incidents is that? [STILL VALID]
160. **REOPEN-AFTER-CANCEL** (`GM-15 GM-15-15`) — GM15-15 — CX-Q15 · After a confirmed booking is cancelled, how does the shift reopen? [STILL VALID]
161. **RELEASE-NOSHOW-SLOT** (`GM-15 GM-15-16`) — GM15-16 — CX-Q16 · Can the manager release a no-show's slot and repost straight away? [STILL VALID]
162. **REPLACEMENT-INCIDENT** (`GM-15 GM-15-17`) — GM15-17 — CX-Q17 · If a worker's cancelled shift is filled by a replacement, what happens to the incident? [STILL VALID]
163. **REPLACEMENT-WAIVER** (`GM-15 GM-15-18`) — GM15-18 — CX-Q18 · If the pharmacy cancels but offers the worker equal replacement work, is the fee waived? [STILL VALID]
164. **DISPUTE-REVIEWER** (`GM-15 GM-15-23`) — GM15-23 — CX-Q23 · Who reviews disputes and appeals? [STILL VALID] — ⚠ GM-26-Q22 NOT RE-VALIDATED — do not ask until re-validated
165. **APPEAL-TIMING** (`GM-15 GM-15-24`) — GM15-24 — CX-Q24 · How long to appeal, and how fast must support answer? [STILL VALID] — ⚠ GM-26-Q23 NOT RE-VALIDATED — do not ask until re-validated
166. **DISPUTE-VISIBILITY** (`GM-15 GM-15-25`) — GM15-25 — CX-Q25 · Who can see each part of a dispute? [STILL VALID] — ⚠ GM-26-Q24 NOT RE-VALIDATED — do not ask until re-validated
167. **INCIDENT-EVENTS** (`GM-15 GM-15-26`) — GM15-26 — CX-Q26 · Which events count as an incident? [STILL VALID]
168. **LOOKBACK** (`GM-15 GM-15-28`) — GM15-28 — CX-Q28 · How far back does the ladder count? [STILL VALID]
169. **BADGE** (`GM-15 GM-15-29`) — GM15-29 — CX-Q29 · When should the reliability badge disappear? [STILL VALID]
170. **SUSPENSION-PROCESS** (`GM-15 GM-15-30`) — GM15-30 — CX-Q30 · What process applies before permanent suspension? [STILL VALID] — ⚠ GM-26-Q25 NOT RE-VALIDATED — do not ask until re-validated
171. **SHIFT-COMPLETE** (`GM-15 GM-15-32`) — GM15-32 — CX-Q32 · What marks a shift complete? [STILL VALID]
172. **DISPUTED-HOURS** (`GM-15 GM-15-33`) — GM15-33 — CX-Q33 · How are disputed hours settled? [STILL VALID — PARTIAL]
173. **EARLY-FINISH** (`GM-15 GM-15-34`) — GM15-34 — CX-R01 · How are early finishes and extra hours paid? [STILL VALID]
174. **WHO-CAN-RATE** (`GM-15 GM-15-35`) — GM15-35 — CX-Q34 · Who can rate, and when? [CHANGED] — ⚠ GM-26-Q27 NOT RE-VALIDATED; GM-18-Q05 title unrecovered (senior-review grouping: ratings)
175. **ROSTER-RATINGS** (`GM-15 GM-15-36`) — GM15-36 — CX-Q35 · Should ratings from internal roster shifts appear on the public talent board? [STILL VALID]
176. **HISTORY** (`GM-15 GM-15-37`) — GM15-37 — CX-Q36 · Do cancelled, expired and no-show shifts stay in both sides' history? [STILL VALID] — ⚠ GM-26-Q28 NOT RE-VALIDATED — do not ask until re-validated
177. **REVIEWS-DISPLAY** (`GM-15 GM-15-42`) — GM15-42 — TB-Q05 · How should reviews and reliability show? [STILL VALID] — ⚠ GM-18-Q06 title unrecovered (senior-review grouping: ratings; confirmed fact: 0.0 (0) display)
178. **BLOCK-WORKER** (`GM-15 GM-15-43`) — GM15-43 — TB-Q09 · Can a pharmacy block a worker? [STILL VALID] — ⚠ GM-26-Q19 NOT RE-VALIDATED — do not ask until re-validated
179. **LEGAL-REVIEW** (`GM-15 GM-15-49`) — GM15-49 — LA-R02 · May cancellation charges launch before Australian legal review? [STILL VALID] — ⚠ GM-26-Q31 NOT RE-VALIDATED — do not ask until re-validated
180. **CANCEL-NOTIFY** (`GM-22 GM-22-03`) — GM22-03 · AG-Q09 — Who is told when a shift is cancelled, covered or replaced? 🔴 decision · gap D07 — CHANGED (partial) — ⚠ GM-22-Q03 cancel half NOT RE-VALIDATED per queue caveats
181. **CHANNELS** (`GM-22 GM-22-04`) — GM22-04 · AG-Q10 — Which channels carry those notices? 🔴 decision · gap D07 — ★ FIRST QUESTION (see Part D) — CHANGED

### Subscriptions, Pills, fees

182. **FEE-LENGTH** (`GM-16 GM-16-Q01`) — GM16-Q01 — [PO-Q16 / SH-03] Should the booking fee depend on shift length? — 🔄 CHANGED (partly)
183. **FEE-START** (`GM-16 GM-16-Q04`) — GM16-Q04 — [PO-Q15 / SH-04] When should booking fees start? — 🔄 CHANGED (mechanism fully verified now)
184. **FULL-COST** (`GM-16 GM-16-Q06`) — GM16-Q06 — [PO-Q04] Should the pharmacy see the full cost before posting? — 🔄 CHANGED (pay-time half verified; pre-posting half not re-validated)
185. **TRIALLING-DISCOUNT** (`GM-16 GM-16-Q08`) — GM16-Q08 — (new, from verified webhook code) Does a trialling subscription get the 50% discount? — verified mechanism, decision open
186. **SUBSCRIPTION-LAPSE** (`GM-16 GM-16-Q09`) — GM16-Q09 — (new, from verified webhook code) What happens the day a subscription lapses? — verified mechanism, decision open
187. **EXTRA-SEATS** (`GM-16 GM-16-Q10`) — GM16-Q10 — (new, from verified webhook code) What happens to staff over 5 when extra seats drop? — verified reset; gating UNKNOWN
188. **SUBSCRIPTION-MGMT** (`GM-16 GM-16-Q16`) — GM16-Q16 — Subscription management: where, by whom, and what does cancelling do? — ✅ VERIFIED (screens now traced)
189. **PILLS** (`GM-16 GM-16-Q17`) — GM16-Q17 — Pills: what are they, what are they worth, do they touch money? — ✅ VERIFIED (fully traced this re-run)

### Invoices & refunds

190. **WORKER-SEES-PAY** (`GM-17 GM-17-Q09`) — GM17-Q09 — What should workers see: rate, super, GST, shift total? (PO-Q03)
191. **INVOICE-CORRECTIONS** (`GM-17 GM-17-Q12`) — GM17-Q12 — Worker invoice corrections: credit notes, void, reversals (NEW)
192. **OVERDUE-INVOICES** (`GM-17 GM-17-Q13`) — GM17-Q13 — Overdue worker invoices: reminders, escalation, late fees? (NEW)
193. **SUBSCRIPTION-INVOICE** (`GM-17 GM-17-Q14`) — GM17-Q14 — Subscription paid by invoice: what if it is never paid? (NEW)
194. **RECONCILIATION-QUEUE** (`GM-17 GM-17-Q15`) — GM17-Q15 — Reconciliation queue: who works flagged payments? (NEW)
195. **INVOICE-NUMBERING** (`GM-17 GM-17-Q18`) — GM17-Q18 — Invoice numbering, tax-invoice wording and duplicate protection (NEW)

### Talent & recruitment

196. **AUDIENCE-01** (`GM-18 GM-18-Q01`) — GM-18 GM-18-Q01 — Who can see the talent board? (confirmed by senior review) — ⚠ GM-18-Q01 title confirmed by senior review
197. **TALENT-REVEAL** (`GM-26 GM-26-Q02`) — GM26-Q02 — [P0 · decision] When is an anonymous candidate's identity revealed? — ⚠ GM-26-Q02 NOT RE-VALIDATED; GM-18-Q02 title unrecovered (senior-review grouping: audience/reveal/masking)
198. **TALENT-HIDDEN** (`GM-26 GM-26-Q03`) — GM26-Q03 — [P0 · decision] What stays hidden before identity reveal? — ⚠ GM-18-Q03 title unrecovered (senior-review grouping: audience/reveal/masking)
199. **TALENT-FILTERS** (`GM-18 GM-18-Q04`) — GM-18 GM-18-Q04 — Filters (title unrecovered) — ⚠ Both titles unrecovered — reconstruct from the lost worker trace before interview; Q04/Q22 may be two distinct filter decisions
200. **TALENT-COMMERCIAL-Q08** (`GM-18 GM-18-Q08`) — GM-18 GM-18-Q08 — Commercial model (title unrecovered) — ⚠ TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis
201. **TALENT-COMMERCIAL-Q09** (`GM-18 GM-18-Q09`) — GM-18 GM-18-Q09 — Commercial model (title unrecovered) — ⚠ TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis
202. **TALENT-COMMERCIAL-Q10** (`GM-18 GM-18-Q10`) — GM-18 GM-18-Q10 — Commercial model (title unrecovered) — ⚠ TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis
203. **TALENT-LIFECYCLE-Q13** (`GM-18 GM-18-Q13`) — GM-18 GM-18-Q13 — Lifecycle (title unrecovered) — ⚠ TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis
204. **TALENT-LIFECYCLE-Q14** (`GM-18 GM-18-Q14`) — GM-18 GM-18-Q14 — Lifecycle (title unrecovered) — ⚠ TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis
205. **HIRING-ROLE** (`GM-18 GM-18-Q15`) — GM-18 GM-18-Q15 — One hiring-role policy (title unrecovered) — ⚠ Ask GM-18-Q15 before the drift fix; GM-05 Q-17 is the gap, not the policy
206. **GM18-Q23-UNKNOWN** (`GM-18 GM-18-Q23`) — GM-18 GM-18-Q23 — Topic unknown (title unrecovered) — ⚠ TITLE AND TOPIC UNRECOVERED — worker trace missing; counted as written, do not ask on this basis
207. **GM18-Q24-DISCLOSURE** (`GM-18 GM-18-Q24`) — GM-18 GM-18-Q24 — Disclosure (title unrecovered) — ⚠ TITLE UNRECOVERED — worker trace missing; counted as written, do not ask on this basis
208. **TALENT-LAPSE** (`GM-01 GM-01-Q17`) — GM01-Q17 — Should a talent post disappear when its author loses Verified status or their AHPRA lapses? (carried LA-Q13, lapsed-credential half)

### Availability & matching

209. **AVAIL-SET** (`GM-19 GM-19-Q01`) — GM-19-Q01 (ex AV-Q01) — How should workers set availability? — ✅ STILL VALID (screens now verified)
210. **AVAIL-REPEAT** (`GM-19 GM-19-Q02`) — GM-19-Q02 (ex AV-Q02) — How far can a repeating availability run? — 🔄 CHANGED (Oct claim wrong)
211. **AVAIL-MATCH** (`GM-19 GM-19-Q03`) — GM-19-Q03 (ex AV-Q03) — When does availability "match" a shift? ★ FIRST QUESTION — see §4
212. **AVAIL-VISIBILITY** (`GM-19 GM-19-Q04`) — GM-19-Q04 (ex AV-Q04) — Who can see a worker's availability? — ✅ STILL VALID (now fully verified) — ⚠ GM-26-Q17 NOT RE-VALIDATED — do not ask until re-validated
213. **AVAIL-BLOCK** (`GM-19 GM-19-Q05`) — GM-19-Q05 (ex AV-Q05) — Should confirmed bookings block that time automatically? — 🔄 CHANGED (alert side now VERIFIED: they do not)
214. **AVAIL-STOP** (`GM-19 GM-19-Q06`) — GM-19-Q06 (ex AV-Q06) — When should a talent post stop showing? — ✅ STILL VALID (feeds now verified to call the rule)
215. **AVAIL-CONFIRMED** (`GM-19 GM-19-Q07`) — GM-19-Q07 (ex AV-Q07) — Should availability show when it was last confirmed? — ✅ STILL VALID (model verified, no field)
216. **URGENT-OPTIN** (`GM-19 GM-19-Q08`) — GM-19-Q08 (ex AV-Q08) — Should urgent-shift alerts need a separate opt-in? — ✅ VERIFIED (single flag; no separate urgent consent) — ⚠ GM-26-Q18 NOT RE-VALIDATED — do not ask until re-validated
217. **DISTANCE-RATE** (`GM-19 GM-19-Q09`) — GM-19-Q09 (ex AV-Q09) — Should workers set a max distance and minimum rate for alerts? — 🔄 SPLIT (distance verified, rate verified absent)
218. **AVAIL-VALIDATION** (`GM-19 GM-19-Q10`) — GM-19-Q10 (NEW) — Should availability validation be added, and what must it reject? — ✅ VERIFIED (no validation)
219. **ROSTER-AVAIL-WARNING** (`GM-19 GM-19-Q11`) — GM-19-Q11 (NEW) — Should a roster availability warning block placement, or stay a warning? — ✅ VERIFIED (warning only)
220. **AVAIL-SYNC** (`GM-19 GM-19-Q12`) — GM-19-Q12 (NEW) — Should the talent-post availability snapshot sync with the calendar? — ✅ VERIFIED (structural; never syncs)
221. **AVAIL-NEXT** (`GM-19 GM-19-Q13`) — GM-19-Q13 (NEW) — Next web: does an availability surface exist, and must it match Vite/Expo? — ✅ VERIFIED ABSENT

### Chat & hubs

222. **CHAT-WHO** (`GM-20 GM-20-Q01`) — GM20-Q01 — Who can start a direct chat with whom? [FIRST QUESTION — see §3]
223. **CHAT-TIMING** (`GM-20 GM-20-Q02`) — GM20-Q02 — When can a worker and a pharmacy chat — before or only after a booking?
224. **CHAT-THREAD** (`GM-20 GM-20-Q03`) — GM20-Q03 — Should a chat thread be linked to a shift?
225. **CHAT-COMMUNITY** (`GM-20 GM-20-Q04`) — GM20-Q04 — Who belongs in a pharmacy's community chat, and can a pharmacy opt out?
226. **CHAT-GROUP** (`GM-20 GM-20-Q05`) — GM20-Q05 — Who can create a custom group chat?
227. **CHAT-ABUSE** (`GM-20 GM-20-Q06`) — GM20-Q06 — How are abusive, spam, or wrong messages handled in chat? (report / block / mute)
228. **CHAT-HISTORY** (`GM-20 GM-20-Q07`) — GM20-Q07 — How long is chat history kept?
229. **CHAT-IDENTITY** (`GM-20 GM-20-Q08`) — GM20-Q08 — What identity does chat show? (anonymous talent authors, emails, photos)
230. **CHAT-FILES** (`GM-20 GM-20-Q09`) — GM20-Q09 — What files can be sent in chat (and in hub posts)?
231. **CHAT-NOTIFY** (`GM-20 GM-20-Q10`) — GM20-Q10 — How are people notified of messages, and can they mute a room?
232. **CHAT-RECEIPTS** (`GM-20 GM-20-Q11`) — GM20-Q11 — Read receipts, typing, presence: what do people see?
233. **CHAT-MODERATION** (`GM-20 GM-20-Q12`) — GM20-Q12 — Who can edit, delete, or pin — and can an admin remove someone else's message?
234. **CHAT-REACTIONS** (`GM-20 GM-20-Q13`) — GM20-Q13 — Should chat reactions include 💩?
235. **CHAT-REVOKED** (`GM-20 GM-20-Q14`) — GM20-Q14 — What happens to chat when a membership is revoked or an AHPRA registration is suspended?
236. **HUB-POSTERS** (`GM-20 GM-20-Q16`) — GM20-Q16 — Who can post in the hubs — and is OTP verification enough, or must posters be Verified workers?
237. **HUB-PUBLIC** (`GM-20 GM-20-Q17`) — GM20-Q17 — Is the public hub (articles + community posts) on at launch, and who moderates it?
238. **HUB-RULES** (`GM-20 GM-20-Q18`) — GM20-Q18 — Hub posts: edit windows, pinning, tagging, polls — keep today's rules?

### Notifications & rewards

239. **REMINDERS** (`GM-22 GM-22-05`) — GM22-05 · AG-Q11 — Which shifts get pre-shift reminders, and when? 🟠 decision · gap D12 — CHANGED
240. **REMINDER-CHANGE** (`GM-22 GM-22-06`) — GM22-06 · AG-Q12 — If a shift changes inside 12 hours of start, what happens to reminders? 🟠 decision · gap D12 — CHANGED
241. **NOTIF-CENTRE** (`GM-22 GM-22-17`) — GM22-17 · NEW — Is there an in-app notification centre, and what does it do? 🟠 decision — TRACED
242. **PUSH-PERMISSION** (`GM-22 GM-22-18`) — GM22-18 · NEW — How do Expo push notifications work, and what happens when permission is denied? 🔴 decision — TRACED
243. **EMAIL-SENDER** (`GM-22 GM-22-19`) — GM22-19 · NEW — Who sends the emails, and what happens when one fails? 🟠 decision/code — TRACED
244. **E01B-NOTIF-FLAGS** (`GM-22 GM-22-20`) — GM22-20 · NEW — What notification preferences can a worker (and a pharmacy) set — including quiet hours? 🟡 decision — TRACED
245. **EVENT-CATALOGUE** (`GM-22 GM-22-21`) — GM22-21 · NEW — Master event catalogue: which event notifies whom, on which channel? 🔴 decision — TRACED (draft table now filled)
246. **PILLS-NOTIFY** (`GM-22 GM-22-22`) — GM22-22 · NEW — What Pills / rewards notifications exist (earn, spend, expiry, low balance)? 🟡 decision — TRACED
247. **PAYMENT-NOTIFY** (`GM-22 GM-22-23`) — GM22-23 · NEW — Which payment / invoice / refund events notify whom? 🟠 decision — TRACED
248. **RATING-NOTIFY** (`GM-22 GM-22-24`) — GM22-24 · NEW — Is either side told when a rating is left, or when a reliability badge / incident is applied? 🟡 decision — TRACED (ratings) / NOT RE-VALIDATED (incidents)
249. **AHPRA-NOTIFY** (`GM-22 GM-22-25`) — GM22-25 · NEW — Are verification / AHPRA status changes notified (granted, lapsed, suspended, revoked)? 🟠 decision — TRACED (suspension) / NOT RE-VALIDATED (grant/lapse)
250. **NOTIF-DEDUP** (`GM-22 GM-22-26`) — GM22-26 · NEW — How are duplicate, failed and stale notifications handled — and is there an audit log? 🟠 code/decision — TRACED

### Calendars & operations

251. **MULTIDATE-SAME-WORKER** (`GM-23 GM-23-13`) — GM-23-13 — PO-Q05. For multi-date posts, how is "same worker for every date" set? (re-verified this trace, first half)
252. **RECURRING-HORIZON** (`GM-23 GM-23-14`) — GM-23-14 — PO-Q06. How far ahead can recurring shifts run? (re-verified this trace — CHANGED)
253. **REPEAT-PAST-SHIFT** (`GM-23 GM-23-15`) — GM-23-15 — PO-Q07. How should owners repeat a past shift? (re-verified as far as traced)
254. **CALENDAR-VIEWS** (`GM-23 GM-23-18`) — GM-23-18 — NEW. Team calendar views: day / week / month — what does each role see? (verified this trace)
255. **OPS-RULES** (`GM-23 GM-23-19`) — GM-23-19 — NEW. Operations tasks / rules engine: what rules run, when, and who acts on them? (verified this trace — the engine is gone)
256. **LEAVE-ON-CALENDAR** (`GM-23 GM-23-20`) — GM-23-20 — NEW. Leave on the calendar: how do leave / roster / cover requests appear? (verified this trace)
257. **SHIFT-DISPLAY** (`GM-23 GM-23-21`) — GM-23-21 — NEW. Shift display on the calendar: what state does each entry show? (verified this trace)
258. **OPS-DASHBOARD** (`GM-23 GM-23-22`) — GM-23-22 — NEW. Operations dashboard: what does it show, to whom, and how fresh is it? (verified this trace — NOT BUILT)
259. **TIMEZONE** (`GM-23 GM-23-23`) — GM-23-23 — NEW. Clock / timezone: whose time is a shift time? (verified this trace — ALTERNATE FIRST QUESTION)
260. **CALENDAR-PERMS** (`GM-23 GM-23-24`) — GM-23-24 — NEW. Calendar permissions: who can create / edit / delete calendar entries, per role and per pharmacy? (verified server-side this trace)
261. **EXTERNAL-CALENDAR** (`GM-23 GM-23-25`) — GM-23-25 — NEW. External calendar: export / sync to Google / Outlook / Apple, or ICS download? (verified this trace — NOT BUILT)
262. **CALENDAR-NOTIFY** (`GM-23 GM-23-26`) — GM-23-26 — NEW. Calendar notifications: which calendar events notify, on which channel, and can the worker turn them off? (verified this trace)
263. **ROSTER-PUBLISHING** (`GM-23 GM-23-27`) — GM-23-27 — NEW. Roster publishing: what does publishing a roster do to calendars, and can it be undone? (verified this trace)
264. **NEEDS-COVER-CALENDAR** (`GM-23 GM-23-28`) — GM-23-28 — NEW. "Needs cover" on the calendar: who sees it, and how is it filled without double-booking? (verified this trace)
265. **CALENDAR-AUDIT** (`GM-23 GM-23-29`) — GM-23-29 — NEW. Calendar history / audit: can the owner see who changed what, when? (verified this trace — split)

### Explorer & public

266. **EXPLORER-ROLES-VISIBLE** (`GM-24 GM-24-Q21`) — GM-24-Q21 — NEW: Should anonymous visitors see every role on the public job board?
267. **EXPLORER-COMMUNITY** (`GM-24 GM-24-Q22`) — GM-24-Q22 — NEW: The Explorer Community tab is always empty — hide it or open community to Explorers?
268. **SHARE-LINKS** (`GM-24 GM-24-Q23`) — GM-24-Q23 — NEW: Share-link sitemap URLs are dead, and share tokens never expire?
269. **EXPLORER-DEADEND** (`GM-24 GM-24-Q27`) — GM-24-Q27 — NEW: Explorer interest that can never become a booking — fail fast?
270. **ROLE-FILTER** (`GM-24 GM-24-Q28`) — GM-24-Q28 — NEW: Public-board role filter has no Explorer option — add it?
271. **DAILY-LIMIT** (`GM-24 GM-24-Q29`) — GM-24-Q29 — NEW: Daily public-shift limit is 10 per pharmacy per day — keep?
272. **VIEW-COUNTS** (`GM-24 GM-24-Q30`) — GM-24-Q30 — NEW: Talent view counts — every authenticated view counts, no cap — keep?
273. **TALENT-STALENESS** (`GM-24 GM-24-Q31`) — GM-24-Q31 — NEW: Talent-post staleness — undated and full-time posts stay visible forever?

### Web / Next / Expo parity

274. **VITE-NEXT** (`GM-25 GM-25-Q02`) — GM25-Q02 — Vite vs Next: which routes live where, and is the migration finished, frozen, or rolled back?
275. **DUPLICATED-BOARDS** (`GM-25 GM-25-Q03`) — GM25-Q03 — Duplicated public boards: one implementation or tolerated twins?
276. **SHARED-CORE** (`GM-25 GM-25-Q04`) — GM25-Q04 — Shared-core scope: which flows must go through shared-core, and what happens to direct client API calls?
277. **DEAD-SCREENS** (`GM-25 GM-25-Q05`) — GM25-Q05 — Dead, half-built, and "coming soon" screens: delete, hide, or fix before launch?
278. **NAV-PARITY** (`GM-25 GM-25-Q06`) — GM25-Q06 — Navigation and routing parity: one nav model, or one per client?
279. **AUTH-PARITY** (`GM-25 GM-25-Q07`) — GM25-Q07 — Auth and session parity: same rules on all three surfaces?
280. **LOGGEDOUT-SURFACES** (`GM-25 GM-25-Q08`) — GM25-Q08 — Logged-out public surfaces: what must a visitor be able to do on each surface?
281. **OFFLINE-PROMISE** (`GM-25 GM-25-Q09`) — GM25-Q09 — Offline and poor-network behaviour on Expo: what is the promise?
282. **EXPO-PAYMENT** (`GM-25 GM-25-Q10`) — GM25-Q10 — How does Expo take payment?
283. **NOTIF-PARITY** (`GM-25 GM-25-Q11`) — GM25-Q11 — Notification parity: email vs push — same events, same timing?
284. **KIOSK-EXPO** (`GM-25 GM-25-Q12`) — GM25-Q12 — Kiosk: web-only, or does Expo do kiosk too?
285. **ACCESSIBILITY** (`GM-25 GM-25-Q13`) — GM25-Q13 — Accessibility and text scaling: is 1.6× text a launch gate for both clients?
286. **ERROR-UX** (`GM-25 GM-25-Q14`) — GM25-Q14 — Error, retry, and crash UX: one standard across clients?
287. **COMING-SOON-POLICY** (`GM-25 GM-25-Q15`) — GM25-Q15 — "Coming soon" policy: what may ship labelled coming-soon?
288. **INSTALL-HANDOFF** (`GM-25 GM-25-Q16`) — GM25-Q16 — Web ↔ app install handoff: where does web send phone users, and does the app link back?
289. **SIGNOFF-EVIDENCE** (`GM-25 GM-25-Q17`) — GM25-Q17 — Launch sign-off evidence: what proves each surface ready?
290. **TWIN-DRIFT** (`GM-25 GM-25-Q18`) — GM25-Q18 — Twin-drift prevention after launch: who owns parity?

### Admin, privacy, security, release

291. **OFFPLATFORM-HIRING** (`GM-26 GM-26-Q20`) — GM26-Q20 — [P1 · decision] What is the rule for hiring a worker directly, off the platform? — ⚠ NOT RE-VALIDATED — do not ask until re-validated
292. **ADMIN-IDENTITY** (`GM-26 GM-26-Q37`) — GM26-Q37 — [P0 · decision] Who is a platform admin, how do they get the power, and what can they do that nobody else can?
293. **ADMIN-AUDIT** (`GM-26 GM-26-Q38`) — GM26-Q38 — [P1 · decision] What is the audit trail for admin actions, and who can read it?
294. **DATA-SHARING-MAP** (`GM-26 GM-26-Q39`) — GM26-Q39 — [P1 · decision] What personal data is shown to whom — the full data-sharing map?
295. **ACCOUNT-DELETION** (`GM-26 GM-26-Q40`) — GM26-Q40 — [P1 · decision] Account deletion: what is deleted, what is kept (and why), and how long does it take?
296. **PRIVACY-POLICY** (`GM-26 GM-26-Q41`) — GM26-Q41 — [P1 · decision] Privacy policy / terms: are they APP-compliant, versioned, and shown on Expo as well as web?
297. **PROD-CONFIG** (`GM-26 GM-26-Q42`) — GM26-Q42 — [P0 · security, decision + code gap] Secrets, DEBUG and ALLOWED_HOSTS: what is the production configuration, and who can see it?
298. **DEPLOY-PATH** (`GM-26 GM-26-Q46`) — GM26-Q46 — [P1 · release, decision] Staging, migration rehearsal and rollback: what is the deploy path to production?

### Sessions & auth

299. **SESSION-DURATION** (`GM-01 GM-01-Q01`) — GM01-Q01 — How long should a sign-in last, and should "Keep me signed in" exist on mobile too?
300. **UNVERIFIED-EMAIL** (`GM-01 GM-01-Q03`) — GM01-Q03 — Should an unverified email block sign-in entirely, or let the worker in to finish verifying?
301. **TWO-FACTOR** (`GM-01 GM-01-Q05`) — GM01-Q05 — Should sign-in get a second factor (authenticator app), or is email code + mobile check enough?
302. **DEVICES** (`GM-01 GM-01-Q06`) — GM01-Q06 — How many devices can stay signed in, and should there be a "sign out everywhere" button?
303. **SESSION-EXPIRY-UX** (`GM-01 GM-01-Q08`) — GM01-Q08 — When a session expires mid-use, what should the worker see?
304. **RETURN-TOPAGE** (`GM-01 GM-01-Q09`) — GM01-Q09 — After sign-in, should the worker return to the page that sent them there? (Web parity)
305. **BIOMETRICS** (`GM-01 GM-01-Q11`) — GM01-Q11 — Biometrics on the phone: keep it, and should the web get passkeys? (Expo-only feature)
306. **OFFLINE-SIGNOUT** (`GM-01 GM-01-Q12`) — GM01-Q12 — If sign-out fails (offline), should the app sign you out anyway or stay signed in?
307. **PASSWORD-RESET** (`GM-01 GM-01-Q13`) — GM01-Q13 — Password reset signs every device out — keep that, and should the reset link expire?
308. **LOCKOUT-CAPTCHA** (`GM-01 GM-01-Q14`) — GM01-Q14 — Login defences: keep 5-fails / 1-hour lockout, and should sign-in get a CAPTCHA?
309. **DENIED-PAGE-UX** (`GM-01 GM-01-Q15`) — GM01-Q15 — When a worker opens a page they are not allowed to see, should the app say so or silently send them home?
310. **MOBILE-NUMBERS** (`GM-01 GM-01-Q18`) — GM01-Q18 — Mobile numbers: Australian only, locked forever once verified — keep that?
311. **CODE-PARAMS** (`GM-01 GM-01-Q19`) — GM01-Q19 — Email/mobile codes: keep 6 digits / 10 minutes / 5 tries, and is the test-mode code display safely off in production?

<!-- canonical list count: 311 (expect 311) -->

## 11. What changed vs the queue

- Queue: 540 as written → 524 after 16 merges, presented as "unique". This de-dup: **540 → 311 genuine**, with the other 229 accounted for as 196 duplicates (16 already merged + 180 new), 9 approved, 20 gaps, 4 verification items.
- Largest corrections to the queue's picture: GM-26 is not 48 questions — it contributes 10 genuine decisions (33 of its entries restate other areas); GM-24 contributes 8 genuine (22 restate); GM-15 contributes 36 genuine (its 49 are nearly all home-grown, but 11 are refund/offer/payment restatements); GM-19 contributes all 13 (zero duplicates at home, but 9 of them are re-asked in GM-23 and 3 in GM-22/GM-24/GM-26).
- GM-18 still cannot be fully verified: 8 of its 11 genuine canonicals carry unrecovered titles.
- No previously approved decision was re-opened. R04A/R04C/R06/E01A/D02/D03/E01/E01B/D01/R04B-direction stay APPROVED + IMPLEMENTATION_GAP where the code disagrees.
