# Shared-core consolidation review

**Branch:** `review/shared-core-consolidation-2026-09-17`  
**Baseline:** `ea1ca25e162961f1b7d8f5c95cd159b9eaaef427`  
**Purpose:** restore the original ChemistTasker architecture: one Django backend, one shared TypeScript client contract, many presentation clients.

## Non-negotiable architecture

ChemistTasker has one business backend. Django/DRF/Channels remains the authority for users, memberships, jobs/shifts, talent, roster, attendance, public content, Marketplace, Ethical Marketplace, chat, billing and related policy.

`@chemisttasker/shared-core` is a client SDK/contract package. It is **not** another backend. React, Next.js and Expo must reuse it instead of constructing ChemistTasker URLs or duplicating DTO mapping.

```text
React SPA -----\
Next.js --------> @chemisttasker/shared-core ---> one Django /api + Channels backend
Expo Mobile ---/

Tauri kiosk ---- shared protocol/contracts + native secure implementation ----/
```

The native kiosk keeps SQLCipher, keyring, Ed25519 private keys, device-token storage, local outbox and capture locking in Rust/Tauri. Only its wire contracts, endpoint identities and canonical protocol types are shared.

## Existing backend mount points preserved

No second backend is introduced. `backend/core/urls.py` already mounts:

- `/api/users/`
- `/api/public-hub/`
- `/api/marketplace/`
- `/api/ethical/`
- `/api/content/`
- `/api/client-profile/`
- `/api/billing/`
- `/api/account/`

This branch deliberately does not move or duplicate backend business logic.

## What this review branch adds

1. `shared-core/src/transport/client.ts`
   - instance-based `createApiClient()`;
   - bearer-token injection and one refresh retry;
   - JSON/FormData-safe body handling;
   - query serialization;
   - request-scoped design suitable for Next.js SSR;
   - no global user token required for new clients.

2. `shared-core/src/constants/platformEndpoints.ts`
   - request-scoped/public route catalogue for Public Hub/blog/news, content management, Marketplace and Ethical Marketplace;
   - kiosk server endpoint identities only;
   - authenticated Attendance, Roster V2 and Workforce routes were moved back to `API_ENDPOINTS` in CP2 so operational domains have one owner.

3. `shared-core/src/platformApi.ts`
   - grouped request-scoped API facade for public content, Marketplace, Ethical Marketplace and content management;
   - named Article/Hub/community operations replace the former generic public-content escape hatch;
   - Django's Article reaction contract is preserved exactly (`PUT` create/change, `DELETE` remove);
   - authenticated operational domains remain on the established `api.ts` transport.

4. `shared-core/src/index.ts`
   - exports the new transport, platform API and endpoint registry;
   - keeps all existing `configureApi()` and legacy exports intact.

## Current client situation

### React SPA

Consumes the repository-linked `@chemisttasker/shared-core` package. Existing shared calls remain canonical; local files such as `src/api/hub.ts` may remain only as thin presentation adapters with no independent backend route construction.

### Expo mobile

Consumes the same repository-linked shared package. SecureStore/session/bootstrap and native permissions remain mobile-specific, while ChemistTasker route construction and cross-client DTO contracts stay in shared-core.

### Next.js/public app

Is a first-class shared-core consumer. Server-side requests create request-scoped API instances; browser requests use the cookie/CSRF bridge. Named shared-core operations own Public Hub/articles/content/Marketplace/Ethical Marketplace integration rather than a copied SDK or generic Hub wrapper.

### Package model

For local development all three clients link the repository `shared-core` directory and automatically build it before installation. CI builds and packs shared-core once, publishes one workflow artifact plus SHA-256, then Vite, Next and Expo all verify and install those exact package bytes. No checked-in shared-core tarball remains.

## Migration rule: reuse before create

For every feature change:

1. Search `shared-core` for an existing operation.
2. If it exists, reuse it unchanged unless the backend contract itself changed.
3. If it does not exist, check whether Django already has the endpoint.
4. If Django has it, add one shared-core endpoint + function + types/mappers.
5. Only if Django does not have the required business operation should a new backend endpoint be created.
6. React, Next.js and Expo then import the same shared operation.

No client may introduce a new internal ChemistTasker `fetch('/api/...')` or `axios.*('/api/...')` implementation as the primary integration path.

## Domain migration order

### SC00 — inventory and freeze

Produce an auditable matrix of Django route -> shared-core function -> React consumer -> Next consumer -> Expo consumer. Mark each row `SHARED`, `MISSING_WRAPPER`, `DUPLICATED_CLIENT`, `PLATFORM_SPECIFIC`, or `UNUSED`.

Do not delete existing API helpers during inventory.

### SC01 — transport compatibility

Keep `configureApi()` for existing React/Expo code. Use `createApiClient()` for new work and Next.js SSR. Add transport tests for auth/no-auth, refresh, FormData, JSON, query arrays and errors.

### SC02 — endpoint catalogue

Merge the old `API_ENDPOINTS` and new `PLATFORM_ENDPOINTS` gradually into one authoritative catalogue after all legacy consumers are mapped. Avoid a big-bang rename.

