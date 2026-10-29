# Surgical backend batch after E17 — 29 October 2026

## Scope and baseline

This batch integrates the completed E17 worker cover-terms workflow, preserves the earlier surgical changes, and implements the next accepted-assignment source consolidation. It also corrects a separately reproduced invoice lock-order defect and adds the missing archive preservation control.

- Completed E17 base: `0e2a4a14344492cddab1ed2998c14340d538ad30` on `fix/pr211-followups`.
- Previous surgical head: `20e2bb60b4573bb4077cdd6b04712c4e2afc5f22`.
- Review branch: `fix/surgical-backend-consistency-20261029`; draft PR #213.
- Clean integration tree before this batch's changes: `c85b76729fbd7cd105cf8d863b9606b6125738a9`.
- The prior B1/B2/B3/G/H changes and both test-fixture corrections remain. The initial integrated diff against E17 was exactly the previous 17-file surgical patch, 821 additions and 65 deletions.

The E17 snapshot branch is no longer the baseline. Its replacement is the committed E17 above. Work remains isolated from the owner's local followups checkout and `ACTIVE.md`; the followups branch itself is not modified by this batch.

**Release status remains draft / NOT MERGE-READY.** This record describes implementation and executed checks, not deployment, browser/device acceptance or the complete release package. The PR description records the published head and subsequent hosted results without repeatedly committing status-only changes.

## Business rules preserved

Manager approval does not record worker acceptance. Approved contractor cover becomes an invoice source only after its worker explicitly accepts the frozen terms. A source offer is optional. Both invoice selectors still require worker ownership, `INVOICE`, `INDEPENDENT_CONTRACTOR`, and a non-null acceptance timestamp.

Staff and TFN cover retain their existing payroll/timesheet routing and E17 client presentation. A missing usable pharmacy rate still blocks acceptance. Protected roster deletion remains refused, while archiving the containing period remains possible. No E17 acceptance, pricing, routing, permission or client code is changed by the new production patch.

Invoice corrections also remain intentional: the worker may correct quantity, rate, date, description or tax selection before the initial Save and in later revisions. The original accepted assignment evidence remains separate from those editable invoice values.

## C — one reader for original accepted assignment facts

### Owner and dependency boundary

`backend/worker_finance/assignment_terms.py` is a small, read-only, standard-library-only module. It returns immutable typed facts: assignment/occurrence identity, accepted times, billed hours, rate, accepted GST/super facts, acceptance identity/time, E17 cover provenance, and per-field fallback provenance.

Finance imports it locally. Canonical invoicing obtains the same reader and domain exception through the existing `worker_finance.invoice_bridge` integration boundary. The original proposed location under `invoicing` introduced a reverse finance-to-invoicing application dependency and expanded the existing strongly connected component. Moving the pure reader behind the existing bridge removed that regression. No architecture baseline or dependency exception was relaxed.

The reader is not an authorization predicate. Query selection, pharmacy grouping, eager loading, ownership, row locks, duplicate billing and revision ownership stay in their existing services.

### All four source consumers use it

| Consumer | Result |
| --- | --- |
| `invoicing.services._invoice_line_from_assignment` | Preview and generation use the common original occurrence, hours, rate and accepted tax/super facts. |
| `worker_finance.services.internal_invoice_sources` | The selection list shows accepted times, hours and rate. |
| `worker_finance.services.internal_invoice_prefill` | Editable initial lines and their descriptions use those same original facts. |
| `worker_finance.services._source_snapshot` | A new invoice records matching original hours/rate and the complete original consent/provenance snapshot. |

The established legacy precedence is preserved: match both slot ID and occurrence date; use each accepted time when present and the corresponding current slot field otherwise; scan matching occurrences for a positive agreed rate, then use a positive assignment-rate fallback. Current pharmacy rates, Award schedules and later profile changes are never used to reprice accepted work.

Overnight and equal-time behavior is unchanged. Hours retain the existing four-decimal intermediate duration followed by two-decimal `ROUND_HALF_UP` billed quantity. This matters at boundaries: one hour and 18 seconds yields `1.01`, and the existing intermediate-rounding case of one hour and 17.9 seconds also yields `1.01`.

Malformed or nonfinite rates become controlled field validation. Missing/nonpositive accepted rates retain the positive assignment fallback; an unusable fallback is refused. Legacy adapters still raise Django validation errors and finance adapters still raise DRF validation errors. Existing float/string and time formatting remain unchanged.

### Demonstrated divergence and its limits

The actual E17 integration test approves and accepts one hour of no-offer cover at `73.50`. It deliberately changes the current slot from `08:00–09:00` to `11:00–16:00`, the current assignment rate to `135.00`, and current profile values. Before the shared reader, legacy preview still used the accepted hour, while finance selection, prefill and original evidence used five hours. Afterwards all four original-source consumers use one hour at `73.50` and retain the original acceptance/provisional-cover provenance.

Those record changes are injected directly for the preservation test. They are not evidence that the normal roster UI permits accepted terms to be overwritten; E17's mutation protections remain active.

### Deliberate financial boundaries

