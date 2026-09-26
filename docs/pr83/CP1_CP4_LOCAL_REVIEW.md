# PR83 local checkpoint review (2026-09-26)

Local main remains at `fdbfd4b`. The reviewed CP1–CP4 changes are uncommitted in the local working tree. PR83 has not been merged wholesale or pushed.

| Checkpoint | Local decision | Changes and corrections |
| --- | --- | --- |
| CP1 shared policy | Implemented; focused gates pass | Owner capabilities require the owned pharmacy, synthetic admin labels do not grant all capabilities, and missing roster role is denied. Explicit accepted admin assignments and capabilities are returned by `/api/users/me/`; an unaccepted invitation is absent. `shared-core/src/api.ts` still uses `@ts-nocheck`, so this is a known type-safety limit. |
| CP2 kiosk backend | Implemented; focused gates pass | Device listing/revocation, signed self-revocation, offline lease, and revoked evidence drain are present. Org Admin covers pharmacies in its organization. Chief/Region need an explicit pharmacy assignment for kiosk management; an empty assignment does not mean all. |
| CP3 canonical leave | Implemented; focused gates pass | Workforce leave is canonical for roster, timesheet, manager decisions and legacy compatibility routes. Worker can read a rejection note. Leave row locks use PostgreSQL `of=("self",)`. Legacy list combines self access with authorized pharmacy scopes and excludes communication-only pharmacy admins. Overnight, missing-membership and duplicate legacy backfill cases have regression tests. |
| CP4 editorial governance | Implemented; focused gates pass | Article Django admin is read only. Existing article states backfill to editorial documents and revisions once; archived articles mark their document archived. The lightweight body conversion retains paragraphs and `##` headings. Old editorial body fidelity beyond that is not an acceptance gate during the testing period. |

## Verification

- Shared-core: 69 tests passed; TypeScript build passed. Vite and Expo TypeScript checks passed.
- CP1 admin invitation and `/api/users/me/` contract: 5 tests passed. Region delegation plus invitation regression: 14 passed.
- CP2 focused kiosk modules: 57 tests passed, 1 skipped.
- CP3 full workforce suite: 16 tests passed, including canonical approved-leave roster conflict.
- CP4 public hub suite: 17 tests passed.
- A newly created, uniquely named PostgreSQL test database applied the current migrations and ran 28 CP3/CP4 tests successfully; the test database was then destroyed.
- Django system check and `makemigrations --check --dry-run` passed. The development database still reports `workforce.0005` and `public_hub.0004` as pending; no migration was applied to it.

The broad 215-case isolated SQLite attendance discovery remains red: 20 failures and 8 errors after the CP3 optional-app fix. It includes 404s for roster routes omitted from `attendance_tests.urls`, old tests that seed legacy `client_profile.LeaveRequest` as the roster conflict source, and fixture failures involving roster assignment rules and workforce relations. This suite needs a separate test harness and fixture update for canonical leave before it can be used as an overall roster gate. The focused CP2 modules and production-settings workforce tests above are green.

## Migration and recovery

`workforce.0005` and `public_hub.0004` are forward-only. They are explicitly irreversible in Django. Do not attempt a reverse migration of these stateful records. For a rollback, restore a database snapshot taken before applying them, then return the application code to the matching revision. The test database rehearsal proves a clean migration path; it is not a backup or a substitute for an upgrade rehearsal on a copy of real data.

Next planned checkpoint: CP5A web and desktop kiosk consumers. CP5B public landing edits remain rejected; Expo work is reserved for CP6 and needs its separate visual/device review.
