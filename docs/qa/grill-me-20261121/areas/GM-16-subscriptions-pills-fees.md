# GM-16 — Subscriptions / Pills / Fees — Grill Me trace (COMPLETE — re-run 2026-11-21)

> **Corrections against current code (21 Nov 2026 review).** 11 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 10 hold, 1 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q16 | Subscription management includes “billing managers, scoped org admins” | WRONG | Subscription and seat management is limited to the pharmacy owner or an `ORG_ADMIN` of its organisation. Permission to pay a shift charge is a separate, broader permission. | `main:backend/billing/utils.py:32`; `pr257:backend/billing/utils.py:41` |

- **Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
- **Issue:** #250 (Grill Me, 26 areas) — **PR #184** (Oct 2026) is the format example
- **Re-validation target:** active PR #249 (stacked on #248)
- **PR #249 head VERIFIED live:** `97c4543e051b43fe30ec7e2e61ad3d69957a918e` — matches the #250 snapshot. No drift. (PR body text names a "working head `26cae2d6`" — the short SHA of the last listed implementation commit, not the branch head. All tracing below is at the API head.)
- **Date traced:** 2026-11-21 (AEST). **Method:** read-only GitHub connector calls only, strictly sequential with ≥8 s between calls. No code changed, no PR/issue/comment created.
- **Rate-limit note:** no HTTP 429 occurred in this re-run (~70 sequential read calls, all succeeded). The earlier 429s that blocked the first GM-16 attempt have cleared.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Shift fulfilment fee checkout (Stripe) | Shows fee card and launches Stripe checkout session (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:30`). | Shows fee card and launches mobile checkout session (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:228`). | Yes | - |
| Pay fulfilment fee with Pills | Taps Pay with Pills button to pay via reward balance (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:12`). | Taps Pay with Pills button to pay via reward balance (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:312`). | Yes | - |
| Subscriber discount on checkout | Server applies $15/$40 rate but UI displays flat `$n × 30` calculation bug (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:35`). | Server applies $15/$40 rate but UI displays same `$n × 30` calculation bug (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:230`). | Yes | - |
| Owner subscription & extra seats management | Manages subscription plan, card/invoice payment, and extra seats in `OwnerBillingPage` (`frontend_web/src/pages/dashboard/sidebar/owner/OwnerBillingPage.tsx:85`). | Manages extra seats and subscription in dedicated `subscription-seats` screen (`frontend_mobile/roles/owner/subscription-seats.tsx:82`). | Yes | - |
| Pills reward wallet & referrals | Displays pill balance, referral code, and history on Pills page (`frontend_web/src/pages/dashboard/sidebar/rewards/PillsPage.tsx:56`). | Displays pill balance and referral history via `trustRewards` (`frontend_mobile/app/rewards/pills.tsx:3`). | Yes | - |
| Legacy cancellation penalty endpoint | Backend endpoint `/billing/charge-penalty/` has no caller in web UI (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx:250`). | Backend endpoint has no caller in mobile UI (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:270`). | Yes | - |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM16-Q01 | Web + Expo |
| GM16-Q02 | Web + Expo |
| GM16-Q03 | Web + Expo |
| GM16-Q04 | Web + Expo |
| GM16-Q05 | Web + Expo |
| GM16-Q06 | Web + Expo |
| GM16-Q07 | Web + Expo |
| GM16-Q08 | Web + Expo |
| GM16-Q09 | Web + Expo |
| GM16-Q10 | Web + Expo |
| GM16-Q11 | Web + Expo |
| GM16-Q12 | Web + Expo |
| GM16-Q13 | Web + Expo |
| GM16-Q14 | Web + Expo |
| GM16-Q15 | Web + Expo |
| GM16-Q16 | Web + Expo |
| GM16-Q17 | Web + Expo |
| GM16-Q18 | Web + Expo |
| GM-16-W01 | Web + Expo |
| GM-16-W02 | Web + Expo |

## 0. What was completed in this re-run

The 2026-11-21 partial stopped at two 429s after verifying only `shift_payments.py` and `subscription_events.py`. This re-run completes everything the partial listed as NOT re-validated:

- **VERIFIED at PR #249 head in this trace:** `backend/billing/subscriptions.py`, `subscription_operations.py`, `models.py`, `views.py`, `webhooks.py`, `stripe_support.py`, `checkout_prices.py`, `checkout_context.py`, `checkout_urls.py`, `fulfillment.py`, `paid_fulfillment.py`, `payment_events.py`, `release_guards.py`, `utils.py`, `backend/billing/` directory listing (43 entries), `backend/rewards/` directory listing + `models.py`, `services.py`, `views.py`, `serializers.py`, `urls.py`, `shared-core/src/domains/billing/api.ts`, `shared-core/src/domains/rewards/api.ts`, `shared-core/src/utils/pricing.ts`, web `PillsPage.tsx` (`sidebar/rewards/`), web `OwnerPillsPage.tsx` (re-export), web `OwnerBillingPage.tsx` (`sidebar/owner/`), Expo `PillsScreen.tsx` (`roles/shared/pills/`), Expo `app/owner/pills.tsx` (re-export), Expo `subscription-seats.tsx` (`app/owner/` re-export + `roles/owner/subscription-seats.tsx`), `backend/billing/test_subscriptions.py`, `backend/core/settings.py` (billing flags).
- **Adopted, not re-fetched:** `backend/billing/shift_payments.py` (SHA `8c067cdbe1739d74bc9d0ed4de9fa08e51b89f96`) and `subscription_events.py` (SHA `016de98ade075f56d6b44378a8806128add39530`) — verified at this head in the partial; their findings are carried below unchanged. `backend/billing/urls.py` — verified at this head in GM-17 senior review (20 lines, 8 paths: subscription, subscribe, seats, charge-fulfilment + expire/resume, `charge-penalty/<int:shift_id>/` line 16, webhook; **zero hits for `refund`**).
- **Still UNKNOWN (not verified):** what enforces `staff_count = 5` (who counts as staff, what happens to person 6 — `test_subscription_accounts.py` not read); the dollar amount of the extra-seat Stripe Price (`EXTRA_SEAT_PRICE` is a Price ID; the $5 figure in `shared-core/src/utils/pricing.ts` is a client-side estimate, not verified against Stripe); how an owner cancels a subscription (no endpoint and no UI found — see GM16-Q16); whether anything writes `PAYMENT_CREDIT` pill ledger entries (the source exists in the enum; no writer was found in the traced files); the live Stripe dashboard values for any Price ID.

## 1. GM-16 traced flow — ACTUAL TODAY (verified at head)

### 1a. Fulfilment fee at checkout — `backend/billing/shift_payments.py::charge_shift_fulfillment` (adopted from partial, unchanged)

Actor: owner / authorised manager. Trigger: accepted offer(s) awaiting payment (`ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT`).

1. Caller selects offers: by `candidate_id`, `offer_ids`, `slot_ids`, or none. Mismatched/empty selection → 400. Duplicate slot selection rejected.
2. **Free path:** if `billing_state` is `BILLING_STATE_PRE_LIVE` or `BILLING_STATE_FREE_TRIAL`, offers are finalised for free in one transaction, `shift.payment_status` set to `PENDING`/`PAID`, notifications sent on commit (`payment_method="free"`). No Stripe call. No selector is required on this path.
3. **Paid path:** no selector → 400. `assert_can_create_shift_charge("fulfillment")` runs first (release guard — §1d).
4. **Subscriber check (SH-03 FIX — verified):** local subscription with `status == 'active'` → subscriber prices.
5. **Price selection — hard-coded Stripe Price IDs (still hard-coded, verified):** locum standard `price_1T52jFBQXaySV5ukezd5JmzS` ($30), subscriber `price_1T52jFBQXaySV5ukkXOKPHSV` ($15); PT/FT standard `price_1T52ilBQXaySV5uksvQy2RTk` ($80), subscriber `price_1T52imBQXaySV5ukuwLH3ikI` ($40). Confirmed in `checkout_prices.py` as the "Existing published fulfillment fee contract, in Australian cents per offer": `{…: 3000, …: 1500, …: 8000, …: 4000}`. **Fee is per accepted offer: `quantity = len(offer_ids)`** — one price per offer, whatever the hours or days. No per-day and no %-of-wages calculation exists. No GST treatment, no tax-invoice creation, no fee breakdown. Currency is AUD (enforced at webhook binding: `checkout_currency_mismatch` if not `aud`).
6. Stripe Checkout Session created (`mode='payment'`, `payment_method_types=['card']`) with metadata (`shift_id`, `actor_user_id`, `owner_user_id`, `organization_id`, `billing_contact_user_id`, `billing_scope`, `type='fulfillment'`, `candidate_id`, `slot_id(s)`, `offer_ids`). If the account has a subscription with `stripe_customer_id`, it is passed as `customer`; otherwise `customer_email`. Return URLs from `_shift_checkout_return_urls` (web: dashboard shift page `?payment=success|cancel`; mobile: `/mobile-checkout-return` bridge). Response: `{url, checkout_id}`. Stripe failure → 400.
7. Webhook finalisation: `webhooks.py` → `payment_events.handle_payment_checkout` → `paid_fulfillment.finalize_paid_selection` (§1e). Idempotency: `ShiftPayment` get-or-created by `stripe_payment_intent_id`; `bind_paid_checkout` rejects duplicates, metadata/currency/amount mismatches.

