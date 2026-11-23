# ChemistTasker Grill Me — refresh against PR #257

**Date:** 2026-11-21 (AEST)
**Scope:** Read-only refresh. No GitHub writes, no owner notification.
**Grill Me traced head:** PR #249 head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`
**Candidate head:** PR #257 head `ad01356ee4689c8afaafc3028b5571c45101d925`
**Repo:** chemisttasker11-ezy/ChemistTasker-Ezy1
**Method:** Slow sequential GitHub read-tool calls (≥5 s apart, no 429 encountered).
Sources: PR #257 `get` / `get_files` (64 files) / `get_commits` (33) / `get_diff`
(357,024 chars, saved at `/tmp/pr257/pr257_diff.txt`); `list_commits` ancestry
pages 1–3 from the #257 head; `get_file_contents` at **both** heads for 6 files
(blob-SHA comparison); PR #260 / #261 / #262 `get`. Prior audit:
`/tmp/grill267/INDEPENDENT_SENIOR_AUDIT_2026-11-21.md.md`; queue:
`/tmp/grill267/GRILL_ME_CONSOLIDATED_QUEUE.md.md`.

## 1. Commit-count verification — audit claim CONFIRMED

- `list_commits` from `ad01356e`, 100 per page: page 1 (positions 0–99) and page 2
  (100–199) do **not** contain `97c4543e`; page 3 contains it at index 20.
  Position = 200 + 20 = **220 commits ahead, 0 behind**.
- `97c4543e` is an ancestor of `ad01356e`, so "behind" is 0 by construction.
- PR #257 itself is much smaller than the 220 span: **33 commits, 64 files,
  +4,364 / −790** vs its own base `wip/pr249-int` (`5c28634d0f303c3dcddf99b5a2da1619be75389d`).
  The other ~187 commits in the 220 span sit between the #249 head and the #257 base.
- PR #249 (for reference): open draft, head `97c4543e`, base `feat/mobile-merge-sdk`,
  314 files, 458 commits, +13,189 / −1,794.
- PR #257: open draft, **not merged**, branch `agent/pr249-m5-combined-candidate`,
  labels `full-qa`, `native-qa`, mergeable state `unstable`. Title:
  "[Draft QA] PR249 combined M4-04 and M5-01–05 integration acceptance".

### Changed areas in PR #257's own 64 files (vs its base)

| Area | Files | Main file groups |
|---|---|---|
| frontend_mobile | 38 | Shift Centre / posting wizard (`roles/shared/shifts/…`, `roles/owner/shifts/create.tsx`), marketplace parity (`features/parity/marketplace*.tsx/ts`), 12 new `scripts/m4-*.cjs` / `m5-*.cjs` harness tests |
| backend | 11 | `chat/views.py` + `test_api.py`, `marketplace/serializers.py` + `views.py` + `test_m4_submission.py`, `shifts/test_m5_posting_scope.py`, `core/` → `infrastructure/request_fingerprint.py` move, `organizations/views.py`, `talent/views/explorer.py` (import only) |
| shared-core | 7 | NEW `domains/shifts/audience.ts` + `audience.test.ts`, NEW `domains/shifts/postingWindow.ts` + `postingWindow.test.ts`, `domains/shifts/index.ts`, `src/index.ts`, `m4Marketplace.test.ts` |
| frontend_web | 6 | `landing_next/features/marketplace/add-item-wizard.tsx` + `m4Review.test.mjs`, `landing_next/shared/browser-session.ts`, dashboard `ActiveShiftsPage/utils/audience.ts` + `m5Audience.test.mjs`, `scripts/auth-flow.test.mjs` |
| docs / scripts | 2 | `docs/architecture/RUNTIME_CYCLE_LEDGER_20261029.json` (109 → 110 edges), `scripts/test_module_import_graph.py` |

