# PR 242 reviewer responses

3 November 2026. This records the engineering decisions for the deployment review against `096e1d65` and the additional review against `c3b5f250`. The original nine readiness packages remain intact. Targeted follow-up commits address the validated defects; the staging rollout follows the owner's merge.

## Additional review against c3b5f250

### Production test-key collection

Accepted and implemented in [the collection guard](../../backend/billing/release_guards.py).
Test-prefixed Stripe keys can create new fulfillment or cancellation collection only when `APP_ENV` explicitly names `local`, `dev`, `development`, `test` or `staging`. Production, missing and unknown labels refuse with `503 test_provider_environment_rejected`, even when live capability flags are enabled. An unset label is not evidence of a sandbox.

This is a production prerequisite, rather than a reason to disable staging test payments. The positive non-production matrix remains supported with both live flags off. The guard runs before provider calls and durable checkout/reservation/booking changes. Existing signed payment reconciliation, owner-recorded external payments and subscriptions retain their existing paths. Previously issued provider URLs still require operator inventory/reconciliation; this guard does not revoke them.

[Regression tests](../../backend/billing/test_release_guards.py) cover both test-key prefixes, both collection kinds, enabled/disabled capability flags, production/unset/unknown labels, accepted non-production labels, and HTTP rejection without provider or booking writes. Historical signed reconciliation is exercised with a production label. The full billing suite passed 194 tests on PostgreSQL with `APP_ENV=test` after this change. Claude B then identified that GitHub CI did not supply that label; the hermetic test settings now explicitly default it to `test`, without changing runtime settings or overriding a supplied label. Verification also runs with the caller environment variable absent.

### Immutable source for destructive staging refresh

Accepted and implemented in [the refresh script](../../scripts/refresh-staging-db.sh).
The refresh now requires a full reviewed `--expected-sha`, or `STAGING_EXPECTED_SHA`, and a clean checkout. It checks source initially, after the image build, immediately before pausing writers, before dropping schema and before completing. A source change during backup refuses before schema destruction; writers may already be paused and require inspected recovery.

The earlier follow-up already moved image construction and the single input copy/full decode before writer pause. The old second copy after DROP was removed after Claude B identified it, and the regression requires exactly one copy before quiesce. Adding this guard does not require running a destructive refresh during an ordinary deployment.

[Command-order regressions](../../scripts/test_deploy_staging.py) cover missing/wrong SHA, dirty source, explicit argument precedence and changes during build, input decode or backup. [The runbook](../STAGING_PREVIEW.md) shows the required arguments. Ordinary deployment already had reviewed-SHA/clean-tree enforcement.

## Deployment review against 096e1d65

| Finding | Response |
|---|---|
| 1. Leftover migration container | Both scripts refuse the fixed container name in every state before downtime. Inspection and removal remain an explicit operator action. |
| 2. SSH HUP recorded as success | Deploy traps HUP as exit 129; tests cover interruption between commands and during a foreground build. The runbook uses a persistent tmux session. |
| 3. Disk reserve and partial archives | Measure conservative backup/input headroom before pausing writers. Private partial dumps become final dumps only after validation. Stage the refresh input before any DROP. |
| 4. TOC-only backup validation | TOC plus full data-block decoding is required. Real PostgreSQL 16 checks, including non-seekable stdin, rejected corrupted data that the TOC accepted. An isolated restore rehearsal remains required. |
| 5. Refresh builds after restore | Builds and input preparation now precede quiesce and schema changes. Failed builds preserve writers and data. |
| 6. Smoke/seed failure recovery | Seeding has its own recorded phase. Failed deploys deliberately stop newly started web and keep writers paused; the runbook describes inspected recovery from recorded images without automatic database rollback. |
| 7. Redis maintenance missing from runbook | Runbook and refusal messages link to role-isolation maintenance. An old Redis container restart reuses its old command; noeviction must be verified/reapplied until separately approved recreation. |
| 8. Optional channel outage after a save | Chat edits/deletes/reactions and read notifications isolate transport failures from durable writes. Chat push continues independently; robust AHPRA on-commit sends cannot suppress the following admin email. |
| 9. Stale attendance and mobile rollout | Web/mobile discard rejected scan intent and reload current status on STALE_CONFIRMATION. Mobile adoption is an operator acceptance gate, not an automatic minimum-version feature. |
| 10. Decision register wording | Rows 2/3 say implemented, pending owner workflow approval. Technical implementation does not record a commercial/owner decision. |
| 11. Lazy-route failure recovery | The root route has a statically bundled, accessible error screen with explicit reload. A failed real route import and recovery are tested at desktop and phone widths. The app-level component respects UI ownership boundaries. |
| 12. Protected AHPRA default | Protected state defaults to REDIS_URL; presence defaults to Channels. Overriding Channels alone cannot silently move protected counters. |
| 13. Lost-response confirmed retry returns 409 | Intentionally retained and documented. A retry may receive a no-write stale refusal; clients reload status and require fresh intent. Returning the original success response is not claimed, and the session guard is not weakened. |

