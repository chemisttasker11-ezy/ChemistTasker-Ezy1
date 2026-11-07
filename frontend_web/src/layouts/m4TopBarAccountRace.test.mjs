// Executes the complete production TopBarActions component and its real account/bell callbacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { createHookScheduler, deferred, jsx } = require('../../../frontend_mobile/scripts/m4-notification-harness.cjs');

function mountBell() {
  const engine = createHookScheduler();
  engine.react.Fragment = 'Fragment';
  const scope = { user: { id: 101, role: 'PHARMACIST' } };
  const queues = { list: [], read: [] };
  const calls = [];
  const list = () => {
    calls.push(['GET', scope.user?.id]);
    const next = queues.list.shift();
    if (!next) throw Error('Missing bell list fixture');
    return next.promise || (next instanceof Error ? Promise.reject(next) : Promise.resolve(next));
  };
  const read = ids => {
    calls.push(['POST', scope.user?.id, Array.from(ids)]);
    const next = queues.read.shift();
    if (!next) throw Error('Missing bell receipt fixture');
    return next.promise || (next instanceof Error ? Promise.reject(next) : Promise.resolve(next));
  };
  const mui = new Proxy({}, { get: (_, key) => key === '__esModule' ? true : key === 'default' ? 'Mui' : String(key) });
  const component = value => ({ __esModule: true, default: value });
  const modulePath = new URL('./TopBarActions.tsx', import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(modulePath, 'utf8'), {
    fileName: 'TopBarActions.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const exports = {};
  const window = {
    location: { origin: 'https://test.example', protocol: 'https:', host: 'test.example' },
    addEventListener() {}, removeEventListener() {}, setInterval: () => 1,
    clearInterval() {}, dispatchEvent() {},
  };
  const modules = {
    react: { __esModule: true, ...engine.react },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@mui/material/Autocomplete': { __esModule: true, default: 'Autocomplete',
      createFilterOptions: () => () => [] },
    '@mui/material/styles': { alpha: () => '#eee', useTheme: () => ({
      breakpoints: { down: () => '' }, palette: { primary: { main: '#000' } },
    }) },
    '@mui/material/useMediaQuery': component(() => true),
    'react-router-dom': { useNavigate: () => () => {}, useLocation: () => ({ pathname: '/dashboard/pharmacist/overview' }) },
    '../theme/sleekTheme': { useColorMode: () => ({ mode: 'light', toggleColorMode() {} }) },
    '../contexts/AuthContext': { useAuth: () => ({
      user: scope.user, logout: async () => true, refreshUnreadCount() {},
      adminAssignments: [], activePersona: 'staff', activeAdminAssignment: null,
      selectRolePersona() {}, selectAdminPersona() {}, setActivePersona() {}, isAdminUser: false,
    }) },
    '../contexts/WorkspaceContext': { useWorkspace: () => ({ selectedPharmacyId: null }) },
    '../contexts/DashboardNavigationContext': { useDashboardNavigation: () => [] },
    './dashboardRouteScope': { addDashboardScopeParams: s => s, normalizeDashboardSegment: s => s },
    '../api/notifications': { fetchNotifications: list, markNotificationsRead: read },
    '@chemisttasker/shared-core': {
      fetchRooms: async () => [], getOnboarding: async () => null, hasOrganizationAccess: () => false,
    },
    '../constants/api': { API_BASE_URL: 'https://test.example' },
    '../utils/tokenService': { fetchWsTicket: async () => null },
    '../utils/displayName': { dashboardGreetingName: () => 'Current user' },
    '../utils/roleLabels': { otherStaffRoleLabel: () => 'Staff', userRoleLabel: () => 'Pharmacist' },
    dayjs: component(Object.assign(() => ({ local() { return this; }, toDate: () => new Date() }), {
      extend() {}, utc: () => ({ local: () => ({ toDate: () => new Date() }) }),
    })),
    'dayjs/plugin/utc': component(() => {}),
    './TopBarActions.model': {
      ADMIN_LEVEL_LABELS: {}, ADMIN_STAFF_ROLE_LABELS: {}, PROFILE_ROUTES: {},
      onboardingRoleForUserRole: () => null, profilePhotoFromSource: () => '',
      isMessageNotification: n => n.type === 'message',
      normalizeNotification: x => x,
    },
  };
  vm.runInNewContext(outputText, {
    exports, module: { exports }, console, window, WebSocket: class {},
    CustomEvent: class {}, URL, URLSearchParams, Date,
    require(id) {
      if (id in modules) return modules[id];
      if (id.startsWith('@mui/material/') || id.startsWith('@mui/icons-material/') ||
          id === '@mui/material/Box' || id === '@mui/material/Stack') return component(id.split('/').at(-1));
      if (id === 'lucide-react') return mui;
      throw Error('Unknown bell dependency: ' + id);
    },
  }, { filename: 'TopBarActions.tsx' });
  async function render() { return engine.settle(exports.default); }
  const unread = nodes => {
    const notification = nodes.find(n => n.type === 'IconButton' && n.props?.['aria-label'] === 'notifications');
    assert.ok(notification, 'real notification control must render');
    const badge = nodes.find(n => n.type === 'Badge' && n.props.badgeContent != null);
    return { value: badge?.props.badgeContent, click: notification.props.onClick };
  };
  return { scope, queues, calls, engine, render, unread, deferred };
}
const note = (id, unread = true) => ({ id, title: 'Notice ' + id, body: 'Body',
  type: 'task', createdAt: '2026-11-07T02:00:00Z', readAt: unread ? null : '2026-11-07T02:03:00Z' });

test('R old web bell list cannot fill next account; current account response still updates', async () => {
  const h = mountBell(), old = h.deferred(), current = h.deferred();
  h.queues.list.push(old, current);
  await h.render();
  h.scope.user = { id: 202, role: 'EXPLORER' };
  let nodes = await h.render();
  assert.equal(h.unread(nodes).value, 0, 'old account unread is hidden immediately');
  old.resolve({ results: [note(1), note(2)] });
  await h.engine.flush();
  nodes = await h.render();
  assert.equal(h.unread(nodes).value, 0, 'late previous-user list is discarded');
  current.resolve({ results: [note(300)] });
  await h.engine.flush();
  nodes = await h.render();
  assert.equal(h.unread(nodes).value, 1, 'new identity can still update its bell');
  h.engine.unmount();
});

test('R old web mark-all response cannot clear a new account badge; current receipt can', async () => {
  const h = mountBell(), oldRead = h.deferred(), freshRead = h.deferred();
  h.queues.list.push({ results: [note(11), note(12)] });
  let nodes = await h.render();
  assert.equal(h.unread(nodes).value, 2);
  h.queues.read.push(oldRead);
  h.unread(nodes).click({ currentTarget: {} });
  await h.engine.flush();
  h.queues.list.push({ results: [note(99)] });
  h.scope.user = { id: 202, role: 'EXPLORER' };
  nodes = await h.render();
  assert.equal(h.unread(nodes).value, 1);
  oldRead.resolve({ unread: 0, marked: 2 });
  await h.engine.flush();
  nodes = await h.render();
  assert.equal(h.unread(nodes).value, 1, 'previous account receipt must not clear new badge');
  h.queues.read.push(freshRead);
  h.unread(nodes).click({ currentTarget: {} });
  await h.engine.flush();
  freshRead.resolve({ unread: 0, marked: 1 });
  await h.engine.flush();
  nodes = await h.render();
  assert.equal(h.unread(nodes).value, 0, 'current receipt marks current bell');
  h.engine.unmount();
});
