# GM-11 — Audience / Escalation — Grill Me trace (READ-ONLY, docs only)

> **Corrections against current code (21 Nov 2026 review).** 10 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 7 hold, 3 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q01 / Q02 / Q10 | stops “for good once anyone has shown interest” | WRONG | Automatic escalation pauses while interest rows exist. If all interest is deleted, a later query can escalate again; decline or offer expiry alone does not delete those rows. | current-row predicate: `main:backend/shifts/escalation.py:91`; deletable interests: `pr257:backend/shifts/offers.py:48`; requester scope: `:57` |
| Q08, carried premise | worker never sees pharmacy name before accepting | WRONG | There is no uniform pre-acceptance anonymity guarantee: profile-reveal and shift-update notifications include the pharmacy’s real name. Record this disclosure defect instead of repeating the historical guarantee. | GAP reveal notice: `main:backend/shifts/candidates.py:120`; `pr257:backend/shifts/candidates.py:132`; GAP edit notice: `pr257:backend/shifts/emails.py:434` |
| CG-11-08 | recipients beyond 50 “silently” omitted | WRONG about silence | Posting notices are capped at 50 recipients and truncation is logged. There is no user-facing explanation in this helper. | `main:backend/shifts/announcements.py:424`; `pr257:backend/shifts/announcements.py:425` |

**Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Issue:** #250 — Grill Me, one consolidated backend + Web + Expo sign-off before launch
**Method source:** PR #184 (`docs/qa/launch-grill/questions.json`, `AUDIT.md`, `LAUNCH_GRILL.html`), head `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`
**Revalidation target:** active PR #249, stacked on #248
**Status of this document:** DOCUMENTATION ONLY. No code was changed, no PR/issue/comment created. No implementation is decided here. Progress label: **CURRENT FLOW TRACED** (backend + Vite web + Expo wizard traced at head; Next parity and a few details still UNKNOWN — see §6).

## Bases (exact SHAs verified 2026-11-21)

| Base | SHA / ref | Verified |
|---|---|---|
| PR #249 head (traced) | `97c4543e051b43fe30ec7e2e61ad3d69957a918e` | `pull_request_read` get, 2026-11-21. Open draft, branch `fix/pr248-expo-production-waves-20261104`, 458 commits, 314 files, base `feat/mobile-merge-sdk` (`c98cf2ef74c6de356cceb8dee3a61dad47b6b843`). Unchanged from Issue #250 snapshot. |
| PR #249 body "working head `26cae2d6`" | — | **Resolved:** that is the short SHA of the last *implementation commit listed in the PR body*, not the branch head. Trace at the API head above and record this resolution. Do not re-open it. |
| PR #184 (format source) | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020`, draft, 3 commits, 8 files | `questions.json` (142 questions) + `AUDIT.md` (35 gaps) fetched from `refs/pull/184/head`. |
| Issue #250 | open | 26 areas GM-01–GM-26; reuse 142 legacy questions + 30 carried decisions from #184; revalidate against active #249. |

**Rate limit:** no HTTP 429 was encountered in this re-run. GitHub calls were made strictly one at a time with ≥8 s between calls. Every file below was fetched at `refs/pull/249/head` unless marked "search-only (default branch)".

## Files verified at head `97c4543e`

| File | Lines | What it proves |
|---|---|---|
| `backend/shifts/escalation.py` | 154 | Tier order, `allowed_tiers()`, `auto_escalate_due_shifts`, `escalate_shift`, `issue_share_token` |
| `backend/shifts/base.py` | 431 | `get_queryset` lazy escalation trigger, permissions, `escalate` action, counter-offer submit gate, `accept_user`, buzz cooldown value |
| `backend/shifts/browse.py` | 731 | Community/public/job-board visibility querysets, `claim_shift` |
| `backend/shifts/announcements.py` | 581 | `announce_posted_shift`, `announce_availability_matches`, caps, anonymous narrowing |
| `backend/core/celery.py` | 19 | Beat schedule (no shift-escalation job) |
| `backend/core/settings.py` | 723 | `CELERY_BEAT_SCHEDULE`, billing flags |
| `backend/shifts/tasks.py` | 86 | `send_shift_reminders` only |
| `backend/shifts/posting.py` | 290 | Posting-time escalation stamps, PLATFORM daily limit (GM-10 overlap) |
| `shared-core/src/domains/shifts/postingDraft.ts` | 105 | Wizard payload: escalation timestamps per tier, notify flags on create only |
| `frontend_web/shared/postShift/PostShiftVisibilityStep.tsx` | 204 | Vite audience picker, escalation modes, notify switches, anonymous toggle |
| `frontend_mobile/roles/shared/shifts/PostShiftVisibilityStep.tsx` | 238 | Expo audience picker — mirrors web |
| `frontend_web/shared/postShift/PostShiftForm.tsx` | 779 | Wizard shell: in-memory draft, urgent toggle, submit |

**Adopted, not re-traced:** GM-01 sessions, GM-02 AHPRA/Verified gates, GM-05 roles, GM-18 identity leak (LA-Q12 STILL VALID), GM-25 structural trace. GM-12 covers interest/offers (escalation overlap in GM-12-Q19).

## Plain-English summary

A pharmacy posts a shift. It does not go to everyone at once. It goes to a narrow group first, then — if nobody takes it — to wider and wider groups. That widening is **escalation**. The groups, in order, are:

1. **FULL_PART_TIME** — the pharmacy's own full-time / part-time staff
2. **LOCUM_CASUAL** — favourite / casual locums the pharmacy already knows
3. **OWNER_CHAIN** — other pharmacies owned by the same owner
4. **ORG_CHAIN** — the wider organisation / multi-site group
5. **PLATFORM** — everyone on the platform (public)

The tier names are confirmed at head (see §1). Two Oct 2026 carried decisions are now **confirmed in current code**: E01B (no organisation-wide broadcast — `announcements.py` has no org-wide recipients) and E03 (owner picks escalation intervals at posting — wizard + `escalate_to_<tier>` payload fields). E01A (earlier audiences keep access) is **partly violated** for favourites — see NEW finding in §1.2 and GM-11-Q13.

---

## 1. GM-11 traced flow — ACTUAL TODAY (verified at head)

### 1.1 Current-flow matrix