28 of the 64 files are test/harness-only; 36 are non-test. No backend file
outside chat / marketplace / shifts-tests / fingerprint-move is touched by #257's
own diff — but see the method caveat in §4: intermediate commits between the
#249 head and the #257 base **do** change at least one Grill-relevant file
(`backend/talent/serializers/explorer.py`), so "unchanged in #257's diff" alone
is not proof of "identical at both heads". Blob checks (§3) cover the
highest-risk files.

## 2. What PR #257 changed, in concrete terms

### PR #257 title/body (verbatim substance)

Title: "[Draft QA] PR249 combined M4-04 and M5-01–05 integration acceptance".
Body: "Isolated unmerged integration candidate for mobile PR249. Composes M4-04
marketplace and M5-01 Shift Centre, M5-02 candidates, M5-03 Confirmed/History,
M5-04 posting correctness, M5-05 native design. Reconciles shared-core
audience+postingWindow exports and all mounted acceptance test imports.
Contains M5-02 harness fixes and M5-05 follow-up. HOLD: GitHub Actions
integrated tests, architecture-cycle/beat registry failures, independent
reviewer, Android/iOS emulators, staging payments not yet signed off. Do not
merge, deploy, or run real providers."
Senior continuation (7 Nov 2026, candidate `b56ef9bfd2f2`): generated runtime
dependency ledger reconciled (37 combined cyclic edges unchanged); logout/login
return-path regression fixed (invalid logout destinations must not force generic
`/dashboard` after the next identity signs in); M5-05 structural test for
keyboard-aware footer outside ScrollView; M5-02 mounted Buzz double-tap test
and synchronous single-flight guard with intentional retry after settling;
M5-02 real `useShiftActions` hook tests (single-flight escalation, deletion,
candidate acceptance; implementation locks by action key before changing React
state, later retry preserved). "No backend financial or authorization rules changed."

### M4-04 — ordinary marketplace

- Backend (`backend/marketplace/serializers.py`, `views.py`): new
  `repair_blank_listing_slug()` — `slugify(listing.title)[:160] or "listing"`;
  called on update and on the action endpoint; create now passes
  `slug=data["slug"]` explicitly. New `backend/marketplace/test_m4_submission.py`
  (+301 lines).
- Mobile (`frontend_mobile/features/parity/marketplace.tsx` +170/−44,
  `marketplaceDraft.ts` +40/−4): draft read/modify/write serialised per account
  (`loadSettledMarketplaceDraft`, queued `patchMarketplaceDraft` with
  `isCurrent` guard, queued `clearMarketplaceDraft`); new
  `uploaded_image_ids: Record<string, number>` on the draft; Review step merges
  durable server receipts (created listing id/version, uploaded image URIs)
  before create/update; photo removal now deletes the uploaded image via API
  (refuses when the id is unknown) instead of only dropping the local URI;
  submit is a synchronous double-tap mutex with account-switch invalidation.
  New harnesses: `m4-marketplace-harness.cjs`, `m4-marketplace-review.test.cjs`,
  `m4-marketplace-step-races.test.cjs`.
- Web (`frontend_web/landing_next/features/marketplace/add-item-wizard.tsx`
  +109/−38): one durable receipt per draft (`createReceipt` UUID =
  `client_request_id`, surviving retries); retry reuses the receipt via
  `updateListing` instead of creating a duplicate; account change invalidates
  receipt/uploads/generation; photo removal deletes the uploaded image via API;
  upload failures are no longer swallowed and submit failure no longer claims
  publication with missing photos. New `m4Review.test.mjs` (+388).
- Shared-core: `m4Marketplace.test.ts` (+133). No change to prohibited
  products, moderation, identity, pricing or fulfilment rules.

### M5-01 — Shift Centre

- Mobile `roles/shared/shifts/ShiftsScreen.tsx`: per-persona "Shift Centre"
  heading + subtitle (owner / organization / admin).
- Mobile `ActiveShiftsPage/ActiveShiftCards.tsx`: audience pill from shared-core
  (`Internal · <label>` / `Platform · <label>`, with "Visible now to <reach>"
  hint), "Interested" relabel, "N waiting for review" / "Payment required" /
  "New activity" pills, "Manage candidates" expander; role/employment pills
  humanised.
