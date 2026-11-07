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

## More harness rules (M4-01 gate Claude B, M4-03 gate Codex A, 2026-11-07)
7. Time-zone tests: set `process.env.TZ` (e.g. 'UTC') BEFORE requiring any module; never depend on the machine zone.
8. Node ESM cannot load shared-core `dist` (its import paths have no file extensions). A web `.test.mjs` whose
   production file imports `@chemisttasker/shared-core` must mock that module (add EVERY export the file uses, e.g.
   `correctionTimestamp`) or transpile shared-core source. When a production file gains a new shared-core import,
   update EVERY existing test that mocks shared-core for that file (grep the mock factories), in the tests-only commit.
9. vm realms: arrays/objects created inside a vm context fail `assert.deepStrictEqual` against outer-realm literals.
   Compare `JSON.parse(JSON.stringify(x))` or `Array.from(x)`.
10. Shared-core async transport tests: await every pending call (e.g. `await vi.waitFor(() => expect(calls).toHaveLength(2))`)
    before inspecting the transport mock; keep the token/account-scope assertion.
11. Never re-create a production policy inside a test (e.g. a copy of hasAdminCapability). Import/inject the real
    shared-core function so the positive controls prove the real check.
12. Before the fix commit, list every EXISTING test file that imports or source-reads the files you change
    (grep the file name and its exported symbols across frontend_mobile, frontend_web, shared-core, .github/workflows);
    the head must not break any test that passes on base. A source-regex test that pins old code must be converted to a
    behaviour test in the tests-only commit (record it in the J5 mapping).
13. Put ALL test changes in tests-only commits BEFORE the fix commits. If you must repair a test after a fix, say so in
    the delivery; never change an assertion after the fix.