| # | Trigger | Actor | Backend / API (verified at 97c4543e) | Vite web | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F1 | Owner/manager posts a shift, picks starting audience + escalation schedule | Owner / authorised manager (`user_can_manage_pharmacy` — `base.py:check_permissions`) | `post_shift` (`posting.py`): `escalation_level` = index of chosen visibility; `escalate_to_<tier>` timestamps stored; PLATFORM at posting: daily limit enforced, `escalate_to_platform` stamped now; `announce_posted_shift` + `announce_availability_matches` on commit | Post Shift wizard: `PostShiftVisibilityStep.tsx` (204 lines) — 5 radio cards ("Your pharmacy team", "Your favourite staff", "Your other pharmacies", "Your organisation", "Everyone on ChemistTasker"), escalation mode auto/custom/off, per-tier date inputs, notify switches, anonymous toggle | `PostShiftVisibilityStep.tsx` (238 lines) — same 5 tiers/labels, same modes, date+time pickers instead of datetime inputs, same notify switches + "Hide the pharmacy name" | Shift + `visibility`, `escalation_level`, `escalate_to_*` timestamps, `post_anonymously`, notify flags | Posting-time notices per flags (F4); availability-match emails only if PLATFORM (F5) | Wrong role / wrong tenant: create requires `user_can_manage_pharmacy`; denied otherwise (GM-05 roles adopted) |
| F2 | Shift sits unfilled; escalation interval elapses | System (no actor) | **No scheduled job.** `get_queryset` (`base.py`) calls `_auto_escalate_shifts(now)` on **EVERY list/detail request** → SH-05 STILL VALID. `celery.py` schedules only goods marketplaces + ethical escalations (60 s). `CELERY_BEAT_SCHEDULE` (`settings.py`): ahpra-overdue-alerts (*/15), publish-editorial-revisions (60 s), calendar birthdays/work-notes, shift-reminders-hourly — **no shift-escalation, no offer-expiry, no reservation-expiry job** | Any shift-list/detail page load triggers the scan | Any Expo shift-list/detail load triggers the same backend scan (shared backend; no separate Expo trigger) | Audience tier advanced on the shift | **No notification is sent** (no notify/email in `escalation.py`) | If nobody browses, escalation fires late or never. Every request scans every due shift (performance cost). No retry — next page view retries it. |
| F3 | Shift escalates to a wider tier | System | `auto_escalate_due_shifts` (`escalation.py`): only shifts with **NO interest ever** (`interests__isnull=True`); PLATFORM step skipped while pharmacy at daily public-shift limit; `stamp_missing=False`. `escalate_shift`: one tier up or to target; going public counts vs daily limit; no notification. `issue_share_token`: PLATFORM-only, rotates token. | Newly eligible workers see the shift on next list load | Same, on next Expo list load | Wider tier + tier timestamps persisted | **None** — no email / push / in-app notice to the new audience (SH-06) | None — workers only discover it by browsing |
| F4 | Shift posted (posting-time notices) | System at posting | `announce_posted_shift` (`announcements.py`, on commit from `post_shift`): visibility→allowed-flags map (FULL_PART_TIME staff only; LOCUM_CASUAL staff+favourites; OWNER/ORG/PLATFORM staff+favourites+chain); **anonymous narrows: PLATFORM anonymous → NO notices at all**; flags default False unless wizard passes them; recipients: staff FT/PT/CASUAL, favourites LOCUM/SHIFT_HERO, chain members (staff+favourites at chain pharmacies); **no org-wide recipients — E01B confirmed**. Cap `SHIFT_EMAIL_RECIPIENT_CAP = 50`. | Notify switches in wizard ("Email and notify …") | Same switches | Notify flags on shift (create only — `postingDraft.ts` sends them only when `!editingShiftId`) | Email + in-app to flagged recipients | Flags off → silent. Anonymous PLATFORM → silent even if flags on. Cap 50: recipients beyond 50 are silently not emailed (cap behaviour — see CG-11-08). |
| F5 | Availability-match emails | System at posting | `announce_availability_matches` (`announcements.py`): **ONLY if `visibility == PLATFORM` at posting time**; recipients `notify_new_shifts=True`, role must cover shift, travel prefs must allow; **NO Verified filter — AV-04 second half STILL VALID; no re-run on escalation — AV-04 first half STILL VALID**. `_availability_matches_slot`: any overlap (`availability.start <= slot_end AND availability.end >= slot_start`) — AV-03 notifications use any-overlap. | — | — | — | Email to available workers | Unverified workers emailed shifts they are then blocked from applying to. Shifts that later escalate to PLATFORM never get this email. |
| F6 | Any worker shows interest | Worker | `auto_escalate_due_shifts` skips any shift that has **ever** had interest (`interests__isnull=True`) — **any interest ever, even declined/rejected/expired, stops auto-escalation permanently**; no resume path in `escalation.py` (SH-06 stop rule confirmed at head) | Shift stops widening | Shift stops widening | Interest record persists; escalation permanently stopped | No resume on decline / expiry / withdrawal | **Stranded shift:** one declined applicant stops escalation for good, even though the slot is still empty. No owner override in this file. |
| F7 | Offer pending | Worker / owner | No pause/resume rule tied to pending offers in `escalation.py` (PO-Q09). Escalation already stopped by F6 (first interest). Offer expiry is flat 48h (`OFFER_EXPIRY_HOURS = 48`, `assignment.py` — GM-12), applied lazily. | — | — | Offer PENDING, `expires_at` | Escalation already stopped | Pending offer can outlive the shift start (SH-07); no cap at start. |
| F8 | Unpaid reservation expires | System | Release to the **same audience**, notify worker + manager, **no auto-escalation, no penalty** (carried D03 — decision only; the reservation-expiry *implementation* was NOT found: no `reservations.py` in `backend/shifts/`, no beat entry in `settings.py`/`celery.py` — the Oct 2026 "every 60 s" claim was NOT confirmed. GM-13 billing territory; see §6 UNKNOWN). | — | — | Reservation released | Worker + manager notified (per D03) | Shift does NOT widen on expiry — re-opens to same tier only. |
| F9 | Anonymous public post | Owner | Public redaction via `anonymize_pharmacy_detail` (`serialization/shifts.py:to_representation`); exact redacted field list NOT re-verified at head (see Q07 PARTLY). `post_anonymously` on Shift; anonymous included in `PublicShiftViewSet` (search excludes name/street for anonymous). | Anonymous card: "Anonymous Pharmacy" (Oct 2026 wording; card component not re-read at head) | Parity NOT inspected at screen level — anonymous toggle exists in Expo wizard | `post_anonymously` flag | Worker never sees the name before accepting (per Oct 2026; terms dialog + reminder-email naming NOT re-verified — see Q08 PARTLY) | Worker accepts blind; name surfaces only via reminder email (Oct 2026). |
| F10 | Roster published | Owner/manager | Roster publishing **never** triggers escalation (E03 — confirmed by absence: no roster→escalation call in `escalation.py`/`base.py` traced paths) | Roster screens | Roster screens (parity unknown) | Roster state separate from escalation | None | — |
| F11 | Worker at each tier views a shift | Worker | `CommunityShiftViewSet.get_queryset` (`browse.py`): first filter `visibility IN COMMUNITY_LEVELS` OR (`PLATFORM` + not anonymous); excludes slots with `unpublished_at`; FT/PT slotless allowed; future-or-current slots only. `eligible_q` per tier: FULL_PART_TIME = active ACCEPTED staff (FT/PT/CASUAL) at that pharmacy; LOCUM_CASUAL = active ACCEPTED favourites (LOCUM/SHIFT_HERO) at that pharmacy OR staff (non-anonymous); OWNER_CHAIN = active staff member at any pharmacy with the same owner; ORG_CHAIN = active staff member at any pharmacy in the same org. Then `role_needed IN _shift_roles_visible_to_user(user)`. Filters: search (incl. pharmacy name/street), roles, employment_types, city/state, min_rate, only_urgent, negotiable_only (rate_type FLEXIBLE), flexible_only, travel/accommodation, bulk (≥5 slots), time_of_day, start/end date, unassigned. `PublicShiftViewSet`: PLATFORM, dedicated null, `public_hidden_at` null; role-filtered; anonymous included. `PublicJobBoardView` (AllowAny): PLATFORM only, open unassigned slots only (`assigned_count < slot_count`), ordered `-created_at`, no role gating, org filter param. `SharedShiftDetailView` (AllowAny): by share token; computes `is_closed`. | Boards filter by audience | Boards filter by audience; Explorer shifts tab state not inspected | — | Worker may browse boards after login; public applying needs Verified; staff/favourites skip Verified (GM-12-Q01 — the gate is PLATFORM-only at interest) | Wrong tenant / denied role: visibility queryset enforces tier membership; cross-pharmacy staff do not see community shifts they are not eligible for. **NEW — E01A partly violated for favourites (see §1.2).** |

