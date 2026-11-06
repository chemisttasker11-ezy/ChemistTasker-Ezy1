const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Candidate uses the active assembly's dependencies; the assembled copy uses its own.
const localTypescript = path.resolve(__dirname, fs.existsSync(path.resolve(__dirname, '../node_modules/typescript')) ? '../node_modules/typescript' : '../frontend_mobile/node_modules/typescript');
const assemblyTypescript = path.resolve(__dirname, '../../pr249-m1-integration-20261105/frontend_mobile/node_modules/typescript');
const ts = require(fs.existsSync(localTypescript) ? localTypescript : assemblyTypescript);

function createHarness() {
  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];

  const reactMock = {
    useState(init) {
      const idx = cursor++;
      if (!(idx in state)) state[idx] = typeof init === 'function' ? init() : init;
      return [
        state[idx],
        (v) => {
          state[idx] = typeof v === 'function' ? v(state[idx]) : v;
        },
      ];
    },
    useRef(init) {
      const idx = cursor++;
      return (state[idx] ??= { current: init });
    },
    useMemo(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        state[idx] = { value: fn(), deps };
      }
      return state[idx].value;
    },
    useCallback(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        state[idx] = { fn, deps };
      }
      return state[idx].fn;
    },
    useEffect(effect, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev[i]);
      state[idx] = deps;
      if (changed) {
        effects.push(() => {
          if (cleanups[idx]) cleanups[idx]();
          const cl = effect();
          if (typeof cl === 'function') cleanups[idx] = cl;
        });
      }
    },
  };

  const flush = () => {
    while (effects.length > 0) effects.shift()();
  };

  const unmount = () => {
    for (const cl of cleanups) {
      if (typeof cl === 'function') cl();
    }
    cleanups.length = 0;
  };

  return { reactMock, flush, unmount, reset: () => { cursor = 0; }, state };
}

function findTreeNodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => findTreeNodes(n, predicate));
  const matched = predicate(node) ? [node] : [];
  const children = node.props?.children ? findTreeNodes(node.props.children, predicate) : [];
  return [...matched, ...children];
}

