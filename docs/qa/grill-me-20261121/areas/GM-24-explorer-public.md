# GM-24 — Explorer / Public — Traced Flow & Validated Question Queue

> **Corrections against current code (21 Nov 2026 review).** 10 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 8 hold, 2 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q07 | “Pharmacy.verified is only read by the ethical marketplace” | WRONG | Goods marketplace eligibility also requires verified pharmacy ownership. Ordinary shift posting still does not add that goods-marketplace verification gate. | `pr257:backend/marketplace/policy.py:93`; `pr257:backend/marketplace/policy.py:99` |
| Q08 / Q09 | Anonymous pharmacy name stays hidden through offer/acceptance | WRONG | Board pharmacy details are redacted, but an offered worker can receive the real name through engagement terms before accepting. Document this separately from the board-card presentation. | `pr257:backend/organizations/serializers.py:54`; `pr257:backend/shifts/engagement.py:640`; `pr257:backend/shifts/serialization/offers.py:235` |

- **Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
- **Re-validated against:** PR #249 head **`97c4543e051b43fe30ec7e2e61ad3d69957a918e`** (verified current via `pull_request_read` on PR #249; matches the Issue #250 snapshot — no newer head). PR #249 is stacked on #248 (`feat/mobile-merge-sdk`, head `25939534a1c5543454a8e770571e4dff46380d96`). Draft, not merged, not deployed.
- **Method:** Issue #250 + PR #184 format. Every old #184 question relevant to GM-24 was re-checked against the current code at the head above. No GitHub rate-limit (429) was hit; all evidence below is current-head evidence, not October 2026 evidence.
- **Scope:** Explorer role ("New to pharmacy"), public boards (public shifts + public talent), anonymous vs signed-in views, what Explorers can do with shifts, upgrade path, public site / landing pages, SEO. Web = Vite web + Next web (`frontend_web/landing_next`), Expo mobile — traced together, side by side.
- **Status:** CURRENT FLOW TRACED. No owner decisions taken here. No code changed (read-only).

Base blob URL for all file links: `https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/`

## 1. Traced flow — ACTUAL TODAY

### 1.1 Who is an Explorer, and how do you become one?

- **Backend authority:** `backend/users/models.py` — `User.ROLE_CHOICES` includes `('EXPLORER', 'New to pharmacy')`; `SELF_REGISTRATION_ROLES = ('OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER')`. Two newer roles exist that #184 did not have: `ORG_STAFF` and `PHARMACY_MANAGER` (manager created only by organisation onboarding by email; `CHOOSABLE_ACCOUNT_TYPES = ('PHARMACIST', 'OTHER_STAFF')` is the manager-conversion list, not the Explorer list).
- **Verification for Explorers:** one "Verified" rule is email + mobile, plus AHPRA for pharmacists/interns; **ID for overseas Explorers** (`mobile_check_skipped` on the user when no Australian mobile — a verified photo ID stands in for mobile). Explorer onboarding tabs (both clients): Basic Info, Photo ID, Interests ("What you're looking for"), References, Bio. **There is still no Explorer payment tab on either client** (Expo `frontend_mobile/roles/explorer/profile.tsx` tabs; web `frontend_web/src/pages/onboarding/onboarding_explorer/` V2 files: BasicInfo, Identity, Interests, Profile, Referees — no payment file).
- **Explorer onboarding gate:** `backend/talent/views/explorer.py::_require_public_staff_access` — an Explorer must have a verified `ExplorerOnboarding` row ("Verify your profile (your mobile, or photo ID if you are overseas) before posting on the talent hub") before creating/updating a talent post. Pharmacist/other-staff posters additionally need current AHPRA (pharmacist) and mobile verified.

### 1.2 Anonymous visitor — what they can see and do

| Surface | Anonymous (logged out) | Source |
|---|---|---|
| Public job board | Full browse: all PLATFORM shifts, **all roles** (no role gating), rates visible, filters (search/city/state/role/employment/min-rate/urgent/negotiable/flexible/travel/accommodation/bulk/time-of-day/date range, org filter). Cannot apply, save, or counter-offer — login dialog. | `backend/shifts/browse.py::PublicJobBoardView` (`AllowAny`); `frontend_web/src/pages/PublicJobBoardPage.tsx`; Expo `frontend_mobile/roles/shared/shifts/AnonymousShiftBoardScreen.tsx` |
| Public talent board | Full browse of visible talent posts (public feed, redacted — see §1.5). Cannot like, view availability, or request booking — login dialog. | `backend/talent/views/explorer.py::public_feed` (`AllowAny`); `frontend_web/src/pages/PublicTalentBoardPage.tsx` |
| Shared shift link | Single shift by token (`/shifts/link?token=…`). Closed shifts show "doesn't accept candidates anymore" + `noindex,follow`. Signed-in users are redirected to their dashboard shift page. | `backend/shifts/browse.py::SharedShiftDetailView` (`AllowAny`, token required); `frontend_web/src/pages/SharedShiftLandingPage.tsx`; Expo `SharedShiftLandingScreen.tsx`, route allow-listed in `publicShiftRoute.ts` |
| Landing / public site | Landing page with CTAs to both public boards, pricing, terms/privacy, app-store links. | `frontend_web/src/pages/LandingPage.tsx`; Next `frontend_web/landing_next/app/landing-page.tsx` |
| Contact form | Public, captcha-gated. | `backend/users/api_account.py::ContactMessageCreateView` (`AllowAny` + reCAPTCHA) |