**Web vs Expo difference (verified):** none in the backend — the only client input is `data.get('platform', 'web')`, used only for return URLs. **Screens (now verified):** both clients show the same "Payment required to confirm" section with per-offer selection and "Pay with Stripe" / "Pay with Pills" buttons — but both display the total as **`$paymentUnitCount * 30 AUD`** (Vite `ActiveShiftCard.tsx`, Expo `ActiveShiftsPage/ActiveShiftCards.tsx`), i.e. $30 per selected offer **regardless of type or subscriber status**. A PT/FT booking ($80, or $40 subscriber) is displayed as $30/offer until Stripe shows the real total. **Next:** no pay UI exists in the migrated ShiftsBoard (GM-13 verified) — Next owners cannot pay from the Next surface.

### 1b. Legacy cancellation penalty — `backend/billing/shift_payments.py::charge_penalty` (adopted from partial, unchanged)

Still present in code at the PR #249 head. **SH-02 / LA-Q06 is STILL VALID as code-present.**
- Trigger: called with a shift; sums `hours × unit_rate` over all `ShiftSlotAssignment`s.
- Bands: ≤24h before earliest start → **20%** of total wage; 24–72h → **10%**; >72h → no penalty. No P09 bands (0/0/10/15/20/25/30%) anywhere in this file — P09 is a preview-only calculator elsewhere (GM-15 adopted).
- Creates a Stripe Checkout with ad-hoc `price_data` (AUD, `Cancellation Penalty for Shift #<id>`), metadata `type='cancellation'`. **No recipient/payee is recorded** — money goes to the platform's Stripe account by default; nothing pays it on to the worker.
- Guard: `assert_can_create_shift_charge("cancellation")` before charging.
- Routing now VERIFIED: `billing/urls.py` line 16 `charge-penalty/<int:shift_id>/` (GM-17 adopted) + view `billing/views.py:charge_penalty` (permission `user_can_pay_shift_charge_for_pharmacy`, 403 otherwise) + shared-core export `chargeShiftPenalty(shiftId, {hours})`. **No UI was found calling it in the traced screens.**
- **Conflict:** carried decision NOPEN says "Money penalties for workers? None, ever." This penalty is charged to the *pharmacy*, not the worker — but its name, recipient and legal basis are unstated, and it coexists with the unimplemented P09 owner-fee table. See GM16-Q11.

### 1c. Subscription lifecycle — `backend/billing/subscription_events.py` (adopted from partial, unchanged)

