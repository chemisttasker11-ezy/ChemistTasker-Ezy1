# GM-26 Admin / Privacy / Security / Release — SENIOR REVIEW

**Senior verdict: ACCEPT AS BLOCKED — correct handling of the 429, re-run required. Not a pass on substance (nothing was re-validated), and the worker does not claim otherwise.**
**Reviewed:** 2026-11-21. Worker report file: [GM-26-admin-privacy-security-release.md](sandbox://workspace/grill-me/GM-26-admin-privacy-security-release.md)
**Method:** I read the full worker report (all 637 lines), independently re-checked PR #200's body via GitHub read-only tools, and cross-checked its verifiable claims against the already senior-reviewed GM-18 findings and the whole-project review.

## What I verified myself

1. **PR #200 PRODUCTION NO-GO + B62–B65/B66–B71 — CONFIRMED.** The PR #200 body (fetched fresh by me) states DRAFT / AUDIT-ONLY / NOT RELEASE-READY on frozen main `b77e9fd2…`, and links `MAIN_RELEASE_DISCOVERY_WAVE_13.md` as adding "B62–B65, with cross-tenant role/capability mismatch for communication-only Region Admin shift actions, conditional native pairing…" plus the B66–B71 wave-14 payment/booking evidence. The body also contains the "139 new candidates (3 P0, 95 P1, 41 P2), all unconfirmed" figure the worker cites. The individual B63/B64 numbers live in the WAVE_13 doc rather than spelled out in the body — the worker's grouping is faithful, and its Q44/Q45 correctly label them "audit candidates, NOT runtime-reproduced".
2. **PR #249 head `97c4543e…` and PR #248 head `25939534…` — CONFIRMED** (match my own earlier checks and GM-23's report).
3. **questions.json 142 questions + 30 carried decisions — CONFIRMED** (matches every other worker's independent fetch).
4. **429 handling — CORRECT.** The worker stopped all GitHub calls after 8 consecutive 429s, attempted no retries, and marked all 48 questions NOT RE-VALIDATED / UNKNOWN. No Oct 2026 text is presented as current anywhere; §0 states the consequence plainly and §6 lists exactly what the re-run must do.

## What the worker got right (process quality)

- **Scope discipline on new questions:** GM26-Q36–Q48 are framed as first traced here, all UNKNOWN until inspected, with recommendations clearly proposed rather than presented as findings. Q42 (secrets/DEBUG/ALLOWED_HOSTS) honestly records that the searches were blocked — it does not guess at production settings.
- **The skeleton is labelled as a skeleton:** §1B's flow matrix uses an explicit status key (P = path-level only, O = Oct 2026 only, U = unknown, A = published audit evidence) and never lets a path existence imply behaviour.
- **Carried decisions recorded, not re-asked:** P04/P10/P05/P06/NOPEN/E01 are carried as #184 stated them, with the NOT re-validated flag.
- **First-question choice is sound:** GM26-Q36 (launch cut) is the right first ask — every other GM-26 question is a fix-before/after-launch timing call, and those timings are meaningless until "launch" is defined. The options (A no launch until NO-GO cleared, B browse-only, C bookings with manual charges/sanctions, D full launch with recorded risk acceptance) are realistic and cover the actual decision space.
- **Backlog kept separate (18 items, PROPOSED ONLY)** and gated on the owner answering Q36 first.

## Corrections / notes — none to the report's substance

No corrections required. Three notes for the re-run (not worker errors):

1. **Reuse verified verdicts from other areas — do not re-trace the overlap.** Several GM-26 questions were already re-validated at this same head by senior-reviewed areas, and the re-run must adopt those verdicts instead of carrying the Oct 2026 text:
   - Q01–Q04 (identity leak): GM-18 verified **STILL VALID** — authenticated serializers leak names + user ids; only the public feed redacts.
   - Q05 (hidden/stale/lapsed posts): GM-18 verified **CHANGED (partial)** — hidden/expired reads are now blocked on list/retrieve/feed/like/view (tested); the lapsed-credential re-check is still missing.
   - Q27 (ratings): GM-18 verified **CHANGED (partial)** — eligibility now requires a past-dated assignment; internal-roster ratings still feed the public talent-board average.
   - Q29 (booking-permission drift): GM-18 verified drift **persists in a new shape** (web 9-role allow-list vs Expo any-non-worker role).
   - Q30 (full download): GM-18 verified **STILL VALID**.
   - Q34 (subscriber discount): GM-18/GM-16 verified **CHANGED (partial)** — the subscriber discount is **now applied** ($30/$15, $80/$40); Stripe price ids are still hard-coded. The Oct 2026 "computed but never applied" claim must NOT be carried as current on re-run.
   - Q35 (AHPRA refresh): GM-18 verified **CHANGED (partial)** — the new `verification/state.py` state machine exists; default source is still `scrapingbee`; no synchronous fresh lookup before booking.
   - Q21/Q28 (refunds/history): GM-17 verified the two-money-systems picture (no credit notes, no refunds in-app, no void action) — adopt, don't re-trace.
   - The re-run should therefore spend its effort on the genuinely new GM-26 ground: Q36–Q46 (launch cut, admin role/powers, audit trail, data-sharing map, deletion scope, policy versioning, secrets/DEBUG, pentest, B62–B65 adjudication, staging/migration/rollback).
2. **`platform_admin` 0-hit claim is search-index-level only.** `search_code` is a global GitHub search, not repo-scoped (confirmed in my own GM-18 checks); a 0-hit result is suggestive, not proof. Confirm at the PR #249 head on re-run by reading the permission/access files directly.
3. **AUDIT.md was truncated this session** (worker says so honestly) — re-fetch in full at `refs/pull/184/head` on re-run for the TB-01–TB-07 / ON-12 / SH-09/15/16 line-level citations.

## GM-26 deliverable (provisional — BLOCKED, not senior-approved as traced)

- **Traced flow:** skeleton + path inventory only (§1A/§1B, 14 rows F-01–F-14, statuses P/O/U/A). Unknowns honestly listed: admin powers, audit trail, deletion scope, policy content/versioning, secrets/DEBUG/ALLOWED_HOSTS, pentest, B62–B65 adjudication, staging/migration/rollback.
- **Question queue:** 48 questions, GM26-Q01 to Q48 (35 old from #184, 13 new Q36–Q48), all NOT RE-VALIDATED / UNKNOWN.
- **First question to ask the owner (once re-validated):** **GM26-Q36 — What is the launch cut for GM-26: which release blockers must close before the first real user?** Options: A (recommended — no launch until the NO-GO is cleared) · B (browse-only early access) · C (bookings live, charges/sanctions manual) · D (full launch once CI green, explicit risk acceptance) · Other / Defer.
- **Code gaps (17, CG-01–CG-17):** talent API leak; visibility bypass; full-feed download; booking-permission drift; no fresh AHPRA lookup; subscriber discount (see note 1 — now partially fixed); no GST treatment; terms snapshot gaps; Expo onboarding data loss/dead-ends; legacy penalty route; B64/B62/B63/B65/B58/B59 candidates; no admin audit trail or in-product console evidenced.
- **Decision gaps (24, DG-01–DG-24):** launch cut, admin role/powers, reveal trigger, APP 11 retention, ID scope, verification gate scope, AHPRA cadence/source, suspension handling, indemnity, pharmacy anonymity, availability opt-in, block list, direct-hire rule, refund approver, dispute/appeal design, suspension process, ratings separation, history retention, legal review, deletion scope, policy versioning, secrets standard, pentest, staging/rollback.
- **Required next step:** re-run after the GitHub rate limit clears — refresh the PR #249 head SHA first, open the §6 files at that ref, mark every question VALID / CHANGED / NO LONGER VALID with file/function/commit citations, fetch AUDIT.md in full, and complete the §1B rows marked U/P/O. Do NOT ask the owner GM-26 questions from this report as if verified.