function createRosterHarness({
  initialUser = { id: 42, email: 'worker@test.com' },
  initialSelectedPharmacyId = null,
  initialWorkspaceLoading = false,
  pharmaciesList = [
    { id: 10, name: 'Pharmacy Alpha' },
    { id: 20, name: 'Pharmacy Beta' },
  ],
} = {}) {
  const harness = createHarness();
  let currentUser = initialUser;
  let currentWorkspacePharmacyId = initialSelectedPharmacyId;
  let currentWorkspaceLoading = initialWorkspaceLoading;

  const rosterAssignmentCalls = [];
  const pharmaciesCalls = [];
  let pendingPharmaciesDeferred = null;
  let pendingSaveDeferred = null;

  const mockAssignment = {
    id: 101,
    role: 'PHARMACIST',
    slotDate: '2026-11-02',
    startTime: '09:00',
    endTime: '17:00',
  };

  const workforceMock = {
    fetchRosterWorkerPharmaciesService: async () => {
      pharmaciesCalls.push(Date.now());
      if (pendingPharmaciesDeferred) return pendingPharmaciesDeferred.promise;
      return pharmaciesList;
    },
    fetchRosterWorkerAssignments: async (params) => {
      rosterAssignmentCalls.push(params);
      return [mockAssignment];
    },
    fetchCommunityShifts: async () => [],
    fetchWorkerShiftRequestsService: async () => [],
    createLeaveRequestService: async (body) => {
      if (pendingSaveDeferred) return pendingSaveDeferred.promise;
      return { id: 201, ...body };
    },
    updateLeaveRequestService: async (id, body) => {
      if (pendingSaveDeferred) return pendingSaveDeferred.promise;
      return { id, ...body };
    },
    deleteLeaveRequestService: async () => {},
    createWorkerShiftRequestService: async () => {},
    updateWorkerShiftRequestService: async () => {},
    deleteWorkerShiftRequestService: async () => {},
    claimShiftService: async () => {},
    WORKFORCE_LEAVE_TYPE_OPTIONS: [{ value: 'ANNUAL', label: 'Annual' }],
  };

  const exports = {};
  const context = {
    exports,
    module: { exports },
    require(id) {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') {
        return {
          jsx: (t, p) => (typeof t === 'function' ? t(p) : { type: t, props: p }),
          jsxs: (t, p) => (typeof t === 'function' ? t(p) : { type: t, props: p }),
          Fragment: 'Fragment',
        };
      }
      if (id === 'react-native') return { View: 'View' };
      if (id === 'react-native-paper') {
        return {
          Button: (p) => ({ type: 'Button', props: p }),
          Chip: (p) => ({ type: 'Chip', props: p }),
          Dialog: Object.assign((p) => ({ type: 'Dialog', props: p }), {
            Title: 'DialogTitle',
            ScrollArea: 'DialogScrollArea',
            Content: 'DialogContent',
            Actions: 'DialogActions',
          }),
          Portal: (p) => ({ type: 'Portal', props: p }),
          Text: 'Text',
        };
      }
      if (id === '@/components/security/GuardedModal') {
        return { GuardedDatePickerInput: (p) => ({ type: 'DatePickerInput', props: p }) };
      }
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: currentUser }) };
      if (id === '@/context/WorkspaceContext') {
        return {
          useWorkspace: () => ({
            selectedPharmacyId: currentWorkspacePharmacyId,
            isLoading: currentWorkspaceLoading,
          }),
        };
      }
      if (id === '@/components/ui') return { ContentState: (p) => ({ type: 'ContentState', props: p }) };
      if (id === '@/roles/shared/dashboard/workerHomeLogic') return { ownRosterAssignments: (arr) => arr };
      if (id === '@/features/parity/utils') {
        return {
          asArray: (a) => (Array.isArray(a) ? a : a ? [a] : []),
          dateFromIso: (d) => (d ? new Date(d) : null),
          errorMessage: (e) => e?.message || 'Error',
          isoDate: (d) => d.toISOString().slice(0, 10),
          replaceUnderscore: (s) => String(s || '').replaceAll('_', ' '),
          startOfWeek: () => '2026-11-02',
        };
      }
      if (id === '@/features/parity/ParityUI') {
        return {
          ActionButtons: (p) => ({ type: 'ActionButtons', props: p }),
          ChoiceChips: (p) => ({ type: 'ChoiceChips', props: p }),
          DataRow: (p) => ({ type: 'DataRow', props: p }),
          EmptyState: (p) => ({ type: 'EmptyState', props: p }),
          Field: (p) => ({ type: 'Field', props: p }),
          InfoNote: (p) => ({ type: 'InfoNote', props: p }),
          MetricGrid: (p) => ({ type: 'MetricGrid', props: p }),
          ParityPage: (p) => ({ type: 'ParityPage', props: p }),
          Section: (p) => ({ type: 'Section', props: p }),
        };
      }
      if (id === '@chemisttasker/shared-core') return workforceMock;
      if (id === '@/roles/shared/forms/useUnsavedChangesGuard') return { useUnsavedChangesGuard: () => ({}) };
      throw new Error(`Unmocked dependency ${id}`);
    },
    console,
    Date,
    Promise,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Error,
  };

  const sourcePath = path.resolve(__dirname, fs.existsSync(path.resolve(__dirname, '../app/my-roster.tsx')) ? '../app/my-roster.tsx' : '../frontend_mobile/app/my-roster.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  const { outputText } = ts.transpileModule(
    source +
      '\nexports._MyRosterScreenInner = MyRosterScreenInner;\nexports.MyRosterScreen = MyRosterScreen;\nexports.ShellRosterScreen = ShellRosterScreen;',
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }
  );

  vm.runInNewContext(outputText, context);

  return {
    harness,
    MyRosterScreen: exports.default || exports.MyRosterScreen,
    ShellRosterScreen: exports.ShellRosterScreen,
    MyRosterScreenInner: exports._MyRosterScreenInner,
    setUser: (u) => { currentUser = u; },
    setSelectedPharmacyId: (id) => { currentWorkspacePharmacyId = id; },
    setWorkspaceLoading: (l) => { currentWorkspaceLoading = l; },
    rosterAssignmentCalls,
    pharmaciesCalls,
    setPendingPharmaciesDeferred: (d) => { pendingPharmaciesDeferred = d; },
    setPendingSaveDeferred: (d) => { pendingSaveDeferred = d; },
  };
}

