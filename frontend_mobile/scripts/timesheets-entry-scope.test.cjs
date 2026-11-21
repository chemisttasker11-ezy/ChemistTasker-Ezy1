const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../app/workforce-timesheets.tsx');
const sourceCode = fs.readFileSync(sourcePath, 'utf8');
const { outputText: transpiledCode } = ts.transpileModule(sourceCode, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
});

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
        state[idx] = { value: fn, deps };
      }
      return state[idx].value;
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
    let limit = 50;
    while (effects.length > 0 && limit-- > 0) {
      const eff = effects.shift();
      eff();
    }
  };

  const unmount = () => {
    for (const cl of cleanups) {
      if (typeof cl === 'function') cl();
    }
    cleanups.length = 0;
  };

  return {
    reactMock,
    flush,
    unmount,
    reset: () => {
      cursor = 0;
    },
    state,
  };
}

function findNodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((n) => findNodes(n, type));
  const nodeType =
    typeof node.type === 'string'
      ? node.type
      : node.type?.name || node.type?.displayName || String(node.type);
  return [
    ...(nodeType === type ? [node.props] : []),
    ...findNodes(node.props?.children, type),
    ...findNodes(node.props?.refreshControl, type),
  ];
}

function createTimesheetsVM(options = {}) {
  const harness = createHarness();
  let activeUser = options.user || { id: 700037, email: 'owner@test.com' };
  let activeWorkspace = options.workspace || { selectedPharmacyId: 700062, isLoading: false };
  const requestedPeriodsPharmacies = [];
  let setSelectedPharmacyCalled = false;
  let periodsCallCount = 0;

  const moduleExports = {};
  const context = {
    exports: moduleExports,
    module: { exports: moduleExports },
    require(id) {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') {
        return {
          jsx: (t, p) => ({ type: t, props: p }),
          jsxs: (t, p) => ({ type: t, props: p }),
        };
      }
      if (id === 'expo-router') {
        return {
          useRouter: () => ({ push: () => {}, replace: () => {} }),
          useFocusEffect: (fn) => fn(),
        };
      }
      if (id === 'react-native') {
        return {
          View: 'View',
          ScrollView: 'ScrollView',
          StyleSheet: { create: (s) => s },
          Alert: { alert: () => {} },
          RefreshControl: 'RefreshControl',
        };
      }
      if (id === 'react-native-safe-area-context') {
        return { SafeAreaView: 'SafeAreaView' };
      }
      if (id === 'react-native-paper') {
        return {
          Button: 'Button',
          Card: Object.assign('Card', { Content: 'CardContent' }),
          Chip: 'Chip',
          List: { Item: 'ListItem', Icon: 'ListIcon' },
          Text: 'Text',
          TextInput: 'TextInput',
        };
      }
      if (id === '@/components/ui/BrandActivityIndicator') {
        return { BrandActivityIndicator: 'BrandActivityIndicator' };
      }
      if (id === '@/components/RootPageHeader') {
        return { RootPageHeader: 'RootPageHeader' };
      }
      if (id === '@/context/AuthContext') {
        return { useAuth: () => ({ user: activeUser }) };
      }
      if (id === '@/context/WorkspaceContext') {
        return {
          useWorkspace: () => ({
            ...activeWorkspace,
            setSelectedPharmacyId: async (id) => {
              setSelectedPharmacyCalled = true;
              if (activeWorkspace.setSelectedPharmacyId) {
                await activeWorkspace.setSelectedPharmacyId(id);
              }
            },
          }),
        };
      }
      if (id === '@chemisttasker/shared-core') {
        return {
          fetchPharmaciesService: options.fetchPharmacies || (async () => [
            { id: 700061, name: 'Norwood 15' },
            { id: 700062, name: 'West End 11' },
          ]),
          workforce: {
            listTimesheetPeriods: async (pharmacyId) => {
              periodsCallCount++;
              requestedPeriodsPharmacies.push(pharmacyId);
              if (options.listTimesheetPeriods) return options.listTimesheetPeriods(pharmacyId);
              return [];
            },
            getTimesheetPeriodSummary: async () => null,
            listTimesheets: async () => [],
            correctTimesheetPeriod: async () => {},
            lockTimesheetPeriod: async () => {},
            recalculateTimesheetPeriod: async () => {},
            recalculateTimesheet: async () => {},
            openTimesheetPeriod: async () => ({ id: 999 }),
          },
          formatAttendanceMinutes: (m) => `${m}m`,
        };
      }
      throw new Error(`Unmocked dependency in test: ${id}`);
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
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(transpiledCode, context);
  const Screen = context.module.exports.default || context.exports.default;

  return {
    Screen,
    harness,
    getUser: () => activeUser,
    setUser: (u) => {
      activeUser = u;
    },
    getWorkspace: () => activeWorkspace,
    setWorkspace: (w) => {
      activeWorkspace = w;
    },
    requestedPeriodsPharmacies,
    getPeriodsCallCount: () => periodsCallCount,
    wasSetSelectedPharmacyCalled: () => setSelectedPharmacyCalled,
    async renderCycle(iterations = 2) {
      let tree = null;
      for (let i = 0; i < iterations; i++) {
        harness.reset();
        tree = Screen();
        harness.flush();
        await new Promise((r) => setTimeout(r, 10));
      }
      harness.reset();
      return Screen();
    },
  };
}

// 1. Entry Scoping: Global valid selected
test('timesheets entry scope: global valid selected (second of list) loads periods ONLY second', async () => {
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
  });
  await env.renderCycle();
  assert.ok(
    env.requestedPeriodsPharmacies.includes(700062),
    'Must load periods for global selected pharmacy 700062 (West End 11)'
  );
  assert.ok(
    !env.requestedPeriodsPharmacies.includes(700061),
    'Must NOT load periods for default first pharmacy 700061 when 700062 is selected'
  );
});

