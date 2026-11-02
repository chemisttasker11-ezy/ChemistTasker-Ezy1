# Surgical batch F — consistent amounts on new managed invoices

## Scope and decision

Implementation starts at `9ed5dfade4901943b7c5134091c07b74057a250c` on `fix/surgical-backend-consistency-20261029`, based on completed E17 `0e2a4a14344492cddab1ed2998c14340d538ad30`. This follows the worksheet correction and invoice-history investigation in draft PR #213.

**Invariant:** a newly generated internal invoice adopted into finance has one monetary result across its canonical fields/lines, finance calculation, first revision and PDFs. Original accepted evidence, invoice identity and ordinary correction workflows remain intact.

The existing finance calculator remains the calculation owner for new managed service invoices: Decimal `ROUND_HALF_UP` line amounts, GST rounded per line, then summed. This batch projects that existing result into the canonical monetary fields during initial internal adoption. It introduces no tax engine, new default, schema, backfill or historical recalculation.

The retained external compatibility path remains separate. The invoice-time GST default question also remains separate: accepted registration evidence, current onboarding defaults and explicit invoice choices are different facts. This patch does not force them into one value or infer a legal tax treatment.

## Why this is the smallest justified correction

The 18 September finance introduction, `47e7568f2864bbf3756ff7fb094dbe3e1fc4cd43`, already established the current HALF_UP/per-line calculator. Initial adoption in `a6a094e598e4bbd977af201f7ddf94ddf4bfa914` rejected mismatched canonical and finance totals. The later editable-revision change, `8001d39e21200733d6dd15bcd567be1e8b922c7e`, removed that rejection while leaving two results on the same invoice. September consolidation imported historical amounts without recomputing them.

Current normal finance Save already calculates once, writes the canonical representation and records the revision. Initial legacy internal adoption calculates finance metadata but leaves the earlier canonical result. The correction belongs at that adoption boundary.

Using the full `write_canonical()` correction helper here would also rewrite names/customer snapshots, mark source rows modified and recreate manual rows. This patch instead updates only existing line `total` values and invoice `subtotal`, `gst_amount`, `super_amount` and `total`, in the existing transaction, before revision 1 is recorded. The ordered lines used to build the calculation are the same rows receiving its net amounts.

Copying the old aggregate amounts into a new managed calculation would retain another arithmetic policy in the active editor. A subsequent unchanged Save/preview would recalculate it. Projecting the existing owner avoids that second policy and avoids a new per-line tax allocation algorithm.

## Concrete amount changes

All examples hold the submitted registration and tax choices constant and use exclusive prices. These values describe new managed internal generation, not a rewrite of existing documents.

| Inputs | Earlier canonical result | Existing finance result, now projected consistently |
| --- | --- | --- |
| One taxable $70.05 service line | GST $7.00; payable $77.05 | GST $7.01; payable $77.06 |
| Two taxable $70.06 service lines | GST $14.01; payable $154.13 | GST $14.02; payable $154.14 |
| Two taxable $70.04 service lines | GST $14.01; payable $154.09 | GST $14.00; payable $154.08 |
| Untaxed $560 service plus manual 1.50 × $3.03 | Extra $4.54; payable $564.54 | Extra $4.55; payable $564.55 |
| Untaxed $560 service plus $9.09 extra discounted 50% | Extra $4.54; payable $564.54 | Extra $4.55; payable $564.55 |
| Untaxed $560 service plus manual super 1.50 × $3.03 | Super $4.54; payable $560.00 | Super $4.55; payable $560.00 |

The prior B1 characterization deliberately preserved manual/internal $4.54 within that earlier patch's scope. F changes the new managed internal expectation to $4.55 and retains the external compatibility expectation of $4.54.

## Preserved contracts and routes

| Route or state | Protection / boundary |
| --- | --- |
| Legacy internal generate → adoption | The existing calculator's result is projected before the response and revision are created. No second invoice is created. |
| Canonical source/manual rows | Existing IDs, assignment links, quantity/rate/discount, descriptions, categories, tax/super flags and modification flags remain. Only calculated totals change. |
| Accepted evidence / E17 | Accepted snapshot and timestamp, occurrence identity, settlement route and worker consent are unchanged. |
| Normal finance Save/revision | Existing calculator and canonical writer remain unchanged; explicit corrections still create new revisions. |
| Already managed / imported snapshot | Existing request-key early return prevents adoption recalculation or revision changes. |
| Unmanaged external create/edit | Existing legacy calculation and null-key management boundary remain. |
| Managed legacy edit | Existing finance redirect/refusal guards remain; no alternate recalculation is added. |
| Generation response / canonical renderer | Read the synchronized canonical amounts. |
| Finance current/revision PDF, payments and worksheets | Continue using the same stored finance calculation or receipt allocations. |
| Generated super contribution | The existing materialized contribution row remains fixed during adoption; automatic super is not recalculated from the newly rounded manual-charge base. |
| Administrative direct edits | Outside the normal application Save/generate invariant; no new admin policy is introduced. |

