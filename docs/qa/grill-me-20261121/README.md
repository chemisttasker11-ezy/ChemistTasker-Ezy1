# ChemistTasker Grill Me — Issue #250 (2026-11-21)

**Docs only. No product code, schema, payments, feature toggles, production data, merges or deployments in this PR.** This is the documentation/decision task from Issue #250: one consolidated, owner-led "Grill Me" review to confirm ChemistTasker's actual business logic before launch.

**Start here:** `GRILL_ME_CONSOLIDATED_QUEUE.md` — 524 unique questions (540 as written, 16 merged away), 12 conflict resolutions as single owner questions, and a 26-step dependency-ordered ask order. Per-area traces are in `areas/`; senior-review records are in `senior-reviews/`.

## Bases (exact SHAs)

- `main` traced: `8ccf8f7` (merge PR #247, 3 Nov 2026).
- PR #249 head traced: `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (open draft, stacked on #248). The PR body text naming a "working head `26cae2d6`" is the short SHA of the last listed implementation commit, not the branch head.
- Old sources re-validated, not carried blindly: PR #184 head `c786a4b8182ebf9b505d47cd81980eb3b9851ce3` (142 questions, 35-gap audit), PR #204 head `a7f7b403733e92af4665cacad4e0fe199b5687f5` (26-area map, decision ledger with 30 carried decisions), shift-lifecycle `OWNER_DECISION_REGISTER.md`.

## Method

- 26 areas traced area by area, backend → Vite web → Next web → Expo mobile together in each question, with file/function/test/commit cited per claim; unknown marked unknown.
- Every old #184 question was re-checked against the current code before being asked again: still valid, changed/updated, or no longer valid. Carried decisions proven false by the re-trace are recorded SUPERSEDED, not re-asked.
- Each area was senior-reviewed (independent spot-checks of load-bearing citations at head). A second senior pass re-ran the 12 areas first blocked by a GitHub 429, with slow sequential reads.
- The parent (Musy) did a final review before raising this PR: verified the 540 → 524 de-duplication arithmetic, confirmed the GM-01 senior-review corrections are present in the GM-01 file, and re-read `backend/billing/checkout_reservations.py` at head `97c4543e` (303 lines, SHA `715d1bac…`): it exists, expiry is provider-confirmed via Stripe, and there is **no** `pay_by` / `D02` pay-by window in it (0 hits) — corroborating GM-13's finding that D02 does not exist as a coded rule.

## Honest caveats — read before answering

- **Do not ask until re-validated:** GM-02 ON-Q15 (folded into MOBILE-PARITY-01); GM-05 Q-16/Q-17; GM-22 Q07, Q15, and Q03's cancel half; GM-25 C05, C06, C07, C10, C17, C18; GM-26 Q07, Q12–Q20, Q22–Q26, Q33. GM-26 Q43 (pentest) is UNKNOWN — nothing evidenced.
- **GM-26 open items:** B62/B63/B65 negative tests, B64 fix verification, exact-head CI, live staging check, production env values, Expo privacy parity.
- **GM-18:** the worker trace file was not recovered; the deliverable here is the senior-review file (`areas/GM-18-talent-recruitment-SENIOR-REVIEW-ONLY.md`), whose findings were independently verified at head and which carries the 26 GM-18 questions.
- **GM-08 file name:** the area file is named `GM-08-attendance-kiosk.md` here; its header records that it overwrites the earlier BLOCKED-429 stub of the same content.
- **GM-21/GM-22 caveat:** some `search_code` results reflect the default branch (`main`), not the PR head — flagged wherever a finding rests on search alone.
- **No owner decisions recorded yet** for any question (except GM-02 ON-Q10 SETTLED by code, and GM-05 Q-19 which is a code invariant to confirm only). Recommendations are not decisions. Implementation waits for the owner's answers.

## Ask order (one question at a time)

See `GRILL_ME_CONSOLIDATED_QUEUE.md` §5. First: LAUNCH-01 (what launches, on which surfaces, only after which gates) — then verification gates, audience, payment/refund, rate, operations, and MOBILE-PARITY-01 last after its joint re-inspection pass.

## Files

- `GRILL_ME_CONSOLIDATED_QUEUE.md` — per-area status table (26 areas), 12 conflict resolutions, de-dup accounting, ask order, caveats.
- `areas/GM-01-…` through `areas/GM-26-…` — one trace + question queue per area (GM-18 is the senior-review record, see above).
- `senior-reviews/` — senior-review records per area / per re-run wave.
