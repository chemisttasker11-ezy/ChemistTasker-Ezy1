// M4-05: mount the actual Vite tabs and both Vite hosts; execute the actual main route declaration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props: props ?? {} });
const modulePath = (file) => new URL(file, import.meta.url);
function execute(file, mocks) {
  const source = readFileSync(modulePath(file), 'utf8');
  const compiled = ts.transpileModule(source, { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, URL, URLSearchParams, setTimeout: () => 1, clearTimeout() {},
    console, window: { location: { pathname: '/dashboard/explorer/shifts/public' } },
    document: { getElementById: () => ({}) },
    require(id) {
      if (!(id in mocks)) throw new Error('Unexpected import from ' + file + ': ' + id);
      return mocks[id];
    },
  }, { filename: file });
  return module.exports;
}
const nodes = (node, predicate, result = []) => {
  if (Array.isArray(node)) node.forEach(child => nodes(child, predicate, result));
  else if (node && typeof node === 'object') {
    if (predicate(node)) result.push(node);
    nodes(node.props?.children, predicate, result);
  }
  return result;
};

function createHost(apiOverrides = {}) {
  const session = { role: 'EXPLORER', pathname: '/dashboard/explorer/shifts/public',
    search: '?ref=notice' };
  const nav = [];
  let stateIndex = 0;
  const state = [];
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], update => {
        state[index] = typeof update === 'function' ? update(state[index]) : update;
      }];
    },
    useMemo(fn) { stateIndex++; return fn(); },
    useCallback(fn) { stateIndex++; return fn; },
    useEffect() { stateIndex++; },
  };
  react.default = react;
  const router = {
    useNavigate: () => (target, opts) => nav.push([target, opts]),
    useLocation: () => ({ pathname: session.pathname, search: session.search }),
  };
  const auth = { useAuth: () => ({ user: { id: 57, role: session.role } }) };
  const mui = Object.fromEntries([
    'Typography', 'Snackbar', 'Alert', 'Box', 'Button', 'Chip', 'Paper', 'Stack',
  ].map(name => [name, name]));
  mui.alpha = () => '';
  mui.useTheme = () => ({ palette: { divider: '' } });
  const core = {
    fetchPublicShifts: async () => ({ results: [], count: 0 }),
    fetchCommunityShifts: async () => ({ results: [], count: 0 }),
    fetchSavedShifts: async () => [], fetchShiftInterests: async () => [],
    fetchShiftRejections: async () => [], fetchShiftOffersService: async () => [],
    getOnboardingDetail: async () => ({ verified: true }),
    ...apiOverrides,
  };
  const tabs = execute('./StaffShiftCentreTabs.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router-dom': router,
    '../../../components/ui/SegmentTabs': { __esModule: true, default: 'SegmentTabs' },
    '../../../contexts/AuthContext': auth,
  });
  const base = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@mui/material': mui, 'react-router-dom': router,
    '../../../contexts/AuthContext': auth,
    '@chemisttasker/shared-core': core,
    '../../../contexts/WorkspaceContext': { useWorkspace: () => ({
      workspace: 'platform', selectedPharmacyId: null }) },
    './ShiftsBoard': { __esModule: true, default: 'ShiftsBoard' },
    './ShiftsBoard/utils/submitCounterOffer': { submitCounterOfferDirect: async () => {} },
    './ShiftsBoard/components/ShiftEngagementTermsDialog': { __esModule: true, default: 'ShiftEngagementTermsDialog' },
    '../../../components/ui/PageHeader': { __esModule: true, default: 'PageHeader' },
    '../../../components/ui/SegmentTabs': { __esModule: true, default: 'SegmentTabs' },
    '../shiftCenter/StaffShiftCentreTabs': tabs,
  };
  const publicBoard = execute('../sidebar/PublicShiftsPage.tsx', base);
  const communityBoard = execute('../sidebar/CommunityShiftsPage.tsx', base);
  function render(board, reset = false) {
    stateIndex = 0;
    if (reset) state.length = 0;
    return board.default();
  }
  function mount(board) {
    const tree = render(board, true);
    const tabNodes = nodes(tree, n => n.type === tabs.StaffShiftCentreTabs);
    assert.equal(tabNodes.length, 1, 'must mount the real shared tabs from this Vite board');
    const actual = tabs.StaffShiftCentreTabs(tabNodes[0].props);
    assert.equal(actual.type, 'SegmentTabs');
    return actual.props;
  }
  return { session, nav, mount, render, publicBoard, communityBoard };
}