### 1.2 NEW FINDING — E01A partly violated for favourites

**What the code does:** the OWNER_CHAIN and ORG_CHAIN branches of `eligible_q` (`browse.py`) require PHARMACY_STAFF employment types only (FT/PT/CASUAL staff at a pharmacy sharing the owner/org). A **pure favourite** of the posting pharmacy — a LOCUM/SHIFT_HERO favourite with no staff membership anywhere in the chain/org — therefore **loses community-list visibility once the shift escalates past LOCUM_CASUAL**, even though E01A says "earlier audiences keep access; wider posting adds viewers". That favourite regains visibility only when the shift reaches PLATFORM (via `PublicShiftViewSet`).

**What it is not:** this is not a settled E01A violation for *staff* — staff keep visibility through their own pharmacy sharing the owner/org. It is specific to favourites. It may be deliberate (favourites are "known locums", chain staff are "internal") or an oversight in the queryset. It needs an owner decision, not a silent fix — see GM-11-Q13.

**Related:** `get_queryset` in `base.py` does NOT filter by visibility tier at all (only `dedicated_user` for worker roles) — the tier filtering lives in `browse.py`. The owner/manager list view and the worker browse view therefore enforce visibility in different places; that split is worth a test, not a decision.

### 1.3 Escalation timing and triggers (verified)

- **Trigger:** elapsed owner-picked interval since posting / since last tier (E03). Owner picks intervals in the wizard (mode auto/custom/off; per-tier dates in custom mode; `escalate_to_<tier>` payload fields; `postingDraft.ts`).
- **NOT a trigger:** roster publishing; reservation expiry (D03 — same audience only); page views are not a *rule*, they are the accidental *engine* (SH-05).
- **Engine (the defect):** lazy, request-driven. No Celery beat task, no cron, no background worker. Due escalations fire only when *someone* loads a shift list or detail page, late or never if nobody browses, and each such request scans every due shift.
- **Stop rule (the defect):** any past interest stops escalation permanently, including declined/withdrawn/expired interest (SH-06, `escalation.py` filter `interests__isnull=True`).
- **Notification on escalation:** none, at any tier (SH-06).
- **Late-fire bound:** none defined in code; GM-11-Q03 asks the owner to choose 1 / 5 / 15 minutes once a scheduled job exists.

### 1.4 Web vs Expo parity (verified at head for the wizard)

- **Posting wizard — Visibility step: PARITY.** Web `PostShiftVisibilityStep.tsx` (204 lines) and Expo `PostShiftVisibilityStep.tsx` (238 lines) expose the same 5 tiers with identical labels/hints, the same escalation modes (auto/custom/off), the same per-tier dates, the same three notify switches, and the same anonymous toggle. The only differences are presentation: web uses datetime inputs with chained minimums; Expo uses separate date + time pickers. Shared payload logic lives in `shared-core` (`postingDraft.ts`), so both clients send the same `escalate_to_<tier>` / notify fields.
- **Backend rules are shared** (Django), so visibility/escalation *rules* are identical on both clients — the gaps are in the *screens and triggers* (list loads, push vs email discovery).
- **Next web: NOT FOUND.** A search for `post-shift` in `frontend_web/landing_next` returned only a TalentBoard hit — no Next post-shift page was found. Next parity for the posting wizard is therefore UNKNOWN-to-negative (needs GM-25 confirmation; do not assume a Next wizard exists).
- **PR #249 W3b handover notes** Post Shift prefills/retry, templates, draft/publish as unfinished work — the wizard traced here posts immediately on submit; there is **no server-side draft state** (GM-10). The client-side "draft" is in-memory form state only (`PostShiftForm.tsx:postingDraft()`).
- **Explorer shifts tab** (blank placeholder in Oct 2026) — not inspected in this trace; UNKNOWN.

---

## 2. Old-question revalidation table (PR #184 → head `97c4543e`)

Status key: **STILL VALID** = re-checked in current code, same behaviour · **CHANGED** = re-checked, behaviour differs from Oct 2026 wording · **PARTLY** = one half checked, the other not · **NO LONGER VALID** = the behaviour is gone / fixed. "Keep current logic" is offered only where the inspected code actually shows current logic.

