# Phase 6 B69 — database-enforced payment intent uniqueness

Added a conditional unique constraint for non-null, nonblank Stripe PaymentIntent IDs to ensure distinct webhook event IDs cannot create duplicate paid financial rows, even on PostgreSQL concurrent first arrival. `get_or_create` remains the handler's deduplication contract; missing PI now errors for paid checkout rather than storing a non-deduplicable row.

**Migration safety:** `billing.0004` scans for duplicate nonempty PI values and aborts before schema modification; it never silently deletes or combines historical money movements. Run on a populated database snapshot and reconcile any duplicates explicitly before applying in production.

Tests cover multiple event IDs and database duplicate rejection. Provider live reconciliation and PostgreSQL two-thread HTTP contract remain acceptance checks. No deployment or migration applied to production. NO-GO.
