# Payroll source freeze and delayed paid fulfillment

Fixed parent: #231, `c4a4246a53203972f588b66cf9375ced3c8aca0d`.
This is a source repair for the previously agreed payroll freeze invariant. No merge,
deployment, live charge, new cancellation rule or automatic refund is authorized.

## Reproduced gap

The parent allowed a paid webhook to create a PAYROLL booking after the relevant
TimesheetPeriod had been reviewed and locked. It also allowed payroll assignment
creation, settlement edits after roster unpublication, and QuerySet deletion. The
baseline reproduction recorded four failures and one unchanged-save positive control.
A published-roster guard alone does not protect a separately locked payroll period.

## Repair and existing correction process

Supported model saves and deletion signals serialize the source change with the
existing period row, using NO KEY UPDATE in deterministic period order. The guard
covers PAYROLL bookings (rostered assignments or source-offer bookings), previous
and destination dates, old/new settlement terms, and overnight dates. Slot date,
time, break and recurrence edits affecting these bookings use the same guard.
Unchanged normalized saves remain allowed when ordinary roster guards permit them.
The activation bulk update retains its existing explicit payroll event. The roster
bulk move calls the guarded slot save before its assignment-date update. Supported
roster create/update, manual assignment, service/admin model saves, leave/swap saves,
and cascade/QuerySet deletions therefore reach the boundary. Direct SQL, arbitrary
QuerySet.update and bulk_create are not made safe by model.save; they are not exposed
as an alternative supported payroll mutation interface.

Open periods persist the existing needs_rebuild marker before the source write and
queue the existing rebuild after commit. A durable invalidation failure rolls back
source/payment work. An optional queue failure cannot erase the dirty marker.

A paid checkout arriving after freeze is recorded once, retains its reservation,
flags locked_payroll_period and leaves the selected offer pending. The signed webhook
returns 503 with a durable failed receipt, allowing the same event to be replayed
rather than collecting another payment. The existing manager correction with an
audit reason reopens review; replay books the original paid selection. Recalculation,
review and re-lock produce an adjustment referencing the prior immutable manifest.
A refunded/partially refunded payment is never used to resume booking. This does not
create a new correction endpoint or worker consent process. Operators still need to
perform/replay the existing audited process; provider retry retention is finite.

An offer is refreshed under the booking lock so payroll activation on another request
cannot be replaced with stale pre-activation terms. New checkout metadata binds the
original worker and occurrence selection. A later changed worker/date cannot redirect
that paid checkout. Old attempts without the new selection hash retain compatibility;
legacy open sessions must still be reconciled before rollout.

## Scope requiring a decision

Non-rostered emergency-cover recording without a source offer and ABN cover consent
keep their existing workflow. Extending the hard freeze to those records would need
an explicit decision on recording attendance, consent and later corrections. This
batch does not silently block them or create permanent memberships. Historical
payments without a persisted checkout attempt retain manual reconciliation; the
same-event automated payroll correction recovery applies to bound new attempts.

No rates, fee units, accepted eligibility, payroll opt-in, award data, invoice monetary
conventions or tax rules change. Existing correction authorization and reasons remain
mandatory. The original manifest is never rewritten.

## Verification

Focused source run: 86 tests, 79 passed and seven PostgreSQL-only skips. Expanded final source run: 297 tests, 282 passed and 15 PostgreSQL-only skips, including
roster lifecycle, invoice-independent booking, notification, holiday and pricing controls.
Migration drift, offline calendar validation and the graph ratchet passed.
PostgreSQL adds both real connection orderings (payment first / freeze first), plus
ABN cover preservation controls. Local SQLite cannot establish locking behavior.
Graph check: zero direct cycles; 113 retained combined cyclic edges, no growth.
Provider test-mode replay, deployed staging and physical-device evidence remain open.
