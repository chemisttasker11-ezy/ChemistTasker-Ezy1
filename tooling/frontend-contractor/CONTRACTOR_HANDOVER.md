# Developer responsibilities, access and acceptance

**Repository:** `chemisttasker11-ezy/ChemistTasker_Front` (PRIVATE). **Owner repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1` (no contractor permissions).

## Ownership

- React/Vite: dashboards, owner/pharmacist/other staff/explorer pages, onboarding, rosters, shifts, pharmacy hub, messaging, finance and talent workspaces.
- Next.js: public landing, shift listings, job dashboard, marketplace, learning and content navigation, keeping signed-in handoffs with Vite.
- Expo Android/iOS: shared native source, navigation and feature parity with web. Native release signing and production submission stay with the owner.
- `shared-core`: shared API client, DTOs, types and user-side validation. Keep it single-source to avoid spaghetti duplicates; coordinate backend-contract changes with the owner.

## Staging backend

The developer runs ONLY frontend processes locally and connects to an isolated owner-hosted Django staging instance. Ask the owner for a stable HTTPS API root and WebSocket URL. The placeholder in `.env.example` is intentionally not an operational address. Do not connect to production.

Use synthetic accounts (Owner, Organisation Admin, Pharmacist, Other Staff, Explorer). Report any API contract mismatch by request path, method, expected/actual status, sanitized payload shape, and reproduction steps. Do not send passwords, session cookies, bearer tokens, signed media or personal information in PR comments.

Web/Expo auth and OTP tests need owner-approved staging accounts and test messaging setup. Payment, billing, push, Firebase and external integrations must be sandboxed or disabled; do not initiate real transactions from test accounts.

## Contribution rules

1. Branch from main. Keep feature PRs focused and small; include screenshots of signed-in/anonymous/loading/empty/error/disabled views where applicable.
2. Keep React and Next public URL handoffs, session refresh, CSRF and WebSocket behaviour intact. Never weaken backend authorization or hardcode trusted roles into a request.
3. Run the frontend-only GitHub CI and add tests covering navigation, API errors and visual states. Communicate backend changes via a typed contract proposal, not by editing Django source.
4. No Docker production deploy, Redis/PostgreSQL connection, GitHub Actions secrets, Firebase production project, Stripe production project or EAS production app credentials.
5. Do not alter the source-integration guard or cross-repository ownership workflow without explicit owner review.

**Handover acceptance:** repo remains private, history contains no backend files, all four frontend app folders and shared client package are present, CI passes, test identities log into a segregated staging API, and owner verifies role-specific workflows before merging into the full monorepo.
