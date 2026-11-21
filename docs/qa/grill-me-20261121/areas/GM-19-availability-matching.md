# GM-19 — Availability / Matching — Grill Me trace (COMPLETE — re-run 2026-11-21)

> **Corrections against current code (21 Nov 2026 review).** 9 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 6 hold, 3 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q01 / Q02 | Recurrence end date is optional on backend and Expo | STALE; main remains permissive | PR257 requires an end date for new or changed recurring schedules, and Expo requires it too. Metadata-only edits preserve supported legacy open-ended rows. | `main:backend/talent/serializers/availability.py:7`; `pr257:backend/talent/serializers/availability.py:41`; `pr257:frontend_mobile/roles/shared/availability/availabilityModel.ts:111` |
| Q08 | “no quiet-hours” | MAIN-ONLY | PR257 has user-level push quiet hours, although no separate urgent-shift consent exists. Quiet hours suppress eligible pushes; they do not defer email or create a later push queue. | `main:backend/notifications/services.py:102`; `pr257:backend/notifications/services.py:119`; `pr257:backend/notifications/models.py:65` |
| Q10 / CG-1 | No semantic API validation | STALE; still true on main | Remove the blanket no-validation claim for PR257. Describe the remaining unsupported constraints separately, including past dates and duplicates. | `main:backend/talent/serializers/availability.py:7`; `pr257:backend/talent/serializers/availability.py:17` |

