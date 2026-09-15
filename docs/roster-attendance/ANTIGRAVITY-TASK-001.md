# Antigravity task 001 — investigate original migration sources

The user explicitly authorizes Codex to delegate bounded work to Antigravity and
review the results. This is one investigation checkpoint, not authorization to
implement the remaining roadmap.

Workspace: C:\ChemistTasker_Ezy\chemisttasker-ezy

Read ROSTER-ATTENDANCE-PLAN.md and docs/roster-attendance/MIGRATION-RECOVERY.md.
The user's original roster/attendance chat, recorded in the plan, is the reference.

## Task

1. Review your earlier Antigravity work that added the eight roster/attendance
   models and 0044_roster_v2_and_attendance_v1.py. Explain what was actually
   changed, why raw SQL/no dependencies/auth_user was used, and whether any
   migration was applied. Distinguish remembered claims from verifiable evidence.
2. Check available original work artifacts/source backups for the original
   backend/users/migrations, backend/client_profile/migrations and
   backend/billing/migrations. Report exact verified locations if found. If not
   available, state that plainly. Do not fabricate or reconstruct migration
   operations from recorded names.
3. Recommend the smallest clean additive repair consistent with the original
   backend. Do not implement the repair yet.

## Existing evidence

- The configured database has 159 client_profile migration records; last by
  application order is 0043_shiftoffer_last_buzzed_at.
- The exact new 0044 is not recorded as applied, and none of its eight tables
  exist in the audited database. Other deployments have not been checked.
- 178 recorded migration names across the three apps lack matching local source
  files. Names alone cannot reconstruct their dependency graph.
- The custom user model is users.User with table users_user; auth_user is absent.
- Codex already added QR deadline/PIN helper fixes and six passing helper tests.
  Do not overwrite these with earlier versions from your pending changes.

## Boundaries and output

Read-only investigation except creating this one result file:
docs/roster-attendance/ANTIGRAVITY-RESULT-001.md

Do not modify models.py, migrations, settings, existing APIs, or unrelated work.
Do not accept/reject older pending editor patches, revert files, apply/fake
migrations, generate a baseline, restore a database, change authentication, commit
or push. Do not expose secrets or business records. Do not change the saved plan.
If original source recovery needs unavailable access, report that requirement.

Keep the report concise: findings with file/evidence references, original source
locations or blocker, smallest proposed next action, and files changed. Stop
after writing the report. Codex will inspect it before further work.