This patch does not choose a new GST/default convention. Legacy line GST still follows accepted terms; finance prefill still uses its existing current-profile default. Accepted super-review/payability evidence remains separate from invoice-time super selection/confirmation. Aggregate-versus-per-line GST rounding and complete same-revision monetary parity remain a separate planned financial decision.

Existing saved source snapshots and issued revisions are not rebuilt. Only new source reads and newly saved original evidence use the common reader. Later revisions keep the saved original evidence.

## D — mixed-route invoice lock order and occurrence preservation

### Reproduced invoice deadlock

Legacy internal generation previously locked assignments and then acquired the worker row during finance adoption. Finance Save acquired the worker first and then assignments. A controlled PostgreSQL schedule proved the inversion: finance queued first on a held worker row, legacy joined while holding the assignment, and release produced an uncaught `OperationalError: deadlock detected` in legacy generation.

The production correction adds one worker `select_for_update()` before legacy internal assignment locking, inside the existing transaction. Both paths now take worker → assignments → invoice/adoption. External legacy generation is unchanged. Existing source-line uniqueness and duplicate checks remain; no automatic retry or error suppression is introduced.

The regression uses real transactions, events, PostgreSQL's actual blocking graph and bounded lock/statement timeouts, without sleeps. It requires exactly one invoice, one source line, one initial revision, one successful creator and one controlled duplicate validation response. The existing legacy-versus-legacy race remains a positive control.

This is a separately reproduced invoice defect. Its cause has not been connected to the owner's previously reported intermittent E17 race; that earlier observation remains distinct.

### Archive preservation and existing mutation owners

A new positive test calls the real `POST /api/v1/attendance/roster/archive/` endpoint for approved, worker-accepted, no-offer cover in a published period. It proves the period becomes archived while retaining the assignment, accepted snapshot/timestamp/rate, roster ownership, provisional backfill links, attendance session link and invoice sources. Archiving creates no payment. Existing production behavior already passes this test.

E17 already covers direct staff assignment, legacy roster PATCH, bulk assign/move, current-row roster PATCH, stale-instance rate refresh and defaults races. Existing history guards protect removal/replacement and linked invoice/leave/attendance history. This batch adds the missing cross-route invoice race and archive control; it does not introduce another booking protection abstraction or claim exhaustive coverage of every possible interleaving.

## E17 test applicability correction

The two new workforce cover-terms test classes inherit a PostgreSQL-only fixture. On SQLite that fixture opened a Django class transaction before raising, and failed class setup bypassed cleanup. The leaked transaction suppressed later offer after-commit callbacks.

The targeted reproduction discovered 29 tests: both authority classes failed setup, and the five offer transaction methods produced eight failed subcases. Class-level PostgreSQL guards now skip the two classes before setup. The same SQLite selection passes its five applicable tests and intentionally skips 24 PostgreSQL tests; all 29 pass on PostgreSQL. The subsequently added archive test also passes there.

Every existing assertion is retained. The regular PostgreSQL gate still runs these classes. The new invoice PostgreSQL classes are guarded before setup and explicitly registered in the concurrency workflow; ordinary source tests are discovered by the existing full `invoicing` app selection.

### Public-booking positive control

The completed-batch PostgreSQL gate ran 436 tests and found one further E17 test-fixture failure. `CoverTermsExistingControls.test_booked_abn_offer_acceptance_still_records_consent_and_invoice_sources` inherited the attendance fixture's deliberate stored `verified=False`, then expected an ordinary public offer to be accepted. Public booking correctly refused that stale public-profile decision. The same single test failed on a clean checkout of the exact E17 base `0e2a4a14`, with AHPRA enforcement enabled.

Only that positive control changes: it explicitly enables enforcement, proves the initial request is denied without acceptance/assignment, calls the real `refresh_verified` policy owner, and then runs its original successful acceptance/finalization/invoice assertions. The shared attendance fixture remains unchanged, as do all production verification guards. Eleven relevant PostgreSQL controls passed after the fixture repair; a further single-test check verifies the explicit enforcement setting when the surrounding environment disables it.

This specific base-reproducing fixture issue is not a classification of the owner's separately reported 25 AHPRA failures.

### Clean web/mobile test dependency resolution

The first published head, `04de253d`, passed Backend Finalization on SQLite/PostgreSQL, but clean Vite and mobile jobs exposed another inherited E17 test-harness issue. `shared-core/test-support/coverTermsHarness.mjs` imported TypeScript from its own directory even though those jobs install dependencies only in the selected client app. Both stopped with `ERR_MODULE_NOT_FOUND` before the cover-terms assertions ran.

The same error reproduced for both wrappers on an exact E17 archive with only each app's locked compiler installed. The harness now uses Node's `createRequire` anchored to the selected app's `package.json`. It retains all assertions and client behavior, uses the already-pinned web/mobile compiler, and adds no dependency/install step. The change is three added lines and one removed line, including its explanation.