test('R: both Vite Explorer board mounts hide worker Confirmed/History routes', () => {
  const ui = createHost();
  for (const [board, suffix] of [
    [ui.publicBoard, 'public'], [ui.communityBoard, 'community'],
  ]) {
    ui.session.pathname = '/dashboard/explorer/shifts/' + suffix;
    const segment = ui.mount(board);
    assert.deepEqual(Array.from(segment.tabs.map(t => t.value)), ['public', 'community']);
    segment.onChange(suffix === 'public' ? 'community' : 'public');
    assert.equal(ui.nav.at(-1)[0],
      '/dashboard/explorer/shifts/' + (suffix === 'public' ? 'community' : 'public') + '?ref=notice');
  }
});

test('C: both worker roles retain four personal and public/community Vite tabs', () => {
  for (const role of ['PHARMACIST', 'OTHER_STAFF']) {
    const ui = createHost();
    ui.session.role = role;
    ui.session.pathname = '/dashboard/' + (role === 'PHARMACIST' ? 'pharmacist' : 'otherstaff') + '/shifts/public';
    for (const board of [ui.publicBoard, ui.communityBoard]) {
      const section = ui.mount(board);
      assert.deepEqual(Array.from(section.tabs.map(tab => tab.value)),
        ['public', 'community', 'confirmed', 'history']);
    }
  }
});

test('R: Vite direct Explorer Confirmed/History routes redirect without mounting personal pages', () => {
  let registered;
  const react = { lazy: () => 'LazyPage', Suspense: 'Suspense', StrictMode: 'StrictMode' };
  react.default = react;
  const router = {
    Outlet: 'Outlet', Navigate: 'Navigate', RouterProvider: 'RouterProvider',
    useLocation: () => ({ search: '?ref=notice' }),
    createBrowserRouter: routes => { registered = routes; return { routes }; },
  };
  // Only known application imports and stylesheet imports are stubbed.
  // Unrecognized external dependencies fail module loading.
  const core = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-dom/client': { createRoot: () => ({ render() {} }) },
    'react-router-dom': router,
    '@mui/x-date-pickers/LocalizationProvider': { LocalizationProvider: 'LocalizationProvider' },
    '@mui/x-date-pickers/AdapterDayjs': { AdapterDayjs: 'AdapterDayjs' },
    './config/api': { initSharedCoreApi() {} },
    './contexts/AuthContext': { AuthProvider: 'AuthProvider' },
    './contexts/WorkspaceContext': { WorkspaceProvider: 'WorkspaceProvider' },
    './contexts/ToastContext': { ToastProvider: 'ToastProvider' },
  };
  const mainSource = readFileSync(new URL('../../../main.tsx', import.meta.url), 'utf8');
  // Discover the exact static import identifiers, but never assert source tokens:
  // the assertion below runs the production route factory and inspects its elements.
  const parsed = ts.preProcessFile(mainSource, true, true);
  for (const { fileName } of parsed.importedFiles) {
    if (fileName in core) continue;
    if (fileName.startsWith('@fontsource/') || fileName.endsWith('.css')) {
      core[fileName] = {};
    } else if (/^\.\/(pages|layouts|components|features)\//.test(fileName) ||
               fileName === './App') {
      core[fileName] = { __esModule: true, default: 'MockPage' };
    } else {
      throw new Error('Unexpected main.tsx import: ' + fileName);
    }
  }
  execute('../../../main.tsx', core);
  assert.ok(registered, 'the real createBrowserRouter must be called');
  const root = registered[0];
  const dashboard = root.children.find(node => node.path === 'dashboard/explorer');
  assert.ok(dashboard);
  const shifts = dashboard.children.find(node => node.path === 'shifts');
  for (const section of ['confirmed', 'history']) {
    const target = shifts.children.find(node => node.path === section);
    assert.ok(target, 'direct URL retains explicit safe route for ' + section);
    const redirected = typeof target.element.type === 'function'
      ? target.element.type(target.element.props) : target.element;
    assert.equal(redirected.type, 'Navigate', 'must redirect before personal component mounts');
    assert.equal(redirected.props.replace, true, 'avoid forbidden back-loop');
    assert.equal(redirected.props.to, '/dashboard/explorer/shifts/public?ref=notice');
  }
  for (const section of ['public', 'community']) {
    assert.ok(shifts.children.find(node => node.path === section));
  }
});

