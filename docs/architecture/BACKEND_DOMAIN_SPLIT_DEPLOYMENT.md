# Backend domain-split deployment

This refactor moves Django model ownership out of `client_profile` and physically renames 47 PostgreSQL tables.
The REST, shared-core, Vite, Next, Expo, Celery and Daphne/Channels contracts are preserved, but the old and new
backend code cannot safely run against the database at the same time while those table names differ.

## Required production rollout

1. Require the PR release gate to be green on the exact commit being deployed.
2. Take and verify a PostgreSQL snapshot.
3. Drain traffic and stop every process using the old backend code:
   - Django/Daphne web processes
   - Celery workers
   - Celery beat/schedulers
   - one-off management workers or long-running jobs
4. Deploy the new code without starting application processes.
5. Run `python backend/manage.py migrate --noinput`.
6. Verify:
   - `python backend/manage.py check`
   - `python backend/manage.py makemigrations --check --dry-run`
   - the expected promoted tables exist
   - representative row counts match the pre-deploy snapshot
   - the moved ContentType rows retained their IDs
7. Start only processes built from the new release.
8. Smoke-test auth, shifts, roster, attendance/kiosk, chat/WebSockets, notifications, invoicing and calendar/Celery.

Do not perform a rolling deployment across the table-renaming migration. An old process can query the old
`client_profile_*` table names after the schema has moved, and a new process can query the new table names before
the migration has completed.

## Rollback order

If rollback is required after the migrations ran:

1. Keep old application processes stopped.
2. Stop all new web, Daphne, Celery and scheduler processes.
3. Run the Django migration rollback using the new release while its migration code is still present, as one command:
   `python backend/manage.py migrate rewards zero --noinput`.
   `rewards.0001_initial` is the root of the split: unapplying it unapplies every later migration of the split
   (`client_profile` 0061-0070, the promoted apps, `workforce` 0006-0009 and `worker_finance` 0007) in the same run,
   so the ContentType rows are re-labelled back before Django's post-migrate step. Do not roll back with
   `migrate client_profile 0060_owner_marketplace_identity` or app by app: that leaves `rewards.0001_initial`
   applied, and post-migrate then creates duplicate `client_profile` ContentTypes for the rewards models while the
   original rows (with their permissions, admin history and generic relations) stay labelled `rewards`.
4. Verify the old `client_profile_*` tables and ContentType labels are restored, and that
   `python backend/manage.py showmigrations` on the previous release lists no unapplied migration.
5. Deploy the previous application release.
6. Start the previous processes and run smoke tests.

Never deploy the old application code first and attempt to roll the database back afterwards.

## Migration-history rule

Migration files that already exist on `main` are immutable. The domain split must express all ordering and state
changes through new migrations. CI enforces this rule.