In that deliberately minimal app-only layout, direct wrapper execution passes all 26 web and 21 mobile cover-terms cases, with no skips. The web compiler is the lockfile's 5.7.3 and mobile's is 5.9.3; downloaded package integrity was verified against the lockfiles. Local execution used Node 24.22.1, so the automatic final-head jobs provide Node 22/full-app verification. Broader local attendance commands were not claimed green in this minimal layout: unrelated modules require the absent dayjs/date-fns dependencies. Their actual app dependencies are installed by hosted CI. No client runtime or dependency version changed.

## Executed evidence

The owner requested targeted tests while coding and the broader applicable gate after completion. The implementation followed that cadence. Tests use pinned repository dependencies and disposable local databases, not production data.

| Selection | Recorded result |
| --- | --- |
| Initial 13 new source tests against unchanged services | 18 failed subcases and 9 errors; two preservation controls already passed; no setup errors |
| 14 new source tests plus 36 original invoice-integrity tests | 50 passed, no skips, including actual prior PDF/rounding and revision controls |
| Actual E17 source-facts test on integrated pre-fix tree | Three expected finance subcase failures: list, prefill and original evidence |
| Corrected deterministic mixed-route race on integrated pre-fix tree | Reproduced uncaught PostgreSQL deadlock |
| Two new PostgreSQL tests plus existing legacy duplicate-generation race after fix | 3 passed, no skips |
| E17 authority + offer transaction tests after applicability fix | SQLite: 5 passed, 24 intentional skips; PostgreSQL: 29 passed, no skips |
| Real archive API preservation control | 1 passed on PostgreSQL |
| Final isolated finance module after the helper namespace adjustment | 46 passed, 8 expected isolated-settings skips |
| Final SQLite serializer + invoice/finance + real PDF + task integration | 759 run: 687 passed, 72 expected skips; no failures or errors |
| First completed-batch PostgreSQL concurrency workflow | 436 run: 435 passed, one inherited E17 public-booking fixture failure, subsequently corrected as above |
| Exact E17 base public-booking control | Same 403-versus-200 failure reproduced before its test-only repair |
| Public-booking fixture repair with related eligibility controls | 11 passed on PostgreSQL, no skips |
| Clean app-only E17 cover-terms test wrappers after compiler-resolution repair | Web 26 passed; mobile 21 passed; no skips; local Node 24.22.1 |
| Migration drift | No changes detected |
| Import graph against reviewed baseline | Passed, no new violations; existing cycles remain |
| Offline public-holiday reconciliation | Passed; pending declarations remain explicitly pending, with no calendar changes |

The first PostgreSQL race harness initially assumed the database would name the parent blocker directly. PostgreSQL named an earlier queued waiter. The harness was corrected to recognize the verified wait chain before the separate deadlock reproduction; the initial harness failure is not counted as product evidence.

SQLite's 72 skips are 28 isolated-finance-only API cases, 25 PostgreSQL E17 authority cases, five PostgreSQL locum approval cases and 14 other PostgreSQL cases. The isolated finance run executes its 28 cases; its eight full-model skips execute in the main SQLite selection. PostgreSQL exercises its applicable cases. Counts overlap and must not be added into a unique-test total. The PR description supplies later exact-head hosted status, including the complete PostgreSQL rerun after the test-only repair.

### Reproducible commands

Use Python 3.12 with `backend/requirements.txt`, the CI dummy environment, and disposable PostgreSQL 16 for locking tests.

```bash
python backend/manage.py test \
  invoicing.test_assignment_terms invoicing.test_integrity \
  --settings=core.contract_test_settings --noinput

python backend/manage.py test \
  invoicing.test_assignment_terms_postgres \
  client_profile.test_postgres_concurrency.InvoicePostgresConcurrencyTests \
  --settings=core.postgres_test_settings --noinput

python backend/manage.py test \
  workforce.tests.test_cover_terms_authority \
  shifts.test_shift_actions_contract.OfferNotificationCommitTests \
  --settings=core.postgres_test_settings --noinput

python backend/manage.py test worker_finance.tests \
  --settings=worker_finance.tests.settings --noinput

python backend/manage.py makemigrations --check --dry-run \
  --settings=core.contract_test_settings
python3 scripts/module_import_graph.py --check --check-baseline
```

## Review, rollback and next batch

Independent source review found no blocker in the source reader, adapters, correction boundaries or worker-first lock, including E17 lock compatibility. A separate import-boundary review verified that both adapters receive the same reader/exception through the existing bridge and no old helper import remains.

Revert the source-reader commit as a unit if needed, restoring all four adapters together. The separately committed lock-order correction and fixture applicability/archive tests can remain. There is no schema migration or data rewrite to reverse. Preserve the previous rounding, after-commit delivery, pharmacy scope and onboarding guard changes.

The next financial implementation target is the separately scoped legacy invoice-email lifecycle: durable delivery/revision reservation, commit-before-dispatch, and distinct definite failure versus uncertain provider acceptance. The GST/default convention still requires concrete policy examples before alignment. Billing file extraction and shared time geometry remain conditional later work; neither is required to complete this source-facts batch.

Full release acceptance, real provider behavior, browser/native/physical-device verification and deployment remain separate recorded gates. The owner's earlier E17 base-reproducing AHPRA failures and untraced intermittent race are reported history, not silently converted into current-head passes or waived failures.
