# P21/P22-G1 implementation handoff

Implemented the approved P20 design with O1 (2026-11-07). No commit or push. Mobile was not edited.
PostgreSQL verification is BLOCKED, so this is not a fully gated completion.

## Behavior

- Scoped UUID ledger reserves and stores the pitch and original 201 JSON/Location receipt in one transaction.
- Matching retries bypass serializer validation; fingerprint mismatch is 409 with the owned original ID.
- Missing/invalid UUID is 400 IDEMPOTENCY_KEY_REQUIRED with an update-app message.
- Replay lasts 30 days; expired keys remain consumed (410 IDEMPOTENCY_REPLAY_EXPIRED).
- Pitch deletion retains the ledger via SET_NULL (410 PITCH_DELETED); account deletion explicitly purges receipts.
- Daily Celery cleanup and `cleanup_pitch_receipts` management command remove expired response bodies/headers.
- Pharmacy canonical hashing was extracted without changing its representation or replay behavior.
- Both web clients persist a frozen account/environment-scoped intent before POST, coordinate through Web Locks,
  resume before loading defaults, cancel on account change/unmount, acknowledge before reload, and reconcile 409/410.
- Browser logout/account cleanup retains scoped pending records. The Next proxy now forwards Idempotency-Key.
- A refused 400 validation request stays frozen until explicit correction; 409/410 never rotate keys automatically.
- Editing stays PATCH; Explorer one-post and seven-day feed-position behavior remain unchanged.

Migration: `backend/talent/migrations/0007_pitchcreaterequest.py` (after 0006 plus swappable user dependency).
The .gitignore exception includes only talent management commands, which the existing global rule hid.

## Failing-first evidence

- `g1-failing-first-sqlite.log`: 16 discovered, 6 failures, 5 errors, 5 PostgreSQL skips before implementation.
  Demonstrated unkeyed acceptance, duplicate retries, failed receipt rollback, missing ledger, and unique-reference replay failure.
- `g1-shared-failing-first.log`: pending-intent suite failed to import the absent helper before implementation.
- `g1-proxy-failing-first.log`: regression failed before forwarding the UUID header; now passes.
- `g1-failing-first.log`: PostgreSQL could not start tests: local postgres authentication rejected default credentials.
  Access to the authorized source backend.dev.env was denied, and the worktree copy is absent. PostgreSQL red/green
  evidence has NOT been obtained. The seven TransactionTestCase races use barriers, independent connections, bounded
  joins and surfaced worker exceptions, but still require a PostgreSQL run.

## Gates

- Talent SQLite: 65 discovered, 58 passed, 7 PostgreSQL skips (`g1-sqlite.log`).
- Final SQLite talent + verification transitions + pharmacy idempotency: 112 discovered, 104 passed, 8 skipped
  (7 PostgreSQL races, 1 existing PostgreSQL-only verification case), `g1-backend-final.log`.
- Shared-core: 59 files, 476 tests passed; 15 pending-pitch tests. `g1-shared-final.log`.
- Shared-core `npx.cmd tsc --noEmit`: passed; local declaration build also passed.
- Next proxy: 1 regression test passed; adjacent API-root/store-link checks: 7 passed.
- `makemigrations --check --dry-run --settings=core.contract_test_settings`: passed, no changes detected.
- Required Vite `npx.cmd tsc -p tsconfig.app.json --noEmit`: failed with 122 diagnostics against stale linked
  shared-core declarations (`g1-web-tsc.log`). No packages installed and no linked dependencies changed.
- Vite using this branch's generated declarations via ignored temporary config: passed (`g1-web-source-tsc.log`).
- Additional Next source/declaration check: blocked by 168 diagnostics from missing Next/Node dependencies
  (`g1-next-source-tsc.log`); no TalentBoard index diagnostics. Existing PitchDialog process.env usage lacks Node types.
- `git diff --check`: passed. Changed text files use LF.

## Remaining work

1. Make `env/backend.dev.env` available locally (do not paste secrets into chat), then run:
   `python backend/manage.py test talent organizations.test_pharmacy_create_idempotency --settings=core.postgres_test_settings --noinput`
   using the supplied Python executable and DJANGO_ENV_FILE pointing at that file. Django must create/destroy its test DB.
2. Repeat the required web/Next gates with dependencies matching this branch. Do not install packages without a new instruction.
3. Native browser/UI acceptance was not run; no Playwright dependency exists in this worktree's e2e folder.
4. Independent review remains with the orchestrator. Mobile is a separate run.

No test runner wrote to the real chemisttasker database. SQLite used isolated test databases; PostgreSQL authentication
failed before test setup. Temporary test-only settings and logs remain ignored locally, without copied secrets.

## Files changed

- `.gitignore`
- `backend/core/request_fingerprint.py`
- `backend/core/settings.py`
- `backend/onboarding/test_verification_transitions.py`
- `backend/organizations/views.py`
- `backend/talent/account_cleanup.py`
- `backend/talent/management/__init__.py`
- `backend/talent/management/commands/__init__.py`
- `backend/talent/management/commands/cleanup_pitch_receipts.py`
- `backend/talent/migrations/0007_pitchcreaterequest.py`
- `backend/talent/models.py`
- `backend/talent/receipt_cleanup.py`
- `backend/talent/tasks.py`
- `backend/talent/test_explorer_api.py`
- `backend/talent/test_newcomer_rules.py`
- `backend/talent/test_pitch_idempotency.py`
- `backend/talent/views/explorer.py`
- `frontend_web/landing_next/lib/platform-proxy.test.mjs`
- `frontend_web/landing_next/lib/platform-proxy.ts`
- `frontend_web/landing_next/migrated/pages/dashboard/sidebar/TalentBoard/components/PitchDialog.tsx`
- `frontend_web/landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx`
- `frontend_web/landing_next/shared/browser-session.ts`
- `frontend_web/src/pages/dashboard/sidebar/TalentBoard/components/PitchDialog.tsx`
- `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx`
- `shared-core/src/domains/talent/api.ts`
- `shared-core/src/domains/talent/pendingPitch.test.ts`
- `shared-core/src/domains/talent/pendingPitch.ts`
- `shared-core/src/index.ts`
- `shared-core/src/talent.ts`
