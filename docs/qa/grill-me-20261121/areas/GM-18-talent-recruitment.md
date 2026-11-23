# GM-18 — Talent / Recruitment — Grill Me trace (RECONSTRUCTED 2026-11-21)

> **Corrections against current code (21 Nov 2026 review).** 14 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 10 hold, 4 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q04 / Q16 | Full download and client filtering; “backend has no filter parameters” | WRONG — overbroad | General board filtering still follows a full feed download. The API does support own-post selection and a bounded public reference-code lookup, but not server-side distance or rate search. | `pr257:frontend_mobile/roles/shared/talent-board/hooks/useTalentFeed.ts:45`; `pr257:backend/talent/views/explorer.py:70`; `pr257:backend/talent/views/explorer.py:77` |
| Q19 | “serializer has no validate() at all” | STALE; still true on main | PR257 validates time order, weekday values, recurring days and recurrence end dates. Past-date and duplicate-row rejection are not added by that validator. | `main:backend/talent/serializers/availability.py:7`; `pr257:backend/talent/serializers/availability.py:17` |
| Q20 | Legacy penalty creates a “live Stripe checkout” | WRONG if read as unconditional | The route remains callable, but checkout creation depends on environment, provider mode and release flags. Its calculation remains defective as described in B02. | `pr257:backend/billing/shift_payments.py:223`; `pr257:backend/billing/release_guards.py:38`; `pr257:backend/billing/release_guards.py:48` |
| Q26 | Accepted terms have a fingerprint | MAIN-ONLY — holds on PR257 only | PR257 previews and enforces the fingerprint; main does neither. Neither version supplies the cancellation matrix or pharmacy-side legal-policy acceptance in this snapshot. | `main:backend/shifts/serialization/offers.py:243`; `pr257:backend/shifts/serialization/offers.py:244`; `pr257:backend/shifts/offers.py:387` |

- **Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
- **Issue:** #250 (Grill Me, 26 areas) — **PR #184** (Oct 2026) is the format example
- **Trace baseline:** PR #249 head **`97c4543e051b43fe30ec7e2e61ad3d69957a918e`** — VERIFIED live via `pull_request_read` (open draft, base `feat/mobile-merge-sdk`). PR body text naming a "working head `26cae2d6`" is the short SHA of the last listed implementation commit, not the branch head. All tracing below is at the API head.
- **Main:** `8ccf8f7` (per task; code-search index ref `8ccf8f778f…` matches).
- **Docs PR:** #267 (`docs/grill-me-20261121`, head `25248b70e785`, open) — this trace belongs there. Nothing was pushed to it.
- **Date traced:** 2026-11-21 (AEST). **Method:** read-only GitHub connector calls only, sequential with ≥8 s between calls. No code changed, no PR/issue/comment created, no owner notified.
- **Rate-limit note:** no HTTP 429 occurred in this re-trace.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Authenticated talent board browsing | Renders talent cards with client-side role and category filters (; Next has migrated copy ) (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:78`). | Renders talent cards with identical filters (`frontend_mobile/roles/shared/talent-board/index.tsx:89`). | Yes | - |
| Public talent board browsing | Signed-out visitors browse the public talent feed. | Signed-out visitors browse the same public feed at /explore/talent-board; every `explore` route is public (`frontend_mobile/app/explore/talent-board.tsx`, `frontend_mobile/app/_layout.tsx:315-317`). | Yes | Corrected 22 Nov (orchestrator review): the earlier row said Expo needs sign-in; it does not. |
| Worker creates / edits talent profile | Worker writes pitch and copies availability via pitch dialog (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:360`). | Worker writes pitch and copies availability via pitch modal (`frontend_mobile/roles/shared/talent-board/index.tsx:412`). | Yes | - |
| Request booking modal / route | Tapping "Request booking" opens embedded post-shift modal prefilled with worker (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:264`). | Tapping "Request booking" navigates to mobile post-shift screen (`frontend_mobile/roles/shared/talent-board/index.tsx:358`). | Yes | - |
| Role gating on "Request booking" | Restricted to 9 hiring roles; `PHARMACY_MANAGER` is excluded (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:208-226`). | Permits any non-worker role; `PHARMACY_MANAGER` is allowed (`frontend_mobile/roles/shared/talent-board/index.tsx:322-326`). | No | Verified 21 Nov: real drift. Web allows a fixed role list or an admin (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:208-226`); Expo allows any role except Explorer, pharmacist and other staff (`frontend_mobile/roles/shared/talent-board/index.tsx:322-326`). Owner choice: one hiring-role policy (GM-18 Q15, GM-05 Q-17); then align both (BL-24). |
| Like / react to candidate post | Toggles heart icon to increment/decrement reaction counter (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:288`). | Toggles heart icon on candidate card (`frontend_mobile/roles/shared/talent-board/index.tsx:370`). | Yes | - |
| Manage availability calendar | Worker configures weekly availability slots on dedicated page (`frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:129`; Next has no availability page). | Worker configures availability on mobile screen (`frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:1285`). | Yes | - |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM-18-Q01 | Web + Expo (also covers GM-04-Q12, GM-24-Q11, GM26-Q01) |
| GM-18-Q02 | Web + Expo (also covers GM-24-Q12, GM26-Q02) |
| GM-18-Q03 | Web + Expo (also covers GM26-Q03) |
| GM-18-Q04 | Web + Expo |
| GM-18-Q05 | Web + Expo (asked in GM-15: GM15-42) |
| GM-18-Q06 | Web + Expo |
| GM-18-Q07 | Web + Expo (also covers GM-12-Q18, GM-24-Q14, GM25-C16) |
| GM-18-Q08 | Web + Expo (also covers Q-14, GM25-C17) |
| GM-18-Q09 | Web + Expo (asked in GM-15: GM15-43) |
| GM-18-Q10 | Web + Expo (also covers GM26-Q20) |
| GM-18-Q11 | Web + Expo (also covers GM26-Q35) |
| GM-18-Q12 | Web + Expo (asked in GM-02: ON-P03) |
| GM-18-Q13 | Web + Expo (also covers GM01-Q16, GM-24-Q13, GM25-C12, GM26-Q04) |
| GM-18-Q14 | Web + Expo (also covers GM01-Q17, GM26-Q05) |
| GM-18-Q15 | Web + Expo (also covers Q-17, GM-24-Q15, GM25-C14, GM26-Q29) |
| GM-18-Q16 | Web + Expo (also covers GM25-C13, GM26-Q30) |
| GM-18-Q17 | Web + Expo (asked in GM-19: GM-19-Q12) |
| GM-18-Q18 | Web + Expo (asked in GM-11: GM-11-Q05) |
| GM-18-Q19 | Web + Expo (asked in GM-19: GM-19-Q10) |
| GM-18-Q20 | Web + Expo (asked in GM-13: GM13-Q12) |
| GM-18-Q21 | Web + Expo (asked in GM-16: GM16-Q02) |
| GM-18-Q22 | Web + Expo (asked in GM-12: GM-12-Q10) |
| GM-18-Q23 | Web + Expo (asked in GM-19: GM-19-Q06) |
| GM-18-Q24 | Web + Expo (asked in GM-19: GM-19-Q04) |
| GM-18-Q25 | Web + Expo (asked in GM-19: GM-19-Q09) |
| GM-18-Q26 | Web + Expo (asked in GM-15: GM15-47) |
| GM-18-OD-13 — Resending a talent pitch never creates a duplicate | Web + Expo |

## 0. Reconstruction note — read this first

The original GM-18 worker trace file (26 questions, head `97c4543e…`) is **missing**; only its senior-review record survives (`~/workspace/chemisttasker-grill/senior-review-gm18-talent-recruitment.md`, PASS, 2026-11-21). This file is a **from-scratch re-trace**, not a recovery of that file. Every claim below was re-verified by direct file fetch at the PR #249 head, or is explicitly marked as adopted from another area's senior-reviewed trace at the same head (GM-19 for the matching engine, GM-02 for AHPRA gates, GM-15 for billing/terms) or marked UNKNOWN.

Two consequences:

1. **Question numbering is reconstructed, not recovered.** The senior review records the original queue as GM-18-Q01–Q26 with Q01 "Who can see the talent board?", and its decision-gap summary refers to the lost numbering (e.g. "Q15 (one hiring-role policy incl. PHARMACY_MANAGER call)", "Q24 (disclosure)", "Q25/Q26 (launch timing)"). This reconstruction keeps Q01 as specified and covers the same ground, but the Q-numbers below **do not necessarily match the lost file's Q-numbers**. The mapping table in §2 gives the #184 source of every question so the PR assembly can reconcile numbering.
2. **The senior review's verified findings all re-confirmed.** Identity leak, no pitch-text scrubbing, bare availability serializer, AHPRA_SOURCE default `scrapingbee`, AHPRA gate public-shifts-only, dedicated shifts forced `LOCUM_CASUAL` with 48h flat expiry, one offer per slot, legacy `charge-penalty/` route live, Web 9-role allow-list vs Expo any-non-worker booking drift, "0.0 (0)" new-worker rating — each was re-fetched at head and confirmed below. One residual gap from that review is now **closed**: `is_public_shift()` is defined as `shift.visibility == escalation.PUBLIC_LEVEL` (`backend/composition/foundation_services.py:60`).

### PR #257 flag — check before relying on these claims

PR #257 (`[Draft QA] PR249 combined M4-04 and M5-01 integration acceptance`, head `ad01356e`, open) touches **64 files**, including one GM-18 core file: **`backend/talent/views/explorer.py`** (modified). It also touches marketplace/shift surfaces adjacent to this area (`backend/marketplace/*`, `backend/shifts/test_m5_posting_scope.py`, Expo `PostShiftScreen*`, `ActiveShiftsPage/*`, `OwnerAssignedShiftBoard.tsx`, Next `landing_next/features/marketplace/*`, `shared-core/src/domains/shifts/audience.ts` + `postingWindow.ts`). This trace did **not** re-trace #257. Any claim below citing `backend/talent/views/explorer.py` (visibility filter, identity leak, `add_view`, likes) must be re-checked against #257 before it is treated as final. All other cited files are **not** in #257's file list (checked 2026-11-21).

### Files verified in this re-trace (all at PR #249 head unless noted)

| File | What was verified |
|---|---|
| `backend/talent/serializers/explorer.py` (349 lines) | Unmasked read serializer; public masking only when anonymous; write `validate()` — no scrubbing; FULL_TIME forcing |
| `backend/talent/views/explorer.py` (265 lines) | `get_queryset` visibility filter on all non-write actions; feed vs public_feed serializers; `by_profile` unmasked; `add_view` unthrottled; like/unlike any authenticated; `_require_public_staff_access`; newcomer one-post + 7-day rule |
| `backend/talent/models.py` (196 lines) | `ExplorerPost` fields; `is_anonymous` default True; `is_talent_board_visible()`; `hidden_at`; `SavedProfessionalContact`; `UserAvailability` |
| `backend/talent/views/saved_contacts.py` | Saved-contacts API: GET/POST/DELETE, max 100, visibility-filtered reads |
| `backend/talent/urls.py` | Routers + saved-contacts routes |
| `backend/onboarding/verification/state.py` (363 lines) | `require_public_ahpra` (:171), `lock_public_ahpra` (:181), `queue_public_recheck` (:197, desktop-only) |
| `backend/composition/foundation_services.py` (:60) | `is_public_shift` = `visibility == PUBLIC_LEVEL` — **closes senior-review residual** |
| `backend/shifts/interest.py` (300 lines) | `is_public_shift_member_access` (:21); `express_interest` AHPRA gate (:88) |
| `backend/shifts/posting.py` (290 lines) | `protect_direct_booking` (:30); `post_shift` calls it |
| `backend/shifts/assignment.py` (320 lines) | `OFFER_EXPIRY_HOURS = 48` (:22); lazy expiry (:69); offer refresh does **not** extend expiry; `offer_dedicated_shift` (:259) one offer per slot |
| `backend/billing/urls.py` (19 lines) | `charge-penalty/<int:shift_id>/` live (:15) |
| `backend/billing/shift_payments.py` (270 lines) | Subscriber discount applied (:110–132); hard-coded Stripe price IDs (:116–130); penalty 20%/10% (:214–218) |
| `backend/billing/checkout_prices.py` | Hard-coded price-ID → cents map, no env |
| `backend/core/settings.py` (723 lines) | `AHPRA_SOURCE` default `scrapingbee`, enforcement default True (:643–644) |
| `frontend_web/.../TalentBoard/index.tsx` (1,012 lines) | 9-role `canRequestBooking` (:313); booking flow (:346); pitch save copies availability (:670); staff `is_anonymous: true` (:723); rating defaults 0 (:164–165) |
| `frontend_web/.../TalentBoard/components/TalentCardV2.tsx` | `0.0 (0)` rating (:106); `ReportButton kind="talent"` (:296) |
| `frontend_web/.../TalentBoard/components/PitchDialog.tsx` | "Please don't add any contact details…" warning (:353) — UI-only |
| `frontend_web/.../TalentBoard/hooks/useTalentFeed.ts` | Full download, `page_size: 200` |
| `frontend_web/.../TalentBoard/hooks/useTalentFilters.ts` | Delegates to shared-core `filterTalentCandidates` |
| `shared-core/src/domains/talent/presentation.ts` | `filterTalentCandidates`: search/role/state/work-type/skill/travel/placement/dates — **no distance, no rate** |
| `shared-core/src/domains/talent/api.ts` (95 lines) | Feed/public-feed/detail/view/like/unlike CRUD; `saveProfessionalContact` / list / delete — **no screen caller found** |
| `frontend_mobile/roles/shared/talent-board/index.tsx` (727 lines) | `canRequestBookingByRole` any-non-worker (:313); `canRequestBookingOverride`; `postShiftRoute` default `/owner/post-shift` (:96–108) |
| `frontend_mobile/roles/shared/talent-board/components/TalentCardV2.tsx` | Same `0.0 (0)` (:101); `ReportButton` (:182) |
| `frontend_mobile/roles/shared/talent-board/components/PitchDialog.tsx` | Same warning (:281); same one-time availability copy |
| `frontend_mobile/roles/shared/talent-board/useTalentFeed.ts` + `hooks/useTalentFeed.ts` | **Two copies** (3,041 vs 2,948 bytes); root copy imported by index; both full-download |
| `frontend_web/landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx` (1,078 lines) | Diverged twin — **515 diff lines** vs Vite; same 9-role list (:374); `PublicTalentCard`; served-or-dead UNKNOWN (GM-25) |
| `docs/qa/launch-grill/questions.json` + `AUDIT.md` (at `refs/pull/184/head`) | Old questions TB-Q01–Q10, AV-Q01–Q09, LA-Q01–Q18 re-validated (§2) |

**Adopted, not re-fetched (same head, senior-reviewed elsewhere):** `backend/shifts/announcements.py` + `backend/workforce/roster/validation.py` + `backend/talent/serializers/availability.py` + `backend/talent/views/availability.py` + both SetAvailability screens (GM-19); AHPRA gate shape + "dedicated/counter-offer/manager offers bypass verification" (GM-02 senior review); terms-fingerprint vs cancellation-table status (GM-15 senior review).

**Still UNKNOWN (not verified):** whether the live Next site serves the migrated TalentBoard copy; whether any backend role gate exists on dedicated-shift creation (view layer not traced — GM-10/GM-12); whether `offers.py` accept path calls `lock_public_ahpra` for dedicated offers (GM-02 says dedicated offers bypass verification — adopted); the exact `charge-penalty` view-level eligibility guard (function verified, view wrapper not re-read); the content diff between the two mobile `useTalentFeed` copies (sizes differ; lines not diffed).

