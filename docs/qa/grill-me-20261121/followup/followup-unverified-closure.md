# Follow-up: closure of the explicitly unverified Grill Me items

**Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Date:** 2026-11-21 (AEST). **Read-only.** No GitHub writes, no owner notification, no code changed.
**Traced head:** PR #249 head `97c4543e051b43fe30ec7e2e61ad3d69957a918e` — confirmed live via
`pull_request_read` get in this pass (open, draft, not merged, branch
`fix/pr248-expo-production-waves-20261104`, updated 2026-11-05). Every file below was read at
`refs/pull/249/head`, i.e. that SHA.
**Method:** 89 GitHub read calls, strictly sequential, 9 s pause between calls, in three runs
(7 + 40 + 7). **No HTTP 429 occurred at any point** — the first run was stopped voluntarily
after 7 jobs when its unscoped searches proved useless (global results, no repo hits); nothing
was stopped by a rate limit, and no call was retried. Raw outputs:
`/tmp/grill267/closure/` (PR reads + discarded global searches),
`/tmp/grill267/closure2/` (25 head file reads + 15 repo-scoped searches),
`/tmp/grill267/closure3/` (7 head file reads).
**Search caveat:** `search_code` results reflect the default branch (`main`), not the PR head.
Searches were used as **locators only**; every verdict below rests on a file read at
`refs/pull/249/head`. An absence verdict rests on a repo-scoped search **plus** a head read of
the file where the feature would live (named per item). A single historical file or a
default-branch search hit was never treated as exact-head verification.
**Area files read first for the original question text:** GM-02
`~/workspace/grill-gm02/GM-02-worker-onboarding-credentials.md`; GM-05
`~/workspace/chemisttasker-grill/gm-05-roles-membership-invites.md`; GM-22
`~/workspace/goals/chemisttasker-grill-me/files/GM-22-notifications-rewards-trace.md`; GM-25
`~/workspace/grill-me/GM-25-web-next-expo-parity.md`; GM-26
`~/workspace/grill-me/GM-26-admin-privacy-security-release.md`.

## Verdict key

- **VERIFIED** — the question's "actual today" is now established at the traced head, with
  file/function/quote. The owner decision itself stays OPEN unless stated; verification is
  not a decision. "VERIFIED (as not built)" means the head evidence establishes the
  feature does not exist.
- **PARTIALLY VERIFIED** — the core behaviour is established at head, but a named half is
  still missing. The missing evidence is named per item.
- **STAYS UNVERIFIED / UNKNOWN** — the actual behaviour could not be established at head.
  Only one item lands here (GM-26 Q43 pentest).

## Summary table (29 items)

| # | Item | Question (short) | Verdict |
|---|---|---|---|
| 1 | GM-02 ON-Q15 | Must every onboarding step work on mobile? | **PARTIALLY VERIFIED** |
| 2 | GM-05 Q-16 | Must onboarding + account upgrades work fully on mobile? | **PARTIALLY VERIFIED** |
| 3 | GM-05 Q-17 | Web/mobile disagree on talent-board booking permissions — fix before launch? | **VERIFIED (facts); decision still sequenced after GM-18 Q15** |
| 4 | GM-22 Q07 | Inside the window, who is alerted and how fast? (emergency cancel) | **VERIFIED (as not built)** |
| 5 | GM-22 Q15 | Should both sides get a PDF copy of the agreement? | **VERIFIED (as not built)** |
| 6 | GM-22 Q03 cancel half | Who is told when a shift is cancelled / covered / replaced? (cancel half) | **VERIFIED (as no cancel path)** |
| 7 | GM-25 C05 | When must pay details be ready, and must both apps show it early? | **PARTIALLY VERIFIED** |
| 8 | GM-25 C06 | What must a pharmacy pass before posting to outside workers? | **VERIFIED** |
| 9 | GM-25 C07 | Should pharmacies save a payment method during setup? | **VERIFIED (as not built)** |
| 10 | GM-25 C10 | Profile progress % doesn't match what Verified needs | **VERIFIED** |
| 11 | GM-25 C17 | What should the heart on a talent card do? | **VERIFIED** |
| 12 | GM-25 C18 | Should reservations show a live payment countdown? | **PARTIALLY VERIFIED** |
| 13 | GM-26 Q07 | Who must pass an ID check? | **VERIFIED** |
| 14 | GM-26 Q12 | If registration cannot be confirmed, what happens to future bookings? | **VERIFIED (with correction)** |
| 15 | GM-26 Q13 | Register shows Suspended/Cancelled — what happens? | **VERIFIED** |
| 16 | GM-26 Q14 | Which workers must prove professional indemnity cover? | **VERIFIED (as not built)** |
| 17 | GM-26 Q15 | On an anonymous public post, what is hidden? | **VERIFIED (with correction)** |
| 18 | GM-26 Q16 | When does an anonymous pharmacy's name reach the worker? | **VERIFIED (with correction)** |
| 19 | GM-26 Q17 | Who can see a worker's availability? | **VERIFIED** |
| 20 | GM-26 Q18 | Should urgent-shift alerts need a separate opt-in? | **VERIFIED** |
| 21 | GM-26 Q19 | Can a pharmacy block a worker? | **VERIFIED (as not built)** |
| 22 | GM-26 Q20 | Rule for hiring a worker directly, off the platform? | **VERIFIED (as not built)** |
| 23 | GM-26 Q22 | Who reviews disputes and appeals? | **VERIFIED (as not built)** |
| 24 | GM-26 Q23 | How long to appeal, how fast must support answer? | **VERIFIED (as not built)** |
| 25 | GM-26 Q24 | Who can see each part of a dispute? | **VERIFIED (as not built)** |
| 26 | GM-26 Q25 | What process applies before permanent suspension? | **VERIFIED (as not built)** |
| 27 | GM-26 Q26 | Which events count as an incident? / lookback / badge-clear? | **VERIFIED (as not built)** |
| 28 | GM-26 Q33 | Booking fees lack explicit GST and tax-invoice treatment | **VERIFIED (as not built)** |
| — | GM-26 Q43 | Has anyone pentested this? Vulnerability-handling process? | **UNKNOWN — stays unverified** |

