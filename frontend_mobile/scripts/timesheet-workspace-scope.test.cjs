const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let ts;
try {
  ts = require('typescript');
} catch {
  ts = require(path.resolve(__dirname, '../node_modules/typescript'));
}

const text = fs.readFileSync(path.resolve(__dirname, '../app/workforce-timesheets.tsx'), 'utf8');

test('timesheet list invalidates in-flight data when changing pharmacy and period', () => {
  assert.match(text, /periodsRequestRef\.current \+= 1/);
  assert.match(text, /detailRequestRef\.current \+= 1/);
  assert.match(text, /request === periodsRequestRef\.current/);
  assert.match(text, /request === detailRequestRef\.current/);
  assert.match(text, /setSummary\(null\); setRows\(\[\]\)/);
  assert.match(text, /useFocusEffect/);
  assert.match(text, /accessibilityState=\{\{ checked: pharmacyId === pharmacy\.id, disabled: isInteractingDisabled \}\} disabled=\{isInteractingDisabled\}/);
  assert.match(text, /isInteractingDisabled = isBusy \|\| refreshing \|\| loading \|\| periodsLoading/);
});

test('manager timesheet lists do not show or mutate a previous account workspace', () => {
  assert.match(text, /const accountKey = user \? String\(user\.id \?\? user\.email/);
  assert.match(text, /if \(!pharmacyId \|\| loadedAccount !== scope\)/);
  assert.match(text, /if \(!periodId \|\| loadedAccount !== scope\)/);
  assert.match(text, /if \((?:writeRef\.current \|\| )?!accountKey \|\| loadedAccount !== accountKey\) return/);
  assert.match(text, /actionId === writeGeneration\.current && accountRef\.current === scope/);
});

test('worker My Hours rejects stale account reads and submissions', () => {
  const worker = fs.readFileSync(path.resolve(__dirname, '../app/my-hours.tsx'), 'utf8');
  assert.match(worker, /snapshot\.account === accountKey \? snapshot\.rows : \[\]/);
  assert.match(worker, /request === requestRef\.current && accountRef\.current === accountKey/);
  assert.match(worker, /submitGeneration\.current === action && accountRef\.current === scope/);
});

test('manager timesheet completion never writes into a different selected pharmacy', () => {
  assert.match(text, /pharmacyRef\.current === pharmacy/);
  assert.match(text, /pharmacyRef\.current === requestedPharmacy/);
  assert.match(text, /accountRef\.current === requestedAccount && pharmacyRef\.current === requestedPharmacy/);
});

test('production timesheets screen: busy pharmacy changes are blocked and later writes stay available', async () => {
  let deferredAction = null;
  const workforceMock = {
    listTimesheetPeriods: async () => [{ id: 1, start_date: '2026-11-02', end_date: '2026-11-15', status: 'OPEN' }],
    getTimesheetPeriodSummary: async () => ({ total_timesheets: 1 }),
    listTimesheets: async () => [],
    openTimesheetPeriod: async () => new Promise((res, rej) => { deferredAction = { resolve: res, reject: rej }; }),
  };

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
    useMemo(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      if (!prev || !deps || deps.some((value, index) => value !== prev.deps[index])) {
        state[idx] = { deps, value: fn() };
      }
      return state[idx].value;
    },
    useCallback(fn, deps) { return reactMock.useMemo(() => fn, deps); },
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
    useFocusEffect(cb) { cb(); },
  };

  const flush = () => {
    while (effects.length > 0) effects.shift()();
  };

  const { outputText } = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });

  const exports = {};
  const context = {
    exports, module: { exports },
    require(id) {
      if (id === '@/components/ui/BrandActivityIndicator') return { BrandActivityIndicator: 'ActivityIndicator' };
      if (id === '@/components/RootPageHeader') return { RootPageHeader: (props) => ({ type: 'RootPageHeader', props }) };
      if (id === 'react') return reactMock;
      if (id === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
      if (id === 'react-native') return { View: 'View', Text: 'Text', ScrollView: 'ScrollView', RefreshControl: 'RefreshControl', Alert: { alert: () => {} }, StyleSheet: { create: s => s } };
      if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (id === 'react-native-paper') return { Button: 'Button', Chip: 'Chip', List: { Item: 'ListItem', Icon: 'ListIcon' }, Card: { Content: 'CardContent' }, Text: 'Text', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator' };
      if (id === 'expo-router') return { useRouter: () => ({ back: () => {}, push: () => {} }), useFocusEffect: cb => cb() };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { id: 7, email: 'mgr@test.com' } }) };
      if (id === '@/context/WorkspaceContext') return { useWorkspace: () => ({ selectedPharmacyId: 101, isLoading: false }) };
      if (id === '@chemisttasker/shared-core') return {
        fetchPharmaciesService: async () => [{ id: 101, name: 'Pharma A' }, { id: 102, name: 'Pharma B' }],
        workforce: workforceMock,
        formatAttendanceMinutes: m => `${m}m`,
      };
      throw new Error(`Unmocked dependency ${id}`);
    },
    console, Date, Promise, Set, Array, Object, Number, String, Boolean, Error,
  };

  vm.runInNewContext(outputText, context);
  const Screen = exports.default;

  // Initial render
  cursor = 0;
  let tree = Screen();
  flush();

  // Allow fetchPharmacies to resolve
  await new Promise(setImmediate);
  cursor = 0;
  tree = Screen();
  flush();
  // Period discovery settles separately from the initial pharmacy list.
  await new Promise(setImmediate);
  cursor = 0;
  tree = Screen();
  flush();
  await new Promise(setImmediate);
  cursor = 0;
  tree = Screen();

  function findNodes(node, type) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(n => findNodes(n, type));
    return [...(node.type === type ? [node.props] : []), ...findNodes(node.props?.children, type)];
  }

  const buttons = findNodes(tree, 'Button');
  const openBtn = buttons.find(b => b.children === 'Open current fortnight');
  assert.ok(openBtn, 'Must render Open current fortnight button');

  const picker = buttons.find(b => b.children === 'Change pharmacy');
  assert.ok(picker && !picker.disabled); picker.onPress();
  cursor = 0; tree = Screen();
  const retainedB = findNodes(tree, 'ListItem').find(c => c.title().props.children === 'Pharma B');
  assert.ok(retainedB, 'Must render Pharma B option');
  // Trigger write at Pharmacy 101
  openBtn.onPress();
  assert.ok(deferredAction, 'Write action must be triggered');

  // Re-render: busy should be true
  cursor = 0;
  tree = Screen();
  const busyButtons = findNodes(tree, 'Button');
  const busyOpen = busyButtons.find(b => b.children === 'Open current fortnight');
  assert.equal(busyOpen.disabled, true, 'Buttons must be disabled while busy');

  // Find pharmacy chips
  const optionB = findNodes(tree, 'ListItem').find(c => c.title().props.children === 'Pharma B');
  assert.ok(optionB, 'Must render Pharma B option');
  assert.equal(optionB.disabled, true, 'Pharmacy options must be disabled while busy');

  // A retained callback from before the write must refuse a pharmacy change.
  retainedB.onPress();

  // Resolve old deferred action in background
  deferredAction.resolve({ id: 999 });
  await new Promise(setImmediate);

  // Re-render: the completed write must release its busy state.
  cursor = 0;
  tree = Screen();
  const postButtons = findNodes(tree, 'Button');
  const postOpen = postButtons.find(b => b.children === 'Open current fortnight');
  assert.equal(postOpen.disabled, false, 'Screen must not remain locked after write completion');

  // Subsequent authorized action works
  let subsequentExecuted = false;
  workforceMock.openTimesheetPeriod = async () => { subsequentExecuted = true; return { id: 1000 }; };
  postOpen.onPress();
  await new Promise(setImmediate);
  assert.equal(subsequentExecuted, true, 'Subsequent authorized action must succeed');
});

test('timesheets screen mounts RootPageHeader across loading and loaded states with disabled tied to isBusy', () => {
  assert.match(text, /import \{ RootPageHeader \} from '@\/components\/RootPageHeader'/);
  assert.match(text, /<RootPageHeader title="Timesheets" disabled=\{isBusy\} \/>/);
  assert.match(text, /const isBusy = busy \|\| Boolean\(writeRef\.current\)/);
  assert.match(text, /edges=\{?\['bottom', 'left', 'right'\]\}?/);
});