## 1. GM-18 traced flow — ACTUAL TODAY (verified at head)

### 1a. What a talent post is — `backend/talent/models.py`, `ExplorerPost`

- **Who can post:** pharmacist, pharmacy team (`OTHER_STAFF`), or newcomer (`EXPLORER`). `role_category` is forced to the author's current account role by the write serializer; a post is one row with `headline`, `body` (the pitch), `role_category`/`role_title`, `work_types`, `post_kind` (`AVAILABILITY` or `FULL_TIME_APPLICATION`), `coverage_radius_km`, `open_to_travel`, `travel_states` (via onboarding), `availability_mode`/`availability_summary`/`availability_days`/`availability_notice`, `location_suburb`/`location_state`/`location_postcode`, `skills`/`software`, `reference_code` (unique, 8 hex chars, used for public QR lookup), `is_anonymous` (**default True**), denormalised `view_count`/`like_count`/`reply_count` (`reply_count` is future-ready — no comments exist), `created_at`/`updated_at`, and `hidden_at` (moderation takedown).
- **Newcomer rule:** one active post per newcomer; re-posting within 7 days keeps the previous post's `created_at` (so it does not jump to the top of the feed) — `views/explorer.py::_create_newcomer_post`, `NEWCOMER_REPOST_WINDOW = 7 days`. A second post while one exists is rejected ("You already have a post on the talent hub. Edit it, or delete it to post again.").
- **Visibility rule — `is_talent_board_visible(today)`:**
  - `hidden_at` set → **False** (moderation hides from every feed).
  - `post_kind == FULL_TIME_APPLICATION` → **True, always, never expires on date**.
  - Dated availability post → visible only while `latest_availability_date >= today`.
  - **Undated post → True forever.**
  - **No check of the author's Verified/AHPRA status.** A worker whose AHPRA lapses keeps a visible post. The *viewer* gate (below) checks the viewer, not the author.
- **Edit / hide / delete:** the author (owner only, `IsPostOwner`) can update any updatable field including `is_anonymous`, `headline`, `body`, dates and location; `explorer_profile` can never be changed by the client. Delete is a hard delete (`perform_destroy`). There is **no author-side "hide my post" toggle** in the API — the only hide is moderator `hidden_at`. (Whether the apps expose a hide button was not traced; delete is exposed — mobile `index.tsx:699-700` wires delete to the pitch dialog.)

### 1b. Identity: what the API returns — `backend/talent/serializers/explorer.py` (P0)

Plain English first: **an anonymous post is only anonymous to someone who is not signed in.** Any signed-in account — including a competing worker — gets the author's name and user IDs from the API the apps actually use.

