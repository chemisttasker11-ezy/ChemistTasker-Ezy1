# Canonical API v1 cutover — F06

F06 deliberately removes the unversioned ChemistTasker application API and the historical
`/api/client-profile/` HTTP namespace. The canonical backend root is now `/api/v1/`.
This is a routing/client migration only: handlers, serializers, permissions, database
models, migrations, Celery task names and WebSocket routes are not re-owned by this change.

## Mapping rule

The cutover is lossless by suffix:

| Previous HTTP family | Canonical family | Django owner / handler | Contract and callers |
| --- | --- | --- | --- |
| `/api/users/**` | `/api/v1/users/**` | `users.urls` | Same auth/account views and payloads; Vite, Expo and Next session clients use the v1 base. |
| `/api/public-hub/**` | `/api/v1/public-hub/**` | `public_hub.urls` | Same public/community handlers and anonymous-read permissions; Next BFF forwards here. |
| `/api/marketplace/**` | `/api/v1/marketplace/**` | `marketplace.urls` | Same public/private marketplace serializers and permissions; generated image URLs now emit v1. |
| `/api/ethical/**` | `/api/v1/ethical/**` | `ethical_marketplace.urls` | Same private ethical handlers and no-store/access policy. |
| `/api/content/**` | `/api/v1/content/**` | `public_hub.content_urls` | Same editorial/content-management handlers and capability checks. |
| `/api/billing/**` | `/api/v1/billing/**` | `billing.urls` | Same billing namespace and permissions. No payer-policy change. |
| `/api/account/` | `/api/v1/account/` | `users.views.DeleteAccountView` | Same account-deletion handler. |
| `/api/client-profile/<suffix>` | `/api/v1/<suffix>` | `core.api_v1_urls` composes domain-owned URLconfs | Same viewsets/actions/serializers/permissions; the compatibility app label remains only where migration/model/Celery identity requires it. |
| `/api/client-profile/finance/**` | `/api/v1/finance/**` | `worker_finance.urls` | Finance transport remains path-confined by shared-core. |
| guarded `/api/client-profile/invoices/<id>/**` | guarded `/api/v1/invoices/<id>/**` | `worker_finance.legacy` before `invoicing.urls` | Managed snapshots still cannot fall through to the legacy invoice editor. |
| `/api/client-profile/attendance/kiosk/**` | `/api/v1/attendance/kiosk/**` | `attendance.urls` | URL changes only. Native kiosk device signing/token transport remains separate from user bearer transport. |

All DRF router actions retain their existing method/action mapping because F06 reuses the same
router registrations and view classes in the same order. Fixed `path()` declarations are included
from the same domain URL modules. Therefore GET/POST/PUT/PATCH/DELETE method support, permission
classes, serializer selection and response schemas remain owned by the pre-existing handlers.

## Namespace and reverse-reference contract

The project-level namespace for the composed domain API is now `api_v1:`.
Representative reverse contracts are pinned for organizations, chat, calendar and onboarding.
The former `client_profile:` URL namespace is not mounted. The Django app label
`client_profile` remains intact for historical model/migration/Celery identity and is not an HTTP
compatibility namespace.

## Shipping caller migration

- **Vite:** both the public constant and shared-core initialization normalize host, `/api`, or
  already-versioned configuration to exactly `/api/v1`. Local proxy mode exposes
  `/api/v1` same-origin.
- **Expo:** `resolveApiBaseUrl` normalizes the configured device/browser host to
  `/api/v1`; shared endpoint paths no longer contain `client-profile`.
- **Next:** browser-facing `/api/platform/**` and `/api/hub/**` remain internal BFF routes.
  Their server upstream and SSR shared-core client target `/api/v1`. Cookie/CSRF behavior is
  unchanged.
- **Kiosk:** shared endpoint identity is `/attendance/kiosk/**` relative to the v1 root. Native
  device-token signing remains in its restricted transport.
- **WebSocket:** `/ws/**` is intentionally unchanged and is outside HTTP API versioning.

## Removal and enforcement

The project URLconf contains no unversioned application mount. Contract tests require representative
old paths to raise `Resolver404` and require the finance guard to resolve before the canonical
invoice editor. `scripts/audit-api-v1-cutover.mjs` scans maintained backend/client/shared-core/CI
source and fails on any reintroduced unversioned application path, `/client-profile/` relative API,
or Django `client_profile:` reverse call. It runs in the required architecture CI gate.

## F07 boundary

F06 proves the source/router/caller cutover. It does **not** claim final production acceptance.
F07 still owns actual browser/native journeys, generated schema diff, populated PostgreSQL upgrade
and fresh install, concurrency/deployment/security acceptance on the final integrated tree.
