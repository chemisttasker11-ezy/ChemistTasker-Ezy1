# ANTIGRAVITY-RESULT-001 — Migration Source & Prior Work Investigation

**Date**: 2026-09-15  
**Context**: Bounded investigation per `docs/roster-attendance/ANTIGRAVITY-TASK-001.md`, `ROSTER-ATTENDANCE-PLAN.md`, and review corrections in `docs/roster-attendance/CODEX-REVIEW-001.md`.  
**Scope**: Read-only inspection of repository, local environment, git history, and earlier Antigravity artifacts. Preserved as a description of the earlier snapshot. No migrations applied, no models modified, no settings altered.

---

## 1. Review of Earlier Antigravity Work

### What Was Actually Changed in the Earlier Snapshot
1. **Model additions in `backend/client_profile/models.py` (lines 3972–4463)**:
   - Added imports: `from django.db import models, transaction` and `from django.contrib.auth.hashers import check_password, make_password`.
   - Appended eight new model classes:
     - `RosterPeriod`: Weekly roster grouping, draft/publish lifecycle (`models.py:3972`).
     - `RosterTemplate`: Reusable shift slot template (`models.py:4046`).
     - `KioskDevice`: Pharmacy terminal activation and hardware tokens (`models.py:4086`).
     - `PharmacyQRSession`: Rotating short-lived QR codes (`models.py:4124`).
     - `WorkerPIN`: Owner-controlled personal code with lockout (`models.py:4164`).
     - `AttendanceSession`: Clock event log (`models.py:4242`).
     - `ProvisionalAttendance`: Unscheduled / cross-site cover pending review (`models.py:4331`).
     - `AttendanceCorrection`: Audited manager time corrections (`models.py:4419`).
   - *Note on Codex updates*: Codex subsequently refined `PharmacyQRSession.is_expired` (boundary `>=`), `WorkerPIN.set_pin()`, `check_pin()`, and concurrency-safe `select_for_update()` attempt counting, and added passing tests in `backend/client_profile/test_attendance_helpers.py`.

2. **Migration creation in `backend/client_profile/migrations/`**:
   - Created `__init__.py` and `0044_roster_v2_and_attendance_v1.py` (9,621 bytes, 172 lines).
   - A pycache artifact `0001_roster_v2_and_attendance_v1.cpython-312.pyc` (158,177 bytes) remains from an initial failed `makemigrations` attempt.

### Why Raw SQL, Empty Dependencies, and `auth_user` Were Used
- **Raw SQL (`migrations.RunSQL`)**:
  - In earlier sessions, running `makemigrations` generated an initial migration attempting to recreate all 40+ existing models in `client_profile` because no migration history existed on disk.
  - A handwritten Django `migrations.CreateModel` migration without parent dependencies failed during Django's model state resolution with `ValueError: Related model 'client_profile.pharmacy' cannot be resolved` because Django cannot build foreign key relationships in memory without on-disk migration history for the target models.
  - Raw SQL (`RunSQL`) was chosen as an ad-hoc bypass to create tables directly in PostgreSQL without requiring Django's model-state engine to reconstruct the unmigrated history.
- **Empty Dependencies (`dependencies = []`)**:
  - Because no earlier migration files exist on disk in `backend/client_profile/migrations/`, specifying any parent dependency caused `NodeNotFoundError`.
- **`auth_user` Reference**:
  - The author of the raw SQL migration assumed Django's default user table name (`auth_user`) when typing DDL constraints (`REFERENCES auth_user(id)`), overlooking that `backend/core/settings.py:234` defines `AUTH_USER_MODEL = 'users.User'`, which maps to `users_user` in PostgreSQL.

### Was Any Migration Applied?
- **Current Verifiable Evidence (Audit at 2026-09-14T23:21:47Z)**:
  - For the configured database, `client_profile.0044_roster_v2_and_attendance_v1` is **not recorded** in `django_migrations` (`migration-audit.json:2`, `:1442-1451`).
  - None of the eight new tables exist in `information_schema.tables` in the configured database (`migration-audit.json:1444-1451`).
- **Prior-Run History (from conversation transcript)**:
  - Earlier execution attempts were reported to fail with `psycopg2.errors.UndefinedTable: relation "auth_user" does not exist`. The current database audit confirms that tables are absent and unapplied now, but does not independently establish whether partial DDL was executed and rolled back or failed before execution.

