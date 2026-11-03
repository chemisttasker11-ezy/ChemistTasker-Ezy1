# Phase 5 — financial integrity and concurrency red-contract suite

Frozen main: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Nine isolated Django HTTP tests added without touching production code.

- **C004-N2** no offer/slot selector may not pay quantity=1 when two workers await payment; valid explicit offer check bills one.
- **B70/F08-N1** repeated invoice subscription setup must not create a second Stripe subscription for the same account; provider mocks only.
- **F08-N2** subscription.updated unpaid must revoke overdue entitlement.
- **B68** unknown subscription invoice for an existing customer may not activate/bind unrelated subscription; recognized matching subscription positive control.
- **B69** same cancellation payment_intent delivered in different event IDs must not record two paid penalties.
- **F01-N3** accepted-awaiting-payment worker offer must not be deleted by generic DELETE.
- **F08-N5** account deletion must not leave active recurring base and extra-seat subscriptions.

Tests use a fake Stripe constructor or a synthetic event plus mocked signature verification; this does not assert live provider consistency or Stripe sandbox acceptance. No real charges. Expected negative tests turn RED against uncorrected frozen main. Positive-control failure => fixture/test invalid. S3 classification only after exact-head workflow log inspection. No migrations, deployments, or remediation on PR200.