- **Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
- **Issue:** #250 (Grill Me, 26 areas) — **PR #184** (Oct 2026) is the format example
- **Re-validation target:** active PR #249 (stacked on #248)
- **PR #249 head VERIFIED live:** `97c4543e051b43fe30ec7e2e61ad3d69957a918e` — matches the #250 snapshot. No drift. (PR body text names a "working head `26cae2d6`" — the short SHA of the last listed implementation commit, not the branch head. All tracing below is at the API head.)
- **Date traced:** 2026-11-21 (AEST). **Method:** read-only GitHub connector calls only, strictly sequential with ≥8 s between calls. No code changed, no PR/issue/comment created.
- **Rate-limit note:** no HTTP 429 occurred in this re-run (~70 sequential read calls, all succeeded). The 429 that stopped the first GM-19 attempt — on `backend/shifts/announcements.py` — has cleared, and that file is now fully verified.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Save dated availability slot | Worker saves dated slot via sidebar form . Next web lacks availability surface (`frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:42`). | Worker saves dated slot with start/end time and travel radius (`frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:251`). | Yes | Parity question: Next web lacks an availability page; Vite web and Expo have matching forms. |
| Save recurring pattern | Worker configures recurring weekdays with optional end date (`frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:368`). | Worker configures recurring weekdays with optional end date (`frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:495`). | Yes | |
| Edit / delete availability slot | Worker updates or removes slot with immediate preview update (`frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:387`). | Worker updates or deletes slot via optimistic mutation (`frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:71`). | Yes | |
| Matching shift notification toggle | Worker sets a travel radius (default 30 km) with availability (`frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx:271`, `:326`). | Same radius setting, plus a map preview of the circle (`frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx:223`). | Yes | Corrected 22 Nov (orchestrator review): web has the radius too; only the map preview is Expo-only (display, intended). |
| Shift match alerts on posting | Backend alerts workers with any-overlap availability at shift posting (`backend/shifts/announcements.py:29`). | Push and in-app alerts dispatched from matching engine without client filtering (`backend/shifts/announcements.py:29`). | Yes | |
| Dashboard availability recommendations | Overlap matching endpoint feeds recommended shifts (`backend/shifts/announcements.py:465`). | Mobile dashboard fetches matching shifts from recommendations API (`frontend_mobile/roles/shared/availability/availabilityModel.ts:75`). | Yes | |
| Roster placement availability warning | Roster displays non-blocking warning when shift is outside full containment (`backend/workforce/roster/validation.py:9`). | Manager roster surfaces non-blocking conflict warning from validation API (`backend/workforce/roster/validation.py:9`). | Yes | |
| Talent board availability snapshot | Worker publishes talent post with copied availability snapshot that never auto-syncs (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:86`). | Post displays snapshot decoupled from live calendar rows (`frontend_mobile/roles/shared/talent-board/index.tsx:63`). | Yes | |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM-19-Q01 (ex AV-Q01) — How should workers set availability? | Web + Expo (also covers GM-23-02) |
| GM-19-Q02 (ex AV-Q02) — How far can a repeating availability run? | Web + Expo (also covers GM-23-03) |
| GM-19-Q03 (ex AV-Q03) — When does availability "match" a shift? | Web + Expo (also covers GM-23-04) |
| GM-19-Q04 (ex AV-Q04) — Who can see a worker's availability? | Web + Expo (also covers GM-18-Q24, GM-23-05, GM26-Q17) |
| GM-19-Q05 (ex AV-Q05) — Should confirmed bookings block that time automatically? | Web + Expo (also covers GM-23-06) |
| GM-19-Q06 (ex AV-Q06) — When should a talent post stop showing? | Web + Expo (also covers GM-18-Q23, GM-23-07, GM-24-Q31) |
| GM-19-Q07 (ex AV-Q07) — Should availability show when it was last confirmed? | Web + Expo (also covers GM-23-08) |
| GM-19-Q08 (ex AV-Q08) — Should urgent-shift alerts need a separate opt-in? | Web + Expo (also covers GM22-08, GM-23-09, GM-24-Q20, GM26-Q18) |
| GM-19-Q09 (ex AV-Q09) — Should workers set a max distance and minimum rate for alerts? | Web + Expo (also covers GM-18-Q25, GM22-09, GM-23-10) |
| GM-19-Q10 (NEW) — Should availability validation be added, and what must it reject? | Web + Expo (also covers GM-18-Q19, GM-23-17) |
| GM-19-Q11 (NEW) — Should a roster availability warning block placement, or stay a warning? | Web + Expo |
| GM-19-Q12 (NEW) — Should the talent-post availability snapshot sync with the calendar? | Web + Expo (also covers GM-18-Q17, GM-23-01, GM25-C15) |
| GM-19-Q13 (NEW) — Next web: does an availability surface exist, and must it match Vite/Expo? | Web only |

## 0. What was completed in this re-run

The 2026-11-21 partial stopped at a 429 on `announcements.py` after verifying 5 files. This re-run completes everything the partial listed as NOT re-validated:

- **VERIFIED at PR #249 head in this trace:** `backend/shifts/announcements.py` (581 lines — the central matching / match-email file), `backend/talent/views/explorer.py`, `backend/talent/serializers/explorer.py`, `frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx`, `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx`, `frontend_mobile/roles/shared/availability/availabilityModel.ts`, `shared-core/src/domains/talent/api.ts`, `backend/talent/test_availability_api.py`, and the Next migrated-pages listing under `frontend_web/landing_next/migrated/pages/dashboard/sidebar/` (only `ShiftsBoard` + `TalentBoard` — no availability surface).
- **Adopted, not re-fetched:** the 5 files verified at this head in the partial — `backend/talent/models.py` (`UserAvailability`, `ExplorerPost.is_talent_board_visible`), `backend/talent/views/availability.py` (own-rows only), `backend/talent/serializers/availability.py` (no validation — AV-05), `backend/talent/urls.py`, `backend/workforce/roster/validation.py` (`AVAILABILITY_CONFLICT` warning only, full containment; `SHIFT_OVERLAP` hard error; `APPROVED_LEAVE_CONFLICT` hard error). GM-18 senior-reviewed findings adopted: AV-05 (no server availability validation) CONFIRMED; availability copy never syncs.
- **Still UNKNOWN (not verified):** the caller of `announce_posted_shift` / `announce_availability_matches` (the posting flow — GM-10 territory); the caller of `find_availability_matched_shifts` (which dashboard screen shows the recommendations); the caller of `auto_escalate_due_shifts` (no schedule found in traced files); whether the live Next site serves the migrated copies; the exact recipient cap number and the membership rules inside `announce_posted_shift` (verified to exist, not quoted in full).

## 1. GM-19 traced flow — ACTUAL TODAY (verified at head)

### 1a. Setting availability — backend (adopted from partial, unchanged)

- **Model — `backend/talent/models.py`, `UserAvailability`:** `user` (FK), `date` (required), `start_time`/`end_time` (required even for all-day rows), `is_all_day` (default False), `is_recurring` (default False), `recurring_days` (JSON list of ints, `[0=Sun..6=Sat]`), `recurring_end_date` (nullable — open-ended recurrence allowed), `notify_new_shifts` (Boolean, default False; "Notify this user when a public shift matches this availability."), `notes` (free text), `created_at`/`updated_at` (auto timestamps — **not a worker confirmation; no `confirmed_at`, no freshness flag**). **No fields exist for:** unavailable/blackout dates, holidays, max distance, minimum rate, region/state coverage, role restriction, or a confirmed/freshness timestamp.
- **Serializer — `backend/talent/serializers/availability.py`:** exposes exactly `id, date, start_time, end_time, is_all_day, is_recurring, recurring_days, recurring_end_date, notify_new_shifts, notes`. **There is no `validate_*` method at all** — no check that start < end, weekdays are 0–6, a recurring row has days, dates are not in the past, or a row is not a duplicate. AV-05 CONFIRMED at head (GM-18 agreed).
- **API — `backend/talent/views/availability.py` + `urls.py`:** `UserAvailabilityViewSet` (ModelViewSet, `IsAuthenticated` only), `get_queryset()` filtered to `user=self.request.user`, `perform_create` forces `user=self.request.user`. A worker can only ever read/edit **their own** rows; no owner/admin read of raw availability here, no role check beyond login, no tenant/pharmacy scoping (availability is user-global). Full CRUD exposed — deletion of a row is allowed (no delete guard in this file). Unauthenticated → 401; another user's row → empty list / 404 via the queryset filter (no explicit 403 branch).
- **Tests — `backend/talent/test_availability_api.py` (now verified):** characterisation tests only — auth required, binds to request user, own-rows scoping, 404s. **No validation tests exist** (consistent with AV-05: there is nothing to test).

### 1b. The matching engine — `backend/shifts/announcements.py` (581 lines, NEW — fully verified)

This is the file the first attempt could not fetch. It holds the whole alert/matching engine.

- **The match rule — `_availability_matches_slot`:** **ANY OVERLAP** — `start <= slot_end and end >= slot_start`. Touching endpoints count as a match. This is **not** full containment: a worker available 9–10 matches a 9–17 shift.
- **Travel/distance — `_load_user_travel_prefs` / `_user_can_travel_to_shift`:** if the worker is `open_to_travel`, the pharmacy's state must be in their `travel_states`; otherwise a haversine distance check applies — pharmacy coordinates vs worker coordinates must be ≤ `coverage_radius_km`. **Missing coordinates or missing radius → no match** (the worker is silently excluded, not treated as "anywhere").
- **`find_availability_matched_shifts`** (dashboard recommendations): same any-overlap + travel rules, role check, future slots only, first 80 candidates, limit 6 returned. **No opt-in needed** — a worker sees recommendations whether or not they set `notify_new_shifts`.
- **`announce_posted_shift`:** visibility tiers, anonymous rules, recipient cap, membership-based audience. (Tier/cap details verified to exist; exact numbers not quoted here — see §7.)
- **`announce_availability_matches`:** fires **at posting time only**, for **PLATFORM-visibility shifts only**, to users with `notify_new_shifts=True`, `user__is_active`, role check, travel check, any-overlap, recipient cap, template `shift_availability_match`. **NO Verified/AHPRA filter on recipients** (an unverified worker who set the flag is alerted). **NO minimum-rate check** (a $70/hr locum is alerted about a $55/hr shift). **NO assignment/booked-time check** — a worker already booked for those hours is still alerted (Q05 alert side VERIFIED). **NO approved-leave check** in this function (leave blocks roster placement, not alerts).
- **Escalation never re-announces:** `escalation.py` contains no announce call, and `auto_escalate_due_shifts` has no beat entry and no caller found in traced files. A shift that escalates to a wider audience gets **no new availability alerts** — the only alert wave is at posting time. (GM-11 territory; affects GM-19 alerts.)
- **THE DIVERGENCE (verified, the central GM-19 finding):** alerts use **any-overlap**; roster warnings use **full containment** (`validation.py`). The same worker/shift pair can be "matched" by email and "outside availability" by the roster at the same time.

### 1c. Talent posts — `backend/talent/views/explorer.py` + `serializers/explorer.py` (NEW — verified)

- **`get_queryset` filters through `_visible_posts` for all non-write actions — TB-03 FIXED at head.** The Oct 2026 claim (ordinary `list`/`retrieve` bypass the visibility rule) is **no longer true**: every read path now applies the visibility filter.
- **`is_talent_board_visible(today=None)` (adopted):** hidden post → False; `FULL_TIME_APPLICATION` → **always True (never expires on date)**; dated availability post → visible only while `latest_availability_date >= today`; **undated post → True forever**. Feeds now call it — but undated and full-time posts still stay visible indefinitely unless moderated (Q06).
- **`_require_public_staff_access`:** pharmacist needs **current AHPRA**; other staff need **verified + mobile verified**. This gates who can *see* the public board.
- **Masking split (verified):** the **public feed masks anonymous** posts (`PublicExplorerPostReadSerializer`); the **authenticated list uses the unmasked serializer** (`author_user_id`, `explorer_user_id`, `explorer_name` exposed). LA-Q12 (who sees the author's identity, and when) is STILL VALID — the authenticated list reveals the author to any logged-in staff user.
- **Lapsed-credential re-check still missing:** `is_talent_board_visible` checks nothing about Verified/AHPRA status. A worker whose AHPRA lapses keeps a visible post (the *viewer* gate in `_require_public_staff_access` checks the viewer, not the post author).
- **Sync gap (adopted, structural):** `availability_days` on the post is a separate JSON snapshot from `UserAvailability` rows; nothing in `models.py` links or syncs them. Editing the calendar never updates a talent post (Q12).

### 1d. The two SetAvailability screens (NEW — verified)

**Web — `frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx`:**
- Dated + recurring entry, calendar preview, notify toggle labelled **"Notify me when new public shifts match my availability"**, travel/radius form (**default radius 30 km**).
- **End date is OPTIONAL** — the payload sends `recurring_end_date: null` when unset; no "required" validation was found. The Oct 2026 claim "apps require an end date" is **WRONG at head** (Q02).

**Expo — `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx`:**
- Same entry model (dated/recurring, preview, notify toggle, travel/radius), **radius options 5–1000 km + map preview**. Same optional end date (payload `recurring_end_date: null` when unset).
- **Parity:** web and Expo availability screens match on every verified point (entry, preview, notify toggle, travel/radius, optional end date). The only verified difference is presentation (mobile map preview + wider radius range).

**Shared-core — `domains/talent/api.ts` + `availabilityModel.ts`:** user-availability CRUD (`fetch/create/update/delete`); `availabilityModel.ts` has retry dedupe by slot key, empty entry **09:00–17:00**, `weekDays`, `radiusOptions`, `stateOptions`. Both clients use the same API — no client-side matching logic exists (matching is server-side in `announcements.py`).

### 1e. Next web — VERIFIED ABSENT (parity gap)

The migrated-pages listing under `frontend_web/landing_next/migrated/pages/dashboard/sidebar/` contains **only `ShiftsBoard` + `TalentBoard`** — no SetAvailability, no billing, no pills. Next has **no availability surface** as traced. Whether the live Next site serves these migrated copies is UNKNOWN (GM-25). If it does, a Next user cannot set availability at all and must use Vite/Expo.

## 2. Current-flow matrix

| # | Trigger | Actor | Backend / API | Vite web | Next web | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---------|-------|---------------|----------|----------|------|-----------------|---------------------|------------------------|
| F1 | Worker saves a dated slot | Worker (any staff role) | `POST user-availability` → own-user only; **no validation** (AV-05) | Dated entry, preview, notify toggle, travel/radius (default 30 km) | **No surface** | Same entry, radius 5–1000 + map preview | `UserAvailability` row (date, start/end, all-day, notify flag, notes) | None | Invalid rows (end ≤ start, past date, duplicate) accepted — no error path in serializer |
| F2 | Worker saves a recurring pattern | Worker | Same API; `is_recurring`, `recurring_days [0=Sun..6=Sat]`, `recurring_end_date` nullable → **open-ended allowed** | End date optional (payload `null` when unset) | **No surface** | Same, end date optional | Same row, recurring fields | None | No horizon, no reconfirm prompt in model/API |
| F3 | Worker edits / deletes availability | Worker (own rows only) | ModelViewSet update/destroy, own-user queryset | Same screens | **No surface** | Same screens | Row updated / deleted | None; talent-post copy NOT updated (snapshot, Q12) | Other user's rows invisible (empty list/404); unauthenticated → 401 |
| F4 | Worker sets "notify me of matching shifts" | Worker | `notify_new_shifts` Boolean on the row (default False) — **per-row, not per-worker** | Toggle: "Notify me when new public shifts match my availability" | **No surface** | Same toggle | Flag on that row only | Intended: match email when a public shift matches (F5) | No separate urgent-shift consent exists (Q08) |
| F5 | Owner posts a shift to PLATFORM | Owner/manager | `announce_availability_matches` (posting time only): `notify_new_shifts=True`, active, role check, travel check, **any-overlap**, recipient cap, template `shift_availability_match` | — (owner side: posting flow, GM-10) | — | — | Shift + match notifications | Email/in-app match alert to each matched worker; **no Verified/AHPRA filter; no rate check; no booked-time/leave check** | Shift posted to staff/favourites/chain/org tiers → **no availability alerts** (PLATFORM only); escalation → **no re-announce** |
| F6 | Worker opens dashboard | Worker | `find_availability_matched_shifts`: same any-overlap + travel rules, role check, future slots only, first 80 candidates, **limit 6**, no opt-in needed | Dashboard recommendations surface (caller not traced — which screen) | **No surface** | Same API (caller not traced) | None | 6 recommended shifts shown | No opt-in required; no freshness filter |
| F7 | Roster manager places a worker | Manager / roster | `worker_issues()`: overlap = **error**, approved leave = **error**, availability-outside = **warning only** (full containment), no availability declared = **no warning** | Roster UI (GM-07; not traced here) | — | Roster UI (not traced here) | Roster assignment (if manager proceeds past warning) | Warning surfaced to manager | Manager may proceed despite warning; worker with no availability declared is never flagged |
| F8 | Worker publishes a talent post | Worker | `ExplorerPost` with copied `availability_days` snapshot; `is_talent_board_visible()`: hidden → no; full-time → always yes; dated → until last date; undated → forever | Talent board (GM-18) | TalentBoard dir exists in migrated pages (content not traced) | Talent board (GM-18) | `ExplorerPost` row | Post visible per that rule; **all read paths now filter through `_visible_posts` (TB-03 FIXED)** | Moderation (`hidden_at`) is the only verified takedown; authenticated list shows author identity unmasked (LA-Q12) |
| F9 | Availability goes stale | (time passing) | **Nothing:** no expiry job, no reconfirm, no `confirmed_at` in model/API | No freshness display traced | — | No freshness display traced | Stale rows + stale post snapshots persist | None | No recovery path exists |
| F10 | Confirmed booking overlaps declared availability | Worker + owner | Roster: `SHIFT_OVERLAP` hard error blocks roster placement. **Alerts: NOT suppressed** (no assignment check in `announce_availability_matches`) | — | — | — | Assignment + availability row coexist | Worker keeps receiving alerts for hours they are booked | Roster path blocks; alert path does not; cancellation restores nothing (nothing was removed) |
| F11 | Worker is on approved leave | Worker | Roster: `APPROVED_LEAVE_CONFLICT` hard error. **Alerts: NOT suppressed** (no leave check in the matching function) | — | — | — | Leave request + availability row coexist | Availability does NOT auto-hide during leave | Leave blocks roster; alerts continue |
| F12 | Worker is unverified / AHPRA lapsed | Worker | Matching alerts: **no Verified/AHPRA filter** — unverified workers are alerted. Board *viewing*: `_require_public_staff_access` (pharmacist needs current AHPRA; other staff verified + mobile verified). Post visibility: no lapsed-credential re-check | — | — | — | Post stays visible; alerts keep firing | Unverified worker may apply to a shift they cannot take (AHPRA gate is at accept, GM-01/GM-02) | Accept-time AHPRA require+lock (GM-13) is the only enforcement |

Parity note: the backend is client-agnostic (one API, one matching engine). The verified Web-vs-Expo differences are screen-level only (mobile map preview + wider radius range). **Next is the structural gap: no availability surface at all.**

## 3. Validated question queue (#184 format, numbered)

Statuses: ✅ STILL VALID · 🔄 CHANGED · 🟢 FIXED · ❓ NOT RE-VALIDATED (none remain in this area after this re-run except where stated).

### GM-19-Q01 (ex AV-Q01) — How should workers set availability? — ✅ STILL VALID (screens now verified)

> **Also covers (22 Nov):** GM-23-02 (GM-23). Asked once, here.
- **ACTUAL TODAY (verified):** dated slots and recurring weekdays with time windows / all-day, `recurring_end_date` optional, `notes`, `notify_new_shifts` — on both Vite and Expo, same model. **No unavailable-date / blackout / holiday exception model exists** in the verified model or either screen.
- **RECOMMENDED (carried from #184, rec A):** keep recurring patterns; add dated blackouts (unavailable dates) that always win over a pattern. Rationale: holidays and outside work cannot currently override a pattern, so workers either delete the pattern or get alerted for shifts they cannot do. Severity: medium. Benefit: fewer false matches, less owner wasted time. Risk: precedence rules must be defined (blackout vs booking vs leave) or three overlapping "unavailable" sources will conflict. Legal/financial: none direct; indirectly, fewer no-shows / late cancels.
- **ALTERNATIVE A — Keep current logic:** dated + recurring only, no exceptions. Scenario: a pharmacist on annual leave in January deletes her Monday pattern, then must rebuild it in February; in the meantime she gets no alerts. Trade-off: zero build, ongoing stale/false matches and re-entry burden.
- **ALTERNATIVE B — Dated slots only:** retire recurrence; workers retype every week. Scenario: a regular Monday locum re-enters the same slot weekly; drop-off in kept-up availability is likely. Trade-off: simplest matching, highest worker burden.
- **ALTERNATIVE C / Other:** weekly pattern + blackout + a "pause all availability" switch (cf. Q07). Defer: keep current logic until after launch, accept false matches.
- **Cases:** normal — weekly pattern covers a shift; edge — blackout on a public holiday that falls on a recurring day (precedence must be stated); retry/concurrency — two edits to the same row, last write wins (no versioning seen in verified slice); denied role — another user cannot edit your rows (queryset filter); wrong tenant — n/a, availability is user-global, not per-pharmacy; payment/notification — none; web/Expo — both screens verified, same model; Next — no surface.
- **Gap type:** decision gap (owner must choose the exception model first); then a build.

### GM-19-Q02 (ex AV-Q02) — How far can a repeating availability run? — 🔄 CHANGED (Oct claim wrong)

> **Also covers (22 Nov):** GM-23-03 (GM-23). Asked once, here.
- **ACTUAL TODAY (verified):** open-ended recurrence is allowed by the backend (`recurring_end_date` nullable) **and by both apps** — the end date is optional on Vite and Expo; the payload sends `recurring_end_date: null` when unset, with no "required" validation found. The Oct 2026 claim "apps require an end date" is **WRONG at head**. Nothing expires a pattern and nobody is prompted to refresh it.
- **RECOMMENDED (carried, rec B):** open-ended, with a quarterly reconfirm prompt. Rationale: nothing reconfirms old patterns; a prompt preserves the low-effort pattern while fighting staleness. Severity: medium. Benefit: fewer ghost availabilities. Risk: prompt fatigue / ignored nudges; needs a `confirmed_at` field and a notification job (neither exists). Legal/financial: none direct.
- **ALTERNATIVE A — Keep current logic:** optional end date, no prompt. Scenario: a worker who left pharmacy in 2025 still "available Mondays" in 2027 and keeps receiving alerts. Trade-off: zero build, maximum staleness.
- **ALTERNATIVE B — End date required, max 3 months:** forces a refresh. Scenario: a regular locum re-confirms quarterly; a worker who forgets silently disappears from matching. Trade-off: freshest data, highest burden, risk of silent drop-out.
- **Other / defer:** 6-month horizon; or reconfirm only when a match email bounces / is ignored.
- **Cases:** normal — pattern renewed quarterly; edge — pattern with end date in the past still stored (roster logic treats it as inapplicable, but the row persists); retry — n/a; denied role — n/a; web/Expo — both verified, same behaviour.
- **Gap type:** decision gap (horizon + prompt cadence), then build (field + job + UI).

### GM-19-Q03 (ex AV-Q03) — When does availability "match" a shift? ★ FIRST QUESTION — see §4

> **Also covers (22 Nov):** GM-23-04 (GM-23). Asked once, here.
- **ACTUAL TODAY (verified, split — the divergence is now confirmed):** **alerts/dashboard use ANY OVERLAP** (`_availability_matches_slot`: `start <= slot_end and end >= slot_start`, touching endpoints count). **Roster warnings use FULL CONTAINMENT** (`validation.py`: the shift must sit fully inside a declared window, or the row is all-day). The same worker/shift pair can be "matched" by email and "outside availability" by the roster at the same time.
- **RECOMMENDED (carried, rec A):** one rule everywhere — the shift must sit fully inside the availability. Rationale: a 9–10 availability matching a 9–17 shift wastes the owner's time and trains workers to ignore alerts. Severity: high (it decides who gets emailed about every shift). Benefit: alerts mean "can actually cover this"; aligns with roster warnings. Risk: fewer alerts per shift, especially for part-day availability; owners of long shifts may see a thinner audience. Legal/financial: none direct; indirectly fewer failed bookings.
- **ALTERNATIVE A — Keep current logic:** divergent rules (any-overlap alerts + full-containment roster warnings). Scenario: worker available 9–10 is emailed a 9–17 shift, applies, is rejected or cannot cover; owner waits. Trade-off: no build, continued noise and mismatched expectations between alerts and roster.
- **ALTERNATIVE B — Overlap of at least X%:** e.g. availability must cover ≥50% (or ≥4 hours) of the shift. Scenario: worker available 9–13 for a 9–17 shift gets the alert and the owner can negotiate a part-cover; a 9–10 worker does not. Trade-off: needs the threshold chosen and explained; partial-cover negotiation needs a product path (cover/swap, GM-07).
- **ALTERNATIVE C / Other:** any overlap as a deliberate "wide net" and let the owner filter; or match on date only, ignore times. Defer: decide after launch data on alert-to-apply conversion.
- **Cases:** normal — full-day availability vs full-day shift; edge — availability ends exactly at shift start (touching endpoints: overlap rule says match, containment says no); overnight shift crossing midnight (roster rolls +1 day — alert side: `_availability_matches_slot` compares the raw intervals, overnight handling not traced in this function); retry/concurrency — a shift posted twice could double-notify (engine has no dedupe seen in the traced function — caller not traced, GM-10); denied role — unverified workers receiving alerts they cannot act on (verified: no Verified/AHPRA filter); payment/notification — the alert itself is the side effect; no payment at match time; web/Expo — recommendations come from the same server function on both clients.
- **Gap type:** decision gap — the owner must pick the single matching rule first; the alert engine must then be changed to it. **No longer blocked on re-fetch — both rules are verified.**

### GM-19-Q04 (ex AV-Q04) — Who can see a worker's availability? — ✅ STILL VALID (now fully verified)

> **Also covers (22 Nov):** GM-18-Q24 (GM-18), GM-23-05 (GM-23), GM26-Q17 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** only the worker can read/edit raw availability through the API (own-rows queryset). Pharmacies see at most what was copied into a talent post (`availability_days` snapshot), not a live calendar. No visibility/opt-in field exists on `UserAvailability`. The authenticated talent list exposes the post author's identity unmasked (`author_user_id`, `explorer_user_id`, `explorer_name`) — LA-Q12 still valid.
- **RECOMMENDED (carried, rec B):** explicit worker opt-in for accepted staff / favourite pharmacies. Rationale: a private calendar (with free-text `notes`) should not be disclosed by relationship alone; OAIC APP 6 (use/disclosure of personal information) supports consent-based disclosure. Severity: medium (privacy). Benefit: owners can invite the right people directly; workers stay in control. Risk: opt-in uptake may be low; needs per-pharmacy scoping UI. Legal: privacy — availability + notes are personal information; disclosure without consent is the risk.
- **ALTERNATIVE A — Keep current logic:** raw calendar private; posts hold copied dates. Scenario: an owner who wants a regular Monday locum cannot see she is free Mondays unless she posted on the talent board. Trade-off: safest privacy, weakest hiring use.
- **ALTERNATIVE B — Opt-in talent card:** worker opts in to show availability on the public / employer-visible talent card. Scenario: a locum seeking work advertises "Mondays and Wednesdays, Gold Coast" to all employers. Trade-off: widest reach, widest disclosure — needs the anonymous-post rules (GM-18 / TB-02) to agree.
- **Other / defer:** show availability only after a booking request / chat reply (ties to TB-02 reveal timing). Defer: keep private until after launch.
- **Cases:** normal — favourite pharmacy sees opted-in calendar; edge — worker opts in then opts out (old copies in talent posts persist — Q12); denied role — competing workers must not see raw calendars (API already enforces); wrong tenant — availability is user-global, so a pharmacy the worker never worked with must not gain access via a stale membership; web/Expo — both screens verified, same API.
- **Gap type:** decision gap (privacy + opt-in scope), then build.

### GM-19-Q05 (ex AV-Q05) — Should confirmed bookings block that time automatically? — 🔄 CHANGED (alert side now VERIFIED: they do not)

> **Also covers (22 Nov):** GM-23-06 (GM-23). Asked once, here.
- **ACTUAL TODAY (verified, split):** **Roster side — blocked:** overlapping assignments are a hard `SHIFT_OVERLAP` error in `worker_issues()`. **Alert side — NOT blocked:** `announce_availability_matches` has **no assignment check** — a worker already booked for those hours is still alerted. It does not delete or amend the `UserAvailability` row. Approved leave is likewise not checked by the alert function (roster blocks it, alerts do not).
- **RECOMMENDED (carried, rec A):** yes — booked time is unavailable for matching. Rationale: alerting a worker about hours they are already booked for wastes both sides and risks a double-booking attempt. Severity: medium-high. Benefit: alerts stay actionable. Risk: needs the matching engine to consult assignments (and leave, and roster) — a query + test burden; a cancelled booking must restore availability promptly. Financial: fewer failed / double-booked acceptances; no direct fee impact (fees attach at confirmation, GM-13).
- **ALTERNATIVE A — Keep current logic:** leave declared availability and alerts unchanged when bookings are confirmed; rely on roster conflict checks at placement. Scenario: a locum booked 9–17 Monday keeps receiving Monday 9–17 alerts, applies, and is blocked late. Trade-off: zero build, noisy alerts, late rejections.
- **ALTERNATIVE B / Other:** suppress alerts only, keep the calendar row visible (no deletion); or mark booked intervals as "busy" in the worker's own calendar view without changing matching. Defer: keep current logic until alert volume is measured.
- **Cases:** normal — booked Monday, no Monday alerts; edge — booking cancelled / shift deleted (availability must reappear — timing matters); overlapping but non-identical intervals (partial overlap — ties to Q03's rule); retry/concurrency — booking confirmed at the same moment a match email is being composed (race — caller not traced, GM-10); denied role — n/a; web/Expo — whether the worker's calendar shows booked time as busy was not traced on either screen.
- **Gap type:** decision gap for the alert side; the roster side is already built (code exists).

### GM-19-Q06 (ex AV-Q06) — When should a talent post stop showing? — ✅ STILL VALID (feeds now verified to call the rule)

> **Also covers (22 Nov):** GM-18-Q23 (GM-18), GM-23-07 (GM-23), GM-24-Q31 (GM-24). Asked once, here.
- **ACTUAL TODAY (verified):** `is_talent_board_visible()` — hidden → no; full-time application → always yes; dated → until last listed date; undated → forever. **NEW: `get_queryset` now filters through `_visible_posts` for all non-write actions — TB-03 is FIXED at head** (the Oct bypass claim is no longer true). But undated and full-time posts still remain indefinitely unless moderated.
- **RECOMMENDED (carried, rec A):** hide after 30 days without update, nudge the worker first. Rationale: last-date filtering leaves undated/full-time posts stale forever. Severity: medium. Benefit: the board stops filling with "ghosts". Risk: a genuinely available full-time seeker is hidden for not tapping a button; needs a nudge + one-tap renew path (cf. Q07). The 30-day number is a proposed local default, not a competitor standard.
- **ALTERNATIVE A — Keep current logic:** hide dated posts after last date; retain undated and full-time posts. Scenario: a full-time seeker from 2025 still tops the board in 2027. Trade-off: zero build, stale board.
- **ALTERNATIVE B — Hide once the last listed date passes (partly true today):** i.e. require dates on every post. Scenario: undated posts are forced to add dates or be hidden. Trade-off: kills the full-time-application use case unless that kind is exempted.
- **ALTERNATIVE C — Never:** board fills with ghosts (explicitly the cost). Other / defer: 60/90 days instead of 30; hide only from employer search, keep visible to the author.
- **Cases:** normal — post updated monthly stays visible; edge — post with a single past date plus a full-time flag (which rule wins? `post_kind` check comes first in the verified code — full-time always wins); retry — n/a; denied role — moderation (`hidden_at`) is the only verified takedown; web/Expo — both clients now get the same filtered feed (TB-03 fixed).
- **Gap type:** decision gap (inactivity window + nudge) — the code gap (TB-03) is fixed.

### GM-19-Q07 (ex AV-Q07) — Should availability show when it was last confirmed? — ✅ STILL VALID (model verified, no field)

> **Also covers (22 Nov):** GM-23-08 (GM-23). Asked once, here.
- **ACTUAL TODAY (verified):** not built. There is no freshness signal, no confirmation date, and no one-tap reconfirm; `updated_at` changes on any edit and is not a worker confirmation. No reconfirm action exists in the verified API slice; neither screen shows a freshness display.
- **RECOMMENDED (carried, rec A):** yes — show "last confirmed" plus a weekly one-tap reconfirm; mark stale after 14 days; add a pause option. Rationale: pharmacies cannot tell a live calendar from a forgotten one. Severity: medium. Benefit: trust in matching; pairs with Q02/Q06. Risk: weekly cadence may annoy; 14-day staleness is a proposed number. Needs a new field + endpoint + UI on both clients.
- **ALTERNATIVE A — No:** pharmacies guess. Scenario: an owner messages three "available" workers, two never reply. Trade-off: zero build, continued wasted outreach.
- **Other / defer:** show `updated_at` as a weak proxy (misleading — an edit is not a confirmation); monthly instead of weekly reconfirm.
- **Cases:** normal — worker taps reconfirm weekly; edge — worker pauses availability (Q01C) vs stale marking (paused ≠ stale — must be distinct states); retry — double-tap reconfirm must be idempotent; denied role — only the worker can confirm their own calendar; web/Expo — both screens verified, neither shows freshness.
- **Gap type:** decision gap (cadence + stale threshold + pause semantics), then build.

### GM-19-Q08 (ex AV-Q08) — Should urgent-shift alerts need a separate opt-in? — ✅ VERIFIED (single flag; no separate urgent consent)

> **Also covers (22 Nov):** GM22-08 (GM-22), GM-23-09 (GM-23), GM-24-Q20 (GM-24), GM26-Q18 (GM-26). Asked once, here.
- **ACTUAL TODAY (verified):** one "notify new shifts" switch per availability row (`notify_new_shifts`, default False) — the only consent in the matching engine and on both screens ("Notify me when new public shifts match my availability"). **No separate urgent-shift consent, no urgency-based alert audience, no quiet-hours** in any verified file. Escalation never re-announces, so there is no second "urgent" wave at all.
- **RECOMMENDED (carried, rec KEEP):** keep one matching-shift consent; label urgent messages clearly; add frequency controls only if volume proves necessary. Rationale: urgency does not change the notification purpose. Severity: low. Benefit: no extra settings burden. Risk: urgent alerts at night could annoy — mitigation is labelling + quiet-hours, not a second opt-in.
- **ALTERNATIVE A — Keep current logic:** same consent for urgent and ordinary shifts (identical to the recommendation here — the "keep" option IS the recommendation).
- **ALTERNATIVE B — Yes, separate urgent opt-in:** for shifts starting within 24h. Scenario: a worker wants ordinary alerts but not 2am urgent pings. Trade-off: finer control, more settings, risk workers miss urgent work they would have taken.
- **Other / defer:** quiet-hours window instead of a second opt-in.
- **Cases:** normal — urgent shift alert labelled "URGENT — starts in 3h"; edge — shift becomes urgent after posting (escalation / time passing — **verified: no re-announce happens**, so the worker is never told it became urgent); retry — duplicate urgent alerts (no dedupe seen in the traced function; caller not traced); web/Expo — same server flag on both.
- **Gap type:** decision gap (small). **No longer blocked — the engine is verified.**

### GM-19-Q09 (ex AV-Q09) — Should workers set a max distance and minimum rate for alerts? — 🔄 SPLIT (distance verified, rate verified absent)

> **Also covers (22 Nov):** GM-18-Q25 (GM-18), GM22-09 (GM-22), GM-23-10 (GM-23). Asked once, here.
- **ACTUAL TODAY (verified):** **distance IS enforced in alerts** — `_user_can_travel_to_shift` (open-to-travel requires the pharmacy state in `travel_states`; otherwise haversine distance ≤ `coverage_radius_km`; missing coords/radius → no match). Both screens expose travel/radius (web default 30 km; mobile 5–1000 km + map preview). **Minimum rate is NOT checked** — `announce_availability_matches` has no rate comparison; `UserAvailability` has no rate field. Talent-post radius (`coverage_radius_km` on `ExplorerPost`) is a separate snapshot from the matching prefs.
- **RECOMMENDED (carried, rec A):** yes — alerts respect both max distance and a minimum rate; search can still widen deliberately. Rationale: a worker 90 minutes away, or below their minimum rate, should not be alerted. Severity: medium. Benefit: fewer irrelevant alerts; owners reach workers who will actually accept. Risk: a minimum-rate field needs a source of truth (onboarding rates vs per-availability rate — the model has neither); too-tight filters thin the audience for hard-to-fill shifts.
- **ALTERNATIVE A — Keep current logic:** respect existing distance/travel preferences without filtering alerts by minimum rate. Scenario: a $70/hr locum is alerted about a $55/hr shift and declines. Trade-off: zero build, continued mismatched alerts.
- **ALTERNATIVE B / Other:** distance only, no rate (rate is negotiated per offer — GM-12); or rate only for PLATFORM-tier alerts. Defer: add rate filtering after launch data.
- **Cases:** normal — alert only within radius and at/above minimum rate; edge — pharmacy just outside radius but offering travel/accommodation (GM-10 travel fields — interplay unverified); shift rate changed after posting (frozen terms vs live card — GM-10 SH-08, unverified here); retry — n/a; web/Expo — both screens verified, same travel form.
- **Gap type:** decision gap for the rate half (whether rate filters alerts; where the minimum rate lives); the distance half is **built and verified** — no decision needed there. **No longer blocked — `announcements.py` is verified.**

### GM-19-Q10 (NEW) — Should availability validation be added, and what must it reject? — ✅ VERIFIED (no validation)

> **Also covers (22 Nov):** GM-18-Q19 (GM-18), GM-23-17 (GM-23). Asked once, here.
- **ACTUAL TODAY (verified):** any row is accepted (end ≤ start, past date, weekday out of range, recurring with no days, exact duplicates). Serializer has zero `validate_*` methods; the characterisation tests contain no validation tests. AV-05 CONFIRMED (GM-18 agreed).
- **RECOMMENDED:** add validation (start < end unless all-day; weekdays 0–6; recurring rows must list days; date not in the past for non-recurring rows; reject exact duplicates). Severity: medium. This is a **code gap** (no owner choice needed on the principle), but the owner should confirm the past-date rule: can a worker backdate availability for record-keeping?
- **ALTERNATIVE A — Keep current logic:** no validation. Scenario: a worker saves 17:00–09:00 by mistake and is matched (or not matched) unpredictably. Trade-off: zero build, garbage in.
- **ALTERNATIVE B — Validate as above.** **ALTERNATIVE C — Validate + allow past dates with a warning.** Other / defer.
- **Gap type:** code gap, with one owner sub-decision (past dates).

### GM-19-Q11 (NEW) — Should a roster availability warning block placement, or stay a warning? — ✅ VERIFIED (warning only)
- **ACTUAL TODAY (verified, `validation.py`):** warning only, and silent when no availability is declared. A manager can roster a worker outside their declared availability, and a worker who declared nothing is never flagged.
- **RECOMMENDED:** keep as a warning at launch (blocking would strand managers when a worker simply never filled in availability), but surface it prominently and log it; revisit after launch data.
- **ALTERNATIVE A — Keep current logic (warning).** **ALTERNATIVE B — Hard error when availability declared and shift outside it.** Scenario: manager tries to roster a Monday-only locum on Saturday and is blocked. Trade-off: protects workers, risks stranding a shift when availability is stale (Q02/Q07). **ALTERNATIVE C — Hard error only for internal roster, warning for cover.** Other / defer.
- **Gap type:** decision gap.

### GM-19-Q12 (NEW) — Should the talent-post availability snapshot sync with the calendar? — ✅ VERIFIED (structural; never syncs)

> **Also covers (22 Nov):** GM-18-Q17 (GM-18), GM-23-01 (GM-23), GM25-C15 (GM-25). Asked once, here.
- **ACTUAL TODAY (verified, model shape + GM-18):** two stores, no link in `models.py`; editing availability does not update any talent post. The copy call-site was not re-traced (GM-18 territory), but the structural fact stands: no sync mechanism exists.
- **RECOMMENDED:** sync on edit, or show a "last synced" stamp and a one-tap "update my post" action — owner to choose.
- **ALTERNATIVE A — Keep current logic (one-time copy).** Scenario: worker changes Mondays to Tuesdays; her post still says Mondays for months. Trade-off: zero build, stale posts. **ALTERNATIVE B — Auto-sync.** **ALTERNATIVE C — Post reads the live calendar instead of a snapshot (ties to Q04).** Other / defer.
- **Gap type:** decision gap (AV-01 carried).

### GM-19-Q13 (NEW) — Next web: does an availability surface exist, and must it match Vite/Expo? — ✅ VERIFIED ABSENT
- **ACTUAL TODAY (verified by listing):** the migrated-pages directory under `frontend_web/landing_next/migrated/pages/dashboard/sidebar/` contains **only `ShiftsBoard` + `TalentBoard`** — no SetAvailability, no billing, no pills. Next has no availability surface as traced. Whether the live Next site serves these migrated copies is UNKNOWN (GM-25).
- **RECOMMENDED:** record as a parity gap (GM-25); the owner then decides whether Next needs availability at launch or can defer to Vite/Expo. This is a code/parity gap, not a GM-19 decision, until the owner chooses the Next launch scope.
- **Gap type:** parity gap (GM-25), not a decision — until located otherwise.

### Carried decisions touching GM-19 (from #184 `carried`, NOT re-decided here)
- **D01–D05, E01/E03, R04/R04D, P02–P12** (see `questions.json` `carried`). GM-19's questions assume the D01 reservation model (acceptance = time-limited reservation; payment confirms — GM-13 verified D02/D03 are **not implemented**, so the reservation has no pay-by deadline and no expiry flow; availability alerts are therefore the only time-sensitive signal a worker gets about a shift).
- **TB-03 (visibility rule applied everywhere):** Oct gap — **FIXED at head** (§1c). No longer a decision.
- **AV-01 (post/calendar sync):** carried as Q12. **AV-05 (no validation):** confirmed, Q10. **AV-04 (match emails miss escalated shifts / reach unverified workers):** **now VERIFIED in both halves** — escalated shifts get no re-announce (escalation has no announce call, no beat entry); unverified workers ARE alerted (no Verified/AHPRA filter in `announce_availability_matches`).

## 4. SINGLE FIRST DECISION QUESTION (ask the owner first)

**GM-19-Q03 — When does availability "match" a shift?**

Plain English: today the code disagrees with itself. The **emails and dashboard suggestions** use "any overlap counts" — a worker free 9–10am is told about a 9am–5pm shift. The **roster warning** uses "the whole shift must sit inside your free hours" — the same worker is flagged as unavailable for that shift. So the inbox says "you can cover this" and the roster says "you can't", for the same worker and the same shift. This question picks one rule for everywhere, because it decides who gets told about every shift.

- **Option KEEP — Keep current logic:** any-overlap alerts + full-containment roster warnings. *Scenario:* a worker free 9–10am is emailed about a 9am–5pm shift, applies, and cannot cover it; the owner waits for a reply that never comes. *Trade-off:* no build; alerts stay noisy and the roster disagrees with the inbox.
- **Option A — RECOMMENDED — Shift fully inside availability, everywhere:** the same rule for alerts, dashboard suggestions, and roster warnings. *Scenario:* only workers free for the whole 9–5 shift are emailed; a worker free 9–1 is not. *Benefit:* every alert means "you can actually cover this". *Risk:* fewer people alerted per shift, especially for long shifts; owners may need to widen the audience (GM-11 escalation) more often.
- **Option B — Overlap of at least X%:** availability must cover a chosen share (e.g. 50% or 4 hours) of the shift. *Scenario:* a worker free 9–1 gets the 9–5 alert and the owner can negotiate a part-cover; a worker free 9–10 does not. *Trade-off:* needs the threshold picked and explained, and a part-cover path (GM-07) to make the alert useful.
- **Option Other (describe) / Defer:** e.g. any overlap as a deliberate "wide net", or match on date only and ignore times; or defer until alert-to-apply data exists after launch.

*Ask this first because it is the hinge for Q05 (booked time), Q08 (urgent alerts) and Q09 (distance/rate filters) — all of them filter an audience that Q03 defines. No caveat remains on the evidence: both rules are now verified at head, so KEEP is a known quantity, not an unknown.*

## 5. Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; do NOT present as decided)
- **CG-1 — No availability validation (AV-05; Q10).** Serializer has no `validate_*` at all. Verified at head (`backend/talent/serializers/availability.py`); no validation tests exist.
- **CG-2 — Talent-post availability snapshot never syncs (AV-01; Q12).** Structural fact in `models.py`; no sync mechanism exists.
- **CG-3 — Match alerts use any-overlap while roster uses full containment (Q03).** Both verified; the fix follows the owner's Q03 choice — the divergence itself is a code gap once the rule is chosen.
- **CG-4 — Match emails miss escalated shifts (AV-04, first half).** VERIFIED: escalation never re-announces (`escalation.py` has no announce call; `auto_escalate_due_shifts` has no beat entry and no caller found). A shift that escalates to a wider audience gets no new availability alerts.
- **CG-5 — Match emails reach unverified / AHPRA-lapsed workers (AV-04, second half).** VERIFIED: no Verified/AHPRA filter in `announce_availability_matches`; no lapsed-credential re-check on post visibility.
- **CG-6 — Booked time and approved leave do not suppress match alerts (Q05).** VERIFIED: no assignment or leave check in `announce_availability_matches` (roster blocks both; alerts block neither).
- **CG-7 — Authenticated talent list exposes author identity unmasked (LA-Q12).** VERIFIED: authenticated list uses the unmasked serializer (`author_user_id`, `explorer_user_id`, `explorer_name`); public feed masks anonymous posts.
- **CG-8 — Next-web availability surface absent (Q13).** VERIFIED by listing: only `ShiftsBoard` + `TalentBoard` under the migrated dashboard sidebar. Parity gap (GM-25).
- **CG-9 — Missing coords/radius silently excludes a worker from matching.** VERIFIED: `_user_can_travel_to_shift` returns no-match when coordinates or radius are missing — the worker is never told they are invisible to matching.
- ~~CG (TB-03 — visibility rule bypass)~~ — **FIXED at head** (`get_queryset` filters through `_visible_posts` for all non-write actions). Removed from the gap list.

### Decision gaps (owner must choose first)
- DG-1 — Blackout/unavailable exceptions (Q01). DG-2 — Recurrence horizon + reconfirm cadence (Q02).
- DG-3 — Single matching rule (Q03) ★ first. DG-4 — Who sees availability / opt-in scope (Q04).
- DG-5 — Booked time / leave suppressing alerts (Q05, alert side). DG-6 — Talent-post inactivity window (Q06).
- DG-7 — Freshness signal, reconfirm cadence, stale threshold, pause (Q07).
- DG-8 — Urgent-alert consent (Q08). DG-9 — Minimum-rate alert filter + where the rate lives (Q09, rate half only — distance is built).
- DG-10 — Roster warning: block or warn (Q11). DG-11 — Post/calendar sync mode (Q12).
- DG-12 — Next availability scope at launch (Q13 / GM-25).

## 6. Documentation matrix & implementation backlog

### Per-question source links (verified @ PR #249 head 97c4543e unless marked ❓)

| Question | Status | Source |
|---|---|---|
| GM-19-Q01 (AV-Q01) | ✅ STILL VALID | `models.py` (`UserAvailability`), both SetAvailability screens |
| GM-19-Q02 (AV-Q02) | 🔄 Oct claim WRONG (end date optional) | `models.py`, both screens (payload `recurring_end_date: null`) |
| GM-19-Q03 (AV-Q03) | ✅ VERIFIED divergence | `announcements.py::_availability_matches_slot` (any-overlap) vs `validation.py` (full containment) |
| GM-19-Q04 (AV-Q04) | ✅ STILL VALID | `views/availability.py` (own-rows), `explorer.py` (unmasked list) |
| GM-19-Q05 (AV-Q05) | 🔄 alert side VERIFIED (not suppressed) | `announcements.py` (no assignment check) vs `validation.py` (`SHIFT_OVERLAP`) |
| GM-19-Q06 (AV-Q06) | ✅ STILL VALID; TB-03 FIXED | `models.py` (`is_talent_board_visible`), `explorer.py` (`_visible_posts`) |
| GM-19-Q07 (AV-Q07) | ✅ STILL VALID | `models.py` (no `confirmed_at`); both screens (no freshness display) |
| GM-19-Q08 (AV-Q08) | ✅ VERIFIED (single flag) | `announcements.py`, `models.py` (`notify_new_shifts`), both screens |
| GM-19-Q09 (AV-Q09) | 🔄 SPLIT (distance ✓, rate ✗) | `announcements.py` (`_user_can_travel_to_shift`; no rate check) |
| GM-19-Q10 (NEW, AV-05) | ✅ VERIFIED (no validation) | `serializers/availability.py`, `test_availability_api.py` |
| GM-19-Q11 (NEW) | ✅ VERIFIED (warning only) | `validation.py` (`AVAILABILITY_CONFLICT`) |
| GM-19-Q12 (NEW, AV-01) | ✅ VERIFIED (never syncs) | `models.py` (two stores, no link); GM-18 |
| GM-19-Q13 (NEW, Next) | ✅ VERIFIED ABSENT | migrated-pages listing (`ShiftsBoard` + `TalentBoard` only) |

### Decision status per question
- Decided: **none** in this trace. (Carried D01–D05/E01/E03/R04/R04D/P02–P12 are #184-era decisions, not re-confirmed here.)
- Ready to decide now: **GM-19-Q03 first**, then Q01, Q02, Q04, Q05, Q06, Q07, Q08, Q09 (rate half), Q10 (past-date sub-decision), Q11, Q12.
- Blocked on re-trace: **none** in this area — every NOT RE-VALIDATED item from the partial is now verified, except the three UNKNOWN callers in §7 (which do not block any question; they block implementation detail, not the decision).
- Owned by another area: GM-19-Q03's escalation half (GM-11), the AHPRA accept gate (GM-01/GM-02), the posting flow that calls the announce functions (GM-10), the Next launch scope (GM-25), the anonymous-post reveal timing (GM-18 / TB-02 / LA-Q12).

### Implementation backlog — PROPOSED ONLY, after owner answers (nothing here is decided)
1. Q03: implement the single chosen matching rule in the alert engine (`_availability_matches_slot`) + roster warning + dashboard recommendations (`find_availability_matched_shifts`), with tests for touching endpoints and overnight shifts.
2. CG-1 (Q10): add serializer validation + tests (positive/negative: end ≤ start, bad weekday, recurring without days, past date, duplicate).
3. Q01/Q02/Q07: blackout model + recurrence horizon + `confirmed_at` + reconfirm nudge job + pause, on Vite + Expo (+ Next if it gains the surface).
4. Q04/Q12: opt-in visibility + post/calendar sync mode chosen by the owner.
5. Q05: suppress booked (and approved-leave) time in matching alerts; restore on cancellation.
6. Q06: inactivity hide + nudge, applied consistently (feeds already filter through `_visible_posts` — TB-03 fixed).
7. Q09: minimum-rate preference (source of truth to be decided) in the alert filter.
8. CG-4/CG-5: re-announce on escalation (or confirm deliberately not); add a Verified/AHPRA filter to alert recipients and a lapsed-credential re-check on post visibility.
9. CG-7: decide the authenticated-list identity exposure (LA-Q12) with GM-18.
10. CG-8/Q13: Next availability surface (or a documented deferral to Vite/Expo) — GM-25.
11. CG-9: tell a worker when missing coords/radius makes them invisible to matching (or default the radius at onboarding).
12. Cross-client positive/negative tests per decision (worker/owner/admin/org roles, wrong tenant, stale session, timezone/overnight, duplicate/concurrent edits, double-posting).

### What the parent agent / next worker must do next
1. Trace the three remaining UNKNOWN callers before implementation: who calls `announce_posted_shift` / `announce_availability_matches` (posting flow, GM-10); which screen calls `find_availability_matched_shifts`; who calls `auto_escalate_due_shifts` (and whether it should have a beat entry — GM-11).
2. Ask the owner **GM-19-Q03 first**, one question at a time (per #250), before any implementation.
3. Do not raise a PR, change code, or treat any recommendation above as a decision.