### Remembered Claims vs. Verifiable Evidence
- *Remembered claim*: That `0044` was nearly working and merely needed `auth_user` changed to `users_user`, and that `0043_shiftoffer_last_buzzed_at` is the leaf dependency.
- *Verifiable evidence*:
  - In `client-profile-applied-order.txt` (ordered by `id`), `0043_shiftoffer_last_buzzed_at` is the last recorded application by ID. However, the audit also shows multiple migrations with number `0043`, another `0044_membership_employment_type_membership_invited_by_and_more`, and migrations numbered through `0134_alter_shiftcounterofferslot_slot` recorded earlier (`migration-audit.json:1065-1086`, `:1360-1375`). Application ID order and numeric prefixes do not prove dependency graph leaves or branches.
  - All 178 prior migration files across `users`, `client_profile`, and `billing` are completely missing from the filesystem.

---

## 2. Check for Original Migration Source Backups

### Inspected Locations and Findings
1. **Local Working Tree**:
   - `backend/users/migrations/`: **Absent** (directory does not exist).
   - `backend/client_profile/migrations/`: **Incomplete** (only unapplied `0044_roster_v2_and_attendance_v1.py` and `__init__.py`).
   - `backend/billing/migrations/`: **Absent** (directory does not exist).
   - `backend/public_hub/migrations/`: Present (`0001_initial.py`, `0002_...`, `0003_...`).

2. **Git Version Control History**:
   - Commits, branches, and reflog inspected (`main`, `origin/main`, `upstream/main`).
   - `git log --all -- "*/migrations*"` confirms that migration files for `users`, `client_profile`, and `billing` were **never committed to Git**.
   - Root `.gitignore` line 32 has explicitly ignored `**/migrations/` since commit `4aabe44984d0196da3890a292ff9198ed027e39b` on 2025-05-13 ("BesmAllah").
   - `git fsck --lost-found` returned no dangling commits or trees.

3. **Inspected Local Locations**:
   - `C:\ChemistTasker_Ezy`: Recursive archive search performed. `production_backup.dump` is a PostgreSQL custom-format database dump (`PGDMP`) containing schema DDL and row data (including `django_migrations` names), but **not** Python migration files or dependency definitions.
   - User profile directories (`Desktop`, `Downloads`, `Documents`): Non-recursive name search for `*chemist*` revealed image and document assets, but no source archives or migration checkouts.
   - Container environments: `docker` command is not available on PATH; no container filesystems were inspected.

### Scope Boundary of Search
The investigation verified absence of the migration source files from the **workspace repository, local git history, and the specific inspected paths** (`C:\ChemistTasker_Ezy` and user profile directories checked). This does not constitute an exhaustive search of the entire host machine.

---

## 3. Recommended Clean Additive Path & Fallback Rejection

### Primary Recommendation: Authoritative Source Retrieval
- **Requirement**: Retrieve the complete `backend/users/migrations`, `backend/client_profile/migrations`, and `backend/billing/migrations` directories (including `__init__.py` and any migration helper modules) from a deployed source or build artifact tied to the target deployment version.
- **Validation**:
  - Compare the recovered migration graph, branch merges, replacements, and helpers against all 178 recorded names in `django_migrations` and the live schema.
  - Identify the genuine leaf nodes in the `client_profile` dependency graph (which cannot be assumed from numeric names or application order) and the swappable user dependency.
  - Author a clean, state-aware migration and rehearse on disposable databases (both clean bootstrap and existing schema upgrade).

### Rejection of `SeparateDatabaseAndState` Fallback
- Proposing `migrations.SeparateDatabaseAndState` with `dependencies = []` as a fallback was **invalid and is rejected**:
  - `SeparateDatabaseAndState.state_operations` run against the in-memory state built from declared dependencies. With `dependencies = []`, Django's state has no historical `Pharmacy`, `Membership`, `Shift`, or `ShiftSlotAssignment` models.
  - The eight new models explicitly declare foreign keys to these targets (`models.py:3982`, `:4051`, `:4086`, `:4124`, `:4164`, `:4242`, `:4331`, `:4419`).
  - Wrapping `CreateModel` inside `SeparateDatabaseAndState` does not resolve missing foreign key models; it produces the exact same `ValueError: Related model ... cannot be resolved` failure.
  - Additionally, using `CREATE TABLE IF NOT EXISTS` in raw SQL is not a safe compatibility check, as it silently masks schema mismatches on other deployment targets.

### Status if Sources Are Inaccessible
If no authoritative migration source can be recovered from the deployed environment or backups, this checkpoint remains **blocked**. Proceeding without source files would require an explicitly approved migration-history baseline/reconstruction project, which is outside current project constraints.

---

## 4. Files Changed
- **Modified**: `docs/roster-attendance/ANTIGRAVITY-RESULT-001.md` (corrected report per `CODEX-REVIEW-001.md`).
- **Backend / Models / Migrations**: No files modified, restored, or migrations run.