// 1. Eligible global beyond first selected
test('my-roster: eligible global pharmacy beyond first is selected when present in authorized pharmacies', async () => {
  const env = createRosterHarness({
    initialSelectedPharmacyId: 20, // Pharmacy Beta (second in list)
    initialWorkspaceLoading: false,
  });

  // Mount unscoped root route
  env.harness.reset();
  let tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  // Re-render after fetch
  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});

  // Verify: roster was fetched for pharmacy 20 (not defaulted to rows[0] = 10)
  assert.ok(env.rosterAssignmentCalls.length > 0, 'Must have made roster assignment call');
  const matchingCalls = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 20);
  assert.ok(matchingCalls.length > 0, 'Preferred global pharmacy 20 must be requested');
  const firstRowCalls = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 10);
  assert.equal(firstRowCalls.length, 0, 'Must not request first row 10 when global 20 is eligible');

  // Verify UI Chip states: 20 is selected, 10 is unselected
  const chips = findTreeNodes(tree, (n) => String(n.type) === 'Chip');
  assert.equal(chips.length, 2, 'Must render chips for both authorized pharmacies');
  const chip10 = chips.find((c) => c.props?.children === 'Pharmacy Alpha');
  const chip20 = chips.find((c) => c.props?.children === 'Pharmacy Beta');
  assert.equal(chip20?.props?.selected, true, 'Chip for global pharmacy 20 must be selected');
  assert.equal(chip10?.props?.selected, false, 'Chip for pharmacy 10 must not be selected');
});

// 2. Unauthorized global fallback
test('my-roster: unauthorized global falls back safely to first authorized pharmacy', async () => {
  const env = createRosterHarness({
    initialSelectedPharmacyId: 999, // Unauthorized pharmacy ID
    initialWorkspaceLoading: false,
  });

  env.harness.reset();
  let tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});

  // Verify: unauthorized 999 is ignored, falls back to rows[0] = 10
  assert.ok(env.rosterAssignmentCalls.length > 0, 'Must have made roster assignment call');
  const fallbackCalls = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 10);
  assert.ok(fallbackCalls.length > 0, 'Must fall back to first authorized pharmacy 10');
  const unauthorizedCalls = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 999);
  assert.equal(unauthorizedCalls.length, 0, 'Must NEVER request unauthorized pharmacy 999');

  // Verify UI Chip states: 10 is selected
  const chips = findTreeNodes(tree, (n) => String(n.type) === 'Chip');
  const chip10 = chips.find((c) => c.props?.children === 'Pharmacy Alpha');
  assert.equal(chip10?.props?.selected, true, 'Fallback chip 10 must be selected');
});

// 3. Explicit local choice retained when hydration or global updates
test('my-roster: explicit valid local chooser choice is retained when hydration or global updates', async () => {
  const env = createRosterHarness({
    initialSelectedPharmacyId: 20, // Global is 20
    initialWorkspaceLoading: false,
  });

  env.harness.reset();
  let tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});

  // User explicitly taps Chip 10 (Pharmacy Alpha)
  const chips = findTreeNodes(tree, (n) => String(n.type) === 'Chip');
  const chip10 = chips.find((c) => c.props?.children === 'Pharmacy Alpha');
  assert.ok(chip10, 'Must find Chip for Pharmacy Alpha');
  chip10.props.onPress();

  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});

  // Selection is now 10
  const postClickChips = findTreeNodes(tree, (n) => String(n.type) === 'Chip');
  const postClickChip10 = postClickChips.find((c) => c.props?.children === 'Pharmacy Alpha');
  assert.equal(postClickChip10?.props?.selected, true, 'Pharmacy 10 is now selected');

  // A real loading transition triggers a fresh authorized-pharmacy fetch.
  const callsBeforeReload = env.pharmaciesCalls.length;
  env.setWorkspaceLoading(true);
  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  env.setWorkspaceLoading(false);
  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  assert.equal(env.pharmaciesCalls.length, callsBeforeReload + 1, 'Reload must refetch pharmacies');
  env.harness.reset();
  tree = env.MyRosterScreen({});

  // Explicit choice (10) must remain selected after global update, NOT reset to global 20!
  const refreshedChips = findTreeNodes(tree, (n) => String(n.type) === 'Chip');
  const refreshedChip10 = refreshedChips.find((c) => c.props?.children === 'Pharmacy Alpha');
  const refreshedChip20 = refreshedChips.find((c) => c.props?.children === 'Pharmacy Beta');
  assert.equal(refreshedChip10?.props?.selected, true, 'Explicit choice 10 must be retained after hydration update');
  assert.equal(refreshedChip20?.props?.selected, false, 'Global 20 must NOT override explicit choice on hydration update');
});