14. A C (control) test must pass on base. Check fixtures against the code path the service really reads (e.g. the
    pharmacy time zone, not only the period's).
15. Error-path tests must throw the REAL shared-core error: `ApiError` with `.status` (shared-core/src/transport/errors.ts:6),
    not a made-up `{ response: { status } }` object.
16. `new TextDecoder()` drops a leading BOM: decode with `new TextDecoder('utf-8', { ignoreBOM: true })` to assert it.
17. `onPress={() => void fn()}` cannot be awaited: flush macrotasks (`await new Promise(r => setTimeout(r, 0))`, repeated
    until the mock settles) or call an awaitable path before asserting side effects such as temp-file deletion.
18. Text matchers: rendered text may be split across nodes ("Invoice #" + "48"); match with a regex such as
    `/invoice #\s*48/i`. Find titles where the page really renders them (e.g. PageHeader props, not Typography).
19. Backend fixtures must satisfy model/service validation (e.g. an Expense with gst_amount needs tax_code='GST').
20. Python must parse: a generator expression passed with other arguments needs its own parentheses
    (`set((row['id'] for row in rows))`, never `f(x for x in y, z)`); never name a test helper `self.client` (Django's
    TestCase assigns it). Check every .py file with `python -m py_compile` mentally before committing.
21. Race tests: wait for the exact deferred boundary you claim (resolve the pending fetch/blob AFTER the account switch),
    never assert before it; a double-tap test presses twice from the SAME render (no re-render between presses).
22. Effect-based redirects still mount the screen once: a guard that must stop a forbidden API call has to be
    synchronous (decide before mounting the loader), and its test must count API calls during the redirect.

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

## M4-01 verdict: FIX FIRST (Claude B, head b78c5251; production direction sound, tests broken, head breaks 22 tests)
Red after a local one-line patch: mobile R 1-4 fail correctly at m4-attendance.test.cjs:179/195/215/238, R5 :272 red.
Gates: shared-core 484/484, backend attendance+workforce 508 (only the fixture test fails), tsc 0, lint 0 errors.
To do on agent/m4-01 (new tests-only commit(s) first, then fix commits):
1. m4-attendance.test.cjs:53 `this.useMemo` -> `react.useMemo` (rule 2); set process.env.TZ before loading (rule 7).
2. frontend_web m4Correction.test.mjs:165 picks the reject dialog's Reason field (page :473), so Save stays disabled:
   select the correction form's Reason field. The `click` helper at :148 asserts disabled===true (inverted; fix or drop).
3. backend workforce test_m4_correction_requests.py:25-28 sets only the period time zone; the service reads the
   pharmacy's (attendance_edits.py:45): set the pharmacy time zone to Australia/Brisbane in setUp (rule 14).
4. Head breaks 22 existing tests that pass on base (rule 12):
   - frontend_web attendanceLocum.test.mjs (14): its auth mock needs `hasCapability`.
   - frontend_mobile workforce-request-isolation.test.cjs:290: source-regex on `scopeKey`; convert to a behaviour test
     (the new key still includes account, pharmacy, screen, route + manager flag) and record it in the J5 mapping.
   - frontend_web KioskEvidenceReview.test.mjs:218,245 (runs in CI shared_core_consolidation_ci.yml:124): add
     `correctionTimestamp` to its shared-core mock.
   - frontend_web TimesheetAdjustTimesDialog.test.mjs (5) and correctionTimestamp.test.mjs: the wrapper now loads
     shared-core dist (rule 8): mock the import or point at shared-core source.
5. Missing pack matrix tests: #3 live site switch while A's timeline request is still pending (not unmount);
   #6 the other personas (Ali, Mia, Jack, Sara, Zoe); #8 approve/reject succeeding for Lina, Grace and the roster
   delegate, plus a true staff-only delegate (comms_delegate is not one); #9 blank reject reason, invalid date,
   double-tap, retry, and an old account's completion not navigating.
6. m4-attendance.test.cjs:107-113 re-creates the capability policy: inject the real shared-core hasAdminCapability (rule 11).
7. Fix: move attendanceWallTime and isValidAttendanceLocal from mobile attendance.tsx into
   shared-core/src/utils/correctionTimestamp.ts and import them.
8. Fix: TimesheetAdjustTimesDialog.tsx:182-197 calls the throwing shared converter inside a render-time useMemo:
   try/catch and return a validation message.

## M4-03 verdict: FIX FIRST (Codex A, head cb69a550; product gaps + failing tests)
Head: mobile targeted 11/16, full mobile 738/743, shared targeted 3/4 (full 482/483), web node 195/199. The harness at
c0e0be88 uses `this.useMemo` (rule 2), so it gave no red evidence.
To do on agent/m4-03 (tests-only commit(s) first, then fix commits):
1. GAP frontend_mobile components/shell/useShellChrome.ts:89: entering the inbox clears the badge before a successful
   receipt, even on failure. Refresh/clear the count only after a current, successful receipt. Add an R test.
2. GAP frontend_web src/layouts/TopBarActions.tsx:245: an old account's list or mark-all response can update the
   current web bell. Capture account + request generation and guard every completion (success, error, finally);
   add account-switch negative AND positive controls (current account's response still updates).
3. Tests: notificationsInboxPaging.test.mjs:23 and scripts/m4-notifications.test.cjs:119: fix cross-realm array
   comparisons (rule 9) and assert on the rendered error body/footer text, not internals. All 5 mobile failures must pass.
4. shared-core src/domains/notifications/m4Inbox.test.ts:63: wait for both async transport calls (rule 10); keep the
   token-scope assertion.
5. Keep: server list/detail/preferences scoped to request.user (backend/notifications/views.py:32) and mark-read
   queryset scope (services.py:166): no backend change needed.

## M4-02 verdict: FIX FIRST (Claude B, head 2dc238fb; production fix looks right, test proof broken)
All 8 mobile tests crash at m4-finance.test.cjs:60 (`this.useMemo`, rule 2). With harness-only scratch fixes: mobile
managed-source, race, ABN and BAS export are red at base and green at head. PG worker_finance+invoicing: Ran 182, 1 error
(new test fixture). shared-core 481/483 (2 timeouts pass alone), tsc 0, lint 0 errors.
To do on agent/m4-02 (tests-only commit(s) first, then fix commits):
1. PRODUCTION GAP frontend_web/src/pages/finance/FinanceWorkspace.tsx:333 still builds the worksheet CSV inline with
   different labels; call shared-core `worksheetCsvRows(worksheet)` there, and make the first row in
   shared-core/src/domains/finance/csv.ts:48 'DRAFT ONLY' (web's existing label) so web and native files match. Test it.
2. Mobile harness m4-finance.test.cjs: :60 `react.useMemo` (rule 2); :305 TextDecoder ignoreBOM (rule 16); :344 await the
   export / flush macrotasks (rule 17); :171 match /invoice #\s*48/i (rule 18).
3. Web harness m4Finance.test.mjs: :80-81 add `__esModule: true` to the mocks (rule 1); :154 look for the title in the
   PageHeader props (rule 18).
4. backend/worker_finance/test_m4_presentation_contract.py:38 add tax_code='GST' (rule 19).
5. Refusal tests: add cases with real `ApiError` instances for 404 and 403 (rule 15).
6. Missing matrix tests (M4_JOB_PACK M4-02 numbering): #1 both lookups fail; #2 received-mode race; #3 422/503/429 keep the
   entered fields and allow retry; #4 exact header, current filter, no received rows; #6 parity BAS screen shows the excluded
   count; #7 share unavailable, double tap gives one share, account switch mid-export; #8 no-store headers, ABR field
   allow-list, concurrent ABN change -> 400, scoped manager vs Nadia; #9 web UI click -> download and object-URL revocation.

## M4-08 verdict: FIX FIRST (Codex A, head 7bd803a0; production fix correct, coverage incomplete)
Red at base proven: m4CalendarPreview.test.mjs:96 (overnight end), :114 (recurrence), :137 (year rollover). Head: focused
4/4, web tsc 0, mobile 733/733. PG talent 84/84 OK on base and head (controls). Harness commit 7bd803a0 is a pure repair.
To do on agent/m4-08 (tests-only commit(s) first; no production change expected unless a new test finds one):
1. m4CalendarPreview.test.mjs:145 replaces the form with a string: mount the REAL owner and admin PostShiftForm flows and
   assert the displayed calendar events, the submission payload (slots unchanged, overnight end not shifted in the
   payload), and state across callback/time-context changes.
2. :120 edits an unrelated daytime slot directly: exercise selecting a recurring calendar event and verify its source
   mapping and the saved dates.
3. Split the combined rollover test: the year/month/leap rollover assertions are R (they fail at base), so label them R and
   keep the C controls in their own test so they execute on base. Isolate time-zone cases (rule 7: TZ set before load,
   one process per zone if needed).

## M4-05 senior verdict (Codex B, head 765eae7c): FIX FIRST (Claude B re-gate had APPROVED; red/green proof is valid)
To do on agent/m4-05 (tests-only commit first, then fix):
1. P2 frontend_mobile/app/next-shifts.tsx:53 mounts the loader for any authenticated user; the root guard redirects in an
   effect while the Stack stays mounted, so an Explorer still triggers one fetchMyConfirmedShifts call (rule 22). Fix:
   synchronously check worker eligibility (the same shared-core policy shiftSurface uses) before mounting
   ScopedNextShifts; R test: Explorer deep link to /next-shifts makes ZERO personal calls; C: PHARMACIST and OTHER_STAFF
   still load it.
2. P2 frontend_web m4Explorer.test.mjs:199 tests ProtectedRoute with a fabricated AllowedBoard and re-creates
   canAccessRoute at :214 (rule 11). Exercise the REAL Next public -> dashboard handoff/navigation adapter and the
   dashboard destination with production permission logic: hydration wait, no loop, zero personal calls.
3. P3 frontend_web/src/main.tsx:25 redirect drops #fragment: append location.hash (test it).

## M4-04 verdict: FIX FIRST (Codex A, head b4147156)
Valid red->green: keyed fetch/blob unmount (m4-marketplace-review.test.cjs:29,:45) and partial image retry
(marketplaceReviewSubmission.test.mjs:77). Gates: mobile 743/746 (3 failing tests fail on base too), shared-core 485/485,
Next 4/4, lint 0 errors. PostgreSQL: backend/marketplace/test_m4_submission.py does NOT import (SyntaxError at :146).
To do on agent/m4-04 (tests-only commit(s) first, then fix commits):
1. backend test_m4_submission.py:146 SyntaxError (generator argument, rule 20) and :62 helper named self.client shadowed by
   Django (rename it and its callers). Every test in the file must then run on PostgreSQL.
2. marketplaceReviewAccountRace.test.mjs:27,:50 assert before the deferred boundary (0 !== 1, fail on head too): resolve
   the pending fetch/blob after the account switch, then assert no upload (rule 21).
3. Controls that fail on base (marketplaceReviewAccountRace.test.mjs:71,:88; m4-marketplace-review.test.cjs:59,:82,:107)
   are really R tests: label them R and state the base defect, or fix them so they pass on base (rule 14).
4. Double tap (marketplaceReviewSubmission.test.mjs:21) fails on base and head: press twice from the same render (rule 21).
5. m4-marketplace-harness.cjs:7 resolve typescript repo-relative (rule 6).
6. Complete matrix #3-#9 of the M4-04 pack section: real seller/persona and blocked-eligibility cases, feature-off, image
   retry, error visibility and validation.
7. GAP frontend_mobile/features/parity/marketplace.tsx:188 (catalogue lookup) and :219 (photo picker) can finish after
   unmount and start a draft write; marketplaceDraft.ts:31 awaits a read before writing. Invalidate the step and check the
   scope before every patch; guard or serialize the draft completion. R tests first.
8. GAP frontend_web/landing_next/features/marketplace/add-item-wizard.tsx:189 Next create -> audience -> uploads -> submit
   has no account/unmount guard and no create receipt key (client_request_id); failed uploads are swallowed at :232.
   Capture scope, guard each boundary, keep the key and progress for retries, surface upload failures. R tests first.

## M4-07 verdict: FIX FIRST (Claude B, head 6786dafa; mobile fix looks correct)
RED at base (+ head tests): mobile R search :90 and R 13th poll :110 fail correctly; shared-core and backend C pass.
GREEN: mobile 5/5 and 738/738, tsc 0, lint 0 errors, shared-core 481/481, PG public_hub+pharmacy_hub 107 OK. No assertion
weakened 687b8052..6786dafa. The Next test fails on base AND head (harness bug).
To do on agent/m4-07 (tests-only commit first, then F7 as its own fix commit):
F1 (blocker) frontend_web/landing_next/app/hubs/m4Community.test.mjs:66 `render=()=>feed(tree.props)` re-renders Feed with
   the rendered root div's props, so hub becomes undefined and both feeds refetch: keep the Feed ELEMENT's props (before
   :61) and render with those.
F2 mobile m4-public-hubs.test.cjs:108 claims dedupe but fixtures never repeat an id: page 2 also returns poll 12; assert
   13 unique polls.
F3 :132 claims closed polls cannot be voted but no test has a closed or can_interact:false poll (pack item 5): add one of
   each and assert zero vote calls.
F4 :140 assert the exact call `deepEqual(calls.votes[0], [1, 10])`, not just Number.isInteger.
F5 :144 only checks the key changes; pack item 3 also needs "no former-account vote call" and "double tap = one request
   per feed": press "Load more polls" twice before resolving (same render, rule 21) and assert one call.
F6 backend public_hub/test_m4_community.py:88 `assertIn(status,(401,403))` -> `assertEqual(status, 401)` (pack B canonical).
F7 (P3, production) frontend_mobile/app/explore/hubs/[hub].tsx:200 a vote refresh landing after a poll page load can drop
   the newly loaded page (it captured the old pollPages): read the page count from a ref or ignore a stale refresh. R test first.
Also relabel the mobile "C" poll-page retry (:126) and "C" vote keeps feed (:134) as R (they fail on base: rule 14).

## M4-05 round 3 (Codex A re-gate of 71b434a4): FIX FIRST
Guarded: synchronous worker eligibility in frontend_mobile/app/next-shifts.tsx:58; worker controls pass; no old assertion
weakened. Mobile gate 739/742 at head (RED 740/742).
1. frontend_mobile features/nextShift/offlineConfirmedShifts.test.mjs:59: three EXISTING tests now fail because
   next-shifts.tsx imports shiftSurface: add that module to the harness mocks (rule 12). Head must not break them.
2. scripts/m4-next-shifts-guard.test.cjs:82: in RED the test stops at the redirect assertion before effects run, so the
   forbidden fetch is never counted: let effects run and assert fetchMyConfirmedShifts call count (rule 22). The
   signed-out case is labelled C but expects the new redirect: relabel it R or split it.
3. frontend_web m4Explorer.test.mjs:254 imports the real canAccessRoute but jumps from the Next overview redirect to a
   fabricated public-board location: follow the ACTUAL destination and navigation, prove no loop and zero personal calls.

## M4-08 round 3 (Codex A re-gate of 6a6231d7): FIX FIRST
Red at base for overnight, recurrence, rollover and DST. Head: web post-shift 8/10 (exit 1), tsc 0, mobile 733/733.
1. m4CalendarTimezoneIsolation.test.mjs:16: both child-process checks FAIL at head with empty stdout: make the child
   process actually run the test file (node --test <file> with env TZ=<zone>, capture and assert its exit code and output).
2. m4CalendarPreview.test.mjs:125 calls handleEditSlot directly instead of the calendar's real selection handler and never
   saves: select a recurring event through the real UI callback, then save, and assert source mapping and saved dates.
3. m4CalendarPreview.test.mjs:342 owner/admin cases assert the corrected overnight preview, so they are R (fail on base),
   not C: label them R and add separate base-passing C controls for payload and state. The diff also removed the earlier
   daytime-slot edit assertions: restore that coverage (never drop an assertion, rule 13).

## M4-06 verdict: FIX FIRST (Claude B, head a85a81ce; RED 4397869d)
R3 (blog topic+kind page 2) and R5 (TECHNICIAN pathway from role_code) go red to green correctly. Blockers:
1. R1 still FAILS at head: `missing filter control: Role`. In frontend_mobile/app/explore/talent-board.tsx the
   Role/State/Work type/Skill/Availability headings are plain Text and chips/date inputs have no accessibilityLabel:
   give each filter group an accessibilityLabel so R1 passes WITHOUT changing the test.
2. Head breaks 2 mobile tests that pass on 4397869d: public-organizations-and-talent.test.cjs:13 and
   w8-effect-lifecycle.test.cjs:6 (source-regex tests pinned to the old loader). Convert them to behaviour tests in the
   tests-only commit (rule 12); never just delete them.
3. Test matrix mostly missing (rule 5): #1 page-2-only match, applied filters, duplicate/clear controls; #2 QR
   reference_code survives login; #3 retry / stale response / double load / invalid next; #4 q, page reset on topic
   change, clearing topic; #5 Mia/Jack/STUDENT and Tom/Omar/Zoe, 403/error retry, account change; #6 anonymous never
   POSTs; #7 new frontend_web/src/pages/m4PublicDiscovery.test.mjs; #8 new backend talent/test_m4_public_discovery.py and
   public_hub/test_m4_articles.py. The C "page one kept after page 2 fails" passes only via the error button reloading
   page 1: make it assert page-1 rows stay visible without any retry.
4. utils/authReturnRoute.ts:3-11 SAFE_QUERY_PARAMS drops reference_code: QR reference lost after native login. Add it.
5. a85a81ce adds ?next= to both web Public Talent Board pages, but neither frontend_web/src/pages/login.tsx:70-90 nor
   the Next login.tsx:100-115 reads next: make both honour a sanitised next (same-origin relative path only).
6. Native uses new projectPublicTalentCandidate; both web TalentBoard/index.tsx:100-233 keep their own projector and
   differ (formatRoleLabel, formatWorkType, past dates dropped >= todayIso). Put ONE projector in shared-core and use it
   from all three, so native filters/results equal web (pack #7).
7. talent-board.tsx error block: Retry button labelled "Load more talent" reloads everything: label it "Retry". Skill
   chips show raw registry codes where web shows labels: use the same label lookup.
Trap: mobile tsc via the shared link points at ct-int dist; new shared-core exports show TS2305 there (environment only).

## Escalations (orchestrator session 5, 2026-11-07)
- M4-03 failed round 3 -> Codex A round 4 (local/m4-03-r4): 1465fb50 tests, cacf426d fix, pushed to agent/m4-03.
- M4-04 failed round 2 with a real server P1 (blank slug on API create) -> Codex A round 3 (local/m4-04-r3).