- **Authenticated reads use `ExplorerPostReadSerializer`**, which exposes `explorer_name` (full name via `get_full_name()`; first name only if the author's profile is under 18), `author_user_id`, `explorer_user_id`, `explorer_profile`, plus skills, software, travel states, AHPRA years since first registration, and years of experience. It also exposes a `verification` summary (badges).
- **Public reads use `PublicExplorerPostReadSerializer`**, which redacts `explorer_profile`, `author_user_id`, `explorer_user_id` to `None` and replaces the name with "Anonymous candidate" — **but only when `is_anonymous` is true**. A non-anonymous post is fully identified even publicly.
- **Who gets which:** `feed`, `list`, `retrieve` and `by_profile` all use the **unmasked** serializer. Only `public_feed` (logged-out, `AllowAny`) uses the masked one. The Vite and Expo boards call the authenticated feed, so both apps receive identities for every post, anonymous or not. `by_profile` (lookup by profile id) is also unmasked — an anonymous author's posts are identifiable by profile lookup too.
- **Who may read:** `get_permissions` — read actions (`list`, `retrieve`, `feed`, `by_profile`, `add_view`) need only `IsAuthenticated`. **There is no role check on reading the board.** Any signed-in account can read it, including competing workers and explorers. Logged-out visitors can read `public_feed` (masked when anonymous) and can look up a single post by `reference_code` (QR preview).
- **Who may write:** create/update/delete need `IsAuthenticated` + ownership, and `perform_create` requires the role be Explorer, Pharmacist or Other Staff. `_require_public_staff_access` gates **posting**: Explorer needs `verified`; Pharmacist needs `verified` + mobile verified + **current AHPRA** (`ahpra_verified` and expiry not passed); Other Staff needs `verified` + mobile verified. Note: the AHPRA-expiry check applies only to Pharmacists — Other Staff (including interns) are not expiry-checked here (GM-02 confirmed). Owners/managers cannot create posts at all (role check in `perform_create`).
- **Pitch text is not scrubbed.** The write serializer's `validate()` normalises JSON fields, enforces role/profile ownership, normalises skills, and forces full-time fields — but contains **no scan of `headline`/`body` for phone numbers, emails or identifying text**. The only protection is the UI warning in both PitchDialogs: web — "Please don't add any contact details or information that identifies you." (`PitchDialog.tsx:353`); mobile — "Please do not add contact details or identifying information." (`PitchDialog.tsx:281`). A worker who pastes a phone number into the pitch publishes it to every signed-in reader, and the server will not stop them.
- **Full-time forcing:** when `post_kind == FULL_TIME_APPLICATION`, the serializer forces `FULL_TIME` into `work_types`, clears `availability_days` to `[]`, sets mode `FULL_TIME_NOTICE`, summary "Open to anytime" and notice `None`. A full-time application therefore never carries dates — which is exactly why it never expires under `is_talent_board_visible()`.

### 1c. Feeds, visibility enforcement, and counters — `backend/talent/views/explorer.py`

- **TB-03 is FIXED at head.** `get_queryset` filters through `_visible_posts` for **every non-write action** (`list`, `retrieve`, `feed`, `public_feed`, `by_profile`, `add_view`, `like`, `unlike`). The Oct 2026 claim that ordinary `list`/`retrieve` bypass the visibility rule is **no longer true**. `list?mine=true` returns only the caller's own posts. Pagination is `page_size = 50`, `max_page_size = 200`.
- **But the visibility rule itself is thin** (see §1a): hidden posts are excluded everywhere now, but undated and full-time posts live forever, and lapsed credentials change nothing.
- **Ratings annotation:** every read annotates `rating_average` / `rating_count` from `ratings_received_as_worker` filtered to direction `OWNER_TO_WORKER` only. Internal/roster ratings feeding the same average is a GM-15 question (SH-10: rating eligibility too loose) — not re-decided here.
- **`add_view` is unthrottled.** Any authenticated user may POST `/explorer-posts/{id}/view/` as often as they like; each call increments `view_count` by 1. There is no per-user, per-session or time-window limit in the view. **However:** no screen was found calling `addExplorerPostView` — code search returns only the shared-core definition and contract files. So view counts likely sit at 0 from the apps today, while the endpoint remains open to direct calls. (Search indexes the default branch; treat the "no caller" finding as strong but not absolute.)
- **Likes:** `like`/`unlike` are one per user per post (`unique_together`), any authenticated user, and update `like_count`. The heart is only a like — it creates no membership, no favourite, no notification to the author (none traced).
- **Report:** both cards render a `ReportButton kind="talent"` (web `TalentCardV2.tsx:296`; mobile `TalentCardV2.tsx:182`). This **closes** the senior review's unknown on the Expo Report button — it exists on both. What the report does after tap (moderation queue — `hidden_at` is set from a "Moderation tab, Talent board area" per the model comment) was not traced end-to-end.

### 1d. Creating and editing a post — Vite, Next, Expo

**Web (Vite) — `TalentBoard/index.tsx` + `PitchDialog.tsx`:**
- The pitch button opens when `?publish_availability=1` or `?pitch=1`, or by tap. `loadPitchDefaults` pre-fills from the worker's own availability via `mapAvailabilityToPitchSlots(await fetchUserAvailabilityService())` — the **one-time copy** (see §1e).
- On save, `handlePitchSave` first writes location/travel prefs back to onboarding (`updateOnboardingLocationPrefs`), then creates/updates the post. Staff payloads force `is_anonymous: true`; explorer payloads do not set it (model default True). Full-time payloads force `FULL_TIME` + empty dates (mirroring the server).
- The board shows the worker's own post for editing via `getExplorerPostForEditing()`; delete is wired in the pitch dialog.

**Expo — `talent-board/index.tsx` + `PitchDialog.tsx`:**
- Same flow: pitch dialog, availability copied from the calendar on load, same one-time copy on save, same UI-only contact warning. **Two small drifts vs web:** (1) the mobile payload does **not** force `is_anonymous: true` for staff — it relies on the model default, so editing an existing post on mobile leaves a previously-set `is_anonymous: false` in place where web would force it back to true; (2) mobile has **two copies** of `useTalentFeed` (`talent-board/useTalentFeed.ts`, 3,041 bytes, imported by the board; and `talent-board/hooks/useTalentFeed.ts`, 2,948 bytes) — the sizes differ, so they have already drifted; which copy the hooks one serves was not traced.
- `canPitch` on mobile: Explorer, or talent staff with `staffPublicAccess === true` (a Verified-gate check against the staff public-access rule).

**Next — migrated `TalentBoard/index.tsx`:**
- A real, diverged twin: **515 diff lines** against the Vite board. It inlines the `talentModel` helpers, adds a `PublicTalentCard` component and a search input, and keeps the same 9-role booking allow-list (§1f). Whether the live Next site serves this copy is **UNKNOWN** (GM-25). If it does, Next users see a board that has drifted from Vite with no shared owner; if it does not, the copy is dead code that will keep drifting.

### 1e. Availability snapshot — the copy that never syncs (AV-01)

- The pitch form copies the worker's live calendar **once**, at compose time, into the post's `availability_days` (web `:670`, `:699`; mobile `:574`). Later calendar edits never update the post — there is no link, no sync job, no "last synced" stamp in `models.py`. A post can advertise dates the worker removed from the live calendar months ago.
- The copy is filtered to dates `>= today` at save time on both clients, so past dates are dropped at compose time — but a post composed in January still shows January dates in March until its `latest_availability_date` passes, and an undated or full-time post never expires at all.
- The matching engine reads the **live** calendar, not the post snapshot (GM-19): alerts use `UserAvailability` rows; the post snapshot is display-only. So the board and the inbox can disagree about the same worker.
- Server validation of the calendar itself: **none** (AV-05). `backend/talent/serializers/availability.py` is a bare `ModelSerializer` with no `validate()` at all (GM-19 verified at this head): end-before-start, past dates, weekdays outside 0–6, recurring rows with no days, exact duplicates are all accepted by the API. Both apps do some client-side checks; direct API calls bypass them.

### 1f. Request booking / dedicated offers — the firm-offer flow

Plain English: today "Request booking" is **not a chat or an enquiry**. It opens a pre-filled shift form for one named worker, and submitting it creates a **firm offer** that the worker accepts or declines. There is no "can I ask a question first?" step anywhere in the flow.

**Client side:**
- **Web:** `canRequestBooking` = fixed 9-role allow-list (`OWNER`, `PHARMACY_ADMIN`, `PHARMACY_OWNER`, `ORG_ADMIN`, `ORG_OWNER`, `ORG_STAFF`, `CHIEF_ADMIN`, `REGION_ADMIN`, `ORGANIZATION`) **or** `isAdminUser` (`index.tsx:313-332`). Notably **not** in the list: `PHARMACY_MANAGER` — a pharmacy manager cannot request a booking from the web board. Tapping a candidate opens the calendar, then "Request booking" navigates to the embedded post-shift modal with `dedicated_user=<author user id>`, the candidate's dates/times, and the role resolved by shared-core `resolveTalentBookingRole`. It needs the author's user id from the (leaking) API — the flow depends on the identity leak.
- **Expo:** `canRequestBookingByRole` = **any role except** `EXPLORER`, `PHARMACIST`, `OTHER_STAFF` (`index.tsx:313-319`) — so `PHARMACY_MANAGER` **can** request a booking on mobile, and so can any future non-worker role. A `canRequestBookingOverride` prop can force it true, and the owner/org wrappers do exactly that (`roles/owner/talent-board.tsx` and `roles/organization/talent-board.tsx` pass `canRequestBookingOverride`). The pharmacist/other-staff wrappers pass `postShiftRoute="/owner/post-shift"` with no override — unreachable in practice because the role check is false for them, but the route is wrong if that ever changes. The default `postShiftRoute` is `/owner/post-shift`; org passes `/organization/post-shift`.
- **Next:** same 9-role allow-list as Vite (`:374-392`).
- **The drift is real and three-way:** web/Next allow 9 named roles; Expo allows any non-worker role; the owner/org mobile wrappers bypass the role check entirely with an override. The backend does not settle it: no hiring-role gate was found in the traced backend slice (`posting.py`, `assignment.py`); whether the shift-creation view enforces one is **UNKNOWN** (GM-10/GM-12 territory).

**Server side — `backend/shifts/posting.py::protect_direct_booking` (:30) + `post_shift`:**
- Any shift with a `dedicated_user` is forced private: `visibility = 'LOCUM_CASUAL'`, `post_anonymously = False`, and **all escalation fields are cleared** (`escalate_to_locum_casual`, `escalate_to_owner_chain`, `escalate_to_org_chain`, `escalate_to_platform` → `None`). A dedicated offer can never escalate to a wider audience, even if the worker declines. `revise_shift` applies the same protection.
- **Consequence for AHPRA (see §1g):** because the shift is forced to `LOCUM_CASUAL`, it is never a "public shift", so the public AHPRA gate never runs for it.

**Server side — `backend/shifts/assignment.py::offer_dedicated_shift` (:259):**
- One offer per slot (or one slotless offer for a single-user/slotless shift), each with `expires_at = now + 48h` (`OFFER_EXPIRY_HOURS = 48`, :22). **No cap at shift start** — an offer made 2 hours before a shift stays pending after the shift has begun (until lazily expired on listing, :69). One email + notification is sent (for the first offer only).
- **Offer refresh does not extend expiry:** re-offering to the same candidate updates the offered date/time/rate but the `update_fields` list does **not** include `expires_at` — the original 48h deadline stands.
- **Outside acceptance reserves pending payment** (carried decision D01): acceptance creates a time-limited reservation; only verified payment confirms it. The D02 pay-by deadlines (24h/6h/2h/30min, never past start) are **not implemented** per GM-19's carried-decision note — so the reservation has no pay-by deadline in code. The fee is per offer ($30 locum / $80 PT-FT; $15/$40 for subscribers — §1j), whatever the hours or days.

### 1g. AHPRA / Verified gates on booking — public-only, and dedicated offers skip them

Plain English: the law's register is only checked when a stranger books a **public** shift. If the pharmacy already knows the worker (staff, favourite, or a direct dedicated offer), no fresh register check runs before booking.

- **The gate — `backend/onboarding/verification/state.py::require_public_ahpra` (:171):** runs only `if is_public_shift(shift) and not is_public_shift_member_access(user, shift)`. `is_public_shift` is now verified as `shift.visibility == escalation.PUBLIC_LEVEL` (`backend/composition/foundation_services.py:60`) — **this closes the senior review's residual gap**. `is_public_shift_member_access` (`backend/shifts/interest.py:21`) is true for an active staff or favourite member of the pharmacy reaching its public, named shift.
- **Inside the gate:** `require_ahpra_application` (suspended / not-found / unreadable / rejected / review → 403) + `_require_public_shift_onboarding` (Verified profile) + `queue_public_recheck` on commit.
- **The re-check is desktop-only:** `queue_public_recheck` (:197) returns early `if settings.AHPRA_SOURCE != 'desktop' or not number`. The default is `AHPRA_SOURCE = env('AHPRA_SOURCE', default='scrapingbee')` (`backend/core/settings.py:643`), enforcement on by default (:644). So under the default config, **no fresh lookup runs before a dedicated booking, and no fresh lookup is queued before a public booking either** — the gate reads the latest stored register check. A registration cancelled after the last stored check is not caught until a recheck happens for another reason. (GM-02: "no scheduled AHPRA re-scan; stored expiry not enforced at apply/accept".)
- **Dedicated offers bypass verification entirely.** A dedicated shift is forced to `LOCUM_CASUAL`, so `is_public_shift` is false and `require_public_ahpra` never runs; GM-02's senior review lists "counter-offer/manager/dedicated offers bypass verification" as a confirmed code gap. The only credential check on the dedicated path is at talent-post publish time (§1b), which checks the **author at posting time**, not at booking time, and never re-checks.
- **Chain / organisation tiers also skip the gate** (LA-P03): a chain or org shift is not `PUBLIC_LEVEL`, so the same bypass applies. External workers can be booked through those tiers without a fresh register check. (Observed from the gate's shape; the tier flows themselves are GM-10/GM-12 territory.)
- **The publish gate is not a booking gate.** A pharmacist must hold current AHPRA to *publish* a talent post, but nothing re-checks that before an owner books them from the board.

### 1h. Ratings, likes, saved contacts

- **Ratings display:** the board shows one number per candidate: owner-to-worker star average + count, rendered as `{ratingAverage.toFixed(1)} ({ratingCount})` — web `TalentCardV2.tsx:106`, mobile `:101`. A worker with no ratings shows **"0.0 (0)"** — which reads as a bad score, not as "new". The client defaults a missing average/count to 0 (`index.tsx:164-165`), so there is no "New" state anywhere in the flow. There is **no separate reliability measure** (attendance, responsiveness, cancellations) — one star average carries everything. Rating eligibility is loose (GM-15 / SH-10: ratings allowed for any assignment ever, including future, unworked and internal-employee shifts) and internal roster ratings feed the same public average.
- **Likes:** one per user per post; the count shows on the card. No notification to the author was traced; the heart creates no reusable relationship.
- **Saved professional contacts — API exists, no UI found.** `backend/talent/views/saved_contacts.py` implements a private, account-scoped bookmark: save a worker listing by `reference_code` or an organisation by slug (max 100), list only contacts whose listing is still public/visible, delete by id. Shared-core exposes `listSavedProfessionalContacts` / `saveProfessionalContact` / `deleteSavedProfessionalContact` (`shared-core/src/domains/talent/api.ts`). **No screen was found calling any of them** — code search for `saveProfessionalContact` and `listSavedProfessionalContacts` returns zero hits outside the API definition itself (default-branch index; strong but not absolute). The bookmark a pharmacy would use to keep a worker they found on the board exists server-side and is unreachable from the apps.
- **Favourites / membership:** the heart does **not** add a pharmacy favourite. Favourites are Membership rows (`LOCUM`/`SHIFT_HERO` employment types) used by the favourites notifications and community tier — there is no "Invite to favourites" action on any talent card (web, mobile or Next — none traced). A pharmacy that likes a worker still has no path from the card to a re-bookable relationship.
- **Block:** no block list exists anywhere in the traced flow. A pharmacy cannot block a worker (and a worker cannot block a pharmacy) — the only controls are decline per offer and moderation `hidden_at`.

### 1i. Search and filters — client-side only, no distance, no rate

- Both apps download **every** feed page (`loadAllTalentPages`, `page_size: 200`) and then filter in the app through the **shared** `filterTalentCandidates` (`shared-core/src/domains/talent/presentation.ts`), used identically by Vite, Expo and Next. Filters that exist: text search (role + pitch + city + reference code), role, state, work type, skills/software, willing-to-travel, placement seeker, availability date range. **There is no distance-from-pharmacy filter and no rate filter**, although posts store postcode and `coverage_radius_km`. The backend exposes no filter parameters at all, and `_visible_posts` loops the whole table in Python before pagination (TB-04). This works for a small board and breaks at a few thousand posts.
- **Distance/rate in matching (not search):** the *alert* engine does enforce travel (GM-19: open-to-travel requires the pharmacy state in `travel_states`, otherwise haversine distance ≤ `coverage_radius_km`; missing coords/radius → silently no match). It does **not** check a minimum rate — a $70/hr locum is alerted about a $55/hr shift. The talent-post radius is a separate snapshot from the matching prefs. So distance exists in alerts but not in board search, and rate exists in neither.
- **Public board:** logged-out visitors get masked cards via `public_feed` (web `PublicTalentBoardPage.tsx` per the Oct audit; the Vite board's `publicMode` renders the same board with login gates on like/calendar/booking). The Next copy adds a `PublicTalentCard`. Whether the public page is linked or indexed was not traced.

### 1j. Money around a talent-board booking

- **Fulfilment fee (per offer):** locum $30 / PT-FT $80 standard; **subscriber discount now applied** — `is_subscriber` gates the price IDs (`shift_payments.py:110-132`): locum $15, PT-FT $40 for active subscribers. Tests exist (`backend/billing/test_pr201_b01.py`: unrelated owner gets no discount; inactive subscriber pays standard). **But the Stripe price IDs are still hard-coded** (`:116-130` and `checkout_prices.py`: the same four IDs, with a cents map, no env selection) — test and live cannot differ. The fee is per offer, whatever the hours or days (SH-03, second half, still open).
- **Legacy penalty route (SH-02): still live.** `POST billing/charge-penalty/<int:shift_id>/` is routed (`billing/urls.py:15`) and implemented (`shift_payments.py::charge_penalty`): 20% of expected wage if ≤24h to start, 10% if ≤72h, 0 beyond that, creating a live Stripe checkout named "Cancellation Penalty for Shift #…". The Oct register said to suspend it. No screen was found calling it (consistent with #184; frontend search not exhaustive). It is callable by any authenticated user who can reach the route — the view-level eligibility guard was not re-read in this trace.
- **Cancellation disclosure (SH-09 / LA-Q10):** GM-15's senior review records this as partial — a terms fingerprint exists, but the accepted-terms snapshot **still lacks the cancellation table, platform terms version and pharmacy-side acceptance**. So a worker accepting a dedicated offer from the board is not shown the cancellation charges that could later apply — and the legacy 10%/20% route above is exactly the charge that would be levied.
- **GST / tax invoice (LA-R01):** not traced in this area (GM-17 territory). No GST statement was found in the traced billing slice.

### 1k. Expiry and staleness — nothing ever expires (AV-02)

- **Posts:** dated posts hide after their last date; undated and full-time posts live forever unless a moderator sets `hidden_at`. There is no inactivity cutoff (e.g. 30 days), no nudge to refresh, no "last updated" display on the card, and no `confirmed_at` on the post. A full-time seeker from 2025 still tops the board in 2027.
- **Availability rows:** open-ended recurrence is allowed (`recurring_end_date` nullable) and both apps send `null` when unset (GM-19 verified — the Oct claim that apps require an end date is wrong). No reconfirm prompt, no freshness flag, no pause. `updated_at` changes on any edit and is not a worker confirmation.
- **Offers:** 48h flat expiry, lazy (see §1f). No expiry tied to shift start, no reminder before expiry traced.
- **Alerts:** match emails fire at posting time only, PLATFORM-visibility only (GM-19). Escalation never re-announces, so a shift that widens its audience never re-alerts. Recipients are **not** filtered by Verified/AHPRA — unverified workers are alerted about shifts they are then blocked from applying to (AV-04, both halves verified by GM-19).

### 1l. Parity matrix — Web (Vite) vs Next vs Expo

| Area | Vite web | Next web | Expo mobile |
|---|---|---|---|
| Board | `TalentBoard/index.tsx` (1,012 lines) | Migrated copy (1,078 lines, **515 diff lines**); served-or-dead UNKNOWN | `talent-board/index.tsx` (727 lines) |
| Feed loading | Full download, `page_size: 200` | Same hook shape (own `useTalentFeed` under `hooks/`) | Full download, `page_size: 200`; **two** `useTalentFeed` copies |
| Filters | Shared `filterTalentCandidates` | Same shared filter | Same shared filter |
| Who can request booking | 9-role allow-list + admin | Same 9-role list | Any non-worker role + override (owner/org wrappers force true) |
| `PHARMACY_MANAGER` | **Cannot** book | **Cannot** book | **Can** book |
| Pitch warning | "Please don't add any contact details…" | Not separately traced (copy of Vite) | "Please do not add contact details…" |
| Staff `is_anonymous` forced on save | Yes (`true`) | Not traced | No (relies on model default) |
| Rating display | `0.0 (0)` | Same card shape (not line-verified) | `0.0 (0)` |
| Report button | Yes | Not traced | **Yes** (closes senior-review unknown) |
| Invite to favourites / block | No | No | No |
| Saved contacts UI | No | No | No |
| Availability surface | SetAvailability page exists (GM-19) | **None** (GM-19) | SetAvailability screen exists (GM-19) |
| Identity leak | Yes (unmasked feed) | Same API | Yes (unmasked feed) |

The backend is client-agnostic (one API, one matching engine). Every verified Web-vs-Expo difference is client-side. **Next is the structural gap**: a diverged copy of the board whose live status is unknown, and no availability surface at all.

## 1m. Current-flow matrix

| # | Trigger | Actor | Backend / API | Vite web | Next web | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Worker opens talent board | Any signed-in user | `GET explorer-posts/feed/` — `_visible_posts` filter; **unmasked** serializer | Board, client-side filters | Diverged copy (515 diff lines); live status UNKNOWN | Board, same API, same filters | None | Unauthenticated → 401 on feed; public feed is the logged-out path |
| F2 | Logged-out visitor opens public board | Public | `GET explorer-posts/public-feed/` (`AllowAny`) — masked when anonymous | `publicMode`: like/calendar/booking gated to login | `PublicTalentCard` | n/a (app requires login) | None | Non-anonymous posts are identified even publicly |
| F3 | Worker creates a talent post | Pharmacist / team / newcomer | `POST explorer-posts/` — role + `_require_public_staff_access` (pharmacist: current AHPRA); write serializer, **no pitch scrubbing**; full-time forcing | Pitch dialog; availability copied once from calendar; staff `is_anonymous: true` forced | Same flow in the copy (not line-verified) | Pitch dialog; same one-time copy; `is_anonymous` not forced | `ExplorerPost` row | Post visible per `is_talent_board_visible()` | Unverified / lapsed AHPRA pharmacist → 403 at publish; newcomer with existing post → 400; other roles → 403 |
| F4 | Worker edits / deletes own post | Author only | `PATCH/DELETE explorer-posts/{id}/` — `IsPostOwner`; `explorer_profile` immutable | Edit via pitch dialog; delete wired | Same (copy) | Edit via pitch dialog; delete wired | Row updated / hard-deleted | None; availability snapshot not re-synced | Non-owner → 403; no author "hide" — only moderator `hidden_at` |
| F5 | Owner/manager views a card | Hiring roles (any signed-in user, in practice) | Unmasked read — name + user IDs returned | Card: role, pitch, rating `0.0 (0)` if new, like, Report | Same shape | Same | None | Identity disclosed on read, before any consent | None — no reveal gate exists |
| F6 | Owner taps "Request booking" | Web: 9 roles + admin; Expo: any non-worker (+override) | None at this step (client gate only) | Opens embedded post-shift modal with `dedicated_user`, dates, role | Same 9-role list | `router.push(postShiftRoute?dedicated_user=…)` | None | Prefilled dedicated-shift form | Wrong role → button hidden/disabled client-side only; backend gate UNKNOWN |
| F7 | Owner submits dedicated shift | Owner/manager | `post_shift` → `protect_direct_booking`: forced `LOCUM_CASUAL`, anonymous off, escalations cleared; `offer_dedicated_shift`: one offer per slot, each `now + 48h`, no start cap; one email | Post-shift flow (GM-10) | Same API | Post-shift flow | `Shift` + `ShiftOffer`(s) | Worker notified; offer pending | Worker declines → shift stays private, never escalates; offer expires lazily after 48h |
| F8 | Worker accepts dedicated offer | Worker | Acceptance → reservation pending payment (D01); **no AHPRA re-check** (not a public shift); D02 pay-by deadlines not implemented | Offer flow (GM-12/13) | Same API | Same API | Reservation | Payment checkout ($30/$80; $15/$40 subscriber) | Unpaid reservation has no enforced pay-by deadline in code |
| F9 | Owner likes a post | Any signed-in user | `POST like/` — one per user; `like_count + 1` | Heart toggles; reload | Same | Heart toggles | `ExplorerPostReaction` | None (no notification, no favourite) | Unlike decrements; duplicate like is a no-op (`get_or_create`) |
| F10 | Owner saves a contact | Any signed-in user | `POST saved-professional-contacts/` — max 100, reference-code based | **No UI** | **No UI** | **No UI** | `SavedProfessionalContact` | None | Hidden/expired listing → 400; list filters to still-visible listings |
| F11 | Worker updates calendar | Worker | `PATCH user-availability/` — own rows only, **no validation** | SetAvailability page | **No surface** | SetAvailability screen | `UserAvailability` row | None — talent post snapshot NOT updated | Invalid rows accepted silently |
| F12 | Owner posts a PLATFORM shift | Owner/manager | `announce_availability_matches` (GM-19): any-overlap, travel check, **no Verified/AHPRA filter, no rate check**, PLATFORM-only, posting-time only | — | — | — | Match notifications | Unverified workers alerted; booked/on-leave workers alerted | Escalated shifts never re-announce |
| F13 | Post goes stale | Time passing | **Nothing:** no expiry job, no reconfirm, no `confirmed_at` | No freshness display | — | No freshness display | Stale post + stale snapshot persist | None | Moderation `hidden_at` is the only takedown |
| F14 | Owner cancels a filled shift | Owner | Legacy `POST billing/charge-penalty/{id}/` — 20% ≤24h, 10% ≤72h, live Stripe checkout | No screen calls it (per #184 + search) | Same | Same | Stripe checkout | Money charged outside the agreed P09 table | No agreed-table charge exists; legal review outstanding (GM-15/17) |
| F15 | Anyone views a post repeatedly | Any signed-in user | `POST explorer-posts/{id}/view/` — unthrottled, +1 per call | No caller found | No caller found | No caller found | `view_count` | Count inflates on direct calls | No throttle, no dedupe, no per-user limit |

## 2. Old-question re-validation (#184 → today, 33 verdicts)

Statuses: ✅ STILL VALID · 🔄 CHANGED · 🟢 FIXED · ❓ NOT RE-VALIDATED (carried as-is, do not ask until re-validated).

### Talent area (TB-Q01–Q10) — all 10 re-validated

| Old Q | Verdict | What changed / evidence at head |
|---|---|---|
| TB-Q01 Who can see the talent board? | ✅ STILL VALID | Any signed-in user reads it; public masked cards. `views/explorer.py::get_permissions` — read = `IsAuthenticated` only. |
| TB-Q02 When is anonymous identity revealed? | ✅ STILL VALID | No reveal point exists: unmasked serializer on all authenticated reads. |
| TB-Q03 What stays hidden before reveal? | ✅ STILL VALID | Structured fields omit contacts/addresses/documents; adult full names exposed; free-text pitch not scrubbed (write `validate()` has no scrubbing; UI warning only, both PitchDialogs). |
| TB-Q04 Which filters launch with? | ✅ STILL VALID | Same client-side filters via shared `filterTalentCandidates`; still no distance or rate filter; backend has no filter params. |
| TB-Q05 Reviews vs reliability? | ✅ STILL VALID | One owner-to-worker average + count; no reliability measure. |
| TB-Q06 New worker display? | ✅ STILL VALID | `0.0 (0)` on both cards (`TalentCardV2.tsx:106` web, `:101` mobile). |
| TB-Q07 Firm offer or enquiry? | ✅ STILL VALID (rec superseded — see Q07) | Dedicated shift + firm offers, 48h expiry, no enquiry step. #184 rec was KEEP; the consolidated queue resolves the GM-18/GM-24 conflict to option C (enquiry first on public contacts, firm offer for favourites/members). |
| TB-Q08 Heart / favourites? | ✅ STILL VALID | Heart is like-only; no Invite-to-favourites on any card; favourites are Membership rows. |
| TB-Q09 Block a worker? | ✅ STILL VALID | Not built — no block list anywhere in the traced flow. |
| TB-Q10 Direct hire off-platform? | ✅ STILL VALID | Not built — no rule in the traced flow. |

### Availability area (AV-Q01–Q09) — all 9 re-validated (detail in GM-19; verdicts confirmed here)

| Old Q | Verdict | What changed / evidence at head |
|---|---|---|
| AV-Q01 Availability entry model? | ✅ STILL VALID | Dated + recurring, no blackouts (GM-19 §3 Q01). |
| AV-Q02 Recurrence horizon? | 🔄 CHANGED — Oct claim wrong | End date is **optional** on backend **and both apps** (payload `recurring_end_date: null`); open-ended allowed. Oct "apps require an end date" is wrong at head. |
| AV-Q03 Matching rule? | ✅ VERIFIED divergence | Alerts any-overlap vs roster full containment — both rules verified (GM-19). |
| AV-Q04 Who sees availability? | ✅ STILL VALID | Own-rows API only; posts hold copied dates; authenticated talent list exposes author identity unmasked. |
| AV-Q05 Booked time blocks alerts? | 🔄 CHANGED — alert side VERIFIED | Roster blocks (hard error); alerts do **not** suppress (no assignment/leave check in `announce_availability_matches`). |
| AV-Q06 When does a post stop showing? | ✅ STILL VALID; TB-03 FIXED | `is_talent_board_visible` unchanged (undated/full-time forever); but feeds now filter through `_visible_posts` on **all** reads — the bypass half is fixed. |
| AV-Q07 Freshness / reconfirm? | ✅ STILL VALID | No `confirmed_at`, no freshness display, no reconfirm on either client. |
| AV-Q08 Urgent-alert opt-in? | ✅ VERIFIED | Single `notify_new_shifts` flag; no separate urgent consent, no quiet-hours. |
| AV-Q09 Distance + rate filters? | 🔄 SPLIT | Distance **enforced** in alerts (travel prefs + haversine); minimum rate **absent** (no rate check, no rate field). |

### Launch area, talent-relevant (14 verdicts)

| Old Q | Verdict | What changed / evidence at head |
|---|---|---|
| LA-Q01 AHPRA fresh lookup before booking? | ✅ STILL VALID | Saved flag drives Verified; gate is public-only (`require_public_ahpra` :171); recheck desktop-only (`queue_public_recheck` :197); default source still `scrapingbee` (`settings.py:643`). |
| LA-Q02 Mobile "add personal profile" drops data? | ❓ NOT RE-VALIDATED | Carried as-is from #184. Do not ask until re-validated. |
| LA-Q03 Reachable mobile dead-ends? | ❓ NOT RE-VALIDATED | Carried as-is from #184. Do not ask until re-validated. |
| LA-Q04 Profile % vs Verified? | ❓ NOT RE-VALIDATED | Carried as-is from #184. Do not ask until re-validated. |
| LA-Q05 Payment readiness only at accept? | ❓ NOT RE-VALIDATED | Carried as-is from #184. Do not ask until re-validated. |
| LA-Q06 Legacy penalty route live? | ✅ STILL VALID | Route live (`billing/urls.py:15`); function creates live Stripe checkouts at 20%/10% (`shift_payments.py:214-218`). |
| LA-Q07 Subscriber charged full price? | 🔄 PARTIAL — discount fixed, IDs still hard-coded | `is_subscriber` now selects $15/$40 (`shift_payments.py:110-132`; tests `test_pr201_b01.py`). Price IDs still hard-coded (`:116-130`, `checkout_prices.py`) — test/live cannot differ. |
| LA-Q09 Offers outlive the shift? | ✅ STILL VALID | Flat 48h, no start cap (`assignment.py:22, :259`); lazy expiry (:69); refresh does not extend expiry. |
| LA-Q10 Accepted terms lack cancellation table? | 🔄 PARTIAL (adopted GM-15) | Terms fingerprint exists; cancellation table, terms version and pharmacy acceptance **still absent** from the snapshot. |
| LA-Q12 Anonymous posts expose names? | ✅ STILL VALID | Unmasked serializer on all authenticated reads; public feed only masks. |
| LA-Q13 Hidden/stale/lapsed posts readable? | 🔄 PARTIAL — bypass fixed, lapse check missing | `get_queryset` now filters `_visible_posts` on all non-write actions (TB-03 fixed). **Still missing:** no re-check when Verified is revoked or AHPRA lapses; posts stay visible. |
| LA-Q14 Board downloads everything? | ✅ STILL VALID | Full download (`loadAllTalentPages`, `page_size: 200`) on web + mobile; Python-loop visibility check pre-pagination; no server filters. |
| LA-Q15 Web/mobile booking-role drift? | ✅ STILL VALID | Web/Next 9-role list; Expo any-non-worker + override; `PHARMACY_MANAGER` can book on mobile, not web. Backend authority UNKNOWN (view layer not traced). |
| LA-Q16 Availability snapshot never syncs? | ✅ STILL VALID | One-time copy at compose on web + mobile; no sync mechanism in `models.py`. |
| LA-Q17 Match emails miss escalated / reach unverified? | ✅ VERIFIED (adopted GM-19) | Posting-time only, PLATFORM-only, no re-announce on escalation, no Verified filter. |
| LA-Q18 Availability input has no validation? | ✅ VERIFIED (adopted GM-19) | Bare serializer, no `validate()`; no validation tests. |
| LA-P03 Chain/org shifts skip AHPRA gate? | ✅ STILL VALID (shape-observed) | Gate requires `visibility == PUBLIC_LEVEL`; chain/org tiers are not public, so the gate does not run there. Tier flows themselves are GM-10/GM-12 territory. |

**Verdict count:** 10 TB + 9 AV + 14 LA (LA-Q01, Q06, Q07, Q09, Q10, Q12–Q18, P03, with Q02–Q05 counted as NOT RE-VALIDATED) = **33 old-question verdicts**, matching the senior review's count. LA-Q02–Q05 are the four honest NOT RE-VALIDATED items; they belong to GM-02/GM-05/GM-25 territory and must be re-validated before they are asked.

### Carried decisions touching GM-18 (from #184 `carried`, NOT re-decided here)

- **D01–D05** (reservation model, pay-by bands, expiry release, who can cancel, one/all dates), **E01/E03** (audience order, escalation timing), **P02–P12** (cancellation policy, fees, incident ladder), **R04/R04D** (swap/cover). GM-18's questions assume D01 (acceptance = time-limited reservation; payment confirms) — but GM-19 notes D02/D03 are **not implemented**, so the reservation has no pay-by deadline and no expiry flow in code.
- **Conflicts already resolved in the consolidated queue — do not re-ask separately:**
  - **OFFER-01** (GM-18-Q07 vs GM-24-Q14): single recommendation **C** — enquiry/chat first for public-board contacts, firm offer for favourites/members. Supersedes GM-18's KEEP and GM-24's enquiry-first. Record the answer in both ledgers.
  - **AUDIENCE-01** (GM-18-Q01 + GM-20 TB-Q02): decide jointly — the contact rule is the same decision as the visibility rule.
  - **GM-25 C12–C15 adopt GM-18** (not re-asked). **GM-05 Q-17** (talent-board booking-permission parity): NOT VERIFIED — ask after GM-18 Q15 is decided, not in parallel.

## 3. Validated question queue (#184 format, numbered GM-18-Q01–Q26)

Statuses: ✅ STILL VALID · 🔄 CHANGED · 🟢 FIXED · ❓ NOT RE-VALIDATED. Every question is CURRENT FLOW TRACED; none is owner-decided. Plain English first, then the detail. "KEEP" means keep the code as it is today; "ALTERNATIVE A" is the keep-existing-policy option where it differs from the recommendation.

### GM-18-Q01 (ex TB-Q01) — Who can see the talent board? ★ FIRST QUESTION — see §4

> **Also covers (22 Nov):** GM-04-Q12 (GM-04), GM-24-Q11 (GM-24), GM26-Q01 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** any signed-in account can read the whole board — including competing workers and newcomers — and sees every author's name and user IDs, because the authenticated feed uses the unmasked serializer (`serializers/explorer.py`, `views/explorer.py::get_permissions` — read = `IsAuthenticated` only). Logged-out visitors see public cards with anonymous authors masked. There is no role check on reading.
- **RECOMMENDED (carried from #184, rec B):** employers + own post, plus public masked — restrict authenticated discovery to authorised hiring roles and each author; keep public discovery only if masking is enforced server-side. Rationale: worker-to-worker access defeats anonymity, and the leak is API-level, so a UI fix cannot cure it. Severity: **P0 (privacy)**. Benefit: anonymous posting becomes real; workers can advertise availability without competitors and current employers identifying them. Risk: the audience shrinks, so fewer eyes on each post; needs a server-side role gate plus a "my post" exception. Legal: privacy — names + availability + location are personal information; OAIC APP 6 (use/disclosure) supports consent-based disclosure; anonymous posting that is not anonymous is also a misleading-representation risk. Decide jointly with GM-20 (AUDIENCE-01).
- **ALTERNATIVE A — Keep current logic:** all accounts see identities; public sees masked cards. Scenario: a locum's current employer signs in as an Explorer and reads her name, suburb and "open to full-time" post. Trade-off: zero build, the anonymity promise stays false.
- **ALTERNATIVE B — Employers and own post only (no public board):** owners, managers, organisations; authors see their own post. Scenario: a pharmacy finds a locum, but a worker browsing without an employer account cannot discover the board at all. Trade-off: strongest privacy, weakest discovery and SEO.
- **ALTERNATIVE C / Other:** employers + own post + public masked (identical to the recommendation here — the "B" option IS the recommendation). Defer: keep current logic until after launch and accept the leak — **not recommended at P0**.
- **Cases:** normal — hiring owner browses masked/unmasked per role; edge — author views own post (must always work); a worker who is also an owner (dual roles — which side wins?); wrong tenant — a pharmacy in another state reads a local worker's post (no tenant scoping on reads today); web/Expo — same API, same leak; Next — same API via the migrated copy.
- **Gap type:** decision gap (P0) + code gap (server-side masking must follow the decision).

### GM-18-Q02 (ex TB-Q02) — When is an anonymous candidate's identity revealed?

> **Also covers (22 Nov):** GM-24-Q12 (GM-24), GM26-Q02 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** immediately, to any signed-in user, on first read. There is no reveal point: no chat reply, booking-request acceptance or offer acceptance gates the name — the API returns it with the card. The public feed is the only masked path.
- **RECOMMENDED (carried from #184, rec A):** when the worker accepts a booking request. Rationale: identity is disclosed before consent today; tying reveal to the worker accepting a request gives the worker the choice to engage. Severity: **P0 (privacy)**. Benefit: anonymous posting works end-to-end; workers control first contact. Risk: needs a per-relationship reveal state (who has been revealed to whom) and a masked card that still lets an owner judge fit; the booking flow must carry the reveal (and the "Request booking" flow currently needs the author user id client-side — it must be reworked to use the reference code instead). Legal: privacy, as Q01.
- **ALTERNATIVE A — Keep current logic:** reveal to any signed-in user immediately. Scenario: as Q01 — the leak is the feature. Trade-off: zero build, anonymity is fiction.
- **ALTERNATIVE B — When they reply in chat:** earlier reveal. Scenario: owner messages, worker replies, name appears. Trade-off: needs a chat/enquiry step first (ties to Q07 option C); a worker who replies to ask a question has revealed themselves before any offer.
- **ALTERNATIVE C — Only when an offer is accepted:** latest reveal. Scenario: owner makes a firm offer to "Anonymous candidate", worker accepts, name appears. Trade-off: maximum privacy, but the owner is offering blind (no name, no verifiable history) and payment/engagement needs identity eventually anyway.
- **Other / defer:** reveal when the worker accepts a favourites invitation (ties to Q08B). Defer: decide with Q01, not separately.
- **Gap type:** decision gap (P0), then build (reveal state + reference-code booking flow).

### GM-18-Q03 (ex TB-Q03) — What stays hidden before identity is revealed?

> **Also covers (22 Nov):** GM26-Q03 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** structured cards omit contact details, street addresses and documents, but authenticated reads return adults' full names (under-18s: first name only) plus skills, software, travel states, AHPRA years and experience. Free-text pitches are **not scrubbed** — the write serializer has no scan, and both PitchDialogs carry only a warning ("Please don't add any contact details…"). A phone number in the pitch is published verbatim.
- **RECOMMENDED (carried from #184, rec A):** hide surname, contacts, street address and documents until the Q02 reveal point; scan free text so the structured-field rule cannot be bypassed. Rationale: the structured rule is worthless if the pitch can carry the same information in plain text. Severity: **P0 (privacy)**. Benefit: the masking rule holds in practice, not just in the schema. Risk: scanning needs a pattern list (phone/email/URL/social handle) and a false-positive path (a worker whose suburb or employer name looks like an identifier); over-blocking annoys legitimate pitches. Legal: privacy, as Q01.
- **ALTERNATIVE A — Keep current logic:** expose adult full names to signed-in users; warn about contact details. Scenario: a worker writes "call me on 04xx" and every signed-in reader can call them directly, off-platform. Trade-off: zero build, the leak persists through the pitch.
- **ALTERNATIVE B — Contact details only:** show the full name before a booking request, hide contacts/address/documents. Scenario: an owner recognises a name and judges reputation, but cannot contact them directly. Trade-off: keeps reputation signals, keeps the name leak — only viable if Q01/Q02 accept name exposure, which they do not as recommended.
- **Other / defer:** block the save when a phone/email pattern is detected (hard reject) vs warn-and-flag-for-review (soft). Defer: ship the structured masking first, add text scanning in the next release — acceptable only if Q01/Q02 masking lands first.
- **Gap type:** decision gap (P0) for the hidden-set; **code gap** for the missing scan (no owner choice needed on the principle — a warning is not a control).

### GM-18-Q04 (ex TB-Q04) — Which filters should the talent board launch with?
- **ACTUAL TODAY (verified):** role, state, work type, skills/software, text search, willing-to-travel, placement seeker, availability date range — all client-side after a full download (`filterTalentCandidates`, shared-core; `loadAllTalentPages`, `page_size: 200`). **No distance-from-pharmacy filter and no rate filter**, although posts store postcode and `coverage_radius_km`. The backend has no filter parameters.
- **RECOMMENDED (carried from #184, rec A):** role, distance, dates, rate, software — run on the server. Rationale: the useful filters already exist, so retain them and add server-side distance/rate matching rather than rebuild the board; server-side is also the scale fix (Q16). Severity: medium. Benefit: an owner in Brisbane stops scrolling through Perth candidates; a $70/hr locum stops appearing for $55/hr searches. Risk: distance needs the pharmacy's location (owner's pharmacy vs search location — must be defined); rate needs a worker rate source (onboarding rates vs per-post rate — the model has neither for search). Legal/financial: none direct.
- **ALTERNATIVE A — Keep current logic:** existing client-side filters without distance, rate or server filtering. Scenario: an owner filters by role and state, then manually reads 200 cards to find anyone within 30 km. Trade-off: zero build, poor hiring use and the scale problem (Q16) stays.
- **ALTERNATIVE B — Role and date only:** less to build. Scenario: the board is a simple list; owners use text search for everything else. Trade-off: simplest, weakest — drops the skills/software filtering owners already have.
- **Other / defer:** add distance only (rate is negotiated per offer — GM-12); or server-side the existing filters first, distance/rate second. Defer: launch with current filters, add server-side distance after launch volume is measured.
- **Gap type:** decision gap (which filters, and where the rate lives) + code gap (server-side filtering — Q16).

### GM-18-Q05 (ex TB-Q05) — How should reviews and reliability show?

> **Merged 22 Nov: asked once, as GM15-42 in GM-15.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified):** one owner-to-worker star average with a count, on every card (`ratingAverage`/`ratingCount`, annotated in `views/explorer.py::get_queryset`). No separate attendance, reliability or responsiveness measure exists. Internal/roster ratings feed the same public average (SH-10 — GM-15).
- **RECOMMENDED (carried from #184, rec A):** separate: reviews and reliability, with counts — explained in one line each. Rationale: one score hides cancellations and penalises employment relationships; a worker with five stars but three no-shows looks identical to a reliable one. Severity: medium. Benefit: owners can trust the number; reliable newcomers are not tarred by one bad review. Risk: needs the reliability source defined (completed vs cancelled vs no-show — GM-15's incident ladder P10 is decided but not built); two numbers need one line of explanation each or owners will misread them. Legal: ratings are a reputational signal — accuracy and a dispute path matter (GM-15 Q35–Q37).
- **ALTERNATIVE A — Keep current logic:** one relationship star average and count, no separate reliability. Scenario: an owner picks a 5.0 (2) worker who cancelled twice; the count is small and the cancellations invisible. Trade-off: zero build, misleading signal.
- **ALTERNATIVE B — Reviews only, hide reliability entirely:** show stars; never show cancellation history. Scenario: same as A but explicit. Trade-off: protects workers from a harsh reliability metric, leaves owners blind.
- **Other / defer:** show the count prominently and the average only after a threshold (ties to Q06). Defer: launch with one score, split after the incident ladder is built.
- **Gap type:** decision gap (what the second signal is and where it comes from — owned jointly with GM-15).

### GM-18-Q06 (ex TB-Q06) — What does a brand-new worker show?
- **ACTUAL TODAY (verified):** "0.0 (0)" on both cards (web `TalentCardV2.tsx:106`, mobile `:101`; client defaults missing average/count to 0). No neutral "New" label, no completed-shift threshold. A new worker looks poorly rated.
- **RECOMMENDED (carried from #184, rec A):** "New" label until 5 completed shifts — no score shown yet. Rationale: zero stars makes an unrated worker look badly rated; a neutral state is honest. Severity: medium (fairness + marketplace liquidity — newcomers are the supply). Benefit: newcomers get enquiries; owners are not misled. Risk: the 5-shift threshold is a proposed local number (Airtasker's five-task completion-rate threshold informs it, does not prove it); "completed shift" needs a definition (timesheet approved? clock-out? GM-15 Q32–Q34). Legal: none direct; fairness/reputation.
- **ALTERNATIVE A — Keep current logic:** show zero stars before feedback and the score from the first rating. Scenario: a new pharmacist's card shows 0.0 (0) next to a 4.8 (12); owners skip her. Trade-off: zero build, newcomers are punished for being new.
- **ALTERNATIVE B — Show the score from the first rating, but label counts under 5 as "few reviews":** e.g. "4.5 (2 reviews)". Scenario: a worker with one 5-star review shows 5.0 (1) with a "few reviews" note. Trade-off: keeps early signal, warns about thin evidence; a single bad first review still sinks a newcomer.
- **Other / defer:** "New" until first rating only (no 5-shift threshold). Defer: keep 0.0 (0) until after launch — not recommended; it costs newcomer supply from day one.
- **Gap type:** decision gap (threshold + "completed" definition), then a small build.

### GM-18-Q07 (ex TB-Q07) — Is "Request booking" a firm offer or an enquiry? ★ CONFLICT-RESOLVED — see OFFER-01

> **Also covers (22 Nov):** GM-12-Q18 (GM-12), GM-24-Q14 (GM-24), GM25-C16 (GM-25). Asked once, here.
- **ACTUAL TODAY (verified):** a firm offer. It opens a prefilled dedicated-shift form (web + mobile); submitting creates firm offers with 48-hour expiry (`assignment.py::offer_dedicated_shift`); the worker accepts or declines; outside acceptance reserves pending payment. The worker **cannot ask questions first** — there is no enquiry or chat step in the flow.
- **RECOMMENDED — C (per consolidated queue OFFER-01, superseding #184's KEEP and GM-24's enquiry-first):** enquiry/chat first for public-board contacts, firm offer for favourites/members. Rationale: the conflict is real — GM-18's firm offer protects the owner, GM-24's enquiry-first protects the worker's identity and consent where no relationship exists. Splitting by relationship keeps the firm-offer mechanism where trust exists and adopts enquiry-first where identity is not yet established. Severity: high (it is the board's core transaction). Benefit: workers are not pressured by blind firm offers from strangers; owners keep the fast path for people they already know. Risk: two flows to build and explain; the boundary (who counts as a favourite/member) must be exact; the enquiry step needs a home (chat — GM-20 — or a lightweight message) or it becomes a dead end. **The GM-18 and GM-24 files' recommendations are superseded by this one; their evidence (48h flat expiry, one offer per slot, identity leak) stands.** Record the answer in both ledgers; do not ask Q07 and GM-24-Q14 separately.
- **ALTERNATIVE A — Keep firm offer everywhere (GM-18's original KEEP):** continue dedicated offers requiring worker acceptance; payment confirms outside bookings. Scenario: an owner sends a firm offer to a stranger's anonymous card; the worker declines without ever being able to ask about the shift. Trade-off: one flow, fastest; workers get take-it-or-leave-it offers from people they have never spoken to.
- **ALTERNATIVE B — Enquiry or chat first everywhere, then an offer (GM-24's original):** Scenario: every booking starts with a message; an owner who wants a regular locum waits for a reply before any offer exists. Trade-off: safest consent, slowest for trusted relationships; needs the chat/enquiry surface built before launch.
- **ALTERNATIVE C — Owner chooses each time (TB-Q07 option C):** two flows behind one button. Scenario: the owner picks "enquire" or "offer" per candidate. Trade-off: maximum flexibility, maximum UI and support burden; owners will pick inconsistently.
- **Other / defer:** offer only after an availability check passes (ties to Q17/Q19 — the post's dates may be stale). Defer: keep firm offer until the enquiry surface exists — acceptable only as a dated, explicit deferral, not a silent default.
- **Gap type:** decision gap — **decided in principle by OFFER-01 (C)**; the owner confirms C (or picks A/B) and the build follows. The defects around the firm offer (credential gap Q11, expiry Q22, permission drift Q15) are separate questions.

### GM-18-Q08 (ex TB-Q08) — What should the heart on a talent card do?

> **Also covers (22 Nov):** Q-14 (GM-05), GM25-C17 (GM-25). Asked once, here.
- **ACTUAL TODAY (verified):** it only likes/unlikes a post and changes its like count, on both apps. It creates no pharmacy-favourites membership, and talent cards have no "Invite to favourites" action. The saved-contacts API exists but has no UI (§1h).
- **RECOMMENDED (carried from #184, rec B):** keep the like; add "Invite to favourites" — sends a membership invite the worker must accept. Rationale: a like does not create a reusable booking relationship today, and the favourites tier (community audience, re-booking) is the mechanism the platform already has for trusted repeat work. Severity: medium. Benefit: one tap turns discovery into a re-bookable relationship; the worker consents (invite, not silent add). Risk: needs the invite/accept flow (GM-05 membership invites) and a home for the invite in the worker's UI; a rejected invite needs a graceful state. Legal: consent — silent addition to a favourites list is a disclosure/relationship the worker did not choose.
- **ALTERNATIVE A — Keep current logic:** post likes without a talent-card invitation to favourites. Scenario: an owner likes five locums and still has no way to re-book any of them except by finding the card again. Trade-off: zero build, discovery never converts to relationship.
- **ALTERNATIVE B — Heart adds to favourites, with consent:** the worker must accept (same invite, different button). Scenario: the heart becomes the favourite action; the like disappears. Trade-off: one gesture, but owners lose the lightweight reaction and workers may confuse a like with a commitment.
- **Other / defer:** wire the heart to the saved-contacts API (bookmark without membership) as a stopgap — cheap, private, no consent needed since it is the owner's own bookmark. Defer: keep like-only until membership invites are built.
- **Gap type:** decision gap (which action the card offers), then build. The saved-contacts API already exists — only the UI is missing.

### GM-18-Q09 (ex TB-Q09) — Can a pharmacy block a worker?

> **Merged 22 Nov: asked once, as GM15-43 in GM-15.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified):** not built. No block list exists in the traced flow — no model, no API, no UI. The only controls are declining per offer and moderator `hidden_at` (which hides the post from everyone, not from one pharmacy).
- **RECOMMENDED (carried from #184, rec A):** yes — private block. The worker stops seeing that pharmacy's shifts; never shown publicly. Rationale: pharmacies need a scoped control for a worker they will not re-book (reliability, fit) without a public accusation. Severity: medium. Benefit: owners stop wasting offers; workers are not publicly shamed. Risk: a block must be invisible to the worker's public standing (or it becomes a shadow rating); needs an unblock path and an audit trail (who blocked whom, when — admin-visible); a blocked worker who is also staff/favourite needs precedence rules. Legal: private, so low risk — but the reason must not be stored as a defamatory note; keep it to a flag + optional private note.
- **ALTERNATIVE A — Keep current logic (no blocking):** the pharmacy declines each time. Scenario: an owner declines the same worker's applications for six months. Trade-off: zero build, repeated friction and no memory.
- **ALTERNATIVE B — No blocking (explicit):** decline each time, by policy. Scenario: as A, but decided rather than accidental. Trade-off: same as A; only the intent differs.
- **Other / defer:** "hide this worker from my board" (client-side mute, no server state) as a stopgap. Defer: launch without blocking; revisit if owners ask — reasonable, since decline-per-offer works at small scale.
- **Gap type:** decision gap, then build.

### GM-18-Q10 (ex TB-Q10) — What is the rule for hiring a worker directly, off the platform?

> **Also covers (22 Nov):** GM26-Q20 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** not built. No direct-hire or off-platform rule exists in the traced flow — no conversion fee, no permanent-hire clause, no disclosure. A pharmacy that finds a worker on the board can hire them directly and the platform has no stated position.
- **RECOMMENDED (carried from #184, rec A):** permanent hire free; booked shifts stay — shifts found here are booked here. Rationale: a free permanent-hire rule is the simplest honest position (Nursa advertises no hire-away fee); it keeps the platform's revenue on shifts, where the fee is charged, and does not punish a good outcome (a permanent job). Severity: medium (commercial model). Benefit: owners are not afraid to use the board for full-time applications (Q07's full-time post kind exists precisely for this); workers are not trapped. Risk: revenue leakage if owners use the board as a free recruitment agency for permanent roles and never book a shift — needs the full-time-application flow to have its own terms (or a fee) if that becomes the dominant use. Legal: needs the terms to state it plainly; a conversion fee introduced later must not be retroactive (unfair-terms risk — GM-14/GM-26).
- **ALTERNATIVE A — Keep current logic (no rule):** unclear for both sides. Scenario: an owner hires a locum permanently after two shifts; nobody knows whether a fee is owed. Trade-off: zero build, disputes later.
- **ALTERNATIVE B — Conversion fee (like Upwork/Sidekicker):** a fee when a board contact becomes a permanent hire within a window. Scenario: owner pays, say, a fixed fee on permanent hire. Trade-off: protects platform revenue; needs the window, the amount, tracking (how do you know?) and enforcement — all unbuilt and hard to enforce.
- **Other / defer:** free permanent hire, but shifts booked through the platform in the first N days stay on-platform. Defer: publish the free-hire rule at launch; revisit a fee only with data on permanent-hire volume.
- **Gap type:** decision gap (commercial model), then terms wording. No code until the rule is chosen.

### GM-18-Q11 (ex LA-Q01 / ON-02) — Must a fresh AHPRA register check run before a booking?

> **Also covers (22 Nov):** GM26-Q35 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** no. A saved flag drives Verified. `require_public_ahpra` runs only for public (`PUBLIC_LEVEL`) shifts where the worker is not already a member; the re-check it queues is desktop-only, and the default source is ScrapingBee, so under the default config no fresh lookup runs before any booking. Dedicated offers (the whole talent-board booking path) never trigger the gate at all, because they are forced private. A registration cancelled after the last stored check is not caught.
- **RECOMMENDED (carried from #184, rec A):** before launch — a fresh check before registered-role bookings (turn on the desktop source plus a fresh check). Rationale: AHPRA calls its public register the authoritative source; a stale flag is the difference between a registered pharmacist and a suspended one standing in a pharmacy. Severity: **P0 (safety / legal)**. Benefit: the booking gate means what it says. Risk: the desktop verifier needs a staging trial (GM-02 ON-P03); a fresh lookup adds latency to booking and a failure mode (register unreachable — must fail closed or open? That is a sub-decision). Legal: patient safety; a booking made on a lapsed registration is the platform's worst outcome.
- **ALTERNATIVE A — Keep current logic:** saved flag + stored check; no fresh lookup. Scenario: a pharmacist suspended on Monday is booked from the board on Tuesday because the last check was in October. Trade-off: zero build, the gate is theatre.
- **ALTERNATIVE B — Soon after launch:** within the first month of live use. Scenario: launch with the stale-flag risk, fix while live. Trade-off: ships sooner; the risk window is exactly when the platform is least watched.
- **ALTERNATIVE C — Not needed:** accept the risk or drop the check. Scenario: the platform states it does not verify registration at booking. Trade-off: honest, but the "Verified" badge then means something else entirely — the badge would have to change too.
- **Other / defer:** fresh check only for first booking with a given pharmacy (not every booking). Defer: not recommended at P0.
- **Gap type:** decision gap (P0) + code gap (desktop source + fresh-check wiring). Owned jointly with GM-02 (ON-P03 is the same decision — do not ask twice; record once).

### GM-18-Q12 (ex ON-P03) — Which AHPRA lookup should run at launch?

> **Merged 22 Nov: asked once, as ON-P03 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified):** the default is ScrapingBee (`settings.py:643`), enforcement on (`:644`). The desktop verifier exists (`onboarding/verification/desktop.py`, `enqueue_check`) but is only used when `AHPRA_SOURCE == 'desktop'`; the re-check queue, the expiry-driven recheck and the lock-before-booking all assume the desktop path. The staging trial for the desktop verifier has not been evidenced in this trace.
- **RECOMMENDED (carried from GM-02, rec A):** desktop verifier, after a staging trial. Rationale: everything else in the gate machinery assumes enforcement that only fully works on desktop; ScrapingBee is a scrape, not the register. Severity: **P0**. Benefit: the Q11 fresh check is real. Risk: the desktop verifier's reliability, cost and latency are unevidenced here; a staging trial is a precondition, not a formality. Legal: as Q11.
- **ALTERNATIVE A — Keep current logic:** ScrapingBee default, one lookup at sign-up. Scenario: the gate reads stored checks from a scraper; a suspended registration is missed until someone re-checks. Trade-off: zero build, weakest assurance.
- **ALTERNATIVE B — Desktop verifier without a staging trial:** faster, riskier. Scenario: the verifier fails under load on launch week and bookings stall. Trade-off: no trial delay, no evidence it works.
- **Other / defer:** run both (desktop primary, ScrapingBee fallback) — needs a precedence rule for disagreement. Defer: decide with Q11; they are one decision, not two.
- **Gap type:** decision gap (P0), owned by GM-02 — GM-18 records the dependency, does not re-decide it.

### GM-18-Q13 (ex LA-Q12 / TB-01) — Fix the identity leak before launch?

> **Also covers (22 Nov):** GM01-Q16 (GM-01), GM-24-Q13 (GM-24), GM25-C12 (GM-25), GM26-Q04 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** the leak is live in code: authenticated feed/list/retrieve/`by_profile` return names and user IDs for anonymous posts; only the public feed redacts. Both apps consume the leaking API. This is a **code gap**, not a policy question — anonymous posting is currently bypassed by signing in.
- **RECOMMENDED (carried from #184, rec A):** before launch — server-side masking and a consent-based reveal (Q01/Q02). Rationale: the fix is the Q01/Q02 decision implemented; shipping the board with a known identity leak ships a false anonymity promise. Severity: **P0**. Benefit: the board can be marketed as anonymous without misleading workers. Risk: the fix touches the serializer the apps depend on — the booking flow needs the author user id today, so it must move to the reference code (Q02) in the same change, or booking breaks. Legal: privacy, as Q01.
- **ALTERNATIVE A — Keep current logic (no fix):** launch with the leak. Scenario: a worker's anonymous post is identified by a colleague on day one. Trade-off: zero build, reputational and privacy risk from the first post.
- **ALTERNATIVE B — Soon after launch:** within the first month. Scenario: as A, for a month. Trade-off: ships sooner; the leak is public by then.
- **ALTERNATIVE C — Not needed:** accept the leak and drop the anonymity claim (rename "anonymous" to something honest). Scenario: the board is openly identified; workers who want privacy do not post. Trade-off: honest, but it guts the board's value for workers with a current employer.
- **Gap type:** **code gap with a timing decision** — the fix itself needs no owner choice (mask server-side), but *when* it ships is the owner's call. Recommended: before the first real booking.

### GM-18-Q14 (ex LA-Q13 / TB-03) — Hidden, stale and lapsed-credential posts: are they really unreadable?

> **Also covers (22 Nov):** GM01-Q17 (GM-01), GM26-Q05 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified, split):** the **bypass half is FIXED** — `get_queryset` now filters through `_visible_posts` on all non-write actions, so moderated (`hidden_at`) and past-date posts are excluded from feed, list and detail. The **lapse half is still missing** — `is_talent_board_visible` checks nothing about Verified/AHPRA status, so a worker whose registration lapses or whose Verified is revoked keeps a visible post. The viewer gate checks the viewer, not the author.
- **RECOMMENDED (carried from #184, rec A):** before launch — enforce visibility **and** current eligibility consistently (hide on lapse/revocation, re-show on re-verification). Rationale: hidden or newly ineligible candidates remain bookable today; a lapsed pharmacist on the board is the same failure as Q11, one step earlier. Severity: high. Benefit: the board only shows people who can actually be booked. Risk: needs a re-check trigger (on what event does a post hide — a nightly job? an event on revocation? GM-02 has no scheduled re-scan) and a re-show path (a worker who re-verifies must not have to re-post). Legal: safety, as Q11.
- **ALTERNATIVE A — Keep current logic:** bypass fixed; no lapse re-check. Scenario: a pharmacist's AHPRA lapses in December; her post stays up and owners keep offering. Trade-off: half the fix is already in; the remaining half is the dangerous one.
- **ALTERNATIVE B — Soon after launch:** within the first month. Scenario: as A, for a month. Trade-off: ships sooner; lapsed posts are live meanwhile.
- **ALTERNATIVE C — Not needed:** accept that posts outlive eligibility and rely on the booking-time gate (Q11). Scenario: the board shows ineligible people, but booking blocks them. Trade-off: only works if Q11's gate is real — today it is not (dedicated offers bypass it), so this option depends on Q11 being fixed first.
- **Gap type:** **code gap, half fixed** — the remaining half needs a trigger decision (job vs event) from the owner, then build.

### GM-18-Q15 (ex LA-Q15 / TB-07) — One hiring-role policy: who may request a booking?

> **Also covers (22 Nov):** Q-17 (GM-05), GM-24-Q15 (GM-24), GM25-C14 (GM-25), GM26-Q29 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** three policies, not one. **Web/Next:** fixed 9-role allow-list + admin (`OWNER`, `PHARMACY_ADMIN`, `PHARMACY_OWNER`, `ORG_ADMIN`, `ORG_OWNER`, `ORG_STAFF`, `CHIEF_ADMIN`, `REGION_ADMIN`, `ORGANIZATION`). **Expo:** any role except worker roles (`EXPLORER`, `PHARMACIST`, `OTHER_STAFF`), plus a `canRequestBookingOverride` the owner/org wrappers set to true. **`PHARMACY_MANAGER` can book on mobile and cannot on web.** The backend does not settle it — no hiring-role gate was found in the traced backend slice; whether the shift-creation view enforces one is UNKNOWN. GM-05 Q-17 (talent-board booking-permission parity) is NOT VERIFIED and must wait for this decision, not run in parallel.
- **RECOMMENDED (carried from #184, rec A):** before launch — set **one backend hiring-role policy** and mirror it in both clients. Rationale: a permission that differs by client is not a permission; a manager who can book on their phone but not their laptop will find the phone path, and the backend cannot stop them. Severity: high. Benefit: one rule, enforced where it cannot be bypassed. Risk: the policy itself needs the PHARMACY_MANAGER call (below) and a home for the rule (shared-core, so all three clients read it — the drift is partly because the rule lives in each client today).
- **The PHARMACY_MANAGER call (owner must make it):** (i) managers can hire — add `PHARMACY_MANAGER` to the allow-list on web/Next, keep Expo as-is; (ii) managers cannot hire — remove the any-non-worker rule on Expo, add an explicit list. There is no third option that keeps both clients as they are.
- **ALTERNATIVE A — Keep current logic:** web 9-role list; mobile any-non-worker. Scenario: a pharmacy manager books locums from the Expo app and is blocked on the web board for the same candidate. Trade-off: zero build, a live inconsistency that will be discovered by a user, not by a test.
- **ALTERNATIVE B — Backend only, clients unchanged:** enforce the policy server-side on dedicated-shift creation; leave the buttons as they are. Scenario: a manager taps "Request booking" on mobile, fills the form, and is refused at submit. Trade-off: secure, but a confusing user experience — the button promises what the server refuses.
- **ALTERNATIVE C — Soon after launch:** within the first month. Scenario: as A, for a month. Trade-off: ships sooner; the drift is live meanwhile.
- **Other / defer:** put the rule in shared-core (`resolveTalentBookingRole` already lives there — the role list should too) and have all three clients import it. Defer: not recommended — this is a permission, and permissions should not ship inconsistent.
- **Cases:** normal — owner books; edge — admin user (covered by `isAdminUser` on web; Expo override covers owner/org wrappers, but what about an admin opening the board elsewhere?); a user with two roles (owner + pharmacist — which wins?); wrong tenant — a manager of pharmacy A booking for pharmacy B (no tenant check traced in the booking flow).
- **Gap type:** decision gap (the policy + the PHARMACY_MANAGER call) + code gap (backend enforcement + dedupe the rule into shared-core). **Check against #257:** it touches Expo post-shift screens and `shared-core/src/domains/shifts/audience.ts` — the role rule may move there.

### GM-18-Q16 (ex LA-Q14 / TB-04) — The board downloads every post: fix before launch?

> **Also covers (22 Nov):** GM25-C13 (GM-25), GM26-Q30 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** yes, it downloads everything. Both apps call `loadAllTalentPages` (`page_size: 200`) and filter in the app; the backend has no filter parameters, and `_visible_posts` loops the whole table in Python before pagination. No server-side distance or rate filter exists. This breaks at a few thousand posts.
- **RECOMMENDED (carried from #184, rec B):** soon after launch — within the first month of live use — **only** for a deliberately small, monitored board; set a measured migration trigger (e.g. post count or p95 feed latency) now. Rationale: at launch volume the full download works; the fix (server-side filtering + pagination discipline) is real work that should not block the first bookings, but it must have a trigger, or "soon" becomes "never". Severity: medium (scale, not correctness). Benefit: the board survives growth; search becomes server-side (Q04). Risk: the trigger must be monitored — nobody watches it, it will be missed; the Python-loop visibility check must move into the query or the server filter will still scan the table.
- **ALTERNATIVE A — Keep current logic:** full download, client filtering, no trigger. Scenario: the board grows to 3,000 posts; every open downloads all of them; the feed slows and mobile data usage spikes. Trade-off: zero build, a known cliff.
- **ALTERNATIVE B — Before launch:** server-side filters + paged feed from day one. Scenario: launch is later, but the board is built to scale. Trade-off: delays launch for a problem launch volume does not have.
- **ALTERNATIVE C — Not needed:** accept the cliff. Scenario: the board is expected to stay small (a few hundred posts). Trade-off: only honest if the volume assumption is written down and owned.
- **Gap type:** **code gap with a timing decision** — the fix needs no owner choice on the principle, but *when* and *at what trigger* are the owner's calls.

### GM-18-Q17 (ex LA-Q16 / AV-01) — Should the talent-post availability snapshot sync with the calendar?

> **Merged 22 Nov: asked once, as GM-19-Q12 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified):** it never syncs. Both apps copy the live calendar once, at compose time, into the post's `availability_days`; later calendar edits never update the post. The two stores have no link in `models.py`. The matching engine reads the live calendar, so the board and the inbox can disagree about the same worker.
- **RECOMMENDED (carried from #184, rec A):** before launch — fix it **or** clearly eliminate the copied calendar. Rationale: a post advertising dates the worker removed is misleading — an owner offers, the worker declines, trust in the board drops with every stale post. Severity: high (the board's core promise is "this person is free then"). Benefit: what the owner sees is what the worker means. Risk: the fix has three shapes (below) and each has a cost; auto-sync needs a trigger (on every calendar edit — fan-out to posts) and a test burden.
- **ALTERNATIVE A — Keep current logic:** one-time copy; later edits do not update the post. Scenario: a worker changes Mondays to Tuesdays; her post still says Mondays for months; owners offer Mondays and are declined. Trade-off: zero build, stale posts.
- **ALTERNATIVE B — Auto-sync:** editing the calendar updates every live post. Scenario: the post always matches the calendar. Trade-off: most correct, most build; a worker who wants the post to say something different from the calendar loses that freedom.
- **ALTERNATIVE C — Post reads the live calendar instead of a snapshot (ties to Q24):** no copy at all; the card renders the worker's current availability (subject to the Q24 opt-in). Scenario: the card is always fresh; the snapshot model disappears. Trade-off: cleanest long-term, biggest change; needs the Q24 visibility decision first.
- **Other / defer:** show a "last synced" stamp + a one-tap "update my post" action (GM-19 Q12's middle option) — the worker stays in control and staleness is visible. Defer: soon after launch, with the stamp as the interim honesty measure.
- **Gap type:** decision gap (which of B/C/stamp) — the owner must choose the model first; the code follows.

### GM-18-Q18 (ex LA-Q17 / AV-04) — Match emails: escalated shifts and unverified workers?

> **Merged 22 Nov: asked once, as GM-11-Q05 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified, adopted GM-19):** match emails fire at posting time only, for shifts posted straight to PLATFORM, to users with `notify_new_shifts=True` who pass the role/travel/any-overlap checks. **Escalated shifts never re-announce** (no announce call in `escalation.py`, no beat entry for `auto_escalate_due_shifts`), so a shift that widens its audience never alerts the newly eligible workers. **Recipients are not filtered by Verified/AHPRA** — unverified workers are alerted about shifts they are then blocked from applying to.
- **RECOMMENDED (carried from #184, rec A):** before launch — fix both halves (re-announce on escalation; filter recipients by Verified/AHPRA). Rationale: escalated vacancies miss outreach while unverified workers receive alerts they cannot act on — the alert audience is the opposite of the eligible audience. Severity: high (it decides who hears about every shift). Benefit: every alert is actionable; escalated shifts actually reach people. Risk: re-announce needs a dedupe rule (who was already told at posting time must not be told twice); the Verified filter needs the same "current at send time" semantics as Q14, or it reintroduces the stale-flag problem.
- **ALTERNATIVE A — Keep current logic:** posting-time only, no Verified filter. Scenario: a shift escalates to PLATFORM on Friday; the available workers who would have taken it are never told. Trade-off: zero build, missed fills and noisy alerts.
- **ALTERNATIVE B — Fix the Verified filter only:** escalated shifts still miss outreach. Scenario: alerts are actionable but thin for escalated shifts. Trade-off: half the fix; the escalation half stays broken.
- **ALTERNATIVE C — Fix re-announce only:** unverified workers keep getting alerts they cannot act on. Scenario: wider reach, same noise. Trade-off: half the fix, other half.
- **Other / defer:** soon after launch for the re-announce half (escalation is GM-11 territory — the notify-each-tier decision SH-06 belongs there too). Defer: the Verified filter should not wait — it is a one-condition fix.
- **Gap type:** **code gap** (both halves are build, no owner choice on the principle) — except the dedupe rule, which is a small owner decision. Owned jointly with GM-11 (escalation) and GM-19.

### GM-18-Q19 (ex LA-Q18 / AV-05) — Availability input: add server-side validation?

> **Merged 22 Nov: asked once, as GM-19-Q10 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified, adopted GM-19):** the API accepts anything. The serializer has no `validate()` at all: end-before-start, past dates, weekdays outside 0–6, recurring rows with no days, exact duplicates are all accepted. Both apps do some client-side checks; direct API calls bypass them. No validation tests exist.
- **RECOMMENDED (carried from #184, rec A):** before launch — add server-side semantic validation (start < end unless all-day; weekdays 0–6; recurring rows must list days; date not in the past for non-recurring rows; reject exact duplicates). Rationale: client checks do not protect the API; malformed availability corrupts matching (a 17:00–09:00 row matches — or fails to match — unpredictably). Severity: medium. Benefit: matching input is trustworthy; the Q03/Q17/Q24 decisions all assume sane data. Risk: low — the rules are uncontroversial except the past-date rule (below). Legal/financial: none direct.
- **ALTERNATIVE A — Keep current logic:** no validation. Scenario: a worker saves 17:00–09:00 by mistake and is matched (or not matched) unpredictably. Trade-off: zero build, garbage in.
- **ALTERNATIVE B — Validate as above, but allow past dates with a warning:** the owner must confirm the one sub-decision — can a worker backdate availability for record-keeping? Scenario: a worker logs last week's availability for the record; the API warns but accepts. Trade-off: keeps record-keeping, keeps the warning honest.
- **Other / defer:** validate + dedupe only; leave past dates to the client. Defer: not recommended — this is correctness work, not a new policy.
- **Gap type:** **code gap**, with one owner sub-decision (past dates).

### GM-18-Q20 (ex LA-Q06 / SH-02) — Legacy cancellation charging

> **Merged 22 Nov: asked once, as GM13-Q12 in GM-13.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** The route uses the old 10%/20% calculation. Its live flag defaults off (`pr257:backend/billing/shift_payments.py:211`, `pr257:backend/core/settings.py:679`).
- **Status:** Engineering: see BL-04. Preserve the route and client export behind the current flag. Ask launch scope at GM15-01.

### GM-18-Q21 (ex LA-Q07 / SH-03) — Subscriber discount and hard-coded Stripe price IDs?

> **Merged 22 Nov: asked once, as GM16-Q02 in GM-16.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified, split):** the **discount half is FIXED** — `is_subscriber` now selects the subscriber price IDs (`shift_payments.py:110-132`): locum $15 vs $30, PT-FT $40 vs $80; tests exist (`test_pr201_b01.py`). The **price-ID half is still open** — the four IDs are hard-coded in `shift_payments.py:116-130` and in `checkout_prices.py` (ID → cents map), with no env selection, so test and live cannot differ. The fee is per offer, whatever the hours or days.
- **RECOMMENDED (carried from #184, rec A):** before launch — move price IDs to environment/config per Stripe mode (test vs live) so environments select independent prices. Rationale: the discount fix proves the code path works; the remaining risk is charging live prices in test (or test prices live) because the IDs are baked in. Severity: medium (money correctness). Benefit: test checkouts cannot touch live prices; price changes do not need a code deploy. Risk: small — config change + a test in each mode; the per-offer fee shape (flat per offer regardless of hours/days) is a separate commercial question, not this fix.
- **ALTERNATIVE A — Keep current logic:** hard-coded IDs; discount applied. Scenario: a test checkout creates a live $30 charge because the ID is the live one. Trade-off: zero build, environment risk on every test run.
- **ALTERNATIVE B — Soon after launch:** within the first month. Scenario: as A, for a month; test checkouts are avoided meanwhile. Trade-off: ships sooner; the risk is managed by process, not by code.
- **ALTERNATIVE C — Not needed:** accept hard-coded IDs permanently. Scenario: the same four IDs forever; price changes need a deploy. Trade-off: only honest if test/live separation is genuinely not needed — it is needed the first time anyone tests checkout.
- **Gap type:** **code gap, half fixed** — the remaining half is build, no owner choice on the principle.

### GM-18-Q22 (ex LA-Q09 / SH-07) — Offers can outlive the shift: cap the expiry at shift start?

> **Merged 22 Nov: asked once, as GM-12-Q10 in GM-12.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified):** pending offers get a flat 48h expiry, not capped at shift start (`assignment.py:22`, `:259`), applied lazily on listing (`:69`). An urgent offer made 2 hours before start stays "pending" after the shift has begun; both apps can retain pending offers after start. Re-offering refreshes the terms but **does not** extend the 48h deadline.
- **RECOMMENDED (carried from #184, rec A):** before launch — cap the response deadline at shift start (as D02 does for payment). Rationale: an offer that can be accepted after its shift begins is not an offer, it is a trap — for the worker (accepting work that has started) and the owner (thinking cover is coming). Severity: high. Benefit: no post-start acceptances; the 48h clock and the shift clock agree. Risk: urgent offers get very short windows (an offer made 2h before start expires in 2h) — that is the point, but owners must see the deadline clearly, and the "refresh does not extend" behaviour must be explained or the deadline will confuse. Legal/financial: none direct; indirectly, fewer disputed acceptances.
- **ALTERNATIVE A — Keep current logic:** flat 48h, lazy expiry, no start cap. Scenario: a worker accepts a 9am shift at 10am; the roster now has a worker for a shift that started an hour ago. Trade-off: zero build, post-start acceptances.
- **ALTERNATIVE B — Soon after launch:** within the first month. Scenario: as A, for a month. Trade-off: ships sooner; urgent offers are the most likely to be affected, and they are the first ones that will occur.
- **ALTERNATIVE C — Not needed:** leave the flat 48h. Scenario: the lazy expiry is relied on to clean up. Trade-off: only honest if acceptance is also blocked after start — it is not, in the traced slice (acceptance checks the same deadline).
- **Other / defer:** cap at start **and** show a countdown on the offer (both apps) — the cap without the display will generate support tickets. Defer: not recommended — this is a correctness fix on the board's core transaction.
- **Gap type:** **code gap** — the cap needs no owner choice on the principle (D02 already decided the shape for payment).

### GM-18-Q23 (ex AV-Q06) — When should a talent post stop showing?

> **Merged 22 Nov: asked once, as GM-19-Q06 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified):** dated posts hide after their last listed date; undated and full-time posts stay visible forever unless a moderator hides them. The read-path bypass is fixed (Q14), but there is no inactivity cutoff, no nudge, no "last updated" display. A full-time seeker from 2025 still tops the board in 2027.
- **RECOMMENDED (carried from #184, rec A):** hide after 30 days without update, nudge the worker first. Rationale: last-date filtering leaves undated/full-time posts stale forever; a nudge + one-tap renew keeps genuinely available workers visible while the board stops filling with ghosts. Severity: medium. Benefit: owners stop messaging people who left the industry; the board stays trustworthy. Risk: a genuinely available full-time seeker is hidden for not tapping a button — the nudge and the renew path must work, and the 30-day number is a proposed local default, not a competitor standard. Legal/financial: none direct.
- **ALTERNATIVE A — Keep current logic:** hide dated posts after last date; retain undated and full-time posts. Scenario: as today — ghosts accumulate. Trade-off: zero build, stale board.
- **ALTERNATIVE B — Hide once the last listed date passes (partly true today):** i.e. require dates on every post. Scenario: undated posts are forced to add dates or be hidden. Trade-off: kills the full-time-application use case unless that kind is exempted.
- **ALTERNATIVE C — Never:** board fills with ghosts (explicitly the cost). Scenario: the board is a historical record, not a live market. Trade-off: zero build, zero trust.
- **Other / defer:** 60/90 days instead of 30; hide only from employer search, keep visible to the author. Defer: keep current logic until after launch, accept stale posts — reasonable at small volume, but set the cutoff before volume grows.
- **Gap type:** decision gap (inactivity window + nudge) — the code gap (TB-03 bypass) is fixed.

### GM-18-Q24 (ex AV-Q04) — Who can see a worker's availability?

> **Merged 22 Nov: asked once, as GM-19-Q04 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified):** only the worker can read/edit raw availability through the API (own-rows queryset). Pharmacies see at most what was copied into a talent post (`availability_days` snapshot), not a live calendar. No visibility/opt-in field exists on `UserAvailability`. The authenticated talent list exposes the post author's identity unmasked (Q01).
- **RECOMMENDED (carried from #184, rec B):** explicit worker opt-in for accepted staff / favourite pharmacies. Rationale: a private calendar (with free-text `notes`) should not be disclosed by relationship alone; OAIC APP 6 supports consent-based disclosure. Severity: medium (privacy). Benefit: owners can invite the right people directly; workers stay in control. Risk: opt-in uptake may be low; needs per-pharmacy scoping UI; a worker who opts in then opts out leaves old copies in talent posts (Q17). Legal: privacy — availability + notes are personal information.
- **ALTERNATIVE A — Keep current logic:** raw calendar private; posts hold copied dates. Scenario: an owner who wants a regular Monday locum cannot see she is free Mondays unless she posted on the talent board. Trade-off: safest privacy, weakest hiring use.
- **ALTERNATIVE B — Opt-in talent card:** worker opts in to show availability on the public / employer-visible talent card. Scenario: a locum seeking work advertises "Mondays and Wednesdays, Gold Coast" to all employers. Trade-off: widest reach, widest disclosure — needs the anonymous-post rules (Q01–Q03) to agree.
- **Other / defer:** show availability only after a booking request / chat reply (ties to Q02 reveal timing). Defer: keep private until after launch.
- **Gap type:** decision gap (privacy + opt-in scope), then build. Owned jointly with GM-19 (Q04 there).

### GM-18-Q25 (ex AV-Q09) — Should workers set a max distance and minimum rate for alerts?

> **Merged 22 Nov: asked once, as GM-19-Q09 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified, split):** **distance IS enforced in alerts** — `_user_can_travel_to_shift` (open-to-travel requires the pharmacy state in `travel_states`; otherwise haversine distance ≤ `coverage_radius_km`; missing coords/radius → silently no match). Both screens expose travel/radius (web default 30 km; mobile 5–1000 km + map preview). **Minimum rate is NOT checked** — `announce_availability_matches` has no rate comparison; `UserAvailability` has no rate field. Talent-post radius is a separate snapshot from the matching prefs. Board search has neither filter (Q04).
- **RECOMMENDED (carried from #184, rec A):** yes — alerts respect both max distance and a minimum rate; search can still widen deliberately. Rationale: a worker 90 minutes away, or below their minimum rate, should not be alerted. Severity: medium. Benefit: fewer irrelevant alerts; owners reach workers who will actually accept. Risk: a minimum-rate field needs a source of truth (onboarding rates vs per-availability rate — the model has neither); too-tight filters thin the audience for hard-to-fill shifts.
- **ALTERNATIVE A — Keep current logic:** respect existing distance/travel preferences without filtering alerts by minimum rate. Scenario: a $70/hr locum is alerted about a $55/hr shift and declines. Trade-off: zero build, continued mismatched alerts.
- **ALTERNATIVE B — Distance only, no rate:** rate is negotiated per offer (GM-12). Scenario: alerts are geographically correct and rate-blind. Trade-off: keeps negotiation flexible; keeps the $70-vs-$55 noise.
- **Other / defer:** rate only for PLATFORM-tier alerts. Defer: add rate filtering after launch data.
- **Gap type:** decision gap for the **rate half only** (whether rate filters alerts; where the minimum rate lives); the distance half is **built and verified** — no decision needed there. Owned jointly with GM-19 (Q09 there).

### GM-18-Q26 (ex LA-Q10 / SH-09 + launch gate) — Do accepted terms disclose the cancellation policy, and what must be fixed before the first real booking?

> **Merged 22 Nov: asked once, as GM15-47 in GM-15.** Answer it there; this copy stays for its own evidence and is not asked again.
- **ACTUAL TODAY (verified, adopted GM-15):** the accepted-terms snapshot has a terms fingerprint, but **no cancellation band table, no platform terms version, and no pharmacy-side acceptance**. A worker accepting a dedicated offer from the board is not shown the cancellation charges that could later apply — and the legacy 10%/20% route (Q20) is exactly the charge that would be levied. The launch-gate items that are **not** re-validated (LA-Q02–Q05: mobile profile data loss, mobile dead-ends, profile % vs Verified, payment readiness at accept) are still open as written in #184 and must not be asked — or launched on — until re-validated.
- **RECOMMENDED (carried from #184, rec A):** before launch — record versioned, pre-contract acceptance by **both** sides (cancellation matrix + platform terms version + pharmacy acceptance) and obtain Australian legal review of every charge and remedy (GM-15 LA-R02 / SH-16). Rationale: disclosure alone does not make a one-sided or disproportionate term fair, and since November 2023 proposing, using or relying on unfair standard-form terms can attract major penalties. Severity: **P0 (legal)**. Benefit: charges, if ever levied, rest on a disclosed, reviewed, accepted record. Risk: legal review takes time and may force the fee table (P09, decided but unimplemented) to change; the snapshot change touches the engagement record both apps use. Legal: unfair-contract-terms regime; the agreed P09 table is decided but code charges legacy 10/20 (GM-15 carried-decision conflict — the table and the code disagree today).
- **ALTERNATIVE A — Keep current logic:** snapshot as it is (fingerprint, no table/version/pharmacy acceptance). Scenario: a worker accepts, cancels, and is charged under a table they never saw. Trade-off: zero build, the dispute writes itself.
- **ALTERNATIVE B — Disclosure is enough:** launch after showing the table, without legal review. Scenario: the table is visible, the terms are still unreviewed. Trade-off: cheaper; visibility does not cure unfairness.
- **ALTERNATIVE C — Never charge:** use non-money reliability controls only (GM-15's incident ladder P10 — decided but not built). Scenario: cancellations are managed by warnings/suspension, never money. Trade-off: simplest legally; gives up the fee lever entirely.
- **Other / defer:** the launch gate as a whole — the P0 items in this trace (Q01–Q03 identity, Q11/Q12 AHPRA, Q13 leak fix, Q20 penalty route, this question) must be fixed before the first real booking; the rest (Q15 roles, Q16 scale, Q18 alerts, Q22 expiry cap, Q19 validation) are "before launch" in #184's terms but separable by the owner's risk appetite. LA-Q02–Q05 must be re-validated before they can even be asked. Defer: none of the P0 items should be deferred past the first real booking.
- **Gap type:** **code gap** (snapshot fields + legal review) + **launch-gate decision** (what ships before the first real booking). Owned jointly with GM-15 (terms/disclosure) and GM-17 (billing) — do not re-decide the fee table here.

## 4. SINGLE FIRST DECISION QUESTION (ask the owner first)

**GM-18-Q01 — Who can see the talent board?**

Plain English: today, anyone who signs in can see everyone. A locum posts "open to full-time work" thinking only pharmacies will see it — but her current employer, a competing locum, or anyone who signs up as a newcomer can read her full name, her suburb, her skills and her availability, straight from the API the apps use. The "anonymous" switch only hides her from people who are not signed in at all. So the board's core privacy promise is false, and every other question — when identity is revealed, what stays hidden, who can book — hangs off this one, because they all assume anonymity works.

- **Option KEEP — Keep current logic:** all accounts see identities; public sees masked cards. *Scenario:* a locum's current employer signs in and reads her "open to full-time" post with her full name on it. *Trade-off:* no build; the anonymity promise stays false.
- **Option A — Employers and own post only:** owners, managers, organisations; authors see their own post. *Scenario:* a pharmacy finds a locum, but nobody browsing without an employer account can discover the board. *Trade-off:* strongest privacy, weakest discovery.
- **Option B — RECOMMENDED — A plus public masked, server-side enforced:** authenticated discovery restricted to authorised hiring roles + each author; public discovery only with masking enforced on the server. *Scenario:* an owner sees full cards; a competing worker sees nothing; a logged-out visitor sees masked cards that never reveal identity. *Benefit:* anonymous posting becomes real. *Risk:* smaller audience per post; needs a server-side role gate and a "my post" exception.
- **Option Other (describe) / Defer:** e.g. employers + own post + public masked but enforced client-side only (not a real fix — the API is the leak); or defer until after launch — **not recommended at P0**.
- **Decide jointly with GM-20 (AUDIENCE-01):** the contact rule is the same decision as the visibility rule; record the answer in both ledgers.

*Ask this first because Q02 (reveal timing) and Q03 (what stays hidden) cannot be answered until the audience is known, Q07's enquiry-vs-offer split depends on whether strangers can see the board, and Q15's hiring-role policy is the same role list. No caveat remains on the evidence: the leak is verified at head on both apps and the API.*

## 5. Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; do NOT present as decided)

- **CG-1 — Server-side identity masking missing (Q01–Q03, Q13).** Authenticated reads use the unmasked serializer; only the public feed redacts, and only when anonymous. Verified at head (`serializers/explorer.py`, `views/explorer.py`).
- **CG-2 — No pitch-text scrubbing (Q03).** Write `validate()` has no scan; both PitchDialogs carry only a warning. A phone number in a pitch is published verbatim.
- **CG-3 — No lapsed-credential re-check on post visibility (Q14).** `is_talent_board_visible` checks dates and moderation only. A lapsed pharmacist's post stays up.
- **CG-4 — No server availability validation, AV-05 (Q19).** Bare serializer, no `validate()`; no validation tests. (GM-19 verified.)
- **CG-5 — Talent-post availability snapshot never syncs, AV-01 (Q17).** One-time copy at compose on both clients; no link in `models.py`.
- **CG-6 — Match emails miss escalated shifts and reach unverified workers, AV-04 (Q18).** Posting-time only, PLATFORM-only, no re-announce, no Verified filter. (GM-19 verified.)
- **CG-7 — Booked time and approved leave do not suppress match alerts (GM-19 Q05; Q25 context).** No assignment/leave check in `announce_availability_matches`. (GM-19 verified.)
- **CG-8 — Legacy cancellation charging (Q20, SH-02).** Engineering: see BL-04 for the correction behind the existing flag.
- **CG-9 — Hard-coded Stripe price IDs (Q21, SH-03 second half).** Discount fixed; IDs still hard-coded in `shift_payments.py` and `checkout_prices.py` — test/live cannot differ.
- **CG-10 — Offer expiry not capped at shift start; refresh does not extend it (Q22, SH-07).** Flat 48h, lazy expiry.
- **CG-11 — Accepted terms lack cancellation table / version / pharmacy acceptance (Q26, SH-09).** Fingerprint exists; the disclosure fields do not. (GM-15 verified.)
- **CG-12 — Full-download board, no server filters (Q16, TB-04).** `loadAllTalentPages` (`page_size: 200`) on web + mobile; Python-loop visibility check pre-pagination.
- **CG-13 — Booking-role drift + duplicate `useTalentFeed` + unthrottled `add_view` (Q15, TB-07).** Web 9-role list vs Expo any-non-worker + override; two mobile `useTalentFeed` copies (3,041 vs 2,948 bytes — already drifted); `add_view` counts every authenticated call with no limit (no screen calls it today, so counts likely sit at 0 — the endpoint is still open).
- **CG-14 — Saved-contacts API with no UI (Q08 context).** API + shared-core functions exist; no screen calls them (code search, default-branch index).
- **CG-15 — Next migrated TalentBoard copy status unknown (Q01–Q16, all).** 515 diff lines vs Vite; served-or-dead UNKNOWN (GM-25). Next also has no availability surface (GM-19).
- **CG-16 — Dedicated/counter-offer/manager offers bypass verification (Q11).** Adopted from GM-02 senior review; the dedicated path never triggers `require_public_ahpra`.
- **CG-17 — Missing coords/radius silently excludes a worker from matching (Q25 context).** GM-19 verified: `_user_can_travel_to_shift` returns no-match; the worker is never told they are invisible.
- ~~CG (TB-03 — visibility rule bypass on list/retrieve)~~ — **FIXED at head.** `get_queryset` filters through `_visible_posts` for all non-write actions. Removed from the gap list.
- ~~CG (SH-03 first half — subscriber discount not applied)~~ — **FIXED at head.** `is_subscriber` now selects $15/$40. Removed from the gap list.

### Decision gaps (owner must choose first)

- DG-1 — Board audience + reveal timing + hidden set (Q01–Q03) ★ P0, first.
- DG-2 — Filters: distance/rate, server-side (Q04) + scale timing (Q16).
- DG-3 — Reviews vs reliability, and the newcomer display (Q05, Q06).
- DG-4 — Firm offer vs enquiry, by relationship (Q07 — **OFFER-01 C decided in principle in the consolidated queue**; owner confirms).
- DG-5 — Heart vs Invite-to-favourites (Q08); block list (Q09); direct-hire rule (Q10).
- DG-6 — AHPRA fresh check + lookup source (Q11, Q12) ★ P0 — owned jointly with GM-02 (ON-P03); do not ask twice.
- DG-7 — Leak-fix timing (Q13) ★ P0; lapse re-check trigger (Q14); hiring-role policy + PHARMACY_MANAGER call (Q15).
- DG-8 — Availability snapshot model: sync / live-read / stamp (Q17); who sees availability, opt-in scope (Q24); minimum-rate alert filter + rate source (Q25, rate half only).
- DG-9 — Post inactivity window + nudge (Q23); urgent-alert consent is KEEP (GM-19 Q08 — no decision needed).
- DG-10 — Cancellation disclosure + legal review + launch gate (Q26) ★ P0 — owned jointly with GM-15/GM-17.
- DG-11 — Price-ID config timing (Q21) and offer-expiry cap (Q22). Cancellation charging follows BL-04 and GM15-01.

## 6. Documentation matrix & implementation backlog

### Per-question source links (verified @ PR #249 head 97c4543e unless marked ❓/adopted)

| Question | Status | Source |
|---|---|---|
| GM-18-Q01 (TB-Q01) | ✅ STILL VALID | `views/explorer.py::get_permissions`, `serializers/explorer.py` |
| GM-18-Q02 (TB-Q02) | ✅ STILL VALID | Same — no reveal point in any read path |
| GM-18-Q03 (TB-Q03) | ✅ STILL VALID | Write `validate()` (no scrub); both PitchDialog warnings |
| GM-18-Q04 (TB-Q04) | ✅ STILL VALID | `presentation.ts::filterTalentCandidates` (no distance/rate) |
| GM-18-Q05 (TB-Q05) | ✅ STILL VALID | `views/explorer.py::get_queryset` rating annotation |
| GM-18-Q06 (TB-Q06) | ✅ STILL VALID | `TalentCardV2.tsx:106` web / `:101` mobile |
| GM-18-Q07 (TB-Q07) | ✅ STILL VALID; rec → C (OFFER-01) | `posting.py::protect_direct_booking`, `assignment.py:259` |
| GM-18-Q08 (TB-Q08) | ✅ STILL VALID | Like/unlike only; no invite action on any card |
| GM-18-Q09 (TB-Q09) | ✅ STILL VALID | No block model/API/UI in traced flow |
| GM-18-Q10 (TB-Q10) | ✅ STILL VALID | No direct-hire rule in traced flow |
| GM-18-Q11 (LA-Q01) | ✅ STILL VALID | `state.py:171`, `foundation_services.py:60`, `interest.py:21,88` |
| GM-18-Q12 (ON-P03) | ✅ STILL VALID | `settings.py:643-644`, `state.py:197` |
| GM-18-Q13 (LA-Q12) | ✅ STILL VALID | Unmasked serializer on authenticated reads |
| GM-18-Q14 (LA-Q13) | 🔄 PARTIAL (bypass fixed) | `views/explorer.py::get_queryset`; `models.py::is_talent_board_visible` |
| GM-18-Q15 (LA-Q15) | ✅ STILL VALID | Web `:313` 9-role list vs mobile `:313` any-non-worker + override |
| GM-18-Q16 (LA-Q14) | ✅ STILL VALID | `useTalentFeed` (web + mobile), `page_size: 200` |
| GM-18-Q17 (LA-Q16) | ✅ STILL VALID | Pitch-save copy (web `:670`, mobile `:574`); `models.py` (no link) |
| GM-18-Q18 (LA-Q17) | ✅ VERIFIED (GM-19) | `announcements.py` (adopted) |
| GM-18-Q19 (LA-Q18) | ✅ VERIFIED (GM-19) | `serializers/availability.py` (adopted) |
| GM-18-Q20 (LA-Q06) | Engineering: see BL-04 | `pr257:backend/billing/shift_payments.py:211`, `pr257:backend/core/settings.py:679` |
| GM-18-Q21 (LA-Q07) | 🔄 PARTIAL (discount fixed) | `shift_payments.py:110-132`, `checkout_prices.py` |
| GM-18-Q22 (LA-Q09) | ✅ STILL VALID | `assignment.py:22, :69, :259` |
| GM-18-Q23 (AV-Q06) | ✅ STILL VALID | `models.py::is_talent_board_visible` |
| GM-18-Q24 (AV-Q04) | ✅ STILL VALID | `views/availability.py` own-rows (adopted GM-19) |
| GM-18-Q25 (AV-Q09) | 🔄 SPLIT (distance ✓, rate ✗) | `announcements.py` (adopted GM-19) |
| GM-18-Q26 (LA-Q10) | 🔄 PARTIAL (GM-15) | Terms snapshot (adopted GM-15) |

### Decision status per question
- Decided: **none** in this trace, except **Q07 in principle** (OFFER-01 C, set by the consolidated queue — owner confirms) and the **carried** #184 decisions (D01–D05, E01/E03, P02–P12, R04/R04D — not re-confirmed here).
- Ready to decide now: **GM-18-Q01 first**, then Q02, Q03, Q07 (confirm C), Q11/Q12 (with GM-02), Q13, Q15 (incl. PHARMACY_MANAGER), Q20, Q26, then Q04, Q05, Q06, Q08, Q09, Q10, Q14, Q16, Q17, Q18, Q19, Q21, Q22, Q23, Q24, Q25.
- Blocked on re-trace: **LA-Q02–Q05** (NOT RE-VALIDATED — do not ask until re-validated; GM-02/GM-05/GM-25 territory).
- Owned by another area (decide jointly, do not re-ask from scratch): Q11/Q12 (GM-02 ON-P03), Q18/Q19/Q23/Q24/Q25 (GM-19), Q20/Q21/Q26 (GM-15/GM-17), Q01 (GM-20 AUDIENCE-01), Q07 (GM-24 OFFER-01), Q15 follow-up GM-05 Q-17 (after Q15), Next scope (GM-25).

### Implementation backlog — PROPOSED ONLY, after owner answers (nothing here is decided)
1. Q01–Q03: server-side masking by role + reveal state + reference-code booking flow + pitch-text scan; move the booking flow off the author user id.
2. Q11/Q12: desktop AHPRA source + staging trial + fresh check before registered-role bookings; scheduled re-scan (GM-02).
3. Q13/Q14: hide on lapse/revocation (trigger: nightly job vs revocation event) + re-show on re-verification.
4. Q15: one hiring-role policy in shared-core + backend enforcement on dedicated-shift creation; fix mobile override; resolve `postShiftRoute` default for worker wrappers.
5. Q20: correct cancellation charging behind the existing flag (BL-04). Q21: move price IDs to config per Stripe mode.
6. Q22: cap offer expiry at shift start + show the countdown on both apps.
7. Q07 (C): enquiry/chat-first step for public-board contacts (GM-20 chat surface); firm offer retained for favourites/members.
8. Q08: "Invite to favourites" (membership invite) + wire saved-contacts API to a UI (bookmark stopgap); Q09: private block list.
9. Q17: snapshot sync model chosen by owner (auto-sync / live-read / stamp + one-tap update); Q19: serializer validation + tests.
10. Q04/Q16: server-side filters (distance/rate) + paged feed; set the measured migration trigger now.
11. Q05/Q06: "New" label until 5 completed shifts (define "completed"); separate reliability signal once the incident ladder exists (GM-15).
12. Q23: 30-day inactivity hide + nudge + one-tap renew; Q24: availability opt-in scope; Q25: minimum-rate preference (source of truth to be decided).
13. Q26: terms snapshot gains cancellation table + version + pharmacy acceptance; Australian legal review of charges (GM-15 LA-R02).
14. Q10: publish the direct-hire rule in terms (free permanent hire recommended; booked shifts stay on-platform).
15. Clean-up (no decision needed): dedupe the two mobile `useTalentFeed` copies; throttle/dedupe `add_view` (or remove it if no screen will use it); align mobile pitch save to force `is_anonymous: true` for staff as web does; decide the Next TalentBoard copy's fate (serve it or delete it — GM-25).

### What the parent agent / next worker must do next
1. Reconcile this reconstruction's numbering with the consolidated queue (§1, † in `grill-me-consolidated-queue.md`): the queue cites the lost file's Q-numbers; this file's mapping table (§2) is the bridge. The PR assembly should cite `is_public_shift()`'s definition (`foundation_services.py:60`) — the senior review's residual gap is now closed.
2. Re-check every claim citing `backend/talent/views/explorer.py` against **PR #257** (it modifies that file) before the docs PR is finalised.
3. Re-validate **LA-Q02–Q05** before they are asked or launched on (GM-02/GM-05/GM-25 territory).
4. Confirm **OFFER-01 C** and **AUDIENCE-01** jointly with GM-20/GM-24; record the answers in both ledgers.
5. Verify the two remaining UNKNOWNs before implementation: (a) whether the shift-creation view enforces a hiring-role gate on dedicated shifts (GM-10/GM-12); (b) whether the live Next site serves the migrated TalentBoard copy (GM-25).

## 7. Unknowns and limits of this trace

- **Original numbering unrecoverable.** The lost worker file's Q-numbers are gone; §2's mapping is this reconstruction's. If the PR assembly finds the original file, re-map before publishing.
- **PR #257 not traced.** One cited file (`backend/talent/views/explorer.py`) is modified there; all claims on it carry that flag.
- **Search-code index is the default branch (main `8ccf8f7`), not the PR head.** "No caller found" findings (saved-contacts UI, `add_view` callers, `charge-penalty` screen callers) are strong but not absolute — each was cross-checked against the head-fetched files where possible.
- **Not traced in this area (owned elsewhere, cited as adopted):** the matching engine internals (GM-19), the AHPRA desktop verifier's staging trial (GM-02), the terms snapshot fields (GM-15), the fee table and GST (GM-17), the posting/acceptance view layer and its role gates (GM-10/GM-12), chat/enquiry surfaces (GM-20), the Next launch scope (GM-25), legal review of charges (GM-26).
- **Not verified:** the content diff between the two mobile `useTalentFeed` copies (sizes differ: 3,041 vs 2,948 bytes); the `charge_penalty` view-level eligibility guard (function verified, wrapper not re-read); whether the public talent-board page is linked/indexed; the exact recipient cap in match emails (GM-19, verified to exist, not quoted).
- **No 429s, no drift:** PR #249 head verified live as `97c4543e…`; PR #267 head `25248b70e785`; main `8ccf8f7` per task (search index ref matches).

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-18-OD-13: Resending a talent pitch never creates a duplicate (OD-13, O1 (7 Nov))
**Platforms:** Web + Expo
**What happens today:** A resend within 30 days returns the first result. After 30 days it is refused as expired, never duplicated. Resending a deleted pitch says it was deleted and does not restore it. Old app versions without this protection cannot create public pitches (they need the updated app; there are no such versions in the stores yet).
**Already implemented:** pr257, `backend/talent/test_pitch_idempotency.py:110`
**Recommendation:** Keep.
**Other option:** A shorter or longer window.
**Status:** OPEN, confirm or change.
