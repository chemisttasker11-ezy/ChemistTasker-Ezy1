# GM-22 Notifications / Rewards — SENIOR REVIEW

**Senior verdict: ACCEPT AS BLOCKED — correct handling of the 429, re-run required. Not a pass on substance (no file at the PR head was read), and the worker does not claim otherwise.**
**Reviewed:** 2026-11-21. Worker report file: [GM-22-notifications-rewards-trace.md](sandbox://workspace/goals/chemisttasker-grill-me/files/GM-22-notifications-rewards-trace.md) (570 lines)
**Method:** I read the full worker report, and cross-checked its verifiable claims (SHAs, PR bodies) against the known-good values and the already senior-reviewed GM-18/GM-15/GM-17 findings.

## What I verified / cross-checked

1. **SHAs match the known-good values** reported independently by other workers: PR #249 head `97c4543e…`, PR #248 head `25939534…`, PR #184 head `c786a4b8`, `questions.json` blob SHA `9b700e31…`, AUDIT.md blob SHA `41f77580…`. Consistent across GM-02/GM-05/GM-13/GM-15/GM-17/GM-18/GM-20/GM-23/GM-25/GM-26.
2. **429 handling — CORRECT.** The worker stopped all GitHub calls immediately after three consecutive 429s on `search_code`, attempted no retries, and marked all 28 questions NOT RE-VALIDATED / NOT TRACED. No Oct 2026 evidence is presented as current anywhere in the file.
3. **Honest method notes:** the worker discloses its own first `search_code` failure (wrong parameter name `q` instead of `query`) — harmless, disclosed; and it explicitly refuses to cite sibling agents' `/tmp/gm*/` downloads as evidence (provenance unverified) — good discipline, and the right call.
4. **The 26cae2d6 vs 97c4543e PR #249 head discrepancy** is flagged, matching my own independent confirmation from the PR #249 body.

## What the worker got right

- **Full provisional queue in #184 format:** 28 questions (16 carried: PO-Q08, BK-Q06, AG-Q09–Q12, CX-Q06, AV-Q08/Q09, LA-Q17, PO-Q10, LA-Q08, PO-Q09, PO-Q12, AG-Q03, LA-P02; 12 new: GM22-17–28 covering notification centre, Expo push end-to-end, email provider/retry, preferences/quiet hours, master event catalogue, Pills notices, payment/invoice/refund notices, rating/incident notices, verification-change notices, dedup/audit, wrong-tenant leakage, GM-20 chat boundary). Each with ACTUAL TODAY (Oct 2026 or UNKNOWN), recommendation, Keep/Alt B/C, Other/defer, and normal/edge/retry/denied-role/payment/Web-Expo scenarios.
- **Event catalogue (§1c) is the most useful artefact in the report** — a per-event who-is-notified table with the "nobody"/"unknown" rows made explicit (escalation: nobody; offer expiry: nobody; late change: nobody; AHPRA cancellation: bypasses notices). That table is the draft for the GM22-21 master catalogue.
- **First-question choice is sound:** GM22-04 (AG-Q10 — which channels carry those notices; recommended A: in-app + push, email for money/cancel) gates every other GM-22 decision. Ask second: GM22-01 + GM22-10 (escalation notices + match-email fix).
- **Backlog kept separate (B1–B23, PROPOSED ONLY)** with positive/negative acceptance criteria per item, plus a 10-scenario acceptance bank. Decision status correctly at none-decided for all 28.

## Corrections / notes — none to the report's substance

No corrections required. Three notes for the re-run (not worker errors) — adopt already-verified verdicts instead of re-tracing the overlap:

1. **SH-03 subscriber discount (F17 / GM22 code gaps):** GM-16/GM-18 already verified at this head that the subscriber discount is **now applied** ($30/$15, $80/$40); Stripe price ids are still hard-coded. The Oct 2026 "computed but never used — subscribers overcharged" claim must NOT be carried as current on re-run.
2. **AV-Q09 / LA-Q17 (GM22-09, GM22-10):** GM-18 verified **CHANGED (partial)** — distance/travel matching is now enforced for match emails and dashboard recs; minimum-rate filter still missing; recipients still not Verified-filtered; escalated shifts still don't trigger match emails.
3. **Escalation/reminders overlap:** GM22-01/11/12/13 (escalation notices + scheduled job) and GM22-05/06 (reminders) overlap GM-11/GM-23's ground — GM-23's re-run will cover the reminder/escalation mechanics; GM-22's re-run should own only the notice/channel/recipient decisions and cross-reference the mechanics.

## GM-22 deliverable (provisional — BLOCKED, not senior-approved as traced)

- **Traced flow:** Oct 2026-only matrix F1–F19 + channel inventory + event catalogue (§1), all NOT RE-VALIDATED. Unknowns honestly listed: notification centre, Expo push wiring, email provider/queue/retry, preferences/quiet hours, Pills notices, payment notices, rating notices, dedup/audit, wrong-tenant leakage, GM-20 boundary.
- **Question queue:** 28 questions, GM22-01 to Q28 (16 carried, 12 new), all NOT RE-VALIDATED / NOT TRACED.
- **First question to ask the owner (once re-validated):** **GM22-04 — Which channels carry those notices?** Options: KEEP (each feature chooses its own) · **A (recommended — in-app + push; email for money/cancel)** · B (email everything) · C (in-app only) · Other / Defer. Ask second: GM22-01 + GM22-10.
- **Code gaps (Oct 2026, NOT RE-VALIDATED):** SH-05 (no scheduled escalation job); AV-04/LA-Q17 (match-email gaps); SH-07 (silent 48h offer expiry); D12 (reminder state); PO-Q12 (reminder email names anonymous pharmacy); LA-P01/P02 (AHPRA cancel path bypasses policy/notices); SH-03 (see note 1 — partially fixed); AV-03 (different match rules); TB-01 (talent API leak); no dedup/retry/audit or push-token/centre code traced.
- **Decision gaps:** D07 (recipient/channel per event), D06 (offer decline/expiry fallback), D12 (reminder scope/timing), R04D detail (emergency-cancel recipients/timing), SH-06 (notify on escalation + stop rule), urgent/rate filters, Pills/payment/rating/verification notices, preferences/quiet hours, GM-20 boundary.
- **Required next step:** re-run after the GitHub rate limit clears — refresh the PR #249 head SHA first, read `backend/shifts/announcements.py`, `escalation.py`, `base.py`, `offers.py`, `interest.py`, `core/celery.py` + email settings, notifications/push-token models, Vite/Next notification UI, Expo push setup — then flip each question to validated/changed/no-longer-valid. Do NOT ask the owner GM-22 questions from this report as if verified.