Generated-super control: a $70 eligible service plus a 1.50 × $3.03 eligible extra materializes $8.94 super at 12% using the existing generation path. Adoption aligns the extra to $4.55 but retains that explicit $8.94 contribution and `automatic_super=0.00`. Removing the contribution row and recalculating $8.95 would change the super determination, which this patch avoids. Fractional/discounted manual super items still receive their own existing finance line rounding.

## Verification

Only targeted checks ran while implementing this patch. The production change is 12 additions and one deletion in `worker_finance/services.py`; the calculator, bridge, models, clients and workflows are unchanged. Two independent source reviews approved the actual diff without a remaining material correctness or preservation issue.

| Executed check | Observed result |
| --- | --- |
| Six new/changed methods against unchanged parent production code | 31 expected monetary assertion failures across five methods; no errors/skips. The managed/imported no-op method passed. Runtime after schema setup: 0.856 seconds. |
| Same six methods plus nine existing endpoint/source preservation controls after the fix | 15 passed, no errors/skips. Runtime after schema setup: 1.468 seconds. |
| Existing pure finance calculator tests | 15 passed, no skips, 0.001 seconds. Inclusive/exclusive prices, tax codes, discounts, manual/automatic super and receipt rounding retain their current rules. |
| Migration drift | `makemigrations --check --dry-run --settings=core.contract_test_settings`: exit 0, `No changes detected`. |
| Whitespace | `git diff --check`: clean. |

The failing-first run reproduced the canonical/response and legacy PDF discrepancy; the stored finance calculation and revision values already matched the chosen convention. Green verification used the real generation HTTP endpoint, production models, database persistence and both actual PDF renderers. The local database was disposable SQLite. This is not invoice-specific browser, PostgreSQL, device or provider acceptance.

New/changed methods in `invoicing.test_integrity.AcceptedShiftInvoiceIntegrityTests`:

- `test_adopted_manual_line_matches_finance_and_external_rounding_stays_unchanged`
- `test_adopted_gst_rounding_agrees_across_saved_representations_and_pdfs`
- `test_adopted_discounted_extra_uses_the_saved_finance_amount`
- `test_adopted_manual_super_rounding_stays_separate_from_worker_payable`
- `test_adopted_generated_super_keeps_the_existing_fixed_contribution`
- `test_adoption_does_not_recalculate_existing_managed_or_imported_invoices`

The nine existing controls cover generated professional half-cent parity, accepted partial-hour precision, duplicate assignment billing, rollback/retry at the adoption boundary, explicit manual super, finance corrections preserving source identity, receipts surviving an unsent revision, separation of current GST defaults from accepted evidence, and original evidence through initial/later corrections. The rollback control injects failure at the adoption boundary; it does not claim a failure injected after the new bulk update. The imported no-op case uses a migration-marked persisted fixture and does not replay the historical migration.

The local runner used the repository's public CI environment placeholders and invoked the ordinary Django runner with those 15 named methods, `--settings=core.contract_test_settings --noinput`. The calculator command was `python -m unittest worker_finance.tests.test_calculations` from `backend/`. Existing CI selects `invoicing.test_integrity`, so all five added methods and the strengthened existing method are discovered without a workflow edit. The earlier B1 manual/external method is intentionally renamed by this batch.

Local evidence logs: `/tmp/ct-monetary-baseline-red.log`, `/tmp/ct-monetary-targeted-green.log`, `/tmp/ct-monetary-migrations.log`. Broader automatic checks start after the completed patch is published; their final source/job results belong in PR #213 and the living plan, without a status-only source commit.

## Separate follow-ups

The active mobile generator has independent pre-save calculations. Source inspection found it drops accepted GST/super applicability while mapping preview rows, rebuilds applicability by category, and includes super incorrectly in its local payable calculation. Its automatically created super row is also submitted as a custom item. The retained unmanaged detail screen has independent totals too. These are source findings, not a browser/device reproduction, and need a separate client patch covering submission as well as display.

Normal post-generation mobile navigation opens FinanceWorkspace, which uses server calculation/balance/revision data. Managed legacy detail is intercepted by the finance compatibility guard. Thus no client edit is required for the saved managed-invoice invariant in this batch. Full pre-save-to-save or all-client monetary parity is not claimed.

Relevant routes: `frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx`, `InvoiceList.tsx`, `InvoiceDetail.tsx`; finance editors call the server preview. Backend compatibility guards are in `worker_finance/legacy.py` and mounted before generic invoice URLs in `core/api_v1_urls.py`.

The separate mobile dependency audit, provider/native/device acceptance, and previously recorded intermittent observations retain their own status. No merge, deployment or live provider call is part of this batch. Final source identity and automatic CI results are recorded in PR #213 and the living plan after publication.
