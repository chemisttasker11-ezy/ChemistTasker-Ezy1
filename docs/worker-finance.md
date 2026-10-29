# Worker finance - implementation and release review

## Architecture

`backend/worker_finance/` builds on canonical `invoicing.Invoice` and `InvoiceLineItem` records with customers, catalogue items, revisions, reviews, payments, deliveries and expenses. The former `InvoiceRecord` metadata wrapper is retired; both invoice APIs use the same canonical invoice identity. `shared-core/src/finance.ts` and the finance domain API use the application's existing configuration and authenticated transport.

Finance-managed invoices have a non-null `request_key`. Imported older invoices also have a request key, with `legacy_snapshot=True` and an imported revision 1 preserving stored amounts/status. Their age does not send them to the legacy editor. Migration did not invent payment receipts, payment dates or email attempts. Null-key invoices are unmanaged compatibility records; retained external/generic invoice APIs can still create them after migration.

Web invoice lists use `FinanceWorkspace`; old creation links and managed detail links forward into it, while unmanaged details retain the legacy view. Mobile also uses the finance workspace, retains Existing tools, and still opens the legacy generator from shift history. Legacy internal generation adopts the same accepted-shift invoice into finance; legacy external generation can remain unmanaged. Worker personas issue invoices; owner, organisation and pharmacy-admin personas receive them. There is no second invoice ledger.

## Invoice and super workflow

Create a customer/store with legal/trading names, ABN, invoice contact/address and terms. Run the existing ABR check after saving. Add reusable labour/transport/accommodation/super/other items with rates, units and reviewed tax defaults. Customers and items can be created from inside an open invoice without discarding it.

Create external customer work or prefill from the worker's accepted, invoice-routed ABN assignments. Payroll/timesheet-only work does not become an invoice source. Approved invoice cover requires the worker's own acceptance of its frozen terms before invoicing. Financial amounts are Decimal strings; the server calculates totals and supports inclusive/exclusive prices and ad hoc lines. Discount values remain in the data/calculation even where the UI hides the field.

In the finance workspace, Save creates the invoice and its first revision. Later service-invoice saves create a new immutable revision, including corrections after Sent or Paid, and return the current revision to Draft. Hours, rates, descriptions and other permitted billing fields remain correctable. Internal source-assignment identities and the pharmacy/customer stay fixed, with the original accepted evidence retained separately from corrected billed values. Historical revisions/PDFs are read-only. The `issue` endpoint is a compatibility review action; it no longer locks service invoices against correction.

Sending a saved revision is separately confirmed. A newer unsent correction stays private while the pharmacy retains the previously published revision. Recipients can request corrections, approve for payment or mark paid within their pharmacy scope; actions check the current published version rather than applying to an unseen correction. Legacy queued publication and migrated-revision exceptions remain distinct from email-provider acceptance.

Record actual full or partial payments with idempotency and overpayment checks. Finance Mark paid records the remaining balance through the payment-receipt path. Receipts and their sales/GST allocations survive invoice revisions, including when the current correction is Draft. Duplicate creates a new external draft without assignment links, payments, send history or dates of work; use revisions to correct an existing invoice.

Super is separate from the service invoice's worker-payable amount. Enabling it requires confirmation of the contractual/statutory basis; a requirement to review contractor super is not confirmation that it is payable. Automatic super applies only to eligible net lines; a manual Superannuation item replaces automatic super. Separate contribution requests link to a saved service invoice with a positive contribution and separate-super mode, require fund details, and have their own send/payment actions. Recording payment requires confirmation that it went to the fund. These requests are not tax invoices. Eligibility, actual applicable rate, earnings basis, company obligations and payment deadlines must be reviewed; this is not SuperStream.

## Monetary calculation and accepted evidence

New finance saves and revisions use the existing finance calculator: Decimal line amounts and per-line GST are rounded with `ROUND_HALF_UP`, then summed. New internal invoices created through the retained generator use that same result when first adopted into finance. Their canonical amounts, stored line totals and first finance revision agree. Adoption changes monetary projections only; original line identities, modification flags and issuer/recipient/source snapshots remain intact.

