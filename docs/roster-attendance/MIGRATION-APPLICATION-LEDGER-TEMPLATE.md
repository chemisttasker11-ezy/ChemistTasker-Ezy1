# Roster/attendance migration application ledger

Fill this only from executed, captured evidence. Never record planned actions as applied.

## Target and release

- Environment/database identifier:
- PostgreSQL version and schema:
- Application release/commit:
- Operator:
- Started UTC:
- Finished UTC:

## Recovery provenance

- Authoritative migration artifact/release:
- `users/migrations` tree SHA-256:
- `client_profile/migrations` tree SHA-256:
- `billing/migrations` tree SHA-256:
- Database ledger comparison result:
- Proven graph leaf dependencies:

## Backup evidence

- Custom-format dump path and SHA-256:
- Schema-only dump path and SHA-256:
- `django_migrations` export path and SHA-256:
- Disposable restore verification:

## Migration applied

- Migration label:
- Migration file SHA-256:
- Dependencies:
- Generated SQL artifact and SHA-256:
- Exact command:
- Exit code/output artifact:
- New `django_migrations` row(s), including applied timestamps:

## Schema verification

- New tables (expected 12):
- Foreign keys and targets:
- Unique/check constraints:
- Indexes:
- `client_profile_workershiftrequest` unchanged:
- Unexpected schema differences:

## Validation

- `showmigrations --plan`:
- `migrate --check`:
- `makemigrations --check --dry-run`:
- PostgreSQL backend tests:
- Smoke tests:
- Rollback/fix-forward decision:

