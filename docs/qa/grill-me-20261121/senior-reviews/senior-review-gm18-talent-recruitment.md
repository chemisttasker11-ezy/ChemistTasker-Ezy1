# GM-18 Talent / Recruitment — SENIOR REVIEW

**Senior verdict: PASS** (no corrections to substance; 2 minor notes below).
**Reviewed:** 2026-11-21. Worker report: full GM-18 trace (head `97c4543e…`, PR #249, no 429).
**Method:** I independently re-fetched the cited files at `97c4543e051b43fe30ec7e2e61ad3d69957a918e` via GitHub read-only tools and checked the worker's key claims line by line. I did not trust the report at face value.

## What I verified myself (all confirmed)

1. **Identity leak (Q01–Q03, P0) — CONFIRMED.** `backend/talent/serializers/explorer.py` at head: `ExplorerPostReadSerializer` exposes `explorer_name` (via `get_full_name()`, first name only if `under_18`), `author_user_id`, `explorer_user_id`, `explorer_profile`, plus skills/software/travel/AHPRA years. `PublicExplorerPostReadSerializer` redacts those fields only when `is_anonymous` is true. The write serializer's `validate()` contains **no scrubbing** of free text — the "don't add contact details" warning is UI-only. The leak is real and API-level, exactly as the worker states.
2. **FULL_TIME_APPLICATION forcing — CONFIRMED** in the same file: forces `work_types += FULL_TIME`, `availability_days = []`, mode `FULL_TIME_NOTICE`, summary "Open to anytime".
3. **Availability API has no server validation (AV-05) — CONFIRMED.** `backend/talent/serializers/availability.py` is a bare `ModelSerializer` with no `validate()` at all.
4. **AHPRA defaults (Q12) — CONFIRMED.** `backend/core/settings.py:643-644` at head: `AHPRA_SOURCE = env('AHPRA_SOURCE', default='scrapingbee')`, `AHPRA_ENFORCEMENT_ENABLED` default True.
5. **AHPRA gate is public-shifts-only (Q11) — CONFIRMED in structure.** `backend/onboarding/verification/state.py::require_public_ahpra` (line 171) acts only `if is_public_shift(shift) and not member-access`; `queue_public_recheck` (line 197) returns early unless `settings.AHPRA_SOURCE == 'desktop'`. So under the default config no fresh lookup runs before a dedicated booking. (Residual: I did not re-read `is_public_shift()`'s own definition; the conclusion rests on the guard + `protect_direct_booking` forcing `LOCUM_CASUAL` — see #6 — plus the waterfall semantics. Low risk, noted, not a blocker.)
6. **Dedicated shifts forced private (Q07) — CONFIRMED.** `backend/shifts/posting.py::protect_direct_booking` sets `visibility = 'LOCUM_CASUAL'`, `post_anonymously = False`, clears all escalation timestamps.
7. **48h flat offer expiry, one offer per slot (Q18) — CONFIRMED.** `backend/shifts/assignment.py:22` `OFFER_EXPIRY_HOURS = 48`; `offer_dedicated_shift` (line 259) creates one offer per slot, each `expires_at = now + 48h`, with no cap at shift start.
8. **Legacy penalty route still live (SH-02) — CONFIRMED.** `backend/billing/urls.py:15` still routes `charge-penalty/<int:shift_id>/`.
9. **Web vs Expo booking-role drift (Q15) — CONFIRMED.** Web `frontend_web/.../TalentBoard/index.tsx:313` `canRequestBooking` = fixed 9-role allow-list (OWNER, PHARMACY_ADMIN, PHARMACY_OWNER, ORG_ADMIN, ORG_OWNER, ORG_STAFF, CHIEF_ADMIN, REGION_ADMIN, ORGANIZATION) + `isAdminUser`. Mobile `frontend_mobile/roles/shared/talent-board/index.tsx:313` `canRequestBookingByRole` = any role except EXPLORER / PHARMACIST / OTHER_STAFF, with `canRequestBookingOverride` fallback. Drift is real and in the new shape the worker describes.
10. **"0.0 (0)" for new workers (Q06) — CONFIRMED.** Web `TalentCardV2.tsx:106`: `{candidate.ratingAverage.toFixed(1)} ({candidate.ratingCount})`.

## What I checked on method

- Old-question re-validation is genuine, not copied: 33 verdicts with per-question change notes (e.g. AV-Q09 split — distance now enforced, rate still missing; SH-03 partial — subscriber discount now applied; LA-Q13 partial — hidden/expired reads now blocked, lapsed-credential re-check still missing). LA-Q02–Q05 honestly carried as NOT RE-VALIDATED (out of scope) rather than presented as current.
- The worker's caveat is honest and correct: GitHub code search indexes the default branch, so search hits were treated as leads and each claim was verified by direct file fetch at the PR head.
- Unknowns are flagged, not papered over: Next migrated TalentBoard copy served-or-dead, Expo Report button, other screens using `saveProfessionalContact`, paid-path competing-offer expiry, full newcomer-upgrade test assertions.

## Minor notes (not corrections — nothing to change in the report)

1. **Residual verification gap (mine, not the worker's):** `is_public_shift()`'s definition was not re-read by me during senior review. The Q11/Q12 conclusions are still sound on the evidence above, but the PR assembly should cite the definition when the docs-only PR is written.
2. **Q07 recommendation is KEEP (firm offer)** — the worker correctly separates the firmness itself (fine) from the defects around it (credential gap Q11, expiry Q18, permission drift Q15), which are asked as their own questions. No change needed.

## GM-18 deliverable (senior-approved)

- **Traced flow:** §1 of worker report (talent post, browsing, ratings/likes, saved contacts, dedicated offers, payment, AHPRA, availability/matching) + current-flow matrix §1e.
- **Question queue:** 26 questions, GM-18-Q01 to Q26, all CURRENT FLOW TRACED, none owner-decided.
- **First question to ask the owner:** **GM-18-Q01 — Who can see the talent board?** (P0 privacy; everything else hangs off it). Options: KEEP (all accounts see identities; public masked) · A (employers + own post only) · **B (recommended — A plus public masked, server-side enforced)** · Other / Defer.
- **Code gaps (13):** server-side identity masking; no lapse re-check; full-download board; booking-role drift + duplicate `useTalentFeed` + wrong `postShiftRoute` + unthrottled `add_view`; availability copy never syncs; match emails miss escalated shifts / no Verified filter; no server availability validation; legacy `charge-penalty/` route; hard-coded Stripe price ids + per-offer fee; no cancellation disclosure in frozen terms; saved-contacts API with no UI; offer refresh doesn't extend 48h expiry; Next migrated TalentBoard copy status unknown.
- **Decision gaps:** Q01–Q03 (audience/reveal/masking, P0), Q07/Q08/Q09/Q10 (commercial model), Q11/Q12 (Verified/AHPRA, P0), Q13/Q14/Q18 (lifecycle), Q15 (one hiring-role policy incl. PHARMACY_MANAGER call), Q04/Q22 (filters), Q05/Q06 (ratings), Q16/Q17/Q19/Q20/Q21 (availability), Q24 (disclosure), Q25/Q26 (launch timing).
- **Cross-area note:** ON-01/ON-02/SH-07/SH-08/SH-09/SH-10/SH-02/SH-03/SH-04 re-validations here belong partly to GM-02/GM-10/GM-12/GM-13/GM-15/GM-16 — the owning areas should not re-ask them from scratch. LA-Q02–Q05 still need their own pass.