| Q | Old ID | Status | What changed / what was confirmed (file:line at 97c4543e) |
|---|---|---|---|
| GM-11-Q01 | PO-Q08 / SH-06 | **STILL VALID** | No escalation notification (`escalation.py` has no notify/email calls); any-interest stop rule confirmed (`interests__isnull=True`). |
| GM-11-Q02 | PO-Q09 | **STILL VALID** | No pause-on-pending-offer rule in `escalation.py`; stop rule makes it moot in practice. |
| GM-11-Q03 | PO-Q10 / SH-05 | **STILL VALID** | Lazy per-request scan confirmed (`base.py:get_queryset` → `_auto_escalate_shifts`); no beat job (`celery.py`, `settings.py:CELERY_BEAT_SCHEDULE`). |
| GM-11-Q04 | LA-Q08 / SH-05 | **STILL VALID** | Same facts as Q03; launch-gate question. |
| GM-11-Q05 | LA-Q17 / AV-04 | **STILL VALID** | Match emails PLATFORM-only at posting (`announcements.py:announce_availability_matches`); no Verified filter; no re-run on escalation. |
| GM-11-Q06 | E01 slice | **CHANGED** | Late start exists (wizard starting-tier choice + `allowed_tiers()` conditional list; create requires `user_can_manage_pharmacy`). New nuance: a PLATFORM post is visible to earlier tiers too via `browse.py` (PLATFORM + not anonymous) — "skipping" is about priority window/notification, not visibility. Who may start late (manager vs owner) and skip logging remain open. |
| GM-11-Q07 | PO-Q11 | **PARTLY** | Redaction mechanism confirmed present (`anonymize_pharmacy_detail` in `serialization/shifts.py:to_representation`; anonymous included in public queryset). Exact redacted field list (name/street/software/services hidden; suburb/state/postcode/script volume/rate shown) NOT re-verified at head. |
| GM-11-Q08 | PO-Q12 | **PARTLY** | Reminder job confirmed (`tasks.py:send_shift_reminders`, hourly beat). Whether the 12-hour reminder email names the pharmacy on anonymous shifts NOT verified. Terms-dialog omission NOT re-verified. |
| GM-11-Q09 | PO-Q13 | **STILL VALID** | Urgent is only the owner's switch (`PostShiftForm.tsx:isUrgent`; `is_urgent` on Shift); nothing turns on automatically near start; `only_urgent` filter exists in `browse.py`; no urgency→escalation rule. |
| GM-11-Q10 | BK-Q06 slice | **STILL VALID** | Decline/expiry does not resume escalation (SH-06 stop rule); D03 same-audience release only (decision; implementation not found — see §6). |
| GM-11-Q11 | ON-Q03 / ON-P01 | **CHANGED** | Gate proven PLATFORM-only at interest (`interest.py` via GM-12); chain/org/favourite bypass hole proven end-to-end (`onboarding/verification/state.py:require_public_ahpra` is a no-op for non-public shifts — GM-12-Q01). Favourites are NOT checked on chain/org bookings today. |
| GM-11-Q12 | E01B follow-up | **STILL VALID** | Flags exist in wizard + `announcements.py`; no org broadcast confirmed (no org-wide recipients); escalation sends nothing, so the per-tier flag question is downstream of Q01. |
| GM-11-Q13 | NEW | **NEW** | Favourites lose community-list visibility past LOCUM_CASUAL (`browse.py:eligible_q` OWNER/ORG branches require PHARMACY_STAFF types only). E01A partly violated. |
| E01 / E01A / E01B / E03 / D03 | carried | **PARTLY** | E01B confirmed (no org recipients); E03 confirmed (wizard intervals); E01A partly violated (Q13); E01 order confirmed (tier order in `escalation.py`); D03 decision stands but reservation-expiry implementation NOT found. |

---

## 3. Question queue — #184 format

Severity: 🔴 launch-gating · 🟠 high · 🟡 medium. Severity is re-assessed against current code, not carried from Oct 2026.

### Carried decisions (do not re-ask; implementation status as in §2)

| ID | Decision (Oct 2026) | Implementation at head |
|---|---|---|
| E01 | Audience order: Staff → favourites → owner chain → organisation → public. Owner may start at a later tier and post anonymously to public. | Confirmed (`escalation.py` tier order; wizard starting-tier choice). |
| E01A | Earlier audiences keep access. Wider posting adds viewers. Skipping a notice never hides the shift. | **Partly violated** for favourites (Q13). |
| E01B | Keep existing staff, favourite and chain notice flags. No organisation-wide broadcast. | Confirmed (no org-wide recipients). |
| E03 | Owner picks escalation intervals when posting. Roster publishing never triggers escalation. | Confirmed (wizard + `escalate_to_<tier>`; no roster trigger). |
| D03 | Unpaid reservation expires → release to the same audience, notify worker + manager. No auto-escalation, no penalty. | Decision stands; expiry implementation NOT found (GM-13). |

### GM-11-Q01 — When a shift escalates, who is told, and when does escalation stop? 🔴 [FIRST — see §4]
- **Old ID:** PO-Q08 (gap SH-06). **Status: STILL VALID.**
- **ACTUAL TODAY:** Escalation sends no notices at any tier; availability-match emails go out only when a shift is posted straight to public. Auto-escalation stops for good once anyone has shown interest, even if they later declined, withdrew, or their offer expired (`escalation.py` filter `interests__isnull=True`; no resume path).
- **RECOMMENDED:** A — Notify each new tier; stop when reserved. Respects the owner's notice flags. Rationale: newly eligible workers are never told today, and one declined applicant strands the shift. Severity: launch-gating — shifts can strand silently on launch weekend.
- **ALTERNATIVE A — Keep current logic:** Silent escalation; any past interest stops it for good. *Scenario:* a favourite declines on Monday; the shift sits invisible to the chain and public all week and goes unfilled, pharmacy pays for cover elsewhere. Trade-off: zero notification noise, zero build — but silent, stranded shifts.
- **ALTERNATIVE B — Notify at public; stop at interest:** Today's stop rule, plus a single notice at PLATFORM. *Scenario:* chain workers still never learn the shift widened to them; only the public blast helps, late. Trade-off: minimal email, still strands shifts after any interest.
- **ALTERNATIVE C — Owner chooses per shift:** A per-shift notify/stop setting on the posting form. *Scenario:* an urgent Saturday shift gets "notify every tier, keep escalating until reserved"; a routine weekday shift gets "quiet". Trade-off: most flexible, most UI and most owner effort per post; inconsistent worker experience.
- **Other / defer:** Describe another rule, or defer — but deferring leaves SH-06 launch-gating: shifts can strand silently.
- **Edge cases:** declined vs withdrawn vs expired-offer interest (all stop it today); interest from an unverified worker; interest on one date of a multi-date block; two workers interested at once (race — first interest stops widening for both); escalation reaching PLATFORM after shift start (no late bound); PLATFORM step skipped while at daily public-shift limit (silent — no notice the step was skipped). **Payment/notification side effects:** notifying a tier costs email/push volume only; no fee is charged on escalation. **Web/Expo difference:** none in the rule (shared backend); the *discovery* difference is that Expo workers rely on push/list loads, web workers on email/list loads — both silent today.

### GM-11-Q02 — Should escalation pause while an offer waits for an answer? 🟠
- **Old ID:** PO-Q09. **Status: STILL VALID.**
- **ACTUAL TODAY:** No pause rule. Auto-escalation stops for good once anyone shows interest, so most shifts with a pending offer never escalate again, even after decline or expiry. (Offer expiry is flat 48h, lazily applied — GM-12-Q10.)
- **RECOMMENDED:** A — Pause; resume on decline or expiry. No two workers race for one slot. Rationale: the current stop rule is a pause that never resumes; turning it into a real pause keeps the no-race benefit without stranding the shift.
- **ALTERNATIVE A — Keep current logic:** Escalation stops at first interest and never resumes. *Scenario:* worker A is offered the shift, sits on it 48h, declines; the shift never widens and the pharmacy finds out on Friday. Trade-off: no race, but the worst fill rate.
- **ALTERNATIVE B — Keep escalating:** Faster fill; more let-downs. *Scenario:* worker A is considering the offer while worker B (public) accepts; A is told "already filled". Trade-off: fastest fill, but double-booking disappointment; the slot-lock (`assignment.py:slot_locked_for_shift_offer` — GM-12) prevents a true double-booking, but not the disappointment.
- **Other / defer:** e.g. pause only for the first 2 hours, then resume; or pause only below PLATFORM.
- **Edge cases:** offer expires (lazily — may outlive shift start); worker withdraws; owner withdraws offer (no withdraw action exists — GM-12-Q16); multi-date block with one date offered. **Blocked by:** Q01 (the stop rule must be replaced before a pause rule makes sense).

