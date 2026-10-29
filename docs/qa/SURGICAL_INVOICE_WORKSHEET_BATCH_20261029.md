# Surgical invoice worksheet follow-up — 29 October 2026

## Source and outcome

Parent: `47c391df0d1205f75f4ba59ab7584b4025100b46` on
`fix/surgical-backend-consistency-20261029`, stacked on completed E17
`0e2a4a14344492cddab1ed2998c14340d538ad30` in draft PR #213.

The history review identified a mismatch between the worksheet's declared scope
and its actual invoice selection. Retained external compatibility invoices can
have a null request key, empty finance calculation metadata and Sent/Paid status.
The accrual worksheet tried to read their missing calculation keys and returned
HTTP 500. Imported managed invoices are a different category: the consolidation
migrations gave them request keys and calculation snapshots.

**Correction:** add `request_key__isnull=False` to the worksheet's existing common
Invoice queryset. This is the only production-code change. Both cash and accrual
now honor the existing managed-invoice boundary. Calculation, status, ownership,
dates, expense-credit rules, response shape and exclusion-count semantics remain
with their existing owners.

The companion finance guide is reconciled with the implemented revision workflow,
canonical invoice identity, migrated/compatibility distinction, active web/mobile
routes, retained receipts and current email delivery contract. No schema, dependency,
client, GST-default, rounding, super, engagement or acceptance policy is changed.

## Invariant and route review

**A worker's worksheet includes eligible managed service invoices and their actual
recorded receipts; unmanaged compatibility records cannot enter it.**

| Path or state | Protection / preserved behavior |
| --- | --- |
| Shared finance worksheet URL | `worker_finance.urls` routes `/api/v1/finance/bas-worksheet/` to `bas_worksheet`; web and mobile call this endpoint through the shared finance API. |
| Common invoice selector | Retains authenticated worker ownership, service-invoice kind and non-void state; now also requires a managed request key. |
| Accrual branch | Retains Sent/Paid and inclusive invoice-date range, then reads stored calculation totals. Unmanaged rows are excluded before those reads. |
| Cash branch | Retains actual Payment date and sales/GST allocations. It does not require the current invoice revision to remain Sent/Paid. |
| Imported `legacy_snapshot=True` invoice | Remains eligible when managed. The migration flag is not an exclusion rule. |
| Imported Paid status without receipts | Does not fabricate a cash receipt, amount or date. |
| Null-key row with calculation data or receipts | Remains excluded on both bases; incidental metadata does not establish management. This test is a controlled persisted-state probe, not a demonstrated ordinary cash-path incident. |
| Excluded legacy count | Preserves the existing all-time, owner-scoped count of null-key invoices, independently of reporting period/status/kind/void state. |

No new selector service or second reporting implementation is introduced. A
missing-key fallback to zero would conceal inconsistent metadata and would not
enforce the actual ownership/management contract.

## Failing-first and green evidence

The new `worker_finance.tests.test_worksheet` module uses the real HTTP endpoint
under both the isolated finance fixtures and production application models.

| Selection | Observed result |
| --- | --- |
| Four new endpoint tests against unchanged parent production code | Three expected failing assertions across two methods: the accrual HTTP 500, and inappropriate accrual/cash inclusion of a controlled unmanaged metadata/receipt fixture. The two positive preservation methods already passed. No setup errors/skips. |
| Four new endpoint tests after the filter, isolated settings | 4 passed, no skips. |
| New tests plus existing real send/payment/unsent-revision receipt control, production models | 5 passed, no skips. |
| Complete isolated finance package after implementation/review | 57 run: 49 passed, 8 expected production-model skips; no failures/errors. |
| Migration drift | No changes detected. |
| Independent boundary/test review | No material correctness gaps found. |
| Whitespace | `git diff --check` passed. |

The tests retain imported Sent and Paid snapshots, a Paid snapshot without invented
cash evidence, actual receipts, the Draft-revision receipt workflow, worker scope,
invoice-date versus receipt-date boundaries, document kind, void state and the
existing exclusion count. They do not send real messages or call external services.
Selections overlap and are not a unique-test total.

Reproduction and targeted commands:

```bash
python backend/manage.py test worker_finance.tests.test_worksheet \
  --settings=worker_finance.tests.settings --noinput -v 2

python backend/manage.py test worker_finance.tests.test_worksheet \
  invoicing.test_integrity.AcceptedShiftInvoiceIntegrityTests.test_cash_receipts_survive_an_unsent_invoice_revision \
  --settings=core.contract_test_settings --noinput -v 2

python backend/manage.py test worker_finance.tests \
  --settings=worker_finance.tests.settings --noinput
```

The existing CI workflow already discovers `worker_finance.tests` with both
settings, so the new module needs no workflow edit. The new worksheet cases were
run locally on SQLite; PostgreSQL results from other configured suites must not
be presented as execution of these new cases.

## Publication and remaining boundaries

The final commit, tree and current-head hosted results are recorded on PR #213 and
in the living surgical plan after publication. Earlier-head successes are historical
evidence only. The known mobile dependency audit and full provider/native/device
acceptance remain separate; this patch does not repair or waive them.

Rollback is a revert of this additive patch, with no data conversion or migration.
That would restore the unmanaged-invoice worksheet defect; earlier delivery,
accepted-source and E17 work remains in the parent.

No merge, deployment, live provider call, data cleanup or change to the owner's
Windows worktree/job memory is part of this batch. GST/default/rounding policy and
conditional billing/time-calculation extractions remain separate planned work.
