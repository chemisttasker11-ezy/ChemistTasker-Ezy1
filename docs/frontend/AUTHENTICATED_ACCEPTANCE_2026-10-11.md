# Authenticated web acceptance - 2026-10-11

Compared the integrated source main (`ce866a775d76046870d5bb3a5a3f8f29bc0e7039`) with the pre-integration local main (`a4fb05bd5caa3a68a639544729c419eea868015a`). Native Expo acceptance remains deferred.

## Wiring findings and repairs

- **Introduced regression:** organization dashboard workspace normalization removed an explicit `pharmacy_id`, broadening the request to the organization. Preserve an explicit positive pharmacy ID while authorized memberships load. Django continues to reject unauthorized locations; normalization must not silently widen the request.
- **Existing defect exposed by the integrated web flow:** dashboard pharmacy selection changed the URL but the pharmacy hub selected a different default location. Honor `workspace=internal&pharmacy_id=...` when an explicit hub deep-link scope is absent, and ignore responses from an obsolete scope load.
- **Existing defect:** signing in with a logout route as the return destination immediately signed the user out. Reject logout action routes in the shared return-link validator, including encoded and delegated-admin variants.
- **Existing defect:** shared-core shift detail requests omitted Django's canonical trailing slash. The browser transport rejects redirects, leaving the edit form unloaded. Use the existing endpoint registry for active, community, and public shift details.

These repairs preserve API payloads, cookie authority, CSRF protection, server authorization, delegated pharmacy boundaries, and explicit hub deep-link precedence. They do not revert documented frontend route consolidation or accepted policy changes.

## Real authenticated acceptance

Used isolated Next (3011), Vite (5191), and Django (8011), a disposable SQLite database, and synthetic users/data. Browser journeys used real endpoints without response interception. Existing local services and databases were retained.

- Owner login through Next preserved the Vite destination and pharmacy query. Active shifts, revealed candidate details, counteroffer details, and an anonymous candidate's withheld identity were checked.
- Shift editing loaded its real detail response and populated the form after the endpoint repair.
- Pharmacy hub and dashboard search followed location selection; the visible hub matched its URL scope.
- HttpOnly cookie authority, reload, access-cookie expiry followed by real refresh, missing-CSRF rejection, logout, protected-route redirect, and subsequent login were checked.
- Delegated manager access succeeded for the assigned pharmacy and failed for another pharmacy; an unauthorized admin URL did not switch to another pharmacy's admin workspace.
- A worker created a synthetic customer and draft invoice. The invoice list refreshed, and a legacy invoice deep link opened the correct composer. No invoice was sent or paid.
- Organization admin and regional admin dashboard responses respected their different finance visibility. Explicit organization pharmacy scope remained on every observed dashboard API request. An unauthorized requested pharmacy returned 403 and remained explicit instead of widening to all locations.
- Next's public shift board resolved the existing authenticated worker cookie session. The backend also recorded real notification WebSocket connections.

## Checks and limits

- Shared-core: 145 tests passed, including three canonical detail URL regressions; typecheck and build passed.
- Web authentication and WebSocket unit checks: 12 passed.
- Web and Next TypeScript checks passed; isolated web production build passed.
- Selected maintained browser regressions: 12 passed against the configured production preview, covering persona routing, community wiring, and invoice refresh behavior.
- Shared-core package/transport audits and targeted whitespace checks passed.

This is local web acceptance against SQLite. It does not establish native-device behavior, staging/production deployment behavior, PostgreSQL concurrency, external payment processing, email delivery, or exhaustive acceptance of every workflow. Native Expo acceptance is intentionally left for later.

Local evidence is retained under `C:\ChemistTasker_Ezy\backups\authenticated-acceptance-20261011`, including request logs, browser traces, the wiring comparison, and the configured regression run. Harness setup failures were resolved before the successful checks reported above.
