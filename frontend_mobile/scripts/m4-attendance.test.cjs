process.env.TZ = 'UTC';
// M4-01: mount complete Expo source modules; assertions inspect rendered actions/real API calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({ type, props: { ...(props || {}), key } });

function load(relative, modules) {
  const file = path.join(root, relative);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, URL, URLSearchParams, console,
    setTimeout, clearTimeout,
    require(name) {
      if (!(name in modules)) throw Error('Unmocked import ' + name + ' from ' + relative);
      return modules[name];
    },
  }, { filename: relative });
  return module.exports;
}

function hooks() {
  const fibers = new Map(), effects = [];
  let active = null, cursor = 0;
  const take = () => cursor++;
  const depsChanged = (a, b) => !a || !b || a.length !== b.length ||
    a.some((v, i) => v !== b[i]);
  const react = {
    useState(initial) {
      const i = take(), slot = active.slots;
      if (!(i in slot)) slot[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slot[i].value, update => {
        slot[i].value = typeof update === 'function' ? update(slot[i].value) : update;
      }];
    },
    useRef(value) {
      const i = take(), slot = active.slots;
      if (!(i in slot)) slot[i] = { current: value };
      return slot[i];
    },
    useMemo(fn, deps) {
      const i = take(), slot = active.slots;
      if (!(i in slot) || depsChanged(slot[i].deps, deps)) slot[i] = { value: fn(), deps };
      return slot[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const i = take(), fiber = active, prior = fiber.effects.get(i);
      if (!prior || depsChanged(prior.deps, deps)) {
        effects.push(() => {
          if (prior?.cleanup) prior.cleanup();
          const cleanup = fn();
          fiber.effects.set(i, { deps, cleanup });
        });
      }
    },
  };
  react.default = react;
  function walk(node, location = 'root', output = []) {
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, location + '.' + i, output));
    } else if (node && typeof node === 'object') {
      if (typeof node.type === 'function') {
        const id = location + ':' + String(node.props.key ?? '') + ':' + node.type.name;
        if (!fibers.has(id)) fibers.set(id, { slots: [], effects: new Map() });
        const previous = active, previousCursor = cursor;
        active = fibers.get(id);
        cursor = 0;
        const child = node.type(node.props);
        active = previous; cursor = previousCursor;
        walk(child, id, output);
      } else {
        output.push(node);
        walk(node.props?.children, location + '.children', output);
      }
    }
    return output;
  }
  async function settle() {
    while (effects.length) effects.shift()();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
  function unmount() {
    for (const fiber of fibers.values()) for (const value of fiber.effects.values()) {
      value.cleanup?.();
    }
    fibers.clear(); effects.length = 0;
  }
  return { react, walk, settle, unmount };
}

