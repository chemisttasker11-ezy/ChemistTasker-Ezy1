# Marketplace finalisation handover — 17 September 2026

Branch: `fix/marketplace-finalization-20260917`

This branch finalises the marketplace gaps identified after the initial implementation without changing the core split between public ordinary goods and the private ethical medicine domain.

## Implemented

- Discoverable `+ Add item` entry from marketplace, public header and signed-in account controls.
- Role-aware listing wizard: Personal / Pharmacy-owned / Private ethical medicine.
- Backend-enforced `who can list what` policy using verified role + seller context + category policy + actual pharmacy ownership.
- Ordinary pharmacy-owned goods remain actual-owner-only; generic pharmacy/admin roles do not inherit selling authority.
- Reviewed marketplace categories seeded by management command, including books/study, workwear, office/tools, pharmacy fixtures and ordinary pharmacy stock.
- Pharmacy-owned ordinary listings start at `OWNED_CHAIN`, may widen to `ORGANISATION` then `PLATFORM`, and missing legacy audience now fails closed.
- My Marketplace shows publication state, image moderation state, current/max owner circle and manual/scheduled widening.
- Marketplace and ethical escalation tasks are registered with Celery Beat every minute; task-level feature flags/policy checks remain authoritative.
- Ethical listing scope is derived server-side from the real source pharmacy owner/organisation/active owner chain; browser-supplied chain scope cannot establish authority.
- Ethical visibility follows `CHAIN_PHARMACIES -> ORGANISATION_OWNERS -> PLATFORM_OWNERS`. Chain admins participate only through exact ethical pharmacy grants; organisation/platform expansion adds owners, not unrelated admins.
- S8 respects the current circle and cannot be saved with platform current/max scope.
- Private ethical inventory CSV can be staged and committed into reconciled lots through reviewed barcode identifiers, with reservation protection and stock-movement records.
- My Ethical Listings exposes drafts and owner publish/escalate/withdraw controls.
- Ethical acting-pharmacy switching clears old rows and refetches under the selected pharmacy.
- Existing ethical Access page is retained because it already contains the owner-scoped PharmacyAdmin grant workflow.
- Marketplace listing/image moderation actions are available in OTP-protected Django admin.
- Authenticated `/` becomes the shared ChemistTasker discovery Home; anonymous `/` remains the marketing landing page. Dashboard remains the operational workspace.
- Vite public-route bridge now hands marketplace/learning/how-it-works to Next and clicking the dashboard ChemistTasker logo image returns to `/`.
- `/learning` is added and surfaces existing public-hub articles tagged `topic=learning` with signed-in role context.
- Security/policy regression tests were added for seller roles, ordinary owner audience defaults, forged ethical chain scope and S8 stage visibility.

## Commands after migration history is reconciled

```powershell
.\.venv\Scripts\python.exe backend\manage.py check
.\.venv\Scripts\python.exe backend\manage.py migrate --noinput
.\.venv\Scripts\python.exe backend\manage.py seed_marketplace_categories
.\.venv\Scripts\python.exe backend\manage.py finalize_marketplace_data
.\.venv\Scripts\python.exe backend\manage.py check_marketplace_release
.\.venv\Scripts\python.exe backend\manage.py test marketplace ethical_marketplace --settings=core.test_settings
cd frontend_web\landing_next
npm run typecheck
npm run build
```

## Critical release blocker: migration history

The audited repository did not contain committed `migrations/` directories for either `marketplace` or `ethical_marketplace`, while the previous implementation handover states that marketplace migrations had already been applied to a development PostgreSQL database.

Do **not** fabricate a new migration history over an already-applied database. Before merge/deploy, inspect the target PostgreSQL `django_migrations` ledger, recover the exact previously generated migration files if available, or generate/reconcile a reviewed migration state after comparing the real schema. Commit that migration history. `check_marketplace_release` intentionally fails until both apps have committed migration history and no pending migrations.

## Suggested release flags

Enable ordinary/ethical write flags only after migration, tests, moderation and deployment checks. Keep `ETHICAL_S8_ENABLED=false` until the separate legal/compliance release decision is complete; code support does not itself authorise live S8 operation.

## Acceptance priorities

1. Verify every role sees only permitted Add item categories.
2. Verify ordinary pharmacy asset listing is denied to non-owner admins.
3. Verify pharmacy-owned ordinary listing begins at owned-chain contact scope.
4. Verify owner widening and scheduled widening.
5. Verify exact ethical admin grants still work from `/marketplace/ethical/access`.
6. Verify ethical draft -> owner publish -> audience widening -> transfer.
7. Verify S8 chain stage does not expose to unrelated same-organisation owners and platform remains impossible.
8. Verify ethical pharmacy switch never retains rows from the previous pharmacy.
9. Verify CSV import/reconciliation against synthetic approved products before live inventory.
10. Verify pending images remain private until moderation approval.
11. Run full PostgreSQL migration/upgrade test, Next typecheck/build and browser journeys before merging to production.
