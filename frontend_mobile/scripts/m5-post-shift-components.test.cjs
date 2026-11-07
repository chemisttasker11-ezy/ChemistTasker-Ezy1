process.env.TZ = 'Australia/Sydney';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const jsx = (type, props) => ({ type, props: props || {} });
function load(file, imports, head = false) {
  const source = process.env.M5_BASE === '1' && !head
    ? execFileSync('git', ['show', `5c28634d:${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
  const output = ts.transpileModule(source, { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, Date, console,
    require(name) {
      if (!(name in imports)) throw Error(`Unmocked import ${name}`);
      return imports[name];
    } }, { filename: file });
  return module.exports;
}
function nodes(node, result = []) {
  if (Array.isArray(node)) node.forEach(child => nodes(child, result));
  else if (node && typeof node === 'object') {
    result.push(node);
    nodes(node.props?.children, result);
  }
  return result;
}
const react = { __esModule: true, default: null,
  useState: value => [value, () => {}], useEffect: () => {},
  useCallback: fn => fn, useRef: value => ({ current: value }) };
react.default = react;
const tokens = { colors: { status: { red: {} }, tone: { cyan: {} } }, radius: {}, space: {}, touch: { min: 44 },
  type: new Proxy({}, { get: () => ({ fontSize: 14, lineHeight: 20 }) }) };
const paper = { Button: 'Button', Checkbox: 'Checkbox', Chip: 'Chip', Surface: 'Surface',
  Text: 'Text', TextInput: { Icon: 'Icon' }, Switch: 'Switch', Menu: 'Menu' };
const native = { TouchableOpacity: 'TouchableOpacity', View: 'View', ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: {}, Alert: {},
  StyleSheet: { create: styles => styles } };
const common = { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': native, 'react-native-paper': paper, '@/constants/tokens': tokens,
  'lucide-react-native': {}, './PostShiftScreen.styles': { styles: {} },
  './PostShiftScreen.helpers': { formatAuDate: x => x, formatLongSlotDate: x => x } };

test('R window_range: timetable disables boundary arrows and out-of-window cells', () => {
  const screen = load('frontend_mobile/roles/shared/shifts/PostShiftTimetableStep.tsx', common).default;
  const props = { postingWindow: { minIso: '2026-11-07', maxIso: '2027-03-31' },
    calendarMonthAnchor: new Date(2026, 10, 1), monthCalendarCells: [
      { iso: '2026-11-06', day: 6, inMonth: true },
      { iso: '2026-11-07', day: 7, inMonth: true } ],
    selectedDates: [], selectedDateSet: new Set(), slotDateSet: new Set(),
    selectedDateTimes: {}, slotRecurringDays: [], closedSelectedDates: [], slots: [],
    getDefaultTimesForDate: () => ({ startTime: '09:00', endTime: '17:00', closed: false }) };
  let all = nodes(screen(props));
  assert.equal(all.find(n => n.props.accessibilityLabel === 'Previous month').props.disabled, true);
  assert.equal(all.find(n => n.props.accessibilityLabel === 'Next month').props.disabled, false);
  const cells = all.filter(n => n.type === 'TouchableOpacity' && !n.props.accessibilityLabel);
  assert.equal(cells[0].props.disabled, true);
  assert.equal(cells[1].props.disabled, false);
  props.calendarMonthAnchor = new Date(2027, 2, 1);
  all = nodes(screen(props));
  assert.equal(all.find(n => n.props.accessibilityLabel === 'Next month').props.disabled, true);
});

test('R legacy_create_route: forwards pharmacy to the canonical wizard without posting', () => {
  let posts = 0;
  const imports = { ...common,
    'expo-router': { Redirect: 'Redirect', useLocalSearchParams: () => ({ pharmacy_id: '7' }), useRouter: () => ({}) },
    '@/components/ui/ResponsiveSegmentedButtons': { ResponsiveSegmentedButtons: 'SegmentedButtons' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/security/GuardedModal': { GuardedDatePickerModal: 'DatePickerModal' },
    '@chemisttasker/shared-core': { createShift: () => { posts++; } },
    '@/components/ui': { ContentState: 'ContentState' },
    '@/roles/shared/shifts/useShiftSurface': { useShiftSurface: () => ({}) },
    '@/roles/shared/shifts/PostShiftScreen.helpers': { pickScopedPharmacyId: () => 7 },
  };
  const screen = load('frontend_mobile/roles/owner/shifts/create.tsx', imports).default;
  const tree = screen();
  assert.equal(tree.type, 'Redirect');
  assert.deepEqual(JSON.parse(JSON.stringify(tree.props.href)), { pathname: '/owner/post-shift', params: { pharmacyId: '7' } });
  assert.equal(posts, 0);
});

test('R window_range: mounted posting screen passes the window to its multiple picker', () => {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-11-07T12:00:00+11:00'])); }
    static now() { return new Date('2026-11-07T12:00:00+11:00').getTime(); }
  }
  const policy = load('shared-core/src/domains/shifts/postingWindow.ts', {}, true);
  const core = { ...policy, isPrivateShiftBooking: () => false, expandShiftDraftSlots: () => [],
    getPharmacyHoursForDate: () => null, pharmacySoftwareDefaults: () => [], normalizeShiftRequirements: () => [],
    canNotifyShiftChainMembers: () => false };
  const helpers = load('frontend_mobile/roles/shared/shifts/PostShiftScreen.helpers.ts', { '@chemisttasker/shared-core': core });
  const hooks = { ...react, useMemo: fn => fn(), useState: value => [typeof value === 'function' ? value() : value, () => {}] };
  hooks.default = hooks;
  const components = Object.fromEntries(['NativeShiftBoardPreview', 'PostShiftDetailsStep', 'PostShiftSkillsStep', 'PostShiftVisibilityStep', 'PostShiftProgress', 'PostShiftPayRateStep', 'PostShiftTimetableStep'].map(name => [`./${name}`, { default: name }]));
  const imports = { ...common, ...components, react: hooks, '@chemisttasker/shared-core': core,
    '@chemisttasker/shared-core/skills_registry.json': { default: {} },
    './PostShiftScreen.helpers': helpers,
    '@/components/security/GuardedModal': { GuardedDatePickerModal: 'DatePickerModal', GuardedTimePickerModal: 'TimePickerModal' },
    'expo-router': { useFocusEffect: () => {}, useLocalSearchParams: () => ({}), useRouter: () => ({}) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/context/AuthContext': { useAuth: () => ({ hasCapability: () => true }) },
    '@/components/ui': { ContentState: 'ContentState' },
    './useShiftSurface': { useShiftSurface: () => ({ ready: true, persona: 'owner', canManageShifts: true, scopeKey: 'owner' }) },
    './shiftSurface': { shiftRoute: () => '' },
    '../forms/useUnsavedChangesGuard': { useUnsavedChangesGuard: () => ({ markClean() {} }) },
  };
  // Use a fixed clock in the complete screen module, including all its Date calls.
  const source = process.env.M5_BASE === '1' ? execFileSync('git', ['show', '5c28634d:frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, Date: FixedDate, console, URLSearchParams,
    require(name) { if (!(name in imports)) throw Error(`Unmocked import ${name}`); return imports[name]; } });
  const picker = nodes(module.exports.default()).find(n => n.type === 'DatePickerModal' && n.props.mode === 'multiple');
  assert.ok(picker);
  assert.equal(picker.props.validRange.startDate.getTime(), new Date('2026-11-07T00:00:00+11:00').getTime());
  assert.equal(picker.props.validRange.endDate.getTime(), new Date('2027-03-31T23:59:59+11:00').getTime());
});
