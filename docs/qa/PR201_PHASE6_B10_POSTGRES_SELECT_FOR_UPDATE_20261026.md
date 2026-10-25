# Phase 6 B10 PostgreSQL lock repair — actual failing CI evidence

Exact PostgreSQL 16 two-connection acceptance on PR201 run
https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40204595640
identified `NotSupportedError: FOR UPDATE cannot be applied to the nullable side of an outer join`
in `PillRewardsViewSet.pay_shift`. Both same-owner shift payments returned
uncaught errors due to a `select_related(pharmacy__owner)` nullable outer join
and unqualified `select_for_update()`; this is not a fixture error.

Correction: `select_for_update(of=("self",))` serializes only the shift row,
while leaving the related pharmacy/owner retrieval and existing owner capability
checks unchanged. Central `_create_ledger_entry` separately locks the payer
user row, so same-owner **different shift** charges remain serialized against
one real ledger balance.

Real PostgreSQL test must now prove one 200, one insufficient-balance 400,
no double spend, and exactly one offer finalized. B57 partial/full refund
and B69 distinct webhook IDs/same payment intent tests already completed
in the same run; rerun them at the repaired exact SHA.

No schema/migrations or deployment. NO-GO.
