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
  const file = (relative === 'features/parity/attendance.tsx' && process.env.M4_ATTENDANCE_SOURCE) ||
    (relative === 'app/admin/_layout.tsx' && process.env.M4_LAYOUT_SOURCE) || path.join(root, relative);
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
  let visited;
  function walk(node, location = 'root', output = []) {
    if (location === 'root') visited = new Set();
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, location + '.' + i, output));
    } else if (node && typeof node === 'object') {
      if (typeof node.type === 'function') {
        const id = location + ':' + String(node.props.key ?? '') + ':' + node.type.name;
        visited.add(id);
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
    if (location === 'root') {
      for (const [id, fiber] of fibers) if (!visited.has(id)) {
        for (const value of fiber.effects.values()) value.cleanup?.();
        fibers.delete(id);
      }
    }
    return output;
  }
  async function settle() {
    while (effects.length) effects.shift()();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  }
  function unmount() {
    const disposed = [...fibers.values()];
    for (const fiber of fibers.values()) for (const value of fiber.effects.values()) {
      value.cleanup?.();
    }
    fibers.clear(); effects.length = 0;
    return disposed;
  }
  return { react, walk, settle, unmount };
}

function screenHarness() {
  const env = { screen: 'reviews', user: { id: 5, role: 'PHARMACIST', admin_assignments: [
    { pharmacy_id: 11, admin_level: 'ROSTER_MANAGER', capabilities: ['MANAGE_ROSTER'] },
  ] }, pharmacy: 11, adminPharmacy: 11, params: {}, pathname: '/attendance/reviews' };
  const io = { pending: [], pendingRows: [], pendingReplies: [], timeline: [],
    timelineReplies: [], correct: [], approve: [], reject: [],
    approveReply: null, rejectReply: null, missing: [], comments: [], navigations: [] };
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
      getManagerPending: async id => {
        io.pending.push(id);
        const next = io.pendingReplies.shift();
        return next ? await next.promise : io.pendingRows;
      },
      getManagerTimeline: async id => {
        io.timeline.push(id);
        const reply = io.timelineReplies.shift();
        if (reply) return await reply.promise;
        return { session_id: id, pharmacy_id: env.pharmacy,
          pharmacy_timezone: 'Australia/Perth', timeline: [
            { event_id: 22, effective_timestamp: '2026-07-10T00:00:00.000Z' },
          ] };
      },
      correct: async (...args) => { io.correct.push(args); return { status: 'CORRECTED' }; },
      approve: async (...args) => {
        io.approve.push(args);
        return io.approveReply ? await io.approveReply.promise : {};
      },
      reject: async (...args) => {
        io.reject.push(args);
        return io.rejectReply ? await io.rejectReply.promise : {};
      },
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
  h.env.pharmacy = 12; h.io.pending.length = 0;
  await h.render(); await h.render();
  assert.deepEqual(h.io.pending, []);
  h.engine.unmount(); h.env.user = { id: 77, role: 'OWNER', memberships: [{ pharmacy_id: 19, role: 'OWNER' }] };
  h.env.pharmacy = 11;
  await h.render(); await h.render();
  assert.deepEqual(h.io.pending, []);
});

for (const [name, role] of [['Omar', 'PHARMACIST'], ['Ali', 'OTHER_STAFF'], ['Mia', 'OTHER_STAFF'], ['Jack', 'OTHER_STAFF'], ['Sara', 'PHARMACIST']]) {
test('R ' + name + ' correction sends a readable own-timesheet comment, never an event write', async () => {
  const h = screenHarness();
  h.env.screen = 'correction';
  h.env.user = { id: 91, role, admin_assignments: [] };
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
  tree = await h.render();
  assert.ok(tree.some(n => n.type === 'InfoNote' && n.props.title === 'Request sent'));
});
}