### GM-11-Q03 — How late may a scheduled escalation fire? 🔴 (code gap once decided)
- **Old ID:** PO-Q10 (gap SH-05), type `code` in #184; also LA-Q08. **Status: STILL VALID.**
- **ACTUAL TODAY:** Auto-escalation only runs when someone loads a shift list or detail (`base.py:get_queryset` → `_auto_escalate_shifts` on every request); no scheduled job exists, so due escalations fire late or never, and each request scans every due shift.
- **RECOMMENDED:** A — Within 5 minutes. A scheduled job every few minutes. Rationale: the existing beat schedule already runs jobs every 60 s (editorial revisions) and */15 (AHPRA alerts), so a job is cheap; 5 minutes is plenty for owner-set intervals.
- **ALTERNATIVE A — Within 1 minute:** Same job, more often. *Scenario:* an urgent shift posted at 07:00 escalates at 07:01 instead of 07:05 — negligible worker benefit, higher job frequency. Trade-off: tightest, most load.
- **ALTERNATIVE B — Within 15 minutes:** Cheapest. *Scenario:* a shift due to widen at 09:00 widens at 09:15; a chain worker who checked at 09:05 sees nothing and does not come back. Trade-off: cheapest, visibly laggy for urgent shifts.
- **Other / defer:** e.g. 2 minutes; or keep lazy escalation for non-urgent shifts and schedule only urgent ones.
- **Engineering: see BL-24.** Q03 owns the timing bound.

### GM-11-Q04 — Should automatic widening be in the first launch? (LA-Q08)

**Scenario:** Tom's shift is due to widen at 2 am. Sara checks at 7 am.
**What happens today:** The shift widens when a shift-list or detail request runs the due check. Until someone loads it, the shift can stay at its earlier tier (`pr257:backend/shifts/escalation.py:91`).
**Recommendation first: A.** Launch automatic widening with the scheduled check and the timing chosen in GM-11-Q03.
- **A (recommended):** After the scheduler ships, Sara can find the shift in the wider audience within the agreed time even if nobody opens the board overnight.
- **B:** Tom widens the audience by hand at launch. Scheduled widening comes later.

**Status:** OPEN (launch scope). Engineering: see BL-24.

### GM-11-Q05 — Fix before launch? Match emails miss escalated shifts and reach unverified workers. 🟠 (code gap)
- **Old ID:** LA-Q17 (gap AV-04). **Status: STILL VALID.**
- **ACTUAL TODAY:** Match emails go out only at posting time, for shifts posted straight to PLATFORM (`announcements.py:announce_availability_matches`); shifts that later escalate to PLATFORM never notify available workers. Recipients are not filtered by Verified, so unverified workers are emailed shifts they are then blocked from applying to. Match uses any-overlap (`availability.start <= slot_end AND availability.end >= slot_start`).
- **RECOMMENDED:** A — Fix before launch. Send on escalation to PLATFORM as well as on direct posting; filter recipients to Verified (and role-appropriate) workers.
- **ALTERNATIVE A — Keep current logic:** *Scenario:* a shift escalates to public on Thursday; available workers who set availability alerts never hear about it, while an unverified worker gets an email for a shift they cannot apply to and complains. Trade-off: no build, misleading emails + missed fills.
- **ALTERNATIVE B — Fix the Verified filter only, not the escalation trigger:** Stops misleading emails; escalated shifts still silent. Trade-off: half the fix.
- **ALTERNATIVE C — Fix the escalation trigger only, not the filter:** Escalated shifts notify; unverified workers still get emails they cannot act on. Trade-off: half the fix, opposite half.
- **Other / defer:** e.g. replace email with in-app/push only for escalated shifts.
- **Edge cases:** worker becomes Verified between posting and escalation; worker's availability overlaps partially (any-overlap vs % overlap — undecided); worker opted out of alerts (`notify_new_shifts=False` is respected). **Web/Expo difference:** email is client-independent; push/in-app would differ by client — not inspected.

