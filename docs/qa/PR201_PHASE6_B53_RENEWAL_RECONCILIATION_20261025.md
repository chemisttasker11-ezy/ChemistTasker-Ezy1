# B53/B68 subscription state reconciliation

The B53 first pass blocked every invoice.paid event on inactive records, which would also prevent a legitimate recovery from payment failure (historical B68 positive contract). Use the already-defined `OwnerSubscription.status='canceled'` tombstone on `customer.subscription.deleted`; late invoice cannot reactivate canceled state. `inactive` remains recoverable by an exactly matching invoice payment. No migration required because `canceled` is an existing status choice.

This correction supersedes the earlier B53 provisional handling; targeted tests and the historical B68 negative/positive contract should be run before certification. No deployment.