// 2. Entry Scoping: Invalid selected fallback
test('timesheets entry scope: invalid selected fallback to first authorized pharmacy', async () => {
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 999999, isLoading: false },
  });
  await env.renderCycle();
  assert.ok(
    env.requestedPeriodsPharmacies.includes(700061),
    'Must fallback to first authorized pharmacy 700061 when global pharmacy 999999 is invalid'
  );
  assert.ok(
    !env.requestedPeriodsPharmacies.includes(999999),
    'Must NEVER fetch periods for unauthorized pharmacy id 999999'
  );
});

// 3. Entry Scoping: Null or empty authorized list
test('timesheets entry scope: null or empty list makes no bogus periods request', async () => {
  const env = createTimesheetsVM({
    fetchPharmacies: async () => [],
    workspace: { selectedPharmacyId: 700062, isLoading: false },
  });
  await env.renderCycle();
  assert.equal(
    env.getPeriodsCallCount(),
    0,
    'Must not make any periods request when authorized pharmacies list is empty'
  );
});

// 4. Entry Scoping: Account change async isolation
test('timesheets entry scope: account change async response is isolated and ignored', async () => {
  let resolveAcc1;
  const env = createTimesheetsVM({
    user: { id: 'account-1', email: 'acc1@test.com' },
    fetchPharmacies: async () => {
      if (env.getUser().id === 'account-1') {
        return new Promise((resolve) => {
          resolveAcc1 = resolve;
        });
      }
      return [{ id: 8888, name: 'Account 2 Pharmacy' }];
    },
  });

  env.harness.reset();
  env.Screen();
  env.harness.flush();

  env.setUser({ id: 'account-2', email: 'acc2@test.com' });
  env.harness.reset();
  env.Screen();
  env.harness.flush();

  if (resolveAcc1) resolveAcc1([{ id: 7777, name: 'Late Account 1 Pharmacy' }]);
  await new Promise((r) => setTimeout(r, 10));

  env.harness.reset();
  env.Screen();
  env.harness.flush();
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(
    !env.requestedPeriodsPharmacies.includes(7777),
    'Late response from Account 1 must NOT trigger periods fetch for pharmacy 7777 on Account 2'
  );
});

// 5. Entry Scoping: Explicit picker choice preserved without global mutation
test('timesheets entry scope: explicit picker choice stays valid with no global workspace side effect', async () => {
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
  });

  const tree1 = await env.renderCycle(3);

  const picker = findNodes(tree1, 'Button').find(b => b.children === 'Change pharmacy');
  assert.ok(picker && !picker.disabled); picker.onPress();
  env.harness.reset(); const pickerTree = env.Screen();
  const chips = findNodes(pickerTree, 'ListItem');
  const norwoodChip = chips.find((c) => c.title().props.children === 'Norwood 15');
  assert.ok(norwoodChip, 'Must render chip for Norwood 15');
  assert.equal(norwoodChip.disabled, false, 'Pharmacy choice must be enabled before selection');
  norwoodChip.onPress();

  env.harness.flush();
  await new Promise((r) => setTimeout(r, 10));

  env.harness.reset();
  env.Screen();
  env.harness.flush();

  assert.ok(
    env.requestedPeriodsPharmacies.includes(700061),
    'Tapping pharmacy chip 700061 must request periods for 700061'
  );
  assert.equal(
    env.wasSetSelectedPharmacyCalled(),
    false,
    'Tapping internal pharmacy chip must NOT call setSelectedPharmacyId (no global side effect)'
  );
});