- Web dashboard `ActiveShiftsPage/utils/audience.ts`: `AUDIENCE_LEVELS` now built
  from shared-core `SHIFT_AUDIENCE_LEVELS` (same 5 levels, icons mapped locally);
  new `m5Audience.test.mjs`.

### M5-02 — candidates

- `ActiveShiftsPage/components/Candidates/CommunityLevelView.tsx`: "Your network",
  internal-candidates reach text via `getShiftAudienceLevel(visibility)`; section
  order swapped to "No reply" then "Rejected".
- `.../Candidates/PublicLevelView.tsx`: "Chemisttasker platform"; counter-offers
  now "Review proposed changes to rates or times." / "Asked for a different rate
  or time."; interested section "Applied at the posted rate."; unrevealed
  candidates shown as "Anonymous applicant" / "Reveal to see name and profile";
  status pill "Offer sent · awaiting reply".
- `.../Candidates/StatusCard.tsx`: same "Offer sent · awaiting reply" pill;
  "No reply" treated like "No Response" for the hourglass icon.
- `.../hooks/useShiftActions.ts`: synchronous single-flight locks
  (`pendingActions` ref) for escalate / delete / accept; accept lock key is now
  per-slot (`accept_<shift>_<user>_<slot|all>`) — "the server offers distinct
  slots independently; only duplicate taps for the same slot share a lock".
- `ActiveShiftsPage/index.tsx`: Buzz sends locked synchronously (`buzzBusyRef`);
  accept-loading lookup uses the per-slot key; empty/error copy reworded.
- `.../Escalation/EscalationStepper.tsx`: "Who can see this shift" header;
  per-step "Live now / Notified / Next / Later"; escalate CTA now reads
  "Escalating notifies <reach>." (reach from shared-core).
- New harness tests: `m5-active-shifts.test.cjs` (+464),
  `m5-assigned-boards.test.cjs` (+443), `m5-shift-actions.test.cjs` (+91),
  `m5-shift-centre.test.cjs` (+132).

### M5-03 — Confirmed / History

- `ConfirmedShiftsView.tsx` (+40/−1): "Message" action on confirmed shifts —
  `messageAssigned(userId)` starts a direct chat via `startDirectChat` with a
  synchronous per-user lock, generation/scope guards, and role-aware routing
  (`getMessageDetailRoute`); payroll activation moved to a synchronous
  `pendingPayrollRef` lock.
- `HistoryShiftsView.tsx` (+4/−1): rating save guarded by a synchronous
  `savingRef` double-submit lock.
- `OwnerAssignedShiftBoard.tsx` (+55/−34): slot grid 1/2/3 columns by width;
  confirmed/history chips ("Confirmed · N dates booked" /
  "Completed · N of M dates booked"); per-slot "Booked / Worked / Not filled"
  chips; "View profile" + "Message" (confirmed) / "Rate" (history) buttons;
  empty states "No confirmed shifts yet" / "No past shifts yet"; `onMessageAssigned` prop.

### M5-04 — posting correctness

