# Specification draft — complete shift lifecycle

**Stage:** working specification, NOT yet accepted; parent PR #181 SHA `9d1c6b7`.

## Goal
One traceable, domain-owned shift lifecycle from draft through discovery, applicant engagement, offer, payment/confirmation, roster/attendance, replacement/cancellation and settlement/history, with parity across Vite/Next/Expo.

## Existing constraints (preserve)
- Existing Shift, ShiftSlot, ShiftSlotAssignment, ShiftOffer, WorkerShiftRequest and RosterActionAudit are the canonical domain records; keep existing Django app labels and migrations. Avoid a second lifecycle table or a parallel marketplace.
- Booking and payment are distinct; `ACCEPTED_AWAITING_PAYMENT` is not yet an assignment under the current source code.
- Direct staff roster assignment is not equivalent to external worker engagement acceptance. Save accepted immutable engagement terms.
- Role- and pharmacy-scoped permissions, verified-eligibility gates, private booking, published-rate redaction, roster publication and worker request preservation remain authoritative.
- Exactly one worker assigned to an occurrence, no duplicate accepted outcomes or duplicate platform charges. Actual database behaviour needs PostgreSQL race tests.
- All irreversible transitions require audit and truthful notification to the affected actors; never silently hard-delete paid/confirmed work before defining an explicit cancellation policy.
- Timezone/overnight and recurring occurrence identity are explicit; never infer state from a UI tab alone.
- Stripe success **webhooks** and audited billing records are the settlement authority, not browser success redirects.

## Critical unresolved contracts
- Payment commitment, deadline, expiry and late webhook (D01–D03).
- Cancellation actions/permissions/granularity, notifications, penalties and reversals (D04–D11).
- Reminder/no-show/completion/rating eligibility (D12–D15).

## Example acceptance scenarios
1. Given two candidates for a single occurrence, when both attempt confirmation or a late webhook settles, then exactly one legally valid final booking exists, with correct offer states and payment records.
2. Given an unpaid accepted offer, when the agreed payment deadline passes, then the system takes only the explicitly approved audited action and updates owner/worker views consistently.
3. Given a worker cover request, when no manager decision exists, their assignment remains unchanged; approved replacement/release safely adjusts the same Shift/Slot.
4. Given partial cancellation of recurring work, unaffected occurrences, frozen rates and booked workers remain unchanged.
5. Given failed or replayed webhook processing, side effects and financial records are consistent and idempotent, with a safe retry path.
6. Given cancellation or replacement before the scheduled reminder, only currently confirmed affected workers receive the correct message.
7. Given role- or tenant-invalid cancellation, payment or worker reassignment requests, the server rejects them without leaking unrelated pharmacy data.

## Convergence rule
`spec.md` and `plan.md` become implementation authorities **only after owner decisions** resolve their indicated branch(es). Iterate tasks, implement and converge on scoped branches. A "spec converged" report is not release acceptance: the evidence register and Senior Package Testing remain compulsory.
