// M5-03: render the actual assignment board, including presses and props (not source assertions).
process.env.TZ = 'Australia/Sydney';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props: props || {} });
const roleIcons = new Proxy({}, { get: (_, name) => String(name) });
const tokens = {
  colors: {
    primary: '#5222B8', primarySoft: '#EFE7FF', border: '#D8DCE9',
    textPrimary: '#06214A', textSecondary: '#52617D', textMuted: '#63708C',
    surfaceBg: '#FFFFFF', subtleBg: '#F8F9FC',
    status: {
      green: { bg: '#E4F5EA', fg: '#17663A', solid: '#117A50' },
      amber: { bg: '#FDF0D9', fg: '#8A4B00', solid: '#A15C07' },
      red: { bg: '#FDE8E7', fg: '#B42318', solid: '#C9364A' },
    },
    tone: { blue: { bg: '#E6F1FC', fg: '#0063A8' }, magenta: { bg: '#FCE6F8', fg: '#A3008F' } },
  },
  radius: { card: 20, sheet: 24, nested: 14, control: 12 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
};
function load(relative, imports) {
  const sourcePath = process.env.M5_BASE_DIR && fs.existsSync(path.join(process.env.M5_BASE_DIR, path.basename(relative)))
    ? path.join(process.env.M5_BASE_DIR, path.basename(relative)) : path.join(root, relative);
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    }, fileName: relative,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console, Date, Set, Map,
    require(name) {
      if (!Object.prototype.hasOwnProperty.call(imports, name)) {
        throw new Error('Unmocked import ' + name + ' in ' + relative);
      }
      const m = imports[name];
      return m && typeof m === 'object' && 'default' in m && !m.__esModule
        ? { __esModule: true, ...m } : m;
    },
  }, { filename: relative });
  return module.exports;
}
function find(node, predicate, list = []) {
  if (Array.isArray(node)) node.forEach(x => find(x, predicate, list));
  else if (node && typeof node === 'object') {
    if (predicate(node)) list.push(node);
    if (typeof node.type === 'function') find(node.type(node.props), predicate, list);
    else find(node.props && node.props.children, predicate, list);
  }
  return list;
}
function textOf(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node.type === 'function') return textOf(node.type(node.props));
  return textOf(node.props && node.props.children);
}
function boardHarness(screenWidth = 360, fontScale = 1) {
  const slots = [];
  let index = 0;
  const react = {
    useState(initial) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], update => {
        slots[i] = typeof update === 'function' ? update(slots[i]) : update;
      }];
    },
  };
  react.default = react;
  const paper = Object.fromEntries(['Button','Card','Chip','Surface','Text'].map(x => [x,x]));
  function Card(props) { return jsx('Card', props); }
  Card.Content = 'Card.Content';
  paper.Card = Card;
  const actual = load('roles/shared/shifts/OwnerAssignedShiftBoard.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      ScrollView: 'ScrollView', StyleSheet: { create: styles => styles },
      TouchableOpacity: 'TouchableOpacity', View: 'View',
      useWindowDimensions: () => ({ width: screenWidth, height: 800, fontScale }),
    },
    'react-native-paper': paper,
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'ActivityIndicator' },
    'lucide-react-native': roleIcons, '@/constants/tokens': tokens,
  });
  return {
    render(props) { index = 0; return actual.default(props); },
    find, textOf,
  };
}
const sample = {
  id: 12, pharmacyDetail: { name: 'Pharmacy A', id: 7, streetAddress: 'Sydney' },
  roleNeeded: 'PHARMACIST', employmentType: 'LOCUM', uiIsUrgent: true,
  slots: [
    { id: 34, date: '2026-11-08', startTime: '09:00', endTime: '17:00', rate: 70 },
    { id: 35, date: '2026-11-09', startTime: '09:00', endTime: '17:00', rate: 70 },
    { id: 36, date: '2026-11-10', startTime: '09:00', endTime: '17:00', rate: 70 },
  ],
  slotAssignments: [
    { slotId: 34, userId: 41, user: { firstName: 'Ada', lastName: 'Lee' } },
    { slotId: 35, userId: 42, user: { firstName: 'Ben', lastName: 'Ray' } },
  ],
  interestedUsersCount: 3,
};
const props = (mode, overrides = {}) => ({
  emptyText: 'Web empty helper', loading: false, mode, shifts: [sample],
  title: 'Shift board', onViewAssigned() {}, onRateAssigned() {}, ...overrides,
});
const buttons = (tree, label) => find(tree, x => x.type === 'Button' &&
  textOf(x) === label);