Model: `OwnerSubscription` — `status`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_extra_seat_subscription_id`, `staff_count`, `current_period_end`, `updated_at`. All handlers run inside the webhook delivery transaction, use `select_for_update()` row locks, and re-retrieve the subscription from Stripe before trusting the event.

- **Checkout completed** (`handle_subscription_checkout`): matches local sub by metadata, else by Stripe customer. Rejects mismatched Stripe customer. If local status is `canceled`, only a *new paid base plan* can replace it. Base plan → `stripe_subscription_id` set, `status = 'active'` if Stripe status is `active`/`trialing` else `'inactive'`, **`staff_count = 5`**; extra seats → `stripe_extra_seat_subscription_id` set, `staff_count = 5 + extra_seat_count` (or reset to 5 if not active).
- **Subscription updated** (`handle_subscription_updated`): ignores events for `canceled` local subs. Base → `status = 'active'` if Stripe `active`/`trialing`, else **`'inactive'`**. Addon → recomputes `staff_count = 5 + quantity` of the `EXTRA_SEAT_PRICE` line item, else 5.
- **Invoice paid** (`handle_invoice_paid`): same lookup (+ fallback: sub with no Stripe ID for this customer). Sets status active/inactive, stores `current_period_end` from the first invoice line.
- **Subscription deleted** (`handle_subscription_deleted`): base → `status = 'canceled'` immediately. Addon → clears `stripe_extra_seat_subscription_id`, `staff_count = 5`.

**Lapse semantics (verified):** three distinct states. `active` (incl. `trialing` mapped to `active`) → discount applies. `inactive` (past-due / unpaid / incomplete / paused at Stripe) → **no discount** (`is_subscriber` requires `status == 'active'` exactly). `canceled` → no discount, and only a new paid base checkout can revive it. **There is no grace period in code.** `current_period_end` is *stored* — nothing in the verified files honours it (checkout reads only `status`).

### 1d. Subscription purchase, seats, and the release guard (NEW — verified this re-run)

**Buying (`subscription_operations.create_subscription_checkout`, via `views.create_subscription_checkout`):**
- Account resolution (`_current_account_for_user`): by `pharmacy_id` (must `user_can_manage_billing_for_pharmacy`, else 403) or by the caller's own owner onboarding; org accounts without a pharmacy → 400.
- **View hard-codes `staff_count = 5`** — the payload's staff count is ignored; extra seats are added afterwards via the seats endpoint.
- If an active subscription with a Stripe ID already exists → 400 "An active subscription already exists for this billing account."
- Stripe Customer created on first purchase (email + billing-account name); failure → 400.
- **Card:** Stripe Checkout Session (`mode='subscription'`, line item `BASE_SUB_PRICE = 'price_1T52ikBQXaySV5ukpVrv7EcZ'`, quantity 1, metadata incl. `billing_scope`, `actor_user_id`, `staff_count`). Return URLs: web → owner overview `?view=billing&checkout=success|cancel` (org → organization overview); mobile → `/mobile-checkout-return` bridge to `owner/subscription-seats`.
- **Invoice:** Stripe Subscription created directly with `collection_method='send_invoice'`, `days_until_due=7`; local status stays **`inactive` until the invoice is paid** (then `handle_invoice_paid` activates it).
- **No cancel operation exists**: no `cancel_subscription` function in `subscription_operations.py`, no cancel view in `views.py`, no cancel route in `urls.py` (GM-17 adopted), and no "cancel subscription / unsubscribe" UI in `OwnerBillingPage.tsx` or Expo `subscription-seats.tsx` (grep: zero hits). A subscription can only end via Stripe (webhook `customer.subscription.deleted` → local `canceled`). How an owner initiates that is UNKNOWN — no Stripe portal link was found in the traced code.

**Seats (`subscription_operations.update_subscription_seats`, via `views.update_subscription_seats`):**
- Desired staff count must be ≥5 (`Base subscription includes five seats`, 400 below 5). Requires an **active** base subscription with a Stripe ID, else 400.
- Existing extra-seat subscription: verified live at Stripe (customer match, status `active`/`trialing`, exactly one `EXTRA_SEAT_PRICE` line item) then `stripe.Subscription.modify` with proration (`create_prorations`, `payment_behavior='error_if_incomplete'`); the new quantity is verified against Stripe's response before the local `staff_count` is saved.
- No extra-seat subscription yet: a new Checkout Session is created for `EXTRA_SEAT_PRICE` × `desired_extra` (card only); local `staff_count` changes only via the webhook.
- **What `staff_count` gates is UNKNOWN**: `serialize_subscription` clamps the minimum to 5 and reports `staffCount`/`extraSeatCount`; no file in this trace enforces a staff limit (e.g. blocking a 6th member). `test_subscription_accounts.py` (the likely gating evidence) was not read.

**Account scope (`subscriptions.py`):** org accounts look up the org subscription first; if the org plan is **not** active, an **active owner subscription is used as a fallback** for reads (legacy fallback — verified in code and in `test_subscriptions.py`). Creating always targets the primary account (org or owner). `serialize_subscription` returns `{exists, active, status, staffCount (≥5), extraSeatCount, stripeCustomerId, stripeSubscriptionId, stripeExtraSeatSubscriptionId, currentPeriodEnd}`.

**Release guard (`release_guards.py::assert_can_create_shift_charge`):** per-kind flags `BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED` / `BILLING_LIVE_SHIFT_PENALTY_ENABLED` (settings, default `False`). Stripe key mode is validated (`sk/rk_test/live`); test mode only in local/dev/development/test/staging; **staging + live key is rejected**; live mode requires the flag. **Billing-state machine (`utils.py`):** `BILLING_STATE_PRE_LIVE` / `FREE_TRIAL` / `PAYMENT_REQUIRED`; `is_billing_active()` uses `BILLING_LIVE_DATE`; `is_in_free_trial(user)` uses `FREE_TRIAL_DAYS` (default 30). Settings (`settings.py:679-682`): `BILLING_LIVE_DATE = _date(2025, 6, 1)` with comment "June 1, 2026 — flip this to go live" (date/comment contradiction confirmed at head — GM-02 senior review agreed); `FREE_TRIAL_DAYS = 0`. So the live-date mechanism and the flag mechanism **both exist**: the date gates `billing_state`, the flags gate live *collection*.

### 1e. Webhook, fulfilment, and reconciliation (NEW — verified this re-run)

**Webhook (`webhooks.py::receive_stripe_webhook`, via `views.stripe_webhook`):** signature verified (`STRIPE_WEBHOOK_SECRET`, 400 on bad payload/signature); `StripeWebhookEvent` row by unique `event_id` (delivery dedupe — already-PROCESSED → 200, no reprocessing; exception → FAILED + HTTP 500 so Stripe retries). Event routing: `checkout.session.completed` (subscription → `handle_subscription_checkout`; payment + paid → `handle_payment_checkout`), `customer.subscription.updated`, `invoice.paid`, `charge.refunded`, `customer.subscription.deleted`. Payroll-correction pending → HTTP 503 so Stripe retries the exact event.

**Paid fulfilment (`payment_events.handle_payment_checkout` + `paid_fulfillment.finalize_paid_selection`):**
- `ShiftPayment` get-or-created by `stripe_payment_intent_id` — distinct webhook event IDs for the same intent never create a second ledger debit.
- `bind_paid_checkout` (`checkout_reservations.py`): metadata match (shift/type/offer_ids/slot_ids/candidate/owner/org/billing-contact/actor/selection hash), currency must be `aud`, `amount_total` must equal `expected_amount_cents`, duplicate intent rejected. Mismatch → `reconciliation_required=True` + reason, owner notified "Shift payment needs reconciliation … Check the payment before retrying or refunding."
- `finalize_paid_selection`: finalises pending offers via `_finalize_pending_offers_for_shift` (which calls `shifts.finalize.finalize_shift_offer` — assignments created exactly once, rate locked from accepted terms snapshot — then `expire_competing_offers`); if offers cannot be booked, `reconciliation_required=True` with reason `paid_work_unavailable` (managers notified "Shift payment needs a refund") or `locked_payroll_period` (managers notified "needs a correction … Do not pay again"; the same bound payment replays after an audited correction). Deleted shift → reconciliation + "The paid shift no longer exists. The payment needs a refund."
- **Refunds exist only as Stripe-initiated reconciliation** (GM-17 adopted): `handle_charge_refunded` accumulates `refunded_amount_aud` from Stripe's cumulative `amount_refunded`, sets `partially_refunded`/`refunded`, clears `reconciliation_required` on full refund. **No in-app refund/credit-note/reversal endpoint or UI exists.**

**Checkout reservations (`checkout_reservations.py` — GM-13's file, summarised here for the fee boundary):** persisted `FulfillmentCheckout` (PREPARED/OPEN/COMPLETE/EXPIRED/UNKNOWN) + `FulfillmentReservation` occurrence holds; idempotent prepare; Stripe session via idempotency key; provider-confirmed expiry only; 48 h operator expiry path. **No D02 pay-by deadline exists** (GM-13-Q01). The only time bounds are Stripe's 24 h session and manual expire/resume.

### 1f. Pills (rewards) — VERIFIED at PR #249 head (was NOT TRACED in the partial)

**Model (`backend/rewards/models.py`):** `PillRewardRule` (code unique, `pill_amount`, EARN/SPEND, audience ANY/SHIFT_POSTER/WORKER, `is_active`, `starts_at`/`ends_at` windows); `PillReferralCode` (one per user, `PILL` + 8 random chars, `is_active`); `PillReferralEvent` (FRIEND/SHIFT, PENDING/CLAIMED/AWARDED/CANCELLED, referrer/referred/code/shift); `PillLedgerEntry` (append-only: `delta` signed, `balance_after`, `idempotency_key` unique, entry types EARN/SPEND/ADJUSTMENT/REVERSAL, sources FRIEND_REFERRAL/SHIFT_REFERRAL/SHIFT_POST/PAYMENT_CREDIT/MANUAL). **Ledger entries never expire** — only *rules* have time windows. No pill purchase, no transfer.

**Rules seeded (`services.py::DEFAULT_REWARD_RULES`):**
- `friend-referral-login` — EARN **100 pills** when a referred friend creates an account or logs in.
- `shift-referral-login` — EARN **50 pills** when someone joins through a shared shift referral.
- `shift-post-cost` — SPEND **200 pills** for posting a paid marketplace shift instead of paying by Stripe.

So **200 pills = one paid shift post** (per selected pending offer — `pay_shift` deducts 200 per offer). Two friend referrals (2×100) or four shift referrals (4×50) buy one $30/$80 booking fee. Pills do **not** offset the $30/month subscription and do not discount the Stripe fee — they are an alternative payment for the fulfilment fee only.

**Earn/award (`services.py`):** referral codes claimed via `claim_referral_code` (self-referral blocked; **same-billing-identity blocked** — two accounts sharing a Stripe customer cannot refer each other); the award is made by `award_referral_event` **only when the referred user is eligible** (`user_is_referral_reward_eligible`: OTP-verified + onboarding `verified` for their role); award is idempotent (re-awarding a CLAIMED event returns the existing ledger entry); `_send_pill_award_message` notifies in-app + email ("Congrats, you earned N pills", link `/dashboard/owner/pills`). Ledger writes lock the payer row before the balance sum, check idempotency keys, and reject negative balances ("Insufficient pill balance.").

**Spend (`rewards/views.py::pay_shift`):** `POST /pill-rewards/pay-shift/` — shift row-locked; caller must `user_can_manage_pharmacy`; `payment_status` must be PENDING; selected offers must be `ACCEPTED_AWAITING_PAYMENT`; 200 pills deducted per offer, then `finalize_shift_offer`, `expire_competing_offers`, `payment_status` → PAID when none outstanding; `send_shift_payment_finalized_notifications(..., payment_method="pills")`. Insufficient → 400 `insufficient_pills` with `balance` + `required`.

**Screens (verified, parity):** web `PillsPage.tsx` and Expo `PillsScreen.tsx` both fetch the same three services (`fetchPillBalanceService`, `fetchPillHistoryService`, `fetchPillReferralsService`) and show balance (including `shift_post_cost`), ledger history, and referral events. Web `OwnerPillsPage.tsx` is a re-export of `PillsPage`; Expo `app/owner/pills.tsx` is a re-export of `PillsScreen`. **Neither screen shows the user's own referral code** (only `balance`/`history`/`referrals` services are imported — `fetchPillReferralCodeService` exists in shared-core but is not called by either screen) and **neither screen has a pay-with-pills button** (paying happens from the shift card, §1a). Both screens show the cost as "`N` pills per shift post" from the server's `shift_post_cost`.

**Shared-core (`domains/rewards/api.ts`):** `fetchPillBalanceService`, `fetchPillRewardRulesService`, `fetchPillReferralCodeService`, `fetchPillHistoryService`, `fetchPillReferralsService`, `createFriendPillReferralService`, `createShiftPillReferralService`, `claimPillReferralService`, `payShiftWithPills(shiftId, offerIds)`. **Shared-core pricing (`utils/pricing.ts`):** client-side estimates only ("Django owns checkout, Stripe price selection and settlement decisions. These helpers are not imported by the Python backend and are not quotes."): subscription $30 base, 5 staff included, **$5 per extra staff** (estimate — the server charges the Stripe `EXTRA_SEAT_PRICE`, whose dollar value is UNKNOWN from code); locum $30/$15, PT/FT $80/$40; legacy penalty 20%/10% (same bands as `charge_penalty`).

### 1g. Subscription management screens (NEW — verified this re-run)

**Web — `OwnerBillingPage.tsx`** (`sidebar/owner/`): three views (`plans` / `subscribe` / `manage`); plan cards ($0/month PAYG: "$30 per locum shift"; subscription: $30/month + $5 per extra seat — client-side display); subscribe with **card or invoice** (`paymentMethod` state, passed to `createSubscriptionCheckout`); seats management (target extra seats → `updateSubscriptionSeats`); renewal date shown from `currentPeriodEnd`; checkout success/cancel toasts (`checkout=success|cancel`, `seat_success|seat_cancel`). **No cancel-subscription UI. No GST line.**
**Expo — `roles/owner/subscription-seats.tsx`** (re-exported by `app/owner/subscription-seats.tsx`): same data (`getCurrentSubscription`, `createSubscriptionCheckout`, `updateSubscriptionSeats`, `platform: 'mobile'`), current seats / extra seats / period end shown, card checkout for the base plan, seat updates. **No cancel-subscription UI. No GST line.**
**Parity:** web and Expo subscription management match (same endpoints, same fields, same missing cancel). **Next:** no subscription/billing page exists in the migrated pages (only `ShiftsBoard` + `TalentBoard` under `dashboard/sidebar`) — Next owners cannot manage subscriptions from the Next surface as traced (parity gap, GM-25).

### 1h. Staff free / memberships

"Staff free" (internal roster work incurs no fulfilment fee) was Oct 2026 understanding; the mechanism is the billing-state + offer-path split: internal/staff offers finalise without entering the paid fulfilment path (`finalize_shift_offer` without a checkout; `guard_fulfillment` is called "including free/pill booking"). The release-guard + billing-state files are now read (§1d); the per-path routing (which offer kinds skip payment) lives in `offers.py:accept` (GM-13 verified: `requires_payment` is a function of `billing_state` only — PRE_LIVE/FREE_TRIAL finalise free, PAYMENT_REQUIRED needs checkout). Whether a *specific* internal shift is charged in PAYMENT_REQUIRED state was not separately traced — the fee attaches per accepted *offer* awaiting payment, and staff offers do not enter that state in the traced flow.

## 2. Current-flow matrix

| # | Trigger | Actor | Backend / API | Vite / Next web | Expo mobile | Persisted state | Event / side effect | Recovery / denial path |
|---|---------|-------|---------------|-----------------|-------------|-----------------|---------------------|------------------------|
| F1 | Owner accepts offer(s) awaiting payment | Owner / authorised manager | `charge_shift_fulfillment` (`shift_payments.py`) → Stripe Checkout Session, `type='fulfillment'` | "Payment required to confirm" card, `$n × 30 AUD` (wrong for PT/FT + subscribers), Pay with Stripe / Pay with Pills (`ActiveShiftCard.tsx` + `useShiftPaymentActions`) | Same card, same `$n × 30` total, same buttons (`ActiveShiftsPage/ActiveShiftCards.tsx`) | `ShiftOffer` stays `ACCEPTED_AWAITING_PAYMENT` until webhook finalises; `shift.payment_status` PENDING/PAID | Stripe checkout URL returned; webhook finalisation (§1e) | Bad/empty selection → 400; Stripe error → 400; 409 conflict → resume/expire dialog; retry governed by Stripe 24 h session (no D02 — GM-13) |
| F2 | Billing state PRE_LIVE / FREE_TRIAL | Same | Free finalisation in one transaction (`shift_payments.py`) | Same endpoint, `platform='web'` only affects return URLs | Same endpoint, `platform='mobile'` | Offers finalised; `shift.payment_status` set | `send_shift_payment_finalized_notifications(..., payment_method="free")` on commit | State is set by `BILLING_LIVE_DATE` (2025-06-01, comment says 2026) + `FREE_TRIAL_DAYS = 0` + per-account trial logic in `utils.py` |
| F3 | Paid checkout, subscriber | Owner with `OwnerSubscription.status == 'active'` | Price ID switches to $15 locum / $40 PT-FT (`shift_payments.py`) | Card still shows `$n × 30` (display bug — §1a) | Same display bug | None in-file (price chosen per call) | Stripe session at half price; `customer` = `sub.stripe_customer_id` if present | If sub is `inactive`/`canceled` → full price silently (no warning in-file or on-screen) |
| F4 | Paid checkout, non-subscriber | Owner without active sub | $30 locum / $80 PT-FT, `quantity = len(offer_ids)` (`shift_payments.py` + `checkout_prices.py`) | Card shows `$n × 30` (right for locum, wrong for PT/FT) | Same | None in-file | Stripe session; `customer_email` fallback | Same 400 paths as F1 |
| F5 | Legacy cancellation penalty | Caller of `charge_penalty` (route + view verified; no UI found calling it) | `charge_penalty` (`shift_payments.py`): 20% ≤24h, 10% 24–72h of total wage; ad-hoc AUD Stripe price | No UI found | No UI found | None in-file | Stripe checkout `type='cancellation'`; payee NOT recorded | No wage / no assignments → `No penalty required…`; Stripe error → 400; live collection gated by `BILLING_LIVE_SHIFT_PENALTY_ENABLED` |
| F6 | Stripe subscription checkout completes | Stripe webhook → backend | `handle_subscription_checkout` (`subscription_events.py`): customer match, canceled-guard, Stripe re-retrieve, base `staff_count=5`, seats `5+n` | `OwnerBillingPage` (plans/subscribe/manage; card or invoice) | `subscription-seats.tsx` (same) | `OwnerSubscription.status/stripe_*_id/staff_count/updated_at` | Local sub activated | Mismatched customer → ignored + warning log; no local match → warning log; canceled + not new paid base → ignored |
| F7 | Stripe subscription updated / invoice paid | Stripe webhook → backend | `handle_subscription_updated` / `handle_invoice_paid`: status active↔inactive, `current_period_end` stored, seat count recomputed | Renewal date shown from `currentPeriodEnd` | Same | Same as F6 + `current_period_end` | Entitlement follows Stripe; out-of-order events re-checked live | Canceled local sub → event ignored; lookup miss → warning log |
| F8 | Stripe subscription deleted | Stripe webhook → backend | `handle_subscription_deleted`: base → `canceled`; addon → seat ID cleared, `staff_count=5` | No cancel UI anywhere (owner cannot initiate from the app) | No cancel UI anywhere | `status='canceled'` / seats reset | Discount lost immediately (status-gated, F3) | Lookup miss → warning log; no retry in-file; **how the owner cancels is UNKNOWN** |
| F9 | Pills earn | Referrer when a referred user verifies | `award_referral_event` (100 friend / 50 shift), only if referred user is OTP-verified + onboarding-verified; self-referral + same-billing-identity blocked | Balance/history/referrals shown (`PillsPage`) | Same (`PillsScreen`) | `PillLedgerEntry` EARN + `PillReferralEvent` AWARDED | In-app + email "Congrats, you earned N pills" | Ineligible referred user → no award (event stays CLAIMED); duplicate award → existing entry returned |
| F10 | Pills spend (pay for a shift) | Owner / manager | `pay_shift` (`rewards/views.py`): 200 pills per selected pending offer, atomic, payer-row lock | "Pay with Pills" on the shift card; insufficient → "Not enough pills. You have X; this shift needs Y." | Same | `PillLedgerEntry` SPEND (−200/offer) + assignments + offer ACCEPTED | Finalised notices, `payment_method="pills"` | Insufficient → 400 `insufficient_pills` + balance/required; shift already PAID → "Shift is already paid." |
| F11 | Refund / credit / cancellation-pay | — | **No engine**: no refund/credit-note/reversal endpoint or UI; refunds only as Stripe-initiated reconciliation (`handle_charge_refunded`) | None | None | `ShiftPayment.refunded_amount_aud`, `status` (`partially_refunded`/`refunded`), `reconciliation_required` | Stripe `charge.refunded` → local reconciliation | GM-17 owns the decision (Q01 refund vs credit); F06 in GM-13 covers the paid-after-expiry path |
| F12 | Subscription invoice path | Owner choosing invoice | `create_subscription_checkout` with `payment_method='invoice'`: Stripe Subscription `send_invoice`, 7 days until due; local status stays `inactive` until paid | Invoice option on `OwnerBillingPage` | Invoice option exists in shared-core API (`paymentMethod: 'card' \| 'invoice'`); Expo seats screen offers card checkout for the base plan (invoice path via same API) | `OwnerSubscription` inactive + `stripe_subscription_id` set | "Invoice sent. Check your email." | Invoice unpaid → stays inactive → no discount; no dunning in traced code |

Parity note: the backend is client-agnostic for fees (one endpoint, one price table). The verified Web-vs-Expo differences are screen-level: (a) the pay card's `$n × 30` display bug exists on **both**; (b) subscription management exists on both (web `OwnerBillingPage`, Expo `subscription-seats`); (c) **Next has neither** a pay section nor a subscription/billing page in the migrated copy — that is the one structural parity gap in GM-16.

## 3. Validated question queue (#184 format, numbered)

Statuses: ✅ STILL VALID · 🔄 CHANGED · 🟢 PART-FIXED / FIXED · ❓ NOT RE-VALIDATED (Oct 2026 evidence only — none remain in this area after this re-run except where stated).

### A. Re-validated old questions (evidence at PR #249 head)

**GM16-Q01 — [PO-Q16 / SH-03] Should the booking fee depend on shift length? — 🔄 CHANGED (partly)**
- ACTUAL TODAY (verified, `shift_payments.py` + `checkout_prices.py`): fee is flat per accepted offer — $30 locum / $80 PT-FT, `quantity = len(offer_ids)` — whatever the hours or days. A 10-day block under one offer = one fee.
- What changed since Oct 2026: the subscriber half-price is NOW applied ($15/$40). The flat per-offer shape is unchanged; no per-day / %-of-wages option exists in this file.
- RECOMMENDED: keep flat per-offer for launch (simple, matches the code), revisit per-day only if multi-day blocks are common. Severity: low-medium (fairness, not correctness).
- ALTERNATIVE A — Keep current logic: one fee per offer, any length. Scenario: pharmacy books a locum for 10 days in one offer, pays $30 once; a pharmacy booking 10 separate one-day offers pays $300. Trade-off: simple but rewards block-booking and penalises split bookings.
- ALTERNATIVE B — Per shift day: same $30/$80 per date in the offer. Scenario: the 10-day block costs $300; single days unchanged. Trade-off: fairer per day, but more expensive for blocks and needs the offer→dates count wired into checkout.
- ALTERNATIVE C — Percentage of wages: e.g. 5% of agreed wages. Scenario: a $2,000 week costs $100 vs $30 today. Trade-off: scales with value, harder to explain, needs wage math at checkout.
- Other / defer. Edge cases: multi-slot offers (quantity counts offers, not slots — verified in `prepare_checkout`/`occurrence_keys`: reservations never change fee quantity); free-trial/pre-live path bypasses all of this.
- Source: `backend/billing/shift_payments.py::charge_shift_fulfillment` + `checkout_prices.py::FULFILLMENT_PRICES` @ 97c4543e.

**GM16-Q02 — [LA-Q07 / SH-03] Fix before launch? Subscribers charged full price; Stripe price IDs hard-coded. — 🟢 PART-FIXED**
- ACTUAL TODAY (verified): subscriber discount IS now applied — `is_subscriber` (local status `active`) selects the $15/$40 Price IDs. The Oct 2026 bug (computed but unused) is gone. Price IDs are STILL hard-coded (`checkout_prices.py`, `stripe_support.py`: `BASE_SUB_PRICE`, `EXTRA_SEAT_PRICE` + 4 fulfilment IDs); test and live cannot differ.
- RECOMMENDED: keep the discount logic; fix the hard-coded IDs (env/config per environment) before any live checkout. Severity: high for the config half (a test-mode checkout in production, or vice versa, charges real money or fails); the discount half is done.
- ALTERNATIVE A — Keep current logic: hard-coded IDs, one set for all environments. Scenario: staging checkout uses the live $30 price. Trade-off: works until someone tests with real money. (Note the guard helps here: staging + live key is rejected by `release_guards.py`, and live collection needs the flag — but a wrong *test* price in production would still charge the wrong amount.)
- ALTERNATIVE B — Price IDs from settings/env per environment + a test-price mapping. Scenario: staging uses test prices, production uses live prices, same code. Trade-off: small config change, needs deploy-time values.
- Other / defer. Edge: `is_subscriber` reads the *local* status, which the webhook maps from Stripe `trialing` → `active` — trialling owners get the discount (see GM16-Q08).
- Source: `backend/billing/shift_payments.py` + `checkout_prices.py` + `stripe_support.py` @ 97c4543e. Code gap (config), not a decision gap, for the hard-coded half; the discount half needs no decision.

**GM16-Q03 — Legacy cancellation charging (LA-Q06 / SH-02)**
- **Actual today:** The billing route and shared-core export remain available behind the existing live collection guard. The calculation uses the old bands and all assignments.
- **Status:** Engineering: see BL-04. Launch scope remains in GM15-01 and LAUNCH-01.

**GM16-Q04 — [PO-Q15 / SH-04] When should booking fees start? — 🔄 CHANGED (mechanism fully verified now)**
- ACTUAL TODAY (verified, `settings.py:674-682` + `utils.py` + `release_guards.py`): **two mechanisms coexist.** (1) `BILLING_LIVE_DATE = _date(2025, 6, 1)` with comment "June 1, 2026 — flip this to go live" — the date/comment contradiction is real at head — and `FREE_TRIAL_DAYS = 0`; `get_billing_state_for_account` returns PRE_LIVE before the date, FREE_TRIAL within the trial window, else PAYMENT_REQUIRED. (2) Live *collection* is separately gated by `BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED` (default False) + Stripe key mode (test only in non-production envs; staging + live key rejected). The Oct 2026 claim ("live 2025-06-01, comment says 2026, FREE_TRIAL_DAYS = 0") describes mechanism (1) correctly; mechanism (2) is new since Oct.
- RECOMMENDED: do not decide the launch date/trial until the owner confirms which gate is authoritative — the date, the flag, or both — and the contradiction (2025 date vs 2026 comment) is resolved in code. Severity: high (decides whether the first booking costs money).
- ALTERNATIVE A — Keep current logic (date + flag as coded). Cannot be stated honestly as a single rule until the owner confirms the interaction — do not pick this blind.
- ALTERNATIVE B — Free until a set date. ALTERNATIVE C — N-day trial per new pharmacy. (Both as in #184; scenarios unchanged: a new pharmacy's first booking is free vs paid.)
- Other / defer.
- Source: `backend/core/settings.py:674-682`, `backend/billing/utils.py`, `backend/billing/release_guards.py` @ 97c4543e.

**GM16-Q05 — [ON-Q13 / ON-08] Should pharmacies save a payment method during setup? — ✅ STILL VALID (now verified)**
- ACTUAL TODAY (verified): every booking opens a new Stripe Checkout; no card is stored anywhere in the traced code — no saved-card endpoint exists; `charge_shift_fulfillment` creates a fresh Session per booking; a Stripe `customer` is reused only when a subscription exists. Under GM-13's findings there is no D02 30-minute window, so the Oct urgency argument (a shift <2h away leaves 30 minutes to pay) does not describe current code — but the no-saved-card fact stands, and the 24-hour Stripe session is still a slow path for urgent shifts.
- RECOMMENDED (carried, rec B): save a card, charge on acceptance. Severity: medium-high for urgent shifts.
- ALTERNATIVE A — Keep current logic: one checkout per booking; no stored card. ALTERNATIVE B — Save card, charge on acceptance (recommended). ALTERNATIVE C — Saved card for subscribers only.
- Other / defer.
- Source: `backend/billing/shift_payments.py`, `views.py:charge_shift_fulfillment`, `checkout_reservations.py` @ 97c4543e.

**GM16-Q06 — [PO-Q04] Should the pharmacy see the full cost before posting? — 🔄 CHANGED (pay-time half verified; pre-posting half not re-validated)**
- ACTUAL TODAY (verified at pay time): the owner card shows a total — but it is **`$n × 30 AUD` regardless of type or subscriber status** (Vite `ActiveShiftCard.tsx`, Expo `ActiveShiftsPage/ActiveShiftCards.tsx`). A PT/FT booking ($80 / $40) is displayed as $30/offer; a subscriber's $15/$40 is displayed as $30/offer. The server charges the right price (GM16-Q01) — the display is wrong. Whether the posting wizard shows wages/super/fee/GST/total before posting was **not** re-traced (posting wizard screens not read in this trace).
- RECOMMENDED: A — show wages, super, fee, GST, total before posting **and** before payment — with the fee computed from the same price table the server uses (locum vs PT/FT, subscriber vs standard), not a hard-coded $30. Severity: high (the current display misstates the price for PT/FT and subscribers). Needs the GST decision first (GM16-Q15).
- ALTERNATIVE A — Keep current logic: `$n × 30` at pay time; wizard as-is. Trade-off: no work; PT/FT and subscriber owners are shown the wrong total until Stripe.
- Other / defer.
- Source: pay card (both clients) @ 97c4543e; posting wizard ❓ (not re-traced).

**GM16-Q07 — [BK-R01 / SH-13] What happens after booking payment fails? — 🔄 CHANGED (mechanism verified; SH-13 undefined)**
- ACTUAL TODAY (verified, GM-13): a failed/cancelled Stripe attempt leaves the `FulfillmentCheckout` PREPARED/OPEN/UNKNOWN; the owner can resume the same attempt or expire it and start a replacement (409 conflict dialog on web, native alert on Expo; `resumeFulfillmentCheckout` / `expireFulfillmentCheckout` in shared-core). A Stripe provider error returns 400 (or 503 `checkout_uncertain` — "Retry this unchanged request; do not create another payment") and changes nothing. There is no "original deadline" to retry until, because D02 does not exist (GM-13-Q01) — the effective bound is the Stripe session's 24 h. `SH-13` has no definition in `AUDIT.md` (only the `gap` field on BK-R01).
- RECOMMENDED: KEEP the retry rule once GM13-Q01 creates a deadline; until then the rule is "resume or expire-and-replace within the Stripe session". Severity: medium.
- ALTERNATIVE A — Keep current logic (as above). ALTERNATIVE B — Release immediately. ALTERNATIVE C — Extend once.
- Other / defer.
- Source: `backend/billing/checkout_reservations.py`, `useShiftPaymentActions.ts`, `AUDIT.md` @ 97c4543e.

**GM16-Q08 — (new, from verified webhook code) Does a trialling subscription get the 50% discount? — verified mechanism, decision open**
- ACTUAL TODAY (verified, `subscription_events.py`): Stripe `trialing` is stored locally as `active`, and `charge_shift_fulfillment` discounts on local `active` — so a trialling owner DOES get $15/$40. Whether a trial exists, how long it is, and whether this is intended are UNKNOWN (`FREE_TRIAL_DAYS = 0` in settings suggests no trial is currently configured — but `is_in_free_trial` uses a per-user window, and the Stripe-side trial would come from the Price/checkout configuration, which was not traced).
- RECOMMENDED: confirm deliberately — trialling owners getting the discount is a sensible acquisition rule, but only if a trial is a real, bounded offer. Severity: medium (revenue).
- ALTERNATIVE A — Keep current logic: trial = active = discount. Scenario: a pharmacy in a 14-day trial books 5 locum shifts at $15 instead of $30. Trade-off: generous trial, lower trial revenue.
- ALTERNATIVE B — Trial gets no discount until first paid invoice. Scenario: same 5 shifts cost $150 during trial. Trade-off: protects revenue, weaker trial.
- ALTERNATIVE C — Discount only after the trial converts. Trade-off: simplest to explain, hardest to sell.
- Other / defer. Edge: a subscription that lapses from `trialing` without payment goes `inactive` (see GM16-Q09) — the discount then stops mid-reservation with no in-code warning.
- Source: `backend/billing/subscription_events.py` + `shift_payments.py` @ 97c4543e.

**GM16-Q09 — (new, from verified webhook code) What happens the day a subscription lapses? — verified mechanism, decision open**
- ACTUAL TODAY (verified, `subscription_events.py` + `shift_payments.py`): Stripe past-due/unpaid → local `inactive` → **full price immediately** (`$30/$80`), no grace period in code, no warning in either file or on either management screen (the screens show the renewal date but no lapse warning). Stripe `customer.subscription.deleted` → local `canceled` → full price, and only a new paid base checkout can revive it. `current_period_end` is stored and displayed, but nothing honours it.
- RECOMMENDED: add a short grace period (e.g. discount holds until `current_period_end`, or 7 days past-due) and a warning before the first full-price checkout. Severity: high (a pharmacy that misses one $30 payment silently pays double on the next booking; disputes and churn risk).
- ALTERNATIVE A — Keep current logic: full price the moment Stripe says not-active. Scenario: card expires on the 1st, owner books on the 2nd and pays $80 instead of $40 with no notice. Trade-off: simplest code, worst surprise.
- ALTERNATIVE B — Grace until `current_period_end`: discount holds for the paid period even after cancellation. Scenario: owner cancels mid-month, keeps $15/$40 until month-end, then full price. Trade-off: matches what "I paid for a month" means; needs the checkout to read `current_period_end`.
- ALTERNATIVE C — 7-day past-due grace + email/SMS warning, then full price. Scenario: failed payment on the 1st, owner warned, books on the 5th still at $40. Trade-off: forgiving, needs dunning notices.
- Other / defer. Edge: extra-seat addon deleted → `staff_count` resets to 5 immediately (see GM16-Q10); retry/concurrency: webhook re-retrieves from Stripe under row lock, so out-of-order events are safe. Denied role/wrong tenant: webhook rejects mismatched Stripe customer (verified).
- Source: `backend/billing/subscription_events.py` (`handle_subscription_updated`, `handle_invoice_paid`, `handle_subscription_deleted`) + `shift_payments.py` @ 97c4543e.

**GM16-Q10 — (new, from verified webhook code) What happens to staff over 5 when extra seats drop? — verified reset; gating UNKNOWN**
- ACTUAL TODAY (verified): base plan carries `staff_count = 5`; extra seats add `5 + n`. If the addon subscription is deleted, `staff_count` resets to 5 immediately. What "staff_count" gates (who counts, what happens to person 6 — blocked, removed, grandfathered, billed) is **UNKNOWN** — the gating code was NOT read (`test_subscription_accounts.py` not fetched; no enforcement was found in the traced files).
- RECOMMENDED: decide before launch; do not let a billing event silently remove people's access. Severity: high (access loss). ALTERNATIVE A — Keep: reset to 5, 6th+ staff lose access at once. ALTERNATIVE B — Grandfather existing staff, block new adds above 5. ALTERNATIVE C — Downgrade only at next renewal. Other / defer. **Re-trace the gating code before deciding.**
- Source: `backend/billing/subscription_events.py` @ 97c4543e; gating ❓.

**GM16-Q11 — [CX-Q02 + P09 + NOPEN] Who receives the owner cancellation fee, and does the legacy penalty conflict? — ❓ + verified conflict**
- Oct 2026: P09 set a % of agreed wages but no recipient; F01 keeps booking fee and worker pay separate; #184 rec: A (worker, as cancellation pay). NOT re-validated as a decision. NEW verified facts: the only charging code at the head (`charge_penalty`) pays nobody — it is a platform Stripe checkout with no payee — and its bands (10/20%) differ from P09 (0–30%). It also charges on *all* assignments, not cancelled dates only. The route + view + shared-core export are all live (§1b).
- RECOMMENDED: decide recipient + bands + legal review together (with GM16-Q03/Q14); do not launch any cancellation charge until then. Severity: high (legal/financial).
- ALTERNATIVE A — Worker, as cancellation pay (via payroll/invoice, CX-Q22). ALTERNATIVE B — Platform keeps it. ALTERNATIVE C — Split. Other / defer.
- Source: `shift_payments.py::charge_penalty` @ 97c4543e; P09/GM-15 adopted.

**GM16-Q12 — [CX-Q19 / CX-Q20 / CX-Q21 / CX-Q22] Booking-fee refunds/credits and cancellation pay — ✅ STILL VALID as "not built" (now verified)**
- CX-Q19: pharmacy cancels a paid booking → refund >72h / credit inside / refund+credit? #184 rec: C.
- CX-Q20: worker cancels/no-shows → pharmacy picks remedy / credit only / keep only if replaced? #184 rec: C.
- CX-Q21: who approves refunds/credits — platform finance/support admin vs automatic by rule? #184 rec: A.
- CX-Q22: how is worker cancellation pay paid — same invoice/payroll channel vs platform pays? #184 rec: A.
- **Now verified (not just Oct evidence):** no refund/credit-note/reversal endpoint or UI exists anywhere in the traced billing code (`urls.py` zero `refund` hits — GM-17 adopted; `views.py` has no refund view); refunds exist only as Stripe-initiated reconciliation (`handle_charge_refunded`). No cancellation endpoint for confirmed outside bookings exists (only the AHPRA path — GM-13 F07). All four stay open; the decision is GM-17-Q01's (refund vs credit), which GM-16 adopts.
- Source: `backend/billing/urls.py` (GM-17), `views.py`, `payment_events.py` @ 97c4543e.

**GM16-Q13 — [CX-Q03] If the pharmacy cancels an unpaid reservation, is any fee due? — ✅ STILL VALID (now verified)**
- Oct 2026: not built; #184 rec: A (no fee; worker notified), because D01 makes payment the confirmation point. **Now verified:** there is no pharmacy-cancel transition for unpaid reservations at all — the only ways an unpaid reservation ends are payment, explicit checkout expiry, AHPRA decline, or Stripe session lapse (GM-13). No fee is charged on any of those paths (expiry is free; AHPRA decline is free).
- RECOMMENDED: A — no fee; worker notified (the notification half needs GM13-Q02's expiry notices to exist). Severity: low.
- ALTERNATIVE A — No fee (recommended). ALTERNATIVE B — Fee bands apply: treat it like a confirmed booking (contradicts D01).
- Other / defer.
- Source: `checkout_reservations.py`, `cancellation.py` @ 97c4543e; GM-15 adopted.

**GM16-Q14 — [LA-R02 / SH-16] May cancellation charges launch before Australian legal review? — ✅ still open (decision)**
- Oct 2026: P08/P09 define % charges; no review of classification, proportionality, or unfair-contract-term compliance (penalties for unfair standard-form terms apply since Nov 2023). #184 rec: A (legal review before launch). Nothing in the verified files shows a review happened. The legacy penalty still being routed + exported makes this launch-gating. ALTERNATIVE A — Legal review before launch. B — Disclosure is enough. C — Never charge. Other / defer.
- Source: #184 Oct 2026; no review evidence in any verified file @ 97c4543e.

**GM16-Q15 — [LA-R01 / SH-15] Booking fees: GST and tax invoice? — ✅ STILL VALID (now verified)**
- Oct 2026: fixed Stripe prices, no stated GST treatment, no platform tax invoice. **Now verified:** no GST mention in any traced billing file (`checkout_prices.py` is bare cents; `stripe_support.py` has no tax settings; `OwnerBillingPage.tsx` and the pay card show no GST line); the only GST fact in the code is the `gst_registered` flag on ABN worker terms (GM-14). Applies to the $30/$80 fees AND the $30/month subscription AND extra seats (Stripe Price dollar value UNKNOWN from code). Re-trace: none needed for the gap — it is verified absent.
- RECOMMENDED: A (before launch — tax advice, correct GST treatment, total shown before payment, invoice/receipt from correct supplier). Needs qualified tax advice, not just an opinion.
- ALTERNATIVE A — Tax advice + correct treatment before launch (recommended). B — Disclosure is enough. C — No GST treatment (not a real option without advice).
- Other / defer.
- Source: `checkout_prices.py`, `stripe_support.py`, `OwnerBillingPage.tsx`, pay card @ 97c4543e; GM-14/GM-17.

**GM16-Q16 — Subscription management: where, by whom, and what does cancelling do? — ✅ VERIFIED (screens now traced)**
- ACTUAL TODAY (verified): **Web** — `OwnerBillingPage.tsx`: plans / subscribe / manage; card or invoice; seats; renewal date from `currentPeriodEnd`. **Expo** — `roles/owner/subscription-seats.tsx`: same data + actions with `platform: 'mobile'`. **Who:** `user_can_manage_billing_for_pharmacy` (owner, billing managers, scoped org admins — `utils.py`); the views enforce it (403 otherwise). **Cancelling: there is no way to cancel from the app** — no endpoint, no route, no UI on either client; a subscription ends only via Stripe (webhook `deleted` → local `canceled`). How the owner initiates that is UNKNOWN. **Next:** no subscription/billing page in the migrated copy.
- RECOMMENDED: decide the cancel path before launch — at minimum a "cancel at period end" action in the app (with the grace rule from Q09-B if chosen) or a documented Stripe-portal link. Severity: high — owners cannot leave; a subscription that cannot be cancelled is a consumer-law problem. ALTERNATIVE A — Keep current logic (cancel only via Stripe, undocumented). ALTERNATIVE B — In-app cancel at period end (discount holds until `currentPeriodEnd`). ALTERNATIVE C — In-app immediate cancel + refund of the remainder (needs GM-17's refund rule). Other / defer.
- Edge: invoice-path subscriptions stay `inactive` until the invoice is paid — an owner who chose invoice and never pays has no subscription and no discount, with no dunning in the traced code.
- Source: `OwnerBillingPage.tsx`, `roles/owner/subscription-seats.tsx`, `subscription_operations.py`, `views.py`, `urls.py` (GM-17) @ 97c4543e.

**GM16-Q17 — Pills: what are they, what are they worth, do they touch money? — ✅ VERIFIED (fully traced this re-run)**
- ACTUAL TODAY (verified, §1f): Pills are referral-earned credits (100 friend / 50 shift referral) recorded in an append-only ledger; **200 pills pays one fulfilment fee** (per selected pending offer) instead of Stripe. They do not offset the subscription, do not discount Stripe fees, never expire as ledger entries, cannot be bought or transferred, and are awarded only after the referred user is verified (OTP + onboarding). Earn is referral-only — there is no award for completed shifts, ratings, or anything else in the traced code. Pills survive account pause? UNKNOWN (no pause interaction traced — AHPRA suspension cancels bookings but the ledger is untouched in the traced code). Pills on a cancelled/refunded booking: UNKNOWN — `pay_shift` spends at finalisation; if the booking is later cancelled there is no pill refund/reversal path in the traced code (a REVERSAL entry type exists in the enum, but no writer was found).
- RECOMMENDED: keep the 200-pill price for launch, and decide the two unknowns now: (a) cancelled-booking pill refunds (reverse the spend, or keep it — the money was never taken by Stripe, so a reversal is cheap and fair); (b) whether Pills are shown as a dollar value anywhere (they are not — the screens show "N pills per shift post", which is honest). Severity: medium (money-adjacent). ALTERNATIVE A — Keep current logic (200/post, no refunds, no expiry). ALTERNATIVE B — Lower/raise the price (e.g. 100/post = 1 friend referral per booking). ALTERNATIVE C — Let Pills offset the subscription too (needs a Stripe-side mechanism that does not exist). Other / defer.
- Edge: self-referral and same-billing-identity referrals are blocked; referral awards need the referred user verified, so a referrer can wait indefinitely for pills from an unverified friend (event stays CLAIMED).
- Source: `backend/rewards/{models,services,views,serializers,urls}.py`, `PillsPage.tsx`, `PillsScreen.tsx`, `shared-core/src/domains/rewards/api.ts` @ 97c4543e.

**GM16-Q18 — [AG-Q01/AG-Q02, GM-16 angle] Does the pharmacy ever agree the fee/subscription terms that bind it? — ✅ STILL VALID (now verified via GM-14)**
- Oct 2026: only the worker accepts terms; the pharmacy never records acceptance of the owner fee table (P09) or, by extension, the subscription/fee terms. **Now verified (GM-14):** `freeze_accepted_terms` stamps worker id + time only; no pharmacy acceptance exists anywhere. If the $30/$80 + $15/$40 table is only shown at Stripe checkout, it is arguably not agreed before the booking.
- RECOMMENDED: A — pharmacy accepts when it sends/approves, logged with time + terms version (GM-14-Q03 owns the wording; GM-16 adopts it). Severity: high (enforceability of every fee in this area).
- ALTERNATIVE A — Keep current logic: worker-only acceptance. Other / defer.
- Source: GM-14 (`engagement.py:747`); `OwnerBillingPage.tsx` (no acceptance step before subscribe — the subscribe button goes straight to Stripe Checkout).

### B. Carried decisions touching GM-16 (from #184 `carried`, NOT re-decided here)

- **P09:** owner fee = % of frozen agreed wages, cancelled dates only. Bands: >7d 0%, 72h–7d 0%, 24–72h 10%, 12–24h 15%, 2–12h 20%, <2h 25%, at/after start 30%. Boundary rule (CX-Q04, KEEP): milder band at exactly 72/24/12/2h, pharmacy local time. ⚠️ Verified conflict: `charge_penalty` uses 10/20% over *all* assignments — not P09. (GM-15 adopted: the P09 calculator is preview-only and not connected.)
- **F01:** booking fee, any refund/credit, and worker pay stay separate.
- **F04:** payment arriving after expiry → no rebooking; pharmacy chooses credit or refund after approved review. ⚠️ Verified gap: no credit/refund choice exists in-app (GM-17 owns the decision).
- **NOPEN:** no money penalties for workers, ever. ⚠️ Needs reconciliation with the legacy penalty (charged to pharmacy, but unnamed/unagreed) and with P09.
- **D01–D03:** acceptance = time-limited reservation; verified payment confirms; expiry releases to the same audience, notifies both sides, no penalty. ⚠️ **GM-13 verified D02/D03 are not implemented** — the reservation has no pay-by deadline and no expiry flow. GM-16's fee questions assume D01/D03; the fee is charged at the point the reservation is confirmed, whenever that is.

## 4. SINGLE FIRST DECISION QUESTION (ask the owner first)

**GM16-Q01-FIRST — Confirm the launch price table exactly as coded, and what happens when a subscription lapses?**

Plain English: today the code charges a pharmacy **$30 for each locum shift filled and $80 for each permanent/part-time job filled**, or **half price ($15 / $40) if they have an active $30-a-month owner subscription**. The fee is charged once per accepted offer, no matter how many hours or days that offer covers. The moment Stripe says the subscription is no longer active — missed payment, cancelled — the discount stops immediately and the next booking is full price, with no warning in the code. (New since the partial: the same booking can also be paid with **200 Pills** instead of Stripe, and the subscription can be bought by **invoice** — 7 days to pay, inactive until paid.)

- **Option A — Keep current logic (RECOMMENDED as the starting position, subject to the lapse warning below):** $30 / $80 PAYG, $15 / $40 for active subscribers, one fee per offer; 200 Pills as an alternative payment. Scenario: a pharmacy books 3 locum shifts in a month as a subscriber ($45 + $30 sub = $75) vs PAYG ($90). Trade-off: simple, already built, matches the marketing line "staff free, $30/month, 50% off fees".
- **Option B — Change the lapse rule only:** keep the prices, but the discount holds until the end of the paid month (or a 7-day grace) after a missed payment/cancellation, with a warning before the first full-price checkout. Scenario: card expires on the 1st, owner books on the 5th and still pays $40, and is told to update the card. Trade-off: kinder, fewer disputes; needs the checkout to read `current_period_end` and needs dunning notices.
- **Option C — Change the fee shape:** per-day fees, or a % of wages, instead of flat per offer. Scenario: a 10-day block costs $300 instead of $30. Trade-off: fairer per day, but a big price rise for block bookings and more code.
- **Option D — Change the prices:** different PAYG/subscription numbers (owner states them).
- **Other (describe) / defer.**

Why this one first: every other GM-16 question (trial, refunds, cancellation fees, Pills offsetting fees, GST) depends on which price table is real. The code already charges these amounts, so the owner is effectively already committed — this question makes that commitment explicit before launch. The lapse half is included because it is the sharpest verified surprise in the code (full price with no warning).

## 5. Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; timing is the only question)
1. **Hard-coded Stripe Price IDs** (`checkout_prices.py`, `stripe_support.py` — verified): move to settings/env per environment. (LA-Q07 second half.) Before live checkout.
2. **Legacy cancellation charging (SH-02 / LA-Q06):** superseded by BL-04 in the central engineering backlog. Preserve the route and shared-core export behind the existing flag. Correct the charge before enabling live collection.
3. **Pay card shows `$n × 30 AUD` always** (Vite `ActiveShiftCard.tsx`, Expo `ActiveShiftCards.tsx` — verified): show the true fee (locum vs PT/FT, subscriber vs standard) before payment. (GM16-Q06.)
4. **Fee/GST/total not shown before posting** (posting wizard NOT re-traced): show wages, super, fee, GST, total before posting and before payment — needs the GST decision first (GM16-Q15), then it is a build task. (PO-Q04.)
5. **Billing-date/comment contradiction** (`settings.py:681-682`): `BILLING_LIVE_DATE = 2025-06-01` with comment "June 1, 2026". Fix the date or the comment, and confirm which gate (date vs flag) is authoritative (GM16-Q04).
6. **No in-app subscription cancel** (verified absent on web + Expo + backend): add a cancel path (or a documented Stripe-portal link) — see Q16.
7. **No missed-webhook sweeper / reconciliation queue** (GM-13 CG-5): a paid checkout whose webhook never arrives stays unfinalised until manual reconciliation.
8. **Pills referral code not shown on either Pills screen** (verified: `fetchPillReferralCodeService` exists but neither screen calls it): show the code + share action if referrals are meant to earn.
9. **No dunning for invoice-path subscriptions** (verified: invoice stays `inactive` until paid, no reminder in traced code).

### Decision gaps (owner must choose first — do not build until answered)
1. Launch price table + lapse/grace rule → **GM16-Q01-FIRST** (above).
2. Trial: length, who gets it, whether trialling owners get the discount (GM16-Q04, GM16-Q08).
3. Cancellation money: P09 recipient + bands vs legacy penalty, legal review, refund/credit engine, approver, cancellation-pay channel (GM16-Q03, Q11–Q14).
4. GST + tax invoices on fees and subscription (GM16-Q15) — needs qualified tax advice, not just an opinion.
5. Saved payment method / auto-charge on acceptance (GM16-Q05) — affects the D02 30-minute urgent window (which GM-13 found does not exist).
6. Extra seats: price (Stripe dollar value UNKNOWN from code), what `staff_count = 5` gates, what happens to staff 6+ on downgrade (GM16-Q10, Q16).
7. Pills: earn/burn/expiry/money-offset (GM16-Q17) — price confirmed (200/post); cancelled-booking pill refunds + referral-code display still open.
8. Subscription management UX + cancel semantics (immediate vs period-end) on web vs Expo (GM16-Q16); Next has no subscription surface at all (GM-25).

## 6. Documentation matrix & implementation backlog

### Per-question source links (verified @ PR #249 head 97c4543e unless marked ❓)

| Question | Status | Source |
|---|---|---|
| GM16-Q01 (PO-Q16/SH-03) | 🔄 CHANGED | `shift_payments.py::charge_shift_fulfillment` + `checkout_prices.py` |
| GM16-Q02 (LA-Q07/SH-03) | 🟢 PART-FIXED | same files (discount applied; Price IDs hard-coded) + `stripe_support.py` |
| GM16-Q03 (LA-Q06/SH-02) | ✅ code-present; routing verified | `shift_payments.py::charge_penalty`, `views.py:charge_penalty`, `urls.py` (GM-17), shared-core billing API |
| GM16-Q04 (PO-Q15/SH-04) | 🔄 mechanism verified (date + flag) | `settings.py:674-682`, `utils.py`, `release_guards.py` |
| GM16-Q05 (ON-Q13/ON-08) | ✅ STILL VALID | `shift_payments.py`, `views.py:charge_shift_fulfillment` |
| GM16-Q06 (PO-Q04) | 🔄 pay-time verified; pre-posting ❓ | pay card both clients; posting wizard not re-traced |
| GM16-Q07 (BK-R01/SH-13) | 🔄 CHANGED; SH-13 undefined | `checkout_reservations.py`, `useShiftPaymentActions.ts`, `AUDIT.md` |
| GM16-Q08 (trial discount) | verified mechanism | `subscription_events.py` (trialing→active) + `shift_payments.py` |
| GM16-Q09 (lapse) | verified mechanism | `subscription_events.py` + `shift_payments.py` |
| GM16-Q10 (extra seats) | verified reset; gating ❓ | `subscription_events.py`; `test_subscription_accounts.py` ❓ |
| GM16-Q11 (CX-Q02/P09/NOPEN) | ❓ decision + verified conflict | `charge_penalty` @ 97c4543e; P09/GM-15 |
| GM16-Q12 (CX-Q19–Q22) | ✅ STILL VALID ("not built" verified) | `urls.py` (GM-17), `views.py`, `payment_events.py` |
| GM16-Q13 (CX-Q03) | ✅ STILL VALID | `checkout_reservations.py`, `cancellation.py` |
| GM16-Q14 (LA-R02/SH-16) | ❓ decision, still open | #184 Oct 2026; no review evidence in verified files |
| GM16-Q15 (LA-R01/SH-15) | ✅ STILL VALID (verified absent) | `checkout_prices.py`, `stripe_support.py`, billing screens |
| GM16-Q16 (subscription mgmt UX) | ✅ VERIFIED | `OwnerBillingPage.tsx`, `roles/owner/subscription-seats.tsx`, `subscription_operations.py`, `views.py` |
| GM16-Q17 (Pills) | ✅ VERIFIED | `backend/rewards/*`, `PillsPage.tsx`, `PillsScreen.tsx`, `shared-core/.../rewards/api.ts` |
| GM16-Q18 (AG-Q01/Q02 fee agreement) | ✅ STILL VALID | GM-14 (`engagement.py:747`); `OwnerBillingPage.tsx` |

### Decision status per question
- Decided: **none** in this trace. (Carried P09/F01/F04/NOPEN/D01–D03 are #184-era decisions, not re-confirmed here — and D02/D03 are verified **not implemented** by GM-13.)
- Ready to decide now: GM16-Q01-FIRST (prices + lapse), GM16-Q16 (cancel path), GM16-Q17 (pill refunds). Engineering for GM16-Q03: see BL-04.
- Blocked on re-trace: GM16-Q06 (pre-posting half), GM16-Q10 (staff-count gating).
- Blocked on external advice: GM16-Q14 (legal), GM16-Q15 (tax).
- Owned by another area: GM16-Q12/Q13 (GM-17-Q01 refund vs credit), GM16-Q18 (GM-14-Q03 pharmacy acceptance).

### Implementation backlog — PROPOSED ONLY, after owner answers (nothing here is decided)
1. Move Stripe Price IDs to per-environment config; add staging test prices. (After GM16-Q01; before live checkout.)
2. Engineering: see BL-04 for feature-preserving cancellation charging behind the existing flag.
3. Implement lapse grace + pre-charge warning, reading `current_period_end`. (After GM16-Q01-FIRST option B, if chosen.)
4. Fix pay-card total (true fee by type + subscriber status) and show full cost (wages, super, fee, GST, total) pre-posting and pre-payment, web + Expo. (After GM16-Q06/Q15.)
5. Build or confirm refund/credit engine + approver workflow + cancellation-pay channel. (After GM16-Q12; GM-17 boundary.)
6. Implement P09 cancellation charging (or confirm never), with pharmacy agreement + disclosure. (After GM16-Q11/Q14.)
7. Extra-seat gating + downgrade behaviour for staff over 5. (After GM16-Q10 + gating re-trace.)
8. Saved-card / auto-charge on acceptance (urgent-shift path). (After GM16-Q05.)
9. Pills: cancelled-booking pill refunds, referral-code display on Pills screens, dunning for invoice-path subscriptions. (After GM16-Q17/Q16.)
10. In-app subscription cancel (immediate vs period-end) on web + Expo; Next subscription surface or route-to-Vite decision (GM-25). (After GM16-Q16.)
11. Cross-client tests (positive/negative, role/tenant, duplicate webhook, out-of-order events, trial→active→inactive→canceled transitions, free-trial→paid boundary, pill pay + insufficient balance, invoice-path activation) for every implemented item, web + Expo. (After each owner answer; none written now.)

### What the parent agent / next worker must do next
1. Re-trace the two remaining ❓ items: `backend/billing/test_subscription_accounts.py` (staff-count gating) and the posting wizard's pre-posting cost display (GM16-Q06 half).
2. Confirm the extra-seat Stripe Price dollar value from the Stripe dashboard (not from code — the $5 in `pricing.ts` is a client estimate).
3. Ask the owner GM16-Q01-FIRST first, one question at a time (per #250), before any implementation.


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-16-W01: Launch with no free trial, or with a trial? (W-02, D153)
**Scenario:** Tom signs up his pharmacy, posts his first shift, then offers it to Sara.
**What happens today:** The default trial is zero days. `PAYMENT_REQUIRED` is used in offer acceptance, where a qualifying booking waits for payment before confirmation. Tom can post without subscribing. Live fulfilment collection has its own release switch and defaults off (`pr257:backend/shifts/posting.py:100`, `pr257:backend/shifts/offers.py:406`, `pr257:backend/core/settings.py:678`, `:685`). O4 used a 30-day trial override and did not verify live Stripe.
**Recommendation first: B.** Give Tom 30 days before the standard payment rule applies to eligible bookings.
- **KEEP (0 days):** Tom can post. Standard payment rules apply from the first eligible acceptance, once live collection is enabled.
- **B (recommended):** Tom gets 30 trial days for eligible bookings, then standard payment rules apply.
- **C:** Tom gets another trial length chosen by the owner.
- **DEFER**

**Note:** Stripe live acceptance is a production checklist item (GM-26), whatever the answer here.
**Status:** OPEN

### GM-16-W02: Subscription and seats: web only for launch? (W-07)
**Scenario:** Tom opens the Subscription screen in the phone app to add two seats.
**What happens today:** The server can change Tom's existing extra-seat subscription in Stripe directly. It opens a new Stripe Checkout session when Tom needs to buy extra seats for the first time. The phone opens the returned Checkout URL. These actions have no billing portal (`pr257:backend/billing/subscription_operations.py:160`, `:196`, `pr257:frontend_mobile/roles/owner/subscription-seats.tsx:104`, `:128`).
**Recommendation first: A.** Keep purchases and seat changes on the web for launch. Tom can see the plan and seat count on his phone.
- **A (recommended):** Tom sees his plan and seats on the phone and goes to the web to buy or change them.
- **KEEP:** Tom can change seats from the phone. The app opens Stripe Checkout when the server returns a new session.
- **DEFER**

**Status:** OPEN
