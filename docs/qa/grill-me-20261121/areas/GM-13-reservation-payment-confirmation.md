# GM-13 — Reservation / payment confirmation — Full Grill Documentation

**Area:** GM-13 Reservation/payment confirmation (Issue #250, area 13 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED + VALIDATED at PR #249 head. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only. This file overwrites the 2026-11-21 partial, which was BLOCKED by a GitHub 429 before any current-code check.

## Bases (exact SHAs verified 2026-11-21)

| Source | Ref | SHA / head |
|---|---|---|
| Active PR #249 (revalidation target) | `refs/pull/249/head` | `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft, unchanged since first verified 2026-11-21 |
| Old grill PR #184 | `refs/pull/184/head` | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020` |
| PR #249 body text | — | Names a "working head `26cae2d6`" — that is the short SHA of the **last listed implementation commit** in the body table, **not** the branch head. The API head is `97c4543e…` (verified live in this trace). All tracing below is at the API head. |

**Rate-limit note (this re-run):** no HTTP 429 occurred. ~70 GitHub read calls were made strictly sequentially with ≥8 s between calls and all succeeded. The earlier 429s (which blocked the first GM-13 attempt) have cleared.

**Files verified at the PR #249 head in this trace** (all `refs/pull/249/head`):
`backend/billing/` directory listing (43 entries — notably **no** `reservations.py` and **no** `finalize.py` in `billing/`; the task's named files do not exist there), `backend/billing/checkout_reservations.py` (18,096 B), `fulfillment.py`, `paid_fulfillment.py`, `views.py`, `webhooks.py`, `payment_events.py`, `release_guards.py`, `stripe_support.py`, `checkout_context.py`, `checkout_prices.py`, `checkout_urls.py`, `models.py`, `utils.py`, `subscriptions.py`, `subscription_operations.py`, `backend/shifts/offers.py` (accept flow), `assignment.py` (`OFFER_EXPIRY_HOURS`), `finalize.py` (in `shifts/`, not `billing/`), `cancellation.py` (AHPRA path), `escalation.py`, `tasks.py`, `backend/core/settings.py` (billing flags + `CELERY_BEAT_SCHEDULE`), `backend/shifts/` directory listing, `docs/qa/launch-grill/questions.json` + `AUDIT.md` at `refs/pull/184/head`.
**Adopted, not re-fetched:** `backend/billing/shift_payments.py` + `subscription_events.py` (verified at this head in GM-16, SHAs `8c067cdb…` / `016de98a…`); `backend/billing/urls.py` (verified at this head in GM-17 senior review: 20 lines, 8 paths, `charge-penalty/` at line 16, zero `refund` hits); GM-15 senior-reviewed cancellation findings and GM-17 senior-reviewed invoice/refund findings (see §1.5).
**Not verified / still UNKNOWN:** the worker-side "Waiting for owner payment" wording (zero hits in `WorkerShiftDetailPage.tsx` — see BK-Q13); who calls `announce_posted_shift` / `announce_availability_matches` (posting flow caller, GM-10 territory); who calls `auto_escalate_due_shifts` (no beat entry — see CG-6); the live Next site's routing (Next has no pay UI in the migrated copy — see §1.4).

## Part A — Current-flow matrix

Columns: Trigger → Actor → Backend / API → Vite web → Next web → Expo mobile → Persisted state → Event / side effect → Recovery / denial path.

### F01 — Worker accepts an offer (reservation is created)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker taps accept on a PENDING offer | Worker (offer recipient only) | `POST …/offers/<id>/accept/` → `ShiftOfferViewSet.accept` (`backend/shifts/offers.py:338`): shift + slots row-locked; `require_public_ahpra` + `lock_public_ahpra`; offer must be PENDING and unexpired (`expires_at`, flat 48 h — see F08); slot-lock check (`slot_locked_for_shift_offer`); terms built + version-checked (409 `TERMS_CHANGED` if the worker reviewed stale terms); `freeze_accepted_terms`; `billing_state` decides: `PAYMENT_REQUIRED` → offer `ACCEPTED_AWAITING_PAYMENT`, `shift.payment_status='PENDING'`; otherwise `finalize_shift_offer` immediately, `payment_status='PAID'`, competing offers for the slot expired | Accept dialog shows terms (GM-14) + `terms_version` check; on success worker sees the offer as accepted-awaiting-payment | Migrated copy of the same flow (not line-read for GM-13; parity assumed from shared-core + same accept endpoint — TO-CONFIRM) | Same backend endpoint via shared-core; same statuses | `ShiftOffer` status + `engagement_terms_snapshot` + `engagement_terms_accepted_at` + `payment_preference_snapshot` / `settlement_channel` / `engagement_kind` on the offer; `shift.payment_status` | Acceptance emails + in-app notices to worker ("Offer accepted — owner payment pending" / "Shift confirmed") and owner ("Payment is required to finalize" when applicable); free-path also sends `send_shift_payment_finalized_notifications(..., payment_method="free")` | Expired offer → 400 "Offer has expired." + status set EXPIRED. Locked slot → 400 "already locked or awaiting payment." Wrong user → 403. AHPRA not verified → blocked by `require_public_ahpra`. Terms changed mid-review → 409, must re-review. Payment-profile incomplete (TFN/ABN) → 400 from `_external_payment_profile` (GM-14) |

### F02 — Owner opens a Stripe Checkout for the reservation

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner/manager taps "Pay with Stripe" on a shift with `ACCEPTED_AWAITING_PAYMENT` offers | Owner / authorised manager (`user_can_pay_shift_charge_for_pharmacy`, 403 otherwise) | `POST /billing/charge-fulfillment/<shift_id>/` → `billing/views.py:charge_shift_fulfillment` → `shift_payments.charge_shift_fulfillment` (GM-16 verified): free path (PRE_LIVE / FREE_TRIAL) finalises without Stripe; paid path runs `assert_can_create_shift_charge("fulfillment")` (release guard — live mode needs `BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED=true` + live Stripe key; test mode only in local/dev/test/staging; staging + live key rejected), subscriber check, price from `FULFILLMENT_PRICES` ($30/$15 locum, $80/$40 PT-FT per offer), then `prepare_checkout` + `open_checkout` in `checkout_reservations.py`: `FulfillmentCheckout` row (state PREPARED → OPEN) + `FulfillmentReservation` rows keyed `shift:slot:date` (or `shift:whole`); Stripe Checkout Session created with idempotency key `shift-fulfillment:<attempt>`; session id + URL + `provider_expires_at` stored | `ActiveShiftsPage` → `useShiftPaymentActions.handlePayWithStripe`: POSTs `chargeShiftFulfillment(shiftId, {offerIds})`; on `url` → `window.location.href = url`; on `{free:true}` → snackbar + reload; on 409 + `checkout_id` → conflict dialog (F05) | **No pay UI found in the Next migrated copy**: `landing_next/migrated/pages/dashboard/sidebar/ShiftsBoard/index.tsx` (30,726 B) contains zero hits for `chargeShiftFulfillment`, `payShiftWithPills`, "Payment required", `countdown`, `expires`, or `handlePayWith`. Next has no `ActiveShiftsPage` equivalent in the migrated pages listing (only `ShiftsBoard` + `TalentBoard` dirs). An owner on Next cannot pay from the Next surface as traced — parity gap CG-7 | `roles/shared/shifts/ActiveShiftsPage/index.tsx` `handlePayWithStripe`: same shared-core call with `platform: 'mobile'`; on `url` → `Linking.openURL(url)`; same free/conflict handling; 409 → native alert "Checkout already in progress" (resume / expire / cancel) | `FulfillmentCheckout` (UUID pk, `offer_ids`, `parameters`, `parameter_hash`, `expected_amount_cents`, `state`, `stripe_session_id` unique, `checkout_url`, `provider_expires_at`) + `FulfillmentReservation` rows (`occurrence_key`, `active`) | Stripe Checkout URL returned; nothing is confirmed yet — the offer stays `ACCEPTED_AWAITING_PAYMENT` until the webhook (F03) | Overlapping checkout for same occurrence/selection → 409 `checkout_in_progress` ("Complete or explicitly expire it before changing the selection or platform"). Identical selection + parameters → the **same attempt is returned** (idempotent prepare). Stripe failure → 400 "Unable to complete the billing request." (paid path) or 503 `checkout_uncertain` ("Retry this unchanged request; do not create another payment") when the provider acknowledgement is uncertain. Attempt left PREPARED/UNKNOWN; the reservation is untouched |

### F03 — Checkout succeeds (webhook confirms the booking)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Stripe `checkout.session.completed` (mode `payment`, `payment_status='paid'`) | Stripe webhook → backend | `POST /billing/webhook/` (AllowAny, CSRF-exempt) → `webhooks.receive_stripe_webhook`: signature verified with `STRIPE_WEBHOOK_SECRET` (400 on bad payload/signature); `StripeWebhookEvent` row by unique `event_id` (delivery dedupe — already-PROCESSED → 200, no reprocessing); `_process_stripe_event` → `payment_events.handle_payment_checkout`: `ShiftPayment` get-or-created by `stripe_payment_intent_id` (distinct event IDs for the same intent never create a second ledger debit); `bind_paid_checkout` checks metadata match, currency `aud`, `amount_total == expected_amount_cents`, duplicate intent; then `finalize_paid_selection` → `finalize_shift_offer` per offer (assignments created exactly once, rate locked from accepted terms snapshot) + `expire_competing_offers`; `shift.payment_status` → PAID when no `ACCEPTED_AWAITING_PAYMENT` offers remain; `send_shift_payment_finalized_notifications(..., payment_method="stripe")` on commit | Shift list reloads; "Payment required" section disappears; shift shows confirmed | Same backend outcome; no Next pay UI to reload (F02) | Same backend outcome; `loadShifts()` refresh | `ShiftPayment` (paid, `amount_aud`, `reconciliation_required=False` unless a problem); `FulfillmentCheckout.state=COMPLETE` + `payment` linked; `ShiftSlotAssignment` rows; offer status ACCEPTED | Worker + owner notified (payment-finalised notices); competing offers expired | **Binding mismatch** (metadata/currency/amount/session) → `payment.reconciliation_required=True` + reason, owner notified "Shift payment needs reconciliation … Check the payment before retrying or refunding." **Paid work unavailable** (offer gone / locked payroll period) → `reconciliation_required=True`, reason `paid_work_unavailable` or `locked_payroll_period`; managers notified "Shift payment needs a refund" / "needs a correction … Do not pay again"; payroll-lock replays the same bound payment after correction (webhook returns 503 so Stripe retries the exact event). **Deleted shift** → reconciliation + "The paid shift no longer exists. The payment needs a refund." **Webhook exception** → delivery FAILED, HTTP 500, Stripe retries. **Missed/skipped webhook**: there is **no polling or recovery job** in the traced code — recovery is Stripe's own redelivery + the reconciliation flags above; a paid checkout whose webhook never arrives stays unfinalised until someone reconciles it (code gap CG-5) |

### F04 — Owner pays with Pills instead of Stripe

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner taps "Pay with Pills" | Owner / manager (`user_can_manage_pharmacy`, else 403) | `POST /pill-rewards/pay-shift/` → `rewards/views.py:pay_shift`: shift row-locked; `payment_status` must be PENDING; selected offers must be `ACCEPTED_AWAITING_PAYMENT`; per offer `spend_pills_for_shift_post` (200 pills, idempotency key `shift:<id>:offer:<id>:pill-payment`, payer-row lock, balance check) then `finalize_shift_offer`; `expire_competing_offers`; `payment_status` → PAID when none outstanding; `send_shift_payment_finalized_notifications(..., payment_method="pills")` | `handlePayWithPills` in `useShiftPaymentActions`: snackbar "Shift paid with pills."; insufficient → "Not enough pills. You have X; this shift needs Y pills." | No pay UI in Next (F02) | Same handlers in `roles/shared/shifts/ActiveShiftsPage/index.tsx` (same messages) | `PillLedgerEntry` SPEND rows (−200/offer) + assignments + offer ACCEPTED | Same finalised notices as F03, `payment_method="pills"` | Insufficient balance → 400 `insufficient_pills` with `balance` + `required`. Shift already PAID → "Shift is already paid." Not PENDING → 400. Selected offers not pending → 400. Concurrent deductions from the same balance are serialised by the payer-row lock |

### F05 — A second checkout is attempted while one is open (conflict / recovery)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner taps Pay again, or changes the selection, while a checkout attempt is PREPARED/OPEN/UNKNOWN | Owner / manager | `prepare_checkout`: same selection + parameters → same attempt returned; different selection overlapping the same occurrences → 409 `CheckoutConflict` with `checkout_id`. `open_checkout`: already-COMPLETE → 409 "already been paid"; already-EXPIRED → 409 "has expired"; session older than 23 h → 503 `CheckoutUncertain` ("requires reconciliation"). `expire_checkout` (via `POST …/checkouts/<id>/expire/`): only after Stripe confirms the session is `expired` + `payment_status='unpaid'`; then attempt EXPIRED + reservations deactivated. `expire_unreconciled_checkout`: operator-only, attempt ≥48 h old, no provider session, operator must first confirm with the provider that no session/payment exists | Conflict dialog: "This work has an existing card checkout. Continue that checkout, or expire it before starting a replacement… A paid or uncertain payment must be reconciled first." Buttons: Cancel / "Expire unpaid and replace" / "Continue existing checkout" (`recoverCheckout('expire'|'resume')`) | No pay UI in Next | Native alert "Checkout already in progress" with the same three choices | Attempt state transitions; reservations stay `active=True` until provider-confirmed expiry | None | Expire-then-replace re-runs `handlePayWithStripe` with the new selection. Resume re-opens the stored `checkout_url` (or creates the session if none was saved). A payment on an orphaned (expired-then-recreated) session is reclaimed by `_reclaim_orphaned_attempt` — it books only work a replacement does not already hold; the rest is ledgered for refund, never booked twice |

### F06 — Payment arrives after the reservation ended (F04 carried decision)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Stripe reports a payment for work that is no longer available (offer expired/declined, shift deleted, payroll locked) | Stripe webhook | `handle_payment_checkout` / `finalize_paid_selection`: the money is recorded (`ShiftPayment`, `reconciliation_required=True`); **no rebooking happens** — the paid selection is not forced onto other work; managers/owner are notified "Shift payment needs a refund" (or "needs a correction" for a locked payroll period, with replay after correction). A refund itself is Stripe-initiated only — there is **no in-app refund/credit endpoint** (GM-17 adopted: `billing/urls.py` has zero `refund` hits; `handle_charge_refunded` only reconciles Stripe-initiated refunds into `refunded_amount_aud` / `partially_refunded` / `refunded`) | Owner sees the reconciliation notice; no in-app refund action exists | Same backend outcome | Same backend outcome | `ShiftPayment.reconciliation_required=True`, `reconciliation_reason` (`paid_work_unavailable` / `locked_payroll_period` / `deleted_shift` / binding error) | Owner notification with `payment_id` + reason; finance/support must act (who, and with what SLA, is GM-17's CX-Q21 — still open) | No automatic rebooking (F04 as decided). No automatic refund (GM-17 Q01 open). The only automatic path is the payroll-lock replay after an audited correction |

### F07 — AHPRA restriction cancels a reservation awaiting payment (LA-P01)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| AHPRA register shows a restriction for a worker with future public bookings | System (`shifts/cancellation.py:cancel_upcoming_assignments`) | Deletes future `ShiftSlotAssignment`s (unless protected by leave/attendance/invoice history, which retains them); sets `ACCEPTED` / `ACCEPTED_AWAITING_PAYMENT` offers to `DECLINED` (unless the worker has assignments on them); notifies managers (`shift_cancelled`, email `ahpra_status`) | Manager sees the cancellation notice; the shift reopens (other offers unaffected) | Same backend outcome | Same backend outcome | Offer DECLINED; assignments deleted | Managers told; pharmacies can refill | **Gap (LA-P01, still valid and worse than Oct 2026): the function never touches `FulfillmentCheckout` / `FulfillmentReservation` or the Stripe session.** The declined offer's occurrence reservation stays `active=True` and any opened Stripe session stays payable for 24 h. `guard_fulfillment` will then block any other payment route for that occurrence with `checkout_reserved` ("Expire an unpaid checkout or reconcile its payment before using another payment route") until someone explicitly expires the checkout. The shift lock is also not released by this path (the Oct claim). No fee/refund rule runs (GM-15 adopted) |

### F08 — Offer expiry (the only time-based expiry that exists)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| 48 h pass after an offer is sent, or someone opens the offer list / tries to accept | System / any reader | `OFFER_EXPIRY_HOURS = 48` (`backend/shifts/assignment.py:22`); `expires_at = now + 48 h` at offer creation (`:105`, `:273`, `:285`) — **not capped at shift start**; lazy expiry in `ShiftOfferViewSet.list` (`offers.py:184`: PENDING offers with `expires_at < now` → EXPIRED) and a hard check in `accept` (`:355`: expired → 400 + status EXPIRED) | Offer disappears from the pending list on next load; accept fails with "Offer has expired." | Same backend behaviour | Same backend behaviour | Offer EXPIRED | None (silent — no notification on expiry; BK-Q06) | No expiry job exists: `CELERY_BEAT_SCHEDULE` (`settings.py:271`) contains only `ahpra-overdue-alerts` (15 min), `publish-editorial-revisions` (60 s), calendar birthdays/work-notes, and `shift-reminders-hourly`. **There is no reservation-expiry job, no offer-expiry job, and no escalation job on any schedule.** The Oct 2026 claim "expiry scheduled every 60 s" is false at this head |

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: every question in `questions.json` (130 questions + 30 carried decisions, re-read from `refs/pull/184/head` this session) was scanned for reservation/payment mechanics. Verdicts were re-checked against the PR #249 head `97c4543e`.

| Old ID | Old question | Verdict | Evidence (current code) |
|---|---|---|---|
| D01 | Acceptance creates a time-limited reservation; only verified payment confirms it | **CHANGED — half true** | Acceptance does create a reservation (`ACCEPTED_AWAITING_PAYMENT` + `FulfillmentCheckout`/`FulfillmentReservation`, `offers.py:accept`, `checkout_reservations.py:prepare_checkout`) and only verified payment (webhook `bind_paid_checkout`, or Pills) confirms it. But the reservation is **not time-limited by any D02 deadline** — see D02. The "time-limited" half is not implemented |
| D02 | Pay-by window: >48h 24h; 12–48h 6h; 2–12h 2h; <2h 30 min; never past shift start | **NOT IMPLEMENTED — must be re-asked** | No pay-by deadline exists anywhere in the traced code. No `pay_by`/`deadline`/D02 constant, no per-offer deadline field, no expiry job (`CELERY_BEAT_SCHEDULE` has none). The only time bounds on a reservation are Stripe's 24 h Checkout session (`checkout_reservations.py:219`, "no `expires_at` is set") and the manual expire/resume endpoints. A shift <2 h away does **not** get a 30-minute window today — it gets up to 24 h. Carried forward as GM13-Q01 (first question) |
| D03 | Unpaid reservation expires → release to same audience, notify both sides, no penalty | **NOT IMPLEMENTED as a flow** | There is no expiry event to trigger it: no deadline (D02), no job (F08), no release-to-audience step, no expiry notification. What exists is manual provider-confirmed expiry (`expire_checkout`) and the 48 h operator path (`expire_unreconciled_checkout`). When a checkout is expired, reservations deactivate — but nothing re-offers the shift or notifies the worker/manager. Carried forward as GM13-Q02 |
| F01 | Pharmacy cancels: booking fee, refund/credit, worker pay stay separate | **STILL VALID (adopted GM-15/GM-17)** | No code contradicts it; no cancellation-charge engine exists to merge them. Boundary: GM-15/GM-17 own the money decisions |
| F04 | Payment arrives after expiry: no rebooking; pharmacy chooses credit or refund after approved review | **PARTLY TRUE — mechanism changed** | No rebooking is correct (F06). But there is no credit/refund choice in the app: no refund/credit endpoint exists (GM-17 adopted), and the "approved review" is the `reconciliation_required` flag + owner notice, with no approver workflow. Carried forward as GM13-Q09 |
| P07/P09/FEES | Owner fees by time before shift; % of frozen wages, cancelled dates only | **NOT GM-13 — boundary GM-15/GM-17** | P09 is a preview-only calculator (GM-15 adopted: calculator gone / not connected); the only charging code is the legacy 10%/20% penalty (GM-16). GM-13 must not re-decide it |
| BK-Q05 | How long does an offer stay open? | **STILL VALID** | Flat 48 h, not capped at shift start (`assignment.py:22,105,273,285`); expiry applied lazily on list/accept (`offers.py:184,355`). Carried forward as GM13-Q05 |
| BK-Q06 | Offer declined/expired — what happens to the shift? | **STILL VALID** | Decline notifies the owner, shift stays open (accept flow + notifications in `offers.py`); expiry is silent, no next-applicant offer (no code path found; `expire_competing_offers` only runs on finalisation). Carried forward as GM13-Q06 |
| BK-Q07 | Offer one shift to several workers at once? | **STILL VALID** | Several offers per slot allowed; first acceptance reserves (slot lock in `accept`); later acceptances fail "already locked or awaiting payment"; rest expire once the booking confirms (`finalize_shift_offer` → `expire_competing_offers`). Carried forward as GM13-Q07 |
| BK-Q13 | Live payment countdown on reservations? | **CHANGED** | The Oct "current" (both sides see "reserved, not yet confirmed" + pay-by time) does **not** match current code: there is no pay-by time to show (D02 not implemented) and no countdown anywhere. What exists: owner card "Payment required to confirm" + `$n × 30 AUD` + Pay buttons (Vite `ActiveShiftCard.tsx`, Expo `ActiveShiftsPage/ActiveShiftCards.tsx`); the worker-side "Waiting for owner payment" wording was **not found** in `WorkerShiftDetailPage.tsx` (zero hits) — its current wording is UNKNOWN, not verified. Carried forward as GM13-Q03 |
| BK-Q14 | Can a worker drop a reservation before payment without an incident? | **STILL VALID** | No withdraw action exists in the traced code: no worker endpoint ends an `ACCEPTED_AWAITING_PAYMENT` offer; it ends only on payment, explicit owner expiry of the checkout, AHPRA decline (F07), or Stripe session expiry. Carried forward as GM13-Q04 |
| BK-R01 / SH-13 | What happens after booking payment fails? | **CHANGED — and SH-13 is undefined** | `SH-13` has **no definition** in `AUDIT.md` (only the `gap: SH-13` field on BK-R01 in `questions.json`). The retry behaviour today: a failed/cancelled Stripe attempt leaves the `FulfillmentCheckout` PREPARED/OPEN/UNKNOWN; the owner can resume the same attempt or expire it and start a replacement (F05); a Stripe provider error returns 400/503 and changes nothing. There is no "original deadline" to retry until, because D02 does not exist — the effective bound is the Stripe session's 24 h. Carried forward as GM13-Q08 |
| ON-Q13 (ON-08) | Should pharmacies save a payment method during setup? | **STILL VALID** | Every booking opens a new Stripe Checkout; no card is stored anywhere in the traced code (no saved-card endpoint; `charge_shift_fulfillment` creates a fresh Session per booking; a Stripe `customer` is reused only when a subscription exists). The Oct rationale cites a 30-minute D02 window that does not exist — the urgency argument is weaker than stated, but the no-saved-card fact stands. Carried forward as GM13-Q10 |
| ON-Q04 (ON-11) | When must worker pay details (ABN/TFN, bank, super) be ready? | **STILL VALID (gate half verified; exposure half not re-validated)** | Checked at accept: `_external_payment_profile` blocks acceptance until the worker's TFN or ABN profile is complete (`engagement.py:265`); `worker_payment_profile_status` reports READY / TFN_SETUP_INCOMPLETE / ABN_SETUP_INCOMPLETE. Whether managers see it early on apply/offer screens was not re-traced here (GM-14 owns the detail). Carried forward as GM13-Q11 (GM-14 owns the wording) |
| AG-Q01 (SH-09) | What must the worker see before accepting? | **NOT GM-13 — route to GM-14** | Terms disclosure; GM-14 verified the terms dict lacks breaks/duties/site/cancellation table/platform terms version |
| AG-Q02 (SH-09) | Does the pharmacy accept the same agreement? | **NOT GM-13 — route to GM-14** | Worker-only acceptance verified in GM-14 |
| CX-Q03/Q19–Q22/Q31 | Cancellation money (unpaid-reservation fee, paid-booking refund, worker cancel, approver, cancellation pay, freeze precedence) | **NOT GM-13 — boundary GM-15/GM-17 (adopted)** | No cancel endpoint for confirmed outside bookings exists in the traced code (only the AHPRA path, F07); no refund/credit engine. GM-13 must not contradict GM-15-Q01 (what cancellation can launch) or GM-17-Q01 (refund vs credit) |
| LA-Q06 (SH-02) | Old 10%/20% penalty route still live | **STILL VALID** | `charge_penalty` still exists (`shift_payments.py`, GM-16 verified) and is still routed (`billing/urls.py` line 16, GM-17 adopted) and still exported from shared-core (`chargeShiftPenalty`, `sc-billing-api`). No UI was found calling it in the traced screens. Carried forward as GM13-Q12 (with GM-16) |
| LA-Q07 (SH-03) | Subscribers charged full price; Stripe price IDs hard-coded | **PART-FIXED (adopted GM-16)** | Subscriber discount now applied (`shift_payments.py`); Price IDs still hard-coded (`checkout_prices.py: FULFILLMENT_PRICES`, `stripe_support.py: BASE_SUB_PRICE / EXTRA_SEAT_PRICE`). GM-16 owns it |
| LA-R01 (SH-15) | Booking fees lack explicit GST / tax-invoice treatment | **STILL VALID** | No GST mention in any traced billing file; the only GST fact in the repo is the `gst_registered` flag on ABN terms (GM-14). GM-16/GM-17 own the decision; GM-13 must not state a GST treatment |
| LA-P01 | AHPRA cancellation leaves a shift stuck waiting for payment | **STILL VALID — worse than Oct** | Verified at head (F07): the AHPRA path declines the offer but never expires the `FulfillmentCheckout`/reservations or the Stripe session, so the occurrence stays reserved and `guard_fulfillment` blocks other payment routes until manual expiry. Carried forward as GM13-Q13 |
| LA-Q09 (SH-07) | Pending offers can outlive the shift | **STILL VALID** | Same as BK-Q05 (flat 48 h, uncapped). Carried forward with GM13-Q05 |
| LA-Q10 (SH-09) | Accepted terms lack cancellation table / terms version | **STILL VALID (adopted GM-14)** | Terms snapshot has schema `version: 1` + SHA fingerprint + worker acceptance, but no cancellation matrix, no platform terms version, no pharmacy acceptance |
| LA-Q08 (SH-05) | Scheduled escalation only runs on page load | **NOT GM-13 — boundary GM-11/GM-19** | Escalation has no beat entry either (`escalation.py:auto_escalate_due_shifts` exists; no caller on any schedule found). GM-19 owns the alert consequence (match emails miss escalated shifts) |

**Old questions NOT carried forward unvalidated:** none — every candidate above was re-checked against the head; the routed-away items (AG-Q01/Q02, CX-*, LA-Q07/Q08, LA-R01) are recorded here with their GM destination so they are not lost.

**Inventory discrepancy (resolved):** Issue #250 says "142 legacy questions from #184" but PR #184's own body says "130 questions in 8 areas" and `questions.json` contains 130 questions + 30 carried decisions. Counted this session: 130 questions. The extra 12 are unexplained (possibly from #204 / the shift-lifecycle register). Do not assert 142.

## Part C — GM-13 question queue (new + carried, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Decision status: **OPEN** for all — no owner answer recorded.

### GM13-Q01 — The pay-by window does not exist. Should D02 be built as decided, or is Stripe's 24 hours the rule? (carried D02 — FIRST QUESTION, see Part D)

**Plain English:** the owner already decided (D02) that a pharmacy gets 24 hours, 6 hours, 2 hours or 30 minutes to pay depending on how soon the shift starts — 30 minutes for a shift under 2 hours away. The code never built it. Today a reservation has no deadline at all: the only clock is Stripe's own 24-hour Checkout session, and nothing ever expires the reservation on a schedule. The owner needs to choose whether to build D02, keep the Stripe-only rule, or pick a simpler window.

**ACTUAL TODAY — Web and Expo (same backend):** no `pay_by`, no deadline field on `FulfillmentCheckout`/`FulfillmentReservation`, no D02 bands, no expiry job (`CELERY_BEAT_SCHEDULE` has no reservation job). A reservation ends only when the owner pays, explicitly expires the checkout, the worker's offer is declined (AHPRA), or the Stripe session lapses after 24 h. **Parity:** none — the absence is backend-wide; neither client shows a deadline because none exists.
**Normal case:** worker accepts; owner pays within the hour; webhook confirms. **Edge case:** shift starts in 90 minutes; owner opens checkout, gets distracted; the worker is held for up to 24 h while the shift start passes. **Retry/concurrency:** two owners/managers paying the same shift — second gets 409 + conflict dialog. **Denied role:** only `user_can_pay_shift_charge_for_pharmacy` may pay (403 otherwise). **Payment/notification:** no expiry notification exists, so D03's "notify both sides" cannot fire.
**RECOMMENDED:** Build D02 as already decided (24h/6h/2h/30min, capped at shift start) + a scheduled expiry job + D03 release-and-notify. Severity: high — D01/D03 and ON-Q13/BK-R01 all assume it exists; without it an unpaid reservation can strand a worker past the shift start. Benefit: the carried decisions become true; urgent shifts stop being held hostage. Risk: needs a beat task, a deadline field, countdown UI, and the expiry-notify path — the largest build in this area.
**ALTERNATIVE A — Keep current logic:** no D02; Stripe's 24 h session + manual expire/resume is the rule. Scenario: a shift 90 minutes away is held up to 24 h by an unpaid reservation; the owner must remember to expire it. Trade-off: zero build; D01/D03 stay partly fictional and urgent shifts stay fragile.
**ALTERNATIVE B — One fixed window:** every reservation gets 24 h (or 6 h), capped at shift start, with a job. Scenario: simpler to explain than four bands; a shift 90 minutes away still gets 90 minutes, not 30. Trade-off: less code than D02, weaker for urgent shifts.
**ALTERNATIVE C — Deadline only, no job:** store a D02 deadline and enforce it lazily (on list/accept/pay, like offer expiry today). Scenario: a stale reservation only dies when someone looks at the shift. Trade-off: cheapest; a worker can still be held past start until someone looks.
**Other (describe) / Defer:** deferring keeps the current Stripe-only rule by default.
**Sources:** `backend/billing/checkout_reservations.py`, `backend/core/settings.py:271` (`CELERY_BEAT_SCHEDULE`), `backend/shifts/offers.py:accept`, `backend/shifts/assignment.py:22`.
**Decision status:** OPEN — **ask first (Part D)**.

### GM13-Q02 — When a reservation expires unpaid, what exactly happens? (carried D03)

**Plain English:** D03 says an unpaid reservation is released to the same audience and both sides are told, with no penalty and no auto-escalation. Nothing in the code does any of that, because nothing expires a reservation. The owner needs to confirm D03 still stands and what "release" means now that reservations are persisted occurrence holds.
**ACTUAL TODAY — Web and Expo (same):** no expiry event, no release, no notification. Expiring a checkout manually only deactivates its `FulfillmentReservation` rows; the shift is not re-offered and nobody is told.
**RECOMMENDED:** KEEP D03 as decided (release to the same audience, notify worker + manager, no penalty, no auto-escalation) — and implement it as part of GM13-Q01. Severity: medium (it only matters once Q01 creates an expiry).
**ALTERNATIVE A — Keep current logic:** manual expiry only, no release, no notice. Trade-off: the shift sits open but the worker who was waiting is never told they are free, and the manager is never told to re-offer.
**ALTERNATIVE B — Auto-offer the next applicant on expiry:** fastest refill; risks picking someone the pharmacy did not want (needs GM-12's applicant ordering).
**Other / Defer.**
**Sources:** `backend/billing/checkout_reservations.py:expire_checkout`, `backend/shifts/offers.py`.
**Decision status:** OPEN.

### GM13-Q03 — Should reservations show a live payment countdown? (carried BK-Q13)

**Plain English:** the old grill said both sides already see "reserved, not yet confirmed" plus a pay-by time, and asked about adding a live countdown. That description is out of date: there is no pay-by time (D02 not built), and the owner card shows "Payment required to confirm" with a dollar total and Pay buttons, but no time at all. The worker-side wording the old grill quoted was not found in the current worker detail page.
**ACTUAL TODAY — Web:** owner card "Payment required to confirm", `$n × 30 AUD`, per-offer checkboxes, "Pay with Stripe" / "Pay with Pills" (`ActiveShiftCard.tsx`); no time, no countdown. **ACTUAL TODAY — Expo:** same section, same wording, same `$n × 30` total (`ActiveShiftsPage/ActiveShiftCards.tsx`). **ACTUAL TODAY — Next:** no pay section at all (F02). **Worker side:** UNKNOWN — `WorkerShiftDetailPage.tsx` contains no "Waiting for owner payment" / "Awaiting" / "reserved" / "expires" text.
**RECOMMENDED:** A — add a live countdown **once Q01 sets a deadline** (counting down to a deadline that does not exist yet is impossible). Until then, show the state + the Stripe session's remaining time if available. Severity: low-medium (usability, not correctness).
**ALTERNATIVE A — Keep current logic:** state + total + Pay buttons, no time. Trade-off: no work; owners cannot tell how long they have.
**ALTERNATIVE B — Show as booked:** misleading while unpaid — do not do it (the old grill already rejected this).
**Other / Defer:** defer until Q01 is decided.
**Sources:** `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/ActiveShiftCard.tsx`, `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/ActiveShiftCards.tsx`, `frontend_web/src/pages/dashboard/sidebar/WorkerShiftDetailPage.tsx`.
**Decision status:** OPEN.

### GM13-Q04 — Can a worker drop a reservation before payment without an incident? (carried BK-Q14)

**Plain English:** today a worker who accepted an offer and then cannot come has no way to release the hold — the reservation only ends when the pharmacy pays, expires the checkout, or the Stripe session lapses. Nothing is confirmed until payment (D01), so holding the worker to it looks wrong.
**ACTUAL TODAY — Web and Expo (same):** no withdraw action for an `ACCEPTED_AWAITING_PAYMENT` offer exists in the traced code.
**RECOMMENDED:** A — yes, no incident: the worker can release the reservation; the pharmacy is notified and the shift reopens (ties to Q02). Severity: medium. Benefit: slots stop being held by workers who already know they cannot come. Risk: needs a worker-facing action + notice on both clients; a worker could accept-then-drop repeatedly (rate-limit / reliability signal is GM-15 territory).
**ALTERNATIVE A — Keep current logic:** worker cannot drop; the reservation is paid or expires. Trade-off: simplest; slots stay held.
**ALTERNATIVE B — Free for 15 minutes, then counts:** covers accidental taps only.
**ALTERNATIVE C — Counts as a cancellation:** treats a reservation like a booking — contradicts D01 (nothing is confirmed until paid).
**Other / Defer.**
**Sources:** `backend/shifts/offers.py` (no withdraw action), `backend/billing/checkout_reservations.py`.
**Decision status:** OPEN.

### GM13-Q05 — How long does an offer stay open? (carried BK-Q05 / LA-Q09 / SH-07)

**Plain English:** offers stay open a flat 48 hours, even if the shift starts sooner — an offer can still be "pending" after the shift has started. The old grill recommended scaling with lead time like D02.
**ACTUAL TODAY — Web and Expo (same backend):** `OFFER_EXPIRY_HOURS = 48` (`assignment.py:22`); `expires_at = now + 48 h`, not capped at shift start; expiry applied lazily when the offer list is opened or on accept.
**RECOMMENDED:** B — scale with lead time like D02 (24h/6h/2h/30min, capped at start), once Q01 is decided — one timing model for offers and payments. Severity: medium. Benefit: urgent offers stop outliving their shifts. Risk: needs the same deadline machinery as Q01.
**ALTERNATIVE A — Keep current logic:** flat 48 h, uncapped. Trade-off: no work; urgent offers stay pending past start.
**ALTERNATIVE B — 48 h, capped at start:** simple fix; still a long hold for urgent shifts.
**Other / Defer.**
**Sources:** `backend/shifts/assignment.py:22,105,273,285`, `backend/shifts/offers.py:184,355`.
**Decision status:** OPEN.

### GM13-Q06 — When an offer is declined or expires, what happens to the shift? (carried BK-Q06)

**Plain English:** a decline tells the owner and the shift stays open. An expiry is silent — nobody is told and nobody is offered the shift next. The old grill recommended reopening to the same audience and telling the manager.
**ACTUAL TODAY — Web and Expo (same):** decline notifies the owner; expiry changes status silently (lazy expiry in `offers.py:list`; no notification path found).
**RECOMMENDED:** A — reopen to the same audience, tell the manager (matches D03). Severity: low-medium. Benefit: managers stop waiting on dead offers.
**ALTERNATIVE A — Keep current logic:** shift stays open; owner told on decline only.
**ALTERNATIVE B — Back to the manager to pick:** shift waits for a person.
**ALTERNATIVE C — Auto-offer the next applicant:** fast, may pick someone unwanted.
**Other / Defer.**
**Sources:** `backend/shifts/offers.py:184` (lazy expiry), `backend/shifts/offers.py:677` (decline).
**Decision status:** OPEN.

### GM13-Q07 — Can a pharmacy offer one shift to several workers at once? (carried BK-Q07)

**Plain English:** yes, today — several workers can hold offers for one slot; the first to accept reserves it, later ones get "already reserved", and the rest expire once the booking confirms.
**ACTUAL TODAY — Web and Expo (same backend):** verified in the accept flow (slot lock, `ACCEPTED_AWAITING_PAYMENT` check) and in `finalize_shift_offer` → `expire_competing_offers`.
**RECOMMENDED:** KEEP — several offers, first to accept wins, rest expire. It matches Qwick/Hireup and is already built.
**ALTERNATIVE A — Keep current logic:** same as recommended.
**ALTERNATIVE B — One at a time:** slow for urgent shifts.
**Other / Defer.**
**Sources:** `backend/shifts/offers.py:accept`, `backend/shifts/finalize.py:expire_competing_offers`.
**Decision status:** OPEN.

### GM13-Q08 — What happens after booking payment fails? (carried BK-R01; SH-13 has no definition)

**Plain English:** a failed or cancelled Stripe checkout does not confirm the booking. The owner can resume the same checkout or expire it and start a replacement — but there is no "original deadline" to retry until, because D02 was never built; the practical bound is Stripe's 24-hour session. And the gap this question cites, SH-13, is never defined anywhere in the #184 audit.
**ACTUAL TODAY — Web:** 409 conflict dialog (resume / expire-and-replace / cancel) + `useShiftPaymentActions.recoverCheckout`. **ACTUAL TODAY — Expo:** same via native alert. **Backend:** failed Stripe call → 400, attempt unchanged; uncertain provider acknowledgement → 503 `checkout_uncertain` ("Retry this unchanged request; do not create another payment"); expired/unpaid session must be provider-confirmed before a replacement.
**RECOMMENDED:** KEEP the retry-until-deadline rule **once Q01 creates a deadline**; until then the rule is "retry the same attempt (resume) or expire-and-replace, within the Stripe session's 24 h". Severity: medium. Also: SH-13 must be defined or dropped — it cannot be cited as a gap.
**ALTERNATIVE A — Keep current logic (as above).** **ALTERNATIVE B — Release immediately:** one failed attempt loses the worker. **ALTERNATIVE C — Extend once:** failure grants extra reservation time.
**Other / Defer.**
**Sources:** `backend/billing/checkout_reservations.py` (`prepare_checkout`, `open_checkout`, `expire_checkout`), `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts`, `docs/qa/launch-grill/AUDIT.md` (no SH-13).
**Decision status:** OPEN.

### GM13-Q09 — Payment arrives after expiry: credit, refund, or nothing — and who decides? (carried F04; GM-17 boundary)

**Plain English:** the money is recorded and flagged for reconciliation, the owner is told the payment needs a refund or manual follow-up, and no rebooking happens. But there is no credit/refund choice in the app and no approver workflow — that is GM-17's question, and GM-13 must not answer it alone.
**ACTUAL TODAY — Web and Expo (same):** `reconciliation_required=True` + reason + owner notification; no in-app refund/credit action (GM-17 adopted).
**RECOMMENDED:** Do not decide here. Adopt GM-17-Q01's answer when the owner gives it (refund over 72 h / credit inside 72 h is GM-17's recommendation), and build the GM-13 half as: reconciliation queue entry + notify owner + finance/support action. Severity: high for launch (money taken with no way back in-app).
**ALTERNATIVE A — Keep current logic:** flag + notify, manual handling outside the app.
**Other / Defer:** defer the build, not the decision — launch with live payments and no refund path is the risk GM-17-Q01 gates.
**Sources:** `backend/billing/payment_events.py:handle_payment_checkout`, `backend/billing/paid_fulfillment.py:finalize_paid_selection`; GM-17 senior review.
**Decision status:** OPEN — **owned by GM-17-Q01; GM-13 adopts it**.

### GM13-Q10 — Should pharmacies save a payment method during setup? (carried ON-Q13 / ON-08)

**Plain English:** every booking opens a fresh Stripe Checkout and no card is stored. The old grill's urgency argument was the 30-minute D02 window — which does not exist — so the case for a saved card is weaker than stated, but the 24-hour Stripe session is still a slow, failure-prone path for urgent shifts.
**ACTUAL TODAY — Web and Expo (same):** fresh Checkout Session per booking (`shift_payments.py` + `checkout_reservations.py`); a Stripe `customer` is reused only when a subscription exists; no saved-card / auto-charge endpoint exists.
**RECOMMENDED:** B — save a card at setup, charge on acceptance (confirms in seconds; payment is still verified per D01). Severity: medium-high for urgent shifts. Benefit: the tightest failure point in the flow disappears. Risk: needs card storage (Stripe Customer + PaymentMethod), a charge-on-acceptance path, and failure handling (what if the saved card fails at acceptance — GM13-Q08's retry rule must cover it).
**ALTERNATIVE A — Keep current logic:** one Checkout per booking; no stored card.
**ALTERNATIVE B — Saved card for subscribers only:** others keep one checkout per booking.
**Other / Defer.**
**Sources:** `backend/billing/shift_payments.py` (GM-16 verified), `backend/billing/views.py:charge_shift_fulfillment`, `backend/billing/checkout_reservations.py`.
**Decision status:** OPEN.

### GM13-Q11 — When must worker pay details be ready — and who sees the gap early? (carried ON-Q04 / ON-11; GM-14 owns the wording)

**Plain English:** the worker's TFN/ABN + super details are checked only when they accept an offer — the accept is blocked until the profile is complete. Whether the pharmacy sees the gap earlier (on apply/offer screens) was not re-traced in GM-13; GM-14 owns that half.
**ACTUAL TODAY — Web and Expo (same backend):** `_external_payment_profile` blocks accept with field-level errors; `worker_payment_profile_status` reports the readiness state.
**RECOMMENDED:** B (from #184) — before accepting, shown early (apply + offer screens). GM-14 to confirm the exposure half before this is decided.
**ALTERNATIVE A — Keep current logic:** at accept only. **ALTERNATIVE B — Before applying. ALTERNATIVE C — Before first payout only.**
**Other / Defer.**
**Sources:** `backend/shifts/engagement.py:199,265` (GM-14 verified); GM-14.
**Decision status:** OPEN — **do not decide until GM-14 confirms the exposure half**.

### GM13-Q12 — The old 10%/20% penalty route is still live. Remove it? (carried LA-Q06 / SH-02; GM-16 owns the charge)

**Plain English:** the legacy cancellation-penalty charge (20% ≤24 h, 10% 24–72 h of total wages, ad-hoc Stripe checkout, no payee recorded) still exists in code, is still routed, and is still exported to the clients — even though the carried decisions say no money penalties for workers ever, and the P09 table that would replace it is not built.
**ACTUAL TODAY — Web and Expo (same):** function present (`shift_payments.py::charge_penalty`, GM-16 verified), route present (`billing/urls.py` line 16, GM-17 adopted), shared-core export present (`chargeShiftPenalty`). No UI was found calling it in the traced screens.
**RECOMMENDED:** Remove or suspend before launch (GM-16-Q03 agrees). Severity: high — a callable legacy charge with no disclosed recipient and no agreement text naming it.
**ALTERNATIVE A — Keep current logic:** leave function + route live. **ALTERNATIVE B — Remove the route, keep the function dead. ALTERNATIVE C — Replace with the P09 table after legal review (GM-16-Q11/Q14).**
**Other / Defer.**
**Sources:** `backend/billing/shift_payments.py` (GM-16), `backend/billing/urls.py` (GM-17 adopted), `shared-core/src/domains/billing/api.ts`.
**Decision status:** OPEN — **owned by GM-16-Q03; GM-13 adopts it**.

### GM13-Q13 — AHPRA cancellation strands the payment reservation. Fix the release? (carried LA-P01)

**Plain English:** when AHPRA cancels a worker's future bookings, the offer is declined — but the persisted checkout reservation and any opened Stripe session are left behind, so the occurrence stays reserved and nobody else can pay for it until someone manually expires the checkout.
**ACTUAL TODAY — Web and Expo (same backend):** `cancel_upcoming_assignments` declines `ACCEPTED_AWAITING_PAYMENT` offers and deletes assignments, but never touches `FulfillmentCheckout`/`FulfillmentReservation` or Stripe sessions (F07).
**RECOMMENDED:** A — before launch: the AHPRA-cancel path must also expire the checkout (provider-confirmed) and release the occurrence hold, and the Stripe session must be expired. Severity: high (a stuck paid-or-payable reservation blocks refills and can take money for a cancelled booking).
**ALTERNATIVE A — Keep current logic:** decline only; manual expiry by support.
**Other / Defer.**
**Sources:** `backend/shifts/cancellation.py:cancel_upcoming_assignments`, `backend/billing/checkout_reservations.py:expire_checkout`, `backend/billing/checkout_reservations.py:guard_fulfillment`.
**Decision status:** OPEN.

## Part D — SINGLE first decision question to ask the owner

**GM13-Q01 — The pay-by window does not exist. Should D02 be built as decided, or is Stripe's 24 hours the rule?**

Plain English: you already decided (D02) that a pharmacy gets 24 hours, 6 hours, 2 hours or 30 minutes to pay depending on how soon the shift starts. The code never built it — today a reservation has no deadline at all, and nothing ever expires it on a schedule. The only clock is Stripe's own 24-hour Checkout session.

- **Option A — RECOMMENDED — Build D02 as decided:** 24h / 6h / 2h / 30min by lead time, capped at shift start, plus a scheduled expiry job and D03 release-and-notify. *Scenario:* a shift 90 minutes away gives the pharmacy 30 minutes; if unpaid, the worker is freed and told, the manager is told, and the shift reopens. *Benefit:* D01/D03 become true; urgent shifts stop being held past start. *Risk:* the largest build in this area (deadline field, beat task, countdown UI, expiry notices).
- **Option B — Keep current logic:** no D02; Stripe's 24 h session + manual expire/resume is the rule. *Scenario:* a shift 90 minutes away can be held up to 24 h by an unpaid reservation. *Trade-off:* zero build; D01/D03 stay partly fictional.
- **Option C — One fixed window:** every reservation gets 24 h (or 6 h), capped at shift start, with a job. *Scenario:* simpler than four bands; a 90-minute shift still gets 90 minutes, not 30. *Trade-off:* less code than A, weaker for urgent shifts.
- **Option Other (describe) / Defer:** deferring keeps option B by default.

*Ask this first because every other GM-13 question assumes a deadline exists: the countdown (Q03), the expiry release (Q02), the retry rule (Q08), the saved-card urgency (Q10), and the offer-expiry scaling (Q05) all hang off it.*

## Part E — Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; timing is the only question)
1. **CG-1 — D02 not implemented** (no deadline field, no bands, no expiry job). Build after Q01 = A/B/C.
2. **CG-2 — No expiry job at all** (`CELERY_BEAT_SCHEDULE` has no reservation/offer/escalation job). The Oct "expiry every 60 s" claim is false at this head.
3. **CG-3 — LA-P01: AHPRA-cancel path strands the checkout reservation + Stripe session** (F07). Fix before launch (Q13).
4. **CG-4 — Owner pay card shows `$n × 30 AUD` always** (`ActiveShiftCard.tsx`, Expo `ActiveShiftCards.tsx`): PT/FT $80 and the subscriber $15/$40 are not reflected in the displayed total. The server charges the right price (GM-16 verified) — the display is wrong.
5. **CG-5 — No missed-webhook recovery**: no polling/reconciliation job; a paid checkout whose webhook never arrives stays unfinalised until manual reconciliation. (Webhook dedupe + Stripe retries + reconciliation flags exist; the gap is the absence of a sweeper.)
6. **CG-6 — `auto_escalate_due_shifts` has no schedule**: the function exists (`escalation.py:81`) but no beat entry calls it and no caller was found in the traced files — escalation (and therefore match-email timing) depends on something invoking it. GM-11/GM-19 boundary.
7. **CG-7 — Next has no pay UI**: the migrated ShiftsBoard contains no payment section; an owner on Next cannot pay a reservation from the Next surface as traced.
8. **CG-8 — SH-13 is undefined**: `AUDIT.md` contains no SH-13 definition; only BK-R01's `gap` field cites it. Define it or drop the citation.

### Decision gaps (owner must choose first — do not build until answered)
- DG-1 — Pay-by window: build D02 / keep Stripe-24h / fixed window (Q01) ★ first. DG-2 — Expiry release + notices (Q02). DG-3 — Countdown display (Q03, after Q01). DG-4 — Worker drop-reservation (Q04). DG-5 — Offer-expiry scaling (Q05, with Q01). DG-6 — Decline/expiry fallback (Q06). DG-7 — Payment-failure retry rule + SH-13 definition (Q08). DG-8 — Saved card / auto-charge (Q10). DG-9 — Payment-after-expiry remedy (Q09 — owned by GM-17-Q01). DG-10 — Legacy penalty removal (Q12 — owned by GM-16-Q03). DG-11 — AHPRA-cancel release (Q13). DG-12 — Worker payment-readiness exposure (Q11 — owned by GM-14).

## Part F — Documentation matrix (per-question source links, head `97c4543e`)

| Question | Status | Source |
|---|---|---|
| GM13-Q01 (D02) | NOT IMPLEMENTED | `checkout_reservations.py`, `settings.py:271`, `offers.py:accept` |
| GM13-Q02 (D03) | NOT IMPLEMENTED | `checkout_reservations.py:expire_checkout` |
| GM13-Q03 (BK-Q13) | CHANGED | `ActiveShiftCard.tsx`, Expo `ActiveShiftCards.tsx`, `WorkerShiftDetailPage.tsx` (zero hits) |
| GM13-Q04 (BK-Q14) | STILL VALID | `offers.py` (no withdraw action) |
| GM13-Q05 (BK-Q05/SH-07) | STILL VALID | `assignment.py:22,105,273,285`, `offers.py:184,355` |
| GM13-Q06 (BK-Q06) | STILL VALID | `offers.py:184,677` |
| GM13-Q07 (BK-Q07) | STILL VALID | `offers.py:accept`, `finalize.py:expire_competing_offers` |
| GM13-Q08 (BK-R01/SH-13) | CHANGED; SH-13 undefined | `checkout_reservations.py`, `useShiftPaymentActions.ts`, `AUDIT.md` |
| GM13-Q09 (F04) | PARTLY TRUE; owned by GM-17-Q01 | `payment_events.py`, `paid_fulfillment.py` |
| GM13-Q10 (ON-Q13) | STILL VALID | `shift_payments.py` (GM-16), `views.py:charge_shift_fulfillment` |
| GM13-Q11 (ON-Q04) | STILL VALID (gate); exposure → GM-14 | `engagement.py:199,265` |
| GM13-Q12 (LA-Q06) | STILL VALID; owned by GM-16-Q03 | `shift_payments.py`, `urls.py` (GM-17 adopted), `sc-billing-api` |
| GM13-Q13 (LA-P01) | STILL VALID (worse) | `cancellation.py:cancel_upcoming_assignments`, `checkout_reservations.py:guard_fulfillment` |

Decision status per question: **all 13 questions are OWNER DECISION: NOT ASKED / NOT DECIDED.** No decision, no implementation, no PR.

### Implementation backlog — FROZEN until the owner answers (nothing here is decided)
1. Q01: D02 deadline field + bands + scheduled expiry job + countdown data (web + Expo + Next parity decision).
2. Q02: expiry release-to-audience + notify worker/manager (D03).
3. Q03: live countdown UI once a deadline exists.
4. Q04: worker drop-reservation action + notice.
5. Q05/Q06: offer-expiry cap/scaling + expiry notifications.
6. Q08: payment-failure retry wording + SH-13 definition (or removal).
7. Q10: saved card at setup + charge-on-acceptance (if chosen).
8. Q13: AHPRA-cancel path expires checkout + Stripe session + releases the hold.
9. CG-4: pay card shows the true fee (locum vs PT/FT, subscriber vs standard) before payment.
10. CG-5: missed-webhook sweeper/reconciliation queue (with GM-17).
11. CG-7: Next pay surface — build it or route Next owners to Vite for payment (GM-25).
12. Cross-client tests per decision (positive/negative, role/tenant, duplicate webhook, 409 conflict, 503 uncertain, orphaned session, AHPRA-cancel during reservation, expiry past shift start).

### Unknowns left (explicit)
- U-1: worker-side reservation wording ("Waiting for owner payment" not found in `WorkerShiftDetailPage.tsx`) — which screen shows a worker their unpaid reservation, and what does it say?
- U-2: who calls `announce_posted_shift` / `announce_availability_matches` (posting flow, GM-10) and who calls `auto_escalate_due_shifts` (no schedule found).
- U-3: whether the live Next site serves the migrated ShiftsBoard copy, and where Next owners pay today (if anywhere).
- U-4: the extra 12 questions behind Issue #250's "142" (vs 130 counted in `questions.json`).
