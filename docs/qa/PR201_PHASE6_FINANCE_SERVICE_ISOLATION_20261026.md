# Phase 6 finance isolation — 26 October 2026

- The central Pills ledger service now locks the payer row *before* reading the idempotency key and balance, so simultaneous shifts and credits cannot overdraw independently. This centralizes the lock already used by the per-shift payment endpoint, without changing the per-offer pricing policy.
- Replayed ledger keys are rejected if they would cross user, source, or shift rather than silently return another transaction.
- Subscription checkout events now lock and verify the exact local Stripe customer and reject stale events against a canceled account. Invoice paid and subscription deletion match the customer as well as subscription identity where provided.
- Added negative and positive tests for mismatched customers, late checkout after deletion, and legitimate inactive-account checkout.

Known limitation: a canceled subscription should be reactivated through a verified *new purchase flow*. The terminal canceled state currently ignores unsolicited late completion events. A full explicit re-subscription policy and real Stripe test-mode proration are separate acceptance requirements.

No migration or deployment. The targeted CI checks will provide the actual verdict; do not infer one from the commit.
