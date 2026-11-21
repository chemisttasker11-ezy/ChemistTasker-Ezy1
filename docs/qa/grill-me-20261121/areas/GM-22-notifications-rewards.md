# GM-22 — Notifications / Rewards — Full Grill Documentation

> **Corrections against current code (21 Nov 2026 review).** 13 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 8 hold, 5 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| GM22-04 / 18 / 20 | Same push preferences and quiet hours on both backend refs | MAIN-ONLY — PR257 only | PR257 adds per-type push preferences and user quiet hours. Main’s notification service does not implement that preference policy. | `main:backend/notifications/services.py:102`; `pr257:backend/notifications/services.py:119`; `pr257:backend/notifications/models.py:65` |
| GM22-04 / 23 | Reconciliation/refund-required notices are “in-app only” | WRONG | These notices use `notify_users`, which also attempts WebSocket and eligible Expo push delivery. They have no dedicated email in these call sites. | `pr257:backend/billing/payment_events.py:65`; `pr257:backend/billing/paid_fulfillment.py:48`; `pr257:backend/notifications/services.py:159`; `main:backend/notifications/services.py:102` |
| GM22-14 / 27 | Pharmacy name “never” reaches worker before acceptance | WRONG | The offered worker can receive the pharmacy name and ABN through the pre-acceptance engagement preview. Separate update and not-selected notices also disclose the name to applicants. | `main:backend/shifts/engagement.py:640`; `main:backend/shifts/serialization/offers.py:235`; `pr257:backend/shifts/serialization/offers.py:243` |
| GM22-18 / 20 | Quiet-hours pushes are “held” | WRONG | Quiet hours suppress the push attempt; no later-delivery queue is created. ALERT pushes bypass quiet hours unless explicitly opted out. | `pr257:backend/notifications/services.py:132`; `pr257:backend/notifications/services.py:143`; `pr257:backend/notifications/services.py:159` |
| GM22-24 / 25 | Future assignments can be rated; expiry never enforced | WRONG / overbroad | Rating eligibility requires a past assignment date. AHPRA handling checks stored state and can queue expiry-driven desktop rechecks, although it does not synchronously query the register before booking. | `pr257:backend/ratings/views.py:82`; `pr257:backend/onboarding/verification/state.py:162`; `pr257:backend/onboarding/verification/state.py:211` |

**Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Issue:** #250 — Grill Me, one consolidated backend + Web + Expo sign-off before launch
**Method source:** PR #184 (`docs/qa/launch-grill/questions.json`, `AUDIT.md`, `LAUNCH_GRILL.html`), head `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`
**Revalidation target:** active PR #249, stacked on #248
**Status:** TRACED + RE-VALIDATED. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Shift announcement on posting | Backend announces public shifts to matched audience via email/in-app notification (`backend/shifts/announcements.py:344`). | Push notification and in-app alerts dispatched simultaneously (`backend/shifts/announcements.py:344`). | Yes | |
| In-app notification center / feed | Top bar bell icon opens notification dropdown list (`frontend_web/src/layouts/TopBarActions.tsx:109`). | Dedicated notifications screen renders grouped alert history (`frontend_mobile/features/notifications/NotificationsScreen.tsx:33`). | Yes | Parity question: Web provides a header dropdown menu, whereas Expo features a full-page notification screen. |
| Push notification delivery & permissions | Web has no push token registration; relies on email and in-app banners (`frontend_web/src/layouts/TopBarActions.tsx:254`). | Registers Expo push token with native permission prompt (`frontend_mobile/utils/pushNotifications.ts:62`). | Expo only | Intended: Native mobile platforms support APNs/FCM push notifications while web relies on email and in-app dropdowns. |
| Notification preferences & quiet hours | Web lacks push quiet-hours settings (`frontend_web/src/pages/dashboard/sidebar`). | User configures quiet-hours window and push delivery toggles (`frontend_mobile/app/settings/mobile.tsx:276`). | Expo only | Verified 21 Nov: intended. Quiet hours govern push, and push exists only on Expo. |
| Shift reminders (24h / 12h pre-shift) | Celery beat triggers pre-shift reminders sent by email (`backend/shifts/tasks.py:22`). | Mobile receives synchronized push notification reminder (`backend/shifts/tasks.py:22`). | Yes | |
| Rewards / Pills balance & ledger history | User views Pills balance and ledger in sidebar rewards page (`frontend_web/src/pages/dashboard/sidebar/rewards/PillsPage.tsx:56`). | User reviews Pills balance, history, and redemption in native screen (`frontend_mobile/roles/shared/pills/PillsScreen.tsx:61`). | Yes | |
| Pay shift fees with Pills | Owner selects Pills payment option in active shifts table (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:12`). | Owner selects 'Pay with Pills' on payable shift cards (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/ActiveShiftCards.tsx:648`). | Yes | |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM22-01 · PO-Q08 — When a shift escalates, who is told, and when does escalation stop? | Web + Expo (asked in GM-11: GM-11-Q01) |
| GM22-02 · BK-Q06 — When an offer is declined or expires, what happens to the shift? | Web + Expo |
| GM22-03 · AG-Q09 — Who is told when a shift is cancelled, covered or replaced? | Web + Expo (asked in GM-04: GM-04-Q08) |
| GM22-04 · AG-Q10 — Which channels carry those notices? | Web + Expo (asked in GM-15: GM15-39) |
| GM22-05 · AG-Q11 — Which shifts get pre-shift reminders, and when? | Web + Expo (also covers GM-23-11, GM25-C19) |
| GM22-06 · AG-Q12 — If a shift changes inside 12 hours of start, what happens to reminders? | Web + Expo (also covers GM-23-12) |
| GM22-07 · CX-Q06 — Inside the window, who is alerted and how fast? | Web + Expo (asked in GM-15: GM15-06) |
| GM22-08 · AV-Q08 — Should urgent-shift alerts need a separate opt-in? | Web + Expo (asked in GM-19: GM-19-Q08) |
| GM22-09 · AV-Q09 — Should workers set a max distance and minimum rate for alerts? | Web + Expo (asked in GM-19: GM-19-Q09) |
| GM22-10 · LA-Q17 — Fix before launch? Match emails miss escalated shifts and reach unverified workers. | Web + Expo (asked in GM-11: GM-11-Q05) |
| GM22-11 · PO-Q10 — How late may a scheduled escalation fire? | Web + Expo (asked in GM-11: GM-11-Q03) |
| GM22-12 · LA-Q08 — Fix before launch? Scheduled escalation only runs when someone loads a shift list. | Web + Expo (asked in GM-11: GM-11-Q04) |
| GM22-13 · PO-Q09 — Should escalation pause while an offer waits for an answer? | Web + Expo (asked in GM-11: GM-11-Q02) |
| GM22-14 · PO-Q12 — When does an anonymous pharmacy's name reach the worker? | Web + Expo (asked in GM-11: GM-11-Q08) |
| GM22-15 · AG-Q03 — Should both sides get a PDF copy of the agreement? | Web + Expo (asked in GM-14: GM14-Q06) |
| GM22-16 · LA-P02 — Fix before launch? AHPRA cancellations bypass the cancellation policy and notices. | Web + Expo (asked in GM-17: GM17-Q11) |
| GM22-17 · NEW — Is there an in-app notification centre, and what does it do? | Web + Expo |
| GM22-18 · NEW — How do Expo push notifications work, and what happens when permission is denied? | Expo only |
| GM22-19 · NEW — Who sends the emails, and what happens when one fails? | Web + Expo |
| GM22-20 · NEW — What notification preferences can a worker (and a pharmacy) set — including quiet hours? | Web + Expo |
| GM22-21 · NEW — Master event catalogue: which event notifies whom, on which channel? | Web + Expo |
| GM22-22 · NEW — What Pills / rewards notifications exist (earn, spend, expiry, low balance)? | Web + Expo |
| GM22-23 · NEW — Which payment / invoice / refund events notify whom? | Web + Expo |
| GM22-24 · NEW — Is either side told when a rating is left, or when a reliability badge / incident is applied? | Web + Expo |
| GM22-25 · NEW — Are verification / AHPRA status changes notified (granted, lapsed, suspended, revoked)? | Web + Expo |
| GM22-26 · NEW — How are duplicate, failed and stale notifications handled — and is there an audit log? | Web + Expo |
| GM22-27 · NEW — Can a notification leak one tenant's information to another? | Web + Expo |
| GM22-28 · NEW — Do chat / hub messages notify, and where does GM-22 end and GM-20 begin? | Web + Expo |
| GM-22-OD-14 — A notice about a shift at your other pharmacy opens that pharmacy | Expo only |

## 0. Verification header — read first