Accepted GST evidence, current onboarding defaults and explicit invoice choices remain separate. The legacy generated professional line takes applicability from the accepted terms; finance prefill initializes tax choices from current onboarding, and the worker can review those choices. This projection rule does not change registration defaults, tax codes, inclusive/exclusive inputs or accepted evidence.

The contribution already materialized by legacy generation remains an explicit Superannuation line during adoption; its eligibility, rate and base are not re-evaluated. A fractional or discounted manual contribution uses the same finance line rounding as other manual items. Super remains separate from worker payable.

Already managed invoices and imported revisions are not recalculated by adoption. Unmanaged external compatibility invoices retain their existing calculation path. This saved-revision rule does not establish parity for the retained mobile generator's independent pre-save preview.

## Expenses and receipts

Expenses record actual gross/GST amounts, creditable business use, declared registration/evidence, supplier/reference and incurred/full-payment dates. No automatic deduction or reimbursement invoice is created. Unsupported prepayments and future payment dates are rejected. Receipt signatures are checked for PDF/PNG/JPEG, limited to 5 MB per file and 50 MB per account. Downloads require ownership/authentication, use attachment disposition and are not public MEDIA_URL files. Duplicate receipt checks use SHA-256. No OCR or antivirus scanning is claimed.

## GST / BAS boundaries

G1/1A/1B worksheet estimates use non-void managed service invoices (`request_key` is non-null) and recorded payments/expenses. Imported managed snapshots (`legacy_snapshot=True`) remain eligible; unmanaged null-key compatibility invoices are excluded and counted separately. This boundary follows management state, not record age. Unsupported adjustments and missing evidence still require review. This is not a complete BAS, compliance certification or lodgement tool.

Accrual uses Sent/Paid service invoices within the invoice-date period. Cash uses actual recorded payment dates and sales/GST allocations, including receipts retained when a later invoice revision is still Draft. An imported Paid status alone supplies no cash receipt or payment date. Expenses use incurred dates for accrual and the recorded full-payment date for cash, subject to the existing GST-credit evidence rules.

Use one accounting entity per user workspace. Reporting and expenses are owner-scoped rather than partitioned by issuer ABN. Different businesses must not be mixed into one report. GST registration history, tax coding, evidence timing and completeness require external review.

Service-invoice corrections are supported through revisions. Credit notes, payment reversals/refunds, an invoice void action, bank feeds, partial supplier payment accounting, public payment links, automated recurring invoices/reminders, PAYG/WET/LCT and BAS lodgement are not implemented workflows. Do not substitute duplicates or false payment dates for these missing operations.

## Security and operational review

Ownership controls cover all records and downloads. Financial snapshots are protected from legacy mutations. ABN edits clear registry metadata and in-flight lookups cannot verify a changed ABN. Submitted float/bool monetary values, invalid versions, mixed ownership and conflicting payment keys are rejected. Private cache headers and URL/redirect transport restrictions protect financial content and tokens. Invoice lists prefetch related records to avoid N+1 histories.

Invoice email attempts persist before external IO and are tied to a saved version. Legacy email retains its queued PDF/recipient/CC flow; finance sends synchronously. Queue acceptance does not establish mail-provider acceptance, and provider acceptance does not guarantee inbox delivery. Uncertain/stuck attempts are not automatically retried; reconcile them with broker/provider evidence before resending. Completion affects its own attempt/revision and preserves a concurrent Paid state. PDF generation escapes fields and rejects external resources. Database receipt bytes are deliberately bounded; scaling requires private storage, scanning, backup/retention and deletion/export review.

## Staging gate

Check CI, actual project authentication/models, migration history and PostgreSQL concurrency. Inspect `showmigrations` and `migrate --plan`; do not fake migrations just to silence errors. Back up staging and review canonical schema parity. Exercise internal/external creation, corrections with prior recipient visibility, retained receipts, imported managed snapshots and active legacy mobile routes. Check keyboard/mobile-width UI, PDF amounts, sandbox email and real ABR behaviour. Obtain Australian accountant/BAS-professional review before relying on reports. Automated isolated tests are not a production integration or visual-browser certification.
