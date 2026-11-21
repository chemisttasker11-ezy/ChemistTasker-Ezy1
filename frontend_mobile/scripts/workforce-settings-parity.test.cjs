const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = readFileSync(resolve(__dirname, '../app/workforce-settings.tsx'), 'utf8');
test('workforce settings preserves payroll and contracted-hours editing while linking all web sibling jobs', () => {
  assert.match(source,/workforce\.updatePayrollConfiguration/);
  assert.match(source,/workforce\.saveWorkSettings/);
  for(const route of ['/manager/roster/coverage','/workforce/employment-engagements','/attendance/kiosk-status','/workforce/payroll-export'])
    assert.ok(source.includes(route), route);
});
test('linked tools disclose active-workspace scope and inherit branded mobile tokens', () => {
  assert.match(source,/These tools use your active pharmacy workspace/);
  assert.match(source,/fontFamily: font\.outfit\.medium/);
  assert.match(source,/minHeight: touch\.min/);
});

test('workforce settings mounts RootPageHeader with disabled tied to busyKey and unsaved changes guard', () => {
  assert.match(source, /import \{ RootPageHeader \} from '@\/components\/RootPageHeader'/);
  assert.match(source, /import \{ useUnsavedChangesGuard \} from '@\/roles\/shared\/forms\/useUnsavedChangesGuard'/);
  assert.match(source, /<RootPageHeader title="Workforce Settings" disabled=\{busyKey != null\} \/>/);
  assert.match(source, /useUnsavedChangesGuard\(hoursDraft/);
  assert.match(source, /edges=\{?\['bottom', 'left', 'right'\]\}?/);
});

test('workforce settings component VM: renders without TDZ, wires RootPageHeader disabled state, forwards hoursDraft to guard, and guards mutations', async () => {
  let ts;
  try {
    ts = require('typescript');
  } catch {
    ts = require(path.resolve(__dirname, '../node_modules/typescript'));
  }

  const screenSource = fs.readFileSync(path.resolve(__dirname, '../app/workforce-settings.tsx'), 'utf8');
  const vmSource = screenSource + '\nexports._ScopedWorkforceSettings = ScopedWorkforceSettings;\n';
  const { outputText } = ts.transpileModule(vmSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });

  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];

  const reactMock = {
    useState(init) {
      const idx = cursor++;
      if (!(idx in state)) state[idx] = typeof init === 'function' ? init() : init;
      return [state[idx], (v) => { state[idx] = typeof v === 'function' ? v(state[idx]) : v; }];
    },
    useRef(init) {
      const idx = cursor++;
      return (state[idx] ??= { current: init });
    },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
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

  const flush = async () => {
    while (effects.length > 0) {
      const eff = effects.shift();
      eff();
    }
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  const guardInvocations = [];
  const markCleanCalls = [];
  const confirmDiscardCalls = [];

  const unsavedMock = (value, options) => {
    guardInvocations.push({ value, options });
    return {
      isDirty: false,
      markClean: (val) => markCleanCalls.push(val),
      confirmDiscard: (fn) => {
        confirmDiscardCalls.push(fn);
        fn();
      },
      discardChanges: async () => true,
    };
  };

  let pushCalls = [];
  const routerMock = {
    push: (url) => pushCalls.push(url),
    back: () => {},
  };

  const workforceMock = {
    getPayrollConfiguration: async () => ({ pharmacy_id: 1, use_chemisttasker_payroll: true }),
    listWorkSettings: async () => [
      { membership_id: 10, worker_name: 'Alice', role: 'PHARMACIST', employment_type: 'PART_TIME', contracted_weekly_minutes: 1800 },
    ],
    listEmploymentEngagements: async () => [
      { membership_id: 10, effective_from: '2026-01-01', award_classification: 'Level 1', pay_basis: 'AWARD', rate_weekday: 45, rate_saturday: 55, rate_sunday: 65, rate_public_holiday: 80 },
    ],
    saveWorkSettings: async (body) => ({
      membership_id: body?.membership_id ?? 10,
      contracted_weekly_minutes: body?.contracted_weekly_minutes ?? 2130,
    }),
    updatePayrollConfiguration: async () => ({ use_chemisttasker_payroll: false }),
  };

  let renderedHeaderProps = null;

  const mocks = {
    react: reactMock,
    'react/jsx-runtime': {
      jsx: (t, p) => {
        if (t === 'RootPageHeader') renderedHeaderProps = p;
        return typeof t === 'function' ? t(p) : { type: t, props: p };
      },
      jsxs: (t, p) => {
        if (t === 'RootPageHeader') renderedHeaderProps = p;
        return typeof t === 'function' ? t(p) : { type: t, props: p };
      },
      Fragment: 'Fragment',
    },
    'react-native': {
      View: 'View',
      Text: 'Text',
      ScrollView: 'ScrollView',
      RefreshControl: (p) => ({ type: 'RefreshControl', props: p }),
      StyleSheet: { create: s => s },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-paper': {
      Button: (p) => ({ type: 'Button', props: p }),
      Card: Object.assign((p) => ({ type: 'Card', props: p }), { Content: 'CardContent' }),
      Chip: (p) => ({ type: 'Chip', props: p }),
      List: { Item: 'ListItem', Icon: 'ListIcon' },
      Switch: (p) => ({ type: 'Switch', props: p }),
      Text: 'PaperText',
      TextInput: (p) => ({ type: 'TextInput', props: p }),
    },
    'expo-router': { useRouter: () => routerMock },
    '@/constants/tokens': {
      colors: { pageBg: '#fff', brandNavy: '#001', textSecondary: '#666', subtleBg: '#eee', surfaceBg: '#fff', status: { amber: { bg: '#fa0' }, red: { bg: '#f00', fg: '#fff' } } },
      font: { outfit: { medium: 'Outfit' } },
      radius: { nested: 4, card: 8 },
      space: { xs: 2, md: 8, sm: 4 },
      touch: { min: 44 },
    },
    '@/context/AuthContext': {
      useAuth: () => ({ user: { role: 'OWNER' }, hasCapability: () => true }),
    },
    '@/context/WorkspaceContext': {
      useWorkspace: () => ({ selectedPharmacyId: null, isLoading: false }),
    },
    '@/roles/shared/dashboard/ManagerHome': {
      orgCapabilities: () => ({ roster: true }),
    },
    '@/components/ui/BrandActivityIndicator': {
      BrandActivityIndicator: 'BrandActivityIndicator',
    },
    '@chemisttasker/shared-core': {
      canManageKioskDevices: () => true,
      fetchPharmaciesService: async () => [{ id: 1, name: 'Main Pharmacy' }, { id: 2, name: 'Branch Pharmacy' }],
      workforce: workforceMock,
    },
    '@/components/RootPageHeader': {
      RootPageHeader: (props) => {
        renderedHeaderProps = props;
        return { type: 'RootPageHeader', props };
      },
    },
    '@/roles/shared/forms/useUnsavedChangesGuard': {
      useUnsavedChangesGuard: unsavedMock,
    },
  };

  const exports = {};
  const context = {
    exports, module: { exports },
    require: (id) => mocks[id] || require(id),
    console, Date, Promise, Set, Map, Array, Object, Number, String, Boolean, Error, Math,
  };

  const vm = require('node:vm');
  vm.runInNewContext(outputText, context);
  const Screen = () => exports._ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // 1. Initial render: MUST NOT THROW TDZ ReferenceError
  cursor = 0;
  let tree = Screen();
  assert.ok(tree, 'Component rendered successfully without TDZ error');

  // Verify RootPageHeader is rendered and initially NOT disabled
  assert.ok(renderedHeaderProps, 'RootPageHeader rendered');
  assert.equal(renderedHeaderProps.title, 'Workforce Settings');
  assert.equal(renderedHeaderProps.disabled, false, 'RootPageHeader initially enabled when not busy');

  // Verify guard was invoked initially with hoursDraft
  assert.ok(guardInvocations.length > 0, 'useUnsavedChangesGuard invoked');
  assert.equal(guardInvocations[0].options.saving, false, 'saving option false when not busy');

  // 2. Flush initial fetch effects to load pharmacies and pharmacy 1 staff
  await flush();

  // Re-render after state updates from fetch
  cursor = 0;
  tree = Screen();
  await flush();

  // 3. Verify markClean was called with loaded staff hours
  assert.ok(markCleanCalls.length > 0, 'markClean was called upon loading staff data');
  const lastClean = markCleanCalls[markCleanCalls.length - 1];
  assert.equal(lastClean[10], '30.00', 'markClean received loaded contracted hours 30.00 (1800m / 60)');
  cursor = 0;
  tree = Screen();

  // 4. Find helper to traverse rendered tree
  function findNodes(node, predicate) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(n => findNodes(n, predicate));
    const matched = predicate(node) ? [node] : [];
    const children = node.props?.children ? findNodes(node.props.children, predicate) : [];
    return [...matched, ...children, ...findNodes(node.props?.refreshControl, predicate)];
  }

  // Find TextInput for member 10 contracted hours
  const textInputs = findNodes(tree, n => n.type === 'TextInput' && n.props?.label === 'Contracted h/week');
  assert.ok(textInputs.length >= 1, 'Found contracted hours TextInput');

  // 5. Change contracted hours: verify forwarded to useUnsavedChangesGuard
  textInputs[0].props.onChangeText('35.50');
  cursor = 0;
  tree = Screen();

  const lastGuardCall = guardInvocations[guardInvocations.length - 1];
  assert.equal(lastGuardCall.value[10], '35.50', 'Updated hoursDraft was forwarded to useUnsavedChangesGuard');

  // Verify RootPageHeader is disabled while save is busy
  const saveButtons = findNodes(tree, n => n.type === 'Button' && n.props?.children === 'Save');
  assert.ok(saveButtons.length >= 1, 'Found Save contracted hours button');
  saveButtons[0].props.onPress();
  cursor = 0;
  tree = Screen();
  assert.equal(renderedHeaderProps.disabled, true, 'RootPageHeader disabled when save is busy');
  await flush();
  cursor = 0;
  tree = Screen();
  assert.equal(renderedHeaderProps.disabled, false, 'RootPageHeader re-enabled after save completes');

  // 5b. Dedicated empty response failure actual handler case: malformed server response sets error, keeps draft dirty, and unlocks
  workforceMock.saveWorkSettings = async () => ({});
  textInputs[0].props.onChangeText('42.00');
  cursor = 0;
  tree = Screen();
  const retrySaveButtons = findNodes(tree, n => n.type === 'Button' && n.props?.children === 'Save');
  retrySaveButtons[0].props.onPress();
  cursor = 0;
  tree = Screen();
  assert.equal(renderedHeaderProps.disabled, true, 'Header disabled while save is busy');
  await flush();
  cursor = 0;
  tree = Screen();
  assert.equal(renderedHeaderProps.disabled, false, 'Header unlocked after malformed response failure');
  const errorCards = findNodes(tree, n => n.type === 'Card' && n.props?.style?.backgroundColor === '#f00');
  assert.ok(errorCards.length >= 1, 'Error card rendered on malformed response');
  const draftAfterMalformed = guardInvocations[guardInvocations.length - 1];
  assert.equal(draftAfterMalformed.value[10], '42.00', 'Draft preserved after malformed response failure');

  // Restore valid saveWorkSettings fixture
  workforceMock.saveWorkSettings = async (body) => ({
    membership_id: body?.membership_id ?? 10,
    contracted_weekly_minutes: body?.contracted_weekly_minutes ?? 2130,
  });

  // 6. Test confirmDiscard wiring on pull-to-refresh
  const refreshControls = findNodes(tree, n => n.type === 'RefreshControl');
  assert.ok(refreshControls.length >= 1, 'Found RefreshControl');
  const prevConfirmDiscardCount = confirmDiscardCalls.length;
  refreshControls[0].props.onRefresh();
  assert.equal(confirmDiscardCalls.length, prevConfirmDiscardCount + 1, 'Pull-to-refresh invokes unsaved.confirmDiscard');
  await flush();
  cursor = 0;
  tree = Screen();

  // 7. Test confirmDiscard wiring on pharmacy chip selection
  const picker = findNodes(tree, n => n.type === 'Button' && n.props?.children === 'Change pharmacy')[0];
  assert.ok(picker && !picker.props.disabled, 'Found enabled pharmacy selector');
  picker.props.onPress(); cursor = 0; tree = Screen();
  const chips = findNodes(tree, n => n.type === 'ListItem' && n.props?.title().props.children === 'Branch Pharmacy');
  assert.equal(chips.length, 1, 'Found Branch Pharmacy option');
  chips[0].props.onPress();
  assert.equal(confirmDiscardCalls.length, prevConfirmDiscardCount + 2, 'Pharmacy chip selection invokes unsaved.confirmDiscard');

  // 8. Test confirmDiscard wiring on sibling tool button
  const coverageBtn = findNodes(tree, n => n.type === 'Button' && n.props?.icon === 'calendar-check');
  assert.ok(coverageBtn.length >= 1, 'Found Coverage requirements tool button');
  coverageBtn[0].props.onPress();
  assert.equal(confirmDiscardCalls.length, prevConfirmDiscardCount + 3, 'Sibling tool button invokes unsaved.confirmDiscard');
  assert.ok(pushCalls.includes('/manager/roster/coverage'), 'Sibling navigation executed');
});

