# ChemistTasker frontend workspace (private contractor repository)

This is a **fresh-history snapshot** of the ChemistTasker owner monorepo's React/Vite dashboards, Next.js public site, Expo Android/iOS source and the shared TypeScript API client. It contains **no Django backend source**, production database credentials, release signing material, or Rust kiosk runtime.

## Local setup (Node 22)

1. Request the **isolated staging** API hostname and synthetic test accounts from the owner. Never use the production host or real customer accounts.
2. Copy `env/web.dev.env.example` to `env/web.dev.env`, replace the placeholder staging URL, and configure only test-approved public integration keys if needed. The local file is ignored by Git.
3. From the repository root run:

   ```sh
   cd frontend_web
   npm run install:all
   npm run dev
   ```

   Public Next.js runs at `http://localhost:3000`; Vite dashboard runs at `http://localhost:5173`. API, websocket, CSRF and media requests proxy through the frontend server to the owner-hosted staging Django service.

## Expo Android/iOS development

1. Copy `frontend_mobile/.env.example` to `frontend_mobile/.env`, change the API and WebSocket hostname to **staging**.
2. From the repository root run:

   ```sh
   cd frontend_mobile
   npm ci
   npx expo start
   ```

3. Expo uses the included **contractor-only `app.config.js`**: production EAS update delivery, production app identifiers, production Firebase app plugin and crash reporting are disabled. Original production signing files are intentionally unavailable. Some native capabilities require a separately provisioned **staging Firebase project and an approved development build**; Expo Go cannot supply every native module. Coordinate these with the owner. Do not connect or submit to production Google Play, App Store Connect, EAS or Firebase.

## Review and security rules

- The owner monorepo remains private and off-limits. Never add any Python backend source, database, server credentials, secrets, deployment config, customer data or signed media here.
- Run `node scripts/check-frontend-boundary.mjs` in the root. The same guard runs in every PR CI along with web/mobile/shared-core builds and tests.
- Only submit frontend PRs. Changes to API contracts require an explicit owner request; UI changes cannot weaken Django authorisation or browser-origin/CSRF checks.
- Use `node scripts/check-staging-api.mjs https://YOUR-STAGING-HOST` for the anonymous API smoke test; authenticated end-to-end journeys require the real isolated staging service.
- Frontend work approved here is imported into the owner monorepo through a **separate reviewed integration PR**. The contractor should never have access to the owner migration tool or production deployment keys.
