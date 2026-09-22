# ChemistTasker Shared Core

`@chemisttasker/shared-core` is the shared TypeScript SDK/contract package used by the ChemistTasker Vite web app, Next.js public app and Expo mobile app. Django remains the only business backend.

## Repository development

The three first-party clients link the repository source directly:

- Vite: `file:../shared-core`
- Next.js: `file:../../shared-core`
- Expo: `file:../shared-core`

Each client has a `preinstall` hook that runs `scripts/prepare-shared-core.mjs`. The hook installs shared-core dependencies with `npm ci --ignore-scripts` and builds `dist/` before the linked package is used. This prevents local installs from silently using a stale checked-in tarball.

Do not add a committed `chemisttasker-shared-core-*.tgz` file back to the repository.

## CI/release package

CI does not rely on the development source link for validation. The Shared Core Consolidation workflow:

1. typechecks, tests and builds shared-core once;
2. packs one `.tgz` artifact;
3. writes a SHA-256 checksum;
4. uploads that single package artifact;
5. makes Vite, Next.js and Expo download and verify the same checksum;
6. installs that exact tarball into each client before typecheck/build.

This proves all three clients against the same compiled package bytes.

## API ownership

- `src/api.ts`: established authenticated Vite/mobile API surface, including Workforce, EmploymentEngagement, Timesheets, Attendance, Roster V2 and Worker Finance.
- `src/platformApi.ts`: request-scoped public/platform facade for Next/public content, Marketplace, Ethical Marketplace and content management.
- `src/constants/endpoints.ts`: authenticated/legacy endpoint authority, including operational domains and Finance.
- `src/constants/platformEndpoints.ts`: public/platform endpoint authority plus kiosk endpoint identities.
- `src/transport/client.ts`: request-scoped transport used by the platform facade.
- `src/contracts/`: confirmed cross-client wire contracts.
- `src/kioskProtocol.ts`: shared kiosk wire contracts only; native secret/device transport remains in Tauri/Rust.

## Authenticated setup

Existing Vite/Expo consumers configure the established API once:

```ts
import { configureApi } from '@chemisttasker/shared-core';

configureApi({
  baseURL: apiBaseUrl,
  getToken: async () => tokenStore.getToken(),
  credentials: 'include',
});
```

Next.js uses `createChemistTaskerApi()` with a request-scoped/browser-specific transport rather than mutating the authenticated global configuration.

## Development

```bash
cd shared-core
npm ci
npm run typecheck
npm run test:ci
npm run build
```

From a client directory, a normal `npm ci` prepares and links the repository shared-core automatically.

## Guardrails

- Reuse a named shared-core operation before creating a client-local request.
- Add a Django route to the appropriate shared endpoint catalogue before client adoption.
- Do not duplicate Django permissions, Marketplace policy, employment rules, award calculations or other business decisions in clients.
- Do not route native kiosk device-token/offline transport through the end-user bearer client.
- `scripts/audit-shared-core-boundary.mjs` rejects newly introduced client bypasses.
- `scripts/audit-shared-core-package.mjs` rejects package drift or reintroduced checked-in tarballs.
