# CODEX-REVIEW-001 — Review of migration recovery report

**Date:** 2026-09-15  
**Scope:** Read-only review of the supplied report/activity log, recovery handover, audit JSON, current models, and current `0044`. No migration, database, secret, or production change was made.

## Conclusion

`MIGRATION-RECOVERY.md` gives the safe conclusion: recover the original migration source before designing `0044`. The `SeparateDatabaseAndState` fallback proposed in `ANTIGRAVITY-RESULT-001.md` is not viable with the migration files currently on disk and must be rejected. It does not solve the missing historical model state that caused `CreateModel` to fail.

## Accepted findings

- The checkout lacks the recorded migration source for `billing`, `users`, and the historical `client_profile` graph. The audit records 3, 16, and 159 applied names respectively with no matching local source, for 178 total (`migration-audit.json:13-1441`). The checkout contains only `client_profile/migrations/__init__.py` and the proposed roster migration.
- For the configured database represented by the audit generated at `2026-09-14T23:21:47Z` (2026-09-15 in Brisbane), the proposed `client_profile.0044_roster_v2_and_attendance_v1` is not recorded and none of its eight tables exists (`migration-audit.json:2`, `:1442-1451`). This evidence is correctly limited to that configured database (`migration-audit.json:3-5`; `MIGRATION-RECOVERY.md:5-7`).
- The current `0044` has an empty dependency list and only `RunSQL` operations (`0044_roster_v2_and_attendance_v1.py:11-18`). Its user foreign keys incorrectly target `auth_user` (`:28-29`, `:49`, `:66`, `:116`, `:143`, `:145`, `:164`), while the audit identifies `users.User` and existing constraints target `users_user` (`migration-audit.json:5`, `:2447-2464`, `:2487-2499`).
- A database dump can preserve schema and `django_migrations` rows, but cannot establish the original Python operations, dependency edges, `replaces` declarations, or migration helper code. The warning not to reconstruct the graph from names is sound (`MIGRATION-RECOVERY.md:34-45`; `migration-audit.json:1441`).

## Corrections and unsupported claims

1. **The application-order observation does not establish a graph leaf.** `client-profile-applied-order.txt` was produced with `ORDER BY id`, so `0043_shiftoffer_last_buzzed_at` genuinely is the last recorded `client_profile` application in that ordering, as stated in `ANTIGRAVITY-RESULT-001.md:43`. However, the audit also includes two migrations named `0043`, a different `0044_membership_employment_type_membership_invited_by_and_more`, and migrations through `0134_alter_shiftcounterofferslot_slot` that were recorded earlier (`migration-audit.json:1065-1086`, `:1360-1375`). Application order and numeric names do not reveal dependency edges or current graph leaves. Therefore the suggestion that a recovered migration can simply depend on `0043_shiftoffer_last_buzzed_at` (`ANTIGRAVITY-RESULT-001.md:87`) remains unsupported; the actual leaf or merge dependencies must come from the recovered graph.

2. **`SeparateDatabaseAndState` does not repair the absent state.** Its `state_operations` run against the state produced by its dependencies. With `dependencies = []`, that state has no historical `client_profile.Pharmacy`, `Membership`, `Shift`, or `ShiftSlotAssignment`. The eight current models reference those types (`models.py:3982`, `:4051`, `:4093`, `:4132`, `:4169`, `:4268-4278`, `:4359-4402`) as well as the swappable user model. Wrapping the same `CreateModel` declarations in `SeparateDatabaseAndState` changes only which operations touch the database; it does not make the missing target models resolvable. Thus the claim that this fallback would register the eight models and prevent future `makemigrations` failures (`ANTIGRAVITY-RESULT-001.md:89-96`) is false under the documented conditions.

3. **The activity log does not support an exhaustive local-machine search.** It shows a recursive archive search only under `C:\ChemistTasker_Ezy`, plus a non-recursive `*chemist*` name filter in Desktop, Downloads, and Documents (activity log lines 17-18 and 26-28). Therefore `ANTIGRAVITY-RESULT-001.md:72` and `:75-77` may establish absence from the workspace and inspected locations, but not absence from the whole local machine.

4. **The exact prior execution and failure are not established by the supplied audit or activity log.** The audit supports “not recorded now” and “tables absent now”; it does not by itself prove that no statement ever ran, that the schema was never touched before rollback, or that the exact failure was `relation \"auth_user\" does not exist` (`ANTIGRAVITY-RESULT-001.md:39-50`). Those claims require the original captured command/output or another contemporaneous execution record. They should be labelled as prior-run history unless that evidence is added.

5. **Retrieving any deployed migration directories does not automatically restore exact parity.** `ANTIGRAVITY-RESULT-001.md:85-87` overstates the outcome. The artifact must be tied to the configured database/deployment version, and its branches, merges, replacements, and helpers must be compared with the recorded names and schema. `MIGRATION-RECOVERY.md:50-58` states this more accurately.

6. **`CREATE TABLE IF NOT EXISTS` is not a safe compatibility check.** It would silently accept an already-present but incompatible table on another target. The current audit only establishes absence on one configured database. Any eventual migration should fail clearly on unexpected schema or use an explicit, reviewed reconciliation path rather than treating table-name presence as equivalence.

## Safest next step

Keep the original backend and the unapplied migration intact. Retrieve the complete `backend/users/migrations`, `backend/client_profile/migrations`, and `backend/billing/migrations` directories, including `__init__.py` and helper modules, from a deployed source/build artifact whose version is known. Preserve and fingerprint that source; then inspect its dependency, merge, and replacement graph and compare it with all 178 recorded names. Only after the actual client-profile leaf nodes and swappable-user dependency are known should a new additive, state-aware migration be authored and rehearsed against disposable clean-bootstrap and existing-schema databases.

If no authoritative migration source can be recovered, this checkpoint remains blocked. Proceeding would require an explicitly approved migration-history reconstruction/baseline project, which is outside the current constraint against fabricating a production baseline; `SeparateDatabaseAndState` is not a smaller safe substitute.
