# Existing ChemistTasker testing and container architecture

Inspected at PR #181 parent `9d1c6b760fcb3bb4e43215d03e37e0aacf047af3`.

## Source-controlled harness
- `docs/qa/SENIOR_PACKAGE_TESTING.md` is the canonical reusable acceptance checklist.
- `scripts/run-staging-qa.sh`: disposable `node:22-bookworm` JavaScript tests/builds; backend Docker image built **from repo root** using `-f backend/Dockerfile`; isolated Django checks/tests; `postgres:16` service in GitHub CI with host-network backend container; Rust/Tauri test image. Use only the workflow environment or an independently provisioned disposable PostgreSQL service.
- `.github/workflows/full_isolated_qa.yml`: 120-minute conditional PR job triggered with `full-qa` label and matching paths, always on main or workflow dispatch. No claim of execution on this child.
- `.github/workflows/e2e_runner_smoke.yml`: 24.x Node, `npm ci` for Vite/Next/e2e, Chromium, Docker authenticated acceptance plus a separate login smoke.
- `frontend_web/e2e/README.md`: TesterArmy and Playwright have separate configs/globs; authenticated e2e runner builds `backend/Dockerfile.dev`, starts synthetic Django/Next/Vite, uses **SQLite**, and tests owner/manager login/session boundaries. No full shift lifecycle tested there at this baseline.
- `.github/workflows/frontend_e2e_manual.yml`: Playwright Linux Vite, Windows appearance, Vite→Next integration and wiring diff. Visual baselines must be reviewed and not silently auto-accepted.
- `.github/workflows/native_mobile_acceptance.yml`: Android/iOS native acceptance is separate; do not equate emulator build with complete persona journey. iOS may be skipped depending on branch/input.
- Existing `shifts/test_shift_actions_contract.py`, `test_shift_posting_contract.py`, `test_access_escalation_contract.py`, `test_claim_eligibility.py`, `billing/tests.py`, `attendance_tests/test_acceptance_matrix.py` cover individual parts, **not proof of the entire workflow**.

## Commands for execution in an authenticated checkout

```bash
# From repository root, when isolated Postgres has been prepared by CI
bash scripts/run-staging-qa.sh

# Browser suites and e2e framework; install app/test dependencies first
cd frontend_web/e2e
npm ci
npm run e2e:install
npm run typecheck:e2e
npm run e2e:list
npm run test:e2e
npm run test:e2e:authenticated

# Existing Playwright runner: use canonical launcher, not bare npx Playwright
npm test -- frontend-appearance.spec.mjs --workers=2
```

## Mandatory evidence
For every run record: child PR URL, exact source SHA, clean tree, CI job URL and conclusion, test count and skips, PostgreSQL identity/port, screenshots/trace paths, Django state changes, web/native mode, and unresolved blockers. Current session **did not execute tests**: container has no accessible GitHub DNS, no cloned repo, and GitHub connector does not execute code. This phase performs a PR-head code inspection and writes docs through the GitHub connector; it is **not** a green CI result.

## Safety and gotchas
- Running `run-staging-qa.sh` directly assumes a healthy disposable PostgreSQL service on localhost:5432; its declared `pg_container` is not actually started by the script. Prefer GitHub `full_isolated_qa.yml` where the service is declared.
- Use repository-root Docker build context: `docker build -f backend/Dockerfile ... .`; not `docker build backend`.
- The TesterArmy authenticated browser backend is SQLite, not PostgreSQL concurrency proof.
- Native acceptance must record Android and iOS separately. Production DB backup/restore is outside lightweight E2E.
- Do not publish screenshots or fixture credentials that identify real pharmacies, patients or workers; redact secrets.
