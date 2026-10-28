# Phase 6 B10 Pills payment unit and idempotency

Use the same unit policy as Stripe fulfillment checkout: **one charge per eligible selected accepted offer**, not once per shift. Existing endpoint accepts explicit offer_ids and slot_ids; maintain shift-ID-only requests only when exactly one offer is pending. Multi-offer ambiguous requests return 400 before a debit.

Lock the shift and payer row within one transaction and include every ledger debit, offer assignment and shift state change in the same atomic unit. Each offer uses a stable distinct idempotency key; duplicate requests cannot create additional debits. Insufficient balance rolls back all writes. Four positive/negative HTTP regressions added.

Historical legacy `shift:<id>:pill-payment` entries remain intact; any partially paid legacy shift requires reconciliation before replay under the new per-offer scheme. No live customer balances migrated. CI exact-head acceptance required. Release NO-GO.
