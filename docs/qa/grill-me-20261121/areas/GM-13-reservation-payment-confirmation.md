# GM-13 — Reservation / payment confirmation — Full Grill Documentation

> **Corrections against current code (21 Nov 2026 review).** 14 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 8 hold, 6 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q01 | “no deadline field” at all | WRONG if it includes provider expiry | Checkout stores `provider_expires_at`. This is provider metadata, not the missing D02 business deadline. | `main:backend/billing/models.py:166`; `pr257:backend/billing/checkout_reservations.py:147` |
| Q01 / Q04 / Q08 | reservation ends when Stripe’s session lapses | WRONG | Stripe session expiry alone does not clear the application’s reservation or accepted-awaiting-payment offer. Remove the promise that the worker or occurrence is automatically freed after 24 hours. | webhook handling: `main:backend/billing/webhooks.py:25`; persistent release: `pr257:backend/billing/checkout_reservations.py:197`; offer hold: `pr257:backend/shifts/assignment.py:246` |
| Q11 | “TFN/ABN + super … accept blocked until complete” | WRONG | ABN completeness blocks acceptance. TFN/super incompleteness can defer payroll while the worker accepts; this question must match GM-02 and GM-12. | ABN gate: `main:backend/shifts/engagement.py:272`; TFN deferral: `pr257:backend/shifts/engagement.py:660`; `:703` |
| Q12 / CG legacy penalty | “legacy … charge … still live” | UNVERIFIABLE as production collection; code is gated | The legacy owner-charge route exists, but live collection is disabled by default and guarded. Describe its dormant calculation defects and require deployment verification before calling it a live production charge. | permission: `pr257:backend/billing/views.py:181`; charge guard: `main:backend/billing/shift_payments.py:223`; release flag: `pr257:backend/billing/release_guards.py:28`; default: `pr257:backend/core/settings.py:679` |
| W01 | “refund the rest” after orphan recovery | WRONG if described as automatic refund (already fixed in the W question text) | Recovery can preserve available work and flag unavailable paid work for refund/manual follow-up. The inspected path does not itself execute that refund. | `pr257:backend/billing/checkout_reservations.py:180`; `pr257:backend/billing/paid_fulfillment.py:36`; `:52` |
| W02 | paid work released “as soon as assignment rows are gone” | WRONG about timing and slotless condition (already fixed in the W question text) | Released paid work is detected lazily during checkout preparation or fulfilment guarding. A slotless accepted offer continues to hold its work even without assignment rows. | `main:backend/billing/checkout_reservations.py:49`; `pr257:backend/billing/checkout_reservations.py:60`; callers: `:74`, `:245` |

> **Independent senior audit correction, 21 November 2026:** D02 and D03 are **ALREADY APPROVED** owner rules, not fresh questions. D02: >48 h before shift start gives 24 h to pay; 12–48 h gives 6 h; 2–12 h gives 2 h; <=2 h gives 30 min; deadline never extends past start. D03: on unpaid expiry, release to the SAME audience and notify manager and worker with no automatic escalation or penalty. `checkout_reservations.py` stores a Stripe provider expiry but not the D02 business deadline. Treat GM13-Q01/Q02 as **IMPLEMENTATION GAP and validation checkpoint**, not a prompt to choose Stripe 24h as an alternative to a settled policy. Preserve the original trace as historical source evidence. See [owner ledger](../OWNER_DECISION_LEDGER.md).


