# PR201 B57 refund reconciliation

`charge.refunded` callbacks were acknowledged without reconciling the local ShiftPayment. Added cumulative refunded amount, explicit partial/full refund states, and payment-intent-scoped update within the existing atomic webhook receipt. Older events cannot decrease the recorded refund.

Regression tests cover partial refund, full refund, stale event and unrelated payment intent. Migration `billing.0003` introduces additive amount field and status choices; **migration is committed only and not applied to staging/production**. Required before release: migration rehearsal on isolated populated snapshot, provider webhook scenarios, adjustment of downstream aggregate/accounting adapters and exact-head CI. No deployment or merge. NO-GO.