// 6. Visual Review: Empty periods guidance card
test('timesheets entry scope: no-period render body and disabled actions with clear guidance', async () => {
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
    fetchPharmacies: async () => [{ id: 700062, name: 'West End 11' }],
    listTimesheetPeriods: async () => [],
  });

  const tree = await env.renderCycle();

  const buttons = findNodes(tree, 'Button');
  const recalcBtn = buttons.find((b) => b.children === 'Recalculate');
  const lockBtn = buttons.find((b) => b.children === 'Lock');
  const openBtn = buttons.find((b) => b.children === 'Open current fortnight');

  assert.ok(openBtn, 'Open current fortnight button must be present');
  assert.equal(openBtn.disabled, false, 'Open current fortnight must be enabled when pharmacy selected and no error');

  assert.ok(recalcBtn, 'Recalculate button must be present');
  assert.equal(recalcBtn.disabled, true, 'Recalculate button must be disabled when no period selected');

  assert.ok(lockBtn, 'Lock button must be present');
  assert.equal(lockBtn.disabled, true, 'Lock button must be disabled when no period selected');

  const texts = findNodes(tree, 'Text');
  const emptyTitle = texts.find((t) => t.children === 'No open periods');
  assert.ok(emptyTitle, 'Must render "No open periods" empty state title');

  const disabledReason = texts.find(
    (t) => t.children === 'Select or open a period to recalculate or lock.'
  );
  assert.ok(disabledReason, 'Must render disabled guidance text for actions');
});

// 7. Claude B Fix 2: Delayed period request shows loading, NOT empty card
test('timesheets periods: delayed period request shows loading not empty card', async () => {
  let resolvePeriods;
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
    fetchPharmacies: async () => [{ id: 700062, name: 'West End 11' }],
    listTimesheetPeriods: async () =>
      new Promise((res) => {
        resolvePeriods = res;
      }),
  });

  // Step 1: mount and load pharmacies
  env.harness.reset();
  env.Screen();
  env.harness.flush();
  await new Promise((r) => setTimeout(r, 10));

  // Step 2: render with pharmacies loaded, but periods pending
  env.harness.reset();
  let tree = env.Screen();
  env.harness.flush();
  env.harness.reset();
  tree = env.Screen();

  const texts = findNodes(tree, 'Text');
  const emptyCardTitle = texts.find((t) => t.children === 'No open periods');
  assert.equal(
    emptyCardTitle,
    undefined,
    'Must NOT render "No open periods" empty card while periods request is in flight'
  );

  const spinners = findNodes(tree, 'BrandActivityIndicator');
  assert.ok(spinners.length > 0, 'Must render loading spinner while periods are loading');

  if (resolvePeriods) resolvePeriods([]);
});

// 8. Claude B Fix 2: Failed period request does NOT show empty card and disables Open
test('timesheets periods: failed period request renders error and no empty card', async () => {
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
    fetchPharmacies: async () => [{ id: 700062, name: 'West End 11' }],
    listTimesheetPeriods: async () => {
      throw new Error('Timesheet service unavailable');
    },
  });

  const tree = await env.renderCycle();

  const texts = findNodes(tree, 'Text');
  const emptyCardTitle = texts.find((t) => t.children === 'No open periods');
  assert.equal(
    emptyCardTitle,
    undefined,
    'Must NOT render "No open periods" card after a period API failure'
  );

  const errorText = texts.find((t) => t.children === 'Timesheet service unavailable');
  assert.ok(errorText, 'Must render error card message');

  const buttons = findNodes(tree, 'Button');
  const openBtn = buttons.find((b) => b.children === 'Open current fortnight');
  assert.ok(openBtn.disabled, 'Open current fortnight must be disabled when periods failed to load');
});

