// M4-05 senior: execute the entire native next-shifts module and its mount/effect path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');

const jsx = (type, props) => ({ type, props: props || {} });
const file = path.resolve(__dirname, '../app/next-shifts.tsx');
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const shiftSource = fs.readFileSync(path.resolve(__dirname, '../roles/shared/shifts/shiftSurface.ts'), 'utf8');
const shiftJs = ts.transpileModule(shiftSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const shiftExports = { exports: {} };
vm.runInNewContext(shiftJs, { exports: shiftExports.exports, module: shiftExports, URLSearchParams });

function mount(role, loading = false) {
  const effects = [], cells = [];
  let hook = 0, fetches = 0, snapshots = 0, redirects = 0;
  const react = {
    useState(initial) {
      const at = hook++;
      if (!(at in cells)) cells[at] = typeof initial === 'function' ? initial() : initial;
      return [cells[at], value => { cells[at] = typeof value === 'function' ? value(cells[at]) : value; }];
    },
    useRef(initial) { const at = hook++; return cells[at] ||= { current: initial }; },
    useCallback(fn) { hook++; return fn; },
    useEffect(fn) { hook++; effects.push(fn); },
  };
  react.default = react;
  const user = role ? { id: role === 'EXPLORER' ? 71 : 72, role } : null;
  const mock = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { Redirect: 'Redirect' },
    'react-native': { Linking: { openURL: async () => {} }, RefreshControl: 'RefreshControl',
      ScrollView: 'ScrollView', StyleSheet: { create: s => s }, View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-native-paper': { Button: 'Button', Card: Object.assign('Card', { Content: 'CardContent' }), Text: 'Text' },
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'ActivityIndicator' },
    '@/components/RootPageHeader': { RootPageHeader: 'RootPageHeader' },
    '@chemisttasker/shared-core': { fetchMyConfirmedShifts: async () => { fetches++; return []; } },
    '@/context/AuthContext': { useAuth: () => ({ user, isLoading: loading }) },
    '@/constants/tokens': { colors: { pageBg: '', surfaceBg: '', textPrimary: '', textSecondary: '',
      primary: '', border: '', status: { amber: { fg: '' } } }, radius: { card: 1 },
      space: { lg: 1, md: 1, sm: 1, '3xl': 1 } },
    '@/features/nextShift/nextShiftModel': { calendarEditorUrl: () => '', directionsUrl: () => '',
      offlineShiftKey: () => '', sanitizeConfirmedShifts: () => [], upcomingShifts: () => [] },
    '@/features/nextShift/offlineConfirmedShifts': { readConfirmedShiftSnapshot: async () => {
      snapshots++; return null; }, saveConfirmedShiftSnapshot: async () => {} },
    '@/roles/shared/shifts/shiftSurface': shiftExports.exports,
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, console, Date, URLSearchParams,
    require(name) {
      if (!(name in mock)) throw new Error('Unexpected next-shifts import: ' + name);
      const m = mock[name];
      return m && typeof m === 'object' && 'default' in m && !m.__esModule
        ? { __esModule: true, ...m } : m;
    },
  }, { filename: file });
  const entry = module.exports.default();
  let child = entry;
  if (typeof entry.type === 'function') {
    hook = 0;
    child = entry.type(entry.props);
  } else if (entry.type === 'Redirect') redirects++;
  const runEffects = () => effects.forEach(effect => effect());
  return { entry, child, runEffects, get fetches() { return fetches; },
    get snapshots() { return snapshots; }, get redirects() { return redirects; } };
}
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

test('R: Explorer deep link redirects synchronously, without mounting personal loader or touching snapshot/API', async () => {
  const app = mount('EXPLORER');
  // Effects must run before the *first* red assertion: on the base, the
  // rendered ScopedNextShifts still fetches while an ancestor redirects.
  app.runEffects();
  await settle();
  assert.equal(app.fetches, 0, 'Explorer must never start fetchMyConfirmedShifts on this deep link');
  assert.equal(app.snapshots, 0, 'Explorer must never read another worker\'s cached shifts');
  assert.equal(app.entry.type, 'Redirect');
  assert.equal(app.entry.props.href, '/explorer/shifts?section=public');
});

test('R: while identity hydrates /next-shifts cannot start a personal request', async () => {
  const app = mount(null, true);
  app.runEffects();
  await settle();
  assert.equal(app.fetches, 0);
  assert.equal(app.snapshots, 0);
});

test('C: both pharmacist and OTHER_STAFF mount the real loadNextShiftsSequence path', async () => {
  for (const role of ['PHARMACIST', 'OTHER_STAFF']) {
    const app = mount(role);
    assert.notEqual(app.entry.type, 'Redirect');
    app.runEffects();
    await settle();
    assert.equal(app.fetches, 1, role);
    assert.equal(app.snapshots, 1, role);
  }
});

test('R: signed-out route redirects synchronously without mounting a personal loader', async () => {
  const app = mount(null, false);
  assert.equal(app.entry.type, 'Redirect');
  app.runEffects();
  await settle();
  assert.equal(app.fetches, 0);
  assert.equal(app.snapshots, 0);
});