- New `backend/shifts/test_m5_posting_scope.py` (+66): posting permission matrix
  — POST `/api/v1/shifts/` returns 201 for owner, org-admin and roster-manager,
  403 for communication-manager, pharmacist, other-staff, explorer and foreign
  owner, 401 anonymous; PATCH returns 200 for posters, 404 for non-posters,
  401 anonymous; cross-pharmacy POST returns 403; template upsert is
  per-pharmacy scoped and foreign delete returns 404. (Test-only file; no
  production posting code changed by #257.)
- Mobile `PostShiftScreen.tsx` (+88/−23) and helpers: admin scoped-pharmacy
  denial on hydrate ("You do not have access to this shift."); success toast
  now "Shift posted/updated successfully!" with a "View shifts" action that
  navigates to the persona's Shift Centre only after the toast is dismissed
  (no longer unmounts the Snackbar); `ApiError` handling; Timetable step
  receives the posting window.
- Legacy `frontend_mobile/roles/owner/shifts/create.tsx` (+9/−501): the entire
  504-line duplicate owner create-shift form (own pharmacy fetch, date/time/
  role/rate/description fields, `createShift` submit) deleted and replaced by a
  12-line redirect to the canonical `/owner/post-shift` wizard (preserving
  `pharmacy_id`).

### M5-05 — native design

- `PostShiftScreen.tsx` / `PostShiftScreen.styles.ts`: keyboard-aware footer
  moved **outside** the `ScrollView` (new `stickyFooter` style), wrapped in
  `KeyboardAvoidingView`; submit disabled while the success toast is showing.
- `PostShiftDetailsStep.tsx` / `PostShiftPayRateStep.tsx`: accessibility roles
  (`accessibilityRole="header"`) and helper copy ("What should the person know
  before they apply?", "Change any date that pays differently.", "Shown to
  applicants as a range.", "How is the rate set?", "Award rate").
- `PostShiftTimetableStep.tsx`: calendar month navigation disabled outside the
  posting window; out-of-window day cells disabled at 0.35 opacity.
- New look/component tests: `m5-post-shift.test.cjs`, `m5-post-shift-components.test.cjs`,
  `m5-post-shift-look.test.cjs`, `m5-post-shift.test.cjs` (+59), `postShiftLogic.test.mjs`,
  `postShiftSlotRepair.test.mjs`.
- PR body hold remains: no Android/iOS emulator or physical-device evidence in #257.

### Shared-core audience + postingWindow exports

- NEW `shared-core/src/domains/shifts/audience.ts` (+28): `ShiftAudienceKey`
  (FULL_PART_TIME, LOCUM_CASUAL, OWNER_CHAIN, ORG_CHAIN, PLATFORM),
  `SHIFT_AUDIENCE_LEVELS` with the **same labels, reach text, scope and order**
  as the previous web/mobile copies ("My Pharmacy", "Favourites", "Chain",
  "Organization" — requiresOrganization, "ChemistTasker" — platform), plus
  `getShiftAudienceLevel()`. Comment: "Ascending notification reach; do not
  change the ordering without a server policy decision." Exported from
  `domains/shifts/index.ts` and `src/index.ts`. Consumed by web `audience.ts`,
  mobile `ActiveShiftCards`, `CommunityLevelView`, `EscalationStepper`,
  `displayHelpers` (replaces its local label map).
- NEW `shared-core/src/domains/shifts/postingWindow.ts` (+45):
  `shiftPostingDateWindow(today)` → `{minIso, maxIso}` = **today through the
  last day of the fourth calendar month following today, inclusive**;
  `splitPostableDates()` splits dates into valid / past / late instead of
  silently discarding. Comment: "Calendar-day parity with the existing web
  posting form. No instant/timezone conversion for ISO days." Exported from
  both indexes. Consumed by `PostShiftScreen.helpers.ts` (slot validation:
  "That date has passed. Pick today or later."), `PostShiftScreen.tsx`
  (incoming/selected/submit date checks, toast "Past dates were left out."),
  `PostShiftTimetableStep.tsx`.
- `docs/architecture/RUNTIME_CYCLE_LEDGER_20261029.json`: module edges 109 → 110
  (fingerprint move); PR body says 37 combined cyclic edges unchanged.
- `backend/core/request_fingerprint.py` → `backend/infrastructure/request_fingerprint.py`:
  byte-identical move (same function body); old module is now a compatibility
  re-export; `organizations/views.py` and `talent/views/explorer.py` import
  from the new location only.

### Related PRs (audit mentions)

- **PR #260** "[Draft QA] PR257 chat authorised-participant fix verification" —
  open draft, head `ad01356e` (same SHA as #257's head), branch
  `agent/pr257-chat-fix-20261107`, base `agent/pr257-chat-closeout-20261107`,
  **1 file, 1 commit, +3/−3**. The fix itself (see GM-20) is therefore already
  inside #257's head; #260 is a verification vehicle stacked on tests-first
  PR #259 (`feb87da2`). Not a separate code change to reconcile.
- **PR #261** "[Draft QA] PR257 native acceptance selector and iOS compiler recovery" —
  open draft, head `cd5c2bfe5ef9`, branch `agent/pr257-native-acceptance-closeout-20261107`,
  base `agent/pr249-m5-combined-candidate` (= #257's branch), 2 files, 2 commits,
  +58/−10. Fixes native CI failures at head `420e3ea`: Android Maestro looked for
  "Work email" though the label is "Email"; iOS compile failed in
  `expo-modules-jsi JavaScriptObject.swift:946` (Swift 6.2 / Xcode 26.2). Test-only
  `b615e99b` + fix `cd5c2bf` (Maestro selectors, macos-26). **Not in #257** —
  relevant to GM-25 native CI, still separate.
- **PR #262** "[Draft QA] PR257 exact-head acceptance and release ledger" —
  open draft, head `cf958b49a62b`, branch `agent/pr257-evidence-ledger-20261107`,
  docs-only. Pins successful/failed/skipped workflows to the exact tested SHA,
  Android/iOS root-cause findings, W3–W8 rules, the 10 core UI states, and
  isolated runbooks; "deliberately preserves RELEASE HOLD". No app-logic change.
  Relevant to GM-26 evidence, not to behaviour.

## 3. Both-heads file verification (blob SHA at #249 head vs #257 head)

| File | #249 blob | #257 blob | Result |
|---|---|---|---|
| `backend/shifts/posting.py` | `302153eb05adf5b58f03c783ad33331ab2bebf15` | same | IDENTICAL — `Decimal('0.00')` fallback still present |
| `backend/billing/checkout_reservations.py` | `715d1bac06c4a0e522f59345d2e667b66eeeec97` | same | IDENTICAL — same blob the audit cited; no `pay_by` / D02 |
| `backend/shifts/interest.py` | `ef0f8920f8b36e6f926cd4efe01bbac420a58373` | same | IDENTICAL |
| `backend/workforce/roster/worker_actions.py` | `646be7b92e1fef2a2b2298fa5ace98eafd6c197a` | same | IDENTICAL — R04C gap persists |
| `backend/shifts/escalation.py` | `739dbbaeadc661114e2cb793a33ccd264a02e5af` | same | IDENTICAL |
| `backend/talent/serializers/explorer.py` | `652c88035e4d50d802bb9b1931ecd5254cbb886d` | `48a1276a593df424807d96f84d7310fade214f16` | **DIFFERENT** (see GM-18) |

The explorer-serializer difference comes from intermediate commits (it is not in
#257's own 64-file diff): new `PublicAvailabilityDaysField` — typed public slots
(date/start/end/is_all_day/notes, snake + camel aliases, legacy date-only strings
kept), `to_representation` sanitises and drops malformed legacy entries, write
path validates the list, and AVAILABILITY updates now fall back to the existing
`availability_days` instead of resetting to `[]`. **Identity fields are unchanged:**
`explorer_name`, `author_user_id`, `explorer_user_id` are still exposed at the
#257 head — the AUDIENCE-01 identity leak persists.

## 4. Per-area verdicts (GM-01 to GM-26)

Verdicts: **UNCHANGED** — no #257 change touches this area's traced behaviour.
**CHANGED** — touched, with new evidence below; first question / recommendation
stated as changed or unchanged. **NEEDS RE-TRACE** — touched but the effect could
not be verified from the diff alone.

**Counts: UNCHANGED 10 · CHANGED 15 · NEEDS RE-TRACE 1.**

| Area | Verdict | Evidence / effect | First question / recommendation |
|---|---|---|---|
| GM-01 Sessions/auth | **CHANGED** (minor) | `frontend_web/landing_next/shared/browser-session.ts` +1/−1: `loginHref` no longer defaults to `/dashboard` when there is no safe `next` (returns plain `/login`); PR body records the logout/login return-path regression fix. `auth-flow.test.mjs` +7/−1. No session/OTP/backend-auth change. | GM01-Q04 unchanged; no recommendation change. |
| GM-02 Worker onboarding/credentials | UNCHANGED | No onboarding, credential, AHPRA or mobile-onboarding file touched. | ON-P03 unchanged. MOBILE-PARITY-01 joint re-inspection pass still not done. |
| GM-03 Pharmacy/owner setup | **CHANGED** | Legacy owner create-shift form deleted → redirect to canonical Post Shift wizard (`create.tsx` +9/−501); PostShiftScreen denies admin hydrating a shift outside their scoped pharmacy. Backend posting gate unchanged (posting.py identical, §3). | GM-03-Q01 / PHARM-GATE-01 unchanged. |
| GM-04 Organisations/chains/regions | UNCHANGED | Only an import-line change in `backend/organizations/views.py` (fingerprint move, byte-identical function). No org/claim/membership behaviour change. | GM-04-Q01 unchanged. |
| GM-05 Roles/membership/invites | **CHANGED** | New `backend/shifts/test_m5_posting_scope.py` pins a posting permission matrix (owner / org-admin / roster-manager 201; comms-manager / pharmacist / other-staff / explorer / foreign owner 403; anon 401; PATCH 404 for non-posters; cross-pharmacy POST 403). Test-only; no production role code changed. | Q-01 / AHPRA-FAV-01 unchanged. Q-16/Q-17 mobile screens still NOT VERIFIED. |
| GM-06 Employment/leave | UNCHANGED | No leave/employment/roster file touched; `worker_actions.py` identical. | GM-06-Q06 unchanged. |
| GM-07 Internal roster/cover/swap | UNCHANGED | `backend/workforce/roster/worker_actions.py` blob identical at both heads — the R04C target-consent violation **persists** in #257 (verified both versions, not assumed). | GM-07-Q04 unchanged; R04C remains APPROVED + IMPLEMENTATION GAP. |
| GM-08 Attendance/kiosk | UNCHANGED | Nothing touched. | GM-08-Q01 unchanged. |
| GM-09 Timesheet/payroll | **CHANGED** (minor) | ConfirmedShiftsView payroll activation now uses a synchronous `pendingPayrollRef` lock (double-tap guard); OwnerAssignedShiftBoard adds confirmed/history booking chips and "Booked / Worked / Not filled" per-slot states. No payer-model, hours-freeze or money-path change. | GM-09-Q01 unchanged. |
| GM-10 Shift posting/rates | **CHANGED** | Mobile posting heavily reworked: legacy form deleted → canonical wizard; `postingWindow` enforced (today → end of 4th month; past/late dates explained, calendar cells disabled); admin scoped-pharmacy denial; success toast with "View shifts". **Core defect persists:** `backend/shifts/posting.py` blob identical — `validated_data['fixed_rate'] = default_fixed or weekday_rate or slot_rate or Decimal('0.00')` still present at the #257 head. No nonzero-rate validation added anywhere in #257. | GM-10-Q03 / RATE-01 unchanged (still sequenced after GM-09-Q01 + GM-14 Award floor). |
| GM-11 Audience/escalation | **CHANGED** | Audience levels moved to shared-core with identical 5-level order/labels/reach/scope (verified from diff); consumed by web + mobile; EscalationStepper now states "Escalating notifies <reach>."; escalate/delete/accept are synchronous single-flight locked. Backend `escalation.py` blob identical — no scheduler, lazy-escalation or earlier-audience-retention change; E01A drift still open. | GM-11-Q01 unchanged. |
| GM-12 Interest/offers | **CHANGED** | Candidates UI reworked (public "Anonymous applicant" / "Reveal to see name and profile"; counter-offer copy; "Offer sent · awaiting reply"; accept locked per slot). Backend `interest.py` blob identical — acceptance-stage Verified/AHPRA re-verification hole unchanged. | GM-12-Q01 / VERIFY-GATE-01 unchanged. |
| GM-13 Reservation/payment | UNCHANGED | `backend/billing/checkout_reservations.py` blob identical at both heads (`715d1bac…`, same blob the audit cited): provider Stripe expiry only, **no D02 `pay_by`**; no scheduled expiry runner added; no payment file touched. | GM13-Q01 / PAYBY-01 unchanged: D02/D03 remain APPROVED + IMPLEMENTATION GAP. |
| GM-14 Terms/Award/GST/super | UNCHANGED | No terms/Award/GST/super file touched. ("Award rate" is a new label in PostShiftPayRateStep only — no rate logic.) | GM14-Q03 / ACCEPT-01 unchanged. |
| GM-15 Cancellation/disputes/ratings | **CHANGED** (minor) | History rating save now has a synchronous `savingRef` double-submit guard; history "Rate" / "View profile" buttons reworked in OwnerAssignedShiftBoard. No cancellation-fee, compensation or ledger change. | GM15-01 unchanged. |
| GM-16 Subscriptions/Pills/fees | UNCHANGED | No billing/subscription/Pills file touched. | GM16-Q01-FIRST unchanged. |
| GM-17 Invoices/refunds | UNCHANGED | No invoice/refund file touched. | GM17-Q01 / REFUND-01 unchanged. |
| GM-18 Talent/recruitment | **CHANGED** | `backend/talent/serializers/explorer.py` differs between heads (intermediate commits, not #257's own diff): typed/sanitised `availability_days` public slots, malformed legacy entries dropped on read, existing days preserved on update. **Identity leak persists:** `explorer_name`, `author_user_id`, `explorer_user_id` still exposed at the #257 head (verified in the #257 file body). GM-18 primary trace is still missing — #257 adds no area file. | GM-18-Q01 / AUDIENCE-01 and OFFER-01 unchanged. |
| GM-19 Availability/matching | **NEEDS RE-TRACE** | Touched via the GM-18 serializer change (availability slots now typed/sanitised, legacy malformed entries dropped) and via `postingWindow` date rules on the shift side — but whether sanitised/dropped slots change what "matches" a shift (matchable-only filtering, availability-summary derivation) cannot be determined from the diff alone; no matching code was read. | GM-19-Q03 unchanged for now; re-trace matching against the #257 serializer before asking. |
| GM-20 Chat/hubs | **CHANGED** | `backend/chat/views.py` +3/−3: `messages` and `read` now resolve the participant via `authorized_participant(conv, user)` instead of the first `Participant` row (legacy revoked row no longer used; read receipts only on the current participant); empty message page keeps the DRF envelope (`page is not None`). New regression tests: revoked-vs-current participant message/read, empty-page envelope. ConfirmedShiftsView adds start-DM from confirmed shifts (single-flight, role-aware route). PR #260 is the same fix at the same head (`ad01356e`) — already inside #257. | GM20-Q01 unchanged. Revoked-participant/room-access questions now have backend evidence (was open at #249); unread pagination / attachments / moderation still open. |
| GM-21 Ordinary/ethical marketplace | **CHANGED** | Core M4-04 work (§2): blank-slug repair in backend serializers/views; mobile + web submission flows rebuilt around durable receipts, per-account serialised drafts, uploaded-image ids, API photo deletion, single-flight submit, and no-longer-swallowed upload/submit failures; shared-core `m4Marketplace.test.ts`; M4 harnesses. No moderation, prohibited-product, identity, pricing or fulfilment rule change; still no payment path. | GM21-Q01 merged into LAUNCH-01 unchanged — marketplace still deferred from the launch cut. |
| GM-22 Notifications/rewards | UNCHANGED | No notification/outbox/reward file touched. (Escalation copy now names the notified audience, but no notification mechanics changed.) | GM22-04 unchanged; Q07/Q15 still NOT RE-VALIDATED. |
| GM-23 Calendars/operations | **CHANGED** (minor) | `postingWindow` states a concrete calendar-day rule (today → last day of 4th month, "no instant/timezone conversion for ISO days") enforced in the mobile posting calendar. No DST, public-holiday or recurrence-weekday change. | GM-23-01 unchanged; GM-23-23 timezone question still open but now has a stated calendar-day rule to test against. |
| GM-24 Explorer/public | **CHANGED** (minor) | Public candidate labels ("Anonymous applicant", "Reveal to see name and profile") and the talent-post `availability_days` sanitisation (§GM-18) touch the public surface. No public-board, sitemap or moderation change. | GM-24-Q01 unchanged; OFFER-01 unchanged. |
| GM-25 Web/Next/Expo parity/UX | **CHANGED** | M5-01/02/03/04/05 mobile + web changes (§2): Shift Centre headings, audience-driven web/mobile parity, keyboard-aware sticky footer outside ScrollView, success snackbar with "View shifts", accessibility roles/labels, canonical posting wizard, login return-path fix. PR #261 (Maestro "Email" selector + iOS Swift fix) is separate and NOT in #257. No physical iOS/Android, 1.6× text, or 10-UI-states evidence in #257. | GM25-Q01 merged into LAUNCH-01 unchanged. C05/C06/C07/C10/C17/C18 still NOT RE-VALIDATED. |
| GM-26 Admin/privacy/security/release | **CHANGED** (docs only) | PR #262 evidence ledger (docs-only, exact-head acceptance pins, RELEASE HOLD preserved); architecture cycle ledger 109 → 110 edges. No admin, privacy, deletion, env or CI code change. | GM26-Q36 merged into LAUNCH-01 unchanged. Q07/Q12–Q20/Q22–Q26/Q33 still NOT RE-VALIDATED; Q43 pentest still UNKNOWN. |

### Priority areas (audit-named) — summary

- **GM-10:** core $0.00 defect **persists** (both-heads blob check). Mobile posting UX changed a lot; backend rate rule did not.
- **GM-12:** client candidates/offers UI changed; backend interest path identical; AHPRA gate hole unchanged.
- **GM-18:** availability serialisation changed (intermediate commits); identity leak persists; primary trace still missing.
- **GM-20:** revoked-participant chat fix is real and inside #257 (also PR #260, same head).
- **GM-21:** M4-04 marketplace submission/draft/receipt machinery substantially reworked; policy questions untouched.
- **GM-25:** M5 native-design/parity changes are real but device/CI evidence is still missing; #261's native CI fix sits outside #257.

## 5. What this refresh does NOT establish

- No CI was rerun, no tests executed, no staging/device check. #257's own body
  holds integrated tests, architecture-cycle failures, independent review,
  emulators and staging payments as not signed off.
- The 187 commits between the #249 head and the #257 base were **not** individually
  diffed. Only #257's own 64-file diff and 6 both-heads blob comparisons were
  read. The explorer-serializer difference proves intermediate commits touch
  Grill areas, so UNCHANGED verdicts above mean "no #257-owned change and no
  change found in the spot checks" — a full head-to-head file list is still
  needed before the owner interview for backend-heavy areas (notably GM-01
  auth backend, GM-02, GM-16, GM-17, GM-22).
- GM-19 is the one area left NEEDS RE-TRACE for exactly this reason (matching
  semantics after availability sanitisation).
- No #249 parity defect is claimed resolved unless §3 shows the file identical
  (defect persists) or §2 shows a concrete fix (GM-20 chat participant fix only).
- LAUNCH-01 and all merged questions (§2.1–2.12 of the queue) are unchanged in
  substance; no new owner answers were recorded; #257/#260/#261/#262 are all
  still open drafts, none merged.

## 6. Recommended follow-ups (for the parent, not done here)

1. Full head-to-head file diff (#249 head → #257 head) to close the 187-commit
   gap, especially auth/billing/notifications backends, before the owner interview.
2. Re-trace GM-19 matching against the #257 `explorer.py` serializer.
3. Recover/reconstruct the GM-18 primary trace (still missing); #257 does not supply it.
4. Re-validate GM-25 on a physical device / exact-head CI including PR #261,
   and GM-26's not-re-validated items (Q07, Q12–Q20, Q22–Q26, Q33, Q43 pentest).
5. Keep D02/D03, R04C, E01A as APPROVED + IMPLEMENTATION GAP — #257 changes none of them.