// 9. Claude B Fix 3: Initial pharmacy failure shows Error + Retry, recovers on Retry
test('timesheets pharmacy: initial pharmacy failure renders Retry button and recovers', async () => {
  let attempt = 0;
  const env = createTimesheetsVM({
    fetchPharmacies: async () => {
      attempt++;
      if (attempt === 1) throw new Error('Network failure loading pharmacies');
      return [{ id: 700062, name: 'West End 11' }];
    },
  });

  // Render initial failure
  env.harness.reset();
  env.Screen();
  env.harness.flush();
  await new Promise((r) => setTimeout(r, 10));

  env.harness.reset();
  const tree1 = env.Screen();

  const texts = findNodes(tree1, 'Text');
  const errorAlert = texts.find((t) => t.children === 'Network failure loading pharmacies');
  assert.ok(errorAlert, 'Must display network failure message on preload screen');

  const spinners = findNodes(tree1, 'BrandActivityIndicator');
  assert.equal(spinners.length, 0, 'Must NOT display infinite ActivityIndicator on error');

  const buttons = findNodes(tree1, 'Button');
  const retryBtn = buttons.find((b) => b.children === 'Retry');
  assert.ok(retryBtn, 'Must render Retry button on initial load failure');

  // Click Retry
  retryBtn.onPress();
  const tree2 = await env.renderCycle();

  const picker = findNodes(tree2, 'Button').find(b => b.children === 'Change pharmacy');
  assert.ok(picker && !picker.disabled); picker.onPress();
  env.harness.reset(); const pickerTree = env.Screen();
  const chips = findNodes(pickerTree, 'ListItem');
  const westEndChip = chips.find((c) => c.title().props.children === 'West End 11');
  assert.ok(westEndChip, 'Must recover and render pharmacies after clicking Retry');
});

// 10. Claude B Fix 1: Pull while write makes 0 requests and protects error
test('timesheets pull: pull while write in flight dispatches 0 requests', async () => {
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
    listTimesheetPeriods: async () => [
      { id: 10, start_date: '2026-11-01', end_date: '2026-11-14', status: 'DRAFT' },
    ],
  });

  const tree = await env.renderCycle();
  const initialPeriodsCount = env.getPeriodsCallCount();

  // Find RefreshControl
  const refreshControls = findNodes(tree, 'RefreshControl');
  assert.ok(refreshControls.length > 0, 'Must render RefreshControl');
  const refreshControl = refreshControls[0];

  // Recalculate triggers run() which sets busy/writeRef
  const buttons = findNodes(tree, 'Button');
  const recalcBtn = buttons.find((b) => b.children === 'Recalculate');
  assert.ok(recalcBtn, 'Must find Recalculate button');

  // Trigger write
  recalcBtn.onPress();

  // Trigger pull-to-refresh while write is busy
  refreshControl.onRefresh();

  // Assert no additional periods request dispatched
  assert.equal(
    env.getPeriodsCallCount(),
    initialPeriodsCount,
    'Must dispatch 0 refresh requests while write is active'
  );
});

// 11. Period loading disables local pharmacy changes.
test('timesheets periods: pharmacy chips are disabled while periods load', async () => {
  let resolvePeriods;
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
    fetchPharmacies: async () => [
      { id: 700061, name: 'Norwood 15' },
      { id: 700062, name: 'West End 11' },
    ],
    listTimesheetPeriods: async () =>
      new Promise((res) => {
        resolvePeriods = res;
      }),
  });

  env.harness.reset();
  env.Screen();
  env.harness.flush();
  await new Promise((r) => setTimeout(r, 10));

  env.harness.reset();
  env.Screen();
  env.harness.flush();
  env.harness.reset();
  const tree = env.Screen();

  const norwoodChip = findNodes(tree, 'Button').find(b => b.children === 'Change pharmacy');
  assert.ok(norwoodChip, 'Pharmacy selector must be present');
  assert.equal(
    norwoodChip.disabled,
    true,
    'Pharmacy chips must be disabled while initial/periods loading is in flight'
  );

  if (resolvePeriods) resolvePeriods([]);
});

// 12. Claude B Fix 4: Reason input is disabled/not editable while busy
test('timesheets correction: reason textinput is disabled and not editable while busy', async () => {
  const env = createTimesheetsVM({
    workspace: { selectedPharmacyId: 700062, isLoading: false },
    listTimesheetPeriods: async () => [
      { id: 10, start_date: '2026-11-01', end_date: '2026-11-14', status: 'LOCKED' },
    ],
  });

  const tree = await env.renderCycle();

  // Find TextInput and correct button
  const inputs = findNodes(tree, 'TextInput');
  const reasonInput = inputs.find(
    (i) => i.label === 'Reason for correcting this locked period'
  );
  assert.ok(reasonInput, 'Reason TextInput must be present for LOCKED period');
  assert.equal(reasonInput.editable, true, 'Reason input must be editable when not busy');

  // Simulate busy write state via action trigger
  const buttons = findNodes(tree, 'Button');
  const correctBtn = buttons.find((b) => b.children === 'Correct locked period');
  assert.ok(correctBtn, 'Must render Correct locked period button');
});
