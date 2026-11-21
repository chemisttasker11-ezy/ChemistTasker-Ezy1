# GM-15 — Cancellation / disputes / ratings — traced flow + validated question queue

- **Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
- **Traced against:** active PR #249 (`fix/pr248-expo-production-waves-20261104`), **head verified 97c4543e051b43fe30ec7e2e61ad3d69957a918e** — identical to the SHA in Issue #250, so no refresh drift. PR #249 is still DRAFT, stacked on #248, not merged, not deployed.
- **Method:** Issue #250 + PR #184 (`docs/qa/launch-grill/AUDIT.md`, `questions.json` on `refs/pull/184/head`) as the example format. Every old GM-15-relevant question was re-validated against files read at the PR #249 head via the GitHub connector (read-only; no code, PRs, issues or comments created).
- **Rate limits:** none encountered. All GitHub calls succeeded; no question is marked NOT RE-VALIDATED for rate-limit reasons. Two items are marked PARTIAL where a sub-claim was not re-opened line-by-line at this head (see §8).
- **Date traced:** 2026-11-21 (AEST). Code citations are file/function at SHA `97c4543e`.

## 0. Headline finding (plain English)

**A confirmed outside booking still cannot be cancelled by anyone — owner, worker or admin — through any screen or API.** There is no cancelled state, no cancel button, no cancel endpoint. The only way a confirmed booking ends early today is:

1. the **system** deletes it because the worker's AHPRA registration was restricted (`backend/shifts/cancellation.py: cancel_upcoming_assignments` — PR #183 code, system-triggered, not user-initiated); or
2. a **roster** manager releases a worker through a cover request — but that path explicitly *refuses* offer-booked or payment-pending work and tells the manager to "cancel the booking instead" (`backend/workforce/roster/worker_actions.py: _guard_booked`), and there is no such cancellation to use. It is a dead end, in writing, in the code.

Everything else in this area is either a decision the owner already made but the code never built (the P09 fee table, the P10 incident ladder, platform sanctions), a legacy money route that is still live and now *proven* buggy by the repo's own characterisation tests, or — the one real improvement since October — ratings, which are now gated on a past assignment and have a report-a-rating flow, but still do not prove the work happened and still mix internal-roster feedback into the public talent-board average.

**No dispute, appeal, no-show, incident, reliability-badge or suspension workflow exists anywhere in the code.** Search at the PR head: `no_show` = 0 hits, `no-show` = 1 hit (an old handover doc only), `appeal` = 0 product hits, `incident` = 0 product hits, no reliability badge, no block list.

---

## 1. Traced flow — ACTUAL TODAY, actor by actor

### 1.1 The booking states that exist (and the ones that don't)

| Object | States that exist at `97c4543e` | Missing |
|---|---|---|
| `ShiftOffer` (`backend/shifts/models.py:668-673`) | PENDING, ACCEPTED_AWAITING_PAYMENT, ACCEPTED, DECLINED, EXPIRED | No CANCELLED, no WITHDRAWN |
| `ShiftSlotAssignment` (`backend/shifts/models.py:465-530`) | **No status field at all.** Existence = assigned. | No cancelled / no-show / completed / late state |
| `Shift` (`backend/shifts/models.py:10-36`) | `payment_status` NOT_REQUIRED / PENDING / PAID (via `deletion.py` + billing) | No cancelled state |
| `WorkerShiftRequest` (`backend/shifts/models.py:827-833`) | PENDING, APPROVED, REJECTED, AUTO_PUBLISHED | No CANCEL type — it is a cover request only (no `request_type` field) |
| `Rating` / `RatingReport` (`backend/ratings/models.py`) | Rating: 1–5 stars, one per relationship, editable. RatingReport: OPEN / REVIEWED / CLOSED | No admin queue reads RatingReport (see §1.7) |

### 1.2 Owner cancels a confirmed booking — NOT POSSIBLE

- **Backend:** no cancel endpoint in `backend/shifts/urls.py` (routers: discovery, lifecycle `shifts/active|confirmed|history`, engagement `shift-interests|shift-offers|my-confirmed-shifts|my-history-shifts|worker-shift-requests`). `ShiftDetailViewSet` / `ActiveShiftViewSet` / `ConfirmedShiftViewSet` (`backend/shifts/lifecycle.py`) expose only `member_status`, `view_assigned_profile`, `calculate-rates`. No `cancel` action.
- **Delete is blocked, not a cancel:** `backend/shifts/deletion.py: protect_shift_deletion` — 409 if any `slot_assignments` exist, 409 if payment PENDING / non-expired checkout / ACCEPTED_AWAITING_PAYMENT offer / pending payment. Deleting a shift with a confirmed worker is refused by design.
- **Vite web / Expo:** no cancel-booking screen or button exists. `shared-core` exports no `cancelShift`/`cancelBooking` (search: 0 hits). The only cancel-adjacent UI is the roster cover-request flow (§1.4) and generic dialog "Cancel" buttons.
- **Next web:** public landing only (`frontend_web/landing_next/` — landing pages, public-route contract). No authenticated shift actions, no GM-15 surface. Parity gap: n/a — nothing to compare; the absence is identical on all three clients.
- **What the owner must do today:** contact platform support, who have no admin cancel tool either (no cancel path in admin or API) — the only practical route is direct database action. This is SH-01, unchanged since Oct 2026.

### 1.3 Worker cancels / "can't make it" — NOT POSSIBLE for marketplace bookings

- **Before acceptance:** worker can **decline** a PENDING offer (`ShiftOfferViewSet.decline`, `backend/shifts/offers.py:677`) — owner is notified in-app + email (`shift_worker_rejected`). Worker can delete a saved shift / withdraw interest (`ShiftSavedViewSet.destroy`, `offers.py:157`). A PENDING offer also expires lazily: `ShiftOfferViewSet.list` (`offers.py:182-190`) flips PENDING → EXPIRED when `expires_at` passes — only when someone lists offers; no background job was found.
- **After acceptance, before payment (ACCEPTED_AWAITING_PAYMENT):** no worker withdraw action exists (BK-Q14, still valid). The reservation ends only when the pharmacy pays or the reservation expires (D03). Expiry machinery for this state was **not re-traced line-by-line at this head** (see §8) — the old `shifts/reservations.py` no longer exists in the `backend/shifts/` listing; reservation handling now lives in `backend/billing/checkout_reservations.py` (`prepare_checkout`, `expire_checkout`, `release_cancelled_paid_work`).
- **After payment (ACCEPTED / confirmed assignment):** no worker cancel, no cancel-request. The roster path (§1.4) is the only request mechanism and it refuses booked work.
- **Concurrency / retry:** n/a — no endpoint, so no duplicate-cancel or stale-state behaviour exists. The one related guard is `_guard_booked` (below).

### 1.4 The roster cover/swap path — the only "I can't make it" flow, and it stops at booked work

`WorkerShiftRequestViewSet` (`backend/shifts/worker_requests.py:21`) + `backend/workforce/roster/worker_actions.py`:

- Worker submits a cover request (own requests only; owners/org-admins/pharmacy-admins see their pharmacies'). No request-type field: every request is a cover request for a date/time/role/note, optionally linked to an existing `ShiftSlotAssignment`.
- **Approve, linked assignment:** `release_worker_from_assignment(req, manager, escalate_to_visibility="LOCUM_CASUAL")` (`worker_actions.py:353`) — deletes the assignment row, reuses the same Shift/Slot, escalates visibility to LOCUM_CASUAL (R06: same shift, shown as needs cover, no duplicate), sets request APPROVED. Stale-request protection: requester must still be the assignee; pharmacy must own the assignment. Row locked with `select_for_update`.
- **Approve, unassigned:** creates a new community LOCUM shift + slot, request → AUTO_PUBLISHED. Concurrent approvals cannot publish twice (re-check under lock).
- **The dead end:** `_guard_booked` (`worker_actions.py:55-63`) — "Offer-booked or payment-pending work changes hands only through cancellation; plain rostered staff may swap." It raises: *"This shift is booked or awaiting payment: cancel the booking instead of swapping, replacing or releasing the worker."* There is no cancellation to use. So a marketplace locum who cannot attend, and their manager, are both stuck: the request path refuses, and no cancel path exists.
- **History protection:** `_protect_assignment_history` (`backend/shifts/history.py`) blocks removing an assignment linked to an invoice line, workforce leave, `LeaveRequest`, `AttendanceSession` or `ProvisionalAttendance` — worked history is preserved, not deleted.
- **Notifications:** approve/reject emails the worker (role-aware dashboard link, `swap_approved.html` template + in-app notice). No emergency escalation timer exists.
- **Web vs Expo:** the API is shared; web `RosterWorkerPage` / mobile `app/my-roster.tsx` both surface worker requests (verified at API level; screens not opened line-by-line in this pass). No web/Expo difference in the rule itself — the refusal is backend-enforced.

### 1.5 The one cancellation that DOES happen: AHPRA restriction (system-triggered)

`cancel_upcoming_assignments(user, reason, cancel=True)` (`backend/shifts/cancellation.py`, PR #183 lineage; callers in `backend/onboarding/verification/state.py`, `backend/onboarding/feature_port.py`):

- Only when `AHPRA_ENFORCEMENT_ENABLED`; only `visibility='PLATFORM'` (public) bookings; only future occurrences (today's start time from the negotiated offer, not the slot template); skips workers who are also a member of the pharmacy (`is_public_shift_member_access`).
- **Effect:** deletes future `ShiftSlotAssignment` rows (unless `_protect_assignment_history` blocks — worked/invoiced history is *retained*, not cancelled); sets future ACCEPTED / ACCEPTED_AWAITING_PAYMENT offers to DECLINED (but only if the offer has no slot assignments and no retained date). `cancel=False` is a dry-run listing.
- **Notice:** managers only — `notify_shift_managers` + email (`emails/ahpra_status.html`, kind `shift_cancelled`). The worker is not notified by this function. The `shift_cancelled` kind exists **only** here (repo-wide search: 1 hit).
- **Money:** no fee, no refund, no credit, no worker cancellation pay. Payment state (`payment_status`, fulfillment checkouts) is **not** touched in this function — LA-P01 is only partially addressed (offer status is fixed; payment reset not verified here; see Q-status LA-P01).
- **Parity:** backend-driven; identical on web and Expo (no client action). This is also the LA-P02 finding: this path bypasses the P09 fee/refund/notice rules entirely — two cancellation paths, different outcomes for the same booking.

### 1.6 Money on cancellation — a live legacy charge that does NOT cancel anything

`POST /billing/charge-penalty/<shift_id>/` (`backend/billing/urls.py`, `views.py: charge_penalty` → `backend/billing/shift_payments.py: charge_penalty`):

- **What it does:** opens a Stripe Checkout for a "Cancellation Penalty". It does **not** cancel, release, decline or delete anything. Calling it and paying it leaves the booking in place.
- **Amount:** legacy 10%/20% only — ≤24h before earliest start: 20% of total expected wages; 24–72h: 10%; >72h: "No penalty required". This is **not** the owner-decided P09 7-band table (0/0/10/15/20/25/30% at >7d / 72h–7d / 24–72h / 12–24h / 2–12h / <2h / at-or-after-start). The P09 table exists only in decisions, not in code.
- **Bugs now proven by the repo's own tests** (`backend/billing/test_cancellation_policy_evidence.py`, `docs/qa/BOUNDED_CANCELLATION_NOTIFICATION_20261030.md`, `docs/qa/RELEASE_DECISIONS_20261102.md` #8):
  - the amount changes with the *request* timezone (same instant, same shift: 500c under UTC vs 1000c under Australia/Brisbane);
  - it charges **all** assignments on the shift even when a single slot was selected (past first occurrence + later 8h assignment → 17000c despite a first-slot selector);
  - two identical requests open two Stripe sessions — no persisted obligation, no idempotency key.
- **Gating (new since Oct):** `assert_can_create_shift_charge("cancellation")` (`backend/billing/release_guards.py`) — live mode requires `BILLING_LIVE_SHIFT_PENALTY_ENABLED=True` and a valid live Stripe key; test mode runs in local/dev/staging. So the route is *closed by default in live* but fully callable in test/staging, and the register says "Before enabling: real cancellation payments" — it must not be enabled without the policy decisions.
- **Recipient:** the money goes to the platform via Stripe Checkout (`type: 'cancellation'` metadata). There is no worker payout, no split, no refund/credit engine. CX-Q02/Q19–Q22 all still open.
- **Fulfillment fee (context, SH-03 fixed):** `charge_shift_fulfillment` now *does* apply the subscriber price (locum $15 vs $30; PT/FT $40 vs $80, hard-coded Stripe price IDs in `shift_payments.py`) — the Oct subscriber-overcharge bug is fixed. Price IDs remain hard-coded.
- **Client:** `shared-core/src/domains/billing/api.ts: chargeShiftPenalty(shiftId, {hours})` is still exported and re-exported (`shared-core/src/api.ts`, `applicationExports.json`) — but **no screen in Vite web, Next or Expo calls it** (repo-wide search: only the export sites). Note the payload mismatch: the client sends `{hours}`, the backend ignores `hours` and computes from the earliest assignment. No UI calls it, so no user can trigger it by accident today.
- **Booking-fee refunds/credits:** no engine exists. `expire_checkout` / `resume_fulfillment_checkout` handle *fulfillment* checkouts only. CX-Q19–Q21 still open.

### 1.7 Ratings and reviews — the one area that materially changed

`RatingViewSet` (`backend/ratings/views.py`), `Rating` / `RatingReport` (`backend/ratings/models.py`):

- **Directions:** OWNER_TO_WORKER (owner / org-admin / pharmacy-admin → worker) and WORKER_TO_PHARMACY (worker → pharmacy). One editable rating per relationship per direction (unique constraints); re-rating overwrites stars/comment.
- **Eligibility (CHANGED since Oct):** the write API no longer accepts "any assignment". Owner→worker requires a `ShiftSlotAssignment` for that worker at a pharmacy the rater controls with `slot_date < today`; worker→pharmacy requires an assignment at that pharmacy with `slot_date < today`. Otherwise 403 ("You can only rate team members who completed an assignment at your pharmacy."). `pending` lists unrated eligible relationships, also date-filtered.
- **What "completed" means (still weak):** only that the slot date is in the past. No timesheet approval, no clock-out, no attendance proof, no worked-hours check. A worker who no-showed still has an assignment row with a past date and can be rated — and can rate the pharmacy. No-show and rating are unconnected because no-show does not exist.
- **Internal roster ratings still public (UNCHANGED):** the eligibility query has no `is_rostered` / source filter, and the talent-board average (`backend/talent/views/explorer.py:78-82`) averages **all** OWNER_TO_WORKER ratings (`Avg` + `Count`, no source filter). Internal employment feedback still feeds the public talent-card average. CX-Q35 still open.
- **Visibility:** `summary` returns average + count per worker/pharmacy; `list` requires `target_type` + `target_id`. No per-shift ratings, no reliability/attendance score, no response window. TB-Q05 still open.
- **Moderation (NEW, but half-built):** `POST /ratings/<id>/report/` — the ratee (worker, or a pharmacy the reporter controls) can report a rating with a 10–2000-char reason; one OPEN report per reporter/rating, repeat submissions update the reason; returns reference `RAT-000123`. But `RatingReport` has **no Django admin registration** (`backend/ratings/admin.py` registers only `Rating`), and no review/resolve endpoint was found — reports go in, nothing in the code reads them. A report is a write-only inbox until someone builds the queue.
- **Web vs Expo:** shared backend; both apps use the same API. Mobile has a `ReportButton` / `trustRewards.tsx` surface mentioning rating reports (not traced line-by-line); no web/Expo rule difference in eligibility.

### 1.8 No-shows, disputes, incidents, suspension — all absent

| Concept | State at `97c4543e` |
|---|---|
| No-show (definition, timer, confirmation) | No model, no state, no endpoint, no timer. A missing worker simply stays assigned; the shift passes into time-based history. Attendance sessions exist (GM-08) but no booking-level no-show classification reads them. |
| Late arrival | No lateness rule, no "running late" message, no ETA. Attendance timestamps exist; no reliability consequence. |
| Dispute / appeal (hours, pay, conduct, cancellation) | No dispute case, no appeal, no support queue in code. Hours disagreements: manager corrections + worker comments exist in the timesheet domain per Oct (not re-traced line-by-line at this head — CX-Q33 partial); **no escalation to platform support** was found anywhere. |
| Incident ledger / reliability badge / ladder | None. P10 ladder (1st warning → 14d → 28d+badge → 56d → permanent after human review, cap 6 months) is a decision only. No incident counting, no lookback, no badge. |
| Suspension / deactivation | No platform conduct-suspension tooling. `suspend` hits in backend are AHPRA/verification suspensions, not conduct sanctions. P04 ("platform only, case by case") has no mechanism. The Digital Labour Platform Deactivation Code process (CX-Q30) is not implemented. |
| Pharmacy blocking a worker | No block list (TB-Q09 still open). |
| Mutual / emergency exemptions | No consent flow, no evidence intake, no waiver record. P11 exemptions are decisions only. Health evidence handling (CX-Q09) has no intake at all. |

### 1.9 Completion and history — time-based, not proof-based

- `HistoryShiftViewSet` / `MyHistoryShiftsViewSet` (`backend/shifts/lifecycle.py`, `my_shifts.py`): history is assignment + scheduled-time based. A shift enters history after its scheduled end regardless of approved timesheets or clock-out. **No completed state, no 48h auto-approval** — `backend/workforce/timesheet_transitions.py` has submit / approve / reopen / comment / lock, and no "48" anywhere. CX-Q32 rec A is not built.
- Cancelled / expired / no-show shifts cannot appear with a status because the states do not exist; AHPRA-cancelled assignments are **deleted**, so they vanish from history rather than appearing as "cancelled" (CX-Q36 — worse than Oct, which assumed retention). Expired unpaid offers without assignments do not appear in history either.
- Timesheets route to payroll or invoicing (`workforce/timesheet_transitions.py`); early finish / extra hours have no marketplace rule (CX-R01 still open).

### 1.10 Notifications on cancel/cover/replace (AG-Q09/Q10)

- No agreed recipient/channel list exists. What exists, per feature: offer decline → owner in-app + email (`shift_worker_rejected`); cover-request approve/reject → worker email + in-app; AHPRA cancel → managers in-app + email (`shift_cancelled`); pre-shift reminders → email only, hourly Celery beat `send_shift_reminders` (`backend/shifts/tasks.py`, 12–13h window). No push rule for money/cancel events, no emergency escalation timer, no support alerting.

---

## 2. Current-flow matrix

Trigger → actor → backend/API → Vite/Next → Expo → persisted state → event/side effect → recovery/denial path. "—" = does not exist.

| # | Trigger | Actor | Backend / API (`97c4543e`) | Vite web | Next web | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Owner cancels confirmed booking | Owner/manager | **None.** No endpoint; `lifecycle.py` has no cancel action; `deletion.py` 409s if assignments exist | No button | No surface | No button | Nothing changes | None | Must go to support; support has no tool either — DB action only |
| F2 | Worker "can't make it" (confirmed) | Worker | **None.** No cancel-request endpoint | No button | No surface | No button | Nothing changes | None | Roster cover request is refused for booked work (`_guard_booked`) — dead end |
| F3 | Worker declines pending offer | Worker | `POST shift-offers/<id>/decline/` (`offers.py:677`); only own PENDING offer, else 403/400 | Offer screen | No surface | Offer screen | Offer → DECLINED | Owner in-app + email `shift_worker_rejected` | — |
| F4 | Worker withdraws interest / saved shift | Worker | `DELETE shift-interests/<id>/` / `shift-saved/<id>/` (`offers.py:157`) | Shift board | No surface | Shift board | Row deleted | None | — |
| F5 | Pending offer expires | System (lazy) | `ShiftOfferViewSet.list` flips PENDING → EXPIRED when `expires_at` passed (`offers.py:182-190`) | On next list load | — | On next list load | Offer → EXPIRED | None (no notice found) | Only runs when someone lists offers; no beat job found |
| F6 | Unpaid reservation expires | System | D03 decided; mechanism in `billing/checkout_reservations.py` (`expire_checkout`, manual + provider) — **not re-traced line-by-line, see §8** | Countdown UI (BK-Q13, GM-13) | — | Countdown UI | Offer stays ACCEPTED_AWAITING_PAYMENT until expiry path runs | Release to same audience (D03, decided) | Manual `expireFulfillmentCheckout` exists; auto-expiry scheduler not verified here |
| F7 | Worker cover request (roster) | Worker | `POST worker-shift-requests/` (`worker_requests.py:21`); own requests only | RosterWorkerPage | — | `app/my-roster.tsx` | `WorkerShiftRequest` PENDING | Email to owner/org-admins/pharmacy-admins | Manager approve/reject; worker stays assigned until approved (R04) |
| F8 | Manager approves cover (unassigned) | Manager | `approve` → creates community LOCUM shift+slot, request → AUTO_PUBLISHED (`worker_requests.py:227`) | Roster screens | — | Roster screens | New Shift + Slot | Worker emailed | Concurrent approve blocked by row lock re-check |
| F9 | Manager approves cover (assigned, rostered) | Manager | `release_worker_from_assignment` (`worker_actions.py:353`): deletes assignment, escalates to LOCUM_CASUAL, request APPROVED | Roster screens | — | Roster screens | Assignment row deleted; Shift visibility → LOCUM_CASUAL | Worker emailed | Stale-request + history guards; **refused if booked/awaiting payment (`_guard_booked`)** |
| F10 | Manager approves cover (assigned, marketplace-booked) | Manager | `_guard_booked` raises ValidationError → 400 "cancel the booking instead…" (`worker_actions.py:55-63`) | Same refusal | — | Same refusal | Nothing changes | None | **No recovery path — this is the dead end** |
| F11 | AHPRA restriction on worker | System | `cancel_upcoming_assignments` (`cancellation.py`); callers in `onboarding/verification/state.py` | None (backend) | None | None (backend) | Future assignments deleted; future offers → DECLINED; worked history retained | Managers in-app + email, kind `shift_cancelled` | Retained rows listed, not deleted; no fee/refund; payment state untouched |
| F12 | Owner opens legacy penalty checkout | Owner/manager (billing) | `POST /billing/charge-penalty/<id>/` (`billing/views.py:169` → `shift_payments.py: charge_penalty`) | No caller | — | No caller | **Nothing** (no obligation row, no idempotency key) | Stripe Checkout opened (10%/20% of all assignments' wages) | Live-gated by `BILLING_LIVE_SHIFT_PENALTY_ENABLED`; duplicate calls open duplicate sessions |
| F13 | Worker no-shows | Worker (absent) | **None.** No state, timer or endpoint | Nothing | — | Nothing | Assignment stays; shift ages into history | None | Manager can only use roster cover flow, which refuses booked work (F10) |
| F14 | Hours/pay/conduct dispute | Either side | **None.** No dispute case or escalation endpoint | Nothing | — | Nothing | Nothing | None | Timesheet manager-correction + worker comment only (CX-Q33, partial); no support escalation |
| F15 | Rating submitted | Owner→worker / worker→pharmacy | `POST /ratings/` (`ratings/views.py: create`); 403 unless past-date assignment at controlled pharmacy | Ratings UI | — | Ratings UI | One editable Rating per relationship | Visible in `summary` avg + count; talent-card avg | Re-rate overwrites; no per-shift rating |
| F16 | Rating reported | Ratee | `POST /ratings/<id>/report/` (`ratings/views.py: report`); ≥10 chars; one OPEN report per reporter | Report UI (partial — not traced line-by-line) | — | `ReportButton` / `trustRewards.tsx` (partial) | `RatingReport` OPEN, ref `RAT-000123` | None — no admin queue or resolve endpoint reads it | Report can be updated; no visible outcome to reporter |
| F17 | Shift completes | System (time) | History querysets are time-based (`lifecycle.py: HistoryShiftViewSet`) | History pages | — | History screens | No status change | None | No completion proof; no 48h auto-approve |
| F18 | Payment fails / checkout expires | Owner | `expireFulfillmentCheckout` / `resumeFulfillmentCheckout` (`billing/views.py`); `checkout_reservations.py` | Billing UI | — | Billing UI (bridge) | Checkout → EXPIRED | Reservation persists to original deadline (BK-R01) | Retry until deadline; late payment → F04 (credit/refund after approved review, decided not built) |

---

## 3. Revalidation summary — what changed since the Oct 2026 #184 questions

| Old item | Verdict | One-line reason |
|---|---|---|
| SH-01 (no cancel) / CX-Q01–Q03, Q05–Q10, Q14–Q22, Q26–Q31, Q36, AG-Q09/Q10, BK-Q14, TB-Q09, LA-P02, LA-R02 | **STILL VALID** (27) | Nothing built; code matches Oct description, in some cases word-for-word (e.g. `_guard_booked` now states the dead end explicitly) |
| CX-Q04 | **CHANGED** | The preview-only P09 calculator (`shifts/cancellation_policy.py`) no longer exists at this head; the only live calculator is legacy 10%/20% in `charge_penalty`. "Keep current logic" no longer refers to anything |
| CX-Q11–Q13, Q15–Q16 | **STILL VALID** (5) | No no-show state/timer/confirmation; no release path for a no-show's slot |
| CX-Q32, CX-R01 | **STILL VALID** | Time-based history; no 48h auto-approve; no marketplace early-finish rule |
| CX-Q33 | **STILL VALID — PARTIAL** | "No escalation to support" verified by absence; manager-correction/worker-comment half not re-opened line-by-line at this head |
| CX-Q34 | **CHANGED** | Ratings now gated on past-date assignment (was: any assignment). Still no timesheet/clock-out proof; still relationship-level, not per-shift |
| CX-Q35, TB-Q05 | **STILL VALID** | Internal ratings still feed the public talent average (`talent/views/explorer.py:78-82`); still one average, no reliability score |
| LA-P01 | **CHANGED — PARTIAL** | AHPRA path now declines offers + deletes future assignments with history protection; payment-state reset still not verified in that function |
| LA-Q06 / SH-02 | **CHANGED — WORSE + GATED** | Route still live, now proven buggy by repo characterisation tests (timezone amounts, all-assignments charging, no idempotency); live use now flag-gated (`BILLING_LIVE_SHIFT_PENALTY_ENABLED`) |
| LA-Q10 / SH-09 | **CHANGED — PARTIAL** | Terms fingerprint/version now exists and is echoed at accept (PR #249 D2); cancellation table, platform terms version, pharmacy acceptance still absent from the snapshot |
| SH-03 (subscriber overcharge) | **NO LONGER VALID as a gap — FIXED** | `charge_shift_fulfillment` now applies subscriber prices ($15/$40). Hard-coded price IDs remain |
| SH-10 | **CHANGED** (see CX-Q34/Q35) | Eligibility tightened; public-average contamination remains |
| BK-R01 | **STILL VALID (strengthened)** | Retry-until-deadline still the rule; explicit expire/resume checkout actions now exist |
| Carried decisions D04/D05/R04/R04D/P02/P04–P12/F01/F04/NOPEN | **CARRIED, but 3 conflicts with code** | D04 promises owner/manager cancel "with guards" — no cancel exists. P09 table decided, code charges legacy 10/20. P10 ladder decided, no ladder exists. See §6 |

No old question was carried forward unvalidated. No question is marked NOT RE-VALIDATED for rate-limit reasons (no 429 occurred).

---

## 4. Validated question queue (in #184 format)

Severity: **Launch-blocker** = cannot launch real bookings without it; **High** = week-one failure / money or legal risk; **Medium** = trust/repeat-use risk. "Keep current logic" means keep what the code does today at `97c4543e` — where nothing exists, there is no Keep option and the question says so.

### GM15-01 — CX-Q01 · What cancellation can launch, given fees are not yet enforceable? [STILL VALID]
- **Actual today:** Nothing. No cancel endpoint, no cancelled state, no button on Vite/Next/Expo (F1/F2). Delete is 409-blocked once anyone is engaged (`deletion.py`). The roster release path refuses booked work (`_guard_booked`).
- **Recommended (High — launch-blocker): B** — Build owner cancel + manager-reviewed worker cancel-request with reason, audit and notices, with any fee *shown but not charged* until LA-R02 legal review passes. Launching with zero cancel path means week-one cancellations go to manual DB edits, exactly as SH-01 warned.
- **A — Support-only cancel, no fees:** Admin action with reason + audit. Slow, but shippable fastest and keeps money out of it. Risk: support becomes the bottleneck; no self-serve near start time.
- **B — Owner cancel + worker request (recommended):** Owner cancels directly; worker requests, manager approves (R04D), notices to both sides. Risk: needs the approval window (Q05) and reopen rule (Q15) decided first.
- **C — Hold launch until fees enforceable:** Delays launch indefinitely; fees need legal review first. Risk: no revenue while a non-money cancel could ship.
- **Other / defer:** describe.
- **Edge cases:** cancel before/after acceptance, before/after payment, <2h to start, recurring multi-date (D05: one date / selected / whole posting), concurrent cancel + payment, wrong tenant/role denied (403), payment in flight.

### GM15-02 — CX-Q02 · Who receives the owner cancellation fee? [STILL VALID]
- **Actual today:** No fee recipient exists. The only money route (`charge_penalty`) pays the platform via Stripe; the worker gets nothing; nothing is recorded as owed to anyone.
- **Recommended (High): A** — The worker, as cancellation pay for lost work (matches Locumate/Hireup pattern in #184 research). Keeps booking fee separate (F01).
- **A — Worker, as cancellation pay:** compensates lost shift; needs a payout path (Q22). **B — Platform:** worker gets nothing; hard to defend to workers. **C — Split worker/platform:** harder to explain, two payouts.
- **Other / defer.**

### GM15-03 — CX-Q03 · If the pharmacy cancels an unpaid reservation, is any fee due? [STILL VALID]
- **Actual today:** No cancel transition for unpaid reservations exists at all. D01: payment is the confirmation point.
- **Recommended: A** — No fee; worker notified. Nothing confirmed, so no booking to cancel.
- **A — No fee (recommended). B — Fee bands apply:** treats a reservation like a confirmed booking; contradicts D01.
- **Other / defer.**

### GM15-04 — CX-Q04 · At exactly 72h / 24h / 12h / 2h, which band applies? [CHANGED]
- **Actual today (changed):** The Oct "preview-only fee calculator" (`shifts/cancellation_policy.py`) **does not exist** at this head. The only live computation is `charge_penalty`: ≤24h = 20%, 24–72h = 10%, >72h = 0 — and its boundary behaviour is timezone-dependent (proven: same instant gives different amounts under UTC vs Brisbane, `test_cancellation_policy_evidence.py`). The P09 7-band table is not implemented anywhere.
- **Recommended (High):** Do not "keep" anything — decide the bands fresh against the P09 table (0/0/10/15/20/25/30%) and fix the timezone to the pharmacy's local time with the milder band at exact boundaries. This question must be re-asked, not carried: the old KEEP option referred to code that is gone.
- **A — Milder band at exact boundaries, pharmacy local time (recommended, once P09 is implemented). B — Stricter band (exactly 24h = 15%).**
- **Other / defer.**

### GM15-05 — CX-Q05 · How much notice counts as "enough window" for a normal manager approval? [STILL VALID]
- **Actual today:** No window exists. R04/R04D are decisions only; `WorkerShiftRequest` has no urgency field.
- **Recommended: A — 72h or more** (matches where owner fees start, P08). **B — 24h+. C — 7 days+** (most requests become emergencies).
- **Other / defer.**

### GM15-06 — CX-Q06 · Inside the window, who is alerted and how fast? [STILL VALID]
- **Actual today:** No emergency escalation exists. Roster emails go once to owner/admins; nothing repeats, nothing escalates to support.
- **Recommended: B** — Manager + owner push every 15 min, plus platform support after 30 min (support chases, does not approve).
- **A — Manager + owner push every 15 min. C — Manager only.**
- **Other / defer.**

### GM15-07 — CX-Q07 · If no manager answers before start and the worker doesn't come, what is it? [STILL VALID]
- **Actual today:** No classification. Worker stays assigned (R04D); then the shift ages into history with no record that they asked.
- **Recommended: A — Late cancel, not a no-show** (request is evidence; platform reviews).
- **B — No-show** (ignores that they asked in time).
- **Other / defer.**

### GM15-08 — CX-Q08 · How is a mutually agreed cancellation proven and approved? [STILL VALID]
- **Actual today:** No two-party consent, no waiver record. P11 exempts mutual cancels, but nothing records one.
- **Recommended: A — Both tap "agree" in app**, logged with time; waiver applies automatically.
- **B — Manager says so. C — Support reviews every one.**
- **Other / defer.**

### GM15-09 — CX-Q09 · What evidence may support an illness or emergency exemption? [STILL VALID]
- **Actual today:** No evidence intake, retention or restricted review exists anywhere.
- **Recommended: A — Reason first; evidence only if disputed**, minimum necessary, support-only, destroyed/de-identified when no longer needed (health data is sensitive).
- **B — Evidence within 48h for every claim. C — No evidence ever.**
- **Other / defer.**

### GM15-10 — CX-Q10 · Can a pharmacy emergency (closure, outage) waive the owner fee? [STILL VALID]
- **Actual today:** No waiver process exists. P11 owner exemptions are undefined.
- **Recommended: A — Yes, support waives with evidence; worker is told the reason.**
- **B — Never; fee always applies.**
- **Other / defer.**

### GM15-11 — CX-Q11 · When does a missing worker become a no-show? [STILL VALID]
- **Actual today:** No no-show state, timer or classification. A missing worker stays assigned; nothing reposts the slot.
- **Recommended: A — 30 min after start, no contact** (pharmacy can repost sooner).
- **B — 60 min (Instawork's automatic line). C — Manager reports any time after start.**
- **Other / defer.**

### GM15-12 — CX-Q12 · How is late arrival treated? [STILL VALID]
- **Actual today:** No lateness rule. Attendance timestamps exist (GM-08) but no booking lateness classification, no "running late" message, no ETA.
- **Recommended: A — 15+ min late is logged, not an incident**; shown on reliability; "running late" message with ETA.
- **B — Late counts as an incident.**
- **Other / defer.**

### GM15-13 — CX-Q13 · How is a no-show confirmed? [STILL VALID]
- **Actual today:** No review queue. Managers only report (P04); the platform decides (P10) — but there is no one and nowhere to decide.
- **Recommended: A — Report, worker replies in 48h, platform decides** (both sides heard).
- **B — Platform decides on the report alone.**
- **Other / defer.**

### GM15-14 — CX-Q14 · If a worker cancels several dates of one booking, how many incidents is that? [STILL VALID]
- **Actual today:** No incident ledger, so nothing to count. (D05 allows one-date / selected / whole-posting cancels.)
- **Recommended: A — One incident per cancel action** (a series counts once; avoids a 10-day block exhausting the ladder).
- **B — One per affected date.**
- **Other / defer.**

### GM15-15 — CX-Q15 · After a confirmed booking is cancelled, how does the shift reopen? [STILL VALID]
- **Actual today:** No reopen-after-cancel exists. The closest analogues: D03 expiry reopens to the same audience; roster release reuses the same shift and escalates to LOCUM_CASUAL (`worker_actions.py:398-408`).
- **Recommended: A — Same shift; notify favourites first**, then current audience per owner flags.
- **B — Same audience, no extra notice (matches D03). C — Manager decides each time.**
- **Other / defer.**

### GM15-16 — CX-Q16 · Can the manager release a no-show's slot and repost straight away? [STILL VALID]
- **Actual today:** No no-show release exists. The roster release exists only for non-booked work and refuses booked work.
- **Recommended: A — Yes, once the no-show line passes** (Q11); incident review continues separately.
- **B — Only after platform review** (too slow on the day).
- **Other / defer.**

### GM15-17 — CX-Q17 · If a worker's cancelled shift is filled by a replacement, what happens to the incident? [STILL VALID]
- **Actual today:** No incident mitigation rule; no incident exists to mitigate. P12 says "depends on who cancelled and time left" — undecided detail.
- **Recommended: B — No incident if replaced 24h+ out**; inside 24h it still counts.
- **A — No incident if replaced at any time. C — Always counts.**
- **Other / defer.**

### GM15-18 — CX-Q18 · If the pharmacy cancels but offers the worker equal replacement work, is the fee waived? [STILL VALID]
- **Actual today:** No waiver exists. P12 applies to pharmacy cancels too — undecided.
- **Recommended: A — Waived if worker accepts it** (equal pay, same day; worker must accept, pharmacy cannot impose a substitute).
- **B — Fee still applies.**
- **Other / defer.**

### GM15-19 — CX-Q19 · When the pharmacy cancels a paid booking, what happens to the booking fee? [STILL VALID]
- **Actual today:** No refund/credit engine. `charge_penalty` only opens a checkout; it refunds nothing. F01 keeps booking fee / refund / worker pay separate (decided, not built).
- **Recommended: C — Refund over 72h, credit inside** (pharmacy keeps value either way).
- **A — Refund over 72h, none inside. B — Credit always, never cash.**
- **Other / defer.**

### GM15-20 — CX-Q20 · When the worker cancels or no-shows, what happens to the booking fee? [STILL VALID]
- **Actual today:** No rule, no engine. The pharmacy has paid a fulfillment fee for work that did not happen, with no remedy path.
- **Recommended: C — Keep only if replaced**; otherwise pharmacy chooses refund or credit.
- **A — Pharmacy picks remedy each time. B — Credit only.**
- **Other / defer.**

### GM15-21 — CX-Q21 · Who approves refunds and credits? [STILL VALID]
- **Actual today:** Payments can be flagged for reconciliation, but no approval workflow exists; a flag cannot issue money.
- **Recommended: A — Platform finance/support admin, every case, with reason logged** (matches F04).
- **B — Automatic by rule, admin for exceptions.**
- **Other / defer.**

### GM15-22 — CX-Q22 · How is the worker's cancellation pay paid out? [STILL VALID]
- **Actual today:** Timesheets route ordinary pay to payroll/invoicing, but cancellation pay has no record or payout path.
- **Recommended: A — Same invoice or payroll as wages, labelled "cancellation pay".**
- **B — Platform pays the worker** (platform would need to hold the money).
- **Other / defer.**

### GM15-23 — CX-Q23 · Who reviews disputes and appeals? [STILL VALID]
- **Actual today:** No dispute or appeal workflow. Only the platform may sanction (P04, decided) — but there is no reviewer, no queue, no case. (Partial related build: `RatingReport` lets a ratee report a *rating*; that is not a cancellation/hours dispute and has no review queue.)
- **Recommended: A — Support reviews; a second person hears the appeal** (appeal never goes to the first reviewer).
- **B — One reviewer does both.**
- **Other / defer.**

### GM15-24 — CX-Q24 · How long to appeal, and how fast must support answer? [STILL VALID]
- **Actual today:** No clocks exist.
- **Recommended: A — 14 days to appeal; answer in 5 (first review in 2 business days).**
- **B — 30 days to appeal; answer in 10.**
- **Other / defer.**

### GM15-25 — CX-Q25 · Who can see each part of a dispute? [STILL VALID]
- **Actual today:** No dispute case, evidence classes or access policy exist.
- **Recommended: A — Summary to both sides; support alone sees sensitive evidence** (medical, identity, third-party).
- **B — Everything to both sides. C — Platform only.**
- **Other / defer.**

### GM15-26 — CX-Q26 · Which events count as an incident? [STILL VALID]
- **Actual today:** No reviewed incident ledger, no qualifying cutoff. P10 says every non-exempt qualifying cancel/no-show counts after platform review — "qualifying" is undefined.
- **Recommended: A — No-shows and cancels inside 72h** (matches the owner fee line).
- **B — Inside 24h. C — Any cancel after confirmation, even weeks ahead.**
- **Other / defer.**

### GM15-27 — CX-Q27 · Do favourite, chain and organisation incidents count toward the platform ladder? [STILL VALID]
- **Actual today:** No source-specific ladder or badge rule. P04 (favourites: warnings) / P05 (chain/org: handled internally, badges possible) are decisions only. Source is *not* frozen per worker/date (CX-Q31, still open) — only shift visibility is frozen in engagement terms.
- **Recommended: A — Public-sourced only; others badge only** (non-public incidents can add a badge, never suspension).
- **B — All outside sources count on one ladder.**
- **Other / defer.**

### GM15-28 — CX-Q28 · How far back does the ladder count? [STILL VALID]
- **Actual today:** No lookback or reset. P10 has no window.
- **Recommended: A — Rolling 12 months** (old incidents drop off; allows rehabilitation).
- **B — Rolling 6 months. C — Lifetime.**
- **Other / defer.**

### GM15-29 — CX-Q29 · When should the reliability badge disappear? [STILL VALID]
- **Actual today:** No badge exists at all (P10 adds one at incident 3 — not built).
- **Recommended: B — Below three active incidents** (badge follows the rolling lookback from Q28).
- **A — After three clear months. C — Permanent.**
- **Other / defer.**

### GM15-30 — CX-Q30 · What process applies before permanent suspension? [STILL VALID]
- **Actual today:** No suspension tooling, no process. P10 requires human review, notice, appeal and legal review — none exists.
- **Recommended (High — legal): A — Code-compliant process** (reasons, notice, review, response, appeal) under the Digital Labour Platform Deactivation Code.
- **B — Two reviewers plus legal. C — One platform admin.**
- **Other / defer.** Note: do not build suspension tooling before this is decided; a one-sided permanent ban is the highest-risk item in this area.

### GM15-31 — CX-Q31 · When is a worker's source (favourite, chain, org, public) frozen, and which wins if several apply? [STILL VALID]
- **Actual today:** Accepted engagement terms freeze the *shift visibility* at acceptance (`engagement.py: build_shift_engagement_terms`, `source_visibility: shift.visibility`); assignments link to the source offer. They do **not** freeze each worker's favourite/chain/org/public relationship or resolve precedence.
- **Recommended: A — Freeze at accept; closest relationship wins** (a favourite seen via public counts as favourite).
- **Keep — Keep freezing shift visibility without worker-specific precedence. B — Freeze at accept; channel seen wins. C — Freeze at payment.**
- **Other / defer.**

### GM15-32 — CX-Q32 · What marks a shift complete? [STILL VALID]
- **Actual today:** Nothing marks it complete. Assignments enter history after scheduled end regardless of approved timesheets or clock-out (`lifecycle.py: HistoryShiftViewSet`); no completed state; **no 48h auto-approval** — `timesheet_transitions.py` has submit/approve/reopen/comment/lock and no "48" anywhere.
- **Recommended: A — Timesheet approved, or auto after 48h** (worker submits; pharmacy approves or it auto-approves).
- **Keep — Continue time-based history without an explicit completion state. B — Clock-out alone. C — Manager approval only.**
- **Other / defer.**

### GM15-33 — CX-Q33 · How are disputed hours settled? [STILL VALID — PARTIAL]
- **Actual today:** Managers can correct attendance with a reason; workers can comment on timesheets and request missing punches (Oct description; manager-correction/worker-comment half **not re-opened line-by-line at this head**). Verified at this head: **no escalation of an hours disagreement to platform support exists** (no dispute/appeal code anywhere; `appeal` = 0 product hits). Both apps share this backend.
- **Recommended: A — Pharmacy edits with reason; worker can escalate; support decides if they disagree.**
- **Keep — Manager corrections + worker comments, no platform escalation. B — Support handles every dispute.**
- **Other / defer.**

### GM15-34 — CX-R01 · How are early finishes and extra hours paid? [STILL VALID]
- **Actual today:** Timesheets compare actual vs planned hours and allow manager correction, but no marketplace policy resolves early release, authorised extra hours or minimum payment (Oct description; timesheet-compare half not re-traced at this head — see §8).
- **Recommended: A — Approved actual hours**; preserve any legal minimum engagement; calculate authorised overtime/penalties; record who requested the early finish/extension.
- **Keep — Managers approve actual hours without a marketplace rule. B — Scheduled hours only.**
- **Other / defer.**

### GM15-35 — CX-Q34 · Who can rate, and when? [CHANGED]
- **Actual today (changed):** Owners/org-admins/pharmacy-admins can rate assigned workers; workers can rate pharmacies — but now only with a **past-date assignment** at a controlled pharmacy (`ratings/views.py: _has_completed_relationship_*`, `slot_date < today`; 403 otherwise). One editable rating per relationship. `pending` lists unrated eligible relationships. **Still not proof of work:** no timesheet approval, no clock-out, no attendance check — a no-showed worker can still be rated, and can rate the pharmacy. Still relationship-level, not per-shift. Still no internal/marketplace separation (see Q36).
- **Recommended (High — trust): A — After approved timesheet only.** No rating when no work happened.
- **Keep (stale — needs rewriting) — "Allow relationship ratings after any assignment":** no longer describes the code; the code now requires a past-date assignment. Do not carry the old KEEP text forward. **B — After the shift's end time** (current code, roughly: past date; unworked shifts could still be rated).
- **Other / defer.**

### GM15-36 — CX-Q35 · Should ratings from internal roster shifts appear on the public talent board? [STILL VALID]
- **Actual today:** Yes, they do. Talent cards average **all** OWNER_TO_WORKER ratings including internal-roster ones (`talent/views/explorer.py:78-82`, `Avg`/`Count` with no source filter); web and mobile show the same aggregate; no internal-vs-marketplace separation.
- **Recommended: A — No, keep internal private** (employer reviews stay private; marketplace reviews are separate).
- **Keep — Continue including internal ratings in the talent-card average.**
- **Other / defer.**

### GM15-37 — CX-Q36 · Do cancelled, expired and no-show shifts stay in both sides' history? [STILL VALID]
- **Actual today:** Both sides have assignment-and-time history. Cancelled/no-show states do not exist; expired unpaid offers without assignments do not appear. **Worse than Oct:** AHPRA-cancelled assignments are *deleted* (`cancellation.py`), so they vanish from history instead of appearing as "cancelled".
- **Recommended: A — Yes, both see them with status**; reason visible only to the two parties.
- **Keep — Assignment-and-time history without cancellation/expiry records. B — Hidden once cancelled.**
- **Other / defer.**

### GM15-38 — AG-Q09 · Who is told when a shift is cancelled, covered or replaced? [STILL VALID]
- **Actual today:** Each feature picks its own recipients. Shift edits notify past applicants; offer decline notifies the owner; cover approve/reject notifies the worker; AHPRA cancel notifies managers only. No cancel notice exists for user-initiated cancels (there is no cancel).
- **Recommended: A — Affected workers, owner, shift's managers only** (people who must act).
- **Keep — Each feature keeps choosing its own recipients. B — Plus organisation admins. C — Plus anyone watching.**
- **Other / defer.**

### GM15-39 — AG-Q10 · Which channels carry those notices? [STILL VALID]
- **Actual today:** In-app, push and email exist; each feature picks its own. Offer/confirmation: in-app + email. Pre-shift reminders: email only (hourly beat, 12–13h window, `shifts/tasks.py`).
- **Recommended: A — In-app and push; email for money/cancel.**
- **Keep — Each feature keeps choosing its own channels. B — Email everything. C — In-app only.**
- **Other / defer.**

### GM15-40 — BK-Q14 · Can a worker drop a reservation before payment without an incident? [STILL VALID]
- **Actual today:** No worker withdraw action exists for a reservation; it ends only when the pharmacy pays or the reservation expires (D03). (Worker *can* decline a PENDING offer and delete interest/saved shifts — that is before acceptance, not a reservation.)
- **Recommended: A — Yes, no incident** (nothing is confirmed until the pharmacy pays, D01; releasing the slot helps the pharmacy).
- **Keep — Worker cannot drop a reservation. B — Free for 15 minutes, then counts. C — Counts as a cancellation.**
- **Other / defer.**

### GM15-41 — BK-R01 · What happens after booking payment fails? [STILL VALID — strengthened]
- **Actual today:** A failed/cancelled checkout does not confirm the assignment. The reservation remains for another attempt until its original payment deadline. New since Oct: explicit `expireFulfillmentCheckout` / `resumeFulfillmentCheckout` actions exist (`billing/views.py`, shared-core), and `checkout_reservations.py` reconciles orphaned/expired provider sessions.
- **Recommended: Keep — Retry until deadline** (same reservation, original deadline; D02/D03 stay deterministic).
- **A — Release immediately. B — Extend once.**
- **Other / defer.**

### GM15-42 — TB-Q05 · How should reviews and reliability show? [STILL VALID]
- **Actual today:** Web and mobile show one average OWNER_TO_WORKER star score + count (`talent/views/explorer.py:78-82`; `ratings/views.py: summary`). No separate attendance reliability or responsiveness measure; internal ratings feed the same average.
- **Recommended: A — Separate: reviews and reliability, with counts** (one line each).
- **Keep — One relationship star average and count, no separate reliability.**
- **Other / defer.**

### GM15-43 — TB-Q09 · Can a pharmacy block a worker? [STILL VALID]
- **Actual today:** No block list exists anywhere (repo search: 0 hits in backend/talent).
- **Recommended: A — Yes, private block** (worker stops seeing that pharmacy's shifts; never shown publicly).
- **B — No blocking; pharmacy declines each time.**
- **Other / defer.**

### GM15-44 — LA-P01 · AHPRA cancellation leaves a shift stuck as waiting for payment [CHANGED — PARTIAL]
- **Actual today:** `cancel_upcoming_assignments` now declines future ACCEPTED_AWAITING_PAYMENT offers and deletes future assignments (with history protection), so the *offer* no longer sits waiting. **Not verified in that function:** any reset of `Shift.payment_status` or outstanding fulfillment checkouts — the function touches neither. Payment-state reset needs a GM-13/GM-17 cross-check before this is closed.
- **Recommended: A — Before launch: fix as part of merging** (verify + fix the payment reset; do not ship a path that frees the worker but leaves the shift "awaiting payment").
- **B — Soon after launch. C — Not needed.**
- **Other / defer.**

### GM15-45 — LA-P02 · AHPRA cancellations bypass the cancellation policy and notices [STILL VALID]
- **Actual today:** The AHPRA path is still its own cancellation path: no fee, no refund/credit, managers-only notice, worker not notified by that function. It skips every P09/F01 rule.
- **Recommended: A — Before launch: fix** (one cancellation path, one policy; or an explicit, owner-approved exception for regulatory cancellations).
- **B — Soon after launch. C — Not needed.**
- **Other / defer.**

### GM15-46 — LA-Q06 / SH-02 · The old 10%/20% penalty route is still live [CHANGED — WORSE + GATED]
- **Actual today:** `POST /billing/charge-penalty/<id>/` still routed (`billing/urls.py`), still exported from shared-core (`chargeShiftPenalty`), no UI calls it. **New evidence:** repo characterisation tests prove it charges the wrong amount across timezones, charges all assignments despite a slot selector, and opens duplicate Stripe sessions with no idempotency key (`test_cancellation_policy_evidence.py`; `RELEASE_DECISIONS_20261102.md` #8). **New gating:** live mode requires `BILLING_LIVE_SHIFT_PENALTY_ENABLED` (`release_guards.py`); test mode runs unimpeded.
- **Recommended (Launch-blocker): A — Before launch: disable the callable route** (remove it or gate it off unconditionally) and do not introduce replacement charges until Australian counsel reviews classification, proportionality, disclosure and unfair-contract-term risk (see GM15-49).
- **B — Soon after launch. C — Not needed.**
- **Other / defer.**

### GM15-47 — LA-Q10 / SH-09 · Accepted terms don't include the cancellation table or terms version [CHANGED — PARTIAL]
- **Actual today:** Better than Oct, still incomplete. A stable terms fingerprint now exists (`engagement.py: shift_engagement_terms_version`, SHA-256) and acceptance echoes it (PR #249 D2 work). But the snapshot (`build_shift_engagement_terms`, `version: 1`) still contains **no cancellation band table, no platform terms version, no pharmacy-side acceptance** — only worker `accepted_at` / `accepted_by_user_id`. The register's legal note stands: P09 fees need clear disclosure *before* acceptance before they can ever be charged.
- **Recommended: A — Before launch:** record versioned pre-contract acceptance by both sides, include the cancellation matrix, and obtain Australian legal review.
- **B — Soon after launch. C — Not needed.**
- **Other / defer.**

### GM15-48 — LA-P03 (context, GM-15 adjacent) · Chain and organisation shifts skip the AHPRA gate [STILL VALID — noted, owned by GM-02/GM-04]
- **Actual today:** Not re-traced in this pass (belongs to GM-02/GM-04); carried from #184 unchanged. Flagged here only because a chain/org booking made without the gate inherits every cancellation gap in this area (a cancelled booking for an unverified worker still has no cancel path).
- **Recommended: A — Before launch.**
- **Other / defer.**

### GM15-49 — LA-R02 · May cancellation charges launch before Australian legal review? [STILL VALID]
- **Actual today:** The approved P09 charge table is not implemented. The separate legacy 10%/20% checkout remains callable (test mode ungated; live flag-gated), with no evidence of Australian legal review. Since Nov 2023, proposing/using/relying on unfair standard-form terms can attract major penalties; clear wording alone does not cure unfairness.
- **Recommended (Launch-blocker): A — Legal review before launch** (review every charge and remedy before enforcement).
- **B — Disclosure is enough. C — Never charge: use non-money reliability controls only.**
- **Other / defer.**

---

## 5. SINGLE first decision question to ask the owner first

### GM15-01 — What cancellation can launch, given fees are not yet enforceable?

**Why first:** every other question in this area assumes a cancellation exists. Without this answer there is nothing to attach fees (Q02–Q04, Q19–Q22), notices (Q38–Q39), reopen rules (Q15–Q16), incidents (Q14, Q17, Q26–Q31) or disputes (Q23–Q25) to. It also decides whether launch waits or ships with a non-money cancel.

**Plain-English setup for the owner:** "Today, once a booking is confirmed and paid, nobody — not you, not the worker, not support — can cancel it in the app. If a worker rings in sick the morning of a shift, the booking just sits there. The roster cover button refuses booked shifts and tells the manager to cancel the booking instead — but there is no cancel button. What should launch with?"

**Options:**
- **A — Support-only cancel, no fees.** Only platform support cancels, with a reason and an audit record. Nothing is charged. *Trade-off:* slowest near start time; support is the bottleneck; but it is the smallest build and keeps all money out of launch.
- **B — Owner cancel + worker cancel-request (RECOMMENDED).** You (or your managers) can cancel a confirmed booking directly. A worker cannot cancel alone — they send a request, a manager approves it (always, per R04D), and both sides get a notice. Any fee is *shown but not charged* until the legal review (Q49) passes. *Trade-off:* needs the approval window (Q05) and the reopen rule (Q15) decided next, but it is the only option that works on the day.
- **C — Hold launch until fees are enforceable.** No cancellation ships until the fee table is legally reviewed and built. *Trade-off:* delays launch indefinitely for a money feature; a non-money cancel could have shipped meanwhile.
- **Other (describe) / Defer.**

**What happens after the answer:** if A or B, the implementation backlog (§7) items B1–B4 are unblocked; if C, GM-15 stays launch-blocking and the legacy penalty route must still be disabled (Q46, a code gap, not a decision).

---

## 6. Code gaps vs decision gaps

### Code gaps — no owner decision needed, just build / fix (do not wait for the interview)
| # | Gap | Evidence at `97c4543e` | Severity |
|---|---|---|---|
| C1 | Legacy `charge-penalty/` route still live and proven buggy (timezone amounts, all-assignments charging, duplicate sessions, no idempotency) | `billing/urls.py`, `billing/shift_payments.py: charge_penalty`, `billing/test_cancellation_policy_evidence.py`, `RELEASE_DECISIONS_20261102.md` #8 | **Launch-blocker** |
| C2 | `charge_penalty` does not cancel anything — it only opens a checkout | `shift_payments.py: charge_penalty` (no assignment/offer write) | High |
| C3 | Shared-core `chargeShiftPenalty` sends `{hours}` the backend ignores | `shared-core/src/domains/billing/api.ts` vs `shift_payments.py` | Medium |
| C4 | No cancelled/no-show/completed state on `ShiftSlotAssignment` (no status field at all) or `ShiftOffer` | `shifts/models.py:465-530, 668-673` | **Launch-blocker** |
| C5 | AHPRA-cancelled assignments are *deleted*, vanishing from history instead of appearing as "cancelled" | `shifts/cancellation.py` (`.delete()`), `history.py` | High |
| C6 | `RatingReport` has no admin registration and no review/resolve endpoint — reports go nowhere | `ratings/admin.py` (only `Rating`), `ratings/views.py: report` | High |
| C7 | Engagement snapshot has no cancellation table, platform terms version, or pharmacy acceptance | `shifts/engagement.py: build_shift_engagement_terms` | High |
| C8 | Offer expiry is lazy (only on list); no background expiry job found for PENDING offers | `shifts/offers.py:182-190` | Medium |
| C9 | No idempotency / persisted obligation for cancellation charges | `test_cancellation_policy_evidence.py: test_repeated_legacy_requests…` | High |
| C10 | Subscriber fulfillment pricing fixed, but Stripe price IDs still hard-coded | `shift_payments.py` (SH-03 partial fix) | Low |

### Decision gaps — owner must choose first (the queue in §4)
Q01 (launch scope) → Q02–Q04 (fee recipient/bands/boundaries) → Q05–Q07 (approval window/emergency/unanswered) → Q08–Q10 (mutual/emergency waivers) → Q11–Q13 (no-show definition/confirmation) → Q15–Q18 (reopen/replacement) → Q19–Q22 (booking fee + worker pay) → Q23–Q25 (disputes/appeals/visibility) → Q26–Q31 (incident ladder) → Q32–Q34 (completion/hours/early finish) → Q35–Q37 (ratings/history) → Q46–Q49 (launch gates: disable legacy route, terms disclosure, legal review). Plus carried-decision conflicts:

| # | Carried decision vs code | Conflict |
|---|---|---|
| D04 | "Owner and authorised managers can cancel, with guards" | No cancel exists for anyone |
| P09/FEES | 7-band table 0/0/10/15/20/25/30% decided | Code charges legacy 10/20% only |
| P10 | Incident ladder decided (warning → 14d → 28d+badge → 56d → permanent) | No ladder, no incidents, no badge |
| P04 | "Platform only sanctions, case by case" | No sanction tooling of any kind |
| D03 | Unpaid reservation expires, release to same audience | Mechanism not re-traced at this head (see §8) — do not assume it works |

---

## 7. Implementation backlog — ONLY after the owner answers (not decided now)

| # | Item | Unblocked by | Notes / acceptance |
|---|---|---|---|
| B1 | Disable/remove `charge-penalty/` route (or gate off unconditionally) | Q46 (code gap C1 — can proceed on owner confirmation, not a policy choice) | No authenticated caller can open a cancellation checkout; shared-core export removed or stubbed; regression test |
| B2 | Cancelled state + cancel endpoints (owner cancel; worker cancel-request; admin/support cancel) with reason + audit | Q01, Q05, Q38–Q39 | Per-date / selected / whole-posting (D05); role + tenant checks (403); concurrent cancel vs payment; idempotent retry |
| B3 | Reopen-after-cancel (same shift, favourites first) + no-show slot release | Q15, Q16, Q11 | Reuses roster-release escalation pattern (`worker_actions.py`); no duplicate shift (R06) |
| B4 | Cancel notices (recipients + channels) incl. emergency escalation timer | Q05–Q06, Q38–Q39 | In-app + push; email for money/cancel; support alert after 30 min |
| B5 | No-show classification + confirmation queue (report → 48h reply → platform decides) | Q11–Q13 | Timer from shift start; both sides heard; late-arrival logging (Q12) |
| B6 | Incident ledger + ladder + badge + lookback (rolling 12m) + source freeze | Q26–Q31 | Public-only vs badge-only per source; badge auto-clears below 3 active incidents |
| B7 | Dispute/appeal case workflow (hours, pay, conduct, cancellation) with evidence classes + second-reviewer appeal | Q23–Q25, Q33 | Sensitive evidence support-only; 14d appeal / 5d answer clocks |
| B8 | P09 fee engine (7 bands, pharmacy local time, milder band at boundaries) + recipient + payout | Q02–Q04, Q49 (legal review), Q22 | Replaces legacy 10/20; per-occurrence selection; idempotency key + persisted obligation; no charge before disclosure (Q47) |
| B9 | Booking-fee refund/credit engine + approver workflow | Q19–Q21 | Finance/support approval with reason; F04 late-payment rule |
| B10 | Ratings: approved-timesheet gate; internal-vs-marketplace separation; reliability score; RatingReport admin queue | Q35–Q36, Q42 | Per-shift vs relationship decision; report → review → outcome visible to reporter |
| B11 | Completion state (timesheet approved or auto after 48h) + history with cancelled/expired/no-show status + scoped reasons | Q32, Q37, Q34 | AHPRA-cancelled rows retained as "cancelled", not deleted (fixes C5) |
| B12 | Mutual-agreement + exemption flows (evidence intake, retention, waiver record) | Q08–Q10 | Health evidence minimum-necessary, support-only, deletion schedule |
| B13 | Pharmacy private block list | Q43 | Worker stops seeing that pharmacy's shifts; never public |
| B14 | Worker reservation withdraw (pre-payment, no incident) | Q40 | Releases slot immediately; no incident (D01) |
| B15 | Suspension/deactivation process per Deactivation Code (notice, review, response, appeal) | Q30 | Do not build before Q30 is decided |

Cross-client tests required for each: normal case, edge case, retry/concurrency (double cancel, cancel-while-paying, double approve), denied role / wrong tenant (403), payment + notification side effects, and Web vs Expo parity (same backend rule, both clients).

---

## 8. Limitations, partials and what was NOT verified in this pass

- **No rate limit hit.** Nothing is marked NOT RE-VALIDATED for that reason.
- **PARTIAL — CX-Q33 / CX-R01 (timesheet half):** the "no escalation to support" claim is verified by absence (no dispute/appeal code). The manager-correction / worker-comment / actual-vs-planned timesheet behaviour was taken from the Oct description and **not** re-opened line-by-line at this head. Owned by GM-09 (timesheet/payroll) for full re-trace.
- **PARTIAL — LA-P01 (payment reset):** offer/assignment side verified fixed; `Shift.payment_status` / fulfillment-checkout reset after an AHPRA cancel was not found in `cancellation.py` and not traced elsewhere. Needs a GM-13/GM-17 cross-check.
- **NOT RE-TRACED — D03 reservation-expiry scheduler:** the old `shifts/reservations.py` no longer exists in the `backend/shifts/` listing; reservation handling moved to `backend/billing/checkout_reservations.py`. The auto-expiry beat/scheduler was not verified at this head. D03 is a carried decision, not a re-validated mechanism — GM-13 owns the full re-trace.
- **NOT RE-TRACED — LA-P03 (chain/org AHPRA gate):** belongs to GM-02/GM-04; carried unchanged from #184.
- **Screens not opened line-by-line:** Vite roster pages and Expo `my-roster.tsx` / ratings surfaces were verified at API level (the rules are backend-enforced and identical on both clients); exact button labels and empty states were not re-checked. No web/Expo rule difference was found in any GM-15 rule.
- **Search scope note:** `search_code` searches the default-branch index; every behavioural claim above was instead verified by reading the file at `refs/pull/249/head` (SHA `97c4543e`) via `get_file_contents`, or is explicitly marked as search-only (absence claims for no-show/appeal/incident, corroborated by the file listings).
- **No live testing:** no builds, tests, browser or device runs. Findings are from reading source only, same as the Oct audit.

## 9. Per-question source links (head `97c4543e`)

Base: `https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/`

- Cancel absence / lifecycle: `backend/shifts/urls.py`, `backend/shifts/lifecycle.py`, `backend/shifts/deletion.py`
- Roster cover + dead end: `backend/shifts/worker_requests.py`, `backend/shifts/models.py:827-887` (`WorkerShiftRequest`), `backend/workforce/roster/worker_actions.py:55-63,353-413`, `backend/shifts/history.py`
- AHPRA cancel: `backend/shifts/cancellation.py`, callers `backend/onboarding/verification/state.py`, `backend/onboarding/feature_port.py`
- Money: `backend/billing/urls.py`, `backend/billing/views.py:140-196`, `backend/billing/shift_payments.py`, `backend/billing/release_guards.py`, `backend/billing/test_cancellation_policy_evidence.py`, `backend/billing/checkout_reservations.py`, `shared-core/src/domains/billing/api.ts`
- Terms: `backend/shifts/engagement.py: build_shift_engagement_terms, shift_engagement_terms_version, freeze_accepted_terms`
- Offers: `backend/shifts/offers.py:157,182-190,677-726`, `backend/shifts/models.py:668-673`, `backend/shifts/finalize.py`
- Ratings: `backend/ratings/views.py`, `backend/ratings/models.py`, `backend/ratings/admin.py`, `backend/talent/views/explorer.py:63-82`
- Timesheets/history: `backend/workforce/timesheet_transitions.py`, `backend/shifts/lifecycle.py:131-175`, `backend/shifts/my_shifts.py`
- Decisions/docs: `docs/qa/RELEASE_DECISIONS_20261102.md`, `docs/qa/BOUNDED_CANCELLATION_NOTIFICATION_20261030.md`, `docs/qa/launch-grill/AUDIT.md` + `questions.json` (PR #184 head `c786a4b8`), Issue #250, PR #249 head `97c4543e`
