# Phase 6 B02 — existing Stripe extra-seat quantity changes

Existing purchased add-ons are now adjusted via the existing Stripe subscription's price-item quantity rather than starting a second checkout. Provider customer, active status and unique EXTRA_SEAT_PRICE item must match the local billing account. UPSIZE/DOWNSIZE to five base seats uses Stripe proration rules `create_prorations` and an error-if-incomplete payment policy; no immediate manual refund is promised. The base subscription ID is preserved. The local count is changed only after the provider confirms the new quantity.

Added webhook reconciliation for exact matching `customer.subscription.updated` events, including base inactive/active and add-on quantity. Targeted regression tests for upsize, zero extra, replay, unrelated customer and invalid quantity. **Exact-head CI and provider sandbox integration required before production**. No live subscriptions modified or deployment. NO-GO.

Stripe update behavior: https://docs.stripe.com/api/subscriptions/update
