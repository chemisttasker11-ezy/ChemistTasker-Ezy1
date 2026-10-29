# Payroll activation and the timesheet-period freeze

30 October 2026, Australia/Brisbane. Fixed parent: draft #226 at
`912d26b9470dbb7b2226d7b1d4b60e36a3bc9f73`.

## Protected rule and reproduced defect

Deferred activation must not change settlement for an occurrence whose timesheet period
has already been locked. The manager must use the existing reasoned correction,
recalculation, review and adjustment workflow. A retry that changes nothing still succeeds.

Six new real-HTTP contracts ran with the unchanged parent runtime. Three tests failed,
with four failing assertions including both pending-offer subcases: activation returned
200 after a genuine reviewed manifest was locked, and pending slot/whole-shift offers
could also be activated for that locked date. The successful controls established that
unrelated pharmacies and unchanged retries work and the worker cannot act as manager.

The previous batch correctly preserved old manifests. It did not make changing live
settlement after the freeze safe. This continuation makes the correction workflow the
required route for these activation writes; it changes no wage, Award, tax or fee policy.

## Ownership and locking

`shifts.payroll.activation_work_dates` derives dates from changed assignments and the
accepted occurrences that finalization would create. Slot selection and explicit dates
narrow recurring offers; whole-shift offers retain finalization's complete recurrence
selection, even when their snapshot lists only each slot's first date. Existing pricing
expansion is consumed without changing its rules.

The shift-owned lifecycle event remains inside the activation transaction. Workforce
locks existing matching periods in primary-key order with `FOR NO KEY UPDATE`, checks
their current status, and then persists projection invalidation. A locked period raises
a domain validation error. The HTTP owner explicitly rolls back the transaction and
returns 409 with `code=locked_payroll_period`, the affected period IDs and the correction
instruction. It does not return from a failed atomic write with changes committed.

The offer lock now targets only its own row. Locking joined users/pharmacies is unnecessary
for this activation and can interfere with foreign-key checks during concurrent period
work. The unchanged offer-row lock serializes competing activation requests. The existing
after-commit rebuild callback stays robust; durable invalidation failure remains fatal.

For an existing period, either activation acquires the period lock first, marks the
timesheet dirty and prevents a stale freeze, or freezing wins and activation rolls back.
No existing manifest is rewritten. After explicit correction, the ordinary builder and
approval flow produce the new revision, and locking records the superseded manifest hash.

## Writer and caller map

| Entry point / writer | Guard or coverage boundary |
| --- | --- |
| `shifts.offers.ShiftOfferViewSet.activate_payroll` | Offer-row lock; existing real manager/opt-in/accepted-offer/profile/review guards; accepted date projection; same-transaction workforce refusal and rollback. |
| `workforce.signals.payroll_settlement_changed` | Ordered existing-period locks and current LOCKED status check; durable dirty marker; robust after-commit queue dispatch. |
| `workforce.timesheet_transitions.lock_period` | Existing period lock, dirty/approved revision checks and frozen routing; shares the conflicting lock with activation. |
| `correct_locked_period`, `build_timesheet`, `approve_timesheet` | Existing manager/reason audit, superseded manifest history, recalculation and review; exercised end to end before adjustment export. |
| Vite and Expo confirmed/public shift pages through Shared Core | All four handlers display the transport error message and keep the offer on failure. `shared-core/src/transport/errors.ts` preserves the structured 409 detail. No transport/UI change is necessary. |
| Roster assignment serializer | Settlement/consent fields remain read-only to manager PATCH. Direct ORM/superadmin policy is not broadened by this endpoint change. |
| Later finalization (`shifts.finalize`), cover acceptance (`attendance.cover_terms`) and cover approval (`attendance.approvals`) | Separate source writers. This batch does not certify their assignment creation/settlement writes versus a period freeze. In particular, activating an unfulfilled offer while a period is open does not prove later fulfillment is safe after that period locks. These remain explicit bounded hardening candidates, not silently covered by the activation event. |

The period-lock claim covers periods that already exist and occurrence dates selected by
the booking contract. It does not claim range-lock protection against concurrently creating
new overlapping periods, every overnight attendance slice, or a universal model-write guard.
No migrations, task identity changes, schema relabeling or scanner exemptions are introduced.

## Regression evidence

The SQLite contracts exercise actual routing and manager authority, not a mocked permission:
locked work rollback, reasoned correction and adjustment, successful replay after lock,
unrelated pharmacy, worker denial, pending slot/whole-shift offers, selected recurrence
allowance and later whole-shift recurrence refusal. The earlier activation and timesheet
tests remain in the selection; the old locked-activation expectation is deliberately changed
from successful mutation to 409 and no rebuild.

Three PostgreSQL-only contracts use independent connections, real row locks and bounded
thread events. They force both orderings of activation versus freeze and simultaneous
activation retries. Instrumentation observes actual locking SQL or pauses inside the
already-locked owner; it does not replace database locks, transactions or the HTTP response.
Only background task transport is mocked. Lock/deadlock/setup errors fail the tests.

Local corrected-source validation:

| Check | Result |
| --- | --- |
| Membership/payroll, new activation contracts, timesheet state/projection, billing, invoice integrity, required holiday/Award/pricing, ownership and cold-start selection | **266 passed, four PostgreSQL-only skips**, 270 discovered; 23.155 seconds after setup. Three skips are the new real-row-lock races; one is the pre-existing PostgreSQL control. |
| Scanner regression suite | **13/13 passed**. |
| Graph, reviewed baseline, generated ledger and architecture-boundary audit | Passed: zero direct cyclic edges, 113 combined; no widened baseline. |
| Migration drift | No changes detected. |
| Offline holiday reconciliation | Passed; eight jurisdictions, 56 local regions, ten part-day records. Pending declarations remain explicit. |
| Whitespace / final-source stability | Passed; all 872 Python source hashes remain unchanged during validation. |

Docker/PostgreSQL binaries are unavailable locally. SQLite does not prove locking behavior;
the new PostgreSQL job and Full Isolated QA must pass on the published source. Parent #226 is independently
green: Full Isolated QA `40887999239`, Shared Core `40887944891`, E2E `40887944656`,
serializer/finalization and security all succeeded. Its PostgreSQL job `123496615446`
passed **474/474**, no skips. Those results are not passes for this new source.

## Remaining release work

P4 duplicate paid checkout obligations remain unresolved and require persisted reservation,
provider-attempt recovery and explicit expiry/supersession. P5 cancellation policy and P7
outage candidates retain their previous evidence status. P8 is improved specifically at the
deferred activation entry point; the other writers in the table require their own bounded
assessment. M4 remains in progress. M5 still requires a fixed candidate, its applicable
gates and authorized deployed recovery/device/provider acceptance. No merge or deployment.
