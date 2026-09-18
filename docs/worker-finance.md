# Worker finance - implementation and release review

## Architecture

`backend/worker_finance/` extends canonical `client_profile.Invoice` and `InvoiceLineItem` records through owner-private metadata, snapshots, customers, catalogue items, payments, deliveries and expenses. `shared-core/src/finance.ts` uses the application's existing configuration and authenticated API. The original invoice page is preserved and mounted under Existing tools; owner views are retained.

The package installer registers the app and route guards, configures the package export and Vite/TypeScript shared-source aliases, and copies the original invoice page before wrapping it. The integrated branch already includes these edits. No second accounting backend or browser financial localStorage is introduced.

## Invoice and super workflow

Create a customer/store with legal/trading names, ABN, invoice contact/address and terms. Run the existing ABR check after saving. Add reusable labour/transport/accommodation/super/other items with rates, units and reviewed tax defaults. Customers and items can be created from inside an open invoice without discarding it.

Draft external work with dates, quantities, discounts and inclusive/exclusive pricing. Financial amounts are Decimal strings; the server calculates totals. Save/edit only while draft, preview the saved PDF, then issue to lock. Sending is separately confirmed. Duplicate creates a new document and does not copy payments, send history or dates of work. Partial actual payments are supported with idempotency and overpayment checks.

Statutory super is not a worker bank payment or taxable service charge. Automatic super applies only to reviewed eligible net lines; a manual Superannuation item replaces automatic super. Separate contribution requests link to an issued service invoice, require fund details and have their own issue/send/payment actions. These requests are not tax invoices. Eligibility, actual applicable rate, earnings basis, company obligations and payment deadlines must be reviewed; this is not SuperStream.

## Expenses and receipts

Expenses record actual gross/GST amounts, creditable business use, declared registration/evidence, supplier/reference and incurred/full-payment dates. No automatic deduction or reimbursement invoice is created. Unsupported prepayments and future payment dates are rejected. Receipt signatures are checked for PDF/PNG/JPEG, limited to 5 MB per file and 50 MB per account. Downloads require ownership/authentication, use attachment disposition and are not public MEDIA_URL files. Duplicate receipt checks use SHA-256. No OCR or antivirus scanning is claimed.

## GST / BAS boundaries

G1/1A/1B worksheet estimates use only issued workspace invoices and recorded payments/expenses. Cash and accrual views differ. Legacy records, unsupported adjustments and missing evidence are explicitly flagged or excluded. This is not a complete BAS, compliance certification or lodgement tool.

Use one accounting entity per user workspace. Reporting and expenses are owner-scoped rather than partitioned by issuer ABN. Different businesses must not be mixed into one report. GST registration history, tax coding, evidence timing and completeness require external review.

No credit notes, post-issue corrections, reversals/refunds, void workflow, bank feeds, partial supplier payment accounting, public payment links, automated recurring invoices/reminders, PAYG/WET/LCT or BAS lodgement. Mobile finance UI is not included; mobile API consumers must rebuild shared-core. Do not work around missing corrections by duplicating invoices or falsifying dates.

## Security and operational review

Ownership controls cover all records and downloads. Financial snapshots are protected from legacy mutations. ABN edits clear registry metadata and in-flight lookups cannot verify a changed ABN. Submitted float/bool monetary values, invalid versions, mixed ownership and conflicting payment keys are rejected. Private cache headers and URL/redirect transport restrictions protect financial content and tokens. Invoice lists prefetch related records to avoid N+1 histories.

Email attempts persist before provider IO; uncertain provider acceptance is not automatically retried. Operations staff must reconcile uncertain/stuck attempts with provider logs before resending. PDF generation escapes fields and rejects external resources. Database receipt bytes are deliberately bounded; scaling requires private storage, scanning, backup/retention and deletion/export review.

## Staging gate

Check CI, actual project authentication/models, migration history and PostgreSQL concurrency. Inspect `showmigrations` and `migrate --plan`; do not fake migrations just to silence errors. Back up staging, review canonical schema parity, and test old owner/internal flows. Exercise keyboard/mobile-width UI, PDF amounts, sandbox email and real ABR behaviour. Obtain Australian accountant/BAS-professional review before relying on reports. Automated isolated tests are not a production integration or visual-browser certification.
