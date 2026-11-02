# Live shift collection release controls

New live fulfillment and cancellation collection are restricted by default. Test-mode
staging remains available; APP_ENV=staging refuses live Stripe keys during startup.
The server checks mode and capability before durable checkout preparation, provider
creation and resume. A malformed/blank key is not test mode. The checks classify
configuration only; provider-account validity is verified separately during acceptance.

| Capability | Setting | Default | Before enabling live |
|---|---|---|---|
| New fulfillment collection | BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED | false | Owner recovery/cancellation decisions and exact-release test-provider acceptance |
| New cancellation collection | BILLING_LIVE_SHIFT_PENALTY_ENABLED | false | Reviewed occurrence/timezone policy and persisted idempotent cancellation obligation |

Use boolean environment values through the reviewed deployment configuration. No
real credentials belong in source or examples. Changing a flag requires a recorded
release decision and rollout, not a client payload. Unknown operation kinds refuse.

Existing signed webhooks, expiry, reconciliation and refund accounting remain active.
This control does not invalidate previously issued provider URLs: inventory, expire
or reconcile those collectible sessions before a live cutover. Disabling collection
must never mean dropping money already received. Subscription operations and owner
recording of externally paid invoices retain their existing authority checks.

See RELEASE_DECISIONS_20261102.md for outstanding commercial decisions. The historical
date-based billing-state selection does not override these capability controls.
Contract tests use a nonfunctional test-prefixed fixture key and mocked providers;
production defaults remain blank/off. Actual test-mode checkout/replay/refund evidence
is still required before real payments, and is not established by unit tests.