test('workforce settings outer component assigns scoped accountKey across different users, roles, and guest', () => {
  let ts;
  try {
    ts = require('typescript');
  } catch {
    ts = require(path.resolve(__dirname, '../node_modules/typescript'));
  }

  const screenSource = fs.readFileSync(path.resolve(__dirname, '../app/workforce-settings.tsx'), 'utf8');
  const vmSource = screenSource + '\nexports._ScopedWorkforceSettings = ScopedWorkforceSettings;\n';
  const { outputText } = ts.transpileModule(vmSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });

  let currentUser = null;

  const mocks = {
    react: {
      useState: (i) => [i, () => {}],
      useRef: (i) => ({ current: i }),
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      useEffect: () => {},
    },
    'react/jsx-runtime': {
      jsx: (type, props, key) => ({ type, props, key }),
      jsxs: (type, props, key) => ({ type, props, key }),
      Fragment: 'Fragment',
    },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', StyleSheet: { create: s => s } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-paper': { Button: 'Button', Card: Object.assign('Card', { Content: 'CardContent' }), Chip: 'Chip', Switch: 'Switch', Text: 'Text', TextInput: 'TextInput' },
    'expo-router': { useRouter: () => ({ push: () => {}, back: () => {} }) },
    '@/constants/tokens': {
      colors: { pageBg: '#fff', brandNavy: '#001', textSecondary: '#666', subtleBg: '#eee', surfaceBg: '#fff', status: { amber: { bg: '#fa0' }, red: { bg: '#f00', fg: '#fff' } } },
      font: { outfit: { medium: 'Outfit' } },
      radius: { nested: 4, card: 8 },
      space: { xs: 2, md: 8, sm: 4 },
      touch: { min: 44 },
    },
    '@/context/AuthContext': { useAuth: () => ({ user: currentUser, hasCapability: () => true }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ selectedPharmacyId: null, isLoading: false }) },
    '@/roles/shared/dashboard/ManagerHome': { orgCapabilities: () => ({}) },
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'BrandActivityIndicator' },
    '@chemisttasker/shared-core': { canManageKioskDevices: () => false, fetchPharmaciesService: async () => [], workforce: {} },
    '@/components/RootPageHeader': { RootPageHeader: 'RootPageHeader' },
    '@/roles/shared/forms/useUnsavedChangesGuard': { useUnsavedChangesGuard: () => ({ markClean: () => {}, confirmDiscard: () => {} }) },
  };

  const exports = {};
  const context = {
    exports, module: { exports },
    require: (id) => mocks[id] || require(id),
    console, Date, Promise, Object, Array, String, Number, Boolean,
  };

  vm.runInNewContext(outputText, context);

  const WorkforceSettingsScreen = exports.default;
  const ScopedWorkforceSettings = exports._ScopedWorkforceSettings;

  // 1. Full user 1 (OWNER)
  currentUser = { id: 101, email: 'owner@example.com', username: 'owner1', role: 'OWNER' };
  const el1 = WorkforceSettingsScreen();
  assert.equal(el1.type, ScopedWorkforceSettings, 'Renders ScopedWorkforceSettings inner component');
  assert.equal(el1.key, '101:OWNER', 'Outer key uses stable account ID and role');
  assert.deepEqual(el1.props.user, currentUser, 'Passes user prop down to inner component');
  currentUser = { ...currentUser, email: 'renamed@example.com', username: 'renamed' };
  assert.equal(WorkforceSettingsScreen().key, el1.key, 'Profile labels do not remount the same account');
  currentUser = { ...currentUser, role: 'PHARMACIST' };
  assert.notEqual(WorkforceSettingsScreen().key, el1.key, 'Role change remounts the same account');

  // 2. User 2 (PHARMACIST)
  currentUser = { id: 202, email: 'pharma@example.com', username: 'pharma2', role: 'PHARMACIST' };
  const el2 = WorkforceSettingsScreen();
  assert.equal(el2.type, ScopedWorkforceSettings);
  assert.equal(el2.key, '202:PHARMACIST');
  assert.notEqual(el1.key, el2.key, 'Account key differs between distinct user IDs and roles');

  // 3. User with partial fields
  currentUser = { id: 303, role: 'MANAGER' };
  const el3 = WorkforceSettingsScreen();
  assert.equal(el3.key, '303:MANAGER');
  assert.notEqual(el3.key, el1.key);

  // 4. Guest / signed-out (user = null)
  currentUser = null;
  const elGuest = WorkforceSettingsScreen();
  assert.equal(elGuest.type, ScopedWorkforceSettings);
  assert.equal(elGuest.key, 'guest', 'Outer key is guest when signed out');
  assert.equal(elGuest.props.user, null);
  assert.notEqual(elGuest.key, el1.key);
  assert.notEqual(elGuest.key, el2.key);
});