| Item | Value / result |
|---|---|
| PR #249 head verified | **`97c4543e051b43fe30ec7e2e61ad3d69957a918e`** — verified live via `pull_request_read get` on 2026-11-21. **Unchanged from the task snapshot and from the blocked first pass.** Still open, draft, not merged, `mergeable_state: unstable`, base `feat/mobile-merge-sdk` (`c98cf2ef74c6de356cceb8dee3a61dad47b6b843`), 458 commits, 314 files changed, `updated_at` 2026-11-05. |
| PR body "working head 26cae2d6" | **Resolved:** `26cae2d6` is the short SHA of the last implementation commit listed in the PR body text, not the branch head. The API head is `97c4543e…` and all tracing below is at that head. |
| Other heads | PR #248 head `25939534a1c5543454a8e770571e4dff46380d96`; PR #184 head `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`; `main` `8ccf8f7` (merge PR #247, 2026-11-03). `questions.json` blob SHA `9b700e31…`, AUDIT.md blob SHA `41f77580…` (as in the blocked file). |
| **Rate limit — this re-run** | **No real HTTP 429 occurred.** 146 GitHub calls in total, all strictly sequential, one at a time, 9 s sleep between calls (loops: 69 + 37 + 27 + 11 fetches plus the PR/issue/format reads). One **false-positive stop** in loop 1 at job 38: the stop detector matched the identifier `EMAIL_TASK_RATE_LIMIT` (a settings constant) inside a successfully downloaded file (`backend/core/settings.py`, `ok:true`, 27,384 chars). That was not a rate limit; the detector was fixed to count only an `ok:false` response mentioning 429/rate-limit, the file was fully downloaded and is usable, and the loop resumed. No call was made after any real 429, because none occurred. |
| Search inventory caveat | `search_code` results reflect the **default branch** (`main`, `8ccf8f7`), not ref `97c4543…`. The Next-notification-UI finding (§1d) and the `notify_users` call-site list for memberships / hub / roster / calendar / attendance (§1c, boundary rows) come from default-branch search and are flagged as such; their content at the PR head was **not** verified. All other file-content claims below come from ref-pinned fetches at `97c4543…`. |
| Senior review | `~/workspace/chemisttasker-grill/senior-review-gm22-notifications-rewards.md` (2026-11-21, ACCEPT AS BLOCKED, correct 429 handling). Its three adoption notes were applied: (1) subscriber discount now applied (GM-16/GM-18 verified) — the Oct 2026 "subscribers overcharged" claim is **not** carried as current; (2) AV-Q09/LA-Q17 CHANGED partial (GM-18 verified — distance enforced, rate missing, recipients not Verified-filtered, escalated shifts don't trigger match emails); (3) reminder/escalation **mechanics** belong to GM-11/GM-23 — GM-22 owns only the notice/channel/recipient decisions and cross-references the mechanics. |
| Scope | GM-22 owns only notice/channel/recipient decisions. Reminder/escalation mechanics → GM-11/GM-23 (cross-referenced, not re-decided). Chat/hub delivery → GM-20 (boundary in GM22-28). Pills/fees semantics → GM-16/GM-17 (GM-22 owns only the notices about them). Verification semantics → GM-02. |

## Plain-English summary (what GM-22 is about)

GM-22 is: **who gets told what, on which channel, and when — and what Pills/rewards messages exist.** A pharmacy posts a shift, a worker applies, an offer is made, payment is taken, a shift is cancelled or a worker is rated. At each step someone needs to know. The trace now shows the app tells people through **one shared system** — a durable in-app `Notification` row, an Expo push, and/or an email — but each feature still picks its own recipients and channels, there is **no dedup, no retry for push, no audit log**, and several events are still silent (escalation, offer expiry, reservation expiry, refunds, ratings, Pills spend). The anonymous-pharmacy name leak is **confirmed and wider than the reminder alone**: the reminder email, the shift-updated notice, and the not-selected notice all name the pharmacy. Until the owner picks the channel rule (GM22-04) and the recipient rule (GM22-03), every other notification decision is guesswork — that is why the first question below is the channel rule.

---

## (1) GM-22 traced flow — current code at head `97c4543e`

### 1a. Current-flow matrix

| # | Trigger | Actor | Backend / API | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F1 | Owner/manager posts a shift | System at posting | `announce_posted_shift` (`shifts/announcements.py:345`): visibility-gated notify flags (staff/favourites/chain); **anonymous posting to PLATFORM → no notices at all**; recipients via ACCEPTED + active Membership + role can perform; poster excluded; **cap 50** (`SHIFT_EMAIL_RECIPIENT_CAP = 50`): sorted by user id, first 50, warning logged. Docstring: "Each recipient gets one e-mail with its in-app notification." `announce_availability_matches` (`:462`): PLATFORM only; `notify_new_shifts=True`; active; role check; **travel prefs enforced** (distance/travel states); any-overlap availability match; **no Verified filter, no minimum-rate filter** | — (email + in-app, not UI) | — (email + in-app + push per type, not UI) | `UserAvailability.notify_new_shifts` on availability rows | Email + in-app notice to matched workers | Recipients **not** filtered by Verified — unverified workers are emailed shifts they are then blocked from applying to (`interest.py` gate). Cap silently drops recipients past 50. No retry/dedup. |
| F2 | Shift escalates to a wider tier | System | `escalation.py`: `auto_escalate_due_shifts` sends **nothing**; tier advanced by the same function. PLATFORM step skipped at daily public-shift limit | Newly eligible workers see the shift only on next list load | Same, on next Expo list load | Wider tier persisted | **No email / push / in-app notice to the new audience** (SH-06, confirmed) | None — workers discover it only by browsing. Shifts that later escalate to PLATFORM never get the F1 email (AV-04, confirmed). |
| F3 | Escalation due, but nobody browsing | System | **No scheduled job.** `auto_escalate_due_shifts` runs inside `BaseShiftViewSet.get_queryset` (`shifts/base.py`) on every list/detail request; `core/celery.py` schedules **only the two marketplace escalation tasks every minute** — no shift-escalation beat (SH-05, confirmed) | Any shift-list/detail page load triggers the scan | Any Expo shift-list/detail load triggers the same shared-backend scan | Tier advanced late or never | Escalation + its (non-existent) notices fire late or never; every request scans every due shift | No retry — next page view retries it. No late-fire bound (PO-Q10). Mechanics → GM-11/GM-23. |
| F4 | Any worker shows interest | Worker | `escalation.py`: auto-escalation skips any shift that has **ever** had interest (stop rule confirmed). Manual `escalate_shift` has no interest check | Shift stops widening | Shift stops widening | Interest record persists; escalation permanently stopped | **NEW since Oct 2026:** `reject_shift` (`shifts/interest.py`) sends an **escalation-prompt email + in-app notice to created_by only** ("Shift declined… escalate to the platform with a single click") | No resume on decline / expiry / withdrawal; the creator is now prompted to escalate manually. No owner override traced beyond manual escalate. |
| F5 | Owner/manager makes an offer (incl. dedicated offer from talent board) | Owner / manager | Offer created (`shifts/offers.py`, `assignment.py`): pending offer **refreshed, not duplicated**; expired closed first, silently; new offer → in-app "Shift offer received" + email. **NEW since Oct 2026:** `buzz` action — manager sends an offer-confirmation reminder, **1 h cooldown** (`SHIFT_OFFER_BUZZ_COOLDOWN`, 429 if too soon), via `notify_shift_users` (kind `shift_offer_buzz`) + email. Expiry flat **48 h** (`OFFER_EXPIRY_HOURS = 48`), **not capped at shift start** (SH-07 first half confirmed), applied only lazily (`offers.py list()` → PENDING + expired → EXPIRED, silent) | Offer screens | Offer screens (Expo Shift Centre) | Offer `pending` | Offer + confirmation events send **in-app notice plus email** (AG-Q10, confirmed) | Expiry is **silent**: nobody is told, nothing offers the next applicant (BK-Q06, confirmed). Pending offer can outlive the shift start. |
| F6 | Worker declines / accepts an offer | Worker | Decline: owner notified **in-app + email** (channel now confirmed); no reopen/next-applicant logic. Accept: terms freeze; payment-required → ACCEPTED_AWAITING_PAYMENT, else finalize; **competing PENDING offers for the same slot/date are EXPIRED silently by `.update()` — no notice at accept time**; acceptance notifications on commit (in-app + email to worker and owner); free path → `send_shift_payment_finalized_notifications` | Offer screens | Offer screens | Offer `declined` / `accepted` | Owner told on decline; worker + owner told on accept | No fallback rule (D06 open): no auto-offer to next applicant, no reopen notice. |
| F7 | Worker accepts → reservation created (D01) | Worker | Acceptance creates a time-limited reservation; only verified payment confirms it (D01). **Reservation mechanism has moved:** `backend/shifts/reservations.py` **does not exist at head**; unpaid-reservation handling now lives in `backend/billing/checkout_reservations.py` — Stripe Checkout session, **24 h payable, no `expires_at` set on the session** (comment at line 220: "open_checkout may still reach the provider at 23 h and a session stays payable for 24 h") | Reservation shows "Waiting for owner payment" + pay-by time (Oct 2026 UI claim, not re-traced) | Parity not separately traced | `FulfillmentCheckout` + `FulfillmentReservation` per occurrence_key | Worker + manager notified on acceptance (F6); payment confirmation per F9 | Payment failure: reservation remains until deadline, retry allowed (BK-R01, Oct claim not re-traced). Payment after expiry: no rebooking, credit-or-refund after approved review (F04, not re-traced). |
| F8 | Unpaid reservation expires | System | **D03 CHANGED.** Expiry is in `billing/checkout_reservations.py`: `expire_checkout` / `expire_unreconciled_checkout` — **manual / admin-triggered / conflict-driven** (billing admin action + `open_checkout` guard), **not a 60 s scheduler** (no beat entry; the Oct 2026 `shifts/reservations.py` scheduler is gone). **No notification call exists in either expiry path — expiry is silent; the D03 "notify worker and manager" is NOT implemented in the traced code.** No auto-escalation, no penalty (that half still holds — nothing escalates or penalises on expiry) | — | — | Checkout EXPIRED ("Confirmed expired and unpaid"); reservations released | **Nobody told** | Shift re-opens to same tier only; does not widen. |
| F9 | Payment confirmed (Stripe checkout + idempotent webhook) | Pharmacy | `handle_payment_checkout` (`billing/payment_events.py:19`): idempotent by payment intent (distinct Stripe webhook event IDs for the same intent are a no-op). Binding error → in-app ALERT "Shift payment needs reconciliation" to owner (payload kind `shift_payment_refund_required`, **in-app only, no email**). Deleted shift → in-app ALERT "Shift payment needs a refund" to owner (in-app only). Paid fulfillment → `finalize_paid_selection` + on-commit `send_shift_payment_finalized_notifications` (worker + owner in-app + email; not-selected workers get in-app ALERT "Shift filled: {pharmacy.name}" + email — **names the pharmacy**). **Cancellation-penalty payment → no finalize, no notice traced.** | "Confirmed" state | Parity unknown | Assignment confirmed; `ShiftPayment` paid | Payment confirmation: in-app + email (worker + owner). **No PDF copy emailed** — no PDF code encountered in the traced files (not specifically searched — UNKNOWN) | Failed/cancelled checkout does not confirm; reservation stays until deadline (BK-R01). Refund path: see F9b. |
| F9b | Refund / chargeback (Stripe `charge.refunded`) | System (webhook) | `handle_charge_refunded` (`billing/payment_events.py:126`): updates `ShiftPayment` (`refunded_amount_aud`, status `refunded`/`partially_refunded`, clears `reconciliation_required` when fully refunded); **no `notify_users`, no `send_async_email`, no notice of any kind — refunds are silent.** Partial refunds are never marked fully refunded (cumulative amount check) | — | — | Payment row updated | **Nobody told** | Payer discovers the refund only in Stripe / by asking. |
| F10 | Shift edited after acceptance | Owner / manager | `revise_shift` (`shifts/posting.py`): on commit → `send_shift_updated_notifications` (`shifts/emails.py:404`): recipients = **all interested + counter-offerers + PENDING/ACCEPTED_AWAITING_PAYMENT/ACCEPTED offer holders minus creator**; in-app ALERT "Shift updated: {pharmacy.name}" + email — **names the pharmacy to all past applicants including anonymous posts**; fires on **EVERY edit including text-only**. Edit with an accepted offer awaiting payment blocked for non-description changes (F01-N2); text-only edits allowed. Terms snapshot vs live shift diverge (SH-08, Oct claim not re-traced) | Shift card shows new values | Parity unknown | Terms snapshot vs live shift diverge | **Edits notify everyone who applied, countered or got an offer** (AG-Q09, confirmed — over-broad, leaks activity + pharmacy name) | No worker re-consent flow (AG-Q05–Q08 open in Oct 2026, not re-traced). |
| F11 | Booked shift cancelled / covered / replaced | Owner / manager / worker | **NOT RE-VALIDATED in this run.** The Oct 2026 claim (no cancel endpoint for confirmed external bookings, SH-01) was **not re-checked** — cancellation code was not read. Roster `WorkerShiftRequest` path was not re-read either. Do not treat the Oct claim as current. | — | — | — | (Oct 2026: no cancel notice exists for outside shifts) | Support path unknown. **GM-22 cannot answer GM22-03's cancel half until SH-01 is re-traced (GM-11/GM-23 or a cancel-path trace).** |
| F12 | Pre-shift reminder due (~12 h before slot) | System (hourly job) | `send_shift_reminders` (beat name `client_profile.tasks.send_shift_reminders`, **hourly at :15**): emails ~12 h before slot (**12–13 h window in pharmacy tz**); `ShiftSlotAssignment` rows only — **reservations get none**; **no `notification=` kwarg and no suppress flag → an auto in-app notification is created** (title = subject, **empty body**, type TASK default) alongside the email. Subject `f"Reminder: Your upcoming shift at {shift.pharmacy.name}"` — **PO-Q12 leak CONFIRMED still current** (names pharmacy in subject + context for anonymous posts). **No dedup / sent-state** (1 h window ≈ once, but a double run would duplicate). Reminder is type TASK, so push follows `push_tasks` opt-out and is **held during quiet hours** (not an ALERT) | — (email + in-app) | — (email + in-app; push only if not in quiet hours and `push_tasks` on) | No reminder-sent state | One email + one in-app notice per slot | Late change after the email: no alert, no voiding of the old reminder (see F13). Cancelled assignments have no state to stop reminders (D12, Oct claim not re-traced). Mechanics → GM-11/GM-23. |
| F13 | Shift changes inside 12 h of start | Owner / manager | **No dedicated late-change handling.** BUT `send_shift_updated_notifications` (F10) fires on **every** edit (in-app ALERT + email), so a late time change **does** notify — there is just no instant-alert distinction, no "late" marking, and **no voiding of the old reminder**. Booked slots can only be re-timed in the roster editor (Oct claim, not re-traced) | — | — | — | Edit notice (F10) is the only late-change signal | Worker may hold both the old 12 h reminder and the new edit notice with different times. |
| F14 | Worker cancels / no-shows (roster path only) | Worker | **NOT RE-VALIDATED in this run.** Roster `WorkerShiftRequest` emails and the R04D emergency-escalation recipients/timing were not re-read. No repeating-push emergency mechanism was found in any traced file (the `buzz` action in F5 is an offer reminder, not an emergency cancel). | Roster screens only | `app/my-roster.tsx` (Oct claim, not re-traced) | Request state | (Oct 2026: manager approval always; no timed repeat alerts) | If no manager answers before start and the worker doesn't come, the outcome was undecided (CX-Q07, Oct 2026, not re-traced). |
| F15 | AHPRA registration cancelled / lapsed | System / admin | **Notice half VERIFIED — changed since Oct 2026.** `announce_suspension` (`onboarding/verification/state.py:292`): in-app notice + email to the user (`suppress_auto_notification=True` since `notify_users` already created the in-app notice), **admin email via raw `send_mail`** (synchronous, not the async task path), WS broadcast `ahpra.suspended`. `announce_member_suspension` (`:336`): notifies the pharmacy owners/admins + org admins that a team member's AHPRA registration changed status. **Policy half NOT re-traced:** whether the cancellation now routes through the ordinary cancellation policy/fees/refunds/notices (LA-P01/LA-P02) was not checked — the cancellation code was not read. | — | — | Reservation declined; shift state per cancellation path | User + admins told (new); worker's booked pharmacies told via member-suspension notice | Shift stuck "waiting for payment" (LA-P01, Oct claim) — not re-checked. |
| F16 | Rating written | Owner / worker | **VERIFIED: no rating notification exists.** `backend/ratings/views.py` contains **no `notify` / `announce` / `send_async_email` at all.** Ratings allowed for any assignment ever, incl. future/unworked/internal shifts (Oct 2026 eligibility claim, not re-traced). Reliability badge / incident ladder (P10) notices: **not traced** (incident code not read) | Talent cards show averaged rating (Oct claim, not re-traced) | Parity unknown | Rating record | **Nobody told** | A 1-star rating appears silently on a talent card. |
| F17 | Pills / subscription event (charge, renewal, low balance, earn/spend) | System / Stripe | **Subscriber discount now applied** (adopted GM-16/GM-18: $30/$15, $80/$40); Stripe price IDs still hard-coded. **Referral award notifies** (`rewards/services.py:207` `_send_pill_award_message`): in-app ALERT "Congrats, you earned {delta} pills" (action_url `/dashboard/owner/pills`, payload with ledger/referral/rule) + email `emails/pill_reward_awarded.html` — **both wrapped in try/except pass (silent failure)**. **Spend does NOT notify**: `spend_pills_for_shift_post` (`:367`) writes a ledger entry only. **No low-balance / expiry / renewal notice traced** anywhere in the notification system (default-branch search for Pills in notifications returned nothing). | — | — | `PillLedgerEntry` (delta, `balance_after`, source); `PillRewardRule`, `PillReferralCode/Event` | Award: in-app + email. Spend/expiry/low-balance: nothing | Pills expire or a booking fails for lack of Pills with no warning. GM-16 owns what Pills are; GM-22 owns only the notices. |
| F18 | Worker sets availability / opts into alerts | Worker | `UserAvailability.notify_new_shifts` (single switch) enforced in `announce_availability_matches` (F1). **No separate urgent-shift opt-in** exists in any traced preference model (`NotificationPushPreference` has per-type switches only — §1b). Availability matching for notifications is any-overlap; roster validation needs the shift fully inside availability (AV-03, Oct claim not re-traced) | Availability switch on web (Oct claim, not re-traced line-by-line) | Same switch on Expo (Oct claim, not re-traced line-by-line) | `notify_new_shifts` boolean per availability row | **No separate urgent-shift opt-in** (AV-Q08); alerts ignore minimum rate; distance/travel preferences are enforced (AV-Q09, CHANGED partial) | Recurring rows have no end-date requirement; old rows never expire and nobody is asked to refresh (AV-02, Oct claim not re-traced). |
| F19 | Shift posted to staff / favourites / chain tiers | System | Posting wizard notify flags (staff, favourite, chain) — carried E01B **verified** in `announce_posted_shift` (visibility-gated flags); **no organisation-wide broadcast** found in the traced code. Which channel a flag means (email vs in-app vs push) was **not set** — the announce path sends email + in-app notice per its docstring, and push follows the notification type | Post Shift wizard (Vite; shared `frontend_web/shared/postShift/*`, Oct claim) | Post Shift screen (Expo; shared `roles/shared/shifts/PostShift*`, Oct claim) | Notify flags on shift | Tier audiences are notified per flags | Skipping a notice never hides the shift (E01A, Oct claim not re-traced) — notice and visibility are separate. |

### 1b. Channel inventory (verified at head `97c4543e`)

| Channel | What the code proves exists | What is NOT agreed / NOT in code |
|---|---|---|
| **In-app notifications** | `Notification` model (`notifications/models.py`): user, type TASK/MESSAGE/ALERT/WORK_NOTE, title, body, action_url, payload, `read_at`, `created_at`; `unread()` queryset; `mark_read`; indexes user+read_at, user+created_at. `NotificationViewSet` (`notifications/views.py`): read-only, per-user queryset, paginated **20/max 100**, `mark-read` action returning marked + unread. Serializer exposes id/type/title/body/payload/action_url/created_at/read_at (read-only). **Expo centre exists** (`features/notifications/NotificationsScreen.tsx` + `app/notifications.tsx` + per-role routes): paginated list, **auto-marks visible unread as read on every focus**, per-item mark-read, tap routing (chat room → message detail; shift → shift route; calendar → calendar route), pull-to-refresh, load-older, unread dot/badge. **Vite bell exists** (`frontend_web/src/components/TopBarActions.tsx`): dropdown, WebSocket live updates (`ws/notifications/`, `notification.created`/`counter`/`updated`), mark-read, `notification_id` deep links — **and the web bell EXCLUDES chat notifications** (comment: "Backend counter includes message notifications. Web bell excludes chat notifications"). **Next: no notification UI found** (search "notification" across `landing_next` returned 4 hits, none a centre/API usage — default-branch search, §0 caveat). | No expiry (notices never expire client- or server-side); **no pinning** — money/cancel notices are marked read by opening the list like any other; no offline behaviour traced; no read-receipts. |
| **Email** | Zoho SMTP (`smtp.zoho.com:587`, TLS), Django SMTP backend, `DEFAULT_FROM_EMAIL` env (`backend/core/settings.py`). `send_async_email` (`users/tasks.py`): Celery **"email" queue, rate_limit 30/m**, autoretry on Exception, backoff, max 600 s, jitter, **max_retries=5, then dropped (no dead-letter / fallback traced)**; failure only logged; eager/debug → synchronous send. `prepare_email_message` renders templates, inline logo, **redacts otp/code/token/password in logs**. **No bounce handling anywhere in the traced files.** **Auto-notification rule** (`users/task_dispatch.py:26-61`): every `send_async_email` WITHOUT explicit `notification=` and WITHOUT `suppress_auto_notification=True` **auto-creates an in-app notification** (title = subject, body = `""`, action_url from context `shift_link`/etc or `/dashboard`, payload `notification_kind=email_notification` + template name), dispatched on_commit — **independent of email delivery success**. `suppress_auto_notification=True` is used where `notify_shift_users` already created the in-app notice (avoids double). **No direct `send_mail` calls in `backend/billing` or `backend/shifts`** (both default-branch searches returned empty) — all mail flows via `users.tasks.send_async_email`, **except** the AHPRA admin email, which uses raw `send_mail` (`onboarding/verification/state.py:294`). | Email provider is Zoho SMTP (verified); sender identity = `DEFAULT_FROM_EMAIL` env (value not verified); templates per event exist (names traced in call sites); deliverability/bounce handling absent; whether every money/cancel event gets an email: **no** — reconciliation/refund-required notices are in-app-only (F9), refunds are silent (F9b). |
| **Push (Expo)** | `expo-notifications` wired end-to-end. Handler: sound **false**, badge **false**, banner + list **true**. `registerForPushNotificationsAsync` (`frontend_mobile/utils/pushNotifications.ts`): web → null; non-device → null; permission requested if not granted; **denied → null (no token, no retry prompt, no in-app explanation traced)**; requires EAS projectId (throws if missing); token via `getExpoPushTokenAsync`. `registerDeviceTokenWithBackend` → shared-core `registerPushDeviceToken`; failures logged only, never wipe auth. `AuthContext`: push setup once per session (`registeredPush` flag); logout passes device token. `DeviceToken` model (`users/models.py:129`): user FK, platform ios/android/web, token unique, `active` flag, created/updated; upsert by token, reassigns token to current user (`DeviceTokenViewSet`). Backend `_deliver_notification` (`notifications/services.py:148`): WebSocket broadcast `notification.created` + unread counter to `user.{id}` group; **Expo push via POST `https://exp.host/--/api/v2/push/send`** (sound default, data = payload) IF `push_allowed_for_notification`. **Push policy** (`:120`): per-type opt-outs; **ALERTs bypass quiet hours** (explicit alert opt-out still honoured); non-alerts held during quiet hours; invalid timezone → push blocked (fail-closed for push only). **Push failures logged only, NO retry, NO fallback. No dedup key — duplicate `notify_users` calls = duplicate rows + pushes. No staleness voiding. Push title/body = notification title/body verbatim** (lock screen carries pharmacy names etc.). | Push is Expo-only; web users get in-app + email instead (no push equivalent). Denied permission has no fallback prompt. Two-device behaviour not traced. |
| **SMS** | No SMS evidence anywhere in the traced files. | Treat as not existing until traced. |
| **Preferences** | `NotificationPushPreference` (`notifications/models.py`): OneToOne user — `push_messages` / `push_tasks` / `push_work_notes` / `push_alerts` **default True**; `quiet_hours_enabled` **default False**; quiet **22:00–07:00**; timezone default **Australia/Brisbane**; only 7 Australian zones supported (serializer rejects others). GET/PATCH own prefs (`NotificationPushPreferenceView`). Plus the single `notify_new_shifts` switch on availability rows (F18). Shared-core API: `getNotifications`, `markNotificationsAsRead`, `registerPushDeviceToken`, `get/updateNotificationPushPreferences` (`frontend_web/shared-core/src/domains/notifications/api.ts`) — **one API for all clients**; Vite's `frontend_web/src/api/notifications.ts` re-exports it. | No per-event preferences, no per-channel-per-event matrix, no digest/frequency control. Whether money/cancel notices can ever be switched off: **not decided** — note ALERTs bypass quiet hours, so a cancel sent as ALERT still pushes at night; but the auto-email notice is type TASK (default), so its push is held in quiet hours. |
| **Quiet hours** | **Exist** (see Preferences): 22:00–07:00 default, off by default, ALERTs bypass. | Whether a money/cancel notice must ignore quiet hours is undecided (GM22-20). |
| **Pills / rewards** | Referral award: in-app ALERT + email (F17). Spend: ledger only, silent. No low-balance/expiry/renewal notice traced. | Whether Pills expiry/low-balance notices should exist is undecided (GM22-22). |
| **WebSocket** | `NotificationConsumer` (`notifications/consumers.py`): one group per user (`user.{id}`), auth 4401/4403, `_still_authorized` re-check; Redis failure → socket stays alive, client polls REST. Vite TopBar connects to `ws/notifications/` and handles `notification.created`/`counter`/`updated`. | Which screens open sockets beyond TopBar was not traced. |

### 1c. Event catalogue — who is notified, verified at head `97c4543e`

| Event | Worker | Pharmacy (owner/manager) | Organisation admin | Platform/admin | Channel (verified) |
|---|---|---|---|---|---|
| Shift posted (staff/fav/chain tiers) | Matched workers per flags (cap 50) | — | — | — | Email + in-app |
| Shift posted straight to PLATFORM | Available workers emailed (any overlap; not Verified-filtered; cap 50) | — | — | — | Email + in-app |
| Shift escalates | **Nobody** | — | — | — | None |
| Interest / application | — | Managers notified in-app (+ email via auto rule? — `notify_shift_managers` creates in-app; email only if the call site also sends one — `express_interest` sends **one email to the primary recipient** (created_by or first manager) + in-app to managers) | — | — | In-app + one email to primary manager |
| Offer made | In-app "Shift offer received" + email | — | — | — | In-app + email |
| Offer buzz (manager reminder) | In-app (kind `shift_offer_buzz`) + email | — | — | — | In-app + email (1 h cooldown) |
| Offer declined | — | Owner in-app + email | — | — | In-app + email |
| Offer expired | **Nobody** | **Nobody** | — | — | None (silent, lazy) |
| Offer accepted (competing offers) | Accepted worker in-app + email | Owner in-app + email | — | — | In-app + email; **competing PENDING offers expired silently, no notice** |
| Reservation created | Worker + manager notified (acceptance notices, F6) | Manager notified | — | — | In-app + email |
| Payment confirmed | In-app + email | In-app + email | — | — | In-app + email |
| Payment needs reconciliation / refund | — | Owner **in-app ALERT only, no email** | — | — | In-app only |
| Payment failed (checkout) | Not traced | Not traced | — | — | Unknown |
| Refund (Stripe `charge.refunded`) | **Nobody** | **Nobody** | — | — | None (silent, ledger only) |
| Cancellation-penalty payment | **Nobody traced** | **Nobody traced** | — | — | None traced |
| Reservation expired unpaid | **Nobody** | **Nobody** | — | — | None (silent) — D03 notice not implemented |
| Shift edited after acceptance | Everyone who applied / countered / got an offer (in-app ALERT "Shift updated: {pharmacy.name}" + email — **names the pharmacy**) | — | — | — | In-app + email (over-broad) |
| Pre-shift reminder (~12 h) | Booked/rostered worker: email + auto in-app notice (empty body); push only if not in quiet hours and `push_tasks` on | — | — | — | Email + in-app (+ conditional push) |
| Late change <12 h | Edit notice (F10) only — no dedicated late-change alert, no voiding of old reminder | — | — | — | In-app + email (via edit notice) |
| Cancel / cover / replace (external) | **NOT RE-VALIDATED** (SH-01 not re-traced) | **NOT RE-VALIDATED** | — | — | Unknown |
| Roster cover/swap request | **NOT RE-VALIDATED** (not re-read) | Manager (approval, Oct claim) | — | — | Unknown |
| Emergency cancel near start | **NOT RE-VALIDATED** (no repeating-push mechanism found in traced files) | **NOT RE-VALIDATED** | Support after 30 min proposed, not decided | — | Unset |
| AHPRA suspension / type not accepted | In-app + email ("Your AHPRA registration") | Owners/admins of the worker's pharmacies + org admins (member-suspension notice) | Org admins notified | Admin email (raw `send_mail`) + WS broadcast `ahpra.suspended` | In-app + email |
| Rating left | **Nobody** | **Nobody** | — | — | None (no rating notice exists) |
| Invoice issue reported | — | Invoice owner: in-app ALERT "Issue reported on invoice #N" | — | — | In-app only |
| Invoice issued / delivered | Not traced (delivery email exists as `invoicing.tasks.deliver_invoice_email` in beat routes; whether it also creates an in-app notice was not read) | — | — | — | Unknown (email delivery traced only as a beat route) |
| Pills referral award | Referrer: in-app ALERT "Congrats, you earned N pills" + email | — | — | — | In-app + email |
| Pills spend / expiry / low balance | **Nobody** | **Nobody** | — | — | None |
| Incident / warning / badge (P10) | **NOT RE-VALIDATED** (incident code not traced) | — | — | Platform (case by case, Oct claim) | Unknown |
| Chat message | Recipients: in-app type MESSAGE, title sender name or "New message", body preview ≤200 chars, per-role chat action_url (`chat/signals.py`) — **Vite bell excludes chat; Expo list includes it** | Same | — | — | In-app + push per MESSAGE type (GM-20 owns delivery; GM-22 owns the channel/tenant rules) |
| Hub post / comment | `notify_users` call sites exist in `pharmacy_hub/notifications.py` + `posts.py` (default-branch search; content at head NOT verified) | — | — | — | Unknown at head |
| Membership event | `notify_users` call site exists in `memberships/notifications.py` (default-branch search; content at head NOT verified) | — | — | — | Unknown at head |
| Roster published | Workers: in-app "Roster published" (`workforce/roster/publication.py`, default-branch search; content at head NOT verified) | — | — | — | Unknown at head |
| Work note / calendar | `notify_users` call site in `team_calendar/tasks.py` (default-branch search; content at head NOT verified) | — | — | — | Unknown at head |

**Master `notify_users` call-site inventory (verified):** `shifts/notifications.py` (shift events), `shifts/emails.py` (not-selected notices), `billing/payment_events.py` (reconciliation/refund-required), `rewards/services.py` (Pills awards), `invoicing/views.py` (invoice-issue report), `chat/signals.py` (chat messages), `onboarding/verification/state.py` (AHPRA suspension/member suspension), `users/tasks.py` (auto-notification rule — every `send_async_email` without `notification=`/`suppress_auto_notification`). Default-branch search only (content at head NOT verified): `memberships/notifications.py`, `pharmacy_hub/notifications.py`, `pharmacy_hub/posts.py`, `workforce/roster/publication.py`, `team_calendar/tasks.py`, `attendance/credentials.py`.

**Tenant-isolation tests (verified at head):** `backend/notifications/test_delivery_isolation.py` — broadcast failure does not suppress counter/push/next recipient; push network failure does not suppress next recipient; Expo HTTP/ticket failure observed without mutating durable rows; success retains payload/active tokens/active-recipient filter; commit delivery waits and rollback discards row + callbacks; channel DB error isolated from durable reads; persistence errors still propagate. `backend/notifications/test_api.py` — auth required; list paginated own-only newest-first with exact fields; read-only; other user's detail 404; mark-read survives channel outage without touching other users; mark-read all/selected; mark-read cannot touch other users' notifications; rejects non-list ids. `DeviceTokenTests` — auth required; register creates active token; same token registered by another user is **reassigned, not duplicated**; missing fields 400; cannot delete another user's token.

### 1d. Web vs Expo parity (verified at head)

- **Backend is shared (Django), so the *rules* are the same on both clients** — the gaps are in the *screens, triggers and channels*: whether a notice is shown, whether push exists, whether the preference switch is reachable.
- **Vite web:** TopBar bell (dropdown, WS live, mark-read, deep links) — **excludes chat notifications** from its list/count. Post Shift wizard has notify flags (Oct claim, not re-traced line-by-line). `SetAvailabilityPage.tsx` has the one `notify_new_shifts` switch (Oct claim). Push preferences API exists in shared-core (GET/PATCH) — whether a Vite settings screen exposes it was **not traced**.
- **Next web:** **no notification UI found** — no centre, no bell, no shared-core notifications usage in `landing_next` (default-branch search, §0 caveat). Next users therefore have no in-app place to re-read a notice.
- **Expo mobile:** full notification centre (list, auto-mark-read on focus, tap routing incl. chat/shift/calendar, pull-to-refresh, pagination) + push end-to-end (token registration, permission flow, per-type opt-outs, quiet hours). Post Shift screen has notify flags (Oct claim). `SetAvailabilityScreen.tsx` has the same one switch (Oct claim). PR #249 lists Post Shift prefills/retry, templates, draft/publish as unfinished handover W3b (Oct claim, not re-traced).
- **Parity gaps (verified):** (1) Next has no notification centre at all. (2) Vite bell excludes chat notices; Expo centre includes them. (3) Push is Expo-only — web users get in-app + email instead, so the channel rule must state what web users get instead of push. (4) Expo marks visible notices read on focus (no pinning); Vite marks read on click/open — money/cancel notices can be marked read by opening the list on either client.
- **Explorer shifts tab on mobile** was a blank placeholder in Oct 2026 (ON-05) — **not re-traced**; it affects whether explorers ever see shift notices.

---

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: every carried question (GM22-01–16) and every carried decision touching GM-22 was re-checked against PR #249 head `97c4543e`. Verdicts: **VALID** (Oct 2026 claim still true at head), **CHANGED** (claim differs at head — with what changed), **NOT RE-VALIDATED** (not re-checked in this run — the Oct claim must not be presented as current).

| Old ID | Old question | Verdict | Evidence (current code, head `97c4543e`) |
|---|---|---|---|
| PO-Q08 (GM22-01) | When a shift escalates, who is told, and when does escalation stop? | **CHANGED** (verified) | Escalation still sends **nothing** (`escalation.py`); stop rule (any interest ever) still current; escalated shifts still don't trigger match emails. **New:** `reject_shift` now sends an escalation-prompt email + in-app notice to the creator. The Oct recommendation (A — notify each new tier; stop when reserved) still stands. |
| BK-Q06 (GM22-02) | When an offer is declined or expires, what happens to the shift? | **CHANGED** (verified) | Decline now notifies the owner **in-app + email** (channel confirmed, was unknown). Expiry still **silent** (lazy, `list()`); still no reopen/next-applicant logic. **New:** `buzz` action (manager offer reminder, 1 h cooldown). |
| AG-Q09 (GM22-03) | Who is told when a shift is cancelled, covered or replaced? | **CHANGED — partial** | **Edit half confirmed:** `send_shift_updated_notifications` still notifies everyone who applied/countered/got an offer (in-app ALERT + email, names the pharmacy). **Cancel half NOT RE-VALIDATED:** the cancel path for confirmed external bookings (SH-01) was not re-read. |
| AG-Q10 (GM22-04) | Which channels carry those notices? | **CHANGED** (verified) | Channels now fully traced: in-app + push + email exist with concrete rules (per-type opt-outs, quiet hours, ALERT bypass, auto-email notice rule). Per-event channel map still **not agreed** — each feature still picks its own. Recommendation A still stands. First question confirmed. |
| AG-Q11 (GM22-05) | Which shifts get pre-shift reminders, and when? | **CHANGED** (verified) | Reminder is hourly beat at :15, ~12 h before slot (12–13 h window, pharmacy tz), email + **auto in-app notice (empty body, type TASK)**; reservations still get none; **no dedup/sent-state**; push only if not in quiet hours and `push_tasks` on. Mechanics → GM-11/GM-23. |
| AG-Q12 (GM22-06) | If a shift changes inside 12 hours of start, what happens to reminders? | **CHANGED** (verified) | Still **no dedicated late-change handling** and no voiding of old reminders. **But** the Oct claim "no instant alert" is now wrong: `send_shift_updated_notifications` fires on **every** edit (in-app ALERT + email), so a late change does notify — with no "late" distinction. |
| CX-Q06 (GM22-07) | Inside the window, who is alerted and how fast? | **NOT RE-VALIDATED** | Emergency-cancel recipients/timing not re-read; **no repeating-push mechanism was found in any traced file** (the `buzz` action is an offer reminder, not an emergency cancel). |
| AV-Q08 (GM22-08) | Should urgent-shift alerts need a separate opt-in? | **CHANGED** (verified) | Single `notify_new_shifts` switch confirmed enforced in `announce_availability_matches`; **no separate urgent opt-in** exists in any traced preference model. |
| AV-Q09 (GM22-09) | Should workers set a max distance and minimum rate for alerts? | **CHANGED (partial)** — adopted GM-18 + verified | Distance/travel enforced in `announce_availability_matches`; **minimum-rate filter still missing**; recipients **not Verified-filtered**. |
| LA-Q17 (GM22-10) | Fix before launch? Match emails miss escalated shifts and reach unverified workers. | **CHANGED (partial)** — adopted GM-18 + verified | Escalated shifts still don't trigger match emails (`escalation.py` sends nothing); recipients still **not Verified-filtered**; distance enforced. Still a launch-blocking code question. |
| PO-Q10 (GM22-11) | How late may a scheduled escalation fire? | **CHANGED** (verified) | Still **no scheduled shift-escalation job**; escalation still request-driven via `get_queryset`; celery beat has no shift-escalation entry. The "within 5 minutes" bound still undecided. |
| LA-Q08 (GM22-12) | Fix before launch? Scheduled escalation only runs when someone loads a shift list. | **CHANGED** (verified) | `core/celery.py` registers **only the two marketplace escalation tasks every minute**; no shift-escalation beat. Request-driven escalation confirmed in `shifts/base.py`. |
| PO-Q09 (GM22-13) | Should escalation pause while an offer waits for an answer? | **CHANGED** (verified) | Stop rule confirmed (any interest ever stops auto-escalation); **no pause rule**; manual escalate has no interest check; an offer pending does not pause escalation (escalation already stopped at interest). |
| PO-Q12 (GM22-14) | When does an anonymous pharmacy's name reach the worker? | **CHANGED** (verified — leak wider than Oct) | Reminder email **still names the pharmacy** (subject + context). **Worse than Oct:** `send_shift_updated_notifications` names it to all past applicants, `send_shift_not_selected_after_payment_notifications` names it to non-selected applicants, and `build_shift_email_context` sets `pharmacy_name` **unconditionally**. Only interest/offer flows redact (public = "A candidate"). |
| AG-Q03 (GM22-15) | Should both sides get a PDF copy of the agreement? | **NOT RE-VALIDATED** | No PDF code encountered in the traced files; **not specifically searched**. Do not treat "not built yet" as current. |
| LA-P02 (GM22-16) | Fix before launch? AHPRA cancellations bypass the cancellation policy and notices. | **CHANGED — partial** | **Notice half verified changed:** AHPRA suspension now notifies (in-app + email to user, admin email, WS broadcast, member-suspension notice to owners/admins). **Policy half NOT RE-VALIDATED:** whether the cancellation now routes through the ordinary policy/fees/refunds was not checked (cancellation code not read). |
| Carried D03 | Unpaid reservation expires: release to same audience, notify worker and manager. No auto-escalation, no penalty. | **CHANGED** | Mechanism **moved**: `shifts/reservations.py` does not exist at head; expiry now in `billing/checkout_reservations.py` (Stripe Checkout session, 24 h payable, manual/admin/conflict-driven — **not a 60 s scheduler**). **The notify half is NOT implemented** — no notification call exists in either expiry path; expiry is silent. No auto-escalation / no penalty still holds (nothing escalates or penalises on expiry). |
| Carried E01B | Keep staff, favourite and chain notice flags. No organisation-wide broadcast. | **VALID** | Visibility-gated notify flags verified in `announce_posted_shift`; no org-wide broadcast found in the traced code. |
| Carried E01 | Audience order: staff, favourites, owner chain, organisation, public. Owner may start at a later tier and post anonymously to public. | **NOT RE-VALIDATED** | Posting wizard / audience order not re-traced in this run. |
| Carried E01A | Earlier audiences keep access; wider posting adds viewers; skipping a notice never hides the shift. | **NOT RE-VALIDATED** | Not re-traced in this run. |
| Carried E03 | Escalation timing: owner picks intervals when posting. Roster publishing never triggers escalation. | **PARTIAL** | Owner-picked intervals verified (`escalate_to_*` due in `escalation.py`); roster-publishing half not re-traced. |
| Carried R04D | Public worker wants to cancel: always needs manager approval; near start, emergency escalation with reason and notices. No self-cancel. | **NOT RE-VALIDATED** | Roster cancel path not re-read. |
| Carried P04 / P06 / P10 | Sanctions and incidents: platform only, case by case; notice-based warnings; incident ladder (1st warning, 2nd 14 days no applying, 3rd 28 days plus badge, 4th 56 days, 5th permanent after human review, cap 6 months). NOPEN — no money penalties for workers, ever. | **NOT RE-VALIDATED** | Sanctions/incident code not traced. |
| Carried F01 / F04 | Money: booking fee, refund/credit and worker pay stay separate; payment arriving after expiry means no rebooking — pharmacy chooses credit or refund after approved review. | **NOT RE-VALIDATED (in full)** | Payment-after-expiry credit-or-refund choice not traced. Partially traced: refunds are silent (`handle_charge_refunded` updates the ledger only, no notice). |
| AUDIT.md SH-03 | `is_subscriber` computed but never used — subscribers overcharged; Stripe price IDs hard-coded. | **SUPERSEDED** — adopted GM-16/GM-18 | Subscriber discount is **now applied** ($30/$15, $80/$40); Stripe price IDs are still hard-coded. The Oct 2026 "subscribers overcharged" claim must NOT be carried as current. |
| AUDIT.md AV-03 | Notifications and roster use different matching rules (any overlap vs fully inside). | **NOT RE-VALIDATED** | Availability-match rule (any overlap) verified in `announce_availability_matches`; roster validation rule not re-traced. |
| AUDIT.md TB-01 | Anonymous talent posts expose full names to any signed-in account (API leak). | **NOT GM-22** — route to GM-01/GM-24 | Talent-board anonymity, not a notification. Noted here only because the same leak pattern appears in GM-22's notices (GM22-14). |
| #184 `AUDIT.md` (35 gaps) | Notification-relevant gaps: SH-05, AV-04/LA-Q17, SH-07, D12, PO-Q12, LA-P01/P02, SH-03, AV-03, TB-01, no dedup/retry/audit, no push-token/centre code. | **Re-validated above** | SH-05, AV-04, SH-07, PO-Q12, LA-P02 (notice half), SH-03 (superseded) re-checked at head; D12, LA-P01, AV-03, TB-01 not re-traced. Dedup/retry/audit and push-token/centre code are now **traced** (GM22-17–19, GM22-26). |

**Old questions NOT carried forward unvalidated:** none — every carried question above was re-checked or explicitly marked NOT RE-VALIDATED with the reason.

---

## Part C — GM-22 question queue (carried + new, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and Web/Expo difference are shown inside each question. Sources are file/function at PR #249 head `97c4543e` unless noted. Decision status: **OPEN** for all — no owner answer recorded. Revalidation status per question: **VALID / CHANGED / NOT RE-VALIDATED** (carried) or **TRACED** (new — actual now verified at head).

**Severity:** 🔴 launch-blocking · 🟠 high · 🟡 medium · ⚪ low. **Type:** decision = owner must choose; code = build/fix once the rule is known.

---

### GM22-01 · PO-Q08 — When a shift escalates, who is told, and when does escalation stop? 🔴 decision · gap SH-06 — CHANGED

> **Merged 22 Nov: asked once, as GM-11-Q01 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** today a shift widens to a new audience in total silence — nobody is told — and once anyone has ever shown interest, it never widens again, even if that person declined. One declined applicant can strand a shift forever.

**ACTUAL TODAY — Web and Expo (same, backend-shared):** `escalation.py` sends **nothing** on escalation; `auto_escalate_due_shifts` advances the tier only. The stop rule is confirmed: any interest **ever** stops auto-escalation. Manual `escalate_shift` has no interest check. **New since Oct 2026:** `reject_shift` sends an escalation-prompt email + in-app notice to the creator only ("Shift declined… escalate to the platform with a single click") — so the creator is now prompted, but the new audience is still not told. Escalated shifts still never trigger match emails (F1). Escalation is request-driven (no scheduled job) — mechanics → GM-11/GM-23.
**Normal case:** shift escalates staff→favourites, favourites emailed/pushed. **Edge case:** escalation fires while an offer is pending (see GM22-13). **Retry/concurrency:** two workers apply in the same minute escalation fires — both must be told consistently and only one can be booked. **Denied role/wrong tenant:** a worker from another chain must not get the notice (visibility ≠ notification). **Payment:** none directly, but an unfilled shift near start may become an urgent repost. **Web/Expo:** backend is shared, so the notice rule is one rule, but push reaches Expo users and email reaches everyone.
**RECOMMENDED: A — Notify each new tier; stop when reserved.** Respects the owner's notice flags. Rationale: newly eligible workers are never told today, and one declined applicant strands the shift. Severity 🔴: unfilled shifts are the core marketplace failure. Benefit: wider audience actually reached; risk: more messages if intervals are short.
**ALTERNATIVE A — Keep current logic:** silent escalation; any past interest stops it for good. Scenario: pharmacy posts to favourites, one favourite declines, shift sits empty forever while chain/public workers never hear of it. Trade-off: zero noise, frequent unfilled shifts.
**ALTERNATIVE B — Notify at public; stop at interest:** today's stop rule, notices only on reaching PLATFORM. Scenario: chain workers still never told; shift still strands after a decline.
**ALTERNATIVE C — Owner chooses per shift:** another setting on the form. Scenario: careful owners get control; rushed owners (the urgent-shift case) skip it and get today's behaviour by default.
**Other / defer:** defer the stop-rule change but fix the notify-on-escalation first (or vice versa) — record which half is deferred.
**Sources:** `backend/shifts/escalation.py`, `backend/shifts/interest.py` (`reject_shift`), `backend/shifts/announcements.py`.
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-02 · BK-Q06 — When an offer is declined or expires, what happens to the shift? 🟠 decision · gap D06 — CHANGED

**Plain English:** a declined offer tells the owner (now confirmed: in-app + email). An expired offer still dies in silence — nobody is told, and nothing offers the next applicant. There is also a new "buzz" button so the manager can nudge a worker who has not answered.

**ACTUAL TODAY — Web and Expo (same):** decline → owner notified **in-app + email**; shift stays open to the same audience. Expiry: flat 48 h, not capped at shift start, applied only lazily in `list()` — **silent**, nobody told, nothing offers the next applicant. **New:** `buzz` action — manager sends an offer-confirmation reminder, 1 h cooldown (429 if too soon), in-app (kind `shift_offer_buzz`) + email. Accept: competing PENDING offers for the same slot/date are EXPIRED silently by `.update()` — no notice at accept time.
**Normal case:** decline → manager told, shift open. **Edge case:** offer expires 30 min before start (expiry must be capped at start, SH-07). **Retry:** worker declines then re-applies. **Concurrency:** two offers outstanding, one accepted, the other must be told it is withdrawn — **today it is not told**. **Denied role:** only the offering pharmacy's managers get the decline notice. **Payment:** none (no payment taken yet). **Web/Expo:** same backend rule, both clients must show the reopened state.
**RECOMMENDED: A — Reopen to same audience, tell manager.** Matches D03. Rationale: expiry is silent today, so the manager may wait on a dead offer. Benefit: no dead time; risk: manager gets a notice for every expiry.
**ALTERNATIVE A — Keep current logic:** shift stays open; owner told on decline only. Scenario: offer expires Friday night, manager discovers it Monday, shift unfilled.
**ALTERNATIVE B — Back to manager to pick:** shift waits for a person. Scenario: manager chooses the next applicant deliberately; slow near start.
**ALTERNATIVE C — Auto-offer the next applicant:** fast, but may pick someone unwanted. Scenario: second-ranked applicant is auto-offered at 2am without the manager seeing them.
**Other / defer:** notify on expiry now, decide auto-offer later.
**Sources:** `backend/shifts/offers.py` (buzz, accept, decline, lazy expiry), `backend/shifts/assignment.py` (`OFFER_EXPIRY_HOURS = 48`).
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-03 · AG-Q09 — Who is told when a shift is cancelled, covered or replaced? 🔴 decision · gap D07 — CHANGED (partial)

> **Merged 22 Nov: asked once, as GM-04-Q08 in GM-04.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** each feature still picks its own recipients. The edit half is now verified: every past applicant, counter-offerer and offer holder gets told about every edit — including text-only edits — and the notice names the pharmacy. The cancel half could not be re-validated: the cancel path itself was not re-read.

**ACTUAL TODAY — Web and Expo (same):** shift edits → `send_shift_updated_notifications`: **all interested + counter-offerers + PENDING/ACCEPTED_AWAITING_PAYMENT/ACCEPTED offer holders minus creator**, in-app ALERT "Shift updated: {pharmacy.name}" + email, on **every** edit including text-only. Booked outside shifts: **cancel path NOT RE-VALIDATED** (SH-01 not re-read — the Oct 2026 claim "no cancel endpoint for confirmed external bookings" must not be presented as current).
**Normal case:** booked worker + owner + managers told of a cancel. **Edge case:** multi-date booking, one date cancelled (D05) — only that date's worker told (Oct claim, not re-traced). **Retry:** cancel notice sent twice (dedup needed — none exists, GM22-26). **Denied role/wrong tenant:** applicants who never got the shift must not learn the booked worker's name from the notice — **today the edit notice names the pharmacy to all past applicants**. **Payment:** cancel notice and refund/fee notice must agree (F01: fee, refund/credit, worker pay stay separate). **Web/Expo:** same recipient list on both.
**RECOMMENDED: A — Affected workers, owner, shift's managers.** Only people who must act. Rationale: edits today reach every past applicant, which leaks activity and adds noise. Benefit: names stay private; risk: someone who was watching misses it.
**ALTERNATIVE A — Keep current logic:** each feature keeps choosing its own recipients. Scenario: a worker who applied once, months ago, gets told about a cancel they no longer care about.
**ALTERNATIVE B — Plus organisation admins:** wider oversight. Scenario: group admin sees every cancel across 20 pharmacies — useful oversight, heavy noise.
**ALTERNATIVE C — Plus anyone watching:** risks leaking names. Scenario: a competing pharmacy's staff learn a shift was cancelled and infer staffing trouble.
**Other / defer:** decide recipients for external bookings now; roster cover notices later.
**Sources:** `backend/shifts/emails.py` (`send_shift_updated_notifications`), `backend/shifts/posting.py` (`revise_shift`).
**Decision status:** OPEN · Oct 2026 rec A. **Blocked in practice by SH-01:** the cancel path was not re-traced, so the cancel half of this question cannot be answered from evidence yet.

### GM22-04 · AG-Q10 — Which channels carry those notices? 🔴 decision · gap D07 — ★ FIRST QUESTION (see Part D) — CHANGED

> **Merged 22 Nov: asked once, as GM15-39 in GM-15.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** in-app, push and email all exist now, with concrete rules — but each feature still picks its own channels, so some money events get no email and some reminders get no push. The owner needs to set one rule for which channel carries which event.

**ACTUAL TODAY — Web:** in-app centre exists on Vite (TopBar bell, WS live, mark-read) and **does not exist on Next** (no notification UI found); push is Expo-only. **ACTUAL TODAY — Expo:** full notification centre + push end-to-end (token registration, per-type opt-outs, quiet hours 22:00–07:00, ALERTs bypass quiet hours). **Backend:** `notify_users` creates a durable in-app row, WS broadcast, and Expo push (if allowed); `send_async_email` goes via Celery "email" queue (Zoho SMTP, rate 30/m, retry max 5 then dropped, no bounce handling); every email without an explicit `notification=` or `suppress_auto_notification=True` also auto-creates an in-app notice (title = subject, empty body). Offer and confirmation events send in-app + email; pre-shift reminders are email + auto in-app notice (push only if not in quiet hours); reconciliation/refund-required notices are **in-app only**; refunds are **silent**.
**Normal case:** offer → in-app + push + email; payment confirmed → in-app + email; reminder → push (+email at 24h); cancel → in-app + push + email. **Edge case:** worker has push disabled → email + in-app must still arrive. **Retry:** email bounces (is there a fallback to in-app? — the auto-notification rule means the in-app notice exists regardless of email delivery). **Denied role:** a notice must never carry another tenant's details on any channel. **Payment:** payment confirmation and refund notices must be email (durable record for disputes) — **today refunds have no notice at all and reconciliation notices have no email**. **Web/Expo:** push is Expo-only; web users get in-app + email, so the rule must say what web users get instead of push.
**RECOMMENDED: A — In-app and push; email for money/cancel.** Email only when it matters. Rationale: today there is no rule, so some money and cancel events lack a durable email and reminders lack push. Benefit: urgent things are seen (push), important things are provable (email); risk: workers who turn push off miss reminders.
**ALTERNATIVE A — Keep current logic:** each feature keeps choosing its own channels. Scenario: a cancel sends push only, worker's phone is off, no email proof exists for a fee dispute.
**ALTERNATIVE B — Email everything:** inbox noise. Scenario: worker gets 12 emails for one shift's lifecycle and stops reading them — then misses the one that matters.
**ALTERNATIVE C — In-app only:** easy to miss. Scenario: worker doesn't open the app for two days, misses an offer that expired in 48h.
**Other / defer:** add SMS as a channel later (no SMS evidence anywhere).
**Sources:** `backend/notifications/services.py`, `backend/notifications/models.py`, `backend/users/tasks.py`, `backend/users/task_dispatch.py`, `frontend_mobile/utils/pushNotifications.ts`, `frontend_web/src/components/TopBarActions.tsx`, `frontend_mobile/features/notifications/NotificationsScreen.tsx`.
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-05 · AG-Q11 — Which shifts get pre-shift reminders, and when? 🟠 decision · gap D12 — CHANGED

> **Also covers (22 Nov):** GM-23-11 (GM-23), GM25-C19 (GM-25). Asked once, here.

**Plain English:** one email about 12 hours before each assigned slot, plus an in-app notice that the email automatically creates (with an empty body). Reservations get none, there is no second reminder, no dedup, and the reminder can be held back by quiet hours because it is not an alert.

**ACTUAL TODAY — Web and Expo (same, backend-driven):** hourly beat at :15 (`send_shift_reminders`); emails ~12 h before slot (12–13 h window in pharmacy tz); `ShiftSlotAssignment` rows only — **reservations get none**; **no dedup / sent-state** (a double run would duplicate); the auto in-app notice has **empty body** and type TASK, so push follows `push_tasks` opt-out and is **held during quiet hours**. Subject names the pharmacy (PO-Q12 leak, GM22-14). Mechanics → GM-11/GM-23.
**Normal case:** confirmed worker gets 12 h email + in-app notice. **Edge case:** shift starts in 3 h (no reminder can fire in the 12–13 h window — the worker gets nothing). **Retry:** hourly job runs twice (dedup by sent-state needed — none exists). **Denied role:** reminder must not leak the pharmacy name for anonymous posts (see GM22-14 — it does leak). **Payment:** reservation (unpaid) reminders would imply a booking that isn't confirmed. **Web/Expo:** reminder is backend-driven, both clients show the same booking, but only Expo can push.
**RECOMMENDED: A — Confirmed only, 24h and 2h before.** One per worker per date. Rationale: one email 12 hours out is easy to miss and has no closer nudge. Benefit: fewer no-shows; risk: twice the messages.
**ALTERNATIVE A — Keep current logic:** one email about 12 hours before each assigned slot (+ auto in-app notice). Scenario: worker on night shift sleeps through the 12 h email, no 2 h nudge.
**ALTERNATIVE B — Confirmed only, 24h before:** fewer messages. Scenario: worker reminded a day out, then forgets.
**ALTERNATIVE C — Also reservations:** reminds about unpaid holds. Scenario: worker is reminded about a shift the pharmacy hasn't paid for yet — confusing if payment then fails.
**Other / defer:** keep 12 h email, add the 2 h push only.
**Sources:** `backend/shifts/tasks.py` (`send_shift_reminders`), `backend/core/settings.py` (beat schedule), `backend/users/task_dispatch.py` (auto-notification rule).
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-06 · AG-Q12 — If a shift changes inside 12 hours of start, what happens to reminders? 🟠 decision · gap D12 — CHANGED

> **Also covers (22 Nov):** GM-23-12 (GM-23). Asked once, here.

**Plain English:** there is still no dedicated late-change alert and old reminders are never voided — but the Oct claim "no instant alert" is now wrong, because every edit (including text-only edits) already notifies all past applicants. The problem is now the opposite: too broad, not silent.

**ACTUAL TODAY — Web and Expo (same):** no special late-change handling; no voiding of old reminders; BUT `send_shift_updated_notifications` fires on **every** edit (in-app ALERT "Shift updated: {pharmacy.name}" + email to all interested/counter-offerers/offer holders). A time change at 8pm the night before **does** produce a notice — with no "late" marking, and the old 12 h reminder (which named the old time) is **not** voided. Booked slots can only be re-timed in the roster editor (Oct claim, not re-traced).
**Normal case:** time change → instant push + email, old reminder voided (recommended, not current). **Edge case:** change made 5 minutes before start (alert may arrive after start — must still send, marked late). **Retry:** change saved twice (one alert, not two — **no dedup exists**, so two saves = two notices today). **Concurrency:** manager changes time while worker is travelling. **Denied role:** only the booked worker and the shift's managers get the alert — **today all past applicants get it**. **Payment:** a time change that crosses a pay boundary (e.g. into overtime) must be disclosed, not just notified. **Web/Expo:** same alert both clients; Expo push is the fastest path.
**RECOMMENDED: A — Instant alert; old reminders cancelled.** New reminder uses new details. Rationale: a change made after the 12-hour email has gone gets no *targeted* alert today (the edit notice goes to everyone, including people who never got the shift), and the old reminder is never voided, so the worker can hold two different times. Benefit: worker turns up at the right time; risk: extra message at short notice.
**ALTERNATIVE A — Keep current logic:** no late-change alert; reminder uses current slot time; every edit notifies all past applicants. Scenario: start moved 9am→1pm at 8pm the night before; worker gets the edit notice (among many others) and the old reminder still says 9am.
**Other / defer:** instant alert for time changes only; other edits (duties, parking) wait for the next reminder.
**Sources:** `backend/shifts/emails.py` (`send_shift_updated_notifications`), `backend/shifts/posting.py` (`revise_shift`), `backend/shifts/tasks.py`.
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-07 · CX-Q06 — Inside the window, who is alerted and how fast? 🔴 decision · gap R04D — NOT RE-VALIDATED

> **Merged 22 Nov: asked once, as GM15-06 in GM-15.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** a worker asks to cancel close to start. The principle was settled (manager approval always, emergency escalation near start) but recipients and timing were open — and they are still open: no repeating-push emergency mechanism was found in any traced file.

**ACTUAL TODAY (Oct 2026, NOT re-validated):** Not built yet. (R04D settled the principle — manager approval always, emergency escalation near start — but recipients and timing were open.) **This pass:** the roster `WorkerShiftRequest` path was not re-read, and no emergency-cancel repeat-alert code was found in any traced file. The `buzz` action (`shifts/offers.py`) is an offer reminder, not an emergency cancel.
**Normal case:** request at 2 h before start → manager + owner pushed immediately, repeated every 15 min. **Edge case:** request 10 min before start (repeat interval is meaningless — single urgent blast + support). **Retry:** push delivered but not read (escalate anyway on the clock, not on read receipts). **Denied role:** support sees the request but must not be able to approve it. **Payment:** incident/fee consequences (P06/P10) must not be decided by the alert. **Web/Expo:** push is the only channel fast enough; web managers need an in-app banner too.
**RECOMMENDED: B — Manager and owner, push every 15 min; plus platform support after 30 min.** Support chases the pharmacy; it does not approve. Rationale: there is no timed emergency cancellation escalation; existing roster emails are not repeated emergency notices. Benefit: a gap gets covered before start; risk: support gets pulled into pharmacy staffing.
**ALTERNATIVE A — Manager and owner, push every 15 min:** until someone answers. Scenario: manager is on leave, owner is the only backup, nobody else is looped in.
**ALTERNATIVE C — Manager only:** one person, no backup. Scenario: manager's phone is off; shift uncovered.
**Other / defer:** 15/30-minute timings are proposed, not verified competitor standards — owner may pick different intervals.
**Sources:** questions.json (CX-Q06, R04D); no current-code source — **not re-validated**.
**Decision status:** OPEN · Oct 2026 rec B. **Needs a roster-path trace (GM-11/GM-23) before it can be answered from evidence.**

### GM22-08 · AV-Q08 — Should urgent-shift alerts need a separate opt-in? 🟡 decision — CHANGED

> **Merged 22 Nov: asked once, as GM-19-Q08 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** there is one switch for matching-shift alerts, on availability rows, on both apps. There is no second switch for urgent shifts. The owner needs to decide whether one switch stays enough.

**ACTUAL TODAY — Web and Expo (same):** one matching-shift switch (`notify_new_shifts` on availability rows), enforced in `announce_availability_matches`. No separate urgent-shift consent or urgency-based availability-alert audience exists in any traced preference model (`NotificationPushPreference` has per-type switches only). What counts as "urgent" is itself undecided (PO-Q13: owner flag only today; auto-urgent within 24 h proposed — not re-traced).
**Normal case:** urgent shift posted, opted-in workers alerted, message labelled "URGENT". **Edge case:** what counts as urgent is undecided. **Retry:** same urgent shift alerted twice (dedup — none exists). **Denied role:** urgent alert must respect the same audience tiers, not blast all workers. **Payment:** urgent pay boost (PO-Q14) shown in the alert or not (not re-traced). **Web/Expo:** the switch must exist and sync on both clients.
**RECOMMENDED: KEEP — Use the same matching-shift notification consent for urgent and ordinary shifts.** Rationale: urgency does not change the notification purpose; keep one consent at launch, label urgent messages clearly, add frequency controls only if volume proves necessary. Benefit: simpler settings; risk: workers who want ordinary alerts but not 2am urgent ones cannot separate them.
**ALTERNATIVE A — Yes, separate urgent opt-in:** for shifts starting within 24 h. Scenario: worker opts into ordinary alerts but out of urgent ones, and misses a well-paid tomorrow-morning shift.
**Other / defer:** one switch now; revisit if urgent volume causes opt-outs.
**Sources:** `backend/shifts/announcements.py` (`announce_availability_matches`), `backend/notifications/models.py` (`NotificationPushPreference`).
**Decision status:** OPEN · Oct 2026 rec KEEP.

### GM22-09 · AV-Q09 — Should workers set a max distance and minimum rate for alerts? 🟡 decision — CHANGED (partial)

> **Merged 22 Nov: asked once, as GM-19-Q09 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** distance and travel preferences are now enforced for match alerts — that half is fixed. But alerts still do not check a minimum hourly rate, and they still go to unverified workers.

**ACTUAL TODAY — Web and Expo (same, backend-enforced):** both apps let workers set coverage radius or travel states, and match alerts **enforce** these preferences (`announce_availability_matches`). Alerts **do not check a minimum hourly rate**; talent-post radius is a separate snapshot. Recipients are **not Verified-filtered**.
**Normal case:** alert only if shift is within radius AND at/above minimum rate (recommended, not current — rate half missing). **Edge case:** urgent shift just below minimum rate (should urgency override the rate filter? undecided). **Retry:** worker changes minimum rate after alerts were queued (no queue exists — alerts are sent at posting/escalation time). **Denied role:** rate/distance are the worker's own data, no leak. **Payment:** the alert must show the true rate (PO-Q03: how pay shows to workers — not re-traced). **Web/Expo:** the preference must be settable on both and enforced once, in the backend, not per client.
**RECOMMENDED: A — Yes, alerts respect both.** Search can still widen. Rationale: distance/travel matching already exists; add a worker minimum-rate preference for alerts. Benefit: fewer irrelevant alerts, fewer opt-outs; risk: worker sets the rate too high and hears nothing.
**ALTERNATIVE A — Keep current logic:** respect existing distance/travel preferences without filtering alerts by minimum rate. Scenario: worker gets alerted for a $45/hr shift when their minimum is $60 — noise, but they can still widen their search manually.
**Other / defer:** distance now, minimum rate later.
**Sources:** `backend/shifts/announcements.py` (`announce_availability_matches`); GM-18 verification adopted.
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-10 · LA-Q17 — Fix before launch? Match emails miss escalated shifts and reach unverified workers. 🔴 code · gap AV-04 — CHANGED (partial)

> **Merged 22 Nov: asked once, as GM-11-Q05 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** the match-email bug is still there, in both halves: shifts that escalate to public never trigger a match email, and the emails that do go out are not filtered by Verified — so unverified workers get alerts for shifts the apply gate then blocks.

**ACTUAL TODAY — Web and Expo (same, backend):** availability-match messages run when posting directly to public, **not when shifts later escalate there** (`escalation.py` sends nothing). Recipients are filtered by active account, role and travel/availability, **but not Verified**; the same backend serves both apps. Distance/travel matching **is** now enforced (GM-18). Minimum-rate filter still missing (GM22-09).
**Normal case:** shift escalates to PLATFORM → match email to verified, available workers (recommended, not current). **Edge case:** worker becomes Verified between posting and escalation (must be included). **Retry:** escalation email sent once per worker per shift, not once per tier (no dedup exists — GM22-26). **Denied role:** unverified workers must not receive the email at all (not just be blocked at apply). **Payment:** none. **Web/Expo:** backend fix, both clients benefit equally.
**RECOMMENDED: A — Before launch.** Must be done before the first real booking. Rationale: escalated vacancies miss outreach while unverified workers receive alerts they cannot act on. Benefit: every public shift reaches eligible workers, nobody is teased with a shift they can't take; risk: none identified beyond build time.
**ALTERNATIVE B — Soon after launch:** within the first month of live use. Scenario: first month's escalated shifts fill slowly while the fix waits.
**ALTERNATIVE C — Not needed:** accept the risk or drop it. Scenario: unverified workers keep getting emails for shifts the apply gate then blocks.
**Other / defer:** fix the Verified filter now, the escalation trigger later (or vice versa).
**Sources:** `backend/shifts/announcements.py` (`announce_availability_matches`, `:462`), `backend/shifts/escalation.py`, `backend/shifts/interest.py` (apply gate); GM-18 verification adopted.
**Decision status:** OPEN · Oct 2026 rec A. **Note:** this is a code question (fix timing), not a policy choice — but it depends on GM22-01 (notify on escalation) and GM22-04 (channel rule) being settled first.

### GM22-11 · PO-Q10 — How late may a scheduled escalation fire? 🟠 code · gap SH-05 — CHANGED

> **Merged 22 Nov: asked once, as GM-11-Q03 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** there is still no scheduled job, so the question is still hypothetical — but it is now verified that escalation only runs when someone loads a shift list, and the celery beat has no shift-escalation entry at all.

**ACTUAL TODAY — Web and Expo (same):** auto-escalation only runs when someone loads a shift list or detail (`BaseShiftViewSet.get_queryset`); no scheduled job exists, so due escalations fire late or never, and each request scans every due shift. `core/celery.py` schedules only the two marketplace escalation tasks every minute.
**Normal case:** escalation + notices within 5 min of due time (recommended, not current). **Edge case:** shift starts within the bound (escalation must still fire, or be skipped as pointless — undecided). **Retry:** job runs twice (idempotent tier advance + deduped notices — **neither exists yet**: no idempotent advance, no dedup). **Web/Expo:** backend job, both clients see the widened audience together.
**RECOMMENDED: A — Within 5 minutes.** A scheduled job every few minutes. Rationale: reservation expiry already runs on a schedule in billing, so a job is cheap; five minutes is plenty for owner-set intervals. (Note: the Oct rationale cited a 60 s reservation scheduler that **no longer exists** — the reservation mechanism moved to billing/checkout_reservations.py and is manual/conflict-driven; the 5-minute bound is still reasonable on its own merits, but the "cheap because a job already exists" argument no longer holds.)
**ALTERNATIVE B — Within 1 minute:** same job, more often. Cost: more frequent scans.
**ALTERNATIVE C — Within 15 minutes:** cheapest. Scenario: a shift due to escalate at 9:00 reaches the next tier at 9:15 — near-start shifts may miss their window.
**Other / defer:** any bound is better than none; pick the cheapest that still works for urgent shifts.
**Sources:** `backend/shifts/base.py` (`get_queryset`), `backend/core/celery.py`, `backend/shifts/escalation.py`.
**Decision status:** OPEN · Oct 2026 rec A. Depends on GM22-01: the bound is meaningless until there are notices to deliver on time. Mechanics → GM-11/GM-23.

### GM22-12 · LA-Q08 — Fix before launch? Scheduled escalation only runs when someone loads a shift list. 🔴 code · gap SH-05 — CHANGED

> **Merged 22 Nov: asked once, as GM-11-Q04 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** same bug, now verified at head: shift escalation runs during shared shift-query handling, including list/detail requests, rather than a scheduled shift job. The only periodic escalation tasks in celery are the goods marketplaces'.

**ACTUAL TODAY — Web and Expo (same):** shift escalation runs during shared shift-query handling, including list/detail requests, rather than a scheduled shift job. Existing periodic escalation tasks cover goods marketplaces (and ethical); web and mobile both depend on browsing to trigger shift escalation.
**Scenarios:** as GM22-11, plus: a scheduled job is the precondition for every timed notice in this area (escalation notices, reminder timing, emergency repeats). Without it, notification timing promises cannot be kept.
**RECOMMENDED: A — Before launch.** Must be done before the first real booking. Rationale: scheduled release can stall whenever nobody browses.
**ALTERNATIVE B — Soon after launch:** within the first month. Scenario: early shifts escalate late until the job lands.
**ALTERNATIVE C — Not needed:** accept the risk or drop it.
**Sources:** `backend/shifts/base.py`, `backend/core/celery.py`, `backend/shifts/escalation.py`.
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-13 · PO-Q09 — Should escalation pause while an offer waits for an answer? 🟡 decision — CHANGED

> **Merged 22 Nov: asked once, as GM-11-Q02 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** there is still no pause rule. In practice escalation usually stops anyway, because any interest ever stops it — and an offer implies interest. But after a decline or expiry it never resumes, so the shift can sit unfilled.

**ACTUAL TODAY — Web and Expo (same):** no pause rule. Auto-escalation stops for good once anyone shows interest, so most shifts with a pending offer never escalate again, even after decline or expiry. Manual escalation has no interest check (the creator can force it — and is now prompted to do so on decline, GM22-01). Offer expiry is silent (GM22-02), so a resume-on-expiry rule would need the expiry event to exist first.
**Normal case:** offer pending → escalation paused, resumes on decline/expiry with a notice to the next tier (recommended, not current). **Edge case:** offer expires silently today (GM22-02) so resume must be tied to the expiry event, not to a notice. **Concurrency:** offer accepted at the same moment escalation fires (one winner, others told the shift is filled — **today the losers are not told**, GM22-02). **Denied role:** paused state must not leak to other applicants. **Payment:** none until acceptance. **Web/Expo:** pause/resume is backend state, both clients show it.
**RECOMMENDED: A — Pause; resume on decline or expiry.** No two workers race for one slot. Rationale: today escalation never resumes after a decline or expiry, so the shift can sit unfilled.
**ALTERNATIVE A — Keep current logic:** escalation stops at first interest and never resumes. Scenario: offer declined, shift stranded.
**ALTERNATIVE B — Keep escalating:** faster fill; more let-downs. Scenario: second worker is told about a shift while the first worker's offer is still open — then the first accepts and the second is disappointed.
**Other / defer:** pause now, decide resume-on-expiry separately.
**Sources:** `backend/shifts/escalation.py`, `backend/shifts/offers.py`, `backend/shifts/interest.py`.
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-14 · PO-Q12 — When does an anonymous pharmacy's name reach the worker? 🟠 decision — CHANGED (leak wider than Oct)

> **Merged 22 Nov: asked once, as GM-11-Q08 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** the worker never sees the name before accepting — the terms dialog omits it and accept notices say "Shift in &lt;suburb&gt;". But the name leaks in **three** places now, not one: the 12-hour reminder email, the shift-updated notice to all past applicants, and the not-selected notice after payment. The email code sets the pharmacy name unconditionally.

**ACTUAL TODAY — Web and Expo (same, backend templates):** the worker never sees the name before accepting: the terms dialog omits it and accept notices say "Shift in &lt;suburb&gt;". Cards stay anonymous after booking; the 12-hour reminder email names it (subject `Reminder: Your upcoming shift at {pharmacy.name}` + context). **Newly verified leaks:** `send_shift_updated_notifications` names the pharmacy to **all past applicants** (in-app ALERT "Shift updated: {pharmacy.name}" + email); `send_shift_not_selected_after_payment_notifications` names it to **non-selected applicants** (in-app ALERT "Shift filled: {pharmacy.name}" + email); `build_shift_email_context` sets `"pharmacy_name": shift.pharmacy.name` **unconditionally** (line 54) — no anonymization in the shared context builder. Interest/offer flows redact correctly (public = "A candidate", member = real name; `_get_pharmacy_display_name` anonymizes; location line redacts address for anonymous posts).
**Normal case:** agreement preview names the pharmacy, all earlier notices say "Anonymous Pharmacy — &lt;suburb&gt;" (recommended, not current). **Edge case:** the reminder email is the leak today: if reveal is set to "after payment", the reminder template must be fixed to stay anonymous until then. **Retry:** reminder sent twice, both must redact the same way (no dedup exists). **Denied role:** a non-booked applicant must never get a notice naming the pharmacy — **today non-selected applicants do get one**. **Payment:** name reveal and payment confirmation are linked in options B/C. **Web/Expo:** email templates are shared, so the fix is backend; in-app notices on both clients must redact identically; push carries title/body verbatim, so a push title naming the pharmacy leaks on the lock screen.
**RECOMMENDED: A — In the agreement preview.** Before the worker accepts. Rationale: today a worker agrees to work for an unknown business and learns the name by accident in an email.
**ALTERNATIVE A — Keep current logic:** worker accepts blind; name surfaces only in the reminder email (and, as now verified, in the updated/not-selected notices). Scenario: worker turns up and only then learns which pharmacy it is — a safety issue for a lone worker.
**ALTERNATIVE B — After reservation:** worker accepts blind. Scenario: name revealed once the pharmacy commits to pay.
**ALTERNATIVE C — After payment confirms:** worker commits blind. Scenario: strongest anonymity for the pharmacy, weakest position for the worker.
**Other / defer:** reveal in the agreement preview, but keep cards anonymous everywhere else.
**Sources:** `backend/shifts/emails.py` (`build_shift_email_context:54`, `send_shift_payment_finalized_notifications:289`, `send_shift_not_selected_after_payment_notifications:203`, `send_shift_updated_notifications:404`), `backend/shifts/tasks.py` (`send_shift_reminders`), `backend/shifts/announcements.py` (`_get_pharmacy_display_name`).
**Decision status:** OPEN · Oct 2026 rec A. **Notification leak (code aspect):** whatever the owner picks, the three naming paths are defects against every option except "reveal earlier" — fix the templates to match the decision.

### GM22-15 · AG-Q03 — Should both sides get a PDF copy of the agreement? 🟡 decision — NOT RE-VALIDATED

> **Merged 22 Nov: asked once, as GM14-Q06 in GM-14.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** Oct 2026 said no PDF or emailed copy exists. That was not re-checked in this pass — no PDF code was encountered in the traced files, but it was not specifically searched.

**ACTUAL TODAY (Oct 2026, NOT re-validated):** Not built yet. (No PDF or emailed copy exists.)
**Normal case:** confirmation → PDF emailed to worker + pharmacy, downloadable in-app. **Edge case:** agreement changed after confirmation (re-consent, GM22-06 family — new PDF version needed). **Denied role:** PDF must go only to the two parties, never to other applicants. **Payment:** the PDF is the record the fee/refund dispute will be argued from (F01). **Web/Expo:** PDF is backend-generated, both clients download the same file.
**RECOMMENDED: A — Emailed PDF once confirmed.** Also downloadable in the app. Rationale: Relief Buddy emails both parties a PDF after acceptance; LocumCo sends formal confirmation with contract terms. Benefit: durable proof for pay/terms disputes; risk: build cost, email deliverability.
**ALTERNATIVE B — In-app view only:** less to build. Scenario: worker needs the terms during a dispute but can't open the app.
**Other / defer:** in-app view at launch, emailed PDF in the next release.
**Sources:** Oct 2026 only — **not re-validated**.
**Decision status:** OPEN · Oct 2026 rec A.

### GM22-16 · LA-P02 — Fix before launch? AHPRA cancellations bypass the cancellation policy and notices. 🔴 code — CHANGED (partial)

> **Merged 22 Nov: asked once, as GM17-Q11 in GM-17.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** the notice half is fixed — an AHPRA suspension now tells the worker (in-app + email), the admins (email), and the affected pharmacies (member-suspension notice). Whether the cancellation itself now follows the ordinary policy, fees and refunds was not checked.

**ACTUAL TODAY — Web and Expo (same):** `announce_suspension`: in-app notice + email to the user, admin email (raw `send_mail`), WS broadcast `ahpra.suspended`. `announce_member_suspension`: pharmacy owners/admins + org admins told a team member's registration changed status. **Policy half NOT re-traced:** whether the cancellation routes through the ordinary cancellation policy/fees/refunds (LA-P01: shift stuck "waiting for payment") was not checked — the cancellation code was not read.
**Normal case:** AHPRA cancellation → same notices as an ordinary cancel (worker, owner, managers per GM22-03, channels per GM22-04). **Edge case:** cancellation lands while a reservation awaits payment (see LA-P01: shift stuck "waiting for payment" — not re-checked). **Denied role:** the notice must not disclose the AHPRA reason beyond what the worker is entitled to know. **Payment:** fee/refund treatment must match F01/P07, not be silently skipped.
**RECOMMENDED: A — Before launch.** Fix as part of merging both PRs. Rationale: two cancellation paths give different outcomes for the same booking and break the agreed policy.
**ALTERNATIVE B — Soon after launch:** ship first, fix in the next release. Scenario: an AHPRA-cancelled booking in week one leaves the worker uninformed and the money state wrong.
**ALTERNATIVE C — Not needed:** leave as it is.
**Sources:** `backend/onboarding/verification/state.py` (`announce_suspension:292`, `announce_member_suspension:336`); cancellation code — **not re-traced**.
**Decision status:** OPEN · Oct 2026 rec A.

---

### NEW questions — no #184 ancestor (ACTUAL TODAY: verified at head `97c4543e` unless noted)

### GM22-17 · NEW — Is there an in-app notification centre, and what does it do? 🟠 decision — TRACED

**Plain English:** yes — on Expo and on Vite web, but not on Next. The centre is a paginated list fed by one backend API, with read/unread state. It never expires notices, nothing is pinned, and opening the list marks what you see as read — including money and cancel notices.

**ACTUAL TODAY — Vite:** TopBar bell with dropdown, WebSocket live updates (`ws/notifications/`), mark-read, `notification_id` deep links; **the web bell excludes chat notifications** from its list/count. **ACTUAL TODAY — Next:** **no notification UI found** (no centre, no bell, no shared-core notifications usage in `landing_next` — default-branch search, §0 caveat). **ACTUAL TODAY — Expo:** full centre (`NotificationsScreen`): paginated list, **auto-marks visible unread as read on every focus**, per-item mark-read, tap routing (chat room → message detail; shift → shift route; calendar → calendar route), pull-to-refresh, load-older, unread dot/badge. **Backend:** `NotificationViewSet` read-only, per-user, paginated 20/max 100, `mark-read` action; one shared-core API (`getNotifications`, `markNotificationsAsRead`) for all clients. **No expiry; no pinning; no offline behaviour traced.**
**Normal case:** offer arrives → bell badge + list entry. **Edge case:** 100 old notices (paging exists, expiry does not — the list grows unboundedly). **Retry:** same event delivered twice (dedup by event id — **none exists**, GM22-26). **Denied role:** feed must be strictly per-user, per-tenant — verified at the API level (other user's detail 404, mark-read cannot touch others, `test_api.py`). **Payment:** payment notices must persist until read — **today they are marked read by opening the list**. **Web/Expo:** the feed is one backend API; the screens differ, the contents must not — **today Next has no screen at all and Vite excludes chat**.
**RECOMMENDED:** one persisted in-app inbox on all three clients, fed by the same backend feed; read/unread state; **money/cancel notices pinned until read**. Rationale: without a centre, in-app notices are fire-and-forget and a worker who misses a push has no second place to look; without pinning, a money notice can be marked read by accident. Severity 🟠.
**ALTERNATIVE A — Keep whatever exists:** centre on Vite + Expo, none on Next. Scenario: Next user misses an offer because there is nowhere to re-read it.
**ALTERNATIVE B — Push + email only, no centre:** less to build. Scenario: worker with push off and a full inbox has no reliable record.
**ALTERNATIVE C — Centre on web only at launch, Expo later:** parity gap, recorded as such — **inverted from reality today** (Expo has the centre, Next does not).
**Other / defer:** centre now, read-receipts and expiry later.
**Sources:** `backend/notifications/views.py`, `backend/notifications/serializers.py`, `frontend_web/src/components/TopBarActions.tsx`, `frontend_mobile/features/notifications/NotificationsScreen.tsx`, `frontend_web/shared-core/src/domains/notifications/api.ts`, `backend/notifications/test_api.py`.
**Decision status:** OPEN.

### GM22-18 · NEW — How do Expo push notifications work, and what happens when permission is denied? 🔴 decision — TRACED

**Plain English:** push is wired end-to-end — token, per-device storage, permission prompt, quiet hours, per-type opt-outs. But if the worker says no to permission, the app just gets no token and never explains or retries; push failures are logged and forgotten; and push text is the notification text verbatim, so it shows on the lock screen.

**ACTUAL TODAY — Expo:** `expo-notifications`, handler banner+list **true**, sound **false**, badge **false**. `registerForPushNotificationsAsync`: web → null; non-device → null; permission requested if not granted; **denied → null (no token, no retry prompt, no in-app explanation traced)**; requires EAS projectId (throws if missing). Token registered once per session (`AuthContext`, `registeredPush` flag) via shared-core `registerPushDeviceToken`; registration failures logged only, never wipe auth. **Backend:** `DeviceToken` (user FK, platform ios/android/web, token unique, `active`); upsert by token, reassigns token to current user; deleted on logout for that session. `_deliver_notification`: WS broadcast + Expo push POST `https://exp.host/--/api/v2/push/send` (sound default, data = payload) **if** `push_allowed_for_notification`. Push policy: per-type opt-outs (`push_messages`/`push_tasks`/`push_work_notes`/`push_alerts`, default True); **ALERTs bypass quiet hours**; non-alerts held during quiet hours (22:00–07:00, off by default); invalid timezone → push blocked. **Push failures logged only, NO retry, NO fallback. No dedup. Push title/body = notification title/body verbatim.**
**Normal case:** worker grants permission → token stored → offer pushes. **Edge case:** permission denied, token revoked, app reinstalled, two devices (both must get it, or one — **undecided, not traced**). **Retry:** push provider fails (retry? fall back to email? — **neither exists**). **Concurrency:** same event pushed twice (**no dedup**). **Denied role:** a push must never carry another tenant's data in its visible text — **today push text is verbatim, including pharmacy names**. **Payment:** payment-failure push must not carry amounts on a locked screen (or must — owner to decide; current payment-notice titles carry no amounts, but bodies are verbatim). **Web/Expo:** push is Expo-only; the rule must state what web users get instead.
**RECOMMENDED:** push for urgent/time-sensitive events (offer, expiry warning, cancel, emergency cancel, 2h reminder); email as the durable fallback for money/cancel; if permission is denied, say so in-app and fall back to email + in-app — never silently send nothing. Severity 🔴: push is the only fast channel for near-start events (GM22-07).
**ALTERNATIVE A — Keep whatever exists:** push as wired. Scenario: push works for one persona and silently fails for others (denied permission, revoked token, failed delivery — all silent today).
**ALTERNATIVE B — Email + in-app only, no push at launch:** simplest, but near-start alerts (GM22-07) cannot be delivered fast enough.
**ALTERNATIVE C — Push for everything:** noise, opt-outs, and workers who deny permission get nothing.
**Other / defer:** push for offers/cancels now; push for reminders and match alerts later.
**Sources:** `frontend_mobile/utils/pushNotifications.ts`, `frontend_mobile/context/AuthContext.tsx`, `backend/users/models.py` (`DeviceToken`), `backend/notifications/services.py` (`_deliver_notification`, `push_allowed_for_notification`), `backend/notifications/views.py` (`DeviceTokenViewSet`).
**Decision status:** OPEN.

### GM22-19 · NEW — Who sends the emails, and what happens when one fails? 🟠 decision/code — TRACED

**Plain English:** Zoho SMTP, one sender identity from an env var, queued sending through Celery with retries — but after 5 retries the email is dropped with only a log line, and there is no bounce handling at all. Every email also creates an in-app notice automatically, even if the email itself never arrives.

**ACTUAL TODAY — Backend:** Zoho SMTP (`smtp.zoho.com:587`, TLS), Django SMTP backend, `DEFAULT_FROM_EMAIL` env (value not verified). `send_async_email` → Celery **"email" queue, rate_limit 30/m**, autoretry on Exception, backoff, max 600 s, jitter, **max_retries=5, then dropped (no dead-letter/fallback traced)**; failure only logged; eager/debug → synchronous send. `prepare_email_message` renders templates, inline logo, **redacts otp/code/token/password in logs**. **No bounce handling anywhere in the traced files.** **Auto-notification rule:** every email without explicit `notification=` and without `suppress_auto_notification=True` auto-creates an in-app notice (title = subject, body = `""`, action_url from context or `/dashboard`, payload `notification_kind=email_notification` + template name), dispatched on_commit, **independent of email delivery success**. No direct `send_mail` in `backend/billing` or `backend/shifts` — all mail flows via `send_async_email`, **except** the AHPRA admin email (raw `send_mail`, synchronous).
**Normal case:** email queued, delivered, logged. **Edge case:** worker's mailbox full / address mistyped (who finds out? — **nobody today**: no bounce handling, failure only logged). **Retry:** transient provider failure (retry with backoff, cap 5 attempts, then dropped). **Denied role:** templates must not include other tenants' data — **today `build_shift_email_context` sets `pharmacy_name` unconditionally (GM22-14)**. **Payment:** money emails need delivery proof — **none exists**. **Web/Expo:** provider is backend, identical for both.
**RECOMMENDED:** one transactional provider, one sender identity, versioned templates per event, queued sending (never blocking the request), logged delivery/failure, and in-app fallback when email fails for a money/cancel event. Severity 🟠: a lost payment/cancel email is a dispute with no paper trail. (Note: queued sending and the in-app fallback **already exist** via the auto-notification rule; what is missing is delivery proof, bounce handling, and a dead-letter path.)
**ALTERNATIVE A — Keep whatever exists:** queued sending, retry max 5 then dropped, no bounce handling. Scenario: a bounced cancel email means the worker never learns the shift is off (the in-app notice still exists — but only if they open the app).
**ALTERNATIVE B — No retry, fire-and-forget:** cheapest. Scenario: a transient provider outage loses a batch of payment emails.
**Other / defer:** provider + templates now; bounce handling later.
**Sources:** `backend/core/settings.py` (email + beat + routes), `backend/users/tasks.py` (`send_async_email`, `send_email_task`), `backend/users/task_dispatch.py` (auto-notification rule), `backend/onboarding/verification/state.py:294` (raw `send_mail`).
**Decision status:** OPEN.

### GM22-20 · NEW — What notification preferences can a worker (and a pharmacy) set — including quiet hours? 🟡 decision — TRACED

**Plain English:** there are two preference systems, not one: a per-type push switchboard with quiet hours, and the single match-alerts switch on availability rows. There are no per-event preferences, no digest, and nobody has decided whether money/cancel notices can ever be switched off.

**ACTUAL TODAY — Web and Expo (same, one backend record):** `NotificationPushPreference` (OneToOne user): `push_messages` / `push_tasks` / `push_work_notes` / `push_alerts` **default True**; `quiet_hours_enabled` **default False**; quiet **22:00–07:00**; timezone default **Australia/Brisbane**; only 7 Australian zones supported. GET/PATCH own prefs via `NotificationPushPreferenceView`; shared-core `get/updateNotificationPushPreferences`. **ALERTs bypass quiet hours** (explicit alert opt-out still honoured). Plus the single `notify_new_shifts` switch on availability rows (F18). Whether a Vite/Expo settings screen exposes the push preferences was **not traced**. No per-event preference, no channel preference per event, no digest/frequency control.
**Normal case:** worker turns off match alerts, still gets offer/cancel notices (are those ever opt-out-able? — owner must say; safety vs choice). **Edge case:** quiet hours set 10pm–6am, shift cancelled at 11pm for a 7am start (must the email still send? recommended yes, push held — **today the email sends regardless; the push is held unless the notice is an ALERT**). **Retry:** preference changed after a notice was queued (which version wins? — no queue exists for in-app/push; emails are queued in Celery and use the preference only at push time, not at email time). **Denied role:** preferences are per-user, never per-pharmacy-imposed on workers. **Payment:** payment notices must not be switchable off by the payer (undecided). **Web/Expo:** preferences must be one backend record, shown on both clients.
**RECOMMENDED:** keep one switch at launch (per GM22-08), add quiet hours only if night alerts prove to be a problem — BUT money/cancel notices must ignore quiet hours (a cancel at 2am still matters at 6am, and must be waiting as email + in-app). Severity 🟡. (Note: quiet hours **already exist** and ALERTs already bypass them — the decision is now whether money/cancel notices are always sent as ALERTs, and whether any of them can be switched off.)
**ALTERNATIVE A — Keep current logic:** the per-type switches + quiet hours + single match switch. Scenario: worker who wants match alerts but not 2am urgent ones cannot separate them (same tension as GM22-08).
**ALTERNATIVE B — Full preference centre at launch:** per event × per channel + quiet hours. Scenario: most users never open it; the build delays launch.
**ALTERNATIVE C — Quiet hours only, no per-event switches:** middle ground. Scenario: urgent alerts queue until morning — dangerous for a shift starting at 7am (mitigated today by the ALERT bypass).
**Other / defer:** preferences now, quiet hours after launch feedback (quiet hours already exist — the defer would be about exposing them in the UI).
**Sources:** `backend/notifications/models.py` (`NotificationPushPreference`), `backend/notifications/views.py`, `backend/notifications/services.py` (`push_allowed_for_notification`), `frontend_web/shared-core/src/domains/notifications/api.ts`.
**Decision status:** OPEN.

### GM22-21 · NEW — Master event catalogue: which event notifies whom, on which channel? 🔴 decision — TRACED (draft table now filled)

**Plain English:** the draft table in §1c is now filled from the trace — every event, its recipients, and its channel, with the "nobody" and "unknown" rows made explicit. The owner needs to adopt it as the binding rule so no feature invents its own recipients again.

**ACTUAL TODAY:** no single catalogue exists in code; each feature picks its own recipients (AG-Q09) and channels (AG-Q10). The §1c table is the collected evidence: escalation → nobody; offer expiry → nobody; reservation expiry → nobody; refunds → nobody; ratings → nobody; Pills spend → nobody; reconciliation notices → in-app only; payment confirmation → in-app + email; AHPRA suspension → in-app + email + admin email. Unknown rows remaining: cancel/cover/replace (SH-01 not re-traced), invoice delivery (in-app half not read), hub/roster/calendar/membership notices (default-branch search only).
**Normal case:** offer → in-app + push + email (per GM22-04). **Edge case:** an event with two audiences on different channels (e.g. worker gets push, manager gets email). **Concurrency:** two events for one shift in one minute (offer + edit) must not produce contradictory notices (no dedup exists). **Denied role:** the catalogue must state the tenant boundary per row.
**RECOMMENDED:** adopt the §1c table as the draft, fill the Unknown rows from the trace, and make it the binding rule: any new event must add a row before it ships. Severity 🔴: this is the decision that stops the patchwork.
**ALTERNATIVE A — Keep per-feature choices:** each feature keeps deciding. Scenario: the next feature (e.g. Pills) invents a third variant of the same notice.
**ALTERNATIVE B — Minimal catalogue:** only money + cancel + offer events get rows; the rest stay per-feature. Scenario: reminders and ratings stay inconsistent.
**Other / defer:** catalogue for external-booking events now; roster/chat/Pills rows later.
**Sources:** §1c table (all files cited there).
**Decision status:** OPEN. **Do not ask it standalone before GM22-04** — the catalogue records the answers to GM22-01–20.

### GM22-22 · NEW — What Pills / rewards notifications exist (earn, spend, expiry, low balance)? 🟡 decision — TRACED

**Plain English:** only one Pills notice exists: when you earn pills from a referral, you get an in-app alert and an email. Spending pills is silent, and there is no low-balance or expiry warning at all.

**ACTUAL TODAY — Web and Expo (same):** referral award → in-app ALERT "Congrats, you earned {delta} pills" (action_url `/dashboard/owner/pills`) + email `emails/pill_reward_awarded.html`, both wrapped in try/except pass (**silent failure**). Spend (`spend_pills_for_shift_post`) → ledger entry only, **no notice**. **No low-balance / expiry / renewal notice traced** anywhere in the notification system. (GM-16 owns subscriptions/Pills/fees; GM-22 owns only the *notices* about them.)
**Normal case:** Pills expire in 7 days → warning (recommended, not current). **Edge case:** Pills expire the day a booking needs them (which event wins? — undecided; today neither event notifies). **Retry:** duplicate earn notice (dedup by transaction — **no dedup exists**). **Denied role:** a worker must never see a pharmacy's Pills balance (the award notice goes to the referrer only, with their own balance). **Payment:** Pills spend is money movement, so the notice is a financial record (email) — **today spend is silent**. **Web/Expo:** balance display and notices must agree on both clients.
**RECOMMENDED:** email + in-app for money-moving Pills events (purchase, expiry of paid credit, failed renewal); in-app only for earn/spend of reward Pills; low-balance warning before a booking that needs Pills. Severity 🟡; rises to 🔴 if Pills are required to post or book.
**ALTERNATIVE A — No Pills notices at launch:** users discover balances by opening the app. Scenario: pharmacy's Pills expire unused, or a booking fails for lack of Pills with no warning.
**ALTERNATIVE B — Email everything Pills-related:** noise for a low-value event.
**ALTERNATIVE C — In-app only:** cheap; missed by infrequent users.
**Other / defer:** decide after GM-16 settles what Pills are and when they move; GM-22 only records the notice rule.
**Sources:** `backend/rewards/services.py` (`_send_pill_award_message:207`, `spend_pills_for_shift_post:367`), `backend/rewards/models.py` (`PillRewardRule`, `PillReferralCode/Event`, `PillLedgerEntry`).
**Decision status:** OPEN.

### GM22-23 · NEW — Which payment / invoice / refund events notify whom? 🟠 decision — TRACED

**Plain English:** payment confirmation notifies both sides (in-app + email). But the failure paths are patchy: reconciliation problems are in-app-only, refunds are completely silent, and a cancellation-penalty payment produces no notice at all. Amounts never appear in a push title — but push bodies are verbatim, so whatever is in the body shows on the lock screen.

**ACTUAL TODAY — Web and Expo (same):** payment confirmed → `send_shift_payment_finalized_notifications` (worker + owner in-app + email; not-selected workers get in-app ALERT "Shift filled: {pharmacy.name}" + email). Binding error / deleted shift → in-app ALERT to owner **only, no email** ("Shift payment needs reconciliation" / "Shift payment needs a refund"). **Refund → silent** (`handle_charge_refunded` updates the ledger only). **Cancellation-penalty payment → no notice traced.** Invoice issue reported → in-app ALERT to the invoice owner ("Issue reported on invoice #N"). Invoice delivery email exists as a beat route (`invoicing.tasks.deliver_invoice_email`); whether it also creates an in-app notice was **not read**. Amounts: payment-notice titles carry no amounts; email bodies may carry amounts (not verified); push carries title/body verbatim. Webhook redelivery is idempotent for payment (one ledger debit) — **but there is no dedup on the notice side** (GM22-26).
**Normal case:** payment confirmed → email receipt to pharmacy, in-app to worker. **Edge case:** payment arrives after expiry (F04: no rebooking — the notice must say so plainly, not look like a confirmation; **not traced**). **Retry:** webhook delivered twice (idempotent — one ledger entry; the notice is sent on commit inside the finalize path, so a replay is a no-op — but this was not verified as a notice-level guarantee). **Denied role:** amounts must never go to the wrong pharmacy. **Payment:** the notice IS the financial record, so delivery failure matters (GM22-19). **Web/Expo:** same emails, both clients show the same invoice state.
**RECOMMENDED:** email (durable record) + in-app for every money movement, to both sides as applicable; amounts in email, never in a push preview. Severity 🟠; 🔴 for refunds/credits (F04: pharmacy chooses credit or refund after approved review — someone must tell them the outcome).
**ALTERNATIVE A — Email only for refunds/credits; in-app for the rest.** Scenario: worker doesn't learn a payment failed until the reservation expires.
**ALTERNATIVE B — In-app only:** no durable record for disputes.
**Other / defer:** payment-success notices now; refund/credit notices with the refund build.
**Sources:** `backend/billing/payment_events.py` (`handle_payment_checkout:19`, `handle_charge_refunded:126`), `backend/shifts/emails.py` (`send_shift_payment_finalized_notifications:289`), `backend/invoicing/views.py` (invoice-issue notice).
**Decision status:** OPEN. Overlaps GM-16/GM-17 (fees/invoices) — GM-22 owns only the notices.

### GM22-24 · NEW — Is either side told when a rating is left, or when a reliability badge / incident is applied? 🟡 decision — TRACED (ratings) / NOT RE-VALIDATED (incidents)

**Plain English:** nobody is told when a rating is left — the ratings code contains no notification call at all. A 1-star rating just appears on a talent card. Whether incident, warning or suspension notices exist was not traced.

**ACTUAL TODAY — Web and Expo (same):** `backend/ratings/views.py` contains **no `notify` / `announce` / `send_async_email` at all** — no rating notification exists. Ratings allowed for any assignment ever, incl. future, unworked, internal-employee shifts (Oct 2026 eligibility claim, not re-traced). Reliability badge / incident ladder (P10) consequences: **not traced** (incident code not read).
**Normal case:** rating received → in-app "you have a new rating" (recommended, not current). **Edge case:** rating for an unworked shift (SH-10: eligibility too loose — a notice would advertise a possibly unfair rating). **Denied role:** a rater's identity must follow the same reveal rules as the talent board (TB-02, not re-traced). **Payment:** none, but a suspended worker loses income, so the notice must state the appeal path (CX-Q23/Q24, not re-traced). **Web/Expo:** same feed both clients.
**RECOMMENDED:** in-app notice when a rating is received (no score in a push preview — open the app to see it); email + in-app when an incident/warning/suspension is applied, because it restricts future work (P10: 14/28/56 days, then permanent after human review). Severity 🟡; 🔴 for suspensions (a worker who doesn't know they're suspended keeps applying and keeps being rejected).
**ALTERNATIVE A — No rating notices:** ratings appear silently on talent cards. Scenario: worker discovers a 1-star rating weeks later from a pharmacy.
**ALTERNATIVE B — Full detail in the notice:** score + comment pushed. Scenario: a harsh comment arrives as a lock-screen push — distress and privacy risk.
**Other / defer:** incident/suspension notices now (they restrict work); rating-received notices later.
**Sources:** `backend/ratings/views.py` (absence verified); incident/badge code — **not traced**.
**Decision status:** OPEN.

### GM22-25 · NEW — Are verification / AHPRA status changes notified (granted, lapsed, suspended, revoked)? 🟠 decision — TRACED (suspension) / NOT RE-VALIDATED (grant/lapse)

**Plain English:** suspension is now notified — the worker gets an in-app notice and an email, the admins get an email, and the affected pharmacies get a member-suspension notice. But grant and lapse notices were not traced, and the Oct claim that Verified stays true after a lapse was not re-checked.

**ACTUAL TODAY — Web and Expo (same):** `announce_suspension`: in-app notice + email to the user ("Your AHPRA registration"), admin email via raw `send_mail`, WS broadcast `ahpra.suspended`. `announce_member_suspension`: pharmacy owners/admins + org admins told a team member's registration changed status. **Grant/lapse notices: not traced** (no grant notice found in the traced files; lapse enforcement per GM-02). AHPRA expiry is saved but never enforced at apply/accept (ON-02, Oct claim not re-traced); no scheduled re-check was traced (not re-checked).
**Normal case:** AHPRA lapses → worker told, future bookings flagged, booked shifts re-checked (recommended, not current for lapse). **Edge case:** lapse discovered mid-shift (who is told, and does the shift stop? — undecided). **Denied role:** registration detail is the worker's private data; the pharmacy gets "no longer verified for this role", not the register detail. **Payment:** a cancelled booking from a lapsed registration follows LA-P02, not silent (policy half not re-traced). **Web/Expo:** status must update on both clients at the same time.
**RECOMMENDED:** email + in-app to the worker on any status change, with the concrete consequence (which bookings are affected, what to do); notice to affected pharmacies when a booked worker loses registration. Severity 🟠 (safety-critical: an unregistered pharmacist must not work a shift).
**ALTERNATIVE A — Keep current logic:** suspension notices as built; no grant/lapse notices. Scenario: pharmacist's registration lapses, Verified stays true, they keep getting match emails for shifts they must not work (Oct claim, not re-checked).
**ALTERNATIVE B — Worker only, never the pharmacy:** privacy. Scenario: pharmacy learns only when the worker fails to turn up.
**Other / defer:** worker notices now; pharmacy notices after the privacy rule is set.
**Sources:** `backend/onboarding/verification/state.py` (`announce_suspension:292`, `announce_member_suspension:336`); GM-02 owns verification semantics.
**Decision status:** OPEN.

### GM22-26 · NEW — How are duplicate, failed and stale notifications handled — and is there an audit log? 🟠 code/decision — TRACED

**Plain English:** there is no dedup, no push retry, no staleness voiding, and no audit log — only log lines. Email has Celery retries (5, then dropped). The one strong point is test coverage: the delivery-isolation tests prove a failure for one recipient never blocks the next, and a rollback discards the notice.

**ACTUAL TODAY — Backend:** **no dedup key anywhere** — duplicate `notify_users` calls = duplicate rows + pushes. Push failures logged only, **no retry, no fallback**. Email retry via Celery autoretry (max 5, max 600 s, jitter) then **dropped, no dead-letter**. **No audit log** (only logs). **No staleness voiding** (a reminder for a changed time is still delivered). **No sent-state** on reminders (double beat run would duplicate). Isolation is tested, not accidental: `test_delivery_isolation.py` — broadcast failure does not suppress counter/push/next recipient; push network failure does not suppress next recipient; Expo HTTP/ticket failure observed without mutating durable rows; commit delivery waits and rollback discards row + callbacks; channel DB error isolated from durable reads; persistence errors still propagate. `test_api.py` — mark-read cannot touch other users' notifications; other user's detail 404.
**Normal case:** one event → one notice per recipient (recommended, not current). **Edge case:** event fires, then the underlying shift is deleted/changed before delivery (void or correct the notice — **neither exists**). **Retry:** provider outage (queue, back off, cap, alert admin — **email has backoff+cap; push has nothing; no admin alert exists**). **Concurrency:** two processes send the same notice (dedup key must be enforced in the store, not in memory — **none exists**). **Denied role:** the audit log itself must be tenant-scoped — **no audit log exists**. **Payment:** a duplicated payment notice looks like a double charge.
**RECOMMENDED:** one notice per (event, recipient) — dedup key on the event id; failed sends retried with backoff and logged; stale notices (e.g. reminder for a changed time) voided, not delivered; an admin-visible log of sent notices for disputes. Severity 🟠.
**ALTERNATIVE A — Best effort, no dedup/log:** cheapest. Scenario: worker gets the same offer notice three times and stops trusting notices.
**ALTERNATIVE B — Log only, no dedup:** disputes can be checked, duplicates still happen.
**Other / defer:** dedup now (it is cheap); audit log after launch.
**Sources:** `backend/notifications/services.py` (no dedup, push failure handling), `backend/users/tasks.py` (email retry), `backend/notifications/test_delivery_isolation.py`, `backend/notifications/test_api.py`.
**Decision status:** OPEN.

### GM22-27 · NEW — Can a notification leak one tenant's information to another (wrong pharmacy, wrong worker, wrong role)? 🟠 decision/code — TRACED (mechanism) / NOT RE-VALIDATED (per-event negative tests)

**Plain English:** recipient checks happen at trigger time in each call site — never re-checked at send time. Three leaks are verified (GM22-14): the reminder, the shift-updated notice, and the not-selected notice all name the pharmacy. The service-level negative tests are strong; per-event negative tests were not traced.

**ACTUAL TODAY — Backend:** `notify_users` filters to active users only (`is_active=True`); each call site builds its own recipient list (membership/role checks at trigger time — e.g. `notify_shift_managers` = created_by + pharmacy owner + active PharmacyAdmins + org admins who can manage the pharmacy). **No send-time re-check traced** — a recipient whose access was revoked between trigger and send still gets the notice. **Verified leaks:** anonymous pharmacy named in the reminder email (subject + context), the shift-updated notice (all past applicants), and the not-selected notice (non-selected applicants); `build_shift_email_context` sets `pharmacy_name` unconditionally. **Push text = title/body verbatim** (lock-screen exposure). **Negative tests at service level (verified):** `test_api.py` — other user's detail 404, mark-read cannot touch other users; `test_delivery_isolation.py` — per-recipient isolation, active-recipient filter. **Per-event negative tests (wrong tenant gets nothing, all channels incl. push text): not traced.**
**Normal case:** notice sent only to eligible recipients. **Edge case:** recipient's access revoked between queue and send (still gets it today). **Denied role:** the test case — chain-B manager must receive nothing about chain-A's shift (not traced per event). **Payment:** amounts in a notice to the wrong pharmacy are a privacy breach (payment-notice titles carry no amounts today; email bodies not verified). **Web/Expo:** push text is visible on a locked screen, so it must carry less detail than the in-app notice (today it carries the same text verbatim).
**RECOMMENDED:** every notice re-checks recipient eligibility at send time (role, tenant, verification, audience tier) — never trust the list built at trigger time; add a negative test per event (wrong-tenant user gets nothing). Severity 🟠; 🔴 for anonymous posts and for payment amounts.
**ALTERNATIVE A — Trust the trigger-time list:** simpler. Scenario: worker leaves a pharmacy between trigger and send, still gets its internal notice.
**Other / defer:** re-check at send time for cancel/money notices now; for match alerts later.
**Sources:** `backend/notifications/services.py` (`notify_users`), `backend/shifts/notifications.py` (`notify_shift_managers`), `backend/shifts/emails.py` (leaks), `backend/notifications/test_api.py`, `backend/notifications/test_delivery_isolation.py`.
**Decision status:** OPEN.

### GM22-28 · NEW — Do chat / hub messages notify, and where does GM-22 end and GM-20 (Chat/Hubs) begin? 🟡 decision — TRACED (boundary)

**Plain English:** chat does notify — every message creates an in-app notice (type MESSAGE) with a 200-character preview, and push follows. But the two clients disagree: the Vite bell excludes chat notices, the Expo list includes them. Hub notices exist as call sites but were not read at head. The boundary decision is still open.

**ACTUAL TODAY — Backend:** `chat/signals.py` calls `notify_users` on every message: type MESSAGE, title = sender name or "New message", body = preview ≤200 chars, per-role chat action_url, payload conversation_id/roomId/message_id/sender. **Vite bell excludes chat notifications** from its list/count; **Expo list includes them** (message icon + chat routing). Hub: `notify_users` call sites exist in `pharmacy_hub/notifications.py` + `posts.py` (default-branch search; **content at head NOT verified**). One unread count: **not verified** — Vite bell count vs Expo badge were not compared as a single count.
**Normal case:** chat reply → one push, no duplicate event notice. **Edge case:** chat about a shift that is then cancelled (the cancel notice and the chat must agree — cancel path not re-traced). **Denied role:** hub membership must gate hub notices exactly as it gates hub access (not verified at head). **Web/Expo:** unread state must sync across clients (shared backend feed; Vite excludes chat from its bell, so the counts differ by client today).
**RECOMMENDED:** GM-20 owns chat delivery and its own unread/notify behaviour; GM-22 owns the *cross-cutting* rules that chat must follow (channel rule GM22-04, tenant check GM22-27, dedup GM22-26, quiet hours GM22-20). One unread count, not two competing badges. Severity 🟡.
**ALTERNATIVE A — Chat notifies independently:** two systems, two badges. Scenario: worker gets a push for the chat message and another push for the "offer" event about the same shift.
**ALTERNATIVE B — Chat never notifies:** messages are found only by opening the app. Scenario: a time-critical chat ("can you start at 7 not 9?") is missed.
**Other / defer:** boundary decision now; chat notification behaviour with GM-20.
**Sources:** `backend/chat/signals.py`, `frontend_web/src/components/TopBarActions.tsx` (bell excludes chat), `frontend_mobile/features/notifications/NotificationsScreen.tsx` (chat routing); hub files — default-branch search only.
**Decision status:** OPEN. Boundary question for GM-20; do not answer here beyond the boundary.

---

## Part D — SINGLE first decision question to ask the owner first

### GM22-04 · AG-Q10 — Which channels carry those notices?

**Ask this first, before any other GM-22 question.** Every other notification decision depends on it: recipient lists (GM22-03) are meaningless without knowing whether the notice is a push, an email or an in-app entry; reminder timing (GM22-05/06) depends on whether push exists; emergency alerts (GM22-07) are only possible if push is the fast channel; and the Pills/payment/rating notices (GM22-22–24) all need a channel assigned. It is also the oldest open channel decision (D07, Oct 2026) and its Oct 2026 recommendation is clear — and now verified against current code: the channels exist, the per-event map does not.

**Question (plain English):** When the app needs to tell someone something — an offer, a payment, a cancellation, a reminder — how should it reach them? On their phone as a push message, as an email, as a message inside the app, or some mix? And which kinds of news are important enough to always get an email, so there is a lasting record?

**ACTUAL TODAY (verified at head `97c4543e`):** In-app, push and email exist with concrete rules — in-app centre on Vite (bell, WS live) and Expo (full centre), **none on Next**; push Expo-only with per-type opt-outs and quiet hours (ALERTs bypass); email via Zoho SMTP through a Celery queue (retry max 5, then dropped, no bounce handling); every email auto-creates an in-app notice (title = subject, empty body). Each feature still picks its own channels: offer/confirmation send in-app + email; reminders send email + auto in-app (push only outside quiet hours); reconciliation/refund-required notices are **in-app only**; refunds are **silent**.

**Options (in #184 format):**

| Key | Option | Detail |
|---|---|---|
| **KEEP** | Keep current logic | Each feature keeps choosing its own channels. |
| **A ★ recommended** | In-app and push; email for money/cancel | Email only when it matters. |
| **B** | Email everything | Inbox noise. |
| **C** | In-app only | Easy to miss. |
| **Other** | Describe (e.g. add SMS; different split) | — |
| **Defer** | Decide later | Record what stays undecided and what ships meanwhile (today's patchwork). |

**Recommendation: A — In-app and push; email for money/cancel.** Rationale: today there is no rule, so some money and cancel events lack a durable email (reconciliation notices are in-app-only, refunds are silent) and reminders lack push. Push is the only channel fast enough for near-start events; email is the only channel that leaves a record a fee or refund dispute can rely on. Severity 🔴 if money/cancel events end up without email; 🟡 otherwise. Benefits: urgent things are seen, important things are provable. Risks: workers who turn push off miss reminders unless email/in-app covers them — so the fallback must be stated in the same answer (if push is off, email + in-app still arrive). Legal/financial impact: cancellation-fee and refund disputes (F01, P07–P09) will be argued from emails; a cancel with no email is a dispute with no paper trail.

**Normal case:** offer → in-app + push + email; payment confirmed → in-app + email; reminder → push (+email at 24h); cancel → in-app + push + email.
**Edge case:** worker has push disabled → email + in-app must still arrive; worker's email bounces → in-app must still carry the notice (GM22-19/26) — **today the in-app notice exists via the auto-notification rule, but there is no bounce handling and no delivery proof**.
**Retry/concurrency:** a notice sent on two channels must not contradict itself (same wording, same shift time on both) — **today there is no dedup, so the same event can produce duplicate notices**.
**Denied role / wrong tenant:** channel choice must never widen the audience — a push to the wrong pharmacy is worse than an in-app notice to the wrong pharmacy, because it appears on a locked screen — **and push text today is the notification text verbatim (GM22-14, GM22-27)**.
**Payment/notification side effects:** payment and refund notices must be email (durable); a push preview must not carry amounts — **today refunds have no notice at all**.
**Web/Expo difference:** push is Expo-only. The answer must state what web users get instead of push (in-app + email), or web users systematically get slower notices than Expo users — **and Next users today have no in-app centre at all**.

**Ask second (after GM22-04 is answered):** GM22-01 (PO-Q08, notify on escalation) together with GM22-10 (LA-Q17, fix match emails before launch) — the launch-critical pair.

---

## Part E — Code gaps vs decision gaps

### Code gaps (verified at head `97c4543e` — no decision needed, just build/fix once the rule is known)

| ID | Gap | Evidence |
|---|---|---|
| CG-01 / SH-05 | **No scheduled shift-escalation job.** Escalation runs inside `get_queryset` on every list/detail request; celery beat has only the two marketplace escalation tasks | `backend/shifts/base.py`, `backend/core/celery.py` |
| CG-02 / AV-04 | **Match emails miss escalated shifts; reach unverified workers; no minimum-rate filter.** Distance/travel enforced | `backend/shifts/announcements.py:462`, `backend/shifts/escalation.py` |
| CG-03 / SH-07 | **Offers expire after flat 48 h, not capped at shift start; expiry applied only lazily; expiry is silent** | `backend/shifts/assignment.py:22`, `backend/shifts/offers.py` (lazy expiry in `list()`) |
| CG-04 / D03 | **Reservation expiry moved and silent.** `shifts/reservations.py` does not exist at head; expiry in `billing/checkout_reservations.py` is manual/admin/conflict-driven (no scheduler); **no notification on expiry** | `backend/billing/checkout_reservations.py` (`expire_checkout`, `expire_unreconciled_checkout`) |
| CG-05 / PO-Q12 | **Anonymous-pharmacy name leak — wider than Oct.** Reminder email names the pharmacy (subject + context); shift-updated notice names it to all past applicants; not-selected notice names it to non-selected applicants; `build_shift_email_context` sets `pharmacy_name` unconditionally | `backend/shifts/emails.py:54,203,289,404`, `backend/shifts/tasks.py` |
| CG-06 | **No dedup, no retry for push, no staleness voiding, no audit log.** Duplicate `notify_users` = duplicate rows + pushes; push failures logged only; no sent-state on reminders | `backend/notifications/services.py`, `backend/shifts/tasks.py` |
| CG-07 | **Email retry then drop, no bounce handling.** Celery autoretry max 5 then dropped, no dead-letter; failure only logged; no bounce handling anywhere traced | `backend/users/tasks.py` (`send_email_task`) |
| CG-08 | **Refunds silent; reconciliation notices in-app-only; cancellation-penalty payment produces no notice** | `backend/billing/payment_events.py` (`handle_charge_refunded:126`, `handle_payment_checkout:19`) |
| CG-09 | **Pills spend silent; no low-balance/expiry notice.** Only referral awards notify (in-app + email, try/except pass) | `backend/rewards/services.py` (`_send_pill_award_message:207`, `spend_pills_for_shift_post:367`) |
| CG-10 | **No rating notification exists.** `ratings/views.py` contains no notify/announce/send_async_email at all | `backend/ratings/views.py` (absence verified) |
| CG-11 | **Next has no notification UI; Vite bell excludes chat while Expo includes it.** Push is Expo-only | `frontend_web/landing_next` (search, default branch), `frontend_web/src/components/TopBarActions.tsx`, `frontend_mobile/features/notifications/NotificationsScreen.tsx` |
| CG-12 | **Push denied → silent null.** No retry prompt, no in-app explanation traced; push handler has no sound/badge | `frontend_mobile/utils/pushNotifications.ts` |
| CG-13 | **Auto-email in-app notices have empty bodies** (title = subject only) and type TASK (so their push is held in quiet hours) | `backend/users/task_dispatch.py:26-61`, `backend/notifications/services.py` (`notify_users` default type TASK) |
| CG-14 | **Competing PENDING offers EXPIRED silently by `.update()` at accept time — no notice** | `backend/shifts/offers.py` (accept path) |
| CG-15 | **AHPRA admin email uses raw `send_mail`** (synchronous, not the async task path) | `backend/onboarding/verification/state.py:294` |
| CG-16 | **Expo centre marks visible notices read on focus — money/cancel notices are not pinned** and can be marked read by opening the list | `frontend_mobile/features/notifications/NotificationsScreen.tsx` |
| CG-17 | **No send-time recipient re-check.** Recipient lists are built at trigger time; access revoked between trigger and send still gets the notice | `backend/notifications/services.py` (`notify_users`), `backend/shifts/notifications.py` |

### Decision gaps (owner must choose first — do not build until answered)

| ID | Gap | Questions |
|---|---|---|
| D07 | No agreed recipient list or channel per event | GM22-03, GM22-04, GM22-21 |
| D06 | No fallback rule when an offer is declined/expires | GM22-02 |
| D12 | Reminder scope/timing/late-change rule undefined | GM22-05, GM22-06 |
| R04D (detail) | Emergency-cancel recipients + repeat timing open | GM22-07 |
| SH-06 | Notify on escalation? Stop rule after interest? | GM22-01, GM22-13 |
| — | Urgent-alert opt-in; distance/min-rate alert filters | GM22-08, GM22-09 |
| — | Channel + recipients for Pills/rewards, payments, ratings, verification changes | GM22-22, GM22-23, GM22-24, GM22-25 |
| — | Preferences / quiet hours scope; whether money/cancel notices can ever be switched off; whether money/cancel are always ALERTs | GM22-20 |
| — | Chat/hub notification boundary with GM-20; one unread count | GM22-28 |
| — | Anonymous-name reveal point (agreement preview vs reservation vs payment) | GM22-14 |
| — | PDF agreement: emailed on confirmation, in-app only, or deferred | GM22-15 |
| — | Escalation lateness bound (5 min / 1 min / 15 min) | GM22-11, GM22-12 |

### Gaps that are BOTH (decision first, then code)

- Escalation notices (GM22-01): needs the notify/stop decision, then the scheduled job (SH-05) to deliver on time.
- Reminder redesign (GM22-05/06): needs the timing decision, then a reminder-sent state + late-change alert build.
- Emergency cancel alerts (GM22-07): needs recipients/timing, then a repeating-push mechanism that does not exist today.
- Anonymous-name fix (GM22-14 + CG-05): needs the reveal-point decision, then fixing three naming paths + the shared email-context builder.
- Dedup/audit (GM22-26 + CG-06): needs the dedup-key rule, then enforcing it in the store + an admin-visible log.

---

## Part F — Implementation backlog — PROPOSED ONLY, frozen until owner answers

> Do not build any item below until its parent question is answered AND the behaviour is re-validated against the current head. Order is suggested, not approved. Nothing here is decided.

| # | Backlog item | Parent question | Depends on | Acceptance (positive / negative) |
|---|---|---|---|---|
| B1 | Scheduled escalation job (replace request-driven `get_queryset` scan) + idempotent tier advance | GM22-11/12 | GM22-01 decision | + escalation fires within bound with no page view; − no double-advance on overlapping runs |
| B2 | Notify each new tier on escalation (+ availability matches); stop when reserved; resume on decline/expiry | GM22-01/13 | B1, GM22-04 | + newly eligible workers notified once; − declined applicant's interest does not strand the shift; − wrong-tenant worker gets nothing |
| B3 | Match-email fix: fire on escalation to PLATFORM; filter recipients by Verified (+ minimum rate if decided) | GM22-10 | GM22-01, GM22-04 | + escalated shift emailed to verified available workers; − unverified worker receives nothing |
| B4 | Channel rule implementation: per-event channel map (in-app + push; email for money/cancel) | GM22-04 | GM22-21 catalogue | + offer/cancel/payment produce the agreed channels; − a money event never goes push-only; − reconciliation/refund notices gain email |
| B5 | Offer expiry notices + reopen/next-applicant fallback (+ notice to losers when competing offers are expired on accept) | GM22-02 | GM22-04 | + expiry notifies manager; − silent expiry; − auto-offer picks nobody unwanted; − loser not left waiting |
| B6 | Cancel/cover/replace path for confirmed external bookings + notices to agreed recipients | GM22-03 | SH-01 build (re-trace first); GM22-04 | + booked worker/owner/managers told; − past applicants not told; − no cancel notice leaks names |
| B7 | Reminder redesign: confirmed-only 24h + 2h, push + email; reservation handling per decision; reminder-sent state (dedup) | GM22-05 | GM22-04 | + two reminders, one per worker per date; − reservation gets none (unless decided otherwise); − duplicate reminders |
| B8 | Late-change instant alert + void old reminders | GM22-06 | B7 | + time change <12h alerts instantly; − worker keeps old time; − edit notice no longer goes to all past applicants |
| B9 | Emergency-cancel repeat alerts (manager/owner, 15 min; support after 30 min if decided) | GM22-07 | GM22-04, GM22-18 | + repeat until answered; − support cannot approve; − alert stops once answered |
| B10 | Anonymous-name fix in reminder email + shift-updated + not-selected notices + shared email-context builder (redact until the agreed reveal point) | GM22-14 | GM22-04 | + no notice names the pharmacy before reveal; − reminder still reaches the worker |
| B11 | Emailed PDF agreement on confirmation + in-app download | GM22-15 | GM22-04, GM22-19 | + both sides receive the same PDF; − PDF goes to no third party |
| B12 | AHPRA-cancel path unified with ordinary cancel (policy, fee, refund, notices) — notice half already built; policy half needs a cancel-path trace first | GM22-16 | GM22-03/04 | + same notices as ordinary cancel; − shift stuck "waiting for payment" |
| B13 | In-app notification centre on Next (Vite + Expo already have one); pin money/cancel notices until read; expiry rule | GM22-17 | GM22-04 | + notice re-readable after push missed on all three clients; − other users' notices never listed; − money notice not marked read by opening the list |
| B14 | Expo push end-to-end hardening: denied-permission explanation + fallback, per-event push map, push retry/fallback, no amounts in push preview | GM22-18 | GM22-04 | + granted → push arrives; − denied → email + in-app still arrive + user told why; − no push to revoked tokens; − no pharmacy name on a locked screen before reveal |
| B15 | Email delivery proof + bounce handling + dead-letter path (queue + retry already exist) | GM22-19 | GM22-04 | + money/cancel email failure is logged, retried, and falls back to in-app with an admin alert; − synchronous send blocks requests (AHPRA admin email moved to the async path) |
| B16 | Preference centre (per-event/channel, quiet hours) with money/cancel carve-out per decision; expose push preferences in Vite/Expo settings | GM22-20 | GM22-04/08 | + switch respected; − money/cancel notice never switchable off (if decided); − preference change applies to queued notices per rule |
| B17 | Pills/rewards notices (earn/spend/expiry/low balance/renewal) | GM22-22 | GM-16 (what Pills are); GM22-04 | + expiry warning before loss; − worker never sees a pharmacy's balance; − spend notice exists |
| B18 | Payment/invoice/refund/credit notices (email receipt + in-app; no amounts in push); refund + cancellation-penalty notices | GM22-23 | GM22-04/19; GM-16/17 | + every money movement notified; − duplicate notice on webhook redelivery; − amounts in push preview; − refund silent |
| B19 | Rating-received + incident/warning/suspension notices with appeal path | GM22-24 | GM22-04; CX-Q23/24 | + suspended worker told with appeal path; − score/comment not pushed to lock screen (if decided) |
| B20 | Verification/AHPRA status-change notices (worker + affected pharmacies); grant/lapse notices | GM22-25 | GM-02; GM22-04 | + lapse notified with consequence; − register detail not disclosed to pharmacy |
| B21 | Dedup / retry / staleness-voiding / notice audit log | GM22-26 | B4 | + one notice per (event, recipient); − stale reminder delivered after a change; − audit log is tenant-scoped |
| B22 | Per-event negative tests: wrong tenant / wrong role receives nothing (all channels incl. push text); send-time recipient re-check | GM22-27 | B2–B20 | + negative test per event passes; − any cross-tenant notice |
| B23 | Chat/hub notification boundary (one unread count; GM-20 owns delivery); align Vite bell (excludes chat) with Expo list (includes chat) | GM22-28 | GM-20 | + chat reply produces one push, not two; − hub notice leaks to non-members; − bell counts agree across clients |

### Scenario bank (for acceptance tests after decisions)

- **Unfilled shift:** posted to favourites, one decline, escalation + notices reach chain then public; shift fills. (GM22-01/02/13)
- **Silent expiry:** offer expires at 2am; manager is told by morning; next applicant offered or shift reopened per decision. (GM22-02)
- **Cancel near start:** pharmacy cancels a paid booking 3h before start; worker, owner, managers told by email + push; fee/refund notice agrees with the cancel notice. (GM22-03/04/23)
- **Late time change:** start moved 9am→1pm at 8pm; worker alerted instantly; old 12h reminder voided. (GM22-06)
- **Emergency cancel:** worker requests cancel 45 min before start; manager/owner pushed every 15 min; support looped in at 30 min if decided; no self-cancel. (GM22-07)
- **Anonymous post:** worker books blind; no notice or email names the pharmacy until the agreed reveal point. (GM22-14)
- **Unverified worker:** match email never sent; apply gate and notice filter agree. (GM22-10)
- **Push denied:** worker denies push permission; offer still arrives by email + in-app, and the app says push is off. (GM22-18)
- **Lapsed AHPRA:** registration lapses; worker told; booked shift re-checked; pharmacy told without register detail. (GM22-25)
- **Double delivery:** webhook/job runs twice; worker gets one payment notice, one reminder, one escalation notice. (GM22-26)
- **Refund:** Stripe refund completes; pharmacy and worker are told by email + in-app with the amount. (GM22-23)
- **Next user:** a Next-web user opens the app after an offer arrives — a notification centre exists and shows the same notice as Expo. (GM22-17)

---

## Unknowns (not verified in this trace — do not present as fact)

- Cancel/cover/replace path for confirmed external bookings (SH-01) — not re-read; GM22-03's cancel half cannot be answered from evidence yet.
- Roster cover/swap/leave request notices and R04D emergency-cancel recipients/timing — not re-read.
- PDF agreement — no PDF code encountered in the traced files, but not specifically searched.
- AHPRA cancellation policy unification (LA-P01/LA-P02 fee/refund half) — cancellation code not read.
- Incident/warning/badge (P10) notices — incident code not read.
- Invoice delivery email's in-app half (`invoicing.tasks.deliver_invoice_email` exists as a beat route; whether it creates an in-app notice was not read).
- Hub/roster/calendar/membership/attendance notice contents — call sites confirmed by default-branch search only; content at the PR head not verified.
- Next notification UI — no centre/bell/API usage found by default-branch search across `landing_next`; not confirmed by a ref-pinned file read.
- Whether a Vite/Expo settings screen exposes the push preferences (API exists; UI not traced).
- Whether the live Next site serves the migrated copy (same caveat as GM-01).
- Explorer shifts tab on mobile (blank placeholder in Oct 2026) — not re-traced.
- Two-device push behaviour; push-token behaviour on app reinstall (not traced).
- Email sender identity value (`DEFAULT_FROM_EMAIL` env — value not verified); email template bodies for money events (amounts in email bodies not verified).

## Method note (for the revalidation run — completed)

- Trace order followed the senior review: backend notification/email/push code and models first, then the event→notice call sites in shifts/offers/interest/billing/ratings/rewards/chat/onboarding/invoicing, then Vite web notification UI, Next web notification UI (search), Expo push setup + notification screens, then tests (positive and negative, per event, per role, per tenant).
- GitHub calls: 146 in total across the GM-21/GM-22 re-run, all strictly sequential, 9 s apart, one at a time. No real 429. One false-positive stop (settings constant `EMAIL_TASK_RATE_LIMIT` matched by the detector inside a successfully downloaded file) — detector fixed, file usable, no finding rests on it.
- Adopted verdicts: subscriber discount now applied (GM-16/GM-18); AV-Q09/LA-Q17 CHANGED partial (GM-18). Sibling agents' `/tmp/gm*/` downloads were **not** cited as evidence anywhere (provenance unverified).
- Do not raise a PR and do not change code during Grill Me — documentation and decisions only (Issue #250 scope freeze).

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-22-OD-14: A notice about a shift at your other pharmacy opens that pharmacy (OD-14, D175 N1)
**Platforms:** Expo only
**What happens today:** Tapping a notice for a Brisbane shift while Southport is selected used to show "No active shifts". The Shift Centre now switches to the shift's pharmacy, a fully booked shift opens its booked view, and timesheet notices open the timesheet.
**Already implemented:** commit cc5f2787
**Recommendation:** Keep.
**Other option:** Ask before switching pharmacy.
**Status:** OPEN, confirm or change.
