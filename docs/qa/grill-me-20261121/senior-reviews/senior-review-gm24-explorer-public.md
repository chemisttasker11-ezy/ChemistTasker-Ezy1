# GM-24 Explorer / Public — SENIOR REVIEW

**Senior verdict: PASS** (no corrections to substance; two minor notes below).
**Reviewed:** 2026-11-21. Worker report file: [gm-24-explorer-public.md](sandbox://workspace/grill-me/gm-24-explorer-public.md)
**Method:** I read the full worker report (all ~594 lines) and independently re-fetched the cited files at PR #249 head `97c4543e…` via GitHub read-only tools, checking the key claims line by line. No 429 was hit in my checks either.

## What I verified myself (all confirmed)

1. **Explorer accept dead end (Q01/Q27) — CONFIRMED.** `backend/shifts/engagement.py:25` `worker_onboarding` special-cases only PHARMACIST and looks everyone else up in `OtherStaffOnboarding` — an Explorer returns `None`. `_external_payment_profile` then raises "Complete worker onboarding before accepting this external shift." Interest can succeed and an offer can be made, but accept fails late. This is the sharpest single finding in GM-24 and it is exactly as reported.
2. **`engagement.py` contains zero occurrences of "cancel"** — confirmed by my own count. This independently corroborates GM-18's SH-09 finding (no cancellation disclosure in frozen terms).
3. **`/public-shifts/` requires login; `/public-job-board/` is public — CONFIRMED.** `backend/shifts/base.py:116` `BaseShiftViewSet.permission_classes = [IsAuthenticated]`; the two-endpoint split with one collapsed error message matches the 2026-11-19 site-flakiness note.
4. **Lazy escalation — CONFIRMED.** `auto_escalate_due_shifts` is called from `BaseShiftViewSet.get_queryset` (`base.py:177`) — no scheduled job in that path.
5. **Daily public-shift cap — CONFIRMED.** `backend/shifts/limits.py`: `MAX_PUBLIC_SHIFTS_PER_DAY = 10`, enforced at posting and on escalation to PLATFORM.
6. **Anonymous pharmacy redaction — CONFIRMED exactly.** `backend/organizations/serializers.py::anonymize_pharmacy_detail` keeps id, name → "Anonymous Pharmacy", suburb, state, postcode, script volumes; removes street/email/owner/ABN/documents. The worker's Q08/Q25 recommendation (drop postcode + script volume) follows directly from this verified list.
7. **Dead sitemap shift links — CONFIRMED.** `backend/core/sitemap.py:36` emits `/shifts/link?id={shift.id}`; the file contains zero occurrences of "token", while the share page requires `?token=`. The links cannot load a shift as written.

## Cross-checks against other senior-reviewed areas (convergent — good)

- TB-01/LA-Q12 identity leak STILL VALID, LA-Q13 CHANGED (partial — hidden/expired now blocked, lapsed-credential re-check still missing), TB-07 drift persisting in a new shape, ratings eligibility changed to past-date assignment, SH-09 zero "cancel" — all agree with my GM-18 senior review, reached independently by a different worker. Convergence on the same head strengthens both.
- ON-06 (pharmacy `verified` unchecked at posting) STILL VALID — agrees with GM-03.
- The worker correctly marks ON-Q07/ON-P02, TB-05, TB-09, AV-01, AV-06 as NOT RE-VALIDATED here and assigns them to their owning areas (GM-01/GM-18/GM-19/GM-25) instead of guessing.

## Minor notes (not corrections)

1. **Cross-area disagreement to resolve once, at the parent level:** GM-24-Q14 (TB-06/TB-Q07) recommends **B — enquiry/chat first, then an offer**, while GM-18-Q07 recommends **KEEP — firm offer** (fixing the surrounding defects separately). Both are defensible; the owner must answer the firm-vs-enquiry question once, not twice, and the two areas' queues must be reconciled to that single answer before the PR is assembled.
2. **"No test asserts anonymous-shift redaction" / "no test asserts authenticated-feed redaction"** — the worker flags these as searched-but-not-exhaustive. Honest; the re-run/PR assembly should run a targeted test search to close them rather than asserting them as proven absences.

## GM-24 deliverable (senior-approved)

- **Traced flow:** §1 (Explorer role/verification, anonymous surfaces, signed-in Explorer, upgrade path, public talent board, anonymous redaction, escalation/match, public site/SEO, denials) + 18-row current-flow matrix F-01–F-18.
- **Question queue:** 32 questions, GM-24-Q01 to Q32 (20 carried re-validated + 12 new), all CURRENT FLOW TRACED, none owner-decided.
- **First question to ask the owner:** **GM-24-Q01 — What can Explorers ("new to pharmacy") do with shifts?** Options: A (keep — interest allowed, accept blocked) · B (accept EXPLORER-role shifts as unpaid placements; needs Fair Work review) · **C (recommended — paid shifts only after upgrading; fix the dead end at the same time)** · D (no shifts at all for Explorers) · Other / Defer.
- **Code gaps (14, CG-01–CG-14):** authenticated talent feed leak; public-feed flag-off identity exposure; dead sitemap URLs; share tokens never expire; canRequestBooking drift; uncapped `add_view`; client-side-only talent filtering; role filter omits Explorer; match emails to unverified + escalation notifies nobody; permanently empty Explorer Community tab; no redaction tests; silent 10/day limit; no visibility re-check on Verified/AHPRA lapse (×2).
- **Decision gaps (10, DG-01–DG-10):** Explorer shift rights (Q01); verification enforcement scope (Q03); pharmacy gate before public posting (Q07); anonymous reveal point (Q09); talent-board audience/reveal (Q11/Q12); firm offer vs enquiry (Q14 — see note 1); rating eligibility + internal ratings (Q17/Q18); talent staleness (Q31); Vite vs Next canonical (Q24); postcode/script-volume in anonymous detail (Q08/Q25).
- **Unknowns honestly flagged:** scheduled escalation beat task; anonymous-redaction test coverage; whether Expo has a public talent board at all; `public_hub` editorial pages line-by-line; live behaviour (nothing run).
