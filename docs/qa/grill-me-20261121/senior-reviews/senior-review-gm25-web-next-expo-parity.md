# GM-25 Web / Next / Expo Parity & UX — SENIOR REVIEW

**Senior verdict: ACCEPT AS BLOCKED (with a verified structural trace) — correct handling of the 429, re-run required for file-content re-validation. Not a pass on substance for the carried questions, and the worker does not claim otherwise.**
**Reviewed:** 2026-11-21. Worker report file: [GM-25-web-next-expo-parity.md](sandbox://workspace/grill-me/GM-25-web-next-expo-parity.md) (65 KB)
**Method:** I read the worker report's verification header, structural trace (§1) and the handoff summary of the full queue; I independently confirmed the directory-listing method works at PR #249 head `97c4543e…` (fetched `frontend_web/landing_next` listing live — it exists with `app/`, `migrated/`, etc.), and cross-checked the PR #249 body claims against my own earlier read of that body.

## What I verified / cross-checked

1. **Head SHA `97c4543e…` and PR #249 status (open/draft, stacked on #248, 458 commits, 314 files) — CONFIRMED**, matching every other worker's independent check.
2. **PR #249 body 8-commit table — CONFIRMED.** I read the same body during the GM-23 review: `3149fbc2` PersonaShell audit, `96cd52bf` shared-core shift ops, `d15304b0` fail-closed filters, `a7ad728e` W3 Shift Centre, `d36927af` crash recovery, `db5b4e51` auth VM harness, `79d294d` public-shift load-more retry, `26cae2d6` ledger — and the "working head `26cae2d6`" vs API head `97c4543e…` discrepancy the worker flags is real.
3. **Shared-core 445 passed / 1 failed on `a7ad728e`, reverification required — CONFIRMED** as a PR #249 body claim (also cited independently by the GM-26 worker).
4. **429 handling — CORRECT.** After the directory listings, all six `search_code` queries returned 429; the worker stopped all further GitHub calls immediately, attempted no retries, and marked every carried #184 question NOT RE-VALIDATED.
5. **Listing method is sound:** directory listings at the ref-pinned head are real verification (I confirmed the mechanism works live). The three-surface map (Vite `frontend_web/`, Next inside `frontend_web/landing_next/`, Expo `frontend_mobile/`, shared-core, presentation site) is structurally verified at head.

## What the worker got right

- **Honest labelling of evidence tiers:** TRACED (STRUCTURE) for listings/PR-body facts vs NOT RE-VALIDATED for Oct 2026 parity claims vs UNKNOWN for uninspected behaviour. The 314-file list from a parallel fetch is explicitly labelled secondary ("not re-read by this trace") wherever used — good discipline.
- **The structural signal is valuable and verified:** of the 314 files, mobile moved and web mostly did not — any claim that "web and mobile moved together" in this stack is false. That frames the whole parity area correctly.
- **Full queue in #184 format:** 38 questions (20 carried GM25-C01–C20 + 18 new GM25-Q01–Q18), all OPEN, none owner-decided. New questions cover the real GM-25 ground: Vite/Next route split (Q02), duplicated public boards (Q03), shared-core scope (Q04), dead/"coming soon" screens (Q05), nav/routing parity (Q06), auth/session parity (Q07), logged-out surfaces (Q08), offline promise (Q09), Expo payments (Q10), notification parity (Q11), kiosk scope (Q12), 1.6× text scaling (Q13), error/retry/crash UX (Q14), "coming soon" policy (Q15), install handoff (Q16), sign-off evidence (Q17), twin-drift prevention (Q18).
- **First-question choice is sound:** GM25-Q01 (launch cut across Vite/Next/Expo; recommended B — Vite web + Next public first, Expo after Senior Package Testing) is the right first ask; it correctly identifies that Expo has no device build or authenticated backend acceptance and that Stripe Checkout is web, so the Expo payment path (Q10) must be proven first.
- **Q10 correctly flagged as UNKNOWN and launch-gating** (no known current Expo payment path) rather than assumed; Q13 correctly traced to the PR #249 body (native 1.6× sign-off is next work, not done).
- **Backlog kept separate (B1–B21, PROPOSED ONLY)** with B1 = re-trace all NOT RE-VALIDATED items once GitHub recovers.

## Corrections / notes — none to the report's substance

No corrections required. Three notes for the re-run (not worker errors):

1. **314-file composition (222 `frontend_mobile/`, 22 `shared-core/`, 9 `frontend_web/src/`, 7 `landing_next/`) is secondary-source only** — it came from a parallel fetch, labelled as such by the worker. Confirm the counts from the PR #249 file list on re-run before citing them in the PR.
2. **Adopt already-verified verdicts for the overlapping carried questions** instead of re-tracing them from scratch:
   - C12 (LA-Q12/TB-01 identity leak): GM-18 verified **STILL VALID**.
   - C14 (LA-Q15/TB-07 booking-permission drift): GM-18 verified drift **persists in a new shape** (web 9-role allow-list vs Expo any-non-worker role).
   - C15 (LA-Q16/AV-01 availability copy): GM-18 verified **STILL VALID**.
   - C13 (LA-Q14/TB-04 full download): GM-18 verified **STILL VALID** (only Expo public board paginates).
   - C11 (LA-Q11 auto-publish vs R06/R04B): #184's own text is internally disputed (toggle exists on both apps, backend doesn't consult it) — needs a fresh re-trace, not a carry.
   - C08/C09/C10 (LA-Q02/Q03/Q04 mobile onboarding): GM-02 noted ON-Q15 UNVERIFIED and mobile onboarding screens not fully inspected — the re-run must actually open those screens.
3. **C20 (PO-Q08/Q10 escalation notify + timing) and C19 (AG-Q11 reminders)** overlap GM-11/GM-22/GM-23's ground — GM-25's re-run should own only the parity angle (does each client show/trigger the same behaviour) and cross-reference the mechanics owners.

## GM-25 deliverable (provisional — BLOCKED for carried questions; structural trace senior-approved)

- **Traced flow:** structural only — three surfaces mapped at head (Vite SPA + Tauri, Next inside `landing_next/`, Expo SDK 58, shared-core, presentation site), flow matrix F1–F15 with backend behaviour per row Oct 2026 unless marked, Next column mostly "?" (not inspected). No file-content reads at head beyond listings.
- **Question queue:** 38 questions, GM25-C01 to C20 (carried) + GM25-Q01 to Q18 (new), all NOT RE-VALIDATED / UNKNOWN, none owner-decided.
- **First question to ask the owner (once re-validated):** **GM25-Q01 — What is the launch cut across Vite web, Next web, and Expo?** Options: A (launch all three together) · **B (recommended — Vite web + Next public first; Expo after Senior Package Testing)** · C (Expo + Vite first; Next landing only) · D (Vite only) · Other / Defer.
- **Code gaps (Oct 2026, NOT RE-VALIDATED):** CG-1–CG-17 from AUDIT.md (ON-04, ON-05, ON-10, ON-11, SH-02 penalty route, SH-03 subscriber overcharge + hard-coded Stripe IDs, SH-05 lazy escalation, SH-07 offer expiry, SH-09 terms snapshot, SH-11 auto-publish, TB-01 leak, TB-03 hidden/stale, TB-04 full download, TB-07 permission split + duplicate `useTalentFeed`, AV-01 copy-once, AV-04 match-email gaps, AV-05 no validation) — several already re-validated elsewhere, see note 2. New structural gaps: CG-18 (two Expo talent-board routes, dual `app/`+`roles/` trees, `rosterLegacy.tsx` twin, suspected Vite `src/api/` vs shared-core twin); CG-19 (shared-core reverification needed, W3b/d/e/f unfinished, 1.6× sign-off pending).
- **Decision gaps:** DG-1 launch cut (Q01); DG-2 Vite/Next routes (Q02); DG-3 duplicated boards (Q03); DG-4 shared-core scope (Q04); DG-5 dead-screen policy (Q05); DG-6 Expo payments (Q10); DG-7 notification parity (Q11); DG-8 offline promise (Q09); DG-9 1.6× gate (Q13); DG-10 sign-off evidence (Q17); plus carried verification/explorer/posting-gate/talent/availability/escalation/reminder decisions.
- **Required next step:** re-run the file-content re-validation of GM25-C01–C20 once the GitHub rate limit clears (the 429'd `search_code` queries: `PublicJobBoardPage`, `coming soon`, `HubPlaceholder`, `ChooseAccountTypeCard`, `OrganizationCreate`, `useTalentFeed`), confirm the 314-file composition from the PR file list, read `UNIFIED-WEB-EXPERIENCE-PLAN.md`, `PUBLIC-CONTENT-IMPLEMENTATION.md`, `FEATURE-MAPPING.md`, `PUBLIC-MIGRATION-PLAN.md` and the `docs/mobile/` ledger — then ask the owner GM25-Q01 first, one question at a time.
