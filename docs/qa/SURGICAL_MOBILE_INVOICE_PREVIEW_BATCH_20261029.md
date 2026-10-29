# Mobile invoice generation preview — completed implementation and QA

**Date:** 29 October 2026, Australia/Brisbane.  
**Repository / draft PR:** `chemisttasker11-ezy/ChemistTasker-Ezy1`, [#213](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/213).  
**Integration branch:** `fix/surgical-backend-consistency-20261029`.  
**Parent:** `d3cd11ce16c8460f451cba057d589227e5b83dbc`.  
**PR base / completed E17:** `0e2a4a14344492cddab1ed2998c14340d538ad30`.  
**Recovery snapshot:** `a9a5a915f9e58feae8792da9db81aa9320c2df90` on `wip/mobile-invoice-preview-handover-20261029`.  
**Implementation:** complete; both final preview-boundary findings reproduced and repaired.  
**Release disposition:** draft / NOT MERGE-READY until applicable final-head gates and separate release acceptance are satisfied. This handover does not authorize merge, deployment or live provider operations.

The published source is the commit containing this handover. PR #213 and the existing living plan record its exact SHA and final hosted-CI results after publication. Earlier-head passing checks are not evidence for this commit.

## 1. Outcome and scope

The retained mobile invoice generator now displays amounts calculated by the existing server generation workflow. It retains accepted assignment facts, submits only deliberate custom rows, treats generated super separately from manual contributions, and requires a matching successful financial preview before Save. Internal generation remains managed finance adoption; external generation retains its legacy route and conventions.

The original isolated checkout was present at the recorded parent with all 17 working files. Those exact working files were copied into a separate writable checkout with SHA-256 equality checks; the recovery snapshot was not reapplied. Final review compared the copied patch to the original: only `generation_preview.py` and `test_integrity.py` changed during the continuation, before this handover was added. E17 and all preceding invoice, worksheet, delivery and timesheet-lock commits remain intact.

### Response to the architecture review

**Architecture status: partially consolidated.** PR #213 shares original accepted-assignment facts, reuses pharmacy-scope facts in targeted permission paths, and removes duplicate public-onboarding calls while retaining transaction-time verification. This batch additionally gives supported mobile preview and Save the same existing server calculation stages. It does not establish one financial convention for internal and external invoices.

A common eligibility-decision contract across public applications, booking, roster planning and attendance has not been implemented. It remains a separate architectural follow-up, justified by a concrete consumer when needed. Existing role projection, public booking authorization, roster validation, attendance admission and invoice-source eligibility have different contexts. Current public-application requirements must not be imposed retrospectively on accepted invoice work merely to make those decisions look uniform.

## 2. Protected business rules

1. Supported mobile input previews the accepted source facts and financial result that the existing generation route will save. Super remains outside worker payable.
2. Preview is read-only: it creates no temporary or persistent invoice, customer, line, revision, delivery or notification; changes no assignment; publishes no task, callback or email.
3. Malformed preview input produces controlled validation or a renderable response. Custom input cannot supply trusted accepted-source metadata.
4. A successful preview neither reserves work nor authorizes a later Save. Save locks and revalidates ownership, acceptance, pharmacy, routing and duplicate billing.

## 3. What the batch changes

### Mobile and transport

`InvoiceGenerate.tsx` consumes the adjacent executable `invoiceGeneration.ts` helper. Accepted rows retain assignment/shift/slot identity, supplied source amounts, accepted GST/super flags and read-only controls. Local origin distinguishes `assignment`, `custom` and `generated_super`.

Only deliberate custom rows enter the save payload. Generated super is displayed but is not converted to a manually modified contribution. Manual super stays editable/removable and follows the existing suppression rule. Internal extras default to Miscellaneous; additional internal ProfessionalServices rows are not offered because the established save route ignores them. Custom rows have a description field.

All monetary totals and displayed line amounts come from server decimal strings. Pending, rejected or superseded previews clear displayed totals and cannot enable Save. Old source/financial responses are discarded. Late onboarding defaults respect explicit edits, including GST false and a zero super rate. A synchronous saving ref closes the duplicate-click interval before React renders submitting state.

Shared-core adds a typed preview contract/transport and retains the existing multipart generation transport. No dependency or lockfile changes are introduced.

### Read-only server endpoint

`POST /api/v1/invoices/generate/preview/` accepts the financial envelope: `external`, `pharmacy`, `shift_ids`, `gst_registered`, `super_rate_snapshot` and `line_items`. It requires authentication and an existing worker issuer profile. It needs no pre-created customer or billing/contact records.

Internal sources must belong to the worker, match the selected pharmacy, be accepted independent-contractor invoice assignments and remain unbilled. Preview creates unsaved model instances, reuses generation row preparation/legacy arithmetic, materializes the same fixed generated super, and uses the existing internal adoption calculation when applicable.

The response provides `line_items`, `subtotal`, `gst_amount`, `super_amount` and `total`; financial values are decimal strings and total is worker payable. Accepted rows retain canonical identity/date/time/rate-reason metadata. Custom rows use their original submitted `custom_index`; they do not echo raw source metadata. Generated super has no optional source identity.

### Shared extractions and preservation

`invoicing.services` owns issuer lookup, unbilled-source checks, row preparation, legacy amounts and generated-super values. `worker_finance.services.calculate_generated_internal_invoice` shares the existing adoption mapping/calculation without creating a customer or revision; `invoice_bridge` exposes that calculation seam.

Generation still locks worker → assignments → invoice and revalidates at Save. The old accepted-source GET preview remains compatible. Serializer recalculation retains generated-super creation/update/deduplication/deletion, explicit manual precedence and `ensure_generated_super_line=False` behavior. No models, migrations, pricing, permissions or financial policy change in this batch.

## 4. Final findings: reproduction and narrow fixes

| Finding | Actual failing-first evidence | Correction and positive controls |
| --- | --- | --- |
| Custom `assignmentId: 1e309` or `assignment_id: 1e309` overflowed `int()` | Four complete raw-JSON requests, both aliases × internal/external, returned HTTP 500 with `OverflowError: cannot convert float infinity to integer`. | The preview's outer conversion handler now includes `OverflowError`, returning HTTP 400 under `line_items`. The shared/legacy generator is unchanged. Ignored internal professional rows with raw overflow values still rebuild accepted work successfully. |
| Unvalidated custom metadata escaped to strict JSON rendering | Sixteen complete requests, eight metadata paths × internal/external, returned HTTP 500 during actual rendering. Paths: `id`, `shiftId`, `shift_id`, `shiftSlotId`, `date`, `start_time`, `end_time`, and nested `rate_reason`. | `_line_response` permits copied metadata and optional assignment/shift IDs only for server-built assignment-origin rows. Custom financial fields and trusted `custom_index` remain. |
| Plausible custom identity was echoed as source metadata | Two internal/external assertions failed after successful preview → Save when forged custom identity/date/rate-reason fields remained in preview. | Custom origin/index/lock/edit flags remain server-decided, and all custom source metadata is omitted. Normal Save still succeeds; accepted ID and `rate_reason` are explicitly checked alongside date/time/flags. |

Before correction: **3 test methods, 22 expected failing subtests, zero test errors/skips**, 0.342 seconds. Twenty failures were actual HTTP 500 responses; two were metadata-projection assertions. The initial sandbox-only attempt could not connect to PostgreSQL and is not counted as a product reproduction. The real run used the disposable loopback database.

After correction: the same regressions plus four accepted-source/rounding/super controls passed **7/7**, no failures/errors/skips, 0.867 seconds. The existing endpoint helper checks business-row counts, unchanged assignments, SQL INSERT/UPDATE/DELETE, commit callbacks, task publication and email sends. APIClient performs real response rendering; metadata tests also parse `response.content`.

## 5. Invariant route review

| Entry point / possible bypass | Protection or result |
| --- | --- |
| New POST view | `invoicing/views.py::preview_generated_invoice`: authenticated; Django validation becomes HTTP 400. |
| Input collections, amounts, text and Boolean flags | `generation_preview.py::_list_input`, `_custom_inputs`, `_decimal_input`, `_preview_row`: preview-owned validation; finite field-representable effective two-decimal money; model Boolean conversion for line flags. |
| Internal accepted sources | `preview_invoice_generation`, `services._invoice_routed_assignments`, `validate_internal_invoice_shifts`, `_validate_unbilled_assignments`: worker/pharmacy/accepted contractor route/unbilled checks retained. |
| Custom ID aliases | `_generation_line_values` retains its existing handling; the new preview catches its overflow. No legacy input-acceptance change. |
| Response metadata, including nested content | `_line_response` filters both copied metadata and optional model IDs by trusted origin. Custom origin/index are overwritten during preparation. |
| Generated contribution and internal adoption | Existing legacy super stage precedes `preview_generated_internal_invoice`; existing fixed contribution is not recalculated from managed-rounded nets. |
| Save after preview | `generate_invoice_from_shifts` still obtains worker/assignment locks, rechecks source eligibility and duplicate billing, creates the invoice, then adopts internally. A test invalidates consent after preview and verifies refusal, then restores consent and verifies successful Save and duplicate refusal. |
| Concurrent legacy/finance creation | Existing E17 race proves one accepted source creates one invoice without deadlock; the unique accepted-source line constraint remains. |
| Old GET preview | `generate_preview_invoice_lines` remains an accepted-source adapter, independent of the new financial-preview response. |
| Serializer, admin, bulk and background paths | Backend reference search found no other consumer of the new preview. Existing persistence/recalculation owners and mutation guards remain separate and unchanged by the final boundary fixes. |
| Mobile editing, stale responses, Save and double click | Executable screen/helper tests cover source locks, custom-only payloads, superseded request results, late defaults, invalid/pending preview refusal and manual/external positives. |

No unresolved bypass was found within this batch's changed routes. This is not a claim that every privileged admin mutation or every project workflow has been re-audited.

## 6. Financial behavior explicitly retained

| Scenario | Required and tested outcome |
| --- | --- |
| Manual 1.50 × 3.03 | Internal 4.55; unmanaged external 4.54. |
| Two taxable 70.06 rows | Internal per-line GST 14.02; external aggregate GST 14.01. |
| Eligible 70.00 service plus eligible manual 1.50 × 3.03 at explicit 12% test rate | Internal payable 74.55, fixed generated super 8.94; no recomputation to 8.95. |
| Accepted flags false, live profile true | Accepted false values remain false. |
| Accepted GST true, invoice GST explicitly false | Effective GST zero; accepted evidence remains true. |
| Manual super, including explicit zero | Suppresses automatic contribution; remains manual/modified and outside worker payable. |
| Submitted internal ProfessionalServices | Ignored before numeric/identifier validation; authoritative rows are rebuilt. |
| External zero or negative values | Legacy compatibility retained. |
| Decimal precision | Preview accepts representable effective two-decimal values and equivalent trailing zeroes; significant overprecision is refused. Existing generation raw precision acceptance remains unchanged. |
| Header versus line Booleans | Header true/1/yes parsing remains separate from model BooleanField line conversion, including legacy `False`/`0`. |

## 7. Final affected local verification

All results below are from the completed implementation, after both final fixes. Selections overlap and must not be summed as a unique project total.

| Selection | Result |
| --- | --- |
| PostgreSQL: all invoice integrity, accepted E17 source facts, mixed legacy/finance creation race and pure finance calculations | **82/82 passed**, no failures/errors/skips; 9.298 seconds. Includes real PDF checks. |
| SQLite: preview, legacy recalculation, module-size and ownership boundaries | **41/41 passed**, no failures/errors/skips; 7.173 seconds after schema setup. |
| Mobile executable screen/helper behavior | **10/10 passed**, no skips/todo/cancellations; Node 24.22.1, 850.944 ms. |
| Shared-core preview/save transport | **3/3 passed**, Vitest 4.1.11; 205 ms. |
| Shared-core typecheck and build | Exit 0. |
| Mobile TypeScript after shared-core build | Exit 0. |
| Migration drift | Exit 0; No changes detected. |
| Whitespace | Clean. |
| Independent backend final review | Approved within scope; both response-projection locations and aliases inspected. |
| Independent mobile/shared-core review | No blocker; `custom_index` mapping already works without source metadata. No client changes after that review. |

The final PostgreSQL selection is the previous 79-method selection plus three new methods. The SQLite selection is the previous 38-method selection plus the same three methods. These comparisons describe discovery, not reused old pass evidence.

### Commands and environment

Python 3.12 / Django 5.2.17 / PostgreSQL 16.15 / Node 24.22.1. Existing lockfile-installed dependencies were copied into the isolated continuation checkout; package and lockfiles are unchanged. Tests used only the workflow's public test placeholders and APP_ENV=test.

Disposable PostgreSQL: `127.0.0.1:55432`, database setting `ct_clock_period_batch`, Django test database `test_ct_clock_period_batch`; data directory `/tmp/ct-monetary-pg-23z32euw/data`. No production credential or restored production data was used.

Actual backend runner: `/workspace/scratch/c65b61d0f0c3/run_surgical_tests.py`, pointing to this checkout and the checked-in workflow environment. Python executable: `/workspace/scratch/5082803d996c/surgical-venv/bin/python`.

```bash
# PostgreSQL affected selection, through the runner above
python -B run_surgical_tests.py test invoicing.test_integrity invoicing.test_assignment_terms_postgres worker_finance.tests.test_calculations --keepdb --noinput --settings=core.postgres_test_settings --verbosity=2

# SQLite/architecture affected selection
python -B run_surgical_tests.py test invoicing.test_integrity.InvoiceGenerationPreviewIntegrityTests invoicing.test_integrity.LegacyInvoiceRecalculationPreservationTests core.test_module_size_ratchet core.test_backend_ownership_boundaries --settings=core.contract_test_settings --verbosity=2

# shared-core
npm run typecheck
npm run build
npx vitest run src/domains/invoicing/generation.test.ts

# frontend_mobile
node --test --test-isolation=none scripts/invoice-generation.test.cjs
npx tsc --noEmit

# Migration drift, through the runner
python -B run_surgical_tests.py makemigrations --check --dry-run --settings=core.contract_test_settings
```

Local logs: `/tmp/ct-mobile-invoice-resume-boundary-red.log`, `/tmp/ct-mobile-invoice-resume-boundary-green.log`, `/tmp/ct-mobile-invoice-final-postgres.log`, `/tmp/ct-mobile-invoice-final-sqlite.log`, `/tmp/ct-mobile-invoice-final-behaviour.log`, `/tmp/ct-mobile-invoice-final-mobile-types.log`, `/tmp/ct-mobile-invoice-final-migrations.log`. Temporary runner/logs are reproducibility aids; this repository handover is the durable evidence summary.

## 8. Hosted discovery and final publication gate

The existing Shared Core Consolidation workflow now explicitly includes `frontend_mobile/scripts/invoice-generation.test.cjs` in its normal Node 22 test command. Shared-core's ordinary Vitest discovery includes the new transport test; the backend's existing `invoicing.test_integrity` selection includes the new boundary methods. No new workflow or testing framework was added.

After publishing, inspect automatic workflows for the exact published SHA, including all applicable backend, client, security and smoke jobs. Verify the ten named invoice tests in the hosted mobile log; a file-container summary alone is not ten observed subtests. If CI checks a PR merge commit, compare its source tree to the published branch tree before attributing the result.

The prior parent failed its mobile live dependency audit on `GHSA-gcqx-w48m-w2h4` at `verify-dependency-security.cjs:62:14` (expected `deepmerge`, actual `undefined`). That is historical context, not a final-head result. Do not weaken/waive the audit, change unrelated dependencies, or infer this is the only advisory. Record any new failure separately in PR #213 and the living plan.

Invoice-specific browser acceptance, real React Native layout, Android/iOS acceptance, physical-device testing, live broker/provider execution and staging acceptance are not established by these tests. General authentication/scope browser smoke does not replace invoice-specific acceptance. No merge, deployment or live provider operation is authorized by this batch.

## 9. Changed-file inventory

| Area | Files |
| --- | --- |
| Preview endpoint and generation owner | `backend/invoicing/generation_preview.py`, `services.py`, `views.py`, `urls.py` |
| Existing finance calculation seam | `backend/worker_finance/services.py`, `invoice_bridge.py` |
| Backend regression evidence | `backend/invoicing/test_integrity.py`, `test_assignment_terms_postgres.py` |
| Mobile implementation and executable controls | `frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx`, `invoiceGeneration.ts`, `frontend_mobile/scripts/invoice-generation.test.cjs` |
| Typed contract and transport | `shared-core/src/contracts/invoiceGeneration.ts`, `shared-core/src/domains/invoicing/api.ts`, `generation.test.ts`, `shared-core/src/api.ts`, `index.ts` |
| Existing test discovery | `.github/workflows/shared_core_consolidation_ci.yml` |
| Durable QA | This handover |

All 17 implementation/test/workflow files from the pause are retained; the final response-boundary changes are confined to the new preview module. No WIP snapshot commit needs to enter the integration branch history.