function openDates(harness, mode, options) {
  let tree = harness.render(props(mode, options));
  const toggles = buttons(tree, mode === 'history' ? 'View dates' : 'View booked dates');
  assert.equal(toggles.length, 1, 'explicit dates control exists');
  assert.deepEqual(JSON.parse(JSON.stringify(toggles[0].props.accessibilityState)), { expanded: false });
  toggles[0].props.onPress();
  tree = harness.render(props(mode, options));
  return tree;
}
function openCard(harness, mode, options) {
  const p = props(mode, options);
  const tree = harness.render(p);
  harness.find(tree, x => x.type === 'Card')[0].props.onPress();
  return harness.render(p);
}

test('R status_pill: exact confirmed and partially booked history summaries before expanding', () => {
  const h = boardHarness();
  assert.match(h.textOf(h.render(props('confirmed'))), /Confirmed\s*·\s*2 dates booked/);
  const h2 = boardHarness();
  const lessBooked = { ...sample, slotAssignments: sample.slotAssignments.slice(0, 1) };
  assert.match(h2.textOf(h2.render(props('history', { shifts: [lessBooked] }))),
    /Completed\s*·\s*1 of 3 dates booked/);
});
test('R dates_toggle: labelled accessible control and collapsed until requested', () => {
  for (const mode of ['confirmed', 'history']) {
    const h = boardHarness();
    const collapsed = h.render(props(mode));
    assert.equal(h.find(collapsed, x => x.type === 'Text' && h.textOf(x) === 'Booked').length, 0);
    const expanded = openDates(h, mode);
    assert.equal(buttons(expanded, 'Hide dates').length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(buttons(expanded, 'Hide dates')[0].props.accessibilityState)), { expanded: true });
  }
});
test('R date_rows: date status, unfilled explanation and profile button', () => {
  const confirmed = boardHarness();
  assert.match(confirmed.textOf(openCard(confirmed, 'confirmed')), /Booked/);
  assert.ok(buttons(confirmed.render(props('confirmed')), 'Hide dates').length);
  const history = boardHarness();
  const historyTree = openCard(history, 'history');
  const txt = history.textOf(historyTree);
  assert.match(txt, /Worked/);
  assert.match(txt, /Not filled/);
  assert.match(txt, /No one was booked for this date\./);
  assert.equal(buttons(historyTree, 'View profile').length, 2);
  assert.equal(buttons(historyTree, 'View Assigned').length, 0);
});
test('R message_action: row Message only on Confirmed, not History', () => {
  const confirmed = boardHarness();
  const messageCalls = [];
  const tree = openCard(confirmed, 'confirmed', { onMessageAssigned: id => messageCalls.push(id) });
  assert.equal(buttons(tree, 'Message').length, 2);
  buttons(tree, 'Message')[0].props.onPress();
  assert.deepEqual(messageCalls, [41]);
  const history = boardHarness();
  assert.equal(buttons(openCard(history, 'history'), 'Message').length, 0);
});
test('R copy: display labels and true board empty states', () => {
  const h = boardHarness();
  const full = h.textOf(h.render(props('confirmed')));
  assert.match(full, /Interested/);
  assert.doesNotMatch(full, /Interests/);
  assert.match(full, /Pharmacist/);
  assert.doesNotMatch(full, /PHARMACIST/);
  assert.match(full, /Locum/);
  assert.doesNotMatch(full, /LOCUM/);
  for (const [mode, heading] of [
    ['confirmed', 'No confirmed shifts yet'], ['history', 'No past shifts yet'],
  ]) {
    const empty = h.textOf(h.render(props(mode, { shifts: [] })));
    assert.match(empty, new RegExp(heading));
  }
});
test('C board_press: existing card press still toggles and has the correct assigned rows', () => {
  const h = boardHarness();
  const closed = h.render(props('confirmed'));
  const card = h.find(closed, x => x.type === 'Card')[0];
  assert.ok(card && typeof card.props.onPress === 'function');
  card.props.onPress();
  const opened = h.render(props('confirmed'));
  assert.match(h.textOf(opened), /Ada Lee/);
  assert.match(h.textOf(opened), /Ben Ray/);
});
test('C profile_rate: existing callbacks keep the exact user and slot ids and rate only in history', () => {
  const viewed = [], rated = [];
  const confirmed = boardHarness();
  const cProps = props('confirmed', {
    onViewAssigned: (...args) => viewed.push(args),
  });
  let c = confirmed.render(cProps);
  confirmed.find(c, x => x.type === 'Card')[0].props.onPress();
  c = confirmed.render(cProps);
  const profile = buttons(c, 'View Assigned')[0] || buttons(c, 'View profile')[0];
  assert.ok(profile);
  profile.props.onPress();
  assert.deepEqual(viewed, [[12, 34, 41]]);
  const history = boardHarness();
  const hProps = props('history', { onRateAssigned: id => rated.push(id) });
  let t = history.render(hProps);
  history.find(t, x => x.type === 'Card')[0].props.onPress();
  t = history.render(hProps);
  buttons(t, 'Rate')[0].props.onPress();
  assert.deepEqual(rated, [41]);
});

