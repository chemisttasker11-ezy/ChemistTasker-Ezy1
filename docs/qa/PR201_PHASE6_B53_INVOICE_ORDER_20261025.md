# Phase 6 B53 subscription invoice ordering — PR201

The existing Stripe invoice.paid handler used fallback customer matching and set local subscription status active after a deletion, undoing the cancellation when events arrived out of order. This also allowed unrelated subscription invoices under the same customer to affect the wrong local entitlement.

Changed invoice.paid reconciliation to require exact base/extra Stripe subscription-ID match. Inactive local subscriptions cannot be reactivated by a late invoice; a new subscription checkout remains the separate entitlement creation path. Distinct event receipts and synthetic provider signature tests preserved.

Copied the audit's real Django webhook positive/negative B53 contracts to PR201. Targeted CI required before marking VERIFIED. No live provider call, migration, deployment, merge or PR200 edit. NO-GO.