// 4. Delayed hydration shouldn't fetch wrong pharmacy first
test('my-roster: delayed hydration does not fetch wrong pharmacy first', async () => {
  const env = createRosterHarness({
    initialSelectedPharmacyId: null, // Hydration not finished yet
    initialWorkspaceLoading: true, // Workspace is hydrating
  });

  env.harness.reset();
  let tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  // Verify: while workspace is loading, NO roster calls have been dispatched
  assert.equal(env.rosterAssignmentCalls.length, 0, 'Must NOT fetch roster while workspace hydration is in flight');

  // ParityPage indicates loading
  env.harness.reset();
  tree = env.MyRosterScreen({});
  const parityPages = findTreeNodes(tree, (n) => String(n.type) === 'ParityPage');
  assert.ok(parityPages.length > 0, 'Found ParityPage');
  assert.equal(parityPages[0].props.loading, true, 'Screen must show loading state during workspace hydration');

  // Hydration finishes: workspaceLoading becomes false, selectedPharmacyId becomes 20
  env.setWorkspaceLoading(false);
  env.setSelectedPharmacyId(20);

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});

  // Verify: roster was fetched for pharmacy 20 directly, and NEVER for pharmacy 10!
  assert.ok(env.rosterAssignmentCalls.length > 0, 'Must fetch roster once hydrated');
  const callsFor20 = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 20);
  assert.ok(callsFor20.length > 0, 'Roster requested for hydrated global pharmacy 20');
  const callsFor10 = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 10);
  assert.equal(callsFor10.length, 0, 'Delayed hydration must NEVER fetch wrong pharmacy 10 first');
});

// 5. Preceding in-flight fetch invalidated when workspaceLoading flips true
test('my-roster: preceding in-flight fetch invalidated when workspaceLoading flips true, ensuring only hydrated pharmacy requested', async () => {
  // Step A: Mount with old global A (10) and loading false. Request starts but is deferred.
  let resolvePharmacies;
  const pharmaciesPromise = new Promise((res) => { resolvePharmacies = res; });

  const env = createRosterHarness({
    initialSelectedPharmacyId: 10,
    initialWorkspaceLoading: false,
  });
  env.setPendingPharmaciesDeferred({ promise: pharmaciesPromise });

  env.harness.reset();
  let tree = env.MyRosterScreen({});
  env.harness.flush();
  assert.equal(env.pharmaciesCalls.length, 1, 'Old preferred pharmacy request must be in flight');

  // Step B: Workspace reloads/flips loading to true BEFORE the old request resolves
  env.setWorkspaceLoading(true);

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  // Invalidation effect runs: pharmaciesRequestRef.current += 1 (seq bumped to 2)

  // Step C: Old deferred response resolves in background
  resolvePharmacies([
    { id: 10, name: 'Pharmacy Alpha' },
    { id: 20, name: 'Pharmacy Beta' },
  ]);
  for (let i = 0; i < 15; i++) await Promise.resolve();

  // Verify: the old response was discarded; zero roster assignment calls dispatched so far
  assert.equal(env.rosterAssignmentCalls.length, 0, 'Stale pre-hydration response must be discarded without dispatching roster calls');

  // Step D: Workspace finishes reloading and hydrates to new global 20
  env.setPendingPharmaciesDeferred(null); // subsequent fetch resolves normally
  env.setWorkspaceLoading(false);
  env.setSelectedPharmacyId(20);

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({});

  // Verify: ONLY roster for 20 was requested; pharmacy 10 was NEVER requested
  assert.ok(env.rosterAssignmentCalls.length > 0, 'Must have requested roster for hydrated pharmacy');
  const callsFor20 = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 20);
  assert.ok(callsFor20.length > 0, 'Must request hydrated global pharmacy 20');
  const callsFor10 = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 10);
  assert.equal(callsFor10.length, 0, 'Must NEVER dispatch roster request for old pre-hydration pharmacy 10');
});