test('C Zoe cannot request correction for a timesheet she does not own', async () => {
  const h = screenHarness();
  h.env.screen = 'correction'; h.env.user = { id: 99, role: 'EXPLORER' };
  h.api.workforce.getMyHours = async () => [];
  h.env.params = { timesheetId: '31' };
  let tree = await h.render(); tree = await h.render();
  h.find(tree, 'Field', 'Corrected date/time').props.onChangeText('2026-07-10T09:00');
  h.find(tree, 'Field', 'Reason').props.onChangeText('Missing punch');
  tree = await h.render(); action(tree, 'Request correction').props.onPress();
  await h.engine.settle();
  assert.deepEqual(h.io.comments, []);
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


const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function approvedReview(h) {
  h.env.user = { id: 11, role: 'OWNER',
    memberships: [{ pharmacy_id: 11, role: 'OWNER' }] };
  h.env.pharmacy = 11;
  h.env.screen = 'review-decision';
  h.env.params = { id: '7', sessionId: '78' };
  h.io.pendingRows = [{ provisional_id: 7, session_id: 78,
    worker_name: 'Ali', worker_email: 'ali@example.test',
    cover_type: 'UNROSTERED_LOCAL', status: 'PENDING',
    started_at: '2026-07-10T00:00:00Z' }];
}
async function reviewTree(h) { await h.render(); return await h.render(); }
const action = (tree, label) => {
  const button = tree.find(node => node.type === 'Button' &&
    String(node.props.children).includes(label));
  assert.ok(button, 'real review decision action ' + label);
  return button;
};

test('R: live pharmacy switch while A timeline is pending cannot load or reveal A data at B', async () => {
  const h = screenHarness();
  approvedReview(h);
  h.env.screen = 'review-detail';
  // Use sessionId alone: selecting pending id during the first fetch would
  // legitimately issue a second effect request on the next render.
  h.env.params = { sessionId: '78' };
  const old = deferred();
  h.io.timelineReplies.push(old);
  await h.render();
  assert.deepEqual(h.io.timeline, [78], 'A timeline must have started before switching');
  // No unmount: the actual mounted screen changes workspace to unauthorized B.
  h.env.pharmacy = 12;
  h.env.adminPharmacy = 12;
  let tree = await h.render();
  assert.deepEqual(h.io.pending, [11], 'the B branch must not contact manager endpoints');
  assert.deepEqual(h.io.timeline, [78], 'B must never start a manager timeline');
  assert.ok(tree.some(node => node.type === 'InfoNote' &&
    node.props.title === 'No attendance management access'), 'B displays scoped access denial');
  old.resolve({ session_id: 78, pharmacy_id: 11,
    pharmacy_timezone: 'Australia/Perth', timeline: [
      { event_id: 9001, event_type: 'CLOCK_IN', effective_timestamp: '2026-07-10T00:00:00Z' },
    ] });
  await h.engine.settle();
  tree = await h.render();
  assert.ok(!tree.some(node => node.type === 'DataRow' &&
    String(node.props.title).includes('CLOCK_IN')), 'late A event must not appear in B');
  assert.deepEqual(h.io.pending, [11]);
  h.env.pharmacy = 11; h.env.adminPharmacy = 11;
  h.env.screen = 'review-decision'; h.env.params = { id: '7', sessionId: '78' };
  await h.render(); tree = await h.render();
  assert.deepEqual(h.io.pending, [11, 11], 'switching back reloads A');
  action(tree, 'Approve & backfill'); action(tree, 'Reject');
  h.engine.unmount();
});

for (const [name, role, memberships, assignments] of [
  ['Ali', 'OTHER_STAFF', [{ pharmacy_id: 11, role: 'TECHNICIAN' }], []],
  ['Mia', 'OTHER_STAFF', [{ pharmacy_id: 11, role: 'ASSISTANT' }], []],
  ['Jack', 'OTHER_STAFF', [{ pharmacy_id: 11, role: 'INTERN' }], []],
  ['Zoe', 'EXPLORER', [], []],
]) {
  test('R: ' + name + ' does not acquire manager pending or timeline authority', async () => {
    const h = screenHarness();
    h.env.user = { id: 100 + name.length, role,
      memberships, admin_assignments: assignments };
    h.env.screen = 'review-detail';
    h.env.params = { id: '7', sessionId: '78' };
    await h.render();
    const tree = await h.render();
    assert.deepEqual(h.io.pending, []);
    assert.deepEqual(h.io.timeline, []);
    h.engine.unmount();
  });
  test('C: ' + name + ' has no manager decision buttons', async () => {
    const h = screenHarness();
    h.env.user = { id: 100 + name.length, role, memberships, admin_assignments: assignments };
    h.env.screen = 'review-detail'; h.env.params = { id: '7', sessionId: '78' };
    await h.render(); const tree = await h.render();
    assert.equal(tree.some(node => node.type === 'Button' &&
      /Approve & backfill|Reject/.test(String(node.props.children))), false,
      'worker and Explorer personas cannot render actionable manager decisions');
    h.engine.unmount();
  });
}
test('R: Sara communications-only delegate has no MANAGE_ROSTER access', async () => {
  const h = screenHarness();
  h.env.user = { id: 106, role: 'PHARMACIST', admin_assignments: [{
    pharmacy_id: 11, admin_level: 'COMMUNICATION_MANAGER',
    capabilities: ['MANAGE_COMMUNICATIONS'],
  }] };
  h.env.screen = 'review-detail';
  h.env.params = { id: '7', sessionId: '78' };
  await h.render();
  const tree = await h.render();
  assert.deepEqual(h.io.pending, [], 'a communications delegation cannot call manager pending');
  assert.deepEqual(h.io.timeline, [], 'a communications delegation cannot call manager timeline');
  assert.ok(tree.some(node => node.type === 'InfoNote' &&
    node.props.title === 'No attendance management access'));
  h.engine.unmount();
});

test('R: blank rejection is refused by real decision handler without a server call', async () => {
  const h = screenHarness();
  approvedReview(h);
  let tree = await reviewTree(h);
  const button = action(tree, 'Reject');
  assert.equal(button.props.disabled, true, 'blank reject reason blocks the action');
  button.props.onPress();
  await h.engine.settle();
  tree = await h.render();
  assert.deepEqual(h.io.reject, [], 'even a programmatic press cannot bypass blank-reason validation');
  assert.ok(tree.some(node => node.type === 'ParityPage' &&
    /rejection reason is required/i.test(String(node.props.error))),
    'render the rejection explanation');
  h.engine.unmount();
});

test('R: invalid date shows recoverable feedback', async () => {
  const h = screenHarness();
  h.env.user = { id: 11, role: 'OWNER',
    memberships: [{ pharmacy_id: 11, role: 'OWNER' }] };
  h.env.screen = 'correction';
  h.env.params = { eventId: '22', sessionId: '78' };
  let tree = await h.render(); tree = await h.render();
  h.find(tree, 'Field', 'Corrected date/time').props.onChangeText('2026-13-40T09:00');
  h.find(tree, 'Field', 'Reason').props.onChangeText('Confirmed offline correction');
  tree = await h.render();
  action(tree, 'Save correction').props.onPress();
  await h.engine.settle();
  tree = await h.render();
  assert.deepEqual(h.io.correct, [], 'invalid date cannot be converted or posted');
  assert.ok(tree.some(node => node.type === 'ParityPage' &&
    /valid pharmacy-local date/i.test(String(node.props.error))),
    'invalid date reports recoverable validation feedback');
  h.engine.unmount();
});

test('R: same-render double tap makes exactly one approve call and one navigation', async () => {
  const h = screenHarness();
  approvedReview(h);
  const pending = deferred();
  h.io.approveReply = pending;
  const tree = await reviewTree(h);
  const button = action(tree, 'Approve & backfill');
  button.props.onPress();
  button.props.onPress();
  assert.equal(h.io.approve.length, 1, 'synchronous mutex prevents two writes from same render');
  pending.resolve({ status: 'APPROVED' });
  await new Promise(setImmediate);
  await h.render();
  assert.deepEqual(h.io.navigations, ['/attendance/reviews']);
  h.engine.unmount();
});

test('C: failed approval exposes reason and retry succeeds on same review', async () => {
  const h = screenHarness();
  approvedReview(h);
  const refused = deferred();
  h.io.approveReply = refused;
  let tree = await reviewTree(h);
  action(tree, 'Approve & backfill').props.onPress();
  refused.reject(new Error('Temporary network failure'));
  await new Promise(setImmediate);
  tree = await h.render();
  assert.ok(tree.some(node => node.type === 'ParityPage' &&
    /temporary network failure/i.test(String(node.props.error))),
    'server rejection remains visible without leaving review');
  assert.deepEqual(h.io.navigations, []);
  h.io.approveReply = null;
  action(tree, 'Approve & backfill').props.onPress();
  await new Promise(setImmediate);
  await h.render();
  assert.equal(h.io.approve.length, 2);
  assert.deepEqual(h.io.navigations, ['/attendance/reviews']);
  h.engine.unmount();
});

test('R: old-account approval completion cannot navigate the new account', async () => {
  const h = screenHarness();
  approvedReview(h);
  const pending = deferred();
  h.io.approveReply = pending;
  let tree = await reviewTree(h);
  action(tree, 'Approve & backfill').props.onPress();
  assert.equal(h.io.approve.length, 1, 'old receipt must actually be pending');
  // Simulate React removing the old keyed child at the account boundary.
  h.engine.unmount();
  h.env.user = { id: 88, role: 'OTHER_STAFF', memberships: [] };
  h.env.pharmacy = 12;
  tree = await h.render();
  pending.resolve({ status: 'APPROVED' });
  await new Promise(setImmediate);
  tree = await h.render();
  assert.deepEqual(h.io.navigations, [], 'previous account must not navigate the current shell');
  assert.ok(tree.some(node => node.type === 'InfoNote' &&
    node.props.title === 'No attendance management access'));
  h.engine.unmount();
});


test('C: unmount invalidates an unresolved attendance timeline before a new scope mounts', async () => {
  const h = screenHarness();
  approvedReview(h);
  h.env.screen = 'review-detail';
  h.env.params = { sessionId: '78' };
  const old = deferred();
  const oldPending = deferred();
  h.io.pendingReplies.push(oldPending);
  h.io.timelineReplies.push(old);
  await h.render();
  assert.deepEqual(h.io.timeline, [78], 'original timeline must really be in flight');
  const disposed = h.engine.unmount();
  const content = disposed.find(fiber => fiber.slots[6]?.value === null && Array.isArray(fiber.slots[7]?.value));
  assert.ok(content, 'retain the disposed attendance content fiber');
  oldPending.resolve([{ provisional_id: 9002 }]);
  old.resolve({ session_id: 78, pharmacy_id: 11, pharmacy_timezone: 'Australia/Perth',
    timeline: [{ event_id: 9001, event_type: 'CLOCK_IN',
      effective_timestamp: '2026-07-10T00:00:00Z' }] });
  await h.engine.settle();
  assert.equal(content.slots[6].value, null, 'late response must not write to the disposed timeline');
  assert.equal(content.slots[3].value.length, 0, 'late pending response must not write to disposed state');
  // Remount as a distinct session of the same account: no callback from the
  // disposed fiber can paint its private rows onto the fresh mount.
  h.env.params = { sessionId: '79' };
  const nodes = await h.render();
  assert.equal(nodes.some(node => node.type === 'DataRow' &&
    Number(node.props.key) === 9001), false,
    'no stale original event row may appear in the new session');
  assert.deepEqual(h.io.timeline, [78, 79],
    'the new session starts its own timeline and cannot inherit the former request');
  h.engine.unmount();
});
