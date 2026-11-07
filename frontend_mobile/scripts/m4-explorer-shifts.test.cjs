// M4-05: executable Shift Centre route/panel tests (no source-text assertions).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

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
      return imports[name];
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
    useCallback(fn, deps) { return this.useMemo(() => fn, deps); },
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

test('R: Explorer native screen has only public/community tabs even through stale confirmed/history URLs', () => {
  const app = mount();
  for (const section of [null, 'history', 'confirmed', 'active', 'roster']) {
    app.state.section = section;
    const result = app.render();
    assert.deepEqual(result.tabs, ['public', 'community']);
    assert.deepEqual(result.mounted, ['public']);
    assert.equal(result.mounted.some(name => name.startsWith('personal-')), false);
  }
  app.state.section = 'community';
  assert.deepEqual(app.render().mounted, ['community']);
});

test('R: changing role from worker to Explorer unmounts personal history before rerender', () => {
  const app = mount();
  app.state.role = 'PHARMACIST';
  app.state.pathname = '/pharmacist/shifts';
  app.state.workspace = 'internal';
  app.state.section = 'history';
  assert.deepEqual(app.render().mounted, ['personal-history-api']);
  app.state.role = 'EXPLORER';
  app.state.id = 502;
  app.state.pathname = '/explorer/shifts';
  const result = app.render();
  assert.deepEqual(result.tabs, ['public', 'community']);
  assert.deepEqual(result.mounted, ['public']);
});

test('R: old web History/Confirmed notification links do not send Explorer to personal sections', () => {
  const app = mount();
  for (const section of ['confirmed', 'history']) {
    const route = app.notification.resolveShiftNotificationRoute({
      actionUrl: 'https://app.example.test/dashboard/explorer/shifts/' + section + '?ref=activity',
      persona: 'explorer', userRole: 'EXPLORER',
    });
    assert.equal(route, '/explorer/shifts?ref=activity&section=public');
  }
});

test('C: pharmacists, other staff and managers keep their existing distinct shift panels', () => {
  for (const role of ['PHARMACIST', 'OTHER_STAFF']) {
    const app = mount();
    app.state.role = role;
    app.state.pathname = role === 'PHARMACIST' ? '/pharmacist/shifts' : '/otherstaff/shifts';
    app.state.section = 'confirmed';
    assert.deepEqual(app.render().mounted, ['personal-confirmed-api']);
    app.state.section = 'history';
    assert.deepEqual(app.render().mounted, ['personal-history-api']);
  }
  const app = mount();
  app.state.role = 'OWNER';
  app.state.pathname = '/owner/shifts';
  app.state.section = 'history';
  assert.deepEqual(app.render().mounted, ['manager-history']);
});

test('C: Explorer public Offers handoff and safe board navigation preserve non-sensitive query', () => {
  const app = mount();
  app.state.section = 'history';
  app.state.tab = 'accepted';
  assert.deepEqual(app.render().mounted, ['public']);
  assert.equal(app.notification.resolveShiftNotificationRoute({
    actionUrl: '/dashboard/explorer/shifts/public?tab=accepted&ref=notice',
    persona: 'explorer', userRole: 'EXPLORER',
  }).includes('ref=notice'), true);
  const view = app.render();
  assert.ok(view.nodes[0]);
  view.nodes[0].props.onChange('community');
  assert.equal(app.state.section, 'community');
  assert.equal(app.state.tab, undefined);
  assert.deepEqual(app.render().mounted, ['community']);
});