test('C: auth hydrates before rendering Explorer deep-link handoff', () => {
  let pending = true, user = null;
  const react = { useEffect() {} };
  react.default = react;
  const guard = execute('../../../components/ProtectedRoute.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../contexts/AhpraContext': { useAhpra: () => ({ loading: false, summary: null, refusal: null }) },
    './AhpraStatus': { __esModule: true, default: 'AhpraStatus' },
    '../../landing_next/shared/browser-session': { loginHref: next => next },
    'react-router-dom': { Navigate: 'Navigate', Link: 'Link', useLocation: () => ({
      pathname: '/dashboard/explorer/shifts/history', search: '?ref=activity', hash: '',
    }) },
    '@mui/material': { Box: 'Box', Button: 'Button', CircularProgress: 'CircularProgress',
      Container: 'Container', Paper: 'Paper', Typography: 'Typography' },
    '../contexts/AuthContext': { useAuth: () => ({
      user, isLoading: pending, isAdminUser: false, hasCapability: () => false,
    }) },
    '@chemisttasker/shared-core': { hasOrganizationAccess: () => false },
    '../utils/dashboardPath': { resolveDashboardPath: () => '/dashboard/explorer' },
    './routeAccess': { canAccessRoute: ({ userRole, requiredRole }) => userRole === requiredRole },
  });
  const loading = guard.default({ requiredRole: 'EXPLORER', children: jsx('AllowedBoard') });
  assert.equal(loading.type, 'div');
  assert.match(String(loading.props.children), /Loading authentication/);
  pending = false;
  user = { id: 57, role: 'EXPLORER', is_mobile_verified: true };
  assert.equal(guard.default({ requiredRole: 'EXPLORER',
    children: jsx('AllowedBoard') }).type, 'AllowedBoard');
});

test('C: Explorer public board failure retains a working refresh; no personal API calls', async () => {
  let calls = 0, personal = 0;
  const ui = createHost({
    fetchPublicShifts: async () => {
      calls++;
      if (calls === 1) throw new Error('public list unavailable');
      return { results: [{ id: 904, slots: [] }], count: 1 };
    },
    fetchPersonalConfirmedShifts: async () => { personal++; throw Error('forbidden'); },
    fetchPersonalHistoryShifts: async () => { personal++; throw Error('forbidden'); },
  });
  const render = () => {
    const tree = ui.render(ui.publicBoard);
    const components = nodes(tree, n => n.type === 'ShiftsBoard');
    assert.equal(components.length, 1, 'real board must expose refresh callback');
    return { tree, props: components[0].props };
  };
  await render().props.onRefresh();
  const failed = render();
  const snack = nodes(failed.tree, n => n.type === 'Snackbar');
  assert.equal(snack.length, 1);
  assert.equal(snack[0].props.open, true, 'failure must remain visible');
  await failed.props.onRefresh();
  const recovered = render();
  assert.equal(calls, 2);
  assert.equal(recovered.props.shifts.length, 1);
  assert.equal(recovered.props.shifts[0].id, 904);
  assert.equal(personal, 0);
});
