# Durable fulfillment checkout recovery

30 October 2026, Australia/Brisbane. Parent: draft #228,
`89a63155e99d67f64398ff670530b35a779cc607`. Source work for M4/P4; no deployment.

## Protected behavior

One payable accepted offer remains one fee unit. The existing price IDs and AUD fees
($30/$15 locum, $80/$40 other employment) are preserved. Occurrence reservations
prevent competing candidates, overlapping subsets/supersets, whole-shift versus slot
selections, actor/platform changes and day boundaries from creating another collectible
session for the same work. Disjoint occurrences remain independently payable.

Preparation locks the shift and selected offer rows, then commits the immutable provider
parameters and occurrence reservations before contacting Stripe. Each persisted UUID has
one stable provider idempotency key. Lost acknowledgements retain UNKNOWN ownership;
unchanged retry or explicit resume uses exactly those stored parameters. After 23 hours
without an acknowledged provider identity, automatic creation stops for reconciliation,
before Stripe's normal idempotency retention boundary can permit another session.

The new payer-authorized resume and expiry actions do not grant worker billing access.
Web and Expo expose explicit recovery choices. Expiry releases reservations only after
the provider identifies that exact session as expired and unpaid. A timeout, mismatched
identity, completed payment, or local paid transition retains the reservation. Starting
a replacement is an explicit action after successful expiry, with a new UUID/key.

The shift-owned pre-fulfillment event lets billing protect free and pill booking through
the same finalizer, inside its existing shift lock. A refused pill debit rolls back.
The deletion guard also checks durable checkout ownership even if an offer is withdrawn
or the shift's legacy payment flag changes. No dependency from shifts into billing is added.

Signed paid intents are still ledgered independently. New attempts validate the frozen
selection/account metadata, provider session identity, AUD currency and expected amount.
Mismatches are retained with a durable reconciliation reason and refund-required alert;
they cannot book unrelated work. Event/intent replays do not repeat booking or alerts.
A late payment after confirmed expiry cannot steal work reserved by a replacement or
expire that replacement's offer. Full refunds clear the reconciliation-required flag;
partial/out-of-order refund handling keeps its existing monotonic amount contract.

## Compatibility and rollout boundary

Migration 0005 is additive: two reconciliation fields, checkout attempts and reservations.
Historical migrations, model labels, prices, accepted rates, tax and payroll policies are
unchanged. Historical Stripe sessions without an attempt identity keep their existing
receipt/booking compatibility and late-payment recovery. They are **not retroactively
reserved**. Before enabling this version against real payments, operators must drain or
reconcile all pre-rollout collectible fulfillment sessions, reconcile historical duplicate
intents and verify all configured Stripe prices in the actual account. Deploying source
alone does not close that cutover requirement.

The unit fee is not redefined as one fee per recurrence. The historical no-slot fee fixture
is treated conservatively as exclusive whole-shift work. Reservations deliberately remain
held after payment/refund: a refund is not authorization to sell an already-booked occurrence
again. Reopening paid work or recovering an UNKNOWN attempt beyond the key window requires
operator reconciliation, rather than an automatic new charge.

## Evidence

The HTTP suite exercises provider acknowledgement loss, original-request replay, platform
conflict, alternate candidates, disjoint/whole/recurring selections, expiry/permission
refusal, free/pill rollback, deletion protection, paid binding, early webhook, duplicate
intent, invalid identity/currency/amount, and late payment against a replacement.

Three PostgreSQL contracts use independent connections while provider transport is held
in flight. They check a committed reservation is visible before acknowledgment, identical
requests share one provider key, and an alternate candidate cannot prepare a second
request. No database locks or atomic blocks are mocked. SQLite skips these contracts.

The first corrected-source selection passed 74 tests. The expanded 80-test selection
found one test-fixture URL error in the new pill-route case (404); the endpoint has been
corrected to the existing `/api/v1/pill-rewards/pay-shift/` route. This is not counted as
a passing expanded run. A subsequent 308-test run found six assertions in the existing pricing fixture because its fake provider response had no session ID. The fixture now supplies a unique session ID per shift; production identity checks remain strict. Final-source verification discovered **309 tests: 298 passed, 11 PostgreSQL-only skips**, 28.088 seconds after setup. This includes real Stripe SDK HMAC verification: a tampered payload is rejected and the original signed payload creates one payment/booking. The suite includes billing, rewards, invoice integrity, payroll activation/freeze, ownership, signal/startup and required holiday/Award/pricing contracts.

Shared Core's payment/recovery transport contracts passed (2), and its typecheck/build
passed. Web and mobile TypeScript checks passed; web UI ownership and architecture audits
passed. The graph remains zero direct cyclic edges and 113 combined edges; scanner tests
passed 13/13, migration drift and holiday reconciliation passed. Hosted PostgreSQL and
Full Isolated QA on this exact new source remain separate required evidence.

## Remaining operational acceptance

Real Stripe test-mode checkout/replay/refund/price checks and legacy-session drain are
open. The environment has no Stripe test credentials, staging login or SSH/config files.
No live transaction, real provider message, deployment or merge was performed. Staging's
public smoke script passed, but its health response does not expose a commit identity;
it cannot be treated as acceptance of this candidate. Real email-provider and physical
native-device acceptance remain separate from disposable SMTP and simulator tests.