test('workforce settings ScopedWorkforceSettings: initial pharmacy fetch cleanup isolates stale promises and guest skips fetch', async () => {
  let ts;
  try {
    ts = require('typescript');
  } catch {
    ts = require(path.resolve(__dirname, '../node_modules/typescript'));
  }

  const screenSource = fs.readFileSync(path.resolve(__dirname, '../app/workforce-settings.tsx'), 'utf8');
  const vmSource = screenSource + '\nexports._ScopedWorkforceSettings = ScopedWorkforceSettings;\n';
  const { outputText } = ts.transpileModule(vmSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });

  let fetchCalls = [];
  let deferredResolve;
  let deferredReject;
  const createDeferred = () => new Promise((res, rej) => {
    deferredResolve = res;
    deferredReject = rej;
  });

  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];

  const reactMock = {
    useState(init) {
      const idx = cursor++;
      if (!(idx in state)) state[idx] = typeof init === 'function' ? init() : init;
      return [state[idx], (v) => { state[idx] = typeof v === 'function' ? v(state[idx]) : v; }];
    },
    useRef(init) {
      const idx = cursor++;
      return (state[idx] ??= { current: init });
    },
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
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

  const flush = async () => {
    while (effects.length > 0) {
      const eff = effects.shift();
      eff();
    }
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  const mocks = {
    react: reactMock,
    'react/jsx-runtime': {
      jsx: (t, p) => ({ type: t, props: p }),
      jsxs: (t, p) => ({ type: t, props: p }),
      Fragment: 'Fragment',
    },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', StyleSheet: { create: s => s } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-paper': { Button: 'Button', Card: Object.assign('Card', { Content: 'CardContent' }), Chip: 'Chip', Switch: 'Switch', Text: 'Text', TextInput: 'TextInput' },
    'expo-router': { useRouter: () => ({ push: () => {}, back: () => {} }) },
    '@/constants/tokens': {
      colors: { pageBg: '#fff', brandNavy: '#001', textSecondary: '#666', subtleBg: '#eee', surfaceBg: '#fff', status: { amber: { bg: '#fa0' }, red: { bg: '#f00', fg: '#fff' } } },
      font: { outfit: { medium: 'Outfit' } },
      radius: { nested: 4, card: 8 },
      space: { xs: 2, md: 8, sm: 4 },
      touch: { min: 44 },
    },
    '@/context/AuthContext': { useAuth: () => ({ user: null, hasCapability: () => true }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ selectedPharmacyId: null, isLoading: false }) },
    '@/roles/shared/dashboard/ManagerHome': { orgCapabilities: () => ({}) },
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'BrandActivityIndicator' },
    '@chemisttasker/shared-core': {
      canManageKioskDevices: () => false,
      fetchPharmaciesService: (params) => {
        fetchCalls.push(params);
        return createDeferred();
      },
      workforce: {
        getPayrollConfiguration: async () => null,
        listWorkSettings: async () => [],
        listEmploymentEngagements: async () => [],
        saveWorkSettings: async (body) => ({
      membership_id: body?.membership_id ?? 10,
      contracted_weekly_minutes: body?.contracted_weekly_minutes ?? 2130,
    }),
        updatePayrollConfiguration: async () => ({}),
      },
    },
    '@/components/RootPageHeader': { RootPageHeader: () => ({ type: 'RootPageHeader' }) },
    '@/roles/shared/forms/useUnsavedChangesGuard': { useUnsavedChangesGuard: () => ({ markClean: () => {}, confirmDiscard: () => {} }) },
  };

  const exports = {};
  const context = {
    exports, module: { exports },
    require: (id) => mocks[id] || require(id),
    console, Date, Promise, Object, Array, String, Number, Boolean,
  };

  vm.runInNewContext(outputText, context);
  const ScopedWorkforceSettings = exports._ScopedWorkforceSettings;

  // Part 1: Mount with active user, then trigger cleanup BEFORE pharmacy fetch resolves
  cursor = 0;
  ScopedWorkforceSettings({ user: { id: 42, role: 'OWNER' } });
  assert.equal(fetchCalls.length, 0, 'Fetch not started until effects flush');

  // Trigger effect: fetchPharmaciesService is invoked and returns deferredPromise
  await flush();
  assert.equal(fetchCalls.length, 1, 'fetchPharmaciesService called on mount with user');

  // Initial state slots:
  // state[2] = pharmacyId (null)
  // state[3] = pharmacies ([])
  // state[11] = error ('')
  assert.equal(state[2], null, 'pharmacyId initially null');
  assert.deepEqual(Array.from(state[3]), [], 'pharmacies initially empty');
  assert.equal(state[11], '', 'error initially empty');

  // Simulate unmount / user change cleanup: run all registered effect cleanups
  for (const cl of cleanups) {
    if (typeof cl === 'function') cl();
  }

  // Now resolve the in-flight pharmacy fetch with stale data from user 42
  deferredResolve([{ id: 999, name: 'Stale Pharmacy 999' }]);
  for (let i = 0; i < 10; i++) await Promise.resolve();

  // Assert active=false dropped the result; stale pharmacy data NEVER leaked into state
  assert.deepEqual(Array.from(state[3]), [], 'Stale pharmacies array was NOT set after cleanup');
  assert.equal(state[2], null, 'Stale pharmacyId was NOT selected after cleanup');
  assert.equal(state[11], '', 'Error was NOT set');

  // Part 2: Mount as guest (user = null)
  // Clean state slots
  state.length = 0;
  cleanups.length = 0;
  effects.length = 0;
  fetchCalls = [];
  cursor = 0;

  ScopedWorkforceSettings({ user: null });
  await flush();

  assert.equal(fetchCalls.length, 0, 'Guest (user = null) does NOT call fetchPharmaciesService');
  assert.deepEqual(Array.from(state[3]), [], 'Guest pharmacies starts as empty list');
  assert.equal(state[2], null, 'Guest pharmacyId is null');
  assert.equal(state[9], false, 'Guest loading is set to false');
  assert.equal(state[11], '', 'Guest error is empty');
});
