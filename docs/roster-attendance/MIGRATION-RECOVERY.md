# Step 2A — migration audit and recovery handover

## Result

The configured PostgreSQL database was inspected using metadata queries in a
transaction that PostgreSQL confirmed was read-only. No business records were
read or modified. This evidence applies to that configured database only.

- 178 recorded migration names across users, client_profile and billing have no
  matching source files in this checkout. A trusted squashed replacement, if any,
  must also be examined; missing names alone do not establish the original graph.
- client_profile.0044_roster_v2_and_attendance_v1 is not recorded as applied.
- None of its eight proposed tables exist.
- users_user exists; auth_user does not appear among the inspected tables.
- Current 0044 has incorrect auth_user references, no dependencies, and no Django
  model-state operations. It has not been rewritten or run.

The full recorded names, inspected columns/constraints and source fingerprints
are in [migration-audit.json](migration-audit.json). No database credentials are
included. Re-run after receiving source files:

```powershell
.\.venv\Scripts\python.exe scripts/audit_roster_migrations.py --output docs/roster-attendance/migration-audit.json
```

## Saved changes

- scripts/audit_roster_migrations.py: bounded, read-only PostgreSQL schema and
  migration audit. Does not invoke migrate, fake or makemigrations.
- .gitignore: Python migration files in users/client_profile/billing are now
  eligible for tracking; existing ignore rules for unrelated folders are kept.
- No runtime application behavior or original models changed in step 2A.

## Required recovery source

Obtain the complete original backend/users/migrations,
backend/client_profile/migrations and backend/billing/migrations directories,
including __init__.py and any referenced migration helper modules. Use the
deployed backend source artifact, a source backup or the original development
checkout. A database dump records schema and migration names, not the original
Python migration operations/dependency graph, so it cannot replace these files.

Workspace searches (including ignored files) and available local Git history did
not provide that source set. The available repo references include several
historical migration branches; do not guess that 0043 precedes this new 0044.
No usable deployed-artifact access was found in this checkpoint.

## Step 2B after recovery

1. Preserve the received originals and record their source/version. Compare their
   migration graph/replacements to the recorded names and current schema. Check
   the target deployment independently before assuming it matches this database.
2. Resolve the real client_profile leaf dependencies and the swappable user
   dependency. Inspect cross-app dependencies, including existing public_hub.
3. If the proposed 0044 is unapplied in every intended target, replace it with
   proper Django state-aware operations and explicit dependencies. Otherwise
   retain applied history and add forward reconciliation. Do not silently fake
   either case, rebuild original tables or alter original application fields.
4. Check for differences from unrelated pre-existing work separately so that
   this attendance change does not accidentally migrate other features.
5. Verify migration consistency and rehearse clean bootstrap and an existing
   schema upgrade on disposable/staging databases with appropriate backups.
   Do not apply changes to the configured existing database as part of rehearsal.
6. Save the reviewed patch and validation results, report completion, and stop
   before step 3. If recovery reveals a large graph repair, split it into another
   small checkpoint rather than broadening the implementation silently.

**Status: Step 2A saved. Step 2B requires original migration source files. The
migration repair and deployment validation are not complete.**
