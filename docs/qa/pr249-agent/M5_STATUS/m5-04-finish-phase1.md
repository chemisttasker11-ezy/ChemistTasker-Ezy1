# M5-04 finish: phase 1 in progress

Base `5c28634d`; head `6dacc654`. The new component test loads full production
modules from either tree using `git show` for the base. No scratch tree was made.

| Item | Base | Head |
| --- | --- | --- |
| R window_range, timetable arrows | `m5-post-shift-components.test.cjs:61`: disabled is undefined, expected true | PASS |
| R legacy_create_route | `m5-post-shift-components.test.cjs:85`: SafeAreaView, expected Redirect | PASS |
| R window_range, actual picker | Not yet tested | Not verified |
| R past_dates_message, screen interaction | Not yet tested | Not verified |
| R server_error_text | Not yet tested | Not verified |
| R success_destination | Not yet tested | Not verified |
| R admin_edit_scope and positive controls | Not yet tested | Not verified |
| C templates, posting, access and unsaved changes | Matrix incomplete | Not verified |
| C backend posting and templates | Draft test; PostgreSQL not run | Not verified |
| C shared-core window | No base module exists; base equivalence not established | 8 tests passed as part of shared-core suite |

Commands: `$env:M5_BASE='1'; node --test frontend_mobile/scripts/m5-post-shift-components.test.cjs`
(0/2 pass as expected); `node --test frontend_mobile/scripts/m5-post-shift-components.test.cjs frontend_mobile/scripts/m5-post-shift.test.cjs`
(5/5 pass). Existing post-shift suite: 31/37 pass; six failures in
`postShiftSlotRepair.test.mjs` use missing `splitPostableDates` bindings in its harness.
These failures must be repaired without weakening the tests. Backend control is drafted,
syntax checked only; fixture correctness and all HTTP results require PostgreSQL.

Full shared-core suite: 510/510 pass, typecheck exit 0. Mobile gate: 858/865 tests,
six post-shift harness failures plus `deepmerge override keeps Formik values, validation errors and Paper themes compatible`;
tsc exit 2, gate exit 1. Expo lint exit 0 (66 warnings). Phase 1 is incomplete;
phase 2 production edits have not begun.
Mobile tsc reported TS2305 for the new shared-core exports and downstream implicit-any
errors; a temporary tsconfig mapping `@chemisttasker/shared-core` to this worktree's
`../shared-core/src/index.ts` passed (`tsc --noEmit -p tsconfig.m5-check.json`, exit 0).
The temporary configuration was removed.