The verifier group-add observation is not treated as a persistence fix: a websocket cannot operate without its transport. The presence-clear observation was test-only; production does not call it.

## Validation and independent review

Claude B reviewed the first complete correction, identified the leftover post-DROP copy, and accepted its removal and regression on rereview. A further review accepted the app-level component move and preserved attachment-security assertions. Claude B also identified the missing CI test-environment label and a pre-pause source-check gap during archive decoding; both were corrected with regression coverage and submitted for rereview. Each additional guard follows the same read-only review gate. The PR description records the review of the final source before the PR is marked ready.

Agy performed visual inspection only. Its two small phone typography/touch-target observations were corrected and the final confirmation was clear. Later backend/script-only work does not change that interface.

Reproducible gates include the complete backend CI contract union, PostgreSQL CI union, full billing suite, deployment/backup shell tests, all frontend CI commands, isolated legacy/architecture checks, browser smoke tests, and URL/auth/permission/WebSocket/Celery/model/migration/API replay comparisons. Exact-head results and native acceptance links belong in the PR description/checks so this document does not confuse an older passing run with the final source.

The 3048ded7 PostgreSQL union completed 1,248 tests with one child-lock readiness timeout before its application assertion. The unchanged test subsequently passed in isolation on both candidate and main with its original deadline; the aggregate run is not described as unqualified green. Four mixed REST/socket connection errors also reproduced on untouched main; the complete Linux contract suite passed. Full OpenAPI generation retains the same existing InviteOrgUserSerializer missing-Meta error on main and candidate.

## Ownership and staging acceptance after merge

The owner merges PR 242 after final code review and checks. Codex then handles staging deployment/testing from the merged SHA, following the approved SSH playbook and [staging runbook](../STAGING_PREVIEW.md).

1. Verify the canonical merged source; inspect the live record and unexpected changes. The VPS origin may point at an older fork, so a blind pull is insufficient.
2. Record private rollback images, environment hashes and protected container identities. Preserve every existing environment file/value, localhost credentialed origins, OTP display without SMS, real SMTP configuration and worker/beat behavior.
3. Use the shared maintenance lock and persistent session. Complete the permitted in-place Redis policy cutover, preserve queue/security/AHPRA state and create only the new disposable cache service.
4. Take a private backup outside automatic rotation and rehearse restore into an isolated disposable database before relying on it. Preserve the existing PostgreSQL/Redis containers and volumes.
5. Run the reviewed deployment sequence, verify migration/static ownership, smoke before worker/beat resume, then verify public routing, authentication/origin handling, worker queues, source identity and unchanged environment hashes.
6. Keep deployment checks within the SSH playbook: do not send test email/SMS or initiate payments; do not recreate the staging gateway/shared proxy or change production containers. Provider-flow acceptance requires its separately permitted test procedure. Configuration preservation is not a claim that provider acceptance was completed.
7. Record results and remaining gates. Resource limits require representative-load acceptance and actual HostConfig verification; log-driver/image adoption on preserved infrastructure needs separate maintenance. NGINX replacement is not performed by an ordinary application deployment.

