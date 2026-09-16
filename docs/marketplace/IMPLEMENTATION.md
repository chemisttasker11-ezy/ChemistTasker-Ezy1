# Marketplace implementation handover

Date: 2026-09-16

The ordinary-goods marketplace and private ethical marketplace are implemented as separate Django domains and share the existing public Next shell. The product specification is `ChemistTasker-Marketplace-and-Home-Plan-v3.md`; this file records implementation facts, not new product policy.

## Boundaries

- Public pages: `/marketplace`, `/marketplace/items/<uuid>/<slug>`, `/marketplace/medicines`.
- Signed-in goods workspaces: `/marketplace/new`, `/marketplace/mine`, `/marketplace/exchanges`.
- Private ethical workspaces: `/marketplace/ethical/*`.
- Browser API prefixes: `/api/platform/marketplace/` and `/api/platform/ethical/`.
- Django API prefixes: `/api/marketplace/` and `/api/ethical/`.
- Public goods serializers never import or serialize ethical product, inventory, PAN, pharmacy-name, user-name, contact, exact-address or evidence fields.
- Ethical responses use `private, no-store` and `noindex` headers. Ethical objects never enter the sitemap.

## Permission invariants

- Browsing approved ordinary goods is anonymous.
- Trading requires an active account, email and mobile verification, completed verified role onboarding, accepted identity assurance, current marketplace terms, adult assurance where applicable, and no active marketplace restriction.
- Pharmacy-owned ordinary goods require a current verified ownership relationship. Existing workforce, pharmacy-admin and organisation-admin permissions do not grant this authority.
- Ethical premises applications can be prepared without an existing PAN approval. Inventory and stock discovery cannot.
- Ethical operations require a verified premises approval, reviewed professional access, reviewed effective-dated jurisdiction policy and either current ownership or an exact `EthicalPharmacyGrant` action.
- Organisation and platform ethical additions are owners. Eligible chain admins are retained only through a current grant in the chain context.
- S8 is never public or platform-wide and is capped at a real shared organisation, in addition to operation policy checks.

## Feature switches

All write/commitment flags default safely off in `core/settings.py`. Enable only after review:

- `MARKETPLACE_READ_ENABLED`
- `MARKETPLACE_NEW_LISTINGS_ENABLED`
- `MARKETPLACE_CONTACT_ENABLED`
- `MARKETPLACE_NEW_COMMITMENTS_ENABLED`
- `MARKETPLACE_ESCALATION_ENABLED`
- `MARKETPLACE_CATALOGUE_LOOKUP_ENABLED`
- `MARKETPLACE_ALL_WRITES_ENABLED`
- `ETHICAL_ACCESS_APPLICATIONS_ENABLED`
- `ETHICAL_PRIVATE_READ_ENABLED`
- `ETHICAL_INVENTORY_ENABLED`
- `ETHICAL_NEW_TRANSFERS_ENABLED`
- `ETHICAL_ESCALATION_ENABLED`
- `ETHICAL_S8_ENABLED`

Flags never bypass object policy. The ethical code is complete for synthetic and approved scopes; a production flag is not legal authorisation for an unsupported jurisdiction, product or activity.

## Deployment

```powershell
.\.venv\Scripts\python.exe backend\manage.py migrate --noinput
.\.venv\Scripts\python.exe backend\manage.py seed_marketplace_categories
.\.venv\Scripts\python.exe backend\manage.py check
.\.venv\Scripts\python.exe backend\manage.py test marketplace ethical_marketplace --settings=core.test_settings
```

Worker imports include `marketplace.tasks` and `ethical_marketplace.tasks`. Scheduled escalation remains off until the corresponding flag is enabled; each job locks its step and rechecks listing state, consent revision, authority and policy.

## Verification recorded

- Django system check: pass.
- Marketplace/ethical focused tests: pass.
- Marketplace/ethical migration drift check: pass.
- Existing development PostgreSQL: marketplace migrations applied and four approved ordinary categories seeded.
- Anonymous direct goods API and proxied Next API: HTTP 200.
- Anonymous ethical catalogue: HTTP 401 with no product payload.
- Next TypeScript check and production build: pass.
- Browser: public marketplace loads a true zero-result state; public-to-private ethical route is reachable without preloading protected data.

The repository's pre-existing squashed `users` and `client_profile` migration state cannot bootstrap a fresh PostgreSQL test database because of a circular state dependency. `core.test_settings` provides an isolated SQLite model-sync test environment for focused marketplace tests; the normal deployed migration plan and existing PostgreSQL upgrade both succeed. Resolve the legacy squash before claiming a clean full-repository bootstrap gate.
