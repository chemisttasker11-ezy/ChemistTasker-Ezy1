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
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
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
    find(node.props && node.props.children, predicate, list);
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
function boardHarness() {
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
  paper.Card = Object.assign('Card', { Content: 'Card.Content' });
  const actual = load('roles/shared/shifts/OwnerAssignedShiftBoard.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      ScrollView: 'ScrollView', StyleSheet: { create: styles => styles },
      TouchableOpacity: 'TouchableOpacity', View: 'View',
      useWindowDimensions: () => ({ width: 360, height: 800 }),
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

test('R status_pill: exact confirmed and partially booked history summaries before expanding', () => {
  const h = boardHarness();
  assert.match(h.textOf(h.render(props('confirmed'))), /Confirmed\\s*·\\s*2 dates booked/);
  const h2 = boardHarness();
  const lessBooked = { ...sample, slotAssignments: sample.slotAssignments.slice(0, 1) };
  assert.match(h2.textOf(h2.render(props('history', { shifts: [lessBooked] }))),
    /Completed\\s*·\\s*1 of 3 dates booked/);
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
  assert.match(confirmed.textOf(openDates(confirmed, 'confirmed')), /Booked/);
  assert.ok(buttons(confirmed.render(props('confirmed')), 'Hide dates').length);
  const history = boardHarness();
  const historyTree = openDates(history, 'history');
  const txt = history.textOf(historyTree);
  assert.match(txt, /Worked/);
  assert.match(txt, /Not filled/);
  assert.match(txt, /No one was booked for this date\\./);
  assert.equal(buttons(historyTree, 'View profile').length, 2);
  assert.equal(buttons(historyTree, 'View Assigned').length, 0);
});
test('R message_action: row Message only on Confirmed, not History', () => {
  const confirmed = boardHarness();
  const messageCalls = [];
  const tree = openDates(confirmed, 'confirmed', { onMessageAssigned: id => messageCalls.push(id) });
  assert.equal(buttons(tree, 'Message').length, 2);
  buttons(tree, 'Message')[0].props.onPress();
  assert.deepEqual(messageCalls, [41]);
  const history = boardHarness();
  assert.equal(buttons(openDates(history, 'history'), 'Message').length, 0);
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
  const c = openDates(confirmed, 'confirmed', {
    onViewAssigned: (...args) => viewed.push(args),
  });
  const profile = buttons(c, 'View Assigned')[0] || buttons(c, 'View profile')[0];
  assert.ok(profile);
  profile.props.onPress();
  assert.deepEqual(viewed, [[12, 34, 41]]);
  const history = boardHarness();
  const t = openDates(history, 'history', { onRateAssigned: id => rated.push(id) });
  buttons(t, 'Rate')[0].props.onPress();
  assert.deepEqual(rated, [41]);
});