Counts: 24 VERIFIED (incl. "as not built" and "with correction"), 4 PARTIALLY VERIFIED,
1 UNKNOWN. No item stays fully unverified except Q43.
Base link for all file citations:
`https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/`

---

## 1. GM-02 ON-Q15 — Must every onboarding step work on mobile at launch?
**Verdict: PARTIALLY VERIFIED.** The two named Oct 2026 breakages are adjudicated at head;
full step-by-step parity is not established.

**Original question (GM-02):** "Must every onboarding step work on mobile at launch?"
Context (#184): "Profile tabs match, but the mobile 'add personal profile' flow is broken:
pharmacist data is dropped and other staff land on not-found (ON-04)."

**Evidence at head:**
- **Other-staff 404 — FIXED.** `frontend_mobile/components/ChooseAccountTypeCard.tsx`
  routes all four other-staff roles to the existing `/otherstaff/profile-basic-info`
  (Intern/Technician/Assistant/Student, lines 15–18); pharmacist routes to
  `/pharmacist/onboarding` (line 14). Directory listing of `frontend_mobile/app/otherstaff/`
  at head contains `profile-basic-info.tsx`, `profile-bio.tsx`, `profile-identity.tsx`,
  `profile-payment.tsx`, `profile-referees.tsx`, `profile-regulatory.tsx`,
  `profile-skills.tsx`, `publish-availability.tsx`, `talent-board.tsx` — and **no
  `onboarding.tsx`**. Nothing routes to the missing path from this card any more.
- **Pharmacist data loss — STILL PRESENT.** `frontend_mobile/roles/pharmacist/onboarding.tsx`
  still posts `preferred_hourly_rate`, `minimum_rate`, `overtime_multiplier`,
  `weekend_premium` plus `bank_account_name`/`bsb` via `updateOnboarding('pharmacist',
  formData)` (lines 113–121), and reads them back (`data.preferred_hourly_rate`, etc.,
  lines 72–75). `backend/onboarding/serializers.py` at head (49,667 chars) contains
  **zero** occurrences of `preferred_hourly_rate`, `minimum_rate`, `overtime_multiplier`,
  `weekend_premium` or `bank_account_name` — the posted rate fields have no backend home,
  so the values have nowhere to land. (Whether a separate finance endpoint accepts the
  bank fields was not traced; the onboarding save path does not.)
- **Explorer shifts placeholder — FIXED.** `frontend_mobile/roles/explorer/shifts.tsx` at
  head is a 3-line re-export: `export { default } from '@/roles/shared/shifts/ShiftsScreen';`
  — the "Shifts"-only placeholder (PARITY_MATRIX L17) is gone.

**Still missing (why only partial):** per-step submit/persist verification on mobile —
ID upload, referees, ABN/TFN, profile-tab saves — was not read screen by screen, and no
device/emulator pass exists. The question is now askable in its corrected form
("pharmacist add-profile still drops rate data; other-staff route fixed; Explorer shifts
tab now real"), but "every step works" is not established. The MOBILE-PARITY-01 joint
re-inspection pass (GM-05 backlog B-17) is still incomplete. GM-03 Q05 (the third leg of
MOBILE-PARITY-01) was not in this item list and is not closed here.

## 2. GM-05 Q-16 — Must onboarding and account upgrades work fully on mobile at launch?
**Verdict: PARTIALLY VERIFIED.** Same evidence as ON-Q15 (item 1); this is the same
MOBILE-PARITY-01 question in GM-05 framing, plus the PHARMACY_MANAGER one-time switch.

**Original question (GM-05):** "Must onboarding and account upgrades work fully on mobile
at launch?" (ON-Q15 / LA-Q02 / LA-Q03.) Oct breakage: pharmacist screen posted bank/rate
fields the backend silently drops; intern/technician/assistant/student went to a missing
route; reachable mobile screens could dead-end; Explorer Shifts and some hubs were
placeholders.

**Evidence at head:** identical to item 1 — other-staff route fixed, pharmacist rate-field
drop persists, Explorer shifts tab now a real screen. The PHARMACY_MANAGER one-time switch
itself (`users/models.py` `CHOOSABLE_ACCOUNT_TYPES`, verified in GM-05) makes the question
bigger, but the switch endpoint's behaviour on mobile was not re-read here.

**Still missing:** same as item 1 — per-step submit/persist reads + device pass; the
manager-switch flow on mobile.

## 3. GM-05 Q-17 — Web and mobile disagree on talent-board booking permissions
**Verdict: VERIFIED (facts); decision still sequenced after GM-18 Q15 — do not force it.**

**Original question (GM-05):** "[LA-Q15] Web and mobile disagree on talent-board booking
permissions — fix before launch?" Oct facts: mobile allowed any non-worker role to request
bookings; web used a narrower allow-list; the backend must be the authority.

**Evidence at head — the drift is confirmed, in the same shape:**
- Web (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:314`):
  `canRequestBooking` = fixed 9-role allow-list — `OWNER`, `PHARMACY_ADMIN`,
  `PHARMACY_OWNER`, `ORG_ADMIN`, `ORG_OWNER`, `ORG_STAFF`, `CHIEF_ADMIN`,
  `REGION_ADMIN`, `ORGANIZATION` — plus `isAdminUser` fallback.
- Mobile (`frontend_mobile/roles/shared/talent-board/index.tsx:314,320`):
  `canRequestBookingByRole` = any role except `EXPLORER` / `PHARMACIST` / `OTHER_STAFF`
  returns true, plus a `canRequestBookingOverride` fallback. So e.g. a PHARMACY_MANAGER
  can request a booking on mobile but not on web (unless admin).
- Backend has **no** hiring-role policy at offer creation: `backend/shifts/assignment.py`
  contains zero `ahpra` references — `offer_shift()` (:26), `offer_dedicated_shift()`
  (:260) and `roster_direct_staff()` (:142) check role only. The gate bites only at
  worker accept on public shifts: `backend/shifts/offers.py` `accept()` calls
  `require_public_ahpra()` (:350) and `lock_public_ahpra()` (:412).

**Dependency (not forced):** the queue says ask Q-17 after GM-18 Q15 (one hiring-role
policy) is decided. GM-18's full worker trace is still missing (senior-review record
only), so Q15 is undecided. The facts are now verified and the question can be asked
immediately once Q15 is decided; it must not be asked in parallel as a competing policy.

## 4. GM-22 Q07 — Inside the window, who is alerted and how fast?
**Verdict: VERIFIED (as not built).**

**Original question (GM-22, CX-Q06):** a worker asks to cancel close to start; R04D settled
the principle (manager approval always, emergency escalation near start) but recipients and
timing were open.

**Evidence at head:**
- `backend/shifts/worker_requests.py` (roster cover-request path): request creation sends
  **one email per recipient** to owners / org admins / pharmacy admins (lines 95–155,
  deduped by email). Approve (:228) / reject (:326) / update / destroy contain **no**
  notification, push or repeat-alert code.
- `backend/workforce/roster/worker_actions.py` (swap/cover/release): **zero**
  `notify` / `announce` / `email` / `push` occurrences in the whole file.
- Repo-scoped search for `emergency` (39 hits): only emergency-*contact* fields
  (onboarding services/models/serializers, BasicInfo screens), cover terms, and
  `docs/qa/BOUNDED_CANCELLATION_NOTIFICATION_20261030.md`. No emergency-cancel mechanism.
- The `buzz` action (`shifts/offers.py:255`) is an offer reminder (1 h cooldown), not an
  emergency cancel.

**Conclusion:** no repeating-push emergency mechanism exists; the recommended 15-min repeat
+ support-after-30-min is a proposal for something unbuilt, not a description. The
question stays OPEN for the owner, now on verified "not built" evidence.

## 5. GM-22 Q15 — Should both sides get a PDF copy of the agreement?
**Verdict: VERIFIED (as not built).**

**Original question (GM-22, AG-Q03):** Oct 2026: "Not built yet. (No PDF or emailed copy
exists.)"

**Evidence at head:**
- `backend/shifts/engagement.py` (terms freeze / acceptance): **zero** `pdf`/`PDF`
  occurrences. Acceptance freezes an engagement-terms snapshot; nothing renders or emails
  a PDF of it.
- Repo-scoped search for `pdf` (140 hits): PDF generation exists **only for invoices** —
  `backend/worker_finance/documents.py` `render_document_pdf()` renders
  `worker_finance/invoice.html` via WeasyPrint; `backend/invoicing/views.py`
  `invoice_pdf_view`; `backend/worker_finance/views.py` `pdf` action. No agreement /
  engagement PDF anywhere.

**Conclusion:** no PDF copy of the agreement exists on either side. The question stays OPEN
on verified evidence.

## 6. GM-22 Q03 (cancel half) — Who is told when a shift is cancelled, covered or replaced?
**Verdict: VERIFIED (as no cancel path).** Edit half was already verified; the cancel half
is now verified as having no event to notify about.

**Original question (GM-22, AG-Q09):** "Who is told when a shift is cancelled, covered or
replaced?" Edit half (verified in GM-22): `send_shift_updated_notifications` notifies all
interested + counter-offerers + offer holders on every edit. Cancel half was NOT
RE-VALIDATED because the cancel path (SH-01) had not been re-read.

**Evidence at head:**
- The word `cancel` appears **nowhere** in `backend/shifts/posting.py`,
  `interest.py`, `offers.py` (only `decline`), `assignment.py`, `engagement.py` or
  `lifecycle.py` as a booking-cancel endpoint. The only hits in the whole traced shift
  domain are `worker_requests.py:182` ("Only pending cover requests can be updated or
  cancelled" — roster cover *requests*, not confirmed bookings) and
  `worker_actions.py:57` `_guard_booked`: "Offer-booked or payment-pending work changes
  hands only through cancellation; plain rostered staff may swap" — cancellation is
  referenced as the route, but no cancel endpoint implements it.
- `release_worker_from_assignment()` (`worker_actions.py:354`) is a roster-side deletion
  (manager releases a worker without replacement, assignment row deleted, shift reused);
  the module contains zero notification calls.
- `docs/qa/BOUNDED_CANCELLATION_NOTIFICATION_20261030.md` at head confirms the only
  reachable cancellation-adjacent route is the legacy `charge_penalty`, whose activation
  gates are unimplemented: "The currently reachable legacy charge-penalty path does not
  implement all of those activation gates. This is a launch blocker for enabling that
  charge route without a separate explicit release decision." P5 cancellation time/scope
  and duplicate obligations are recorded there as open decisions.
- Repo-scoped search for `cancel_booking`: **0 hits**.

**Conclusion:** the Oct claim "no cancel endpoint for confirmed external bookings" is now
VERIFIED at head, not merely carried. There are no cancel notices because there is no
cancel event. GM22-03's cancel half cannot be answered as a recipient choice until a
cancel path exists — the question as asked presupposes an event that is not built. (The
edit half stands as verified: `send_shift_updated_notifications`, title
`"Shift updated: {shift.pharmacy.name}"`, emails.py:404.)

## 7. GM-25 C05 — When must a worker's pay details be ready, and must both apps show it early?
**Verdict: PARTIALLY VERIFIED.** Backend timing verified; early display on both apps not
verified.

**Original question (GM-25, ON-Q04 / LA-Q05):** ABN/TFN readiness checked only at offer
acceptance; workers learn what is missing only in the accept dialog, on both apps (ON-11).

**Evidence at head (timing half — VERIFIED):**
- `backend/shifts/engagement.py:266` `_external_payment_profile(user)`: no onboarding →
  "Complete worker onboarding before accepting"; ABN requires `abn` + `abn_verified` +
  `abn_entity_confirmed` ("ABN must be verified before invoice settlement"); TFN requires
  only the *preference* at accept. `build_shift_engagement_terms()` marks TFN/super
  `payroll_setup_status=DEFERRED` ("Assignment is not blocked", :678).
- A backend readiness summary exists: `worker_payment_profile_status()` (:200) returns a
  safe summary (`READY` / `TFN_SETUP_INCOMPLETE` / `ABN_SETUP_INCOMPLETE` /
  `PAYMENT_PREFERENCE_REQUIRED`, with `missing_fields`, no secret identifiers).

**Still missing (early-display half):** no payment-readiness checklist was found on Expo's
`ActiveShiftsPage` (only `awaitingPayment` state mapping + the pay handler; no ABN/TFN
checklist strings), and the web apply/offer screens were not read. Missing evidence:
web + Expo apply/offer screen reads showing whether the readiness summary is surfaced
before accept. The Oct recommendation (B — show early on apply and offer screens) cannot
be confirmed as implemented or absent on either client.

## 8. GM-25 C06 — What must a pharmacy pass before posting to outside workers?
**Verdict: VERIFIED.**

**Original question (GM-25, ON-Q11):** posting checks neither `Pharmacy.verified` nor
`abn_verified`; any pharmacy can post to every tier, including public.

**Evidence at head:** `backend/shifts/posting.py` (12,164 chars) contains **zero**
occurrences of `Pharmacy` or `verified` — `post_shift()` (:63) has no pharmacy-verification
or ABN gate of any kind. The Oct claim stands exactly as written. Parity angle is moot
until a gate exists: there is no block message for any client to surface consistently.
(Also GM-03 Q01 / PHARM-GATE-01; the owner decision is unchanged and still open.)

## 9. GM-25 C07 — Should pharmacies save a payment method during setup?
**Verdict: VERIFIED (as not built).**

**Original question (GM-25, ON-Q13):** every booking opens a new Stripe Checkout; no card
stored; under D02 a shift under 2 h away leaves 30 minutes to pay.

**Evidence at head:**
- Repo-scoped search for `SetupIntent`: **0 hits** — no saved-card setup-intent flow
  anywhere in the repo.
- `backend/billing/checkout_reservations.py`: no saved-card / payment-method code; a fresh
  Stripe Checkout session is created per occurrence, `provider_expires_at` stored (:148–152),
  with the comment "open_checkout may still reach the provider at 23 h and a session stays
  payable for 24 h (no expires_at is set)" (:220).
- Expo (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:219–251`):
  `handlePayWithStripe` → `Linking.openURL(res.url)` — link-out to Checkout in the system
  browser; no saved-card path.

**Conclusion:** no saved payment method exists on either surface; the D02 30-minute-window
pressure stands as described. The question stays OPEN on verified evidence.

## 10. GM-25 C10 — Profile progress % doesn't match what Verified needs
**Verdict: VERIFIED.**

**Original question (GM-25, LA-Q04 / ON-10):** `onboarding/services/progress.py` counts
resume, bio, rates, referees and ID, while Verified needs email + mobile + AHPRA.

**Evidence at head:** `backend/onboarding/services/progress.py`
`pharmacist_progress_percent()` counts username, first/last name, `mobile_number`
**presence** (not `is_mobile_verified`), profile photo, `gov_id_verified`,
`ahpra_verified`, referee1/2 confirmed, address, resume, `short_bio`, ABN/TFN presence,
and `rate_preference` weekday/Saturday/Sunday/public-holiday/early/late. It **never**
counts email verification (`is_otp_verified`) or mobile verification
(`is_mobile_verified`). The mismatch is confirmed exactly as described; the % UI still
exists on the mobile screen (ProgressBar + `{progress}%` chip in
`roles/pharmacist/onboarding.tsx`, per GM-25). The question stays OPEN on verified
evidence.

## 11. GM-25 C17 — What should the heart on a talent card do?
**Verdict: VERIFIED.**

**Original question (GM-25, TB-Q08):** heart likes/unlikes a post on both apps; creates no
favourites membership; no "Invite to favourites" action.

**Evidence at head:**
- Backend (`backend/talent/views/explorer.py:241–266`): `like` / `unlike` actions only
  increment/decrement `like_count` ("Unlike a post; available to any authenticated user").
  No membership write, no notification.
- Frontend: **zero** `favourite` / `favorite` occurrences in web
  `TalentBoard/index.tsx` and mobile `talent-board/index.tsx` — no "Invite to
  favourites" action on either client.

**Conclusion:** heart = like only, on both apps, exactly as the Oct text says. The question
stays OPEN on verified evidence.

## 12. GM-25 C18 — Should reservations show a live payment countdown?
**Verdict: PARTIALLY VERIFIED.** No live countdown on Expo; the pay-by display itself is
not verified on either client.

**Original question (GM-25, BK-Q13):** both sides see reserved-not-confirmed wording and
the pay-by time; neither sees a live countdown.

**Evidence at head:**
- Expo (`ActiveShiftsPage/index.tsx`): **zero** `countdown` / `pay_by` / `payBy` /
  `expires` / `deadline` occurrences. It maps `awaitingPayment` /
  `awaitingPaymentOfferId` state onto shift cards (:425–426, :609–611) — state only, no
  countdown, no pay-by time in this file.
- Server side (`checkout_reservations.py:148–152`): `provider_expires_at` is stored on the
  checkout row; (:220) "a session stays payable for 24 h (no expires_at is set)".
- Repo-scoped search for `countdown` (9 hits): kiosk PIN timers
  (`KioskPage.tsx`, `KioskActivationView.tsx`, `KioskPairingDialog.tsx`) and docs only —
  no payment countdown anywhere.

**Still missing:** whether either client shows the pay-by time (web reservation display not
read; API exposure of `provider_expires_at` to clients not traced). Missing evidence: web
reservation/offer screen read + the checkout serializer exposing (or not exposing) the
deadline.

## 13. GM-26 Q07 — Who must pass an ID check?
**Verdict: VERIFIED.**

**Original question (GM-26, ON-Q08):** ID only required for overseas Explorers who skip the
mobile check; a setting can add ID to Verified for everyone but is off by default; OCR
works for all.

**Evidence at head:** `backend/onboarding/verification/policy.py`:
- `mobile_waived()` (:45): "Overseas newcomers may skip the Australian mobile check; ID
  then becomes required" — `EXPLORER` + `mobile_check_skipped`.
- `requirements()` (:50): `email` always; `gov_id` **only** if `mobile_waived()` or if
  `VERIFICATION_EXTRA_REQUIREMENTS` contains `gov_id` (extras also allow `referees`);
  `mobile` otherwise; `ahpra` for `PHARMACIST` / `INTERN`. Everything else is a badge
  (`badges()`, :156). The Oct claim stands exactly. (OCR utility itself was verified in
  GM-02; not re-read here.)

## 14. GM-26 Q12 — If current registration cannot be confirmed, what happens to future bookings?
**Verdict: VERIFIED (with correction).** The Oct text is right for not_found/unreadable and
wrong for rejected.

**Original question (GM-26, ON-Q07):** not-found, unreadable or rejected results revoke
Verified and block new public applications; existing bookings stay and the pharmacy is not
told. Suspended/non-General results cancel future public bookings.

**Evidence at head (`backend/onboarding/verification/state.py`):**
- `require_ahpra_application()` (:155): states `not_found`, `suspended`, `unreadable`,
  `rejected`, `type_not_accepted`, `review` all raise 403 `ahpra_<state>` — new public
  applications are blocked for all of them. Verified is revoked in
  `apply_state_transition()` (:244–249).
- `rejected` — **CORRECTION:** bookings are kept ("A rejection keeps bookings: the
  pharmacy and our team resolve them by hand", :270–275) **but the pharmacy IS told**:
  `announce_rejected_bookings()` (:319) notifies the affected pharmacies
  ("Booking needs immediate resolution") plus an admin email. Oct "warn nobody" is wrong
  for rejected.
- `not_found` / `unreadable`: no cancel call and no announce call in the transition —
  bookings kept, nobody told. Oct claim holds for these two.
- `suspended` / `type_not_accepted` transition → `cancel_upcoming_assignments()` +
  `announce_suspension()` (:265–269, :292), which emails admins a cancelled/retained list.

**Residual:** no fee/refund rule runs for AHPRA-cancelled paid bookings in this path
(CX-Q20 territory, still open).

## 15. GM-26 Q13 — When the register shows Suspended or Cancelled, what happens?
**Verdict: VERIFIED.**

**Original question (GM-26, ON-P02):** future public bookings cancelled, pharmacies told;
non-member workers paused account-wide; admins emailed; owners become Pharmacy Managers; a
non-General result cancels bookings without pausing; no fee/refund rule runs.

**Evidence at head (`state.py`):**
- `apply_state_transition()` (:265–269): adverse transition (`suspended` /
  `type_not_accepted`) → `cancel_upcoming_assignments(profile.user, reason=...)` +
  `announce_suspension()` — user in-app + email, admin email with cancelled and retained
  lists (:292–317).
- `ahpra_frozen()` (:223): returns true only when state is `suspended`, role is not OWNER,
  and the user has no accepted active membership and no org membership — non-members are
  paused account-wide (chat sockets closed, :277–279); members are not paused and get
  `announce_member_suspension()` instead (:336).
- Owner switch (:250–254): an `OwnerOnboarding` with a suspended/type-not-accepted result
  switches role to `MANAGER` (`ahpra_switched_to_manager`), restored to `PHARMACIST` on a
  later `ok` check (:257–260).
- Non-General (`type_not_accepted`) cancels bookings without pausing (pause applies only
  to `suspended` — `ahpra_frozen` checks `state == 'suspended'`).
- No fee/refund rule runs in this path (residual, as in Q12).

## 16. GM-26 Q14 — Which workers must prove professional indemnity cover?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, ON-Q09):** no insurance field, evidence, expiry or booking gate
exists.

**Evidence at head:** repo-scoped search for `indemnity`: **1 hit total** — a
`.agents/skills/ui-styling/LICENSE.txt` (irrelevant). `backend/onboarding/models.py`
(35,650 chars): **zero** `insurance` / `indemnity` occurrences. No field, evidence,
expiry, gate or badge anywhere. Oct claim stands exactly.

## 17. GM-26 Q15 — On an anonymous public post, what is hidden?
**Verdict: VERIFIED (with correction).** The hiding rule is verified; it breaks after
acceptance (see Q16).

**Original question (GM-26, PO-Q11):** anonymous posts show 'Anonymous Pharmacy', suburb,
state, postcode, script volume and the rate. Name, street, software and services hidden
from everyone except the pharmacy's managers.

**Evidence at head:**
- `backend/shifts/announcements.py:100` `_get_pharmacy_display_name()`: if
  `shift.post_anonymously` and the viewer may not see the full pharmacy → `"Shift in
  {suburb}"` or `"Anonymous Pharmacy"`; otherwise the real name.
- `_get_location_line_for_email()` (:109): anonymous → suburb/state/postcode only;
  otherwise street address is included.
- **Correction:** the same codebase names the pharmacy in three post-acceptance notices
  (reminder, shift-updated, not-selected — item 18), so the anonymity holds on
  pre-acceptance surfaces but not after acceptance/finalization. The Oct text does not
  mention the leaks.

## 18. GM-26 Q16 — When does an anonymous pharmacy's name reach the worker?
**Verdict: VERIFIED (with correction).** Pre-acceptance anonymization verified; the Oct
claim of a single leak is now wrong — three leak paths exist.

**Original question (GM-26, PO-Q12):** the worker never sees the name before accepting:
the terms dialog omits it and accept notices say 'Shift in \<suburb\>'. Cards stay
anonymous after booking; the 12-hour reminder email names it.

**Evidence at head:**
- Pre-acceptance anonymization VERIFIED: offer/accept notices use
  `pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"`
  (`backend/shifts/offers.py:296–297, 467–468, 690–691`) and `_get_pharmacy_display_name`
  (`announcements.py:100`).
- Leak paths VERIFIED (all name the pharmacy):
  1. 12 h reminder email — `backend/shifts/tasks.py:74`:
     `subject=f"Reminder: Your upcoming shift at {shift.pharmacy.name}"`.
  2. Shift-updated notice — `backend/shifts/emails.py:404`
     `send_shift_updated_notifications`: title `f"Shift updated: {shift.pharmacy.name}"`
     to all interested / counter-offerers / offer holders.
  3. Not-selected notice — `emails.py:203`
     `send_shift_not_selected_after_payment_notifications`: title `f"Shift filled:
     {shift.pharmacy.name}"` and email subject `f"Shift filled at {shift.pharmacy.name}"`
     to non-selected applicants.
  4. Shared context builder — `emails.py:54`: `build_shift_email_context` sets
     `"pharmacy_name": shift.pharmacy.name` unconditionally.

**Correction:** Oct "name surfaces only in the reminder email" is wrong — it also surfaces
in the updated and not-selected notices (and via the shared context builder). The
recommended reveal point (agreement preview, before accept) is unaffected.

## 19. GM-26 Q17 — Who can see a worker's availability?
**Verdict: VERIFIED.**

**Original question (GM-26, AV-Q04):** only workers can read or edit their raw availability
through the API; it drives alerts, recommendations and roster warnings. Pharmacies see
copied talent-post dates rather than a live calendar on either app.

**Evidence at head:**
- `backend/talent/views/availability.py`: `UserAvailabilityViewSet`,
  `permission_classes = [permissions.IsAuthenticated]`, `get_queryset()` returns
  `UserAvailability.objects.filter(user=self.request.user)` — raw availability is readable
  and editable only by the worker themself.
- `backend/talent/serializers/availability.py`: bare `ModelSerializer`, no `validate()`
  (fields: id, date, start/end time, is_all_day, is_recurring, recurring_days,
  recurring_end_date, `notify_new_shifts`, notes).
- Pharmacies seeing copied talent-post dates (not the live calendar) is the adopted GM-18
  verdict (availability copied once, never syncs); the API side is now verified here.

## 20. GM-26 Q18 — Should urgent-shift alerts need a separate opt-in?
**Verdict: VERIFIED.**

**Original question (GM-26, AV-Q08):** both apps show one matching-public-shift
notification switch saved on availability rows; no separate urgent-shift consent.

**Evidence at head:**
- `backend/notifications/models.py:56` `NotificationPushPreference`: only
  `push_messages` / `push_tasks` / `push_work_notes` / `push_alerts` (default True) plus
  `quiet_hours_enabled` (default False), quiet 22:00–07:00. No urgent-specific switch.
- The single matching-shift switch is `UserAvailability.notify_new_shifts` (serializer
  field, item 19). No urgent-shift opt-in exists in any traced preference model. Oct
  claim stands exactly. (GM-22 owns the notification mechanics; the preference facts are
  verified here.)

## 21. GM-26 Q19 — Can a pharmacy block a worker?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, TB-Q09):** not built yet.

**Evidence at head:** `backend/memberships/models.py` (12,032 chars): **zero** `block`
occurrences — no block field, relation or endpoint on memberships. Repo-scoped search for
`blocked` (114 hits) returns verification/kiosk/attendance blocks (e.g. "blocked from
applying"), not a pharmacy-block-worker feature. Oct "not built yet" stands.

## 22. GM-26 Q20 — What is the rule for hiring a worker directly, off the platform?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, TB-Q10):** not built yet.

**Evidence at head:** repo-scoped search for `conversion` (50 hits) returns only
account/data conversion — pharmacy-manager account conversion, newcomer conversion,
membership conversion, task-queue option conversion. No conversion fee, no off-platform
hire rule, no charge path for direct hiring (`shift_payments.py` has no conversion
charge). Oct "not built yet" stands. Residual (low value): the Terms of Service page
wording on direct hire was not checked.

## 23. GM-26 Q22 — Who reviews disputes and appeals?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, CX-Q23):** not built yet; no dispute or appeal workflow exists;
only the platform may sanction (P04).

**Evidence at head:** repo-scoped search for `dispute`: **6 hits total**, all incidental —
a checkpoint doc mentioning "Timesheet, dispute and reporting backend" as a future step,
invoice `issueCount`, a timesheet-adjust dialog, an attendance-review page. No dispute
model, case, or review workflow. `backend/memberships/models.py`: zero
`suspend` / `sanction` / `dispute` / `incident` occurrences. Repo-scoped search for
`audit_log`: **0 hits**. Oct "not built yet" stands.

## 24. GM-26 Q23 — How long to appeal, and how fast must support answer?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, CX-Q24):** no timings exist.

**Evidence at head:** same absence evidence as item 23 — no dispute/appeal workflow, so no
appeal window or response SLA exists in code. Oct "no timings exist" stands.

## 25. GM-26 Q24 — Who can see each part of a dispute?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, CX-Q25):** no dispute case, evidence classes or access policy
exists.

**Evidence at head:** same absence evidence as item 23 — no dispute case model, no evidence
classes, no access policy. Oct claim stands.

## 26. GM-26 Q25 — What process applies before permanent suspension?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, CX-Q30):** not built yet; P10 requires human review, notice,
appeal and legal review, but no workflow exists.

**Evidence at head:** same absence evidence as items 23–25 — no suspension/sanction
workflow in `memberships/models.py` (zero hits), no incident ledger (item 27), no audit
log (`audit_log` search: 0 hits). P10 exists only as a carried owner decision, not as
code. Oct "not built yet" stands.

## 27. GM-26 Q26 — Which events count as an incident? / How far back does the ladder count? / When does the reliability badge disappear?
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, CX-Q26/Q28/Q29):** not built yet — no reviewed incident ledger,
no qualifying-cancellation cutoff, no lookback/reset, no badge-clear rule.

**Evidence at head:** repo-scoped search for `incident`: **46 hits**, all incidental — ops
docs, skill data files, font-file metadata, one `RefereeQuestionnairePage`. No incident
model, ledger, lookback or badge rule in code. The only code-adjacent hit,
`backend/onboarding/models.py:701`, is a free-text `compliance_incidents = TextField()`
on an onboarding model — a notes field, not a ledger or workflow. Oct "not built yet"
stands.

## 28. GM-26 Q33 — Booking fees lack explicit GST and tax-invoice treatment
**Verdict: VERIFIED (as not built).**

**Original question (GM-26, LA-R01):** checkout selects fixed Stripe prices and stores the
amount, but no reviewed field or flow states GST treatment or creates a platform tax
invoice.

**Evidence at head:** repo-scoped search for `tax_invoice`: **0 hits**.
`backend/billing/shift_payments.py`: **zero** `gst` / `tax_invoice` / `tax invoice`
occurrences — only `charge_shift_fulfillment()` and `charge_penalty()`. No GST field or
flow for booking fees. Oct claim stands. (Note: invoice PDFs exist for invoices generally
— `invoicing/views.py` `invoice_pdf_view` — but no GST treatment field/flow for booking
fees.)

## GM-26 Q43 — Has anyone pentested this, and what is the vulnerability-handling process?
**Verdict: UNKNOWN — stays unverified, plainly.**

**Original question (GM-26):** "Has anyone pentested this, and what is the
vulnerability-handling process?" Prior status: UNKNOWN — no pentest, security review, or
vulnerability-disclosure process evidenced.

**Evidence at head — what the pentest situation actually is:**
- **PR #98 is not a pentest and not merged.** `pull_request_read` get on PR #98:
  "Security: add Strix agentic pentesting for PRs and full-project scans" — state **open**,
  **draft: true**, **merged: false**, head `5c452e2abb738c46e3352d976177bb206e99e579`
  (branch `security/strix-full-project-scan`, base main `8b8b3bfa`), created 2026-09-29,
  last updated 2026-09-29 (untouched since), 2 files, +323 lines, 6 commits. It only
  **adds a Strix agentic-pentesting workflow** (diff-scoped PR scans + manual full-repo
  scans, SARIF upload, requires `STRIX_LLM` + `LLM_API_KEY` repo secrets, deliberately
  fails if either secret is absent; "Does not target production or staging URLs; this PR
  is source-code/repository scoped"). It contains no pentest result.
- Repo-scoped search for `pentest`: **0 hits** — no pentest report, scan result, or
  security-review document in the repo at all.
- PR #200 is a code audit (explicitly NOT a production exploit proof); WAVE_13 is semantic
  source review with no HTTP execution (per the GM-26 file, not re-verified here).

**Exact missing evidence:** any pentest report or scan output (external or internal), a
merged and run Strix workflow (PR #98 merged + a completed run), a named security contact,
and a vulnerability-disclosure / fix-SLA process. Until one of those exists, Q43 stays
UNKNOWN. Do not present PR #98, PR #200, CodeQL, or WAVE_13 as pentest evidence.

---

## What this changes for the owner interview

**Now askable on verified evidence (previously blocked as "do not ask until re-validated"):**
ON-Q15 / Q-16 (in corrected form — pharmacist rate drop persists, other-staff route fixed,
Explorer shifts real; full parity still open), Q-17 facts (once GM-18 Q15 is decided),
GM22-Q07, GM22-Q15, GM22-Q03 cancel half (as "no cancel path exists — build it first or
decide the policy for a path that does not exist"), C06, C07, C10, C17, and all of GM-26
Q07, Q12–Q20, Q22–Q26, Q33.

**Still sequenced / blocked:**
- GM-05 Q-17's owner decision waits on GM-18 Q15 (one hiring-role policy); GM-18's full
  trace is still missing (senior-review record only).
- MOBILE-PARITY-01 (ON-Q15 + GM-03 Q05 + GM-05 Q-16) is one question, asked once; GM-03
  Q05 was not in this closure and the joint re-inspection pass (B-17) is incomplete
  (per-step mobile submit/persist + device pass still missing).
- GM-26 Q43 stays UNKNOWN — needs a pentest or a merged+run Strix workflow, which is
  outside a code read.

**Corrections to Oct 2026 text established in this pass (update the area files before the
interview, do not re-ask on stale text):**
1. GM-26 Q12: `rejected` AHPRA results now DO notify pharmacies
   (`announce_rejected_bookings`); "warn nobody" holds only for not_found/unreadable.
2. GM-26 Q16: the anonymous pharmacy name leaks in THREE places, not one — reminder email,
   shift-updated notice, not-selected notice (plus the unconditional `pharmacy_name` in the
   shared email context builder).
3. GM-02 ON-Q15 / GM-05 Q-16: other-staff mobile 404 is fixed; Explorer shifts tab is a
   real screen; the pharmacist rate-field drop persists.
4. GM-22 Q03 cancel half: "no cancel endpoint" is now verified at head (was carried
   unvalidated); the cancel question presupposes an unbuilt event.
5. GM-22 Q07: no emergency-cancel mechanism exists (was "not re-validated"); the roster
   path notifies by single email on request creation only.

**Residual gaps left open by this pass (not closed, named so they are not lost):**
- C05: web + Expo apply/offer screen reads for early payment-readiness display.
- C18: web reservation display + API exposure of `provider_expires_at`.
- ON-Q15/Q-16: per-step mobile submit/persist reads + a device pass; PHARMACY_MANAGER
  switch behaviour on mobile; whether bank fields land via any non-onboarding endpoint.
- Q12/Q13: fee/refund rule for AHPRA-cancelled paid bookings (CX-Q20 territory).
- Q15: card-level fields on anonymous posts (script volume, rate shown) — display-name and
  location redaction verified; the public-board card composition was not re-read.
- Q20: Terms of Service wording on direct hire not checked.
- Q43: everything — see above.