function screenHarness() {
  const env = { screen: 'reviews', user: { id: 5, role: 'PHARMACIST', admin_assignments: [
    { pharmacy_id: 11, admin_level: 'ROSTER_MANAGER', capabilities: ['MANAGE_ROSTER'] },
  ] }, pharmacy: 11, adminPharmacy: 11, params: {}, pathname: '/attendance/reviews' };
  const io = { pending: [], timeline: [], correct: [], missing: [], comments: [], navigations: [] };
  const engine = hooks();
  // Inject the actual shared-core policy, not a test-owned permission algorithm.
  const capabilityPolicy = load('../shared-core/src/policy/accessPolicy.ts', {
    '../constants/capabilities': load('../shared-core/src/constants/capabilities.ts', {}),
    '../constants/roles': load('../shared-core/src/constants/roles.ts', {}),
  }).hasAdminCapability;
  const capability = (name, pharmacy) =>
    capabilityPolicy(env.user, name, { pharmacyId: pharmacy });
  const auth = { useAuth: () => ({ user: env.user, hasCapability: capability }) };
  const router = { push: url => io.navigations.push(url), replace: url => io.navigations.push(url) };
  const expo = { useRouter: () => router, useLocalSearchParams: () => env.params,
    usePathname: () => env.pathname };
  const timeUtils = fs.existsSync(path.join(root, '../shared-core/src/utils/correctionTimestamp.ts'))
    ? load('../shared-core/src/utils/correctionTimestamp.ts', {})
    : {};
  const api = {
    attendance: {
      getManagerPending: async id => { io.pending.push(id); return []; },
      getManagerTimeline: async id => {
        io.timeline.push(id);
        return { session_id: id, pharmacy_id: env.pharmacy,
          pharmacy_timezone: 'Australia/Perth', timeline: [
            { event_id: 22, effective_timestamp: '2026-07-10T00:00:00.000Z' },
          ] };
      },
      correct: async (...args) => { io.correct.push(args); return { status: 'CORRECTED' }; },
      approve: async () => ({}), reject: async () => ({}),
      getWorkerStatus: async () => ({ has_active_session: false }),
      getWorkerCoverTerms: async () => [], getPinPharmacies: async () => ({ pharmacies: [] }),
    },
    workforce: {
      getMyHours: async () => [{ id: 31, pharmacy: { id: env.pharmacy, name: 'A' },
        start_date: '2026-07-10', end_date: '2026-07-10', status: 'OPEN' }],
      addMissingPunch: async (...args) => { io.missing.push(args); },
      addTimesheetComment: async (...args) => { io.comments.push(args); },
    },
    canManageKioskDevices: () => false,
    correctionTimestamp: timeUtils.correctionTimestamp ?? (() => {
      throw Error('Shared correction helper is absent on the red base');
    }),
    attendanceWallTime: timeUtils.attendanceWallTime,
    isValidAttendanceLocal: timeUtils.isValidAttendanceLocal,
  };
  const widgets = Object.fromEntries(
    ['ActionButtons', 'DataRow', 'EmptyState', 'Field', 'InfoNote', 'MetricGrid',
      'ParityPage', 'PharmacyRequired', 'ScreenLink', 'Section'].map(name => [name, name]));
  widgets.palette = { danger: 'red', primary: 'blue' };
  const external = {
    react: engine.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Alert: { alert() {} }, Linking: {}, View: 'View',
      StyleSheet: { create: x => x } },
    'react-native-paper': { Button: 'Button', Chip: 'Chip', Icon: 'Icon', Text: 'Text' },
    'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [null, async () => ({})] },
    'expo-router': expo,
    '@chemisttasker/shared-core': api,
    '../../roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog': { default: 'TermsDialog' },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ selectedPharmacyId: env.pharmacy }) },
    '@/context/AuthContext': auth,
    '@/context/AdminWorkspaceContext': { useOptionalAdminWorkspace: () =>
      env.adminPharmacy == null ? null : { activePharmacyId: env.adminPharmacy, isLoading: false } },
    './ParityUI': widgets,
    './utils': { asArray: value => Array.isArray(value) ? value : [],
      dateLabel: value => String(value || ''), errorMessage: err => err?.message || 'Failed',
      replaceUnderscore: value => String(value || ''), toNumber: value => Number(value) },
  };
  const module = load('features/parity/attendance.tsx', external);
  const find = (nodes, type, label) => nodes.find(node =>
    node.type === type && (!label || node.props.label === label));
  async function render() {
    const nodes = engine.walk(jsx(module.AttendanceParityScreen, { screen: env.screen }));
    await engine.settle();
    return nodes;
  }
  return { env, io, api, engine, render, find };
}

test('R assignment at A cannot call attendance manager endpoints while B is selected', async () => {
  const h = screenHarness();
  h.env.pharmacy = 12;
  await h.render();
  const rows = await h.render();
  assert.deepEqual(h.io.pending, []);
  assert.ok(rows.some(n => n.type === 'InfoNote' || n.type === 'ContentState' ||
    (n.type === 'ParityPage' && /not authorised|not allowed/i.test(String(n.props.subtitle)))));
});

test('R Grace region coverage is scoped to A, and account changes cannot retain A reads', async () => {
  const h = screenHarness();
  h.env.user = { id: 18, role: 'REGION_ADMIN', memberships: [{
    organization_id: 4, role: 'REGION_ADMIN', admin_level: 'ROSTER_MANAGER',
    capabilities: ['MANAGE_ROSTER'], pharmacies: [{ id: 11 }],
    organization_pharmacies: [{ id: 11 }, { id: 12 }],
  }] };
  await h.render(); await h.render();
  assert.ok(h.io.pending.includes(11));
  h.engine.unmount(); h.env.pharmacy = 12; h.io.pending.length = 0;
  await h.render(); await h.render();
  assert.deepEqual(h.io.pending, []);
  h.engine.unmount(); h.env.user = { id: 77, role: 'OWNER', memberships: [{ pharmacy_id: 19, role: 'OWNER' }] };
  h.env.pharmacy = 11;
  await h.render(); await h.render();
  assert.deepEqual(h.io.pending, []);
});