// Exercise the complete containers, preserving hook state and effect cleanup across renders.
function containerHarness(mode, overrides = {}) {
  const state = { surface: { scopeKey: 'a', persona: 'owner', scopedPharmacyId: null }, user: { role: 'OWNER' } };
  const slots = [], effects = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) {
      const old = slots[i]; effects.push(() => { if (old?.cleanup) old.cleanup(); slots[i] = { deps, cleanup: fn() }; }); } },
  }; react.default = react;
  const calls = { chats: [], navigation: [], profile: [], rating: [], saved: [], activation: [], fetch: 0 };
  const core = {
    fetchAllConfirmedShifts: async () => { calls.fetch++; return [sample]; },
    fetchHistoryShifts: async () => { calls.fetch++; return [sample]; },
    fetchDeferredPayrollOffersService: async () => [],
    activateShiftOfferPayrollService: async id => calls.activation.push(id),
    viewAssignedShiftProfileService: async args => { calls.profile.push(args); return { id: args.userId }; },
    fetchMyRatingForTargetService: async args => { calls.rating.push(args); return { stars: 4, comment: 'Great' }; },
    createRatingService: async args => { calls.saved.push(args); }, ...overrides,
  };
  const payroll = load('roles/shared/shifts/confirmedPayroll.ts', {});
  const policy = load('roles/shared/shifts/shiftSurface.ts', {});
  const logic = load('roles/shared/shifts/shiftsScreenLogic.ts', { './shiftSurface': policy });
  const paper = Object.fromEntries(['Button', 'Card', 'Snackbar', 'Text', 'Dialog', 'Portal', 'TextInput'].map(x => [x, x]));
  paper.Card = Object.assign(function Card(p) { return jsx('Card', p); }, { Content: 'Card.Content' });
  paper.Dialog = Object.assign(function Dialog(p) { return jsx('Dialog', p); }, { Title: 'Dialog.Title', Content: 'Dialog.Content', Actions: 'Dialog.Actions' });
  const common = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Pressable: 'Pressable', StyleSheet: { create: s => s } },
    'react-native-paper': paper, '@chemisttasker/shared-core': core,
    '@/components/ui': { ContentState: 'ContentState' }, '@/constants/tokens': tokens,
    './OwnerAssignedShiftBoard': { default: 'Board' }, './useShiftSurface': { useShiftSurface: () => state.surface },
    './WorkerProfileDialog': { WorkerProfileDialog: 'WorkerProfileDialog' },
    './confirmedPayroll': payroll, '@/context/AuthContext': { useAuth: () => ({ user: state.user }) },
    'expo-router': { useRouter: () => ({ push: x => calls.navigation.push(x) }) },
    '@/utils/chatRoutes': load('utils/chatRoutes.ts', {}),
    '../chat/hooks': { startDirectChat: args => { calls.chats.push(args); return overrides.chat(args); } },
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'ActivityIndicator' },
    'lucide-react-native': roleIcons, './shiftsScreenLogic': logic,
  };
  const confirmed = load('roles/shared/shifts/ConfirmedShiftsView.tsx', common);
  common['./ConfirmedShiftsView'] = confirmed;
  const component = mode === 'confirmed' ? confirmed : load('roles/shared/shifts/HistoryShiftsView.tsx', common);
  function render() {
    cursor = 0;
    let tree = component.default();
    if (mode === 'confirmed') tree = tree.type(tree.props);
    while (effects.length) effects.shift()();
    return tree;
  }
  function unmount() { for (const slot of slots) if (slot?.cleanup) slot.cleanup(); }
  return { state, calls, render, unmount };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const one = (tree, type) => find(tree, x => x.type === type)[0];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('R message navigation: same-render lock, separate users and persona routes; old account completion ignored', async () => {
  const requests = [];
  const h = containerHarness('confirmed', { chat: () => { const d = deferred(); requests.push(d); return d.promise; } });
  let tree = h.render(); await flush(); tree = h.render();
  const message = one(tree, 'Board').props.onMessageAssigned;
  assert.equal(typeof message, 'function');
  message(41); message(41); message(42);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.chats)), [{ userId: 41 }, { userId: 42 }]);
  requests[1].resolve({ id: 102 }); await flush();
  assert.equal(h.calls.navigation[0].pathname, '/owner/messages/102');
  h.unmount();
  const admin = containerHarness('confirmed', { chat: async () => ({ id: 77 }) });
  admin.state.surface = { scopeKey: 'b', persona: 'admin', scopedPharmacyId: 7 };
  tree = admin.render(); await flush(); tree = admin.render();
  requests[0].resolve({ id: 101 }); await flush();
  assert.equal(h.calls.navigation.length, 1);
  one(tree, 'Board').props.onMessageAssigned(41); await flush();
  assert.equal(admin.calls.navigation[0].pathname, '/admin/messages/77');
});