### GM-11-Q06 — Who can start at a later tier, and can a tier be skipped entirely? 🟡
- **Old ID:** part of carried E01 ("Owner may start at a later tier"). **Status: CHANGED.**
- **ACTUAL TODAY:** The wizard offers a starting-tier choice (web + Expo `PostShiftVisibilityStep`, `allowedVis` list) and `allowed_tiers()` builds the conditional list (OWNER_CHAIN only if the pharmacy is in an owner's chain; ORG_CHAIN only if the pharmacy is claimed by an org). Creating a shift requires `user_can_manage_pharmacy` (`base.py:check_permissions`) — owner or authorised manager, per GM-05 roles. New nuance: a shift posted straight to PLATFORM is visible to earlier tiers too (`browse.py`: PLATFORM + not anonymous passes the community filter), so "skipping" affects the priority window and the notices, not the visibility itself.
- **RECOMMENDED:** Keep E01 (owner may start later) — but confirm that managers (not only owners) may do so, and that skipped tiers are recorded as skipped, not as "notified". Rationale: starting at PLATFORM for an urgent shift is the main legitimate use; silently skipping favourites burns trust if they later learn they were bypassed.
- **ALTERNATIVE A — Keep current logic (owner-or-manager late start, as traced):** *Scenario:* owner posts straight to public for a Saturday urgent shift; favourites see it only as a public post, with no priority window. Trade-off: simple, fastest for urgent shifts.
- **ALTERNATIVE B — Late start needs a reason / is logged:** *Scenario:* owner must pick "urgent" or "no favourites available" to skip tiers; the skip is visible to managers. Trade-off: audit trail, slight friction.
- **ALTERNATIVE C — No skipping; escalation must pass through every tier, with zero-length intervals allowed:** *Scenario:* owner sets 0-minute intervals to reach public immediately but every tier is technically offered it. Trade-off: preserves priority order on paper, adds noise.
- **Other / defer:** e.g. per-pharmacy default starting tier set by the owner once, not per shift.
- **Edge cases:** starting at PLATFORM anonymously (see Q07/Q08); starting late on a multi-date block; changing the starting tier after posting (edit — GM-10 territory).

### GM-11-Q07 — On an anonymous public post, what is hidden? 🟡
- **Old ID:** PO-Q11. **Status: PARTLY (mechanism confirmed, field list not re-verified).**
- **ACTUAL TODAY:** Redaction runs through `anonymize_pharmacy_detail` (`serialization/shifts.py:to_representation`); anonymous shifts are included in the public queryset with search excluding name/street. The Oct 2026 field list — name, street, software and services hidden; suburb, state, postcode, script volume and rate shown — was **not** re-verified at head. Do not present that list as current until the serializer is read line by line.
- **RECOMMENDED (Oct 2026, stands as proposal):** KEEP the Oct 2026 list if confirmed. It hides what was proposed and keeps the suburb workers need to judge travel, as Mable does. It also hides software and services, which could identify a small-suburb pharmacy.
- **ALTERNATIVE A — Keep current logic:** As traced (redaction via serializer). *Scenario:* a worker in a neighbouring suburb judges travel from the suburb + rate and applies. Trade-off: workable, tested pattern.
- **ALTERNATIVE B — Also hide suburb (region only):** *Scenario:* a single-pharmacy small town — suburb alone identifies the pharmacy, so a worker who knows the town knows who it is anyway, but a worker elsewhere cannot judge travel at all. Trade-off: stronger anonymity, much weaker usefulness.
- **Other / defer:** e.g. hide script volume too (it can identify a high-volume store).
- **Edge cases:** anonymous post escalates *to* PLATFORM from a named earlier tier — do earlier-tier workers keep seeing the name while public workers see "Anonymous"? NOT inspected — unknown. Anonymous + urgent flag; anonymous multi-date block. **Web/Expo difference:** redaction must hold in both clients and in emails/push — NOT inspected on Expo. Re-verify the serializer field list before deciding.

### GM-11-Q08 — When does an anonymous pharmacy's name reach the worker? 🟠
- **Old ID:** PO-Q12. **Status: PARTLY (reminder job confirmed, naming not verified).**
- **ACTUAL TODAY:** The reminder job exists (`tasks.py:send_shift_reminders`, 12h window, hourly beat). Whether the 12-hour reminder email names the pharmacy on anonymous shifts, and whether the terms dialog omits the name, were NOT re-verified at head. Oct 2026 said: worker never sees the name before accepting; terms dialog omits it; accept notices say "Shift in &lt;suburb&gt;"; cards stay anonymous after booking; the 12-hour reminder email names it. Treat that as Oct 2026 only.
- **RECOMMENDED (Oct 2026):** A — In the agreement preview, before the worker accepts. Today (Oct 2026) a worker agrees to work for an unknown business and learns the name by accident in an email.
- **ALTERNATIVE A — Keep current logic:** Worker accepts blind; name surfaces only in the reminder email. *Scenario:* worker accepts, then learns it is a pharmacy they refuse to work for — now they must cancel, triggering the cancellation ladder (GM-15). Trade-off: zero build, highest late-cancel risk.
- **ALTERNATIVE B — After reservation:** Worker accepts blind (same as keep, but name revealed at reservation rather than 12h before). *Scenario:* worker can still cancel before payment, but after committing. Trade-off: earlier than today, still blind at accept.
- **ALTERNATIVE C — After payment confirms:** Worker commits blind. *Scenario:* worst — worker is financially committed before knowing the employer. Trade-off: not recommended; legal/fairness risk.
- **Other / defer:** e.g. reveal name on offer (not on application), so applicants apply blind but accept knowing.
- **Edge cases:** worker is staff/favourite of that pharmacy (already knows it — should redaction lift for them? NOT inspected); manager view vs worker view; reminder email is the *only* reveal today — if email fails, worker arrives not knowing the name. **Legal/financial impact:** accepting work for an unknown employer raises informed-consent / workplace-safety concerns; a worker who withdraws after learning the name may face cancellation consequences they did not bargain for. Re-verify the reminder email + terms dialog before deciding.

### GM-11-Q09 — What makes a shift "urgent", and does urgency change the audience/escalation? 🟡
- **Old ID:** PO-Q13 (urgency flag); escalation interaction is new for GM-11. **Status: STILL VALID.**
- **ACTUAL TODAY:** Urgent is only the owner's switch in the wizard (web `PostShiftForm.tsx:isUrgent` and Expo equivalent; `is_urgent` on Shift); nothing turns on automatically near start time. Workers can filter by urgent (`only_urgent` in `browse.py`). No rule ties urgency to faster escalation or a wider starting tier.
- **RECOMMENDED (Oct 2026, for the flag itself):** A — Owner flag, or auto within 24h. Any shift starting within 24 hours is urgent. (Qwick treats shifts posted within 24h as urgent; Mable's Last Minute covers 4–48h.)
- **ALTERNATIVE A — Keep current logic:** Urgent only when the owner switches it on. *Scenario:* a shift starting tomorrow is not flagged urgent unless the owner remembers; it escalates on the normal slow schedule and goes unfilled. Trade-off: no build, relies on owner memory.
- **ALTERNATIVE B — Owner flag, or auto within 48h:** Wider net. *Scenario:* a shift in 36h is flagged urgent and (if the owner agrees) escalates faster — more workers see it sooner, more notification noise. Trade-off: earlier warning, more "urgent" fatigue.
- **ALTERNATIVE C — Urgency shortens escalation intervals automatically:** e.g. urgent shifts escalate every 30 minutes instead of the owner's intervals. *Scenario:* Saturday 07:00 shift posted Friday night reaches public by midnight. Trade-off: fastest fill for genuinely urgent shifts; needs a decision on what "shortens" means.
- **Other / defer:** e.g. urgent is a filter only, never changes escalation.
- **Edge cases:** owner turns urgent off after posting; shift becomes urgent by passage of time (crosses the 24h boundary) — does it re-escalate? NOT inspected.

### GM-11-Q10 — When an offer is declined or expires, what happens to the shift's audience? 🟠
- **Old ID:** BK-Q06 (booking area, escalation-adjacent). **Status: STILL VALID.**
- **ACTUAL TODAY:** Decline/expiry does not resume escalation (SH-06 stop rule — any past interest blocks it). The shift stays at whatever tier it reached, with the same audience; a reservation expiry releases to the same audience only (D03 — decision; implementation not found, see §6).
- **RECOMMENDED:** A — On decline/expiry/withdrawal, resume escalation from the tier it had reached (do not restart from tier 1, do not jump to PLATFORM), and notify the next tier. Rationale: the slot is empty again; the audience should widen, not freeze. This is the same recommendation as Q01-A/Q02-A, applied to the decline/expiry event.
- **ALTERNATIVE A — Keep current logic:** Shift stays frozen at its tier after any interest. *Scenario:* see Q01-A.
- **ALTERNATIVE B — On decline, jump straight to PLATFORM:** Fastest re-fill; burns the priority order (favourites/chain never get their window). Trade-off: speed vs fairness to nearer tiers.
- **ALTERNATIVE C — Owner manually re-opens / re-escalates:** *Scenario:* owner gets a notice "offer declined — widen audience?" and taps once. Trade-off: human control, delay if the owner is asleep.
- **Other / defer:** e.g. auto-resume only if shift start is &gt;12h away; manual if nearer.
- **Edge cases:** multiple offers, one declines while another is pending; decline after partial acceptance on a multi-date block; expired offer discovered lazily (SH-07) — does expiry even get noticed in time to resume? **Concurrency:** two declines at once must resume escalation once, not twice.

### GM-11-Q11 — Verification at each audience tier (ON-Q03 / ON-P01)
- **Status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01.
- **Exemption status:** Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01.
- **Actual today:** Several booking actions call the shared verification guard, which skips non-public shifts. Eligible favourites can also skip it on named public shifts at their pharmacy. Engineering: see BL-01 and BL-02. Browse access is referenced at GM01-Q04.

### GM-11-Q12 — Do notification flags control escalation notices per tier, and is there an organisation-wide broadcast? 🟡
- **Old ID:** part of carried E01B. **Status: STILL VALID — downstream of Q01.**
- **ACTUAL TODAY:** Staff, favourite and chain notice flags exist in the wizard and govern posting-time notices (`announcements.py:announce_posted_shift`); no organisation-wide broadcast (no org-wide recipients in the file). Escalation sends nothing, so the flags currently only govern posting-time notices.
- **RECOMMENDED:** Keep E01B, and apply the same flags to escalation notices: a tier is notified on escalation only if its flag is on; ORG_CHAIN is never broadcast — org members discover via browsing / personal alerts only.
- **ALTERNATIVE A — Keep current logic:** Flags as today; no escalation notices at all (until Q01 is decided, this question is moot — it is downstream of Q01).
- **ALTERNATIVE B — Escalation notices ignore the flags (always notify the new tier):** *Scenario:* a chain pharmacist who turned chain notices off still gets emailed every escalation. Trade-off: maximum fill, notification fatigue + opt-out complaints.
- **ALTERNATIVE C — Add an organisation-wide broadcast option:** Owner may broadcast to the whole org on escalation to ORG_CHAIN. *Scenario:* a group with 20 stores fills a shift in an hour — or 200 staff get an email about a shift 300 km away. Trade-off: speed vs spam; needs distance/role filtering to be sane.
- **Other / defer:** e.g. digest (one email per day per worker) instead of per-escalation emails.
- **Edge cases:** worker belongs to several tiers at once (staff at one store, favourite at another) — one notice or several? NOT inspected. Worker opted out of email but not push.

### GM-11-Q13 — Favourites keep visibility when a shift widens (E01A)
- **Status:** Answered: earlier audiences keep access when the shift widens, carried E01A - see BL-06.
- **Actual today:** OWNER_CHAIN and ORG_CHAIN drop pure favourites from the community list until PLATFORM (`pr257:backend/shifts/browse.py:107`). Engineering: see BL-06.

---

## 4. SINGLE first decision question to ask the owner first

### GM-11-Q01 — When a shift escalates, who is told, and when does escalation stop?

**Ask this first:** It sets who gets notices and when widening stops. GM-11-Q03 sets the timing bound, GM-11-Q04 sets launch scope and BL-24 tracks the scheduler. Favourites keep access under E01A (BL-06).

**Plain-English version for the owner:** "Today, when a shift widens to more workers, nobody is told — workers only find it if they happen to browse. And once any worker has shown interest, even if they say no, the shift never widens again, so it can sit empty. Should we tell each new group when a shift reaches them, and keep widening until the shift is actually booked?"

**Options:**
- **A (recommended) — Notify each new tier; stop when reserved.** Each tier is told (respecting the notice flags) when the shift reaches them; escalation keeps going until the shift is reserved/booked, including after a decline or expiry. *Scenario:* favourite declines Monday → chain is told Tuesday → org Wednesday → public Thursday → filled. Trade-off: more emails, far fewer stranded shifts.
- **B — Notify at public; stop at interest (today's stop rule).** Only the public blast is sent; any interest still stops escalation for good. *Scenario:* chain never learns the shift widened to them. Trade-off: quietest, still strands shifts.
- **C — Owner chooses per shift.** A setting on the posting form per shift. *Scenario:* urgent shift = notify all + keep going; routine shift = quiet. Trade-off: most control, most per-post effort, inconsistent worker experience.
- **Keep current logic — Silent escalation; any past interest stops it for good.** *Scenario:* one declined applicant strands the shift all week. Trade-off: zero build, launch-gating fill risk.
- **Other (describe) / Defer.** Deferring leaves SH-06 open at launch — say so explicitly if deferred.

**What happens after the owner answers Q01:** Q02 (pause/resume) and Q10 (decline/expiry) become answerable in one follow-up; Q03/Q04 (scheduled job, ≤5 min) can then be built with the correct notify/stop behaviour; Q05 (match emails) follows from the same notify rule; Q12 (flags per tier) becomes answerable.

---

## 5. Code gaps vs decision gaps

### Code gaps (no owner decision needed first — just build/fix; the *bound* in Q03 is the only decision)
| ID | Gap (verified at 97c4543e) | Fix (after owner answers Q01/Q03 where noted) |
|---|---|---|
| CG-11-01 / SH-05 | No scheduled escalation job; lazy per-request scan in `base.py:get_queryset`; `celery.py` schedules only goods marketplaces | Add beat job (recommended ≤5 min), remove per-request scan, idempotent tier advance |
| CG-11-02 | Per-request scan of every due shift on every list/detail load (performance) | Covered by CG-11-01; also a performance fix |
| CG-11-03 / SH-06 | Any-interest stop rule (`escalation.py:interests__isnull=True`); no resume path | Replace with stop-when-reserved + resume (after Q01/Q02/Q10) |
| CG-11-04 / SH-06 | Escalation sends no notification at any tier | Per-tier notify respecting flags (after Q01/Q12) |
| CG-11-05 / AV-04 | Match emails only on direct-to-PLATFORM posting; recipients not Verified-filtered | Send on escalation to PLATFORM too; filter to Verified / role-appropriate (after Q01/Q05) |
| CG-11-06 / NEW | Favourites lose community-list visibility past LOCUM_CASUAL (`browse.py:eligible_q`) — E01A partly violated | Carry favourites forward through OWNER/ORG tiers (after Q13) |
| CG-11-07 | PLATFORM escalation step silently skipped while pharmacy at daily public-shift limit (`escalation.py`) — no notice the step was skipped | Surface it (manager notice / shift note) or queue the step |
| CG-11-08 | `SHIFT_EMAIL_RECIPIENT_CAP = 50` — recipients beyond 50 silently not emailed at posting | Decide cap behaviour (truncate + log? paginate? raise?) — small, no owner decision needed unless the cap itself is questioned |
| CG-11-09 | Anonymous PLATFORM post gets NO notices at all (`announcements.py` anonymous narrowing) | Confirm deliberate; if not, send anonymised notices |
| CG-11-10 | `base.py:get_queryset` does not filter by visibility tier (only `dedicated_user`); tier filtering lives only in `browse.py` | Test the owner/manager list view against the browse view; align or document the split |

### Decision gaps (owner must choose first — do not build until answered)
| ID | Question | Blocks |
|---|---|---|
| Q01 (PO-Q08/SH-06) | Notify each tier? Stop when reserved vs at first interest? | Q02, Q05, Q10, Q12 |
| Q02 (PO-Q09) | Pause escalation while an offer is pending? | Offer/booking flow (GM-12) |
| Q03 (PO-Q10/SH-05) | How late may scheduled escalation fire (1/5/15 min)? | SH-05 build |
| Q04 (LA-Q08) | Fix scheduled escalation before launch? | Launch sign-off |
| Q05 (LA-Q17/AV-04) | Match emails on escalation + Verified filter? | Availability matching (GM-19) |
| Q06 | Who may start at a later tier / skip tiers? | Posting wizard |
| Q07/Q08 (PO-Q11/Q12) | Anonymous: what is hidden, and when is the name revealed? | Terms/agreement flow (GM-13) |
| Q09 (PO-Q13) | Auto-urgent within 24h/48h? Does urgency shorten escalation? | Escalation intervals |
| Q10 (BK-Q06 slice) | On decline/expiry, resume / jump to public / manual? | GM-12/GM-15 |
| Q11 (ON-Q03/ON-P01) | Verification gates on chain/org/talent bookings; favourites checked? | Safety / AHPRA — decide jointly with GM-12-Q01 |
| Q12 (E01B follow-up) | Do notice flags govern escalation notices? Org broadcast? | Notification volume |
| Q13 (NEW) | Favourites keep visibility past LOCUM_CASUAL, or is E01A narrowed? | Community queryset |

**Not a gap (settled — implementation status in §2):** E01 order, E01B flags/no org broadcast, E03 owner-picked intervals / roster never triggers, D03 reservation expiry (same audience, no auto-escalation) — decision stands; D03 implementation not found (see §6).

---

## 6. Documentation matrix, implementation backlog, unknowns

### 6a. Source links (all at PR #249 head `97c4543e`, unless noted)
- Issue #250: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/issues/250
- PR #184: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/184 — `docs/qa/launch-grill/questions.json` (142 questions), `docs/qa/launch-grill/AUDIT.md` (35 gaps: 18 code, 17 decision), `LAUNCH_GRILL.html`
- PR #249: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/249 — head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`
- Per-question sources: see §2 table. Line numbers are as read at head; the files are listed in the "Files verified" table above.

### 6b. Decision status per question
| Q | Old ID | Status |
|---|---|---|
| GM-11-Q01 | PO-Q08 / SH-06 | STILL VALID — open, ask first |
| GM-11-Q02 | PO-Q09 | STILL VALID — open, blocked by Q01 |
| GM-11-Q03 | PO-Q10 / SH-05 | OPEN (timing bound); engineering follows BL-24 |
| GM-11-Q04 | LA-Q08 / SH-05 | OPEN (launch scope); engineering follows BL-24 |
| GM-11-Q05 | LA-Q17 / AV-04 | STILL VALID — open, code gap after Q01 |
| GM-11-Q06 | E01 slice | CHANGED — open |
| GM-11-Q07 | PO-Q11 | PARTLY — open; re-verify serializer field list before deciding |
| GM-11-Q08 | PO-Q12 | PARTLY — open; re-verify reminder email + terms dialog before deciding |
| GM-11-Q09 | PO-Q13 | STILL VALID — open |
| GM-11-Q10 | BK-Q06 slice | STILL VALID — open, blocked by Q01/Q02 |
| GM-11-Q11 | ON-Q03 / ON-P01 | Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Employee exemption from AHPRA-FAV-01. |
| GM-11-Q12 | E01B follow-up | STILL VALID — open, downstream of Q01 |
| GM-11-Q13 | E01A | Answered: earlier audiences keep access when the shift widens, carried E01A - see BL-06 |
| E01 / E01A / E01B / E03 / D03 | carried | Settled Oct 2026 — E01A partly violated (Q13); D03 implementation not found |

### 6c. Implementation backlog — ONLY after owner answers (nothing here is decided now)
1. **Engineering: see BL-24.** Use GM-11-Q01 for escalation behaviour, GM-11-Q03 for the timing bound and GM-11-Q04 for launch scope.
2. **After Q01:** fix AV-04 match emails (escalation-to-PLATFORM trigger + Verified filter).
3. **After Q08:** reveal pharmacy name in agreement preview (or chosen point); keep redaction on cards/emails otherwise.
4. **After Q09:** auto-urgent rule (24h/48h) and any urgency→escalation shortening.
5. **Engineering: see BL-01 and BL-02.** Implement the carried verification and employee-exemption rules.
6. **After Q06/Q12:** starting-tier / skip logging; per-tier flag handling for escalation notices; no org broadcast unless Q12-C chosen.
7. **Engineering: see BL-06.** Keep favourites visible as audiences widen under E01A.
8. **Cross-client verification (after implementation):** Web (Vite + Next) verified, Expo verified, launch signed off — per Issue #250 progress labels. No step is "done" from a green typecheck alone.

### 6d. What is still UNKNOWN (do not present as decided)
1. **Reservation-expiry implementation (D03):** no `reservations.py` in `backend/shifts/`; no reservation-expiry beat entry in `settings.py`/`celery.py`; the Oct 2026 "expiry every 60 s" claim was NOT found. Whether reservations expire at all in current code, and where, is GM-13 (billing) territory — GM-12-Q20/Q24 share this unknown.
2. **Anonymous redaction field list (Q07):** `anonymize_pharmacy_detail` is called but its exact fields were not read line by line at head.
3. **Anonymous name reveal (Q08):** whether the 12-hour reminder email names the pharmacy, and whether the terms dialog omits it — not re-verified at head.
4. **Next web posting wizard:** no post-shift page found under `frontend_web/landing_next` (search-only); Next parity UNKNOWN-to-negative — needs GM-25 confirmation.
5. **Expo Explorer shifts tab:** Oct 2026 blank placeholder — state not inspected.
6. **`allowed_tiers()` skip semantics:** the conditional list is confirmed (OWNER_CHAIN only if in an owner's chain; ORG_CHAIN only if claimed by an org); the exact behaviour when a shift starts at a later tier (which tiers are recorded as skipped vs never-offered) was not traced to a test.
7. **Email cap behaviour (CG-11-08):** what happens to recipients beyond 50 — silent truncation assumed from the cap constant, not observed.
8. **Tests:** no escalation/announcement tests were inspected in this trace; test coverage for the §1 matrix is unverified.

*No code changes were made in this trace. No PR/issue/comment/branch created. No owner was notified.*