**Area:** GM-13 Reservation/payment confirmation (Issue #250, area 13 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED + VALIDATED at PR #249 head. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only. This file overwrites the 2026-11-21 partial, which was BLOCKED by a GitHub 429 before any current-code check.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Worker accepts offer and creates reservation | Offer transitions to `ACCEPTED_AWAITING_PAYMENT` holding the slot (`frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:468`). | Offer transitions to `ACCEPTED_AWAITING_PAYMENT` holding the slot (`frontend_mobile/roles/pharmacist/shifts/[id].tsx:356`). | Yes | - |
| Owner opens Stripe checkout | Calls `chargeShiftFulfillment` and redirects to Stripe Checkout (; Next lacks payment UI at ) (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:30`). | Calls `chargeShiftFulfillment` and opens Stripe Checkout URL via `Linking.openURL` (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:228`). | Yes | - |
| Stripe checkout completes via webhook | Webhook finalises booking and web UI refreshes on reload (`backend/billing/webhooks.py:25`). | Webhook finalises booking and mobile UI updates on reload (`backend/billing/webhooks.py:25`). | Yes | - |
| Owner pays booking with Pills | Owner invokes `payShiftWithPills` to finalise shift without Stripe (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:12`). | Owner invokes `payShiftWithPills` to finalise shift without Stripe (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:204`). | Yes | - |
| Concurrent checkout conflict | Displays conflict dialog offering to resume or expire session (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:5`). | Displays native alert offering to resume, expire, or cancel (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:246`). | Yes | - |
| Lazy offer expiry | Offer list query triggers backend bulk-expiry of stale offers (`frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:374`). | Offer query triggers backend bulk-expiry of stale offers (`frontend_mobile/roles/pharmacist/shifts/[id].tsx:154`). | Yes | - |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM13-Q01 | Web + Expo |
| GM13-Q02 | Web + Expo |
| GM13-Q03 | Web + Expo (asked in GM-12: GM-12-Q24) |
| GM13-Q04 | Web + Expo (asked in GM-12: GM-12-Q20) |
| GM13-Q05 | Web + Expo (asked in GM-12: GM-12-Q10) |
| GM13-Q06 | Web + Expo (asked in GM-11: GM-11-Q10) |
| GM13-Q07 | Web + Expo (asked in GM-12: GM-12-Q12) |
| GM13-Q08 | Web + Expo (also covers GM15-41, GM16-Q07) |
| GM13-Q09 | Web + Expo |
| GM13-Q10 | Web + Expo (asked in GM-02: ON-Q13) |
| GM13-Q11 | Web + Expo |
| GM13-Q12 | Web + Expo (also covers GM15-46, GM16-Q03, GM17-Q17, GM-18-Q20) |
| GM13-Q13 | Web + Expo (also covers GM15-44) |
| GM-13-W01 — Should operator recovery of a paid orphan checkout ever book the work? | Web + Expo |
| GM-13-W02 — Should only a recorded cancellation release paid work? | Web + Expo |

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
| D02 | Pay-by window: >48h 24h; 12–48h 6h; 2–12h 2h; <2h 30 min; never past shift start | Answered: use these pay-by bands, carried D02 - see GM13-Q01 | Stripe expiry is recorded. The app has no D02 deadline or scheduled release. Engineering: see BL-06. |
| D03 | Unpaid reservation expiry | Answered: reopen to the same audience, notify both sides, no penalty or automatic escalation, carried D03 - see GM13-Q02 | Manual provider-confirmed expiry and the 48-hour operator path can deactivate the hold. The app has no scheduled D03 offer transition or notices. Engineering: see BL-06. |
| F01 | Pharmacy cancels: booking fee, refund/credit, worker pay stay separate | **STILL VALID (adopted GM-15/GM-17)** | No code contradicts it; no cancellation-charge engine exists to merge them. Boundary: GM-15/GM-17 own the money decisions |
| F04 | Payment arrives after expiry | Answered: no rebooking; pharmacy chooses credit or refund after approved review, carried F04 - see REFUND-01 | The app flags reconciliation and notifies managers. GM17-Q03 owns who approves and how quickly. GM-13-W01 asks about a possible orphan-recovery exception. |
| P07/P09/FEES | Owner fees by time before shift; % of frozen wages, cancelled dates only | **NOT GM-13 — boundary GM-15/GM-17** | P09 is a preview-only calculator (GM-15 adopted: calculator gone / not connected); the only charging code is the legacy 10%/20% penalty (GM-16). GM-13 must not re-decide it |
| BK-Q05 | How long does an offer stay open? | **STILL VALID** | Flat 48 h, not capped at shift start (`assignment.py:22,105,273,285`); expiry applied lazily on list/accept (`offers.py:184,355`). Carried forward as GM13-Q05 |
| BK-Q06 | Offer declined/expired — what happens to the shift? | **STILL VALID** | Decline notifies the owner, shift stays open (accept flow + notifications in `offers.py`); expiry is silent, no next-applicant offer (no code path found; `expire_competing_offers` only runs on finalisation). Carried forward as GM13-Q06 |
| BK-Q07 | Offer one shift to several workers at once? | **STILL VALID** | Several offers per slot allowed; first acceptance reserves (slot lock in `accept`); later acceptances fail "already locked or awaiting payment"; rest expire once the booking confirms (`finalize_shift_offer` → `expire_competing_offers`). Carried forward as GM13-Q07 |
| BK-Q13 | Live payment countdown on reservations? | **CHANGED** | The Oct "current" (both sides see "reserved, not yet confirmed" + pay-by time) does **not** match current code: there is no pay-by time to show (D02 not implemented) and no countdown anywhere. What exists: owner card "Payment required to confirm" + `$n × 30 AUD` + Pay buttons (Vite `ActiveShiftCard.tsx`, Expo `ActiveShiftsPage/ActiveShiftCards.tsx`); the worker-side "Waiting for owner payment" wording was **not found** in `WorkerShiftDetailPage.tsx` (zero hits) — its current wording is UNKNOWN, not verified. Carried forward as GM13-Q03 |
| BK-Q14 | Can a worker drop a reservation before payment without an incident? | **STILL VALID** | No withdraw action exists in the traced code: no worker endpoint ends an `ACCEPTED_AWAITING_PAYMENT` offer; it ends only on payment, explicit owner expiry of the checkout, AHPRA decline (F07), or Stripe session expiry. Carried forward as GM13-Q04 |
| BK-R01 / SH-13 | What happens after booking payment fails? | **CHANGED — and SH-13 is undefined** | `SH-13` has **no definition** in `AUDIT.md` (only the `gap: SH-13` field on BK-R01 in `questions.json`). The retry behaviour today: a failed/cancelled Stripe attempt leaves the `FulfillmentCheckout` PREPARED/OPEN/UNKNOWN; the owner can resume the same attempt or expire it and start a replacement (F05); a Stripe provider error returns 400/503 and changes nothing. There is no "original deadline" to retry until, because D02 does not exist — the effective bound is the Stripe session's 24 h. Carried forward as GM13-Q08 |
| ON-Q13 (ON-08) | Should pharmacies save a payment method during setup? | **STILL VALID** | Every booking opens a new Stripe Checkout; no card is stored anywhere in the traced code (no saved-card endpoint; `charge_shift_fulfillment` creates a fresh Session per booking; a Stripe `customer` is reused only when a subscription exists). The Oct rationale cites a 30-minute D02 window that does not exist — the urgency argument is weaker than stated, but the no-saved-card fact stands. Carried forward as GM13-Q10 |
| ON-Q04 (ON-11) | When must pay details be ready? | Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04 | ABN can block acceptance; TFN/super defers payroll. Engineering: see BL-03. |
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

### GM13-Q01 — Pay-by window (D02)

**Decision status:** Answered: payment is due in 24 h, 6 h, 2 h or 30 min depending on the shift start, carried D02 - see BL-06.

**Actual today:** Provider expiry metadata is stored. Stripe session expiry alone does not release the app hold or expire the offer. An authorised manual checkout expiry can deactivate the hold after the provider confirms the expiry (`pr257:backend/billing/checkout_reservations.py:147`, `:197`, `:216`). Engineering: see BL-06.

### GM13-Q02 — Unpaid expiry (D03)

**Decision status:** Answered: release to the same audience, notify the worker and manager, charge no penalty and do not auto-escalate, carried D03 - see BL-06.

**Actual today:** Manual checkout expiry releases the active checkout hold. It does not run the D03 offer transition or notify the worker and manager (`pr257:backend/billing/checkout_reservations.py:197`, `:216`). Engineering: see BL-06.

### GM13-Q03 — Should reservations show a live payment countdown? (carried BK-Q13)

> **Merged 22 Nov: asked once, as GM-12-Q24 in GM-12.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** the old grill said both sides already see "reserved, not yet confirmed" plus a pay-by time, and asked about adding a live countdown. That description is out of date: there is no pay-by time (D02 not built), and the owner card shows "Payment required to confirm" with a dollar total and Pay buttons, but no time at all. The worker-side wording the old grill quoted was not found in the current worker detail page.
**ACTUAL TODAY — Web:** owner card "Payment required to confirm", `$n × 30 AUD`, per-offer checkboxes, "Pay with Stripe" / "Pay with Pills" (`ActiveShiftCard.tsx`); no time, no countdown. **ACTUAL TODAY — Expo:** same section, same wording, same `$n × 30` total (`ActiveShiftsPage/ActiveShiftCards.tsx`). **ACTUAL TODAY — Next:** no pay section at all (F02). **Worker side:** UNKNOWN — `WorkerShiftDetailPage.tsx` contains no "Waiting for owner payment" / "Awaiting" / "reserved" / "expires" text.
**RECOMMENDED:** A — add a live countdown **once Q01 sets a deadline** (counting down to a deadline that does not exist yet is impossible). Until then, show the state + the Stripe session's remaining time if available. Severity: low-medium (usability, not correctness).
**ALTERNATIVE A — Keep current logic:** state + total + Pay buttons, no time. Trade-off: no work; owners cannot tell how long they have.
**ALTERNATIVE B — Show as booked:** misleading while unpaid — do not do it (the old grill already rejected this).
**Other / Defer:** defer until Q01 is decided.
**Sources:** `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/ActiveShiftCard.tsx`, `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/ActiveShiftCards.tsx`, `frontend_web/src/pages/dashboard/sidebar/WorkerShiftDetailPage.tsx`.
**Decision status:** OPEN.

### GM13-Q04 — Can a worker drop a reservation before payment without an incident? (carried BK-Q14)

> **Merged 22 Nov: asked once, as GM-12-Q20 in GM-12.** Answer it there; this copy stays for its own evidence and is not asked again.

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

> **Merged 22 Nov: asked once, as GM-12-Q10 in GM-12.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** offers stay open a flat 48 hours, even if the shift starts sooner — an offer can still be "pending" after the shift has started. The old grill recommended scaling with lead time like D02.
**ACTUAL TODAY — Web and Expo (same backend):** `OFFER_EXPIRY_HOURS = 48` (`assignment.py:22`); `expires_at = now + 48 h`, not capped at shift start; expiry applied lazily when the offer list is opened or on accept.
**RECOMMENDED:** B — scale with lead time like D02 (24h/6h/2h/30min, capped at start), once Q01 is decided — one timing model for offers and payments. Severity: medium. Benefit: urgent offers stop outliving their shifts. Risk: needs the same deadline machinery as Q01.
**ALTERNATIVE A — Keep current logic:** flat 48 h, uncapped. Trade-off: no work; urgent offers stay pending past start.
**ALTERNATIVE B — 48 h, capped at start:** simple fix; still a long hold for urgent shifts.
**Other / Defer.**
**Sources:** `backend/shifts/assignment.py:22,105,273,285`, `backend/shifts/offers.py:184,355`.
**Decision status:** OPEN.

### GM13-Q06 — When an offer is declined or expires, what happens to the shift? (carried BK-Q06)

> **Merged 22 Nov: asked once, as GM-11-Q10 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.

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

> **Merged 22 Nov: asked once, as GM-12-Q12 in GM-12.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** yes, today — several workers can hold offers for one slot; the first to accept reserves it, later ones get "already reserved", and the rest expire once the booking confirms.
**ACTUAL TODAY — Web and Expo (same backend):** verified in the accept flow (slot lock, `ACCEPTED_AWAITING_PAYMENT` check) and in `finalize_shift_offer` → `expire_competing_offers`.
**RECOMMENDED:** KEEP — several offers, first to accept wins, rest expire. It matches Qwick/Hireup and is already built.
**ALTERNATIVE A — Keep current logic:** same as recommended.
**ALTERNATIVE B — One at a time:** slow for urgent shifts.
**Other / Defer.**
**Sources:** `backend/shifts/offers.py:accept`, `backend/shifts/finalize.py:expire_competing_offers`.
**Decision status:** OPEN.

### GM13-Q08 — What happens after booking payment fails? (carried BK-R01; SH-13 has no definition)

> **Also covers (22 Nov):** GM15-41 (GM-15), GM16-Q07 (GM-16). Asked once, here.

**Plain English:** a failed or cancelled Stripe checkout does not confirm the booking. The owner can resume the same checkout or expire it and start a replacement — but there is no "original deadline" to retry until, because D02 was never built; the practical bound is Stripe's 24-hour session. And the gap this question cites, SH-13, is never defined anywhere in the #184 audit.
**ACTUAL TODAY — Web:** 409 conflict dialog (resume / expire-and-replace / cancel) + `useShiftPaymentActions.recoverCheckout`. **ACTUAL TODAY — Expo:** same via native alert. **Backend:** failed Stripe call → 400, attempt unchanged; uncertain provider acknowledgement → 503 `checkout_uncertain` ("Retry this unchanged request; do not create another payment"); expired/unpaid session must be provider-confirmed before a replacement.
**RECOMMENDED:** KEEP the retry-until-deadline rule **once Q01 creates a deadline**; until then the rule is "retry the same attempt (resume) or expire-and-replace, within the Stripe session's 24 h". Severity: medium. Also: SH-13 must be defined or dropped — it cannot be cited as a gap.
**ALTERNATIVE A — Keep current logic (as above).** **ALTERNATIVE B — Release immediately:** one failed attempt loses the worker. **ALTERNATIVE C — Extend once:** failure grants extra reservation time.
**Other / Defer.**
**Sources:** `backend/billing/checkout_reservations.py` (`prepare_checkout`, `open_checkout`, `expire_checkout`), `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts`, `docs/qa/launch-grill/AUDIT.md` (no SH-13).
**Decision status:** OPEN.

### GM13-Q09 — Payment arrives after expiry (F04)

**Decision status:** Answered: no rebooking after expiry; the pharmacy chooses a credit or refund after approved review, carried F04 - see REFUND-01.

**Actual today:** If paid work cannot be booked, the payment is flagged and the managers are notified. No in-app credit or refund is issued (`pr257:backend/billing/paid_fulfillment.py:36`).

**Open detail:** Who approves and how quickly? Ask once at GM17-Q03. GM-13-W01 asks whether operator recovery is an exception to F04.

### GM13-Q10 — Should pharmacies save a payment method during setup? (carried ON-Q13 / ON-08)

> **Merged 22 Nov: asked once, as ON-Q13 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.

**Plain English:** every booking opens a fresh Stripe Checkout and no card is stored. The old grill's urgency argument was the 30-minute D02 window — which does not exist — so the case for a saved card is weaker than stated, but the 24-hour Stripe session is still a slow, failure-prone path for urgent shifts.
**ACTUAL TODAY — Web and Expo (same):** fresh Checkout Session per booking (`shift_payments.py` + `checkout_reservations.py`); a Stripe `customer` is reused only when a subscription exists; no saved-card / auto-charge endpoint exists.
**RECOMMENDED:** B — save a card at setup, charge on acceptance (confirms in seconds; payment is still verified per D01). Severity: medium-high for urgent shifts. Benefit: the tightest failure point in the flow disappears. Risk: needs card storage (Stripe Customer + PaymentMethod), a charge-on-acceptance path, and failure handling (what if the saved card fails at acceptance — GM13-Q08's retry rule must cover it).
**ALTERNATIVE A — Keep current logic:** one Checkout per booking; no stored card.
**ALTERNATIVE B — Saved card for subscribers only:** others keep one checkout per booking.
**Other / Defer.**
**Sources:** `backend/billing/shift_payments.py` (GM-16 verified), `backend/billing/views.py:charge_shift_fulfillment`, `backend/billing/checkout_reservations.py`.
**Decision status:** OPEN.

### GM13-Q11 — Payment readiness before acceptance (ON-Q04)

**Decision status:** Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04. Engineering: see BL-03.

**Actual today:** Missing or unverified ABN blocks external acceptance. Incomplete TFN/super permits assignment with payroll deferred (`pr257:backend/shifts/engagement.py:265`, `:716`).

### GM13-Q12 — Legacy cancellation charge (LA-Q06 / SH-02)

> **Also covers (22 Nov):** GM15-46 (GM-15), GM16-Q03 (GM-16), GM17-Q17 (GM-17), GM-18-Q20 (GM-18). Asked once, here.

**Status:** Engineering: see BL-04. Preserve the route and client export behind the existing live-charge flag. Launch scope is owned by GM15-01 and LAUNCH-01.

### GM13-Q13 — Launch scope for bookings that can strand a checkout (LA-P01)

> **Also covers (22 Nov):** GM15-44 (GM-15). Asked once, here.

**Scenario:** Tom has opened Stripe Checkout for Sara. Her AHPRA status changes before he pays. Tom needs to book Ben instead.
**What happens today:** The cancellation declines Sara's offer and leaves the unpaid Stripe session and its hold active. Those can block the replacement (`pr257:backend/shifts/cancellation.py:74`).
**Recommendation first: A.** Include live fulfilment only after the checkout release works here.
- **A (recommended):** Tom can use live fulfilment at launch if the fix lands and is verified.
- **B:** Tom can launch with live fulfilment switched off. Card payments follow after the fix is verified.

**Status:** OPEN (launch scope, decide once at LAUNCH-01). Engineering: see BL-09.

## Part D — First owner question

Start at **GM-13-W01** (paid orphan checkout recovery). D02 and D03 are implementation work in BL-06.

## Part E — Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; timing is the only question)
1. **CG-1 — D02/D03 business transition missing.** Engineering: see BL-06.
2. **CG-2 — No scheduled reservation expiry.** Provider expiry metadata and manual checkout release exist. Engineering: see BL-06.
3. **CG-3 — LA-P01: AHPRA cancellation strands the checkout and hold** (F07). Engineering: see BL-09.
4. **CG-4 — Owner pay card shows `$n × 30 AUD` always** (`ActiveShiftCard.tsx`, Expo `ActiveShiftCards.tsx`): PT/FT $80 and the subscriber $15/$40 are not reflected in the displayed total. The server charges the right price (GM-16 verified) — the display is wrong.
5. **CG-5 — No missed-webhook recovery**: no polling/reconciliation job; a paid checkout whose webhook never arrives stays unfinalised until manual reconciliation. (Webhook dedupe + Stripe retries + reconciliation flags exist; the gap is the absence of a sweeper.)
6. **CG-6 — `auto_escalate_due_shifts` has no schedule**: the function exists (`escalation.py:81`) but no beat entry calls it and no caller was found in the traced files — escalation (and therefore match-email timing) depends on something invoking it. GM-11/GM-19 boundary.
7. **CG-7 — Next has no pay UI**: the migrated ShiftsBoard contains no payment section; an owner on Next cannot pay a reservation from the Next surface as traced.
8. **CG-8 — SH-13 is undefined**: `AUDIT.md` contains no SH-13 definition; only BK-R01's `gap` field cites it. Define it or drop the citation.

### Decision gaps (owner must choose first — do not build until answered)
Open here: countdown display (Q03), worker drop-reservation (Q04), offer-expiry scaling (Q05), decline/expiry fallback (Q06), competing-offer handling (Q07), payment retry wording (Q08), saved card (Q10), orphan recovery (W01) and paid release (W02). Refund approval is in GM17-Q03. Live-payment launch scope is in LAUNCH-01.

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
| GM13-Q09 (F04) | Answered: no rebooking after expiry; the pharmacy chooses a credit or refund after approved review, carried F04 - see REFUND-01. Approval workflow: GM17-Q03 | `paid_fulfillment.py:36` |
| GM13-Q10 (ON-Q13) | STILL VALID | `shift_payments.py` (GM-16), `views.py:charge_shift_fulfillment` |
| GM13-Q11 (ON-Q04) | Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04 | `engagement.py:265`, `:716` |
| GM13-Q12 (LA-Q06) | Engineering: see BL-04 | `shift_payments.py:181`, `urls.py:15` |
| GM13-Q13 (LA-P01) | Engineering: see BL-09. Launch scope: LAUNCH-01 | `cancellation.py:74`, `checkout_reservations.py:266` |

The open owner choices are listed above. The carried rules and engineering items are recorded in the status rows.

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


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-13-W01: Should operator recovery of a paid orphan checkout ever book the work? (W-14, register item 4)
**Scenario:** An operator releases the hold on Tom's checkout. A delayed Stripe session appears and cannot be expired. Tom pays it. It covers two separate offers for Sara, and Ben now holds one date on her second offer.
**What happens today:** Recovery can finalise an offer only if the original attempt holds every date on it. Sara can get the first offer. Ben's date blocks the whole second offer, even if its other dates are free. The payment is flagged for reconciliation and the managers are notified. Recovery issues no refund (`pr257:backend/billing/checkout_reservations.py:251`, `pr257:backend/billing/fulfillment.py:67`, `pr257:backend/billing/paid_fulfillment.py:36`).
**Recommendation first: A.** Make operator-recovered orphan checkouts a narrow exception to F04. Accept only an offer the original checkout can still fulfil in full.
- **A (recommended):** Sara gets the first offer and Ben keeps his date. Tom gets a reconciliation notice for the unbookable offer. He can choose credit or refund after approved review.
- **B:** Apply F04 even to recovered orphan checkouts. Sara gets neither offer from this payment. Tom chooses credit or refund after approved review and can start a new booking.
- **DEFER**

**Status:** OPEN; must be decided before real card payments.

### GM-13-W02: Should only a recorded cancellation release paid work? (W-14, register item 5)
**Scenario:** A privileged repair removes Sara's paid assignment rows without recording a cancellation. Tom tries to book Ben for one of those dates.
**What happens today:** Ordinary shift deletion and pharmacy or organisation cascades guard paid bookings (`pr257:backend/shifts/deletion.py:8`, `:30`). If an exceptional path removes the rows, the next checkout or fulfilment check can release the work. A slotless offer keeps its hold while accepted. Removing rows alone creates no cancellation record or outcome (release register item 5).
**Recommendation first: A.** Release paid work only after a recorded cancellation. Apply the carried fee and notice rules and keep an audit trail.
- **A (recommended):** Tom can rebook once the cancellation is recorded. A privileged repair also needs that record before it releases the dates.
- **KEEP:** Tom can rebook once the app sees the assignment rows are gone. A slotless offer still holds while accepted.
- **DEFER**

**Status:** OPEN; must be decided before real card payments.