Real-provider acceptance, owner payment/cancellation decisions, broader payroll-freeze acceptance and recorded mobile adoption remain gates for their corresponding production capabilities. Passing code checks does not itself enable those features or authorize a production deployment.

## Orchestrator re-review of 0b0cb3fd and the follow-up commit

All 13 deployment findings are addressed at `0b0cb3fd`. The two P1s were re-reproduced as fixed:
- A `docker create`d migrate container now refuses before quiesce.
- `kill -HUP` now records exit 129 through `finish()`.

CI was green. PostgreSQL gates matched base: billing, notifications and AHPRA 290 OK; attendance, workforce and shifts 502 OK.

The follow-up commit fixes the two small leftovers and one test-harness defect:

| Item | Change | Proof |
|---|---|---|
| Rejected deploy backup left a `.partial` file that rotation never prunes | `finish()` removes an unpublished partial. A validated backup is renamed first, so it is never removed. | `test_full_archive_decode_failure_…` now requires no `.partial`. It fails without the fix. |
| A refused refresh left the staged production dump in the staging Postgres container's `/tmp` | An EXIT trap removes the rollback partial and the staged input, which is copied from the host archive. The host archive is never touched. | The same test requires `rm -f <staged input>`. The new `test_refresh_rejected_rollback_archive_is_removed` fails without the fix. bash 5 check: the trap keeps the failure exit status and keeps a published dump. |
| `chat.test_api` (4 errors) and `onboarding.test_ahpra_access` (24 errors) failed on PostgreSQL on `main` too | `channels.db.DatabaseSyncToAsync` calls `close_old_connections()`, which closes the connection inside `TestCase`'s transaction. Every later test in the class then failed on a closed connection. The three direct consumer-method calls now patch `channels.db.close_old_connections` and keep the real async path. Test-only. | PostgreSQL `chat` plus `onboarding.test_ahpra_access`: 103 OK, previously 28 errors. Scripts: 64 OK (Linux, no network). |

### Handover to the reviewing agent

- Review the commit after `0b0cb3fd` only. It touches:
  - `scripts/deploy-staging.sh`
  - `scripts/refresh-staging-db.sh`
  - `scripts/test_deploy_staging.py`
  - `backend/chat/test_api.py`
  - `backend/onboarding/test_ahpra_access.py`
  - this file
- Check that the refresh EXIT trap cannot hide the script's failure exit status, and that it cannot remove a published rollback dump.
- Check that the patch scope covers only the consumer call, not the assertions on the REST path.
- Not covered: `attendance_tests/` is run by CI with plain `unittest`, not the Django PostgreSQL runner. iOS commits `655f2d9c` and `c3b5f250` were not re-read; iOS acceptance is deferred by the owner.

### Deployer checklist (after the owner merges)

1. On the VPS, check out the merged commit and confirm `git status --porcelain` is empty. Set `REVIEWED_SHA` to the full 40-character SHA.
2. Before the first backend deploy, complete [Redis role maintenance](../ops/REDIS_ROLE_ISOLATION.md) steps 1–5. `CONFIG GET maxmemory-policy` must report `noeviction`, or the deploy refuses before downtime. Re-check this after any host or Redis container restart.
3. Make sure `env/staging.runtime.env` has `STAGING_RUN_MIGRATIONS=1`. A previous DB refresh leaves it at `0`, which refuses a backend release.
4. Confirm no `chemisttasker_staging_migrate` container exists in any state (`docker ps -a`). If one does, inspect its logs before removing it.
5. Run inside `tmux new-session -A -s chemisttasker-staging-release`, then `bash scripts/deploy-staging.sh --expected-sha "$REVIEWED_SHA"`.
6. On failure, read the private record under `/opt/apps/chemisttasker-staging-ops/release-*/` (`phase`, `failed.exit`, `migration.log`). No database restore is automatic. Writers stay paused until an inspected recovery.
7. After success, check `deployed.commit` matches `REVIEWED_SHA`, then check the public smoke, login, websockets (chat) and that worker queues drain.
