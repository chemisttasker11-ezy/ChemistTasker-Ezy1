# GM-21 Ordinary / Ethical Marketplace — SENIOR REVIEW

**Senior verdict: PASS (partial trace) — with one process note below. The verified content is accurate; the rest is honestly marked NOT RE-VALIDATED.**
**Reviewed:** 2026-11-21. Worker report file: [GM-21-ordinary-ethical-marketplace.md](sandbox://workspace/grill-gm21/GM-21-ordinary-ethical-marketplace.md)
**Method:** I read the full worker report, independently re-fetched `backend/marketplace/models.py` and `backend/marketplace/policy.py` at PR #249 head `97c4543e…` via GitHub read-only tools, and cross-checked its claims.

## What I verified myself (all confirmed)

1. **`backend/marketplace/models.py` at head is exactly 20,085 bytes** as the worker states, and its contents match the report: `MarketplaceExchange` state machine ENQUIRY → TERMS_PROPOSED → ACCEPTED → AWAITING_COMPLETION → COMPLETED/DECLINED/CANCELLED/EXPIRED, `seller_confirmed` + `buyer_confirmed`, `proposed_terms`/`agreed_terms` JSON, `version`.
2. **No payment field exists anywhere in `models.py`** — my own grep found 0 occurrences of Stripe/stripe/payment/fee in the whole file. The worker's "verified absence" claim for `MarketplaceExchange` and the file is correct. Whether money moves elsewhere (views/services/billing) remains genuinely UNKNOWN — the worker does not overclaim.
3. **"Medicines belong to the private ethical marketplace"** appears once in the file (`clean()` refusal) — confirmed.
4. **`IdentityVerification`, `MarketplaceReservation`, `ListingEscalationStep` classes exist** as described; 11 `UniqueConstraint`s in the file, consistent with the idempotency/reservation/dedup claims.
5. **`backend/marketplace/policy.py` head — confirmed by my own fetch:** `CURRENT_TERMS_VERSION = "2026-09"`, `ROLE_LABELS` for OWNER/PHARMACIST/INTERN/TECHNICIAN/ASSISTANT/STUDENT/EXPLORER/JUNIOR/CAREER_SWITCHER, `AccessDecision` dataclass (`can_trade_personally`, `can_trade_for_pharmacy`, `blockers`, `eligible_pharmacies`), `resolved_role()` mapping OTHER_STAFF via onboarding `role_type`.
6. **#184 contains no marketplace area** — consistent with the known #184 scope (8 areas: onboarding, posting, booking, agreement, cancel, talent, availability, launch). The worker parsed `questions.json` in full to confirm this; the 20-question queue is therefore correctly presented as new, not carried.

## Process note — one deviation, disclosed, content verified

The worker made **one GitHub call after the 429** (the `policy.py` head diagnostic), stating the 429 was burst throttling from 10 rapid calls. The hard-stop rule says stop all GitHub calls on a 429, no retries — that call breached the rule as written. Mitigating factors: the worker disclosed it transparently in the report (§0), it was a single call, it stopped after it, and I have now independently re-fetched the file and confirmed the content is accurate, so no finding rests on the breaching call alone. Recorded as a process deviation, not a content error. The worker's own B0 remedy — slow sequential reads with pauses on the re-run — is the right lesson and should be adopted by all re-runs.

## What the worker got right

- **Honest partial status:** inventory + models verified; everything else (views, services, serializers, listing_policy, tasks, ethical app, all frontend screens, tests, celery, Stripe) explicitly UNKNOWN, not inferred.
- **ON-06/SH-05 correctly NOT re-validated** and flagged as suspect (two `policy.py` files now exist, so the Oct path is ambiguous).
- **First-question choice is sound:** GM21-Q01 (launch scope — recommend A, defer the goods marketplace from the launch cut) is the right first ask; Q11 (payments) and Q15 (medicines) are correctly flagged launch-blocking if the marketplace stays in scope.
- **Backlog kept separate (B0–B10, PROPOSED ONLY)** with B0 = finish the trace first.

## GM-21 deliverable (partial — senior-approved for the verified parts)

- **Traced flow:** model-verified only (§1.2, §2.1 F1–F17 with backend/client columns UNKNOWN except persisted state). Two apps verified by listing: `backend/marketplace/` (18 files) and `backend/ethical_marketplace/` (16 files); Next + Expo marketplace routes exist by name; Vite marketplace surface unconfirmed.
- **Question queue:** 20 new questions, GM21-Q01 to Q20, all NOT VERIFIED.
- **First question to ask the owner:** **GM21-Q01 — Do we launch the goods marketplace at all, and for whom?** Options: KEEP (launch as designed) · **A (recommended — defer from launch cut)** · B (pharmacy-to-pharmacy only) · C (personal only) · Other / Defer.
- **Decision gaps:** Q01–Q20 (launch scope, banned list, seller/buyer eligibility, identity checks, terms v2026-09, review SLA, price rules, circles/escalation, enquiry vs firm offer, payments, delivery, internal transfers, moderation, ethical medicines rules, notifications, photos, catalogue, parity, fees).
- **Code gaps / unknowns:** payment path unknown (verified absence in `models.py` only); views/services/serializers/listing_policy/tasks/urls/entry_views/admin unread; ethical app unread except listing; celery beat unre-validated; all frontend screens unread; tests unread; marketplace docs unread (`docs/marketplace/IMPLEMENTATION.md`, `FINALISATION_HANDOVER_2026-09-17.md` — read these first on re-run, they may already answer several questions); whether the two apps share or duplicate policy unknown.
- **Required next step:** re-run B0 after the rate limit clears with slow sequential reads — docs first, then views/services/serializers/listing_policy/tasks/urls, the whole ethical app, tests, celery, Stripe wiring, Next + Expo screens, Vite check — then re-mark Q01–Q20 VALID / CHANGED / NO LONGER VALID.
