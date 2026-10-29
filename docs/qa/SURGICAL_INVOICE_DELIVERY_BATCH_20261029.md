# Surgical invoice delivery batch E — 29 October 2026

## Scope and review baseline

This batch makes legacy invoice email delivery use the existing durable invoice/version reservation, and gives legacy and finance sends the same ordered completion rules. It preserves invoice editing, payment records, issued revision visibility, and the completed E17 acceptance workflow.

- Starting head: `79883f21b86a17ec0db2fefbd3a8774869281ef9`.
- Completed E17 base: `0e2a4a14344492cddab1ed2998c14340d538ad30` on `fix/pr211-followups`.
- Review branch: `fix/surgical-backend-consistency-20261029`, continuing [draft PR #213](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/213).
- Earlier accepted-assignment, E17 preservation and lock-order work is recorded in [the preceding batch handover](SURGICAL_E17_INVOICE_BATCH_20261029.md).

**Status: draft / NOT MERGE-READY.** Implementation, independent review and the completed local package checks are recorded below. The exact published head/tree and subsequent hosted results are tracked in PR #213 and the versioned surgical plan. No deployment, real email-provider acceptance or device acceptance is claimed.

## One reservation and one lock order

`backend/worker_finance/delivery.py` owns reservation, preparation failure, publication, send claim, uncertain outcome and completion. Canonical invoicing uses these operations through the existing `worker_finance.invoice_bridge`; finance uses the same owner directly. The existing unique constraint on `Delivery(invoice, version)` remains authoritative.

Every changing transition locks **Invoice before Delivery**. This removes the prior completion order that could hold Delivery while waiting for Invoice. The SMTP claim must commit before external sending: `begin_delivery` uses a durable transaction and also rejects explicitly disabled autocommit. Finance sends remain synchronous. If a real enclosing transaction prevents the claim from committing, finance returns a controlled HTTP 503, records definite preparation failure, sends no email and permits a later safe retry.

Completion updates only the attempted version, and promotes only a draft invoice/revision to sent. It does not downgrade a concurrently paid invoice or its paid revision, alter receipts, or publish a newer saved draft. PostgreSQL tests exercise both Mark paid and the receipt/payment endpoint while SMTP is in flight, as well as the actual database wait graph for the Invoice-first lock order.

## Legacy publication and the dedicated worker

The legacy endpoint locks and authorizes the invoice, reserves its version, renders the PDF, and validates the registered task, email construction and configured Kombu serialization before publication. It freezes the recipient, CC, subject, invoice identity, financial/date context, attachment filename and PDF bytes. The context contains a primitive `invoice={id}` mapping instead of a live ORM object.

Publication runs through `transaction.on_commit` and the existing `core.task_queue.async_task` broker boundary. A surrounding rollback publishes nothing. Ordinary acknowledged publication returns HTTP 200 with the canonical status, normally `sent`, and a queued-for-delivery explanation. If an enclosing transaction has not yet committed, the response carries the current canonical status, normally `draft`, with a pending-commit explanation. An uncertain broker outcome returns HTTP 503 rather than claiming successful queue acknowledgement.

The registered `invoicing.tasks.deliver_invoice_email(delivery_id, email)` task runs on the existing email queue and has **no automatic retries**. It builds the existing email template from the frozen arguments, claims the exact Delivery ID, and attempts SMTP only after that claim commits. It never falls back to another reservation for the same invoice/version. A stale task cannot claim a replacement attempt; concurrent tasks and redelivery cannot send an already claimed attempt again. A fast worker's result is not downgraded when the publisher later records its acknowledgement.

The established in-app invoice notification follows committed publication, with publication transitions preventing duplicates during worker redelivery or publisher/worker races. Other email callers retain their existing generic task and retry behavior; extracting message construction in `users.tasks` does not impose the invoice lifecycle on unrelated email.

## Publication, provider acceptance and safe retry are distinct

The new labels fit the existing `Delivery.status` `CharField(max_length=16)` without changing the schema. No new model, status choices, migration or data rewrite is introduced. Invoice statuses visible to clients remain **Draft / Sent / Paid**.

| Internal delivery state | Meaning and next action |
| --- | --- |
| `preparing` | A reservation exists; no publication or provider acceptance has been established. |
| `failed` | Definite failure before publication/SMTP; an explicit retry is safe. |
| `queue_uncertain` | Broker acknowledgement was lost or uncertain. A new HTTP publication is blocked, but the original task may still arrive and claim its reservation. |
| `legacy_queued` | Legacy publication is acknowledged. This retains the existing legacy issued/visible meaning; it is not proof of inbox delivery. |
| `sending` / `legacy_sending` | A committed SMTP claim exists. Another task must not send it again. The legacy form retains its already-published visibility. |
| `uncertain` / `legacy_uncertain` | Provider acceptance is uncertain, including an exception or a result other than one accepted message. Automatic and same-attempt HTTP resending remain blocked. |
| `legacy_failed` | Legacy publication occurred, but worker preparation definitely failed before SMTP. Published visibility remains and an explicit preparation retry is safe. |
| `sent` | The mail backend confirmed acceptance and completion was recorded; inbox delivery is still not guaranteed. |

`delivery_states.py` supplies the shared published-state set to canonical visibility, finance lists, revision/PDF access and received-invoice actions. A legacy invoice does not disappear merely because its delivery moves from queued to sending, uncertain or preparation-failed. An unpublished newer draft remains private. Finance serialization maps the additional internal labels to the established delivery-status vocabulary (`sending`, `uncertain`, `failed`).

A safe retry replaces the definitely failed Delivery row with a **fresh primary key**. Old queued tasks retain the old ID and cannot act on the replacement. Delivery therefore records the current attempt for each invoice/version; it is **not a complete ledger of every failed attempt**. Ambiguous rows must not simply be reset or deleted to enable a resend.

## Legacy editing and client compatibility

Unmanaged legacy invoices remain editable in every delivery state. Under the Invoice lock, the first content save after a Delivery exists for the current version advances the version. Further content saves do not advance it again until that version has its own reservation. Status-only updates retain the version. The submitted status keeps its existing meaning; there is no automatic reset to Draft.

An old callback cannot publish a newer edited draft. Deletion is refused with HTTP 403 if any unresolved or published delivery history exists, including history for an older version. Definite pre-publication `failed` rows alone do not prevent deletion. The managed canonical legacy send route still returns its existing finance-workspace HTTP 409; helper-level duplicate tests are not evidence of a public route bypass.

The queued PDF bytes and financial/recipient context remain frozen even when the live legacy invoice changes. **Unmanaged invoices do not gain finance revision archives or automatic finance adoption**: no Customer/request key is created, and their editable current invoice is not represented as a new archived finance payload.

The two active mobile legacy handlers now consume the typed canonical response instead of setting `sent` after every successful HTTP response:

- Mobile `InvoiceList.tsx`, mounted under Existing tools, applies `result.status` and displays `result.detail`.
- Mobile `InvoiceDetail.tsx` does the same and disables its send button while a request is in progress.

`shared-core/src/domains/invoicing/api.ts` types the response as the existing draft/sent/paid status with optional explanatory detail. These changes preserve pending-commit truthfulness without introducing a new user-visible invoice status or changing the normal acknowledged legacy publication workflow.

Final route verification confirmed that the current web invoice routes render `FinanceWorkspace`; the retained `LegacyInvoiceManagePage.tsx` is not imported by those routes. Its initially proposed companion edit was removed, so the web legacy source is unchanged by this batch. No separate Next invoice copy or active Next legacy-send path was found.

## Executed targeted evidence

Tests use disposable databases, the real service/API/task boundaries and configured Kombu serialization. Successful local worker delivery uses the locmem backend; faults are injected at preparation, broker, SMTP and database-finalization boundaries. No live provider email is sent.

| Selection | Recorded result |
| --- | --- |
| Original 8 new legacy tests on isolated exact `79883f21` | 9 expected failing assertions across 7 methods; no harness errors/skips. Existing managed HTTP conflict control passed. |
| Expanded legacy API/transaction/worker module | **18 passed**, no skips/errors, 1.584 seconds. Includes frozen content, rollback, redelivery, queue/SMTP ambiguity, safe retry/stale IDs, finalization failure, fast-worker ordering, notification and edit/delete controls. |
| Three PostgreSQL regressions on exact baseline, in two selections | All three failed as expected: both concurrent payment routes lost Paid status on completion, and completion took Delivery before Invoice. |
| Current PostgreSQL delivery module | **4 passed**, no skips/errors, 4.121 seconds. Includes the three fixes and simultaneous legacy task claims plus later redelivery. |
| Issued-history/private-draft visibility matrix | Exact baseline: 12 expected failing combinations. Current: **1 test passed across 16 combinations**, retaining v1 list/detail/history/PDF access while v2 stays private and cannot be approved. |
| Finance send inside a real enclosing transaction, before/after its targeted follow-up fix | Before: HTTP 500 instead of controlled 503. After: **1 passed**, 0.063 seconds; no SMTP on the refused call, followed by one successful retry with a fresh Delivery ID. This red result is from the intermediate implementation, not a claim about the original baseline. |
| Existing targeted invoice/finance regression selection | **68 run: 40 passed, 28 expected skips**, no failures/errors. |
| Isolated finance API selection | **32 run: 29 passed, 3 expected skips**, no failures/errors. |
| Shared-core TypeScript check for the client response contract | `tsc --noEmit` passed, exit 0. This is not a claim that all client gates or device acceptance have run. |

Counts overlap and must not be added into a unique-test total. The invoice-integrity controls also cover the issued older revision, its financial payload/PDF and received-invoice actions while a newer draft is private.

Local evidence logs are `/tmp/ct-delivery-baseline-red.log`, `/tmp/ct-delivery-green.log`, `/tmp/chemisttasker-delivery-postgres-baseline-red.log`, `/tmp/chemisttasker-delivery-postgres-payment-route-red.log`, `/tmp/chemisttasker-delivery-postgres-green.log`, `/tmp/chemisttasker-batch-e-finance-outer-atomic-{red,green}.log`, `/tmp/chemisttasker-delivery-existing-targeted.log`, `/tmp/chemisttasker-delivery-isolated-api.log`, and `/tmp/chemisttasker-batch-e-client-shared-typecheck.log`. They are disposable runner artifacts; the tests remain in the repository.

### Reproduction selections

Use the repository's pinned backend requirements and CI dummy environment; locking tests require disposable PostgreSQL.

```bash
python backend/manage.py test invoicing.test_delivery \
  --settings=core.contract_test_settings --noinput

python backend/manage.py test invoicing.test_delivery_postgres \
  --settings=core.postgres_test_settings --noinput

python backend/manage.py test worker_finance.tests.test_api \
  --settings=worker_finance.tests.settings --noinput
```

## Operational limits and rollout

This is not a general transactional outbox, an automatic reconciliation service, or an exactly-once email guarantee. The database reservation does not itself persist the frozen message payload for automatic republishing. A process crash after reservation but before publication, or after a committed send claim, can leave an attempt blocked for manual reconciliation. Broker/provider evidence is needed before deciding whether any recovery send is safe. Provider acceptance followed by a database failure likewise remains blocked rather than risking duplicate email.

**Workers must know the new task before the web tier publishes it.** Roll out compatible email workers first, and keep the task handler available while its queued messages remain. Reverting only the producer does not make older workers capable of consuming messages already queued under the new name. No schema rollout is required, but outstanding deliveries and the additional internal states still need compatible code and reconciliation when changing versions.

GST/default alignment and financial parity (planned stage F), Stripe/billing extraction, shared time calculation, general notifications/outbox work and mobile dependency remediation remain outside this batch. No E17 acceptance, settlement routing, accepted-assignment pricing or payment policy is changed.

The previously recorded mobile `deepmerge` dependency audit issue remains a separate release blocker, as documented in [the earlier progress record](SURGICAL_BACKEND_PROGRESS_20261029.md). This batch changes neither dependencies nor that audit gate and does not establish that it is the only remaining advisory.

## Completed local package checks

After implementation and independent review were complete, the broader applicable local selection passed:

| Selection | Result |
| --- | --- |
| Complete invoicing and finance modules, actual PDF rendering, task contracts/registration, ownership, size ratchet and generic delivery resilience | **235 run: 200 passed, 35 expected skips**, no failures/errors. The skips are 29 isolated-finance API cases and six PostgreSQL cases, executed in their appropriate settings below. |
| Complete isolated finance module | **53 run: 45 passed, eight expected full-model skips**, no failures/errors. |
| PostgreSQL delivery and accepted-assignment modules | **6 passed**, no skips/errors. |
| Migration drift | No changes detected. |
| Import-graph check against the reviewed baseline | Passed; no baseline or dependency exception changed. |
| Whitespace validation | Passed. |

```bash
python backend/manage.py test invoicing worker_finance.tests \
  core.test_pdf_rendering_contract core.test_task_contracts \
  core.test_task_dispatch_registration core.test_backend_ownership_boundaries \
  core.test_module_size_ratchet users.test_delivery_resilience \
  --settings=core.contract_test_settings --noinput

python backend/manage.py test worker_finance.tests \
  --settings=worker_finance.tests.settings --noinput

python backend/manage.py test invoicing.test_delivery_postgres \
  invoicing.test_assignment_terms_postgres \
  --settings=core.postgres_test_settings --noinput

python backend/manage.py makemigrations --check --dry-run \
  --settings=core.contract_test_settings
python scripts/module_import_graph.py --check --check-baseline
git diff --check
```

The new PostgreSQL delivery module is explicitly included in the existing concurrency workflow. The normal `invoicing` selection discovers the legacy delivery tests and skips the PostgreSQL-only class before fixture setup. The obsolete post-enqueue bridge bookkeeping tests were replaced by actual HTTP/transaction/task coverage; the adoption bridge control remains.

Local logs are `/tmp/chemisttasker-delivery-final-{sqlite,postgres,isolated-finance}.log`, `/tmp/chemisttasker-delivery-migrations.log` and `/tmp/chemisttasker-delivery-import-graph.log`. These tests use the pinned requirements and public CI placeholders. Shared-core local type checking used the lockfile's TypeScript 5.9.3 on Node 24.22.1; automatic Node 22 CI supplies full web/mobile dependency and build verification.

The published PR records the automatic backend, client and browser jobs for this exact batch after publication. Those results must be assessed individually; the earlier batch's passes do not substitute for this batch's checks. Provider acceptance, full agy browser/native/physical-device acceptance and any staging/production rollout remain separate evidence. No merge or deployment is performed by this batch.