- **Rates:** anonymous visitors **see published pay**. `backend/shifts/rate_visibility.py::published_rates_visible` returns `True` for unauthenticated users; pay is hidden only from staff members of the same pharmacy/chain. So the public board is a fully priced shop window.
- **Which endpoint serves whom (the #184-era confusion, now pinned down):** `GET /public-shifts/` (`PublicShiftViewSet`, `BaseShiftViewSet.permission_classes = [IsAuthenticated]`, `backend/shifts/base.py:116`) **requires login** and filters by the signed-in user's role. `GET /public-job-board/` (`PublicJobBoardView`, `AllowAny`) is the anonymous board and has **no role gating**. Both collapse in the UI to "Failed to load public shifts" on error — this matches the 2026-11-19/21 site-flakiness note in memory.
- **Daily supply cap:** max **10 public shifts per pharmacy per day** (`backend/shifts/limits.py::MAX_PUBLIC_SHIFTS_PER_DAY`, enforced in `post_shift` and on escalation to PLATFORM).
- **What is a "public" shift:** `visibility='PLATFORM'`, `dedicated_user` null, `public_hidden_at` null, not unpublished, future/current slots (or slotless full/part-time). `backend/shifts/browse.py::PublicShiftViewSet.get_queryset` / `PublicJobBoardView.get_queryset`.

### 1.3 Signed-in Explorer — what they can see and do with shifts

- **Boards:** Web nav (`frontend_web/src/navigation.tsx::getExplorerNav`) gives Explorers Overview, Profile, Chat, **Shifts → Public Shifts + Community Shifts**, Talent Hub, Calendar, Learning. Expo `frontend_mobile/roles/shared/shifts/shiftSurface.ts`: explorer persona is `publicOnly: true`, workspace forced to `'platform'`, sections `['public', 'community', 'confirmed', 'history']`. Expo `roles/explorer/shifts.tsx` (the #184 dead screen that only said "Shifts") **now re-exports the shared `ShiftsScreen`** — ON-05 explorer limb is FIXED.
- **Community tab is a dead end (traced, not just suspected):** `CommunityShiftViewSet.get_queryset` only returns shifts where the user holds an accepted staff/favourite membership at that pharmacy, its owner chain, or its organisation. An Explorer with no membership gets an empty list on both clients. The Expo explorer dashboard (`roles/explorer/dashboard.tsx`) also calls `fetchCommunityShifts` and will show nothing. No error is shown — just empty.
- **Role filter:** an Explorer only ever sees `role_needed='EXPLORER'` shifts on the signed-in board: `backend/shifts/access.py::_shift_roles_visible_to_user` returns `["EXPLORER"]` for EXPLORER. Owners can post EXPLORER-role shifts (`backend/shifts/models.py::Shift.ROLE_CHOICES` includes `('EXPLORER', 'New to pharmacy')`).
- **Express interest (CHANGED since #184):** `backend/shifts/interest.py::express_interest` now gates public shifts through `require_public_ahpra` → `_require_public_shift_onboarding`, which **now has an EXPLORER branch**: a verified `ExplorerOnboarding` row is required (403 "Verify your profile before applying for public shifts"). Role check first: `_user_can_perform_shift_role` — an Explorer can only express interest in EXPLORER-role shifts. Entry point: `backend/shifts/base.py:212::express_interest` action. Web public board enforces Verified client-side first (`PublicJobBoardPage.requireVerified`, explorer onboarding detail included). Expo signed-in board (`PublicShiftsView.tsx`) mirrors this with interest/counter-offer flows and retry.
- **Accepting an offer — the dead end (UNCHANGED):** an Explorer **still cannot accept**. `backend/shifts/engagement.py::worker_onboarding` (line 25) only special-cases PHARMACIST and looks everyone else up in `OtherStaffOnboarding` — an Explorer returns `None`. Offer accept (`backend/shifts/offers.py::accept`, line 338) builds engagement terms → `_external_payment_profile` (engagement.py:265) raises "Complete worker onboarding before accepting this external shift." So: interest succeeds, owner makes an offer, accept fails late with a confusing error. There is no Explorer payment profile, no TFN/ABN path, no terms snapshot for Explorers.
- **Claiming a community shift:** `claim_shift` (`browse.py`) requires an accepted membership at the pharmacy — Explorers cannot claim. Favourite/locum members are redirected to the offer path instead.
- **Counter-offers:** same Verified gate as interest (client requires Verified; backend `ensure_interest_for_counter_offer` path in `base.py`).
- **Notifications on interest:** `_announce_interest` emails the shift creator ("New public shift interest", applicant shown as "A candidate" for public shifts) + in-app notification to shift managers.
- **Retry/concurrency:** interest uses `get_or_create` (idempotent re-apply returns 200, not a duplicate). Offer accept locks shift + slots + offer rows (`select_for_update`) and re-checks AHPRA under lock (`lock_public_ahpra`); a second acceptance of the same slot is refused ("already locked or awaiting payment"); competing pending offers on the same slot are expired on acceptance.
- **Denied role / wrong tenant:** wrong role → 400 "Your role does not cover this shift"; unverified → 403; non-member claiming community → 403 `shift_claim_not_member`; cross-pharmacy data is scoped server-side (querysets filter by membership/pharmacy; `scopeKey` in `shiftSurface.ts` prevents a stale scope writing).

### 1.4 The upgrade path — Explorer → Pharmacist / Pharmacy team (built, both clients, backend)

- **Clients:** `UpgradeAccountCard` exists on **both** — Expo `frontend_mobile/roles/explorer/UpgradeAccountCard.tsx` and web `frontend_web/src/pages/onboarding/onboarding_explorer/UpgradeAccountCard.tsx`. Same copy (from shared-core `UPGRADE_COPY`), same 5 choices: Pharmacist (general AHPRA), Intern (provisional AHPRA), Dispensary technician, Pharmacy assistant, Pharmacy student. One-way, once.
- **Backend:** `POST choose-account-type` → `backend/users/api_account.py::ChooseAccountTypeView` — EXPLORER branch calls `backend/onboarding/services/upgrade.py::upgrade_newcomer` (atomic transaction): role must be EXPLORER; carried fields = date of birth, work rights, gender, emergency contact, address, travel prefs, photo, bio, resume, referees, plus the photo-ID bundle as one unit; **verification flags are NOT carried** (new role's checks apply from scratch — AHPRA for pharmacists, Australian mobile for everyone; `mobile_check_skipped` is reset to False); **the Explorer talent post is removed** (owner decision 2026-10-13, recorded in the code comment); the person posts again in the new role once verified.
- **What upgrade does NOT do:** it does not refund/transfer anything (no payment involved), does not notify pharmacies that the post vanished, does not keep the old post's likes/views, and does not grandfather the old verification.

### 1.5 Public talent board — who sees what, and the identity leak (UNCHANGED in substance)

- **Authenticated feed/list/retrieve:** any signed-in user (including competing workers) can read every post via `ExplorerPostReadSerializer`, which returns full `explorer_name`, `author_user_id`, `explorer_user_id`. **Anonymous posts are anonymous only to logged-out visitors.** This is TB-01 / LA-Q12, still true at this head.
- **Public feed (anonymous):** `PublicExplorerPostReadSerializer` redacts only when `is_anonymous` (the default): name → "Anonymous candidate", profile/author ids → null. A post with `is_anonymous=False` exposes full name + user id to anonymous visitors. Tested: `backend/talent/test_explorer_api.py::test_public_feed_is_open_and_uses_public_shape`. **No test asserts redaction on the authenticated feed.**
- **Visibility rule (FIXED since #184 — TB-03):** `get_queryset` now filters through `_visible_posts` for list/retrieve/feed/public-feed/by-profile: hidden-by-moderation (`hidden_at`) and past-availability-date posts are excluded (404 on direct read/react); full-time posts and undated posts stay visible forever (`talent/models.py::is_talent_board_visible`). Tested in `ExplorerVisibilityTests`. **Not** re-checked: visibility when Verified is revoked or AHPRA lapses after posting — `_visible_posts` checks only `hidden_at`/dates, so a revoked author's post stays visible. That limb is still open.
- **Posting rules:** only the owner (Explorer/Pharmacist/Other Staff, verified) can create; newcomers get **one active post** and a **7-day re-post rule** (re-post inside 7 days keeps the previous post's feed position — `_create_newcomer_post`). Owners cannot create. `reference_code` (8-char) supports QR lookup on the public feed; unknown/hidden/expired codes return empty (400 if >100 chars).
- **Like/view:** like/unlike any authenticated user, idempotent per user; `add_view` increments on **every** authenticated call with no limit/rate cap (TB-07 limb, unchanged).
- **Request booking (TB-06, UNCHANGED):** still a **firm offer**, not an enquiry. Web `TalentBoard/index.tsx::handleRequestBooking` opens Post Shift with `dedicated_user=<author id>` (+ role/dates); posting calls `offer_dedicated_shift` (`backend/shifts/assignment.py:259`) which immediately creates firm offers with **48h expiry** (`OFFER_EXPIRY_HOURS = 48`, unchanged; not capped at shift start) and emails the candidate. No Verified/AHPRA check on the dedicated user at creation; no pharmacy-verified check at posting (`post_shift` checks neither `verified` nor `abn_verified` — ON-06 unchanged). **Drift (TB-07, still present):** web `canRequestBooking` = fixed employer-role list (OWNER/PHARMACY_ADMIN/ORG_*/etc.) + `isAdminUser`; mobile `canRequestBookingByRole` = **any role except EXPLORER/PHARMACIST/OTHER_STAFF** (so PHARMACY_MANAGER can book on mobile but not on web unless admin); mobile also proceeds without `dedicated_user` when the candidate is anonymous (opens a general post), web returns early.
- **Ratings on talent cards (CHANGED):** `rating_average`/`rating_count` are still annotated from OWNER_TO_WORKER ratings, but eligibility is now "≥1 assignment with `slot_date` in the past at a pharmacy the rater controls" (`backend/ratings/views.py::_has_completed_relationship_*`). That is **not** "approved timesheet" and **not** "clock-out" — a past date alone qualifies, and internal roster assignments qualify, so internal ratings still feed the public average (CX-Q35 unchanged in effect).
- **Availability on cards:** `availability_days` is a one-time copy into the post; later calendar edits never update the post (AV-01, not re-checked in depth here — the copy-on-write is in the pitch form; no sync was found).

### 1.6 Anonymous public shift — what exactly is hidden (CHANGED — now specified in code)

- `backend/shifts/serialization/shifts.py::ShiftSerializer.to_representation` (lines 199-201): if `post_anonymously` and the viewer cannot manage the pharmacy, `pharmacy_detail` is replaced by `anonymize_pharmacy_detail` (`backend/organizations/serializers.py:53`): **kept** = id, name → "Anonymous Pharmacy", suburb, state, postcode, script volumes; **removed** = street address, email, owner, organisation, ABN fields, documents, file fields. `ui_address_line` drops the street when anonymised. The accept-path email also shows "Shift in {suburb}".
- **Kept identifiers worth deciding on:** postcode + suburb + script volume can still identify a pharmacy in a small suburb. PO-Q11's "also hide suburb" option is now answerable against this exact list.
- **When is the name revealed? (PO-Q12 — still undefined):** no reveal step was found in code. The agreement/terms path does not name a reveal point; the accept email keeps the suburb-only display. Whether the worker ever learns the name before arrival is not defined anywhere traced.
- **Share token:** `issue_share_token` (`backend/shifts/escalation.py`) requires PLATFORM visibility and rotates the token (previous link stops working). **No expiry field was found** on the token — a link works until rotated or the shift closes. Sitemap shift URLs use `/shifts/link?id={id}` (`backend/core/sitemap.py`) but the page requires `?token=` — those sitemap links cannot load a shift as written.

### 1.7 Escalation, match emails, notifications (UNCHANGED)

- **Escalation sends nothing** (`backend/shifts/escalation.py::auto_escalate_due_shifts`): no notification on reaching a new tier, and any interest ever (`interests__isnull=True` filter) stops auto-escalation for good, even if the worker declined. Manual escalation is a manager action; going public counts against the 10/day limit. (SH-05 scheduling limb — whether a beat task now runs it — was **not** inspected in this area; the function still exists and is still called from `BaseShiftViewSet.get_queryset` per `base.py:177`.)
- **Match emails** (`backend/shifts/announcements.py::announce_availability_matches`): only when a shift is posted **straight to PLATFORM**; escalated shifts never notify. Recipients are **not filtered by Verified** — unverified workers (and Explorers, for EXPLORER-role shifts) get emails for shifts they are then blocked from applying to. Matching is any-overlap (`_availability_matches_slot`); the single switch is `notify_new_shifts` (no separate urgent opt-in — AV-Q08). Anonymous PLATFORM posts notify **nobody** (`announce_posted_shift`: anonymous rules for PLATFORM = empty set).
- **AHPRA re-check on apply/accept (CHANGED):** `require_public_ahpra` queues a desktop re-check on commit when the stored expiry has passed (`queue_public_recheck`); acceptance takes the profile row lock so a booking cannot commit around a suspension. No scheduled scan was verified in this area (unknown — not inspected).

### 1.8 Public site / landing / SEO — ACTUAL TODAY

- **Two implementations of the same public pages.** Vite (`frontend_web/src/pages/…`) is the live app; Next (`frontend_web/landing_next/`) wraps the migrated Vite pages: `app/(public)/shifts/public-board/page.tsx` and `app/(public)/talent/public-board/page.tsx` are thin — server `metadata` (title/description/canonical) + `<PublicHero>` + `<PublicEntry page="PublicJobBoardPage"/>`. `PublicRouteBridge.tsx` redirects Vite public paths (`/`, `/shifts/link`, `/shifts/public-board`, `/talent/public-board`, pricing, terms, privacy, hubs/blog/news/content, calculator, marketplace, learning, organisation…) to the Next origin when `VITE_PUBLIC_SITE_ENABLED=1` and origins differ.
- **Vite SEO is runtime JS:** `frontend_web/src/utils/seo.ts` (`setPageMeta`/`setCanonical`/`setSocialMeta`/`setJsonLd`/`setRobotsMeta`) mutates `document.head` after load — invisible to crawlers that don't run JS. Next provides real server metadata. Shared-shift page emits schema.org `JobPosting` JSON-LD (with `jobLocation` including street address — but the backend redacts street for anonymous posts, so the field is absent then) and `noindex,follow` when the shift is closed; default robots meta is removed (indexable) otherwise.
- **Sitemaps:** backend `backend/core/sitemap.py` (+ `public_sitemap.py`, `public_hub/sitemap.py` JSON endpoint): static URLs `/`, `/shifts/public-board`, `/talent/public-board`, `/learning`, `/terms-of-service`, `/privacy-policy` + per-shift `/shifts/link?id={id}` (broken as noted — needs `?token=`) + content/marketplace URLs. Next `app/sitemap.ts` proxies the backend sitemap (`getPublicSitemap`, `force-dynamic`, throws if unavailable); `app/robots.ts`: allow `/`, disallow `/api/`, `/community/sign-in`, `/content`, `/dashboard`, `/calculator`, sitemap = `{site}/sitemap.xml`.
- **Expo public entry:** anonymous routes `shifts/link` + `shifts/public-board` are allow-listed without login (`publicShiftRoute.ts::PUBLIC_SHIFT_ALLOWLIST`); `AnonymousShiftBoardScreen` uses `getPublicJobBoard`, preserves results on load-more failure, shows "Retry loading shifts" (PR #249 commit `79d294d`), carries referral params (`referral_code/event_id/shift_id`) into register/login, and offers Sign in / Create account. Role filter options: All + Pharmacist/Intern/Assistant/Technician/Student — **no Explorer option** (same omission as Vite `PUBLIC_ROLE_OPTIONS`).
- **Public hub / content:** `backend/public_hub/` (editorial content, community, moderation, documents, invitations, media, audit) backs the `/content`, `/hubs`, `/blog`, `/news` surfaces and feeds sitemap content URLs. Editorial content pages themselves were **not** traced line-by-line in this area (marked unknown below, not assumed).

### 1.9 What anonymous visitors and Explorers CANNOT do (denials, collected)

- Anonymous: cannot apply, save, counter-offer, like, view availability, request booking, or read a shift without a share token (token missing → 400 "A share token is required"; bad token → 404). `GET /public-shifts/` without login → 401/403 (auth required).
- Explorer, signed in: cannot see non-EXPLORER roles on the signed-in board; cannot see community shifts (empty, no membership); cannot claim; cannot accept any offer (late 400 from engagement terms); cannot post a talent post until verified; cannot create a second talent post (one active post); cannot upgrade twice (role must be EXPLORER); cannot see pharmacy identity on anonymous posts; cannot see published pay? No — Explorers **can** see published pay (they are not staff of the pharmacy).
- Wrong-tenant: a signed-in user on another pharmacy's data gets scoped querysets (no cross-pharmacy leak found in the traced paths); `can_apply` is `None` for anonymous, role-checked for signed-in (`SharedShiftSerializer`).

## 2. Current-flow matrix

Trigger → Actor → Backend/API → Vite → Next → Expo → Persisted state → Event/side effect → Recovery/denial path. (SHA `97c4543e` throughout.)

| # | Trigger | Actor | Backend / API | Vite web | Next web | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | Open public job board | Anonymous | `GET /public-job-board/` `AllowAny`, `PublicJobBoardView`, `SharedShiftSerializer` | `PublicJobBoardPage.tsx` (SEO meta, filters, login dialog on apply) | `app/(public)/shifts/public-board/page.tsx` (server metadata + migrated page) | `AnonymousShiftBoardScreen.tsx` (load-more + Retry, referral params) | none (read-only) | none | Load failure → "Failed to load public shifts" + retry (Expo: keeps old results; Vite: error banner + snackbar) |
| F-02 | Open public talent board | Anonymous | `GET /explorer-posts/public-feed/` `AllowAny`, `PublicExplorerPostReadSerializer` | `PublicTalentBoardPage.tsx` (loads ALL pages, page_size 200) | `app/(public)/talent/public-board/page.tsx` | No public talent board screen found in Expo (unknown — not inspected) | none | none | Load failure → "Failed to load talent feed."; like/calendar/booking → login dialog |
| F-03 | Open shared shift link | Anonymous | `GET /view-shared-shift/?token=` `AllowAny`, `SharedShiftDetailView` | `SharedShiftLandingPage.tsx` (JSON-LD JobPosting, noindex if closed; signed-in → redirect to dashboard) | Not a Next route (Vite page via bridge) | `SharedShiftLandingScreen.tsx`, route allow-listed | none | none | No token → 400; bad token → 404; closed → closed card + noindex |
| F-04 | Sign up | Visitor | `POST register`, role EXPLORER allowed (`SELF_REGISTRATION_ROLES`) | `register.tsx` | `app/(public)/register/page.tsx` | `app/register.tsx` | `User(role=EXPLORER)` | OTP/email + mobile verification | Unverified → cannot apply/post (403 at action time, not at signup) |
| F-05 | Complete Explorer onboarding | Explorer | `ExplorerOnboarding` row; `verified` flag | `onboarding_explorer/*V2` (5 tabs, no payment) | Migrated pages | `roles/explorer/profile*.tsx` (5 tabs, no payment) | `ExplorerOnboarding.verified` | Talent-post gate opens | Unverified → 403 "Verify your profile…" on post/apply |
| F-06 | Browse signed-in public board | Explorer | `GET /public-shifts/` auth required; role filter `["EXPLORER"]` only | Shifts board (Public tab) | Dashboard (migrated) | `PublicShiftsView.tsx` via `ShiftsScreen` (publicOnly) | none | none | 401 logged out; empty list for non-EXPLORER roles (no error) |
| F-07 | Browse community board | Explorer | `GET /community-shifts/`; membership-gated, empty for Explorers | Shifts board (Community tab) | Dashboard (migrated) | `CommunityShiftsView.tsx` via `ShiftsScreen` | none | none | Empty list, no message — dead end (Q22) |
| F-08 | Express interest (public shift) | Verified Explorer | `POST /public-shifts/{id}/express-interest/` → `express_interest` → `require_public_ahpra` → `_require_public_shift_onboarding` (EXPLORER branch) | `PublicJobBoardPage.handleApplyAll/Slot` (client Verified check first) | Same (migrated) | `PublicShiftsView.tsx` interest flow | `ShiftInterest` row (`get_or_create`) | Email + notification to shift creator/managers ("A candidate…") | Unverified → 403; wrong role → 400; duplicate → 200, no duplicate row |
| F-09 | Owner makes dedicated offer (Request booking) | Owner/admin | `POST shift` with `dedicated_user` → `post_shift` → `offer_dedicated_shift` (firm, 48h) — no Verified/AHPRA check on candidate | TalentBoard `handleRequestBooking` (fixed role list) | Same (migrated) | talent-board `handleRequestBooking` (any non-worker role; proceeds even if anonymous id missing) | `Shift` (visibility forced LOCUM_CASUAL, anonymous off) + `ShiftOffer` PENDING | Offer email + notification to candidate | Candidate learns of problems only at accept (Q27); anonymous candidate id null → web aborts, mobile posts generally |
| F-10 | Accept offer | Explorer | `POST /shift-offers/{id}/accept/` → `require_public_ahpra` → `build_shift_engagement_terms` → `_external_payment_profile` → **fails**: `worker_onboarding` returns None | Offer screen (accept) | Same (migrated) | Worker offer screen | No assignment created | None (no payment, no notification beyond the failure) | 400 "Complete worker onboarding before accepting…" — late, confusing (Q01/Q27) |
| F-11 | Accept offer | Pharmacist / Other Staff | Same endpoint; terms built, frozen, payment or direct assignment; competing offers expired | Offer screen | Same | Worker offer screen | `ShiftOffer` ACCEPTED(_AWAITING_PAYMENT), `ShiftSlotAssignment`, frozen terms snapshot | Payment checkout if required; confirmation emails/notifications | Expired offer → 400; locked slot → 400; terms changed → 409 TERMS_CHANGED |
| F-12 | Post talent post | Explorer (verified) | `POST /explorer-posts/` → `_require_public_staff_access` + one-post + 7-day rule | TalentBoard pitch dialog | Same (migrated) | talent-board compose | `ExplorerPost` (+ `reference_code`) | Visible on feed + public feed (redacted if anonymous) | Unverified → 403; second post → 400 "You already have a post…"; owner role → 403 |
| F-13 | Upgrade account | Explorer | `POST choose-account-type` → `upgrade_newcomer` (atomic) | `UpgradeAccountCard.tsx` (web) | Migrated | `UpgradeAccountCard.tsx` (Expo) | `User.role` → PHARMACIST/OTHER_STAFF; new onboarding row (`verified=False`); old `ExplorerPost` deleted; `mobile_check_skipped=False` | Redirect to new role's onboarding | Non-Explorer → 400; invalid role → 400; second upgrade → 400 (role no longer EXPLORER) |
| F-14 | Shift posted straight to PLATFORM | Owner | `post_shift` → `announce_availability_matches` + `announce_posted_shift`; 10/day limit | Post Shift wizard | Same | `PostShiftScreen.tsx` | `Shift(visibility=PLATFORM)` | Match emails to available workers (any overlap, unverified included); staff/favourite/chain notices (none if anonymous) | Over daily limit → 400; anonymous → no notices at all |
| F-15 | Shift escalates to PLATFORM | Owner / auto | `escalate_shift` / `auto_escalate_due_shifts` (stops if any interest ever) | Shift Centre | Same | Shift Centre (W3d) | `visibility=PLATFORM`, escalation timestamps | **No notification, no match email** (Q10/Q19) | Over daily limit → escalation skipped; interest ever → never escalates |
| F-16 | Rate a worker | Owner/admin | `POST /ratings/` → completed-assignment check (past `slot_date`) | Ratings UI | Same | Ratings UI (not traced in detail) | `Rating` (upsert) | Average feeds public talent cards | No past assignment → 400 "You can only rate team members who completed an assignment…" |
| F-17 | Search engines crawl | Crawler | Backend sitemap (`/sitemap.xml` via `core/sitemap.py`) + Next `app/sitemap.ts` + `app/robots.ts` | Runtime JS meta only (invisible without JS) | Server metadata, canonical, robots | n/a (app, not web) | none | Indexing of boards, shift links, content | Shift sitemap URLs use `?id=` not `?token=` → dead links (Q23); closed shifts noindex only on the Vite share page |
| F-18 | Like / view talent post | Signed-in user | `POST /explorer-posts/{id}/like|view/` (auth required; view counts every call) | TalentBoard | Same | talent-board | `ExplorerPostReaction`, `view_count`/`like_count` | Counters increment | Anonymous → 401/403; hidden/expired post → 404 |

## 3. Re-validation of the #184 old questions (GM-24-relevant)

142 questions in `questions.json` (PR #184 head `c786a4b8`); the GM-24-relevant subset was re-checked at `97c4543e`. Verdicts: **STILL VALID** = same facts, same decision open; **CHANGED** = facts moved, decision reframed; **NOT RE-VALIDATED** = not inspected in this area (not assumed).

| Old ID | Question (short) | Verdict | What changed / stayed |
|---|---|---|---|
| ON-Q01 | Which sign-up tracks at launch? | STILL VALID | 3 worker tracks unchanged; note `ORG_STAFF` + `PHARMACY_MANAGER` roles added since — they are not self-registration tracks. |
| ON-Q02 | What can a worker do before Verified? | Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation | Signed-in worker dashboards require mobile verification. Anonymous public browsing stays open. |
| ON-Q03 | Where must verification be enforced? | CHANGED | Public apply/accept/claim now gated (`require_public_ahpra`); dedicated-offer *creation* and chain/org/community interest still skip it. |
| ON-P01 | Who is exempt from AHPRA gates on public shifts? | STILL VALID | Member-access bypass (`is_public_shift_member_access`) still skips the gate for accepted staff/favourites on named public shifts. |
| ON-Q05 | What can Explorers do with shifts? | CHANGED | Interest now possible on verified EXPLORER-role shifts; accept still impossible; Expo dead screen fixed; upgrade path built. Decision still open — now sharper. |
| ON-Q06 | How is AHPRA re-checked after sign-up? | CHANGED (part) | Re-check now queued on public apply/accept when expiry passed (`queue_public_recheck`); scheduled scan **not inspected** here (unknown). |
| ON-Q07 | Registration cannot be confirmed — future bookings? | NOT RE-VALIDATED here | AHPRA-state handling (`not_found`/`suspended` blocks new public applications, keeps bookings) is GM-01 territory; not re-traced for GM-24. |
| ON-P02 | Register shows Suspended/Cancelled? | NOT RE-VALIDATED here | GM-01 territory. |
| ON-Q08 | Who must pass an ID check? | STILL VALID | ID is Verified only for overseas Explorers (`mobile_check_skipped`); ID bundle carries over on upgrade. |
| ON-Q11 | What must a pharmacy pass before posting publicly? | STILL VALID | `post_shift` still checks neither `verified` nor `abn_verified`; only the 10/day public limit gates. |
| PO-Q08 | Escalation: who is told, when does it stop? | STILL VALID | Still sends nothing; still stops on any interest ever. |
| PO-Q11 | Anonymous post: what is hidden? | CHANGED | Now specified in code (`anonymize_pharmacy_detail`); "untested" limb — no test for shift redaction was found (unknown). |
| PO-Q12 | When does the anonymous name reach the worker? | STILL VALID | No reveal point defined anywhere traced. |
| TB-Q01 | Who can see the talent board? | STILL VALID | Any authenticated user + public anonymous cards. |
| TB-Q02 | When is an anonymous candidate revealed? | STILL VALID | Undefined; authenticated reads leak identity anyway (TB-01). |
| TB-Q05 | How should reviews/reliability show? | CHANGED | Single averaged number remains; eligibility is now past-date assignment (not "any assignment"). No reliability measure. |
| TB-Q09 | Can a pharmacy block a worker? | NOT RE-VALIDATED here | No block list was searched for in this area. |
| TB-01 / LA-Q12 | Anonymous talent posts expose names to signed-in users | STILL VALID | Authenticated feed/list/retrieve still use the full serializer; only `public-feed` redacts. |
| TB-03 | Hidden/stale posts readable | CHANGED (fixed) | `_visible_posts` now filters list/retrieve/feed/public-feed; tested. Revoked-Verified limb still open. |
| TB-04 | All filtering client-side | STILL VALID | `loadAllTalentPages` still fetches all pages (page_size 200 on public page); no backend filter params in the viewset read. |
| TB-05 | Heart vs pharmacy favourites | NOT RE-VALIDATED here | Like is still like-only in the views read; favourites action from a card not inspected. |
| TB-06 | "Request booking": firm offer or enquiry? | STILL VALID | Firm 48h offers immediately; no enquiry step. |
| TB-07 | Web/mobile drift (Request booking, views) | CHANGED (still drift) | Web role list vs mobile any-non-worker; mobile proceeds without `dedicated_user`; `add_view` still uncapped. |
| CX-Q34 | Who can rate, and when? | CHANGED | Now: ≥1 assignment with past `slot_date`. Not approved-timesheet, not clock-out. |
| CX-Q35 | Internal roster ratings on public talent board? | STILL VALID | Roster assignments satisfy the eligibility check and feed the public average. |
| LA-Q03 | Fix before launch: mobile dead-ends? | CHANGED (part) | Explorer shifts screen fixed; manager-upgrade limb (ON-04) not re-validated here. |
| LA-Q17 / AV-04 | Match emails miss escalated shifts, reach unverified workers | STILL VALID | Still posting-time-only, PLATFORM-only, no Verified filter. |
| AV-Q08 | Urgent alerts need separate opt-in? | STILL VALID | Single `notify_new_shifts` switch confirmed in match code; no urgent opt-in. |
| AV-02 | Nothing ever expires (talent staleness) | CHANGED (part) | Past-date posts now hidden (except full-time/undated, which stay forever); no nudge verified. |
| AV-01 | Availability lives in two places, never syncs | NOT RE-VALIDATED here | Copy-on-write into posts observed in passing; no sync check done. |
| AV-06 | Availability doesn't help hiring | NOT RE-VALIDATED here | Not inspected in this area. |

Carried decisions that stand (from `questions.json`, not re-asked): D01 (acceptance → time-limited reservation, payment confirms), D02 (payment windows), D03 (expiry → release + notify), D04/D05 (cancellation scope), E01/E01A/E01B (audience order; earlier audiences keep access; notice flags), E03 (owner-picked escalation intervals), P02–P12 (cancellation source/fees/ladder), F01/F04 (money separation; late payment), NOPEN (no money penalties on workers). Plus the owner decision recorded in code on 2026-10-13: upgrade removes the Explorer talent post.

## 4. Validated question queue (PR #184 format)

Plain English first. Each question: ACTUAL TODAY (traced at `97c4543e`), RECOMMENDED, ALTERNATIVE A (keep current where possible), ALTERNATIVE B/C (concrete scenarios), Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and web/Expo difference are noted per question where they bite.

### GM-24-Q01 — What can Explorers ("new to pharmacy") do with shifts? [FIRST QUESTION — ask this first]
- **Old ID:** ON-Q05. **Status:** CHANGED, still open. **Severity:** launch-gating.
- **ACTUAL TODAY:** An Explorer can browse the public board (all roles shown anonymously; only EXPLORER-role shifts once signed in), see a Community tab that is always empty, and — if their Explorer onboarding is verified — express interest in EXPLORER-role public shifts. They cannot accept any offer: accept fails late at engagement terms ("Complete worker onboarding before accepting…") because `worker_onboarding()` finds no staff profile and there is no Explorer payment tab on either client. The only way to paid work is the upgrade card (Explorer → Pharmacist/Pharmacy team, once, post removed, verification from scratch). Web and Expo agree on all of this.
- **RECOMMENDED: C — Paid shifts only after upgrading; keep EXPLORER-role interest for unpaid placement/shadowing.** Rationale: the upgrade path is already built, tested in code, and one-way-safe; it avoids building Explorer payroll, TFN/ABN terms, and payment before launch. But the current interest-without-acceptance must be fixed at the same time: either block offers to Explorers at creation or remove the Apply button for them. Benefit: no dead-end in week one, boards stay a discovery funnel. Risk: fewer Explorer conversions if the upgrade feels like a wall; mitigate with the upgrade card on the shift detail itself. No legal/financial impact beyond the existing unpaid-placement question (see option B).
- **ALTERNATIVE A — Keep current logic:** interest allowed, accept blocked. Scenario: a verified Explorer expresses interest in a shadowing shift; the pharmacy offers; accept fails with a generic error; the pharmacy thinks the worker ghosted them and the worker thinks the app is broken. Trade-off: zero build, guaranteed support tickets and bad first impression.
- **ALTERNATIVE B — Explorers can express interest AND accept EXPLORER-role shifts (unpaid placement only):** build Explorer acceptance with no-pay terms (placement/shadowing agreement, no TFN/ABN, no invoice). Scenario: a student shadows a Saturday shift; terms record "unpaid placement, no pay". Edge: Fair Work / unpaid-work rules — needs qualified review before launch; do not ship on a product decision alone.
- **ALTERNATIVE C — (recommended, above).**
- **ALTERNATIVE D — No shifts at all for Explorers:** hide the Shifts nav and the boards for Explorers; boards become a post-upgrade feature. Scenario: a newcomer signs up, sees only profile + Talent Hub + Learning. Trade-off: cleanest, but throws away the discovery funnel and the Explorer dashboard's "Find your next shift" section.
- **Other (describe) / Defer:** ___

### GM-24-Q02 — Browse access before full verification
- **Status:** Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation.
- **Actual today:** The worker dashboard requires email and mobile verification. Anonymous visitors can still read public boards. See GM-24-Q19 for match emails.

### GM-24-Q03 — Verification on outside bookings
- **Status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01.
- **Actual today:** The shared guard skips non-public shifts (`pr257:backend/onboarding/verification/state.py:174`).

### GM-24-Q04 — AHPRA exemption
- **Status:** Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01. Engineering: see BL-02.
- **Actual today:** A favourite with an eligible membership can skip the check on a named public shift at that pharmacy (`pr257:backend/shifts/interest.py:21`).

### GM-24-Q05 — Worker sign-up tracks
- **Status:** Answered: KEEP the existing sign-up tracks, launch grill, 23 Oct 2026 - see ON-Q01.
- **Actual today:** Pharmacist, Other Staff and Explorer are worker sign-up tracks. Owner is separate. Organisation staff and pharmacy managers join through other routes.

### GM-24-Q06 — Who must pass an ID check?
- **Old ID:** ON-Q08. **Status:** STILL VALID.
- **ACTUAL TODAY:** ID is part of Verified only for overseas Explorers (photo ID stands in for an Australian mobile; `mobile_check_skipped`). ID reading (OCR) already works for everyone, and the ID bundle carries over on upgrade. Pharmacists/other staff do not need ID for Verified.
- **RECOMMENDED: A — Keep current logic, but require ID before a worker's first *paid* booking (not just overseas Explorers).** Rationale: the first paid booking is where identity fraud pays; ID capture already exists. Severity: medium. (If the owner prefers the lightest launch, keep as-is and revisit after launch.)
- **ALTERNATIVE A — Keep current logic.**
- **ALTERNATIVE B — Every worker before first booking.**
- **ALTERNATIVE C — Pharmacists and ABN workers only.**
- **Other / Defer:** ___

### GM-24-Q07 — What must a pharmacy pass before posting to outside workers?
- **Old ID:** ON-Q11. **Status:** STILL VALID.
- **ACTUAL TODAY:** Nothing. `Pharmacy.verified` / `abn_verified` exist but `post_shift` checks neither; the only gate is 10 public shifts/day. Workers can accept shifts from unverified or fake sites. `Pharmacy.verified` is only read by the ethical marketplace.
- **RECOMMENDED: D — ABN verified for chain/org tiers, ABN + admin-verified before PLATFORM.** Rationale: the public board is the trust surface (anonymous visitors, SEO, JobPosting schema); a fake pharmacy there is a launch-ending story. Severity: high.
- **ALTERNATIVE A — Keep current logic (nothing required).**
- **ALTERNATIVE B — ABN verified before any outside post.**
- **ALTERNATIVE C — ABN + admin check before public.**
- **ALTERNATIVE D — (recommended, above).**
- **Other / Defer:** ___

### GM-24-Q08 — On an anonymous public post, what is hidden?
- **Old ID:** PO-Q11. **Status:** CHANGED (now specified in code).
- **ACTUAL TODAY:** `anonymize_pharmacy_detail`: name → "Anonymous Pharmacy", street address removed, file fields removed. **Kept:** suburb, state, postcode, script volumes. Address line drops the street. The accept email shows "Shift in {suburb}". The JSON-LD on the share page omits street when anonymised (backend already stripped it).
- **RECOMMENDED: Keep the current list, but drop postcode (keep suburb + state only).** A postcode plus script volume can identify a pharmacy in a small suburb — the exact leak the redaction is meant to prevent. Severity: medium (privacy). No code change to the mechanism, just the kept-field list.
- **ALTERNATIVE A — Keep current logic (suburb + state + postcode + script volume).**
- **ALTERNATIVE B — Also hide suburb (state only).** Scenario: two pharmacies in one small town — even the suburb gives it away. Trade-off: workers cannot judge travel at all before applying.
- **Other / Defer:** ___

### GM-24-Q09 — When does an anonymous pharmacy's name reach the worker?
- **Old ID:** PO-Q12. **Status:** STILL VALID.
- **ACTUAL TODAY:** The anonymous listing hides the name. The terms preview exposes the pharmacy name and ABN before acceptance, and several notices use the real name. Which step should reveal it is open. Engineering: see BL-13 (`pr257:backend/shifts/serialization/offers.py:244`).
- **RECOMMENDED: A — Reveal in the agreement preview (before the worker accepts).** The worker needs to know who they are contracting with before they are bound; the pharmacy keeps anonymity while browsing. Severity: high (contract/clarity).
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — After reservation (payment pending).**
- **ALTERNATIVE C — After payment confirms.**
- **ALTERNATIVE D — Keep hidden until the shift day (never reveal in-app; reveal by phone/message).** Trade-off: workers arrive not knowing the site — unsafe and impractical.
- **Other / Defer:** ___

### GM-24-Q10 — When a shift escalates, who is told, and when does escalation stop?
- **Old ID:** PO-Q08. **Status:** STILL VALID.
- **ACTUAL TODAY:** Nobody is told — escalation sends nothing. Availability-match emails go out only when a shift is posted straight to PLATFORM. Auto-escalation stops permanently once any interest has ever existed, even if that worker declined. (Whether a scheduled beat task runs escalation was not inspected in this area.)
- **RECOMMENDED: A — Notify each new tier (and availability matches) when a shift escalates; keep escalating until reserved.** Rationale: escalation without notice is invisible supply — the whole point is reaching new people. Severity: high (marketplace liquidity).
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — Notify only on reaching PLATFORM; stop at first interest (today's stop rule).**
- **ALTERNATIVE C — Owner chooses per shift.**
- **Other / Defer:** ___

### GM-24-Q11 — Who can see the talent board?
- **Old ID:** TB-Q01. **Status:** STILL VALID.
- **ACTUAL TODAY:** Any signed-in user — including competing workers — plus anonymous visitors on the public (redacted) cards. There is no employer-only gate; `list`/`retrieve`/`feed` require only `IsAuthenticated`.
- **RECOMMENDED: B — Employers (owner/admin/org) plus your own post, plus public masked cards.** Rationale: the board is a hiring surface; letting competing workers browse every candidate's pitch, rates, and availability is a needless leak and the main driver of the identity problem in Q13. Severity: high (privacy/competitive).
- **ALTERNATIVE A — Keep current logic (everyone).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Employers and own post only (no public cards).** Trade-off: kills the SEO/recruiting value of the public talent board.
- **Other / Defer:** ___

### GM-24-Q12 — When is an anonymous candidate's identity revealed?
- **Old ID:** TB-Q02. **Status:** STILL VALID.
- **ACTUAL TODAY:** Not defined. In practice it is revealed immediately to any signed-in user (the API returns name + user ids on the authenticated feed), and never to anonymous visitors (public feed redacts). So the "anonymous" flag currently only works against logged-out visitors.
- **RECOMMENDED: A — When they accept a booking request.** That is the first moment the pharmacy needs the identity; everything before that can run on the reference code. Severity: high — but only meaningful together with Q13 (fix the leak first, or the reveal rule is theatre).
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — When they reply in chat.**
- **ALTERNATIVE C — Only when an offer is accepted.**
- **ALTERNATIVE D — Keep current logic (revealed to every signed-in user at once).**
- **Other / Defer:** ___

### GM-24-Q13 — Fix before launch? Anonymous talent posts expose full names to any signed-in account.
- **Old ID:** LA-Q12. **Status:** STILL VALID.
- **ACTUAL TODAY:** `feed`, `list`, `retrieve` use `ExplorerPostReadSerializer` (full name + `author_user_id` + `explorer_user_id`); only `public-feed` uses the redacting serializer. Any signed-in account — a competitor, a fake Explorer signup — reads every name. The public feed is tested for redaction; the authenticated feed has no such test.
- **RECOMMENDED: A — Before launch.** Use the public serializer shape for anonymous posts on every read path (or a viewer-aware serializer). Severity: launch-gating (privacy). This is a code fix, not a judgement call, once the owner confirms Q12's reveal rule.
- **ALTERNATIVE A — Before launch.**
- **ALTERNATIVE B — Soon after launch.**
- **ALTERNATIVE C — Not needed.**
- **Other / Defer:** ___

### GM-24-Q14 — Is "Request booking" a firm offer or an enquiry?
- **Old ID:** TB-06. **Status:** STILL VALID.
- **ACTUAL TODAY:** Firm offer. It posts a dedicated shift and immediately creates firm offers with 48h expiry (`offer_dedicated_shift`); the worker cannot ask questions first. The offer email says "Please confirm to lock it in."
- **RECOMMENDED: B — Enquiry/chat first, then an offer.** Rationale: hiring a person is not buying a shift slot; an enquiry step prevents 48h firm offers landing on people who never wanted that date, and prevents the Explorer dead-end (Q01) from being triggered by a booking request. Severity: medium. (If launch speed wins, keep firm offers but add a visible "this sends a firm 48h offer" warning — see Alt A note.)
- **ALTERNATIVE A — Firm offer (today).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Owner chooses each time (firm vs enquiry toggle on the booking sheet).**
- **Other / Defer:** ___

### GM-24-Q15 — Who can request a booking — fix the web/mobile drift?
- **Old ID:** TB-07. **Status:** CHANGED (drift still present).
- **ACTUAL TODAY:** Web: fixed employer-role list + `isAdminUser`. Mobile: any role except EXPLORER/PHARMACIST/OTHER_STAFF — so PHARMACY_MANAGER can book on mobile but not on web (unless admin). Mobile also opens a general Post Shift when the candidate is anonymous (no `dedicated_user`); web aborts. `add_view` still counts every authenticated call with no cap.
- **RECOMMENDED: One shared rule in shared-core (`canRequestBooking`), used by both clients: employer roles + admin capability; abort when there is no target user.** Severity: medium (permission drift is a security-class bug, not cosmetics).
- **ALTERNATIVE A — Keep current logic (drift).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Widen web to match mobile (any non-worker role).**
- **Other / Defer:** ___

### GM-24-Q16 — How should reviews and reliability show?
- **Old ID:** TB-Q05. **Status:** CHANGED.
- **ACTUAL TODAY:** One public averaged number (`rating_average` + `rating_count`) from owner→worker ratings; no reliability measure (cancellations, no-shows, response rate) exists anywhere on the card.
- **RECOMMENDED: A — Separate: reviews and reliability, with counts.** Show the average + count, plus a reliability line (completed shifts, late cancels/no-shows) once the incident data exists. Severity: medium.
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — Keep current logic (one number).**
- **Other / Defer:** ___

### GM-24-Q17 — Who can rate, and when?
- **Old ID:** CX-Q34. **Status:** CHANGED.
- **ACTUAL TODAY:** Either side may rate after the worker has ≥1 assignment with a past `slot_date` at that pharmacy — no timesheet approval, no clock-out, no "worked" proof beyond the date passing. Future/unworked assignments can no longer be rated (fixed since #184).
- **RECOMMENDED: A — After an approved timesheet or clock-out only.** A past date alone can rate a no-show as if they worked. Severity: high (ratings are the public trust signal on talent cards).
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — After the shift's end time (today's rule, roughly — past date).**
- **ALTERNATIVE C — Any assignment (the #184 rule; no longer true).**
- **Other / Defer:** ___

### GM-24-Q18 — Should ratings from internal roster shifts appear on the public talent board?
- **Old ID:** CX-Q35. **Status:** STILL VALID.
- **ACTUAL TODAY:** Yes — roster assignments satisfy the rating eligibility check and the talent-card average counts all OWNER_TO_WORKER ratings, internal or external.
- **RECOMMENDED: A — No, keep internal.** An employee's roster performance is an employment record, not a marketplace credential; mixing them inflates/deflates a public hiring signal with data the candidate cannot see or contest. Severity: medium.
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — Keep current logic (internal counts).**
- **Other / Defer:** ___

### GM-24-Q19 — Should match emails go to unverified workers, and should escalated shifts notify?
- **Old ID:** LA-Q17 / AV-04. **Status:** STILL VALID.
- **ACTUAL TODAY:** Match emails go only at posting straight to PLATFORM, to anyone with `notify_new_shifts` and matching availability — Verified is not checked, so unverified workers (and Explorers who cannot accept) are emailed shifts they are blocked from. Escalated shifts never notify anyone.
- **RECOMMENDED: A — Filter match emails to workers who can actually apply (Verified + role match), and send them on escalation to PLATFORM too.** Severity: medium (spam + false hope + missed liquidity).
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — Keep current logic.**
- **ALTERNATIVE C — Keep recipients, but say in the email that verification is required first.**
- **Other / Defer:** ___

### GM-24-Q20 — Should urgent-shift alerts need a separate opt-in?
- **Old ID:** AV-Q08. **Status:** STILL VALID.
- **ACTUAL TODAY:** One switch (`notify_new_shifts`) covers everything, including urgent shifts. No separate urgent opt-in exists.
- **RECOMMENDED: Keep current logic.** One switch is fine for launch; urgent is a property of the shift, not a new channel. Severity: low.
- **ALTERNATIVE A — Keep current logic.**
- **ALTERNATIVE B — Yes, separate urgent opt-in.**
- **Other / Defer:** ___

### GM-24-Q21 — NEW: Should anonymous visitors see every role on the public job board?
- **Status:** NEW (no #184 equivalent).
- **ACTUAL TODAY:** Yes — `PublicJobBoardView` has no role gating, so a logged-out visitor sees Pharmacist, Intern, Assistant, Technician, Student, and EXPLORER-role shifts with full rates. A signed-in Explorer sees only EXPLORER-role shifts (`/public-shifts/`). So signing in *narrows* what you can see. Both role filters (Vite + Expo) also omit an Explorer option, so nobody can filter to Explorer-role shifts.
- **RECOMMENDED: Keep anonymous broad, but add the Explorer role to the filter and show a signed-in hint.** Anonymous breadth is the SEO funnel; the oddity is the signed-in narrowing, which follows from Q01. Severity: low-medium.
- **ALTERNATIVE A — Keep current logic.**
- **ALTERNATIVE B — Gate the anonymous board by role too (visitors pick a role first).** Trade-off: kills casual browsing/SEO.
- **ALTERNATIVE C — Show all roles to signed-in users as well (role filter becomes a filter, not a wall).** Then apply-time gates do the enforcement.
- **Other / Defer:** ___

### GM-24-Q22 — NEW: The Explorer Community tab is always empty — hide it or open community to Explorers?
- **Status:** NEW.
- **ACTUAL TODAY:** Both clients show Explorers a Community Shifts tab/section, but the backend only returns shifts to accepted members; Explorers have no membership path, so the tab is permanently empty with no explanation. The Explorer dashboard also loads community shifts that never arrive.
- **RECOMMENDED: Hide the Community tab for Explorers until/unless community access is a real feature.** An empty tab with no message reads as broken. Severity: medium (UX/trust).
- **ALTERNATIVE A — Keep current logic (show the empty tab).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Open community browsing to Explorers (read-only; apply still gated).** Scenario: a newcomer sees how their local pharmacy rosters cover — useful, but exposes internal staffing to outsiders.
- **Other / Defer:** ___

### GM-24-Q23 — NEW: Share-link sitemap URLs are dead, and share tokens never expire?
- **Status:** NEW.
- **ACTUAL TODAY:** The sitemap lists `/shifts/link?id={id}`, but the page requires `?token=` — those links 400 ("A share token is required"). `issue_share_token` rotates the token (old link dies) but no expiry field was found, so a link works indefinitely until rotated or the shift closes.
- **RECOMMENDED: Fix the sitemap to emit real share URLs (or drop shift URLs from it) and give share tokens an expiry (e.g. 30 days or shift start + 7 days).** Severity: medium (SEO + link safety).
- **ALTERNATIVE A — Keep current logic.**
- **ALTERNATIVE B — Drop per-shift URLs from the sitemap; keep board URLs only.**
- **ALTERNATIVE C — Expiry only (keep sitemap as-is).**
- **Other / Defer:** ___

### GM-24-Q24 — NEW: Which public site is canonical — Vite or Next — and who owns the public pages?
- **Status:** NEW.
- **ACTUAL TODAY:** Two implementations: Vite pages (runtime JS meta — invisible to non-JS crawlers) and Next wrappers (server metadata + migrated Vite pages). `PublicRouteBridge` redirects Vite public paths to Next only when `VITE_PUBLIC_SITE_ENABLED=1` and origins differ. Both are in the repo at this head; which one production serves is a deploy decision, not a code fact.
- **RECOMMENDED: Next is canonical for all public/SEO pages; Vite keeps the authenticated app; delete-or-freeze the Vite public duplicates once Next is live.** Severity: medium (SEO + double maintenance).
- **ALTERNATIVE A — Keep current logic (both, bridged by env flag).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Vite is canonical; Next is a future migration (do not index Next).**
- **Other / Defer:** ___

### GM-24-Q25 — NEW: Anonymous pharmacy detail keeps postcode + script volume — hide more?
- **Status:** NEW (spin-out of PO-Q11).
- **ACTUAL TODAY:** See Q08: postcode + script volumes survive anonymisation. In a small suburb that is identifying.
- **RECOMMENDED: Drop postcode and script volumes from the anonymised detail (suburb + state only).** Severity: medium (privacy).
- **ALTERNATIVE A — Keep current logic.**
- **ALTERNATIVE B — Drop postcode only.**
- **ALTERNATIVE C — Drop suburb too (state only) — see Q08 Alt B.**
- **Other / Defer:** ___

### GM-24-Q26 — NEW: Non-anonymous talent posts expose identity to anonymous visitors — intended?
- **Status:** NEW.
- **ACTUAL TODAY:** `PublicExplorerPostReadSerializer` redacts only `is_anonymous` posts. A post with `is_anonymous=False` exposes full name + user id to anyone, logged out, via the public feed and the public talent board (which maps `authorUserId`/`explorerUserId` through).
- **RECOMMENDED: Non-anonymous should mean "name visible to signed-in employers", not "name visible to the whole internet". Redact identity on the public feed regardless of the flag; the flag controls signed-in visibility.** Severity: high (privacy).
- **ALTERNATIVE A — Keep current logic (flag off = public identity).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Remove the flag; all talent posts are anonymous publicly, always.**
- **Other / Defer:** ___

### GM-24-Q27 — NEW: Explorer interest that can never become a booking — fail fast?
- **Status:** NEW (spin-out of Q01).
- **ACTUAL TODAY:** Interest succeeds, offer creation succeeds, accept fails late. The failure surfaces as a generic 400 at the last step, after the pharmacy has waited and the worker has hoped.
- **RECOMMENDED: Fail fast — block dedicated offers to Explorers at creation (with a clear message to the pharmacy: "this candidate needs to upgrade first") and hide/disable Apply for Explorers on non-EXPLORER-role shifts (already role-blocked) with the upgrade card beside it.** Severity: high if Q01 answer is C; moot if Q01 answer is B.
- **ALTERNATIVE A — Keep current logic (fail late at accept).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Let the offer be created but warn both sides up front that acceptance needs an upgrade.**
- **Other / Defer:** ___

### GM-24-Q28 — NEW: Public-board role filter has no Explorer option — add it?
- **Status:** NEW.
- **ACTUAL TODAY:** Vite `PUBLIC_ROLE_OPTIONS` and Expo `ROLE_OPTIONS` list Pharmacist/Intern/Assistant/Technician/Student only. EXPLORER-role shifts (shadowing/placement) exist as a role but cannot be filtered to on either client.
- **RECOMMENDED: Add "New to pharmacy" to the role filter on both clients.** Trivial, no decision needed beyond yes/no. Severity: low.
- **ALTERNATIVE A — Keep current logic.**
- **ALTERNATIVE B — (recommended, above).**
- **Other / Defer:** ___

### GM-24-Q29 — NEW: Daily public-shift limit is 10 per pharmacy per day — keep?
- **Status:** NEW.
- **ACTUAL TODAY:** `MAX_PUBLIC_SHIFTS_PER_DAY = 10`, enforced at posting and at escalation to PLATFORM; counts shifts that became public today. No UI explains the limit until it is hit (400 "Maximum of 10 public shifts per day reached…").
- **RECOMMENDED: Keep 10/day for launch; show the remaining quota in the Post Shift wizard before submit.** Severity: low.
- **ALTERNATIVE A — Keep current logic (10/day, silent until hit).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Raise/lower the limit (state number).**
- **Other / Defer:** ___

### GM-24-Q30 — NEW: Talent view counts — every authenticated view counts, no cap — keep?
- **Status:** NEW (TB-07 limb).
- **ACTUAL TODAY:** `add_view` increments on every authenticated call, no per-user/per-day cap; like/unlike are idempotent per user.
- **RECOMMENDED: Cap views at one per user per post per day (or per session).** View counts are shown as social proof; uncapped counts are gameable and meaningless. Severity: low.
- **ALTERNATIVE A — Keep current logic.**
- **ALTERNATIVE B — (recommended, above).**
- **Other / Defer:** ___

### GM-24-Q31 — NEW: Talent-post staleness — undated and full-time posts stay visible forever?
- **Status:** NEW (spin-out of AV-02, CHANGED).
- **ACTUAL TODAY:** Past-date posts are hidden, but undated posts and `FULL_TIME_APPLICATION` posts are visible forever (`is_talent_board_visible` returns True). No nudge to refresh was verified. Availability rows never expire either.
- **RECOMMENDED: Hide posts not updated in 30 days and nudge the author to refresh; full-time posts get the same rule.** Severity: medium (stale board kills trust).
- **ALTERNATIVE A — Keep current logic (visible forever).**
- **ALTERNATIVE B — (recommended, above).**
- **ALTERNATIVE C — Hide once the last listed date passes (already true for dated posts; extend nothing).**
- **Other / Defer:** ___

### GM-24-Q32 — Launch-gate check: are the mobile dead-ends fixed?
- **Old ID:** LA-Q03. **Status:** CHANGED (part) — carried as a check, not a fresh decision.
- **ACTUAL TODAY:** Explorer Shifts screen fixed (shared `ShiftsScreen`). The manager "add personal profile" limb (ON-04: legacy mobile onboarding posting unsupported fields / not-found route) was **not** re-validated in this area. The Explorer upgrade flow is the live path and works on both clients.
- **RECOMMENDED: A — Verify ON-04 in GM-01/GM-05 before launch; GM-24's own dead-ends are fixed.** Severity: medium.
- **ALTERNATIVE A — (recommended, above).**
- **ALTERNATIVE B — Soon after launch.**
- **Other / Defer:** ___

## 5. The SINGLE first decision question (ask the owner first)

**GM-24-Q01 — What can Explorers ("new to pharmacy") do with shifts?**

Plain English: today a newcomer can look at the public shifts and say "I'm interested" on shifts made for newcomers — but when a pharmacy tries to actually book them, the app fails at the last step, because newcomers have no payment setup and no way to accept. The only way to paid work is the Upgrade button (become a Pharmacist or Pharmacy team member, once, and start verification again). Everything else in GM-24 — the empty Community tab, the confusing error, the booking-request dead end — hangs off this one choice.

- **A — Keep current logic:** newcomers can express interest, but cannot accept. (Costs nothing to build; guarantees confused pharmacies and newcomers in week one.)
- **B — Newcomers can accept newcomer-role shifts as unpaid placements:** build a no-pay acceptance (placement/shadowing agreement, no TFN/ABN, no invoice). Needs a Fair Work check before launch.
- **C — Paid shifts only after upgrading (RECOMMENDED):** newcomers browse and can show interest in newcomer-role (placement/shadowing) posts, but paid work waits until they upgrade; and we fix the dead end at the same time — no firm offers to newcomers, and the Apply button points at the upgrade card where acceptance is impossible.
- **D — No shifts at all for newcomers:** hide the Shifts boards for Explorers entirely until they upgrade.
- **Other (describe) / Defer:** ___

Ask this one question, in conversation, before any other GM-24 question. The answers to Q03, Q07, Q09, Q14, Q19, Q22, and Q27 all change depending on it.

## 6. Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix once the owner answers the linked question)
| ID | Gap | Evidence | Linked Q |
|---|---|---|---|
| CG-01 | Authenticated talent feed/list/retrieve leak anonymous authors' names + user ids (only `public-feed` redacts) | `backend/talent/serializers/explorer.py::ExplorerPostReadSerializer` vs `PublicExplorerPostReadSerializer`; `backend/talent/views/explorer.py::get_serializer_class` | Q13 (fix after Q12) |
| CG-02 | Public-feed redaction ignores `is_anonymous=False` — identity exposed to anonymous visitors | `PublicExplorerPostReadSerializer.to_representation` | Q26 |
| CG-03 | Sitemap shift URLs use `?id=`; the share page needs `?token=` — dead links | `backend/core/sitemap.py::_build_shift_urls` vs `SharedShiftLandingPage.tsx` | Q23 |
| CG-04 | Share tokens have no expiry field | `backend/shifts/escalation.py::issue_share_token`; `Shift.share_token` | Q23 |
| CG-05 | Web/mobile `canRequestBooking` drift (fixed list vs any-non-worker; mobile proceeds without `dedicated_user`) | `frontend_web/.../TalentBoard/index.tsx::canRequestBooking`; `frontend_mobile/roles/shared/talent-board/index.tsx::canRequestBookingByRole` | Q15 |
| CG-06 | `add_view` counts every authenticated call, no cap | `backend/talent/views/explorer.py::add_view` | Q30 |
| CG-07 | Talent filtering is client-side only (`loadAllTalentPages`, page_size 200 on public page); no backend filter params | `shared-core/src/domains/talent/api.ts::getPublicTalentFeed`; `PublicTalentBoardPage.tsx` | Q31 / TB-04 |
| CG-08 | Role filter omits Explorer on both public boards | `PublicJobBoardPage.tsx::PUBLIC_ROLE_OPTIONS`; `AnonymousShiftBoardScreen.tsx::ROLE_OPTIONS` | Q28 |
| CG-09 | Match emails go to unverified workers; escalated shifts never notify (escalation sends nothing) | `backend/shifts/announcements.py::announce_availability_matches`; `backend/shifts/escalation.py::auto_escalate_due_shifts` | Q10, Q19 |
| CG-10 | Explorer Community tab permanently empty with no message (backend membership gate) | `backend/shifts/browse.py::CommunityShiftViewSet`; `shiftSurface.ts` (explorer sections include 'community') | Q22 |
| CG-11 | No test asserts anonymous-shift pharmacy redaction or authenticated-feed redaction | Searched tests: only public-feed redaction tested (`test_explorer_api.py`) | Q08, Q13 |
| CG-12 | Daily public-shift limit (10/day) is silent until hit (400 at submit) | `backend/shifts/limits.py` | Q29 |
| CG-13 | Visibility is not re-checked when Verified is revoked / AHPRA lapses after posting (talent) | `talent/views/explorer.py::_visible_posts` checks only `hidden_at`/dates | Q31 |
| CG-14 | Revoked-Verified / lapsed-AHPRA author posts stay visible (same root cause as CG-13) | As above | Q31 |

### Decision gaps (owner must choose first — do not build until answered)
| ID | Gap | Linked Q |
|---|---|---|
| DG-01 | What Explorers may do with shifts (browse / interest / accept / paid / unpaid) | Q01 |
| DG-02 | Where verification is enforced (public-only vs every outside booking vs + rostering) | Q03 |
| DG-03 | Pharmacy verification before public posting | Q07 |
| DG-04 | Anonymous pharmacy reveal point (agreement preview / reservation / payment / never) | Q09 |
| DG-05 | Who sees the talent board; when anonymous identity is revealed | Q11, Q12 |
| DG-06 | Request booking: firm offer vs enquiry | Q14 |
| DG-07 | Rating eligibility (approved timesheet/clock-out vs past date) + internal ratings on public cards | Q17, Q18 |
| DG-08 | Talent staleness rule (hide after N days? nudge?) | Q31 |
| DG-09 | Which public site is canonical (Vite vs Next) | Q24 |
| DG-10 | Anonymous detail: keep postcode + script volume? | Q08, Q25 |

## 7. Decision status per question

| Question | Status | Old ID |
|---|---|---|
| GM-24-Q01 Explorer shifts | NOT VERIFIED → CURRENT FLOW TRACED (owner decision needed — ask first) | ON-Q05 |
| GM-24-Q02 Before Verified | CURRENT FLOW TRACED | ON-Q02 |
| GM-24-Q03 Where verification enforced | CURRENT FLOW TRACED | ON-Q03 |
| GM-24-Q04 AHPRA exemptions | CURRENT FLOW TRACED | ON-P01 |
| GM-24-Q05 Sign-up tracks | CURRENT FLOW TRACED | ON-Q01 |
| GM-24-Q06 ID check | CURRENT FLOW TRACED | ON-Q08 |
| GM-24-Q07 Pharmacy verification before posting | CURRENT FLOW TRACED | ON-Q11 |
| GM-24-Q08 Anonymous post: what is hidden | CURRENT FLOW TRACED | PO-Q11 |
| GM-24-Q09 Anonymous name reveal | CURRENT FLOW TRACED | PO-Q12 |
| GM-24-Q10 Escalation notify/stop | CURRENT FLOW TRACED | PO-Q08 |
| GM-24-Q11 Who sees talent board | CURRENT FLOW TRACED | TB-Q01 |
| GM-24-Q12 Anonymous identity reveal | CURRENT FLOW TRACED | TB-Q02 |
| GM-24-Q13 Fix LA-Q12 before launch | CURRENT FLOW TRACED | LA-Q12 |
| GM-24-Q14 Firm offer vs enquiry | CURRENT FLOW TRACED | TB-06 |
| GM-24-Q15 Request-booking drift | CURRENT FLOW TRACED | TB-07 |
| GM-24-Q16 Reviews/reliability | CURRENT FLOW TRACED | TB-Q05 |
| GM-24-Q17 Who can rate, when | CURRENT FLOW TRACED | CX-Q34 |
| GM-24-Q18 Internal ratings on public board | CURRENT FLOW TRACED | CX-Q35 |
| GM-24-Q19 Match emails (unverified/escalated) | CURRENT FLOW TRACED | LA-Q17 |
| GM-24-Q20 Urgent opt-in | CURRENT FLOW TRACED | AV-Q08 |
| GM-24-Q21 Anonymous sees every role | CURRENT FLOW TRACED (new) | — |
| GM-24-Q22 Empty Community tab | CURRENT FLOW TRACED (new) | — |
| GM-24-Q23 Sitemap/token expiry | CURRENT FLOW TRACED (new) | — |
| GM-24-Q24 Vite vs Next canonical | CURRENT FLOW TRACED (new) | — |
| GM-24-Q25 Postcode/script volume | CURRENT FLOW TRACED (new) | — |
| GM-24-Q26 Non-anonymous public identity | CURRENT FLOW TRACED (new) | — |
| GM-24-Q27 Fail-fast on Explorer offers | CURRENT FLOW TRACED (new) | — |
| GM-24-Q28 Role filter: Explorer option | CURRENT FLOW TRACED (new) | — |
| GM-24-Q29 Daily public limit 10/day | CURRENT FLOW TRACED (new) | — |
| GM-24-Q30 View-count cap | CURRENT FLOW TRACED (new) | — |
| GM-24-Q31 Talent staleness | CURRENT FLOW TRACED (new) | AV-02 |
| GM-24-Q32 Mobile dead-ends check | CURRENT FLOW TRACED (partial) | LA-Q03 |

No question in this area is OWNER DECIDED. Nothing here is IMPLEMENTED, WEB VERIFIED, EXPO VERIFIED, or LAUNCH SIGNED OFF.

## 8. Implementation backlog (separate — only after the owner answers)

Do not treat any item below as decided. Order is suggested, not approved.

| # | Item | Depends on | Severity / launch impact |
|---|---|---|---|
| B-01 | Redact anonymous talent authors on authenticated feed/list/retrieve (use public shape for anonymous posts); add tests for both feeds | Q12, Q13 | Launch-gating (privacy) |
| B-02 | Redact identity on the public feed regardless of `is_anonymous` flag | Q26 | High (privacy) |
| B-03 | Enforce the Q01 outcome: either Explorer no-pay acceptance + terms, or block offers/apply for Explorers + upgrade CTA | Q01 (first) | Launch-gating |
| B-04 | Verification gate at dedicated-offer creation + chain/org/community interest | Q03 | High (trust) |
| B-05 | Pharmacy verification gate before public posting (ABN / admin) | Q07 | High (trust) |
| B-06 | Anonymous pharmacy reveal at the agreed point (agreement preview recommended) | Q09 | High |
| B-07 | Talent board visibility: employer-only + own post (backend permission change) | Q11 | High |
| B-08 | Request booking: enquiry/chat-first flow (or firm-offer warning) + one shared `canRequestBooking` in shared-core | Q14, Q15 | Medium |
| B-09 | Rating eligibility: approved timesheet/clock-out; exclude internal ratings from public average | Q17, Q18 | High (trust signal) |
| B-10 | Escalation + match-email notifications (notify new tier; match on escalation; Verified filter) | Q10, Q19 | High (liquidity) |
| B-11 | Hide Explorer Community tab (or open read-only community) | Q22 | Medium (UX) |
| B-12 | Sitemap: real share URLs or drop shift URLs; share-token expiry | Q23 | Medium (SEO/safety) |
| B-13 | Canonical public site: Next for public pages; freeze Vite public duplicates | Q24 | Medium |
| B-14 | Anonymous detail: drop postcode (+ script volume) | Q08/Q25 | Medium (privacy) |
| B-15 | Talent staleness: 30-day hide + refresh nudge; re-check visibility on Verified revocation | Q31 | Medium |
| B-16 | View-count cap (one per user/post/day); backend talent filter params + stop loading all pages | Q30, TB-04 | Low–medium (scale) |
| B-17 | Role filter: add Explorer option (both clients) | Q28 | Low |
| B-18 | Show remaining public-shift quota in Post Shift wizard | Q29 | Low |
| B-19 | Reviews/reliability split on talent cards (once incident data exists) | Q16 | Medium |
| B-20 | ID check before first paid booking (if Q06 goes beyond current logic) | Q06 | Medium |

**Acceptance tests to write per item (after decisions):** normal case, failure case, duplicate/concurrent (double interest, double accept, double like), cross-pharmacy (wrong tenant cannot see/act), stale session (logged-out mid-flow), clock/timezone (offer expiry vs shift start; past-date rating rule), worker/owner/admin/org roles, and actual web + Expo behaviour for each. Treat missing mobile function as a parity gap.

## 9. Per-question source links (head `97c4543e`)

- Explorer role / registration: `backend/users/models.py` (ROLE_CHOICES, SELF_REGISTRATION_ROLES, `mobile_check_skipped`)
- Explorer verification gate: `backend/talent/views/explorer.py::_require_public_staff_access`, `_create_newcomer_post`
- Talent feed/redaction/visibility: `backend/talent/views/explorer.py` (feed, public_feed, get_queryset, _visible_posts, add_view, like/unlike); `backend/talent/serializers/explorer.py` (ExplorerPostReadSerializer, PublicExplorerPostReadSerializer); `backend/talent/models.py::is_talent_board_visible`; `backend/talent/test_explorer_api.py`
- Public shifts: `backend/shifts/browse.py` (CommunityShiftViewSet, PublicShiftViewSet, PublicJobBoardView, SharedShiftDetailView); `backend/shifts/base.py:116` (IsAuthenticated), `:212` (express_interest action); `backend/shifts/urls.py`
- Role visibility: `backend/shifts/access.py::_shift_roles_visible_to_user`, `_user_can_perform_shift_role`, `IsPharmacistOrOtherStaff`
- Interest gate: `backend/shifts/interest.py::express_interest`, `_require_public_shift_onboarding`, `is_public_shift_member_access`; `backend/onboarding/verification/state.py::require_public_ahpra`, `require_ahpra_application`, `queue_public_recheck`, `lock_public_ahpra`
- Accept/terms/payment: `backend/shifts/offers.py::accept` (:338), `ShiftOfferViewSet.get_queryset`; `backend/shifts/engagement.py::worker_onboarding` (:25), `_external_payment_profile` (:265), `worker_payment_profile_status` (:199), `build_shift_engagement_terms` (:572)
- Dedicated offers: `backend/shifts/assignment.py::offer_dedicated_shift` (:259), `OFFER_EXPIRY_HOURS = 48` (:22); `backend/shifts/posting.py::post_shift`, `protect_direct_booking`
- Anonymous redaction: `backend/shifts/serialization/shifts.py::to_representation` (:199), `get_ui_address_line` (:257); `backend/organizations/serializers.py::anonymize_pharmacy_detail` (:53), `user_can_view_full_pharmacy`
- Rates: `backend/shifts/rate_visibility.py::published_rates_visible`, `project_published_rates`
- Limits: `backend/shifts/limits.py::MAX_PUBLIC_SHIFTS_PER_DAY = 10`
- Escalation: `backend/shifts/escalation.py::auto_escalate_due_shifts`, `escalate_shift`, `issue_share_token`
- Notifications/match: `backend/shifts/announcements.py::announce_posted_shift`, `announce_availability_matches`
- Ratings: `backend/ratings/views.py::_has_completed_relationship_owner_to_worker`, `_has_completed_relationship_worker_to_pharmacy`, `create`
- Upgrade: `backend/users/api_account.py::ChooseAccountTypeView`; `backend/onboarding/services/upgrade.py::upgrade_newcomer`; `shared-core` `UPGRADE_COPY`, `chooseAccountType`
- Sitemap/SEO backend: `backend/core/sitemap.py`, `backend/shifts/public_sitemap.py`, `backend/public_hub/sitemap.py`, `backend/core/sitemap_port.py`
- Vite public pages: `frontend_web/src/pages/PublicJobBoardPage.tsx`, `PublicTalentBoardPage.tsx`, `SharedShiftLandingPage.tsx`, `LandingPage.tsx`, `navigation.tsx::getExplorerNav`, `components/PublicRouteBridge.tsx`, `utils/seo.ts`, `pages/dashboard/sidebar/TalentBoard/index.tsx`, `pages/dashboard/sidebar/TalentBoard/hooks/loadAllTalentPages.ts`
- Next: `frontend_web/landing_next/app/(public)/shifts/public-board/page.tsx`, `app/(public)/talent/public-board/page.tsx`, `app/sitemap.ts`, `app/robots.ts`
- Expo: `frontend_mobile/roles/explorer/{shifts.tsx,dashboard.tsx,profile.tsx,UpgradeAccountCard.tsx}`, `roles/shared/shifts/{shiftSurface.ts,publicShiftRoute.ts,PublicShiftsView.tsx,AnonymousShiftBoardScreen.tsx,SharedShiftLandingScreen.tsx,ShiftsScreen.tsx}`, `roles/shared/talent-board/index.tsx`
- Shared-core: `src/domains/shifts/api.ts` (`getPublicJobBoard`, `fetchPublicShifts`, `expressInterestInPublicShiftService`), `src/domains/talent/api.ts` (`getPublicTalentFeed`, `getExplorerPostFeed`), `src/domains/auth/api.ts` (`chooseAccountType`)
- #184 sources: `docs/qa/launch-grill/AUDIT.md` + `questions.json` on `refs/pull/184/head` (`c786a4b8182ebf9b505d47cd81980eb3b9851ce3`); Issue #250; PR #248 (`25939534`); PR #249 (`97c4543e`)

## 10. Unknowns / not inspected (do not assume)

- Whether a scheduled (beat) task runs `auto_escalate_due_shifts` (SH-05 limb) — the function is still called from `BaseShiftViewSet.get_queryset`; no beat schedule was checked in this area.
- Whether any test covers anonymous-shift pharmacy redaction (none found; not exhaustively searched).
- Expo public talent board: no public talent screen was found in Expo in the paths checked — whether Expo has one at all is unconfirmed (the Vite public talent page is the only one traced).
- `public_hub` editorial content pages (blog/news/content) line-by-line behaviour — structure only.
- ON-Q07 / ON-P02 (AHPRA suspension handling), TB-05 (heart vs favourites), TB-09 (block list), AV-01/AV-06 (availability sync/hiring) — not re-validated in this area; they belong to GM-01/GM-18/GM-19/GM-25 as noted in §3.
- Live behaviour: nothing was run (no builds, tests, browser runs, or live site checks). The staging site's reachability was not re-checked here.
- The Vite `main.tsx` route table was not individually enumerated; public routes are evidenced by the sitemap, `PublicRouteBridge`, and `LandingPage.PAGE_ROUTES`.


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-24-W01: What happens to explorer accounts that already hold admin rows in production? (W-10, D96)
**Scenario:** before the D96 guard existed, Zoe (an Explorer) was made a pharmacy manager at Tom's.
**What happens today:** on the Expo branch the guard refuses any new admin grant to an Explorer (`pr257:backend/access_control/admin_roles.py`; not yet on deployed main), but rows created before it stay. The dev database has 0 such rows. The production count is unknown until the read-only query `explorer-admin-counts.sql` (mobile-mirror work folder) runs on production.
**Recommendation first: A.** Count first. If any are found, end those admin rows and tell the pharmacy owner; Zoe keeps her ordinary Explorer access.
- **A (recommended):** run the count; end any explorer admin rows and notify the owner.
- **B:** run the count; each owner decides case by case.
- **DEFER:** only if the count is 0.

**Status:** OPEN (needs the production count; the rule itself is answered by D96)

### Answered, not re-asked: role conversion to Explorer (owner, 13 Nov, D93)
"Explorer will not get invoices and owner or pharmacist will not change to explorer." Any question about a pharmacist or owner becoming an Explorer, or about Explorer invoices, is answered: it doesn't happen. The Explorer-to-Pharmacist upgrade (section 1.4) stays in scope.
