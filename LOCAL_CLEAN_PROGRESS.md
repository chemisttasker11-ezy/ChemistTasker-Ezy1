# Local clean progress

Canonical project: `C:\ChemistTasker_Ezy\chemisttasker-ezy`

Canonical branch: `workforce/employment-engagement-20260919`

Validated rebased PR #3 head before this cleanup: `7087c07add575daf41428ac56e348a0f95c9a271`

PR #2 is contained by that history through `c8c36ad1155c5e1f27b5b4f4b082c3a8b7e5ed19`.

## Completed topology cleanup

- Confirmed `chemisttasker-ezy` is the canonical repository and contains PR #2 plus rebased PR #3.
- Confirmed the canonical tree contains backend, Vite, Next, mobile, shared-core, kiosk, EmploymentEngagement, membership/favourite, payroll, finance/invoice, and owner-review work.
- Confirmed the PR #2 worktree was clean and its useful commit was an ancestor of canonical PR #3.
- Removed the registered `pr2-hardening` worktree through Git worktree management, then removed its leftover generated directory.
- The safety copy `C:\ChemistTasker_Ezy - Sada` was not modified.

## Repository hygiene completed

Removed verified generated or agent-only material from the canonical project and parent workspace:

- frontend build output (`frontend_web/dist` and root `dist`);
- Next `.next` output;
- Expo `.expo` output;
- Django verification output;
- roster, kiosk, backend, frontend, and test logs;
- PR audit scratch files, tarballs, npm caches, temporary artifacts, and archived-tree validation backups;
- the untracked archived duplicate frontend directory that was proven dead by the PR #2 preservation audit.

Tracked source, migrations, fixtures, deployment files, Vite, Next, mobile, kiosk, shared-core, backend, and required compatibility code were preserved.

## Structural cleanup completed

Extracted the pure URL-prefill parsing responsibility from the oversized Vite Post Shift page into:

- `frontend_web/src/pages/dashboard/sidebar/PostShiftPage.helpers.ts`

The page now consumes `readPostShiftPrefill(location.search)`. Query names, defaults, prefill detection, routes, payloads, API calls, validation, permissions, and navigation are unchanged.

This is an incremental behavior-preserving extraction. Larger modules such as Pharmacy, Kiosk, roster, calendar, shared mobile screens, finance, and shared-core API remain future targets and were not broadly rewritten in this cleanup.

## Validation after cleanup

Passed:

- Vite TypeScript check.
- Vite production build.
- Strict shared-core boundary audit.
- Architecture boundary audit.
- Earlier full canonical validation: backend 90 tests, shared-core 32 tests/build, Next typecheck/build, mobile lint/typecheck, kiosk Rust tests.

The Vite build output was removed again after validation so generated files are not left in the canonical tree.

## Final state

Final canonical commit: `f41e88381cb1fa9a0f59a4caeecf53a056761976`

Final validation was rerun from this canonical tree after the Post Shift extraction:

- Backend checks, migration drift check, and 90 tests passed with 28 skipped.
- Shared-core typecheck, 32 tests, and build passed.
- Vite TypeScript check passed.
- Next typecheck and production build passed.
- Mobile lint and TypeScript passed against the current shared-core source package.
- Kiosk Rust tests passed: 2 passed.
- Strict shared-core boundary and architecture audits passed.

After using the local PostgreSQL env configuration and supplied password, the disposable PostgreSQL migration rehearsal completed successfully and both PostgreSQL concurrency tests passed. The disposable database was then removed. The normal backend suite was rerun afterward and passed again.

The PostgreSQL fix was a real production-path correction: invoice assignment and invoice adoption locks now clear nullable eager joins before `FOR UPDATE`, avoiding PostgreSQL's nullable-side lock error while retaining row-level concurrency protection.

Generated validation output was removed after the run. The canonical `git status` is clean and only the canonical worktree remains registered. One four-file kiosk runtime cache is still present under ignored `.local-run/kiosk-runtime-cache`; Windows denied removal while the kiosk runtime held it open, so it was left intact rather than forcing a process termination.
