# M4 gate feedback and harness rules (read before writing any test)

Local gates run every test you write. You cannot run them, so these rules come from the real runs.

## Harness rules (from the M4-05 gate, Claude B, 2026-11-07)
1. vm/transpile harness mocks: under esModuleInterop a mock `{ default: X }` WITHOUT `__esModule: true` makes
   `import X from '...'` resolve to the whole object. Always write `{ __esModule: true, default: X }`, or wrap mocks in
   the require shim: `m && typeof m === 'object' && 'default' in m && !m.__esModule ? { __esModule: true, ...m } : m`.
2. Transpiled code calls hooks as `(0, react_1.useCallback)(...)`, so `this` is undefined inside a mocked hook. Never use
   `this.useMemo` in a mock; reference the mock object by name (`react.useMemo`).
3. A hand-rolled `useState` store must be reset per mount (`state.length = 0; stateIndex = 0;`) or two boards share state.
4. When you change behaviour, grep for EVERY existing test that pins the old behaviour (node tests, e2e specs such as
   frontend_web e2e `frontend-breadth.spec.mjs`) and update it in the tests-only commit, with the reason.
5. Implement every test the job's matrix lists (numbered tests in M4_JOB_PACK.md). A missing matrix test = FIX FIRST.
6. Mobile node tests need `node_modules/typescript` inside frontend_mobile (require it repo-relative:
   `require('../node_modules/typescript')`), never an absolute path.
Exact working diff for M4-05: M4-05_HARNESS_FIX.patch (same folder).

## Appendix E (J5 conversions)
Section E of M4_JOB_PACK.md is only a heading (no assignment table). Ignore it for now: J5 conversions are NOT part of
the M4 jobs except where a job's own text names a test file. A separate J5 job will follow.

## M4-05 verdict: FIX FIRST (production fix 93fcb219 correct; tests block)
Real reds confirmed: mobile notification route (m4-explorer-shifts.test.cjs:162), web direct routes (m4Explorer.test.mjs:181),
shiftSurface.test.mjs:150. Backend shifts.test_m4_explorer_policy 5 C OK. PG shifts Ran 282 OK; tsc 0; lint 0 errors.
To do on agent/m4-05 (new tests-only commit first, then any fix commit):
1. Apply M4-05_HARNESS_FIX.patch (no assertion changes).
2. frontend_mobile shiftsBoard.test.mjs:106 must expect ['public','community'] for Explorer.
3. frontend_web e2e frontend-breadth.spec.mjs:142-143 now end on the redirect: expect /dashboard/explorer/shifts/public.
4. Missing pack tests: #4 manager /shifts/history/ for owner/org/region (Tom/Lina/Grace/Nadia fixtures) plus a denied
   manager; #6 web notification/dashboard handoff waits while auth hydrates and never loops; #7 public board failure + retry.
5. Fix commit: OverviewPageStaff.tsx:261 send Explorer to /shifts/public when isExplorer (avoids an extra redirect hop);
   update the stale comment at frontend_mobile ShiftsScreen.tsx:25.