### SC03 — Public Hub / Blog / News / Content

Add formal request/response DTOs and mappers for:

- article list/detail;
- comments/reactions/reports;
- member context;
- content team/documents/invitations/media/moderation/audit.

Migrate React and Next callers to shared-core. Expo can then add screens without reimplementing networking.

### SC04 — Marketplace

Formalize and migrate:

- categories;
- public listings/detail;
- access/listing-options;
- seller listings/dashboard;
- eligibility/audience;
- images/enquiries/internal transfers;
- exchanges/messages/actions;
- saved/reports;
- catalogue lookup.

Marketplace policy stays in Django. Shared-core transports the contract only.

### SC05 — Ethical Marketplace

Formalize and migrate:

- access and seller listings;
- pharmacy approval/grants/revoke;
- catalogue;
- imports/commit;
- lots/reconcile;
- listings/requests/actions;
- transfers/messages/documents/actions.

Never duplicate ethical escalation, S8 ceilings, owner/organization visibility or approval decisions in clients.

### SC06 — Roster and attendance

Reuse existing legacy roster functions first. Add DTOs/wrappers for Roster V2 and attendance:

- period/validate/publish/unpublish/archive;
- worker published roster/acknowledgement;
- templates/copy/bulk edit;
- swap/cover and manager actions;
- audit feed;
- worker attendance status/actions;
- manager pending/approval/rejection/correction/timeline.

The same functions must serve React and Expo.

### SC07 — Kiosk contract boundary

Share endpoint identities, signed event types and server request/response contracts. Do not move native secret handling or encrypted local persistence into TypeScript.

### SC08 — Job Board / Talent Board convergence

Inventory the existing job/talent calls already present in shared-core. Where both surfaces use the same backend operation, expose one canonical shared function. Where Django semantics genuinely differ, expose two named shared functions but never duplicate them per client.

### SC09 — Next.js adoption

Rebuild and repack shared-core, then add the same package version to `landing_next`. Replace internal ChemistTasker Axios/fetch calls domain-by-domain. For server components/actions create one `createChemistTaskerApi()` instance per incoming request/auth context.

Next.js remains presentation/SSR infrastructure; it must not become a second business API or database layer.

### SC10 — Expo adoption

Replace any remaining internal ChemistTasker calls or duplicated DTO transforms with shared-core imports. Keep native permission/storage/UI code local.

### SC11 — package convergence

Build shared-core once and make React, Next and Expo use the exact same artifact/version/hash. Eliminate manually divergent tarballs. Prefer workspace/source linking in development and one CI-produced package artifact for release builds.

### SC12 — enforcement and CI

Add a boundary audit that rejects newly introduced internal ChemistTasker URL literals/direct fetch/axios calls outside approved shared-core/bootstrap/native allowlists. Baseline existing violations first and drive the count to zero; do not enable a failing zero-tolerance rule before migration.

CI order:

1. shared-core typecheck/tests/build;
2. React typecheck/build against that output;
3. Next.js typecheck/build against that output;
4. Expo typecheck/lint against that output;
5. backend contract/migration tests;
6. boundary audit.

## JSON/DTO rule

Django serializer JSON is the wire truth. Shared-core owns the TypeScript wire interface and any wire-to-domain mapping. A React, Next or Expo component must not independently reinterpret `snake_case` fields or maintain a competing copy of the same response interface.

During migration, new platform functions intentionally default to `unknown`/caller-supplied generic types rather than guessing serializer schemas. Replace those generics with formal shared contracts only after confirming the serializer output and consumer requirements.

## Packaging convergence

The stale checked-in tarball model has been removed.

Repository development uses local source links:
- Vite and Expo: `file:../shared-core`;
- Next: `file:../../shared-core`.

Each client `preinstall` calls `scripts/prepare-shared-core.mjs`, which runs a clean shared-core install and build. CI sets `CT_SHARED_CORE_SKIP_PREPARE=1` because its package path is different: the `shared-core` job builds and packs once, generates a SHA-256 file, uploads the package artifact, and all three client jobs download, verify and install that exact tarball.

`scripts/audit-shared-core-package.mjs` fails if a checked-in `.tgz` reappears, a client stops linking the repository package, or the three lockfiles drift from the shared-core package version/link model.

## Definition of done

- one Django/DRF/Channels backend remains the only business backend;
- one canonical shared-core package/version is consumed by React, Next and Expo;
- all new cross-platform Django routes have shared-core endpoint identity + typed wrapper;
- Job Board and Talent Board reuse existing shared operations wherever backend semantics match;
- Blog/News, Marketplace, Ethical Marketplace, Roster V2 and attendance are shared-core driven;
- kiosk wire contracts are shared while native security/storage remains native;
- duplicate wire interfaces/mappers are removed from clients;
- no new direct internal ChemistTasker fetch/axios path is introduced outside explicit allowlists;
- all clients pass against the same shared-core artifact;
- no second Next/mobile/JSON backend or competing business-rule implementation exists.