test('R worker correction sends a readable own-timesheet comment, never an event write', async () => {
  const h = screenHarness();
  h.env.screen = 'correction';
  h.env.user = { id: 91, role: 'OTHER_STAFF', admin_assignments: [] };
  h.env.params = { timesheetId: '31', sessionId: '78' };
  let tree = await h.render(); tree = await h.render();
  h.find(tree, 'Field', 'Corrected date/time').props.onChangeText('2026-07-10T09:00');
  h.find(tree, 'Field', 'Reason').props.onChangeText('Kiosk lost the clock in');
  tree = await h.render();
  const submit = tree.find(node => node.type === 'Button' && /Request correction/.test(
    String(node.props.children)));
  assert.ok(submit);
  await submit.props.onPress(); await h.engine.settle();
  assert.equal(h.io.missing.length, 0);
  assert.equal(h.io.correct.length, 0);
  assert.equal(h.io.comments.length, 1);
  assert.equal(h.io.comments[0][0], 31);
  assert.match(h.io.comments[0][1], /CLOCK_IN|clock in/i);
  assert.match(h.io.comments[0][1], /2026-07-10/);
  assert.match(h.io.comments[0][1], /Kiosk lost the clock in/);
});

test('R manager correction refuses a freehand unknown event rather than using device timezone', async () => {
  const h = screenHarness();
  h.env.user = { id: 11, role: 'OWNER', memberships: [{ pharmacy_id: 11, role: 'OWNER' }] };
  h.env.screen = 'correction';
  h.env.params = { eventId: '22', sessionId: '78' };
  let tree = await h.render(); tree = await h.render();
  h.find(tree, 'Field', 'Corrected date/time').props.onChangeText('2026-07-10T09:00');
  h.find(tree, 'Field', 'Reason').props.onChangeText('Verify Perth wall time');
  tree = await h.render();
  const submit = tree.find(node => node.type === 'Button' && /Save correction/.test(
    String(node.props.children)));
  assert.ok(submit);
  await submit.props.onPress(); await h.engine.settle();
  assert.equal(h.io.correct.length, 1);
  assert.deepEqual(h.io.correct[0], [22, '2026-07-10T01:00:00.000Z', 'Verify Perth wall time']);
});

test('R roster-only admin has actionable Attendance approvals and Roster entries', () => {
  const current = { staff: false, roster: true };
  const callbacks = [];
  const react = { useCallback: f => f, useMemo: f => f() };
  react.default = react;
  const layout = load('app/admin/_layout.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useRouter: () => ({ push: url => callbacks.push(url),
      canGoBack: () => false, replace() {} }), usePathname: () => '/admin/more' },
    'react-native': { StyleSheet: { create: x => x }, View: 'View' },
    'react-native-paper': { Text: 'Text' },
    'lucide-react-native': new Proxy({}, { get: (_obj, key) => String(key) }),
    '@/context/AuthContext': { useAuth: () => ({
      user: { role: 'PHARMACIST', id: 11 }, isLoading: false,
      hasCapability: cap => cap === 'MANAGE_STAFF' ? current.staff : current.roster,
    }) },
    '@/context/AdminWorkspaceContext': { AdminWorkspaceProvider: 'Provider',
      useAdminWorkspace: () => ({ activePharmacyId: 11, isLoading: false }) },
    '@/constants/tokens': { colors: { surfaceBg: 'white' } },
    '@/roles/shared/forms/UnsavedChangesRegistryProvider': { useUnsavedChangesRegistry: () => null },
    '@/roles/shared/dashboard/dashboardScope': { usePersonaSwitch: () => ({
      roleLabel: 'Pharmacist', openRoleWorkspace() {},
    }) },
    '@/components/ui': { BrandLoader: 'BrandLoader' },
    '@/components/shell': { PersonaShell: 'PersonaShell' },
  });
  const child = layout.default().props.children;
  const shell = child.type(child.props);
  const visible = shell.props.more.flatMap(group => group.items.filter(item => !item.hidden));
  for (const label of ['Attendance approvals', 'Roster']) {
    const entry = visible.find(item => item.label === label);
    assert.ok(entry, 'roster-only admin needs ' + label);
    shell.props.navigate(entry.route);
    assert.equal(callbacks.at(-1), entry.route);
  }
  current.staff = true; current.roster = false;
  const staffOnly = child.type(child.props);
  const staffVisible = staffOnly.props.more.flatMap(group => group.items.filter(item => !item.hidden));
  assert.equal(staffVisible.some(item => item.label === 'Attendance approvals'), false);
});