test('C confirmed scope, profile, payroll activation and load retry', async () => {
  let attempts = 0;
  const { ApiError } = load('../shared-core/src/transport/errors.ts', {
    '../domains/onboarding/ahpra': { reportAhpraError: () => null },
  });
  const offer = id => ({ id, paymentPreferenceSnapshot: 'TFN', engagementKind: 'SHIFT_EMPLOYMENT', settlementChannel: 'TIMESHEET_ONLY', engagementTermsSnapshot: { payrollActivationRequired: true, pharmacyId: id, workerName: `Worker ${id}` } });
  const h = containerHarness('confirmed', {
    fetchAllConfirmedShifts: async () => { if (!attempts++) throw new ApiError('offline', 503, null); return [sample, { ...sample, id: 13, pharmacyDetail: { id: 8 } }]; },
    fetchDeferredPayrollOffersService: async () => [offer(7), offer(8)],
  });
  h.state.surface = { scopeKey: 'admin-a', persona: 'admin', scopedPharmacyId: 7 };
  h.render(); await flush(); let tree = h.render();
  assert.equal(one(tree, 'ContentState').props.description, 'offline');
  one(tree, 'ContentState').props.onAction(); await flush(); tree = h.render();
  const board = one(tree, 'Board'); assert.deepEqual(Array.from(board.props.shifts, x => x.id), [12]);
  assert.match(textOf(tree), /Worker 7/); assert.doesNotMatch(textOf(tree), /Worker 8/);
  buttons(tree, 'Activate payroll')[0].props.onPress(); await flush();
  assert.deepEqual(h.calls.activation, [7]);
  board.props.onViewAssigned(12, 34, 41); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.profile)), [{ type: 'confirmed', shiftId: 12, slotId: 34, userId: 41 }]);
});

test('C history rating loads existing values and persists them', async () => {
  const h = containerHarness('history'); h.render(); await flush(); let tree = h.render();
  one(tree, 'Board').props.onRateAssigned(41); await flush(); tree = h.render();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.rating)), [{ targetType: 'worker', targetId: 41 }]);
  assert.equal(one(tree, 'TextInput').props.value, 'Great');
  assert.equal(find(tree, x => x.type === 'Pressable' && x.props.accessibilityLabel === '4 stars')[0].props.accessibilityState.checked, true);
  buttons(tree, 'Save Rating')[0].props.onPress(); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.saved)), [{ direction: 'OWNER_TO_WORKER', ratee_user: 41, stars: 4, comment: 'Great' }]);
});

