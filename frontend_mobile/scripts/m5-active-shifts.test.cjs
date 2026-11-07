// M4-05: executable Shift Centre route/panel tests (no source-text assertions).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props: props || {} });
function load(relative, imports) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: relative,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, URL, URLSearchParams, console,
    require(name) {
      if (!Object.prototype.hasOwnProperty.call(imports, name)) {
        throw new Error('Unmocked import ' + name + ' in ' + relative);
      }
      const m = imports[name]; return m && typeof m === 'object' && 'default' in m && !m.__esModule ? { __esModule: true, ...m } : m;
    },
  }, { filename: relative });
  return module.exports;
}
function collect(node, predicate, output = []) {
  if (Array.isArray(node)) {
    node.forEach(child => collect(child, predicate, output));
  } else if (node && typeof node === 'object') {
    if (predicate(node)) output.push(node);
    if (typeof node.type === 'function') collect(node.type(node.props), predicate, output);
    collect(node.props && node.props.children, predicate, output);
  }
  return output;
}

function mount() {
  const state = { role: 'EXPLORER', id: 501, pathname: '/explorer/shifts',
    section: 'confirmed', tab: null, workspace: 'platform' };
  const mounted = [];
  const navigated = [];
  const slots = [];
  let hook = 0;
  const react = {
    useMemo(fn, deps) {
      const i = hook++;
      const prior = slots[i];
      if (prior && deps && deps.length === prior.deps.length &&
          deps.every((value, index) => value === prior.deps[index])) return prior.value;
      const value = fn();
      slots[i] = { deps: deps ? [...deps] : [], value };
      return value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  };
  react.default = react;
  const router = {
    setParams(update) {
      if (Object.prototype.hasOwnProperty.call(update, 'section')) state.section = update.section;
      if (Object.prototype.hasOwnProperty.call(update, 'tab')) state.tab = update.tab;
    },
    push(url) { navigated.push(url); },
  };
  const expo = { useLocalSearchParams: () => ({ section: state.section, tab: state.tab }),
    useRouter: () => router, usePathname: () => state.pathname };
  const core = load('roles/shared/shifts/shiftSurface.ts', {});
  const logic = load('roles/shared/shifts/shiftsScreenLogic.ts', { './shiftSurface': core });
  const surfaceHook = load('roles/shared/shifts/useShiftSurface.ts', {
    react, 'expo-router': expo,
    '@/context/AuthContext': { useAuth: () => ({ user: { role: state.role, id: state.id },
      hasCapability: () => false }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({
      workspace: state.workspace, canUsePlatform: true,
      selectedPharmacyId: 12, isLoading: false }) },
    '@/context/AdminWorkspaceContext': { useOptionalAdminWorkspace: () => null },
    '@/roles/shared/dashboard/ManagerHome': { orgCapabilities: () => ({ roster: false }) },
    './shiftSurface': core,
  });
  const tokens = { colors: { pageBg: '', textMuted: '', textSecondary: '', textPrimary: '', border: '', surfaceBg: '' },
    font: { inter: { regular: '', semiBold: '' } }, radius: { nested: 1 },
    space: { sm: 1, md: 2, lg: 3 }, type: { bodySmall: { fontSize: 14, lineHeight: 20 },
      labelLarge: { fontSize: 15, lineHeight: 20 } } };
  const ui = { ContentState: 'ContentState', IconTile: 'IconTile',
    ScalePressable: 'ScalePressable', SegmentTabs: 'SegmentTabs',
    tabPanelProps: () => ({}) };
  const tabs = load('roles/shared/shifts/ShiftSectionTabs.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-router': expo,
    'lucide-react-native': Object.fromEntries(['CalendarCheck', 'CircleCheck', 'Globe', 'History', 'Play', 'Users']
      .map(key => [key, key])),
    '@/components/ui': ui, './shiftSurface': core,
  });
  const panel = name => function Panel() { mounted.push(name); return jsx('Panel', { name }); };
  const imports = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-router': expo,
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: styles => styles } },
    'lucide-react-native': { CalendarCheck: 'CalendarCheck', ChevronRight: 'ChevronRight' },
    '@/components/ui': ui, '@/constants/tokens': tokens,
    './ActiveShiftsPage': { default: panel('manager-active') },
    './CommunityShiftsView': { default: panel('community') },
    './ConfirmedShiftsView': { default: panel('manager-confirmed') },
    './HistoryShiftsView': { default: panel('manager-history') },
    './PublicShiftsView': { default: panel('public') },
    './WorkerConfirmedShiftsView': { default: panel('personal-confirmed-api') },
    './WorkerHistoryShiftsView': { default: panel('personal-history-api') },
    './ShiftSectionTabs': tabs, './shiftSurface': core,
    './shiftsScreenLogic': logic, './useShiftSurface': surfaceHook,
  };
  const screen = load('roles/shared/shifts/ShiftsScreen.tsx', imports);
  const notification = load('utils/notificationNavigation.ts', {
    '@/roles/shared/shifts/shiftSurface': core,
  });
  function render() {
    mounted.length = 0;
    hook = 0;
    const tree = screen.default();
    const nodes = collect(tree, element => element.type === 'SegmentTabs');
    return { tree, tabs: nodes[0] && Array.from(nodes[0].props.tabs, tab => tab.value),
      nodes, mounted: mounted.slice() };
  }
  return { state, mounted, navigated, render, core, notification };
}

function texts(tree) {
  return collect(tree, node => node.type === 'Text').map(node => {
    const child = node.props.children;
    return typeof child === 'string' ? child : '';
  }).filter(Boolean);
}
test('R shell_title: owner poster gets web Shift Centre title and subtitle above tabs', () => {
  const app = mount();
  app.state.role = 'OWNER';
  app.state.pathname = '/owner/shifts';
  app.state.section = 'active';
  const shown = texts(app.render().tree);
  assert.ok(shown.includes('Shift Centre'), 'poster header');
  assert.ok(shown.includes('Fill open shifts, check who is booked and look back at past shifts across your pharmacies.'), 'web owner subtitle');
});
test('R shell_title: organization poster gets its distinct Shift Centre subtitle', () => {
  const app = mount();
  app.state.role = 'ORGANIZATION';
  app.state.pathname = '/organization/shifts';
  app.state.section = 'active';
  const shown = texts(app.render().tree);
  assert.ok(shown.includes('Shift Centre'));
  assert.ok(shown.includes("Fill open shifts and check coverage across your organisation's pharmacies."));
});
test('C worker screen retains its existing sections without manager header', () => {
  const app = mount();
  app.state.role = 'PHARMACIST';
  app.state.pathname = '/pharmacist/shifts';
  app.state.section = 'confirmed';
  const shown = texts(app.render().tree);
  assert.equal(shown.includes('Shift Centre'), false);
  assert.deepEqual(app.render().mounted, ['personal-confirmed-api']);
});