// 6. Scoped wrapper isolation, explicit null scope, and busy existing guards preserved
test('my-roster: scoped wrapper isolation, explicit null scope, and busy existing guards preserved', async () => {
  // 6a. Scoped wrapper isolation: ShellRosterScreen / explicit scopedPharmacyId
  const env = createRosterHarness({
    initialSelectedPharmacyId: 20, // Global is 20
    initialWorkspaceLoading: false,
  });

  // Explicit scoped prop = 10 overrides global workspace 20
  env.harness.reset();
  let tree = env.MyRosterScreen({ scopedPharmacyId: 10 });
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({ scopedPharmacyId: 10 });
  env.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  env.harness.reset();
  tree = env.MyRosterScreen({ scopedPharmacyId: 10 });

  // Verify scoped 10 was requested, not global 20
  const scopedCalls = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 10);
  assert.ok(scopedCalls.length > 0, 'Explicit scopedPharmacyId 10 must be used');
  const globalCalls = env.rosterAssignmentCalls.filter((c) => c.pharmacyId === 20);
  assert.equal(globalCalls.length, 0, 'Global pharmacy must NOT override explicit scopedPharmacyId');

  // In scoped mode, chips are NOT shown
  const chips = findTreeNodes(tree, (n) => String(n.type) === 'Chip');
  assert.equal(chips.length, 0, 'Scoped mode must not show local pharmacy selector chips');

  // 6b. A fresh explicit null scope must not request a roster.
  const nullEnv = createRosterHarness({ initialSelectedPharmacyId: 20 });
  nullEnv.harness.reset();
  const nullTree = nullEnv.MyRosterScreen({ scopedPharmacyId: null });
  nullEnv.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  const infoNotes = findTreeNodes(nullTree, (n) => String(n.type) === 'InfoNote');
  assert.ok(infoNotes.some((n) => n.props?.title === 'Choose a pharmacy'));
  assert.equal(nullEnv.rosterAssignmentCalls.length, 0, 'Null scope must not request a roster');

  // 6c. Busy guards: actions disable back and inputs
  let deferredLeave;
  env.setPendingSaveDeferred({ promise: new Promise((res) => { deferredLeave = res; }) });

  const buttons = findTreeNodes(tree, (n) => String(n.type) === 'Button');
  const requestLeaveBtn = buttons.find((b) => b.props?.children === 'Request leave');
  assert.ok(requestLeaveBtn, 'Must find Request leave button');
  requestLeaveBtn.props.onPress();

  env.harness.reset();
  tree = env.MyRosterScreen({ scopedPharmacyId: 10 });

  const saveBtns = findTreeNodes(tree, (n) => String(n.type) === 'Button');
  const saveBtn = saveBtns.find((b) => b.props?.children === 'Save');
  assert.ok(saveBtn, 'Must find Save button');
  saveBtn.props.onPress();

  // Re-render during pending write
  env.harness.reset();
  tree = env.MyRosterScreen({ scopedPharmacyId: 10 });

  const busyParityPage = findTreeNodes(tree, (n) => String(n.type) === 'ParityPage')[0];
  assert.equal(busyParityPage.props.backDisabled, true, 'backDisabled must be true while busy');

  const busyDatePickers = findTreeNodes(tree, (n) => String(n.type) === 'DatePickerInput');
  assert.equal(busyDatePickers[0].props.disabled, true, 'DatePickerInput must be disabled while busy');

  // Cleanup
  deferredLeave({ id: 999 });
  env.harness.unmount();
});
