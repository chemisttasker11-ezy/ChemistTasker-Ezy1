# GM-17 Invoices / refunds — Grill Me trace (read-only)

> **Corrections against current code (21 Nov 2026 review).** 9 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 7 hold, 2 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q03 / Q15 | Reconciliation has “no queue, screen … or record” | WRONG — too broad | Django admin provides fulfillment-checkout reconciliation and records an audit reason when manually expiring an attempt. This is not a customer-facing refund-approval workflow or a defined operational SLA. | `main:backend/billing/admin.py:89`; `pr257:backend/billing/admin.py:100`; `pr257:backend/billing/admin.py:110` |
| Finance flow matrix | Web and Expo share unrestricted authenticated finance access | MAIN-ONLY | PR257 denies Explorer accounts across both modern finance and legacy invoice routes, including downloads and worksheets. Main lacks this role restriction; ordinary authorised workers and pharmacy managers retain their existing scoped access. | `main:backend/worker_finance/views.py:153`; `pr257:backend/worker_finance/permissions.py:4`; `pr257:backend/invoicing/views.py:70`; `pr257:backend/worker_finance/views.py:626` |

**Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Area:** GM-17 Invoices/refunds (Issue #250 scope; method per PR #184 / Issue #250)
**Evidence head (verified this session):** PR #249 head **`97c4543e051b43fe30ec7e2e61ad3d69957a918e`** — confirmed unchanged via `pull_request_read get` on #249 (still the head, updated 2026-11-05). PR #249 is stacked on #248 (`25939534a1c5543454a8e770571e4dff46380d96`).
**No GitHub rate limit was hit.** All file evidence below was fetched at `refs/pull/249/head` unless stated. Caveat: `search_code` indexes the default branch (main, `8ccf8f77`); it was used only to *locate* files, and every cited behaviour was then read from the file at the #249 head.
**No code changed, no PR/issue/comment created.** Documentation and decisions only.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Fulfillment fee checkout redirect | Dispatches `chargeShiftFulfillment` and redirects to Stripe Checkout (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:30`). | Dispatches `chargeShiftFulfillment` opening Stripe session on mobile (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:228`). | Yes | - |
| Free mode finalisation | PRE_LIVE / FREE_TRIAL finalises booking with zero charge (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:33`). | Free billing mode finalises booking with zero charge (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:232`). | Yes | - |
| Worker invoices list | Renders list of worker invoices with status and date filters (`frontend_web/src/pages/dashboard/sidebar/Invoices/InvoiceManagePage.tsx:8`). | Renders invoice list grouped by status (`frontend_mobile/roles/shared/invoices/InvoiceList.tsx:68`). | Yes | - |
| Worker invoice details & generation | Inspects invoice line items and triggers PDF generation (`frontend_web/src/pages/dashboard/sidebar/InvoiceDetailPage.tsx (re-exported by sidebar/Invoices/InvoiceDetailPage.tsx:1)`). | Displays invoice details and allows line item edits (`frontend_mobile/roles/shared/invoices/InvoiceDetail.tsx:91`). | Yes | - |
| Subscription payment by invoice | Allows selecting invoice billing for subscriptions (`frontend_web/src/pages/dashboard/sidebar/owner/OwnerBillingPage.tsx:85`). | Expo manages extra seats only; it has no option to pay the subscription by invoice (`frontend_mobile/roles/owner/subscription-seats.tsx:29`). | No | Corrected 22 Nov (orchestrator review): invoice billing is web-only. Covered by GM-16-W02 (subscription and seats web-only for launch). |
| Checkout reconciliation & conflict queue | Displays conflict dialog when previous checkout state is unresolved (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/hooks/useShiftPaymentActions.ts:5`). | Displays alert when checkout attempt is in conflict (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:246`). | Yes | - |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM17-Q01 | Web + Expo |
| GM17-Q02 | Web + Expo (also covers GM15-20) |
| GM17-Q03 | Web + Expo (also covers GM15-21, GM26-Q21) |
| GM17-Q04 | Web + Expo (asked in GM-16: GM16-Q11) |
| GM17-Q05 | Web + Expo (also covers GM15-22) |
| GM17-Q06 | Web + Expo (asked in GM-16: GM16-Q15) |
| GM17-Q07 | Web + Expo (asked in GM-16: GM16-Q04) |
| GM17-Q08 | Web + Expo (asked in GM-16: GM16-Q01) |
| GM17-Q09 | Web + Expo |
| GM17-Q10 | Web + Expo (asked in GM-16: GM16-Q06) |
| GM17-Q11 | Web + Expo (also covers GM15-45, GM22-16) |
| GM17-Q12 | Web + Expo |
| GM17-Q13 | Web + Expo |
| GM17-Q14 | Web + Expo |
| GM17-Q15 | Web + Expo |
| GM17-Q16 | Web + Expo (asked in GM-08: GM-08-Q11) |
| GM17-Q17 | Web + Expo (asked in GM-13: GM13-Q12) |
| GM17-Q18 | Web + Expo |
| GM-17-W01 | Web + Expo |
| GM-17-OD-12 — Organisation Invoices are on Expo but not in web's organisation menu | Web + Expo |

## 0. The one fact that frames everything: there are TWO money systems

| | A — Platform fees (Stripe) | B — Worker wages (worker-issued invoices) |
|---|---|---|
| What it is | Booking (fulfilment) fee, cancellation penalty, owner subscription | The locum/contractor invoices the pharmacy for worked shifts; super contribution requests |
| Backend | `backend/billing/` — `ShiftPayment`, `FulfillmentCheckout`, Stripe Checkout + webhooks | `backend/invoicing/` (`Invoice`, `InvoiceLineItem`) + `backend/worker_finance/` (finance workspace: customers, items, revisions, payments, deliveries, expenses, BAS worksheet) |
| Who pays whom | Pharmacy → ChemistTasker (Stripe) | Pharmacy → worker, **outside the platform** (payment is *recorded* in the app, not moved by it) |
| Refund path | Stripe-initiated only (see §7) | None — no credit notes, reversals, refunds or void action (see §4) |
| GST | **No GST treatment anywhere** (see §6) | Full per-line GST engine, tax codes, BAS worksheet estimates |

The platform never holds or moves wage money. That single fact drives most of the decisions below.

---

## 1. Current-flow matrix

Trigger → Actor → Backend/API → Vite web → Expo → Persisted state → Event/side effect → Recovery/denial path

| # | Trigger | Actor | Backend / API | Vite web | Expo (mobile) | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| F1 | Owner accepts an offer that needs payment | Owner / roster-capable manager (`user_can_pay_shift_charge_for_pharmacy`, `billing/utils.py`) | `POST /billing/charge-fulfillment/<shift_id>/` → `billing/views.py: charge_shift_fulfillment` → `shift_payments.charge_shift_fulfillment` | Shared-core `billingApi.chargeShiftFulfillment` → Stripe Checkout URL (redirect) | Same shared-core call, `platform: 'mobile'` | `FulfillmentCheckout` (PREPARED→OPEN→COMPLETE/EXPIRED/UNKNOWN), `FulfillmentReservation` per occurrence | Stripe Checkout; on success webhook finalises offers, sends `send_shift_payment_finalized_notifications` | Expire/resume endpoints; ambiguous outcome → `UNKNOWN`, reconcile before re-pay; `CheckoutUncertain` |
| F2 | Free / pre-live confirmation | Same payer | Same endpoint; `billing_state` PRE_LIVE / FREE_TRIAL → finalise free, no Stripe | Same | Same | `Shift.payment_status` PENDING/PAID; offers ACCEPTED | Finalised notifications, `payment_method="free"` | n/a — no money moved |
| F3 | Stripe checkout paid | Stripe webhook | `POST /billing/webhook/` → `webhooks.receive_stripe_webhook` (signature verify, `StripeWebhookEvent` dedupe by `event_id`, atomic) → `payment_events.handle_payment_checkout` | — (return URLs only) | — (mobile bridge return URL) | `ShiftPayment` (paid, `stripe_payment_intent_id` unique), `Shift.payment_status` | Offers finalised; notifications; if work unbookable → `reconciliation_required` + `shift_payment_refund_required` notice | Webhook retry: processed events are no-ops; `PAYROLL_CORRECTION_PENDING` returns 503 so Stripe retries after audited correction |
| F4 | Owner cancels a filled shift (penalty) | Payer for that pharmacy | `POST /billing/charge-penalty/<shift_id>/` → `shift_payments.charge_penalty`: 20% if ≤24h, 10% if ≤72h, else none; **all assignments on the shift, submitted slot selection ignored, ambient timezone, no persisted obligation, no idempotency key** | Shared-core `billingApi.chargeShiftPenalty` (sends `{hours}` — **server ignores it**) | Same shared-core call | `ShiftPayment` type `cancellation` (only after Stripe pays; webhook `handle_payment_checkout` returns early for non-fulfilment — offers NOT finalised) | Stripe Checkout with dynamic `price_data` | No retry/idempotency record; re-calling re-charges. Live collection gated off by default (see F5) |
| F5 | Live collection enablement | Deploy config only | `billing/release_guards.py: assert_can_create_shift_charge` — live mode requires `BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED` / `BILLING_LIVE_SHIFT_PENALTY_ENABLED` = true; test keys need explicit non-prod `APP_ENV`; staging refuses live keys | — | — | Settings `core/settings.py:674-675` (both default `False`) | 503 `live_collection_disabled` otherwise | "Disabling collection must never mean dropping money already received" (`LIVE_SHIFT_COLLECTION_GUARDS.md`) |
| F6 | Owner subscription (card) | Owner or ORG_ADMIN (`user_can_manage_billing_for_pharmacy`) | `POST /billing/subscribe/` (`payment_method: card`) → Stripe Checkout `mode: subscription` | Shared-core `createSubscriptionCheckout` | Same | `OwnerSubscription` (owner XOR organisation, `stripe_customer_id`, `stripe_subscription_id`, `staff_count` default 5) | `checkout.session.completed` → `subscription_events.handle_subscription_checkout`; `invoice.paid` → `handle_invoice_paid` sets active + `current_period_end` | Seat changes via `POST /billing/subscription/seats/` (min 5 seats; proration note in code) |
| F7 | Owner subscription (invoice) | Same | `POST /billing/subscribe/` (`payment_method: invoice`) → Stripe `Subscription.create(collection_method='send_invoice', days_until_due=7)` | Same | Same | `OwnerSubscription.status='inactive'` until paid | Stripe emails the invoice; `invoice.paid` webhook activates | **No dunning, retry or suspension policy found** — unpaid after 7 days leaves status `inactive`; `customer.subscription.deleted` handler exists but its policy was not inspected (unknown) |
| F8 | Worker creates invoice for worked shift | Worker (ABN, invoice-routed assignment) | Finance API `POST /finance/invoices/` (router `worker_finance/urls.py`) → `services.save_draft`; or legacy `POST /invoices/generate/` (`invoicing/views.py: GenerateInvoiceView`) | `frontend_web/src/pages/finance/FinanceWorkspace.tsx` + `InvoiceComposer.tsx` | `frontend_mobile/roles/shared/invoices/FinanceWorkspace.tsx` + `FinanceInvoiceEditor.tsx` | `Invoice` (draft, `request_key` UUID, `version=1`, `kind='invoice'`, `source`, `payload`, `calculation`); `InvoiceLineItem` (one ProfessionalServices line per `source_assignment`, unique constraint) | Server calculates totals (Decimal, ROUND_HALF_UP, per-line GST); preview endpoint; frozen source terms kept separately from billed values | Stale version → 400 (not 409 — preserved contract, `INVOICE_OPERATIONAL_ACCEPTANCE_20261030.md`); `request_key` unique per user prevents double-create |
| F9 | Worker sends invoice | Worker (issuer) | `POST /finance/invoices/<id>/send/` — requires `confirmed: true`, version check, not voided; delivery row reserved **before** SMTP; `begin_delivery` claim; uncertain SMTP → 503 "do not resend until checked" | FinanceWorkspace send | Same | `InvoiceDelivery` (statuses in `worker_finance/delivery_states.py`); sent revision is the published one; newer unsent correction stays private | Email with PDF attachment (`documents.render_pdf`); `invoice_sent` template (legacy) | No automatic retry of uncertain/stuck attempts — reconcile with broker/provider evidence first |
| F10 | Pharmacy reviews received invoice | Owner / org admin / pharmacy admin, within their pharmacy scope (`ReceivedInvoiceViewSet._managed_pharmacies`) | `POST /finance/received-invoices/<id>/approve-payment/` or `/request-revision/` or `/mark-paid/` — all require current delivered version + note (revision request **requires** note) | `FinanceWorkspace` received tab + `InvoiceReviewDrawer.tsx` | Same; action gating mirrored client-side in `receivedInvoicePolicy.ts` (server authoritative) | `Invoice.review_status` NONE → APPROVED_FOR_PAYMENT / REVISION_REQUESTED; `InvoiceReviewRequest` rows; `last_review_note/at` | In-app `Notification` to worker (`invoice_approved_for_payment` / `invoice_revision_requested` / `invoice_paid`, `action_url='/dashboard/invoices'`) | Stale version refused; historical revisions read-only, cannot be approved/paid from the view |
| F11 | Payment recorded (worker invoice) | Worker (own invoice) or pharmacy (received invoice) | `POST /finance/invoices/<id>/payments/` or `/mark-paid/` → `services.record_payment`: idempotent by `request_key`, overpayment rejected, date must be invoice-date…today, GST/sales split by pro-rata `allocate_payment`; mark-paid settles remaining balance | FinanceWorkspace / PaymentEditor | Same | `Payment` rows (amount, date, reference, GST/sales allocation); `Invoice.status` draft→sent→paid; receipts survive later revisions | Status flips to `paid` when fully paid; super-request payments require `fund_payment_confirmed: true` | Prepayments rejected ("require review"); payment against void document rejected; no reversal endpoint |
| F12 | Super contribution | Worker | `POST /finance/invoices/<id>/super-document/` — separate-super mode, positive contribution, fund details required; own send/payment actions | FinanceWorkspace | Same | Child `Invoice` (`parent` FK, `kind='super_request'`) | Separate contribution request linked to saved service invoice | **Super requests are not tax invoices** (`docs/worker-finance.md`); eligibility/rate/basis/deadlines need external review; not SuperStream |
| F13 | Stripe refund happens (in Stripe dashboard / dispute / API — NOT in-app) | Anyone with Stripe access (outside the app) | `charge.refunded` webhook → `payment_events.handle_charge_refunded`: cumulative `amount_refunded` → `ShiftPayment.refunded_amount_aud`, status `partially_refunded`/`refunded`; full refund clears `reconciliation_required` | — no refund UI found in either client | — none | `ShiftPayment` only | No offer/assignment change, no notification, no credit issued | Refund arriving before checkout recorded → `ValueError` so Stripe retries; unrelated charges ignored |
| F14 | Paid checkout cannot be fulfilled | Webhook (automatic) | `paid_fulfillment.finalize_paid_selection`: unbookable / locked-payroll-period → `reconciliation_required=true`, reason `paid_work_unavailable` / `locked_payroll_period`; managers notified (`shift_payment_refund_required`) | — no reconciliation UI found | — none | `ShiftPayment.reconciliation_required` + `reconciliation_reason` (max 160 chars) | Notification only; **no money moves** — refund is a manual follow-up | Locked-period case: correct the period with audit reason, replay original paid event, "Do not pay again"; webhook returns 503 for retry |
| F15 | Paid checkout for deleted shift | Webhook | `handle_payment_checkout`: shift missing → `reconciliation_required`, reason `deleted_shift`, owner notified "needs a refund" | — | — | Same flag | Notification only | Manual refund follow-up (no in-app action) |
| F16 | AHPRA suspension/cancellation | System (`shifts/cancellation.py: cancel_upcoming_assignments`, gated by `AHPRA_ENFORCEMENT_ENABLED`) | Deletes future PLATFORM assignments (keeps ones with leave/attendance/invoice history — `_protect_assignment_history`), declines future offers; managers notified by email + in-app | — no fee/refund screen | — none | Assignment rows deleted; offers → DECLINED | `_announce_cancellation` per shift/date | **No fee or refund rule runs** (same as #184 ON-P02) |
| F17 | Timesheet approved → settlement routing | Manager approves; worker submits | `workforce/timesheet_transitions.py`: submit/approve/reopen with period locks (`select_for_update`), revision checks, blocker checks; on period lock, frozen `settlement_channel` splits: PAYROLL → `payroll_export`, INVOICE → invoice only, TIMESHEET_ONLY → audit snapshot only | Timesheet screens | `frontend_mobile/app/workforce-timesheets.tsx`, `roles/shared/timesheets/*` | `TimesheetPeriod` (LOCKED), `Timesheet` APPROVED, `TimesheetManifest` (hash covers payroll content only) | Payroll export contains PAYROLL assignments only | Locked periods cannot be submitted/approved/reopened in place; later adjustment workflow (not traced here) |
| F18 | GST / BAS worksheet | Worker (own workspace) | `GET /finance/bas-worksheet/?start&end&basis=cash|accrual` → `calculations.py` worksheet | FinanceWorkspace GST/BAS tab | Same | No new persisted state (computed) | G1 / 1A / 1B estimates, "Estimated net GST" | **Estimate only — not a BAS, not lodgement**; unmanaged (null `request_key`) invoices excluded and counted separately; imported Paid status alone gives no cash receipt |

### Roles / tenancy (applies to all rows)
- **Pay a shift charge:** pharmacy owner, ORG_ADMIN, CHIEF_ADMIN (org-wide), REGION_ADMIN with roster capability, or pharmacy admin with `CAPABILITY_MANAGE_ROSTER` — scoped to that pharmacy (`billing/utils.py: user_can_pay_shift_charge_for_pharmacy`). A payer never becomes the billing contact by paying.
- **Manage subscription/seats:** only pharmacy owner or ORG_ADMIN (`user_can_manage_billing_for_pharmacy`) — narrower than paying a shift charge.
- **Worker invoices:** issuer owns the record; pharmacy sees only the *published* revision of invoices for pharmacies it manages (`invoicing/models.py: manager_visible_state`); a worker's unsent revision stays hidden. Cross-pharmacy reads are refused by queryset scoping, not just UI hiding.
- **Denied role / wrong tenant:** 403 `Not authorized to manage/pay billing for this pharmacy` (billing views); finance querysets scope to owner/managed pharmacies; version mismatches → 400/409.
- **Web vs Expo parity on GM-17:** Finance workspace, invoice create/revise/send, received-invoice review, payments, GST worksheet exist on **both** Vite web and Expo via the same shared-core finance API (`shared-core/src/domains/finance/api.ts`, `shared-core/src/finance.ts`, `financePresentation.ts`) — near-parity. Differences: (a) legacy invoice screens still exist on web (`InvoiceManagePage.tsx` + `Invoices/LegacyInvoiceManagePage.tsx`, legacy `invoicing` API: list/generate/send/delete/PDF/report-issue) and on mobile (`roles/pharmacist/invoice.tsx`, `app/owner/invoice.tsx`, `app/admin/invoice.tsx`, legacy generator from shift history) — two invoice UIs per platform; (b) **Next web (`frontend_web/landing_next`) has no invoice, refund or billing surface at all** (0 search hits) — it is a landing site, so "Next" is not a parity surface for GM-17; (c) no refund, credit-note, void or reconciliation UI exists on *either* platform.

---

## 2. Traced flow, in plain English

### 2.1 Booking fee (the $30 / $80)
An owner accepts a locum offer → the app asks Stripe for a Checkout for **one fee per offer** (`quantity: len(offer_ids)` in `shift_payments.py`), $30 locum / $80 full/part-time, or $15 / $40 for active subscribers. The fee is per *offer*, not per day: a 10-day block booked as one offer costs one fee. Prices are hard-coded Stripe price IDs (`checkout_prices.py`: `FULFILLMENT_PRICES` — 3000/1500/8000/4000 cents). The checkout page is Stripe's, not ours, so the fee, and any GST, first appears there — nothing in the Post Shift wizard mentions the fee or GST (no "fulfillment fee"/"booking fee"/"GST" text found in `frontend_web/shared/postShift` by search; wizard files themselves were not line-read — see caveats). If the account is pre-live or in a free trial, confirmation is free and no Stripe call happens. Payment is confirmed only by the Stripe webhook; the webhook finalises the offers and notifies both sides. If the paid work can't be booked (e.g. locked payroll period), the money stays taken and a `reconciliation_required` flag is set — a human must sort it out.

### 2.2 Cancellation penalty (the 10% / 20%)
When an owner cancels a filled shift they can be sent to Stripe for a penalty: 20% of the shift's total expected wages if ≤24h away, 10% if ≤72h, nothing beyond 72h (`shift_payments.charge_penalty`). It uses **every assignment on the shift** (not the slots the owner selected), ambient timezone, and writes no obligation record before charging — so a double-click / retry can double-charge, and there is no idempotency key. The release-decision register (D8, `RELEASE_DECISIONS_20261102.md`) records exactly this as inherited behaviour that must be fixed before real cancellation payments. The old `shifts/cancellation_policy.py` P09 calculator from #184 **no longer exists** at this head; the percentage logic now lives only in `charge_penalty`. The `charge-penalty/` route is still live (SH-02 from #184 **not fixed**). Live penalty collection is off by default and needs a deployment flag.

### 2.3 Subscription ($30/month owner subscription, 50% off fees)
Card: Stripe Checkout subscription. Invoice: Stripe creates a `send_invoice` subscription, **7 days to pay**, local status stays `inactive` until the `invoice.paid` webhook arrives. Seats: base 5 included, extra seats are a second Stripe subscription (`stripe_extra_seat_subscription_id`). The subscriber discount on booking fees **now works** (see §4, PO-Q16). What happens if the invoice-method subscription is never paid — dunning, suspension, loss of the fee discount — was not found in the code inspected.

### 2.4 Worker invoices (wages) — the most-built part of GM-17
A worker with an accepted ABN assignment set to invoice can prefill an invoice from that work, or create an external invoice for any customer. The server calculates every line (Decimal, half-up rounding, per-line GST, inclusive/exclusive prices, tax codes GST / GST_FREE / INPUT_TAXED / OUT_OF_SCOPE; an unregistered issuer cannot charge GST). Saving creates an immutable revision; later saves create a new revision and return the current one to Draft, while the pharmacy keeps seeing the last *sent* revision. The worker sends it (confirmed, version-checked, email attempt persisted before SMTP so a lost response can't cause a silent double-send). The pharmacy can approve for payment, ask for a revision (note required), or mark paid — each writes a review record and notifies the worker. Payments can be full or partial, are idempotent by `request_key`, and split each receipt pro-rata between sales and GST. **There is no way to undo any of this**: no credit note, no payment reversal, no refund, no void button, no automated reminders — `docs/worker-finance.md` states this explicitly, and `Invoice.voided_at` exists as a field but **no API or service code sets it** (only checks it). Overdue is a client-side label (`shared-core/src/financePresentation.ts:30`: sent + due date past = "Overdue"); nothing chases it.

### 2.5 GST — two opposite answers
- **Worker invoices:** handled properly — registration flag, tax codes, 1/11 inclusive rule, BAS worksheet estimates (cash/accrual), expense GST credits with evidence rules (>$82.50 needs evidence). Still needs an accountant's review before anyone relies on the worksheet (`docs/worker-finance.md` staging gate).
- **Platform fees (booking fee, penalty, subscription):** no GST treatment anywhere in the inspected code — no tax field on the Stripe Checkout session, no GST line, no platform tax invoice. Stripe receipts are the only record. This is LA-R01 from #184, unchanged and launch-gating.

### 2.6 Refunds — the gap at the centre of GM-17
There is **no in-app refund flow at all**: no refund button, endpoint, approval queue or credit ledger in `billing/urls.py` (only subscription, seats, charge-fulfilment, expire/resume, charge-penalty, webhook). Refunds happen only if someone goes into Stripe and refunds there; the webhook then reconciles the local `ShiftPayment` (cumulative amount, partial vs full). The app never initiates, approves, or even notifies about a refund — except the `shift_payment_refund_required` notification that tells an owner/manager a paid checkout *needs* a refund or manual follow-up. Subscription refunds, penalty refunds and worker-invoice refunds/credits are all equally absent.

### 2.7 Reconciliation
`ShiftPayment.reconciliation_required` + `reconciliation_reason` (`paid_work_unavailable`, `locked_payroll_period`, `deleted_shift`, or a binding error) is the only reconciliation mechanism for platform payments. It is a flag plus a notification — there is no reconciliation screen, queue, owner, SLA or resolve action found on either client. The locked-payroll case has a defined recovery (correct the period with an audit reason, replay the original paid event, do not pay again; webhook returns 503 so Stripe retries).

### 2.8 Late / unpaid
- **Worker invoice unpaid:** shown as Overdue (display only). No reminders, no late fee, no escalation, no auto-anything. Customer records carry `payment_terms_days`, so terms exist per customer; nothing enforces them.
- **Subscription invoice unpaid:** Stripe's 7-day terms; local status stays `inactive`. No dunning found.
- **Booking fee unpaid:** the reservation expires (D02/D03 carried decisions) and the shift is released; no penalty, no debt.
- **Wages unpaid after timesheet approval:** the timesheet is approved and the invoice (or payroll export) exists; collection is the worker/pharmacy's problem off-platform. No platform chase.

### 2.9 Records and history
Worker invoices: full immutable revision history + PDFs per revision, delivery attempts, payment receipts with GST/sales split, review requests — the strongest audit trail in GM-17. Platform payments: `ShiftPayment` rows, `StripeWebhookEvent` delivery log (processing/processed/failed), `FulfillmentCheckout` attempts + reservations. Cancellation penalties: **no persisted obligation record at all** (D8). Cancellation pay (worker compensation for owner cancellation): no record, no payout path — it does not exist as a concept in code.

---

## 3. Old-question revalidation (#184 → PR #249 head)

14 #184 questions were relevant to GM-17. Each was re-checked against the #249 head. **None was carried forward unvalidated.**

| #184 Q | Verdict | Evidence at #249 head |
|---|---|---|
| ON-P02 AHPRA suspension → fee/refund? | **STILL VALID** (unchanged) | `shifts/cancellation.py: cancel_upcoming_assignments` deletes future PLATFORM assignments, keeps history-linked ones, notifies managers; no fee/refund rule runs. |
| ON-Q10 Super on ABN terms | **NO LONGER VALID as a question** (premise fixed) | ABN terms carry the super notice (per #184); finance super docs are now separate contribution requests, explicitly "not tax invoices" (`docs/worker-finance.md`). Closed — carry as settled, do not re-ask. |
| PO-Q03 Pay display to workers (rate/super/GST/total) | **STILL VALID, partially re-checked** | No GST/total text in Post Shift wizard search; super chip not re-opened line-by-line (see caveats). GST/total still absent. |
| PO-Q04 Full cost before posting | **STILL VALID** (unchanged) | Fee appears first at Stripe Checkout (`shift_payments.py` builds the session; no fee/GST text in wizard search). |
| PO-Q15 When should booking fees start? | **CHANGED** | The trial mechanism now exists: `billing/utils.py` PRE_LIVE / FREE_TRIAL / PAYMENT_REQUIRED, `is_in_free_trial` from `date_joined`. But `core/settings.py:681-682` still `BILLING_LIVE_DATE = 2025-06-01` (comment still says "June 1, 2026") and `FREE_TRIAL_DAYS = 0`, so the live date is past and the trial is zero days — effectively "charge from day one" still. **New overlay:** live collection is now separately gated off by `release_guards.py` flags (default False). The question is now about trial length + enabling live collection, not just the date. |
| PO-Q16 Fee per shift length? | **CHANGED in part** | Subscriber discount **fixed**: `is_subscriber` is now used (`shift_payments.py`: $15/$40 vs $30/$80; `checkout_prices.py` confirms all four price IDs). Flat per-offer pricing **unchanged** (`quantity: len(offer_ids)`); a multi-day block is still one fee. |
| CX-Q02 Who receives owner cancellation fee? | **STILL VALID** (not built) | No recipient, no distribution flow, no cancellation-pay record anywhere in the inspected code. |
| CX-Q19 Pharmacy cancels paid booking → booking fee? | **STILL VALID** (not built) | No refund/credit engine; `billing/urls.py` has no refund endpoint; refunds only via Stripe dashboard + webhook reconciliation. |
| CX-Q20 Worker cancels/no-shows → booking fee? | **STILL VALID** (not built) | Same as CX-Q19. |
| CX-Q21 Who approves refunds/credits? | **STILL VALID** (not built) | No approval workflow; `reconciliation_required` is a flag, not a payout engine. |
| CX-Q22 How is cancellation pay paid out? | **STILL VALID** (not built) | Timesheet routing to payroll/invoicing exists (`timesheet_transitions.py`), but no cancellation-pay line, record or payout path. |
| CX-Q32 What marks a shift complete? | **STILL VALID** (unchanged in substance) | No completed state on assignments found; history is still time-based; timesheet approval is separate with no auto-approval rule found in the inspected transitions (submit/approve/reopen only). Invoice prefill requires an *accepted* invoice-routed assignment, not a "completed" shift. |
| LA-P02 AHPRA cancellations bypass policy/notices | **STILL VALID, code gap** | Two cancellation paths persist: AHPRA path (`shifts/cancellation.py`, no fee/refund) vs owner penalty path (`charge_penalty`, no policy record). PR #183/#182 merge fix not evidenced at this head. |
| LA-R01 Booking fees lack GST/tax-invoice treatment | **STILL VALID, launch-gating, code gap** | No GST field/flow for platform fees; no platform tax invoice; Stripe receipts only. |
| Audit SH-02 legacy penalty route still live | **STILL VALID, code gap** | `billing/urls.py: charge-penalty/` still routed; shared-core still exports `chargeShiftPenalty`. |
| Audit SH-03 fulfilment fee bugs | **CHANGED — partially fixed** | Subscriber price now applied; price IDs still hard-coded (`checkout_prices.py`); fee still per-offer regardless of days. |
| Audit SH-04 billing live, no trial | **CHANGED** | See PO-Q15: trial machinery exists, configured to 0 days; live-collection flags now the real gate. |
| Release D8 cancellation charging | **STILL VALID** | `RELEASE_DECISIONS_20261102.md` #8: inherited behaviour, no persisted obligation/idempotency; "Before enabling: real cancellation payments". |
| Release D1 companion/super payment approval | Answered: the owner may record a payment made through other channels without prior approval, R1 and release register item 1 - see GM-17-W01 | Invoice review approval is a separate step. Payment recording still has no approval prerequisite (`pr257:backend/worker_finance/views.py:505`). |

---

## 4. Question queue (in #184 format)

Carried decisions that bound these questions: D02 payment windows (24h / 6h / 2h / 30 min by start); D03 unpaid reservation expires, released, no penalty; D08 cancellation charging is inherited/unpersisted (see §3); D1 companion/super invoices have no approval guard. "Keep current logic" is offered wherever something exists.

### GM17-Q01 — FIRST QUESTION (ask this first)
**When a pharmacy cancels a paid booking, does it get its booking fee back — cash refund, platform credit, or nothing?**
- **Actual today:** Nothing happens automatically. There is no refund or credit engine; the fee stays with the platform unless someone refunds it manually in Stripe, and the app has no button, approver or record for that (`billing/urls.py` has no refund route; `payment_events.handle_charge_refunded` only reconciles Stripe-initiated refunds). The cancellation penalty path (`charge_penalty`, 10%/20%) is a separate charge *to* the pharmacy, not a refund.
- **Recommended:** **C — Refund over 72h, credit inside 72h** (same as #184 CX-Q19 rec). It matches the existing 72h penalty boundary, keeps value with the pharmacy either way, and avoids cash leaving the platform for late cancellations. Severity: **launch-gating** — the live-collection guard doc makes "owner recovery/cancellation decisions" a precondition for enabling live fulfilment collection, so this answer unblocks real payments. Risk if undecided: support refunds money ad hoc in Stripe with no record, or pharmacies dispute charges.
- **Alternative A — Keep current logic:** No refund, no credit; fee kept always. Simple, but pharmacies pay for shifts they cancelled in good time; expect disputes and chargebacks. Edge: pharmacy cancels 3 weeks out, worker rebooks instantly — platform still keeps $30.
- **Alternative B — Credit always, never cash:** Money never leaves the platform; good for cash flow, but a pharmacy that never rebooks loses $30/$80 and has no remedy. Edge: pharmacy closes down — credit is worthless.
- **Alternative C — Refund over 72h, credit inside 72h (recommended above).**
- **Alternative D — Full cash refund whenever the pharmacy cancels before the worker is out of pocket:** Most generous; simplest to explain; platform eats the Stripe fee on every refund.
- **Other / defer:** Describe, or defer — but deferring blocks enabling live fulfilment collection.
- Normal case: pharmacy cancels 4 days out → refund. Edge: cancels 1h out after worker travelled → credit + penalty may both apply — owner must say whether both can apply. Retry/concurrency: refund requested twice → must be idempotent (no engine exists today). Denied role: only platform finance/support or the paying pharmacy can request; worker cannot trigger a fee refund. Payment side effect: Stripe refund → webhook sets `refunded`/`partially_refunded`. Web/Expo: no UI on either today; same backend either way.

### GM17-Q02 — Worker cancels or no-shows: what happens to the booking fee?

> **Also covers (22 Nov):** GM15-20 (GM-15). Asked once, here.
- **Actual today:** Not built. No rule, no remedy, no replacement flow tied to the fee (`CX-Q20`, still valid).
- **Recommended:** **C — Keep the fee only if a replacement actually fulfils the booking; otherwise the pharmacy chooses refund or credit.** Rationale: the pharmacy paid for a filled shift; if the platform refills it, the fee bought something.
- **A — Pharmacy picks remedy after each failure (refund or credit).** **B — Credit only.** **Other / defer.**
- Scenarios: locum no-shows at 7am for an 8am shift, replacement found by 9am (fee kept, worker sanctioned separately per P04); no replacement found (pharmacy chooses); worker cancels 5 days out and replacement fills it (fee kept).

### GM17-Q03 — Who approves refunds and credits, and how fast?

> **Also covers (22 Nov):** GM15-21 (GM-15), GM26-Q21 (GM-26). Asked once, here.
- **Actual today:** Nobody in-app. Refunds happen in Stripe by whoever has Stripe access; the app only reconciles afterwards. `reconciliation_required` flags need human follow-up with no owner, queue or SLA.
- **Recommended:** **A — Platform finance/support admin, every case, reason logged, 2-business-day SLA.** Start manual; automate by rule later.
- **A — Platform admin, every case (recommended).** **B — Automatic by rule, admin for exceptions.** **C — Pharmacy self-serves refund inside a window (e.g. >72h), admin beyond it.** **Other / defer.**
- Edge: refund requested twice; refund after partial refund; refund for a deleted shift (F15) — who is told, and does the pharmacy get the money or just a flag?

### GM17-Q04 — Who receives the owner cancellation fee (the 10%/20% penalty)?

> **Merged 22 Nov: asked once, as GM16-Q11 in GM-16.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** Not built as a distribution. The penalty, when charged, is a platform Stripe charge; no worker compensation is recorded or paid.
- **Recommended:** **A — The worker, as cancellation pay** (per #184 CX-Q02 rec; Locumate/Hireup compensate the worker for lost work). The platform keeps the booking fee separate.
- **A — Worker (recommended).** **B — Platform.** **C — Split worker/platform.** **Other / defer.**
- Scenarios: owner cancels 12h out, worker turned down other work → worker gets 20% of wages; owner cancels 4 days out → no penalty at all (0% band), worker gets nothing — is that acceptable?

### GM17-Q05 — How is the worker's cancellation pay paid out?

> **Also covers (22 Nov):** GM15-22 (GM-15). Asked once, here.
- **Actual today:** No record or payout path. Timesheets route ordinary pay to payroll or invoicing, but cancellation pay has no line.
- **Recommended:** **A — Same invoice or payroll channel as wages, labelled "cancellation pay"** (per #184 CX-Q22 rec). The worker invoices it, or it rides the payroll export — never a platform wage wallet.
- **A — Same channel, labelled (recommended).** **B — Platform pays the worker directly.** **C — Pharmacy pays off-platform, worker records it as an external invoice.** **Other / defer.**
- Edge: worker is TFN payroll vs ABN invoice — channel follows the frozen `settlement_channel`; a cancelled shift has no approved timesheet, so what evidence supports the invoice?

### GM17-Q06 — Booking fee GST and platform tax invoice (launch-gating)

> **Merged 22 Nov: asked once, as GM16-Q15 in GM-16.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** No GST treatment, no platform tax invoice; Stripe receipts only (LA-R01, unchanged).
- **Recommended:** **A — Before launch: confirm tax treatment with Australian tax advice, show GST on the total before payment, and issue a compliant tax invoice/receipt from the correct supplier.** Do not take live payments while this is unclear.
- **A — Before launch (recommended).** **B — Soon after launch.** **C — Not needed (Stripe receipts suffice).** **Other / defer.**
- Legal/financial impact: GST on a $30/$80 fee is $2.73/$7.27 per booking; wrong treatment means wrong BAS and potentially issuing invalid tax invoices. Also decides whether the $30/$80 is GST-inclusive or exclusive — which changes the real price.

### GM17-Q07 — Booking-fee trial and going live (PO-Q15, changed)

> **Merged 22 Nov: asked once, as GM16-Q04 in GM-16.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** Trial machinery exists but is set to zero: live date 2025-06-01 (past), `FREE_TRIAL_DAYS = 0`. Separately, live collection is gated off by deployment flags (default False) — the flags, not the date, are the real switch now.
- **Recommended:** **C — N-day trial per new pharmacy (e.g. 30 days), then charge; enable live collection only after Q01–Q03 and Q06 are decided and test-mode acceptance passes.**
- **A — Keep current logic (charge from day one, no trial).** **B — Free until a set date.** **C — N-day trial per new pharmacy (recommended).** **Other / defer.**
- Note: a saved card is not stored today (every booking opens a new Stripe Checkout), so a trial cannot auto-convert without a saved payment method — see GM-16 subscription/Pills scope.

### GM17-Q08 — Should the booking fee depend on shift length? (PO-Q16, changed in part)

> **Merged 22 Nov: asked once, as GM16-Q01 in GM-16.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** Flat per offer — $30/$80 (or $15/$40 subscriber). A one-offer 10-day block costs one fee; each slot in a multi-slot shift costs per offer.
- **Recommended:** **B — Per shift day.** Simple, fair for blocks, matches the per-day shape of the work.
- **A — Keep current logic (flat per offer).** **B — Per shift day (recommended).** **C — Percentage of wages, with min/max.** **Other / defer.**
- Edge: recurring block where only some dates get filled — fee per *filled* date, not per posted date.

### GM17-Q09 — What should workers see: rate, super, GST, shift total? (PO-Q03)
- **Actual today:** Workers see the hourly rate; super shows as a chip when selected; no GST line and no whole-shift total (re-checked: no GST/total text in the Post Shift wizard search).
- **Recommended:** **A — Hourly rate, super and GST shown separately, plus a total for the shift.** Confirm tax treatment before launch (links to Q06).
- **A — Rate + super + GST + total (recommended).** **B — Keep current logic.** **C — One all-in rate.** **Other / defer.**

### GM17-Q10 — Should the pharmacy see the full cost before posting? (PO-Q04)

> **Merged 22 Nov: asked once, as GM16-Q06 in GM-16.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** The wizard shows rate and wages per date; super, GST and the booking fee are not shown — the fee first appears at Stripe checkout.
- **Recommended:** **A — Yes: wages, super, platform fee and GST treatment, one payable total, before posting and again before payment.**
- **A — Yes, full breakdown (recommended).** **B — Keep current logic (wages only; fee at checkout).** **Other / defer.**
- Risk of B: pharmacies feel ambushed by a fee at checkout; disputes and abandoned bookings.

### GM17-Q11 — AHPRA auto-cancellation: fee, refund, notices (ON-P02 + LA-P02)

> **Also covers (22 Nov):** GM15-45 (GM-15), GM22-16 (GM-22). Asked once, here.
- **Actual today:** Future public bookings are auto-cancelled, pharmacies told, no fee or refund rule runs; the AHPRA path bypasses the cancellation policy entirely (two paths, different outcomes for the same booking).
- **Recommended:** **Keep auto-cancel, and settle any paid booking fee under Q01/Q02** (refund/credit as if the pharmacy had cancelled in good time — the worker did nothing wrong, the pharmacy did nothing wrong).
- **A — Keep auto-cancel + settle fee under Q01/Q02 (recommended).** **B — Admin confirms, then cancel (slower; unlawful work risk).** **Other / defer.**
- Edge: booking already paid and partially worked — worked dates stay, future dates cancel; fee treatment splits by date.

### GM17-Q12 — Worker invoice corrections: credit notes, void, reversals (NEW)
- **Actual today:** Corrections use new immutable revisions (a sent invoice can be corrected by a new revision; the pharmacy keeps the old published version until the new one is sent). But there is **no credit note, no payment reversal/refund, no void action** (`docs/worker-finance.md`); `voided_at` exists but nothing in the app can set it. A wrongly *paid* invoice cannot be un-paid or credited — only re-issued as a new draft.
- **Recommended:** **A — Build credit notes first (negative invoice linked to the original, same GST treatment), then a void action for unpaid invoices; payment reversals stay manual with a reason and audit record.**
- **A — Credit notes + void (recommended).** **B — Revisions only (keep current logic) — overpaid invoices are settled off-platform.** **C — Full refund/reversal workflow in-app.** **Other / defer.**
- Scenarios: worker overstates hours by 2h, pharmacy already paid; pharmacy pays the wrong invoice; invoice sent to the wrong pharmacy. Each needs a different remedy — a revision cannot fix money already moved.

### GM17-Q13 — Overdue worker invoices: reminders, escalation, late fees? (NEW)
- **Actual today:** "Overdue" is only a red label (sent + past due date, computed in shared-core). No reminders, no escalation, no late fee, no follow-up task. Customers have `payment_terms_days`; nothing enforces them.
- **Recommended:** **A — Email + in-app reminders at due date +7/+14 days, then a manual follow-up task for the worker; no late fee at launch.**
- **A — Reminders + manual follow-up (recommended).** **B — Reminders + automatic late fee (needs a rate and disclosure).** **C — Nothing (keep current logic).** **Other / defer.**
- Edge: pharmacy approved for payment but never pays — is "approved" a promise the platform stands behind? (No — the platform does not pay wages; the owner must decide the wording so approval is not read as a guarantee.)

### GM17-Q14 — Subscription paid by invoice: what if it is never paid? (NEW)
- **Actual today:** Stripe `send_invoice`, 7 days to pay; local status stays `inactive` until paid. No dunning, suspension or discount-loss rule was found.
- **Recommended:** **A — Reminder at day 5, subscription stays inactive, booking fees stay at full price; after 30 days the invoice-method request lapses and the owner must start again.**
- **A — Remind, stay inactive, lapse at 30 days (recommended).** **B — Grace period with subscriber pricing anyway.** **C — Suspend the pharmacy's posting until paid.** **Other / defer.**

### GM17-Q15 — Reconciliation queue: who works flagged payments? (NEW)
- **Actual today:** A flag + a notification. No queue, screen, owner or SLA. Reasons: `paid_work_unavailable`, `locked_payroll_period`, `deleted_shift`, binding errors.
- **Recommended:** **A — Platform support owns the queue; every flagged payment gets a decision (refund / replay / manual fix) within 2 business days, recorded against the payment.**
- **A — Support-owned queue + SLA (recommended).** **B — Auto-refund everything flagged (fast, but wrong for locked-payroll cases that should be replayed).** **C — Leave to the pharmacy (keep current logic).** **Other / defer.**

### GM17-Q16 — What marks a shift complete, so wages become payable? (CX-Q32)

> **Merged 22 Nov: asked once, as GM-08-Q11 in GM-08.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** Assigned shifts enter history after their scheduled end, regardless of approved timesheets or clock-out. No completed state; timesheet approval is separate; no auto-approval rule found.
- **Recommended:** **A — Timesheet approved, or auto-approved 48h after submission if the pharmacy has not acted.** (Locumate documents 48h auto-approval.)
- **A — Approved, or auto after 48h (recommended).** **B — Keep current logic (time-based history).** **C — Clock-out alone.** **D — Manager approval only.** **Other / defer.**
- This decides when a worker may invoice: today invoice prefill needs an *accepted* invoice-routed assignment, not a completed shift — so in theory a worker could invoice before the shift is worked. Owner must close that.

### GM17-Q17 — Cancellation penalty: fix the charge before it can ever be used? (NEW, code gap with decision attached)

> **Merged 22 Nov: asked once, as GM13-Q12 in GM-13.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Actual today:** 10%/20% of *all* assignments' wages, ambient timezone, submitted slot selection ignored, no persisted obligation, no idempotency key, route still live, live collection gated off (D8).
- **Recommended:** **A — Before any live penalty: persist the obligation (amount, basis, dates, timezone) with an idempotency key, charge only the cancelled slots, use the shift's timezone, and disclose the bands in the accepted terms (SH-09 gap: terms snapshot has no cancellation band table).**
- **A — Fix before live use (recommended).** **B — Use as-is in test mode only.** **C — Drop the penalty entirely; cancellations are free.** **Other / defer.**

### GM17-Q18 — Invoice numbering, tax-invoice wording and duplicate protection (NEW)
- **Actual today:** Worker invoices are numbered `INV-000123` (sequential by PK); PDFs render from the stored payload; payments are idempotent by `request_key`; duplicates create a fresh draft with no links. Super contribution requests are explicitly not tax invoices. Whether a worker service invoice counts as a compliant *tax invoice* (ABN, GST, "tax invoice" wording) was not verified against the PDF template (`backend/templates/invoices/invoice_pdf.html`, `worker_finance/templates/.../invoice.html`) in this trace.
- **Recommended:** **A — Owner + accountant confirm the worker invoice PDF is a compliant tax invoice when the issuer is GST-registered (and states clearly when it is not); keep `INV-` numbering; keep `request_key` idempotency.**
- **A — Confirm compliance, keep numbering (recommended).** **B — Add "tax invoice" wording + ABN/GST checks before send.** **C — Leave as-is.** **Other / defer.**

---

## 5. Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; do not present as decided)
1. **CG-01** Subscriber discount fixed, but price IDs still hard-coded (`billing/checkout_prices.py`, `shift_payments.py`) — test/live prices cannot differ. (SH-03 remainder.)
2. **CG-02** `charge-penalty/` route still live though the register says suspend it (SH-02); shared-core still exports it.
3. **CG-03** `charge_penalty` has no persisted obligation, no idempotency key, ignores slot selection, uses ambient timezone (D8). Fix before live use (see Q17).
4. **CG-04** `voided_at` has no writer — no void endpoint/action anywhere (worker-finance.md confirms void not implemented).
5. **CG-05** No refund/credit-note/reversal endpoints or UI on either client (billing + worker_finance).
6. **CG-06** No reconciliation queue/screen/owner — flag + notification only.
7. **CG-07** No overdue reminders/escalation for worker invoices; no dunning for invoice-method subscriptions.
8. **CG-08** Accepted terms snapshot has no cancellation band table / platform terms version / pharmacy-side acceptance (SH-09) — fees cannot be fairly charged until disclosed.
9. **CG-09** `BILLING_LIVE_DATE` comment says "June 1, 2026" but the value is 2025-06-01 (`core/settings.py:681`) — misleading comment; value already past.
10. **CG-10** Legacy invoice UIs still live alongside the finance workspace on both platforms (web `InvoiceManagePage`/`LegacyInvoiceManagePage`, mobile legacy invoice routes + generator from shift history) — two ledgers' worth of UI, one canonical record. Consolidation is a build decision, not an owner policy question.
11. **CG-11** Client `chargeShiftPenalty` sends `{hours}` which the server ignores — dead parameter; remove or honour it.
12. **CG-12** Stale-version refusal returns HTTP 400, not 409 (preserved contract per invoice acceptance doc) — keep the contract, document it; do not "fix" silently.

### Decision gaps (owner must choose first — the queue in §4)
Q01 refund/credit matrix · Q02 worker-cancel remedy · Q03 refund approver/SLA · Q04 penalty recipient · Q05 cancellation-pay channel · Q06 platform-fee GST/tax invoice · Q07 trial + live enablement · Q08 per-day fee · Q09/Q10 price display · Q11 AHPRA fee settlement · Q12 credit notes/void · Q13 overdue handling · Q14 unpaid subscription · Q15 reconciliation ownership · Q16 completion rule · Q17 penalty fix-or-drop · Q18 tax-invoice wording.

---

## 6. Implementation backlog (ONLY after owner answers — nothing here is decided)

| # | Depends on | Work | Acceptance (positive / negative) |
|---|---|---|---|
| B-01 | Q06 | GST treatment on Stripe Checkout (inclusive vs exclusive), GST line pre-payment, platform tax invoice/receipt | Live-mode test checkout shows correct GST; tax invoice issued; accountant sign-off |
| B-02 | Q01–Q03 | Refund/credit engine: in-app request, approval with reason, idempotent Stripe refund or credit ledger, status transitions | Double refund refused; partial refund reconciles; audit record per decision |
| B-03 | Q04–Q05 | Cancellation-pay record + payout via invoice/payroll channel, labelled | Cancelled shift creates a payable line; TFN vs ABN channel follows frozen settlement |
| B-04 | Q17 + CG-03 | Persisted cancellation obligation + idempotency key; slot-scoped, shift-timezone penalty; terms band disclosure (CG-08) | Retry charges once; penalty matches selected slots only |
| B-05 | Q12 + CG-04 | Credit notes (linked, GST-aware) + void action for unpaid invoices | Overpaid invoice credited; voided invoice cannot be paid/sent; history preserved |
| B-06 | Q13 | Overdue reminders (+7/+14d) + follow-up task; wording that approval ≠ payment guarantee | Reminder sent once per stage; no duplicate reminders |
| B-07 | Q15 + CG-06 | Reconciliation queue (list, owner, SLA, resolve: refund/replay/manual) | Every flagged payment reaches a recorded decision |
| B-08 | Q07 | Trial length config + live-collection enablement runbook (test-mode acceptance, price verification, drain pre-rollout sessions) | Per `RELEASE_DECISIONS_20261102.md` operational steps |
| B-09 | Q08 | Per-day fee pricing (if chosen) — price by filled date, not offer | 10-day block = 10 fees; partial fill = filled dates only |
| B-10 | Q09–Q10 | Pre-posting full-cost breakdown + worker rate/super/GST/total display | Fee visible before checkout on web + Expo |
| B-11 | Q16 | Completed state + 48h auto-approval (if chosen); invoice prefill gated on completion | Cannot invoice unworked shift; auto-approval fires once |
| B-12 | CG-01/02/09/11 | Move hard-coded price IDs to config and fix the live-date comment and unused hours parameter. Engineering: see BL-04 for cancellation charging. | Preserve the charge route and export behind the existing flag. |
| B-13 | CG-10 | Retire legacy invoice screens after parity check (web + mobile) | One invoice UI per platform; no orphaned routes |
| B-14 | Q14 | Subscription dunning/lapse (reminders, 30-day lapse) | Unpaid invoice-method sub lapses; no silent subscriber pricing |

**Launch-gating (must be decided, and B-01/B-02/B-04 built, before live platform payments):** Q01, Q03, Q06, Q17. Live fulfilment/penalty collection is already off by default — keep it off until these land.

---

## 7. Per-question source links (PR #249 head `97c4543…`, unless noted)

- Fee checkout/prices: `backend/billing/shift_payments.py` (charge_shift_fulfillment, charge_penalty), `backend/billing/checkout_prices.py`, `backend/billing/checkout_reservations.py`, `backend/billing/fulfillment.py`
- Webhook/refunds/reconciliation: `backend/billing/webhooks.py`, `backend/billing/payment_events.py` (`handle_payment_checkout`, `handle_charge_refunded`), `backend/billing/paid_fulfillment.py`, `backend/billing/models.py` (`ShiftPayment`, `FulfillmentCheckout`, `OwnerSubscription`, `StripeWebhookEvent`)
- Guards/settings: `backend/billing/release_guards.py`, `backend/billing/utils.py`, `backend/core/settings.py:672-682`
- Subscriptions: `backend/billing/views.py`, `backend/billing/subscription_operations.py`, `backend/billing/subscription_events.py` (`handle_invoice_paid`), `backend/billing/subscriptions.py`
- Worker invoices: `backend/invoicing/models.py`, `backend/invoicing/views.py`, `backend/invoicing/urls.py`, `backend/worker_finance/views.py` (`InvoiceViewSet`, `ReceivedInvoiceViewSet`), `backend/worker_finance/services.py` (`save_draft`, `record_payment`, `serialize_record`), `backend/worker_finance/calculations.py`, `backend/worker_finance/urls.py`, `docs/worker-finance.md`
- Timesheets/routing: `backend/workforce/timesheet_transitions.py`, `backend/shifts/pricing.py`, `backend/shifts/cancellation.py`
- Clients: `shared-core/src/domains/billing/api.ts`, `shared-core/src/domains/finance/api.ts`, `shared-core/src/domains/invoicing/api.ts`, `shared-core/src/finance.ts`, `shared-core/src/financePresentation.ts:30` (Overdue), `frontend_web/src/pages/finance/FinanceWorkspace.tsx`, `frontend_web/src/pages/dashboard/sidebar/InvoiceManagePage.tsx`, `frontend_mobile/roles/shared/invoices/FinanceWorkspace.tsx`, `InvoiceList.tsx`, `InvoiceDetail.tsx`, `FinanceInvoiceEditor.tsx`, `receivedInvoicePolicy.ts`, `frontend_web/landing_next` (no finance surface)
- Decisions/docs: `docs/qa/RELEASE_DECISIONS_20261102.md` (D1, D4, D5, D8), `docs/qa/LIVE_SHIFT_COLLECTION_GUARDS.md`, `docs/qa/PR201_PHASE6_B57_REFUNDS_20261025.md`, `docs/qa/INVOICE_OPERATIONAL_ACCEPTANCE_20261030.md`, PR #184 `docs/qa/launch-grill/questions.json` + `AUDIT.md` (refs/pull/184/head), Issue #250, PR #249 (head verified), PR #248
- PR #249 file check: 314 changed files reviewed by name — **no `backend/billing/*` files**; finance/invoice changes are mobile workspace + `shared-core/src/domains/invoicing/api.ts` + workforce timesheet files only.

## 8. Caveats / unknowns (mark, don't guess)
- **Next web:** `frontend_web/landing_next` is a landing site; no invoice/refund/billing code found there. "Next" is therefore not a GM-17 parity surface. `presentation_web/` is a single static page.
- **Post Shift wizard fee/GST display (Q09/Q10):** established by search (no fee/GST text in `frontend_web/shared/postShift`; Stripe session carries no tax fields) plus checkout-kwargs evidence — the wizard `.tsx` files were **not** line-read in this trace. One direct read should confirm before building B-10.
- **Subscription `customer.subscription.deleted` handling** and any dunning: handler exists, policy not inspected — unknown.
- **`search_code` indexes main**, not the PR head; all behaviour claims rest on files fetched at `refs/pull/249/head`.
- **No live run:** no staging, Stripe test-mode, email or device check was performed; webhook/replay/refund behaviour is from code + the cited QA docs, not a live exercise.
- **Pills (GM-16):** no invoice interaction with Pills was found in the inspected billing/finance code; Pills stay in GM-16's scope.
- **Decision status:** all 18 questions are **NOT VERIFIED → CURRENT FLOW TRACED** (per Issue #250 labels). None is OWNER DECIDED. No owner answers were found in the repo for these questions in this trace.


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-17-W01: Must companion or super invoices be approved before payment? (W-14, register item 1): answered
**Answered:** R1 (carried owner decision): an owner may record an invoice payment without approval, because pharmacies often pay through other channels. Register item 1 is closed by R1; not re-asked. If the platform ever takes invoice payments itself (not today), ask again then.

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-17-OD-12: Organisation Invoices are on Expo but not in web's organisation menu (OD-12, decisions-for-owner 5)
**Platforms:** Web + Expo
**What happens today:** Expo keeps an Invoices entry for organisations. Web's organisation menu has none. We never drop features, so I kept it on Expo.
**Already implemented:** pr257
**Recommendation:** Keep it on Expo and add the same link to web's organisation menu later.
**Other option:** Remove it from Expo to match web.
**Status:** OPEN, confirm or change.
