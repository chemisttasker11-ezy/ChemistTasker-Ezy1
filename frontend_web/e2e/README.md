# ChemistTasker browser tests

The existing Playwright suite (`npm test` here) and the tester-army/e2e
runner (`npm run test:e2e`) have separate configs and test globs.

## Run tester-army/e2e

From `frontend_web/e2e`:

```powershell
npm ci
npm run e2e:install
npm run typecheck:e2e
npm run e2e:list
npm run test:e2e
```

From `frontend_web`, `npm run test:e2e` runs the same suite. Pass runner flags
from the test directory, for example `npm run test:e2e -- --headed`.
Application dependencies must be installed in `frontend_web` first.

The runner requires Node 22.22.3+ on Node 22, or Node 24.8+. The launcher
uses a supported Node on PATH, falling back to Codex's bundled Node on
Windows. To select another runtime explicitly:

```powershell
$env:E2E_NODE_BINARY = 'C:\path\to\node.exe'
npm run test:e2e
```

The launcher builds Vite into `.e2e/site`; the runner starts a preview on a
free loopback port and stops its own server afterward. It does not use the
shared development servers. Screenshots, traces, logs, cache, and
`report.json` stay under ignored `.e2e/`. `npm run e2e:mcp` builds the app
and serves the runner's MCP interface when configured in a client.

The first smoke test checks the login form, empty-submission validation,
and the resulting URL, with a screenshot and trace. It stubs only the
signed-out session bootstrap API responses, following the existing
Playwright suite. It does not sign in or
prove backend authentication. No model credentials or test accounts are
needed. AI-driven `agent.*` steps require adding a model provider and
authentication; the globally installed `e2e` skill contains that setup.

## Authenticated web acceptance

With Docker Desktop running and application dependencies installed in both
`frontend_web` and `frontend_web/landing_next`, run from `frontend_web`:

```powershell
npm run test:e2e:authenticated
```

The launcher builds `backend/Dockerfile.dev` using Docker's cache, allocates free loopback
ports, and starts a Docker backend with a fresh SQLite database and synthetic
owner/manager accounts. Passwords are generated per run and supplied through the
runner's opaque credentials API. It copies the web application into ignored test
storage and runs isolated Next/Vite instances; local environment files, databases,
and running development services are not used. Backend source is mounted read-only.
The labelled container and owned frontend processes stop after the run, including
failure. Generated evidence and disposable database files remain under `.e2e/`.

The two journeys check real Next login and Vite handoff, explicit pharmacy scope,
HttpOnly session cookies, reload with automatic refresh after access-cookie expiry,
CSRF rejection, logout/protected-route redirect, and delegated manager access to
only the assigned pharmacy. They use real Django endpoints without interception.
These are SQLite web journeys; native Expo, PostgreSQL concurrency, external
payments, and delivery providers are outside their scope.

From the frontend-only checkout, set `E2E_SOURCE_ROOT` to the source checkout before
running this command. Backend files remain in the source repository. Override
`E2E_BACKEND_IMAGE` to use an explicitly prepared compatible backend image.
The default image automatically reflects backend requirements and Dockerfile changes.

The `E2E Runner Smoke` GitHub Actions workflow checks types, discovers tests,
and runs this suite on frontend pull requests and pushes to main. It can also
be started manually. Reports, screenshots, traces, and app logs are uploaded
even when a test fails.