test('R rating double tap sends one save', async () => {
  const h = containerHarness('history'); h.render(); await flush(); let tree = h.render();
  one(tree, 'Board').props.onRateAssigned(41); await flush(); tree = h.render();
  const save = buttons(tree, 'Save Rating')[0].props.onPress;
  save(); save(); await flush();
  assert.equal(h.calls.saved.length, 1);
});

test('C same-account older direct chat completing last never hijacks navigation', async () => {
  const requests = [];
  const h = containerHarness('confirmed', {
    chat: () => {
      const pending = deferred();
      requests.push(pending);
      return pending.promise;
    },
  });
  h.render(); await flush();
  const board = one(h.render(), 'Board');
  const message = board.props.onMessageAssigned;
  message(41);
  message(42);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.chats)), [{ userId: 41 }, { userId: 42 }]);

  // The second request is the last action the owner asked for, so its room wins.
  requests[1].resolve({ id: 502 });
  await flush();
  assert.equal(h.calls.navigation.length, 1);
  assert.equal(h.calls.navigation[0].pathname, '/owner/messages/502');

  // Completing the first request afterwards must not navigate back to it.
  requests[0].resolve({ id: 501 });
  await flush();
  assert.equal(h.calls.navigation.length, 1, 'a stale first request cannot navigate');
  h.unmount();
});

test('C deferred payroll activation locks same-render duplicate taps until request settles', async () => {
  const pending = deferred();
  const offer = {
    id: 7,
    paymentPreferenceSnapshot: 'TFN',
    engagementKind: 'SHIFT_EMPLOYMENT',
    settlementChannel: 'TIMESHEET_ONLY',
    engagementTermsSnapshot: {
      payrollActivationRequired: true, pharmacyId: 7, workerName: 'Worker 7',
    },
  };
  let h;
  h = containerHarness('confirmed', {
    fetchDeferredPayrollOffersService: async () => [offer],
    activateShiftOfferPayrollService: async id => {
      h.calls.activation.push(id);
      return pending.promise;
    },
  });
  h.render(); await flush();
  const tree = h.render();
  const action = buttons(tree, 'Activate payroll')[0];
  assert.ok(action, 'the real confirmed board exposes eligible payroll activation');
  const tap = action.props.onPress;
  tap();
  tap();
  assert.deepEqual(h.calls.activation, [7], 'two taps from one render must make only one request');
  pending.resolve();
  await flush();
  assert.deepEqual(h.calls.activation, [7]);
  h.unmount();
});

test('R 360dp large text keeps one full-width slot card and unclipped actions', () => {
  const h = boardHarness(360, 1.3);
  const params = props('confirmed', { onMessageAssigned() {} });
  let tree = h.render(params);
  h.find(tree, x => x.type === 'Card')[0].props.onPress();
  tree = h.render(params);
  const cell = h.find(tree, x => x.type === 'TouchableOpacity')[0];
  assert.ok(cell, 'real mounted board exposes an assigned date cell');
  const layout = Array.isArray(cell.props.style) ? cell.props.style : [cell.props.style];
  assert.ok(layout.some(row => row && row.width === '100%'),
    'at 360 dp and large text, slot cells need a full width to keep actions readable');
  assert.equal(buttons(tree, 'Message').length, 2, 'contact actions remain available');
  assert.equal(buttons(tree, 'View profile').length, 2, 'profile actions remain available');
});

test('R child date and action presses stop parent card toggling', () => {
  const h = boardHarness();
  const values = props('confirmed', { onMessageAssigned() {} });
  let tree = h.render(values);
  const dateToggle = buttons(tree, 'View booked dates')[0];
  assert.ok(dateToggle, 'date toggle exists');
  let stopped = false;
  dateToggle.props.onPress({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true, 'the date toggle must not bubble to the parent card');
  tree = h.render(values);
  const message = buttons(tree, 'Message')[0];
  assert.ok(message, 'the expanded board exposes a contact action');
  stopped = false;
  message.props.onPress({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true, 'Message action must not collapse the date card');
  const viewProfile = buttons(tree, 'View profile')[0];
  stopped = false;
  viewProfile.props.onPress({ stopPropagation: () => { stopped = true; } });
  assert.equal(stopped, true, 'View profile must not trigger the parent card');
});
