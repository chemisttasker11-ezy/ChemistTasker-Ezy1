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
function load(file, imports, head = false, DateImpl = Date) {
  const source = process.env.M5_BASE === '1' && !head
    ? execFileSync('git', ['show', `5c28634d:${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
  const output = ts.transpileModule(source, { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, Date: DateImpl, console, URLSearchParams,
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
  Text: 'Text', TextInput: { Icon: 'Icon' }, Switch: 'Switch', Menu: 'Menu', Snackbar: 'Snackbar' };
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

test('R midnight rollover: mounted Post Shift picker must advance its minimum day on rerender', () => {
  let now = '2026-11-07T23:58:00+11:00';
  class MovingDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const policy = load('shared-core/src/domains/shifts/postingWindow.ts', {}, true);
  const core = { ...policy, isPrivateShiftBooking: () => false, expandShiftDraftSlots: () => [],
    getPharmacyHoursForDate: () => null, pharmacySoftwareDefaults: () => [], normalizeShiftRequirements: () => [],
    canNotifyShiftChainMembers: () => false };
  const helpers = load('frontend_mobile/roles/shared/shifts/PostShiftScreen.helpers.ts', { '@chemisttasker/shared-core': core });
  const memo = [];
  let memoIndex = 0;
  const hooks = {
    ...react,
    useMemo(fn, deps) {
      const index = memoIndex++;
      const previous = memo[index];
      if (previous && deps && previous.deps &&
          previous.deps.length === deps.length && deps.every((v, i) => v === previous.deps[i])) {
        return previous.value;
      }
      const next = { value: fn(), deps: deps ? [...deps] : null };
      memo[index] = next;
      return next.value;
    },
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
  };
  hooks.default = hooks;
  const components = Object.fromEntries(
    ['NativeShiftBoardPreview', 'PostShiftDetailsStep', 'PostShiftSkillsStep', 'PostShiftVisibilityStep',
      'PostShiftProgress', 'PostShiftPayRateStep', 'PostShiftTimetableStep']
      .map(name => [`./${name}`, { default: name }]));
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
  const relative = 'frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx';
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports, Date: MovingDate, console, URLSearchParams,
    require(name) { if (!(name in imports)) throw Error(`Unmocked import ${name}`); return imports[name]; } });
  const picker = () => {
    memoIndex = 0;
    return nodes(module.exports.default()).find(n => n.type === 'DatePickerModal' && n.props.mode === 'multiple');
  };

  assert.equal(picker().props.validRange.startDate.getTime(),
    new Date('2026-11-07T00:00:00+11:00').getTime());
  now = '2026-11-08T00:02:00+11:00';
  assert.equal(picker().props.validRange.startDate.getTime(),
    new Date('2026-11-08T00:00:00+11:00').getTime(),
    'a wizard left open overnight must not permit yesterday');
});

// Mounts the real Post Shift screen with state hooks; DateImpl is the clock the screen module sees.
// With opts.effects, memo/callback/effect hooks follow React's dependency rules and render() reruns until state settles.
function mountPostShift(DateImpl = Date, opts = {}) {
  const slots = [], refs = [], memos = [], effects = [];
  let index = 0, refIndex = 0, memoIndex = 0, effectIndex = 0, dirty = false, queued = [];
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.length || deps.some((v, i) => !Object.is(v, prev[i]));
  const useMemo = (fn, deps) => {
    const i = memoIndex++;
    if (changed(memos[i]?.deps, deps)) memos[i] = { value: fn(), deps };
    return memos[i].value;
  };
  const hooks = {
    useState(init) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof init === 'function' ? init() : init;
      return [slots[i], next => {
        const value = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(value, slots[i])) dirty = true;
        slots[i] = value;
      }];
    },
    useRef(init) {
      const i = refIndex++;
      return refs[i] ||= { current: init };
    },
    useMemo: opts.effects ? useMemo : fn => fn(),
    useCallback: opts.effects ? (fn, deps) => useMemo(() => fn, deps) : fn => fn,
    useEffect: opts.effects ? (fn, deps) => {
      const i = effectIndex++;
      if (changed(effects[i]?.deps, deps)) queued.push([i, fn, deps]);
    } : () => {},
  };
  hooks.default = hooks;
  const draftSlots = load('shared-core/src/domains/shifts/draftSlots.ts', {});
  const visibility = load('shared-core/src/domains/shifts/visibility.ts', {
    './context': { autoEscalationDates: () => ({}) },
  });
  const posting = load('shared-core/src/domains/shifts/postingDraft.ts', {
    './draftSlots': draftSlots,
    './visibility': visibility,
    './mappers': { mapShift: row => row },
  });
  const window = load('shared-core/src/domains/shifts/postingWindow.ts', {});
  const core = { ...posting, ...window, ...draftSlots, ...visibility,
    getPharmacyHoursForDate: (_pharmacy, _date, fallback) => opts.effects ? { ...fallback, closed: false } : null,
    pharmacySoftwareDefaults: () => [], normalizeShiftRequirements: () => [],
    canNotifyShiftChainMembers: () => false };
  const helpers = load('frontend_mobile/roles/shared/shifts/PostShiftScreen.helpers.ts', {
    '@chemisttasker/shared-core': core,
  });
  const components = Object.fromEntries(
    ['NativeShiftBoardPreview','PostShiftDetailsStep','PostShiftSkillsStep','PostShiftVisibilityStep',
     'PostShiftProgress','PostShiftPayRateStep','PostShiftTimetableStep']
      .map(name => [`./${name}`, { default: name }]));
  const destinations = [], submissions = [], updates = [], backs = [], alerts = [], cleans = [];
  const router = { replace: route => destinations.push(route), back: () => backs.push(1) };
  const api = { ...core,
    ApiError,
    createOwnerShiftService: async payload => { submissions.push(payload); return opts.create ? opts.create(payload) : { id: 95 }; },
    updateOwnerShiftService: async (id, payload) => {
      if (!opts.effects) throw Error('edit not part of the posting control');
      updates.push([id, payload]); return { id };
    },
    fetchPharmaciesService: async () => opts.pharmacies ?? [],
    fetchWorkerShiftDetailService: async id => opts.shift(id),
    calculateShiftRates: async () => [],
    listShiftDescriptionTemplates: async () => [],
    normalizeWorkloadTags: (_registry, tags) => tags, mergeSoftwareDefaults: current => current,
    ...opts.api,
  };
  const imports = { ...common, ...components, react: hooks,
    'react-native': { ...native, Platform: opts.platform ?? native.Platform, Alert: { alert: (...args) => alerts.push(args) } },
    '@chemisttasker/shared-core': api,
    '@chemisttasker/shared-core/skills_registry.json': { default: {} },
    './PostShiftScreen.helpers': helpers,
    '@/components/security/GuardedModal': {
      GuardedDatePickerModal: 'DatePickerModal', GuardedTimePickerModal: 'TimePickerModal',
    },
    'expo-router': {
      useFocusEffect: () => {}, useLocalSearchParams: () => opts.params ?? {},
      useRouter: () => router,
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/context/AuthContext': { useAuth: () => ({ hasCapability: opts.hasCapability ?? (() => true) }) },
    '@/components/ui': { ContentState: 'ContentState' },
    './useShiftSurface': {
      useShiftSurface: () => ({
        ready: true, persona: 'owner', canManageShifts: true, scopeKey: 'owner:7',
        scopedPharmacyId: 7, ...opts.surface,
      }),
    },
    './shiftSurface': load('frontend_mobile/roles/shared/shifts/shiftSurface.ts', {}, true),
    '../forms/useUnsavedChangesGuard': {
      useUnsavedChangesGuard: () => ({ markClean: snapshot => { if (snapshot) cleans.push(snapshot); } }),
    },
  };
  const component = load('frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx', imports, false, DateImpl).default;
  function render() {
    let tree;
    for (let pass = 0; pass < 50; pass++) {
      index = 0; refIndex = 0; memoIndex = 0; effectIndex = 0; dirty = false; queued = [];
      tree = nodes(component());
      for (const [i, fn, deps] of queued) {
        effects[i]?.cleanup?.();
        effects[i] = { deps, cleanup: fn() };
      }
      if (!dirty) return tree;
    }
    throw Error('Post Shift state never settled');
  }
  // Lets pending service promises resolve and renders after each turn, so requests started by effects also settle.
  async function flush() {
    let tree;
    for (let k = 0; k < 10; k++) {
      await new Promise(resolve => setImmediate(resolve));
      tree = render();
    }
    return tree;
  }
  return { slots, render, flush, submissions, destinations, updates, backs, alerts, cleans };
}
const { ApiError } = load('shared-core/src/transport/errors.ts', {
  '../domains/onboarding/ahpra': { reportAhpraError: () => null, AHPRA_UNREADABLE_MESSAGE: '' } }, true);
const postButton = tree => tree.find(n => n.type === 'Button' && n.props.children === 'Post Shift');
// Local calendar day `offset` days from now, so fixtures never age into the past.
function isoDayFromNow(offset, now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0')].join('-');
}
function hydrateReview(slots, date) {
  slots[1] = [{ id: 7, name: 'Pharmacy A', allowed_escalation_levels: ['FULL_PART_TIME','LOCUM_CASUAL'] }];
  slots[2] = 7;
  slots[3] = true;
  slots[19] = [{
    date, startTime: '09:00', endTime: '17:00',
    isRecurring: false, recurringDays: [], recurringEndDate: '',
  }];
  slots[45] = 'review';
}

test('R success_destination: actual mounted Post Shift keeps confirmation visible before navigation', async () => {
  const { slots, render, submissions, destinations } = mountPostShift();
  // These values are established through the actual form's state setters during normal
  // hydrated use. Start from the same hydrated values to focus this mounted test
  // on the submit-success/navigation boundary.
  render();
  hydrateReview(slots, isoDayFromNow(5));

  let tree = render();
  const post = tree.find(n => n.type === 'Button' && n.props.children === 'Post Shift');
  assert.ok(post, 'real mounted wizard has its Post Shift control');
  assert.notEqual(post.props.disabled, true);
  await post.props.onPress();
  assert.equal(submissions.length, 1, 'one real shared-domain posting payload reaches the API boundary');
  assert.equal(destinations.length, 0,
    'success navigation must wait until the visible confirmation has been acknowledged or dismissed');
  tree = render();
  const snackbar = tree.find(n => n.type === 'Snackbar' && n.props.visible);
  assert.ok(snackbar, 'success feedback remains mounted on the posting screen: ' + JSON.stringify({ rendered: tree.map(n => ({ type: n.type, visible: n.props?.visible })).filter(n => n.type === 'Snackbar' || n.type === 'ContentState'), toastState: slots[43], loaded: slots[3], pharmacies: slots[1]?.length }));
  assert.equal(snackbar.props.children, 'Shift posted successfully!');
  snackbar.props.onDismiss();
  assert.deepEqual(destinations, ['/owner/shifts?section=active']);
});

test('R midnight submit: Post pressed after midnight without a rerender must not send yesterday', async () => {
  let now = '2026-11-07T23:58:00+11:00';
  class MovingDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const { slots, render, submissions } = mountPostShift(MovingDate);
  render();
  hydrateReview(slots, '2026-11-07');
  const post = render().find(n => n.type === 'Button' && n.props.children === 'Post Shift');
  assert.ok(post, 'real mounted wizard has its Post Shift control');
  now = '2026-11-08T00:02:00+11:00';
  await post.props.onPress();
  assert.equal(submissions.length, 0, 'a slot dated yesterday must not reach create');
  assert.match(String(slots.find(v => typeof v === 'string' && /date has passed/.test(v))), /date has passed/);
});

test('C midnight submit: the same render before midnight still posts today', async () => {
  const now = '2026-11-07T23:58:00+11:00';
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const { slots, render, submissions } = mountPostShift(FixedDate);
  render();
  hydrateReview(slots, '2026-11-07');
  await render().find(n => n.type === 'Button' && n.props.children === 'Post Shift').props.onPress();
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].slots?.[0]?.date ?? submissions[0].slots_data?.[0]?.date, '2026-11-07');
});

test('R server_error_text: the server message is shown, fields are kept and a retry posts once', async () => {
  const message = 'Maximum of 10 public shifts per day reached for A.';
  let fail = true;
  const { slots, render, submissions, destinations } = mountPostShift(Date, {
    create: () => { if (fail) throw new ApiError(message, 400, { detail: message }); return { id: 96 }; } });
  render();
  const date = isoDayFromNow(5);
  hydrateReview(slots, date);
  await postButton(render()).props.onPress();
  assert.equal(submissions.length, 1);
  const tree = render();
  assert.ok(tree.some(n => [].concat(n.props?.children).includes(message)), 'the server text is visible on the form');
  assert.equal(tree.some(n => [].concat(n.props?.children).includes('Unable to save shift')), false);
  assert.equal(slots[2], 7, 'pharmacy kept');
  assert.equal(slots[19][0].date, date, 'slot kept');
  assert.equal(slots[45], 'review', 'still on review');
  assert.deepEqual(destinations, []);
  fail = false;
  const retry = postButton(tree);
  await retry.props.onPress();
  assert.equal(submissions.length, 2, 'the retry posts exactly once');
});

test('R success_destination: organization and admin posters land on their own Shift Centre Active', async () => {
  for (const [surface, route] of [
    [{ persona: 'organization', scopeKey: 'organization:3', scopedPharmacyId: null }, '/organization/shifts?section=active'],
    [{ persona: 'admin', scopeKey: 'admin:7', scopedPharmacyId: 7 }, '/admin/shifts?section=active'],
  ]) {
    const { slots, render, submissions, destinations } = mountPostShift(Date, { surface });
    render();
    hydrateReview(slots, isoDayFromNow(5));
    await postButton(render()).props.onPress();
    assert.equal(submissions.length, 1, surface.persona);
    render().find(n => n.type === 'Snackbar' && n.props.visible).props.onDismiss();
    assert.deepEqual(destinations, [route], surface.persona);
  }
});

test('C posting: two presses of Post from the same render send one create; a validation error sends none', async () => {
  let finish;
  const { slots, render, submissions } = mountPostShift(Date, { create: () => new Promise(resolve => { finish = resolve; }) });
  render();
  hydrateReview(slots, isoDayFromNow(5));
  const post = postButton(render());
  const first = post.props.onPress(), second = post.props.onPress();
  assert.equal(submissions.length, 1, 'same-render double press is single-flight');
  finish({ id: 97 });
  await Promise.all([first, second]);
  const invalid = mountPostShift();
  invalid.render();
  hydrateReview(invalid.slots, isoDayFromNow(5));
  invalid.slots[19] = [];
  await postButton(invalid.render()).props.onPress();
  assert.equal(invalid.submissions.length, 0, 'a draft without dates is refused before the API');
});

test('C access: staff-only admin and worker/explorer personas get the forbidden state and never post', async () => {
  for (const [name, surface] of [
    ['Sam', { persona: 'admin', canManageShifts: false, scopeKey: 'admin:7' }],
    ['Omar', { persona: 'pharmacist', canManageShifts: false, scopeKey: 'pharmacist' }],
    ['Ali', { persona: 'otherstaff', canManageShifts: false, scopeKey: 'otherstaff' }],
    ['Zoe', { persona: 'explorer', canManageShifts: false, scopeKey: 'explorer' }],
  ]) {
    const { slots, render, submissions } = mountPostShift(Date, { surface, hasCapability: () => false });
    render();
    hydrateReview(slots, isoDayFromNow(5));
    const tree = render();
    const state = tree.find(n => n.type === 'ContentState');
    assert.equal(state?.props.kind, 'forbidden', name);
    assert.equal(postButton(tree), undefined, name + ' has no Post control');
    assert.equal(submissions.length, 0, name);
  }
});

const pharmacyA = { id: 7, name: 'Pharmacy A', allowed_escalation_levels: ['FULL_PART_TIME', 'LOCUM_CASUAL'] };
function editShift(id, pharmacy, description) {
  return { id, pharmacy: pharmacy.id, pharmacy_detail: pharmacy, role_needed: 'PHARMACIST', employment_type: 'LOCUM',
    visibility: 'FULL_PART_TIME', description, rate_type: 'FLEXIBLE',
    slots: [{ date: isoDayFromNow(5), start_time: '09:00', end_time: '17:00' }] };
}
// Step modules are mocked as { default: name }; the screen's default import keeps that object as the element type.
const detailsStep = tree => tree.find(n => n.type?.default === 'PostShiftDetailsStep').props;
const shown = (tree, text) => tree.some(n => Object.values(n.props || {}).some(v => [].concat(v).includes(text)));

test('R admin_edit_scope: Dee scoped to A opening a B shift edit is refused without hydrating or patching', async () => {
  const refusal = 'You do not have access to this shift.';
  const b = { id: 8, name: 'Pharmacy B', allowed_escalation_levels: ['FULL_PART_TIME'] };
  const dee = mountPostShift(Date, { effects: true, params: { edit: '55' }, pharmacies: [pharmacyA],
    surface: { persona: 'admin', scopeKey: 'admin:7', scopedPharmacyId: 7 },
    shift: id => editShift(id, b, 'B secret notes') });
  dee.render();
  const tree = await dee.flush();
  assert.ok(shown(tree, refusal), 'the refusal text is on screen');
  assert.equal(dee.backs.length, 1, 'goes back once');
  assert.equal(JSON.stringify(dee.slots).includes('B secret notes'), false, 'no field holds B data');
  assert.notEqual(dee.slots[2], 8, 'B pharmacy never selected');
  assert.equal(postButton(tree), undefined);
  assert.equal(tree.some(n => n.type === 'Button' && n.props.children === 'Update Shift'), false, 'no update control');
  assert.equal(dee.updates.length, 0);
});

test('C admin_edit_scope: Dee editing an A shift and Tom editing his own shift hydrate and patch once', async () => {
  for (const [name, surface] of [
    ['Dee', { persona: 'admin', scopeKey: 'admin:7', scopedPharmacyId: 7 }],
    ['Tom', { persona: 'owner', scopeKey: 'owner', scopedPharmacyId: null }],
  ]) {
    const screen = mountPostShift(Date, { effects: true, params: { edit: '56' }, pharmacies: [pharmacyA], surface,
      shift: id => editShift(id, pharmacyA, 'A notes') });
    screen.render();
    let tree = await screen.flush();
    const details = detailsStep(tree);
    assert.equal(details.pharmacyId, 7, name + ' hydrated pharmacy');
    assert.equal(details.description, 'A notes', name + ' hydrated description');
    assert.equal(screen.backs.length, 0, name);
    screen.slots[45] = 'review';
    tree = screen.render();
    const update = tree.find(n => n.type === 'Button' && n.props.children === 'Update Shift');
    assert.ok(update, name + ' has Update Shift');
    const first = update.props.onPress(), second = update.props.onPress();
    await Promise.all([first, second]);
    assert.equal(screen.updates.length, 1, name + ' patches once');
    assert.equal(screen.updates[0][0], 56, name);
  }
});

test('C templates: per pharmacy+role list, auto-fill once, use, upsert save and delete with stale-scope guards', async () => {
  const lists = [], saves = [], deletes = [];
  let finishSave;
  const stored = { '7:PHARMACIST': { id: 1, description: 'Saved A' }, '7:TECHNICIAN': { id: 3, description: 'Tech saved' } };
  const screen = mountPostShift(Date, { effects: true,
    pharmacies: [pharmacyA, { id: 9, name: 'Pharmacy C', allowed_escalation_levels: ['FULL_PART_TIME'] }],
    api: {
      listShiftDescriptionTemplates: async (pharmacy, role) => {
        lists.push(`${pharmacy}:${role}`);
        return stored[`${pharmacy}:${role}`] ? [stored[`${pharmacy}:${role}`]] : [];
      },
      saveShiftDescriptionTemplate: (pharmacy, role, description) => {
        saves.push([pharmacy, role, description]);
        return new Promise(resolve => { finishSave = () => resolve({ id: 1, description }); });
      },
      deleteShiftDescriptionTemplate: async id => { deletes.push(id); },
    } });
  const toast = tree => tree.find(n => n.type === 'Snackbar')?.props.children;
  screen.render();
  let tree = await screen.flush();
  assert.deepEqual(lists, ['7:PHARMACIST']);
  assert.equal(detailsStep(tree).description, 'Saved A', 'auto-filled');
  detailsStep(tree).setDescription('Mine');
  tree = await screen.flush();
  assert.equal(detailsStep(tree).description, 'Mine', 'the user edit is kept, not refilled');
  assert.deepEqual(lists, ['7:PHARMACIST'], 'no refetch per keystroke');
  detailsStep(tree).handleUseDescriptionTemplate();
  tree = await screen.flush();
  assert.equal(detailsStep(tree).description, 'Saved A', 'Use saved description');
  detailsStep(tree).setRoleNeeded('TECHNICIAN');
  tree = await screen.flush();
  assert.deepEqual(lists, ['7:PHARMACIST', '7:TECHNICIAN'], 'listed per pharmacy+role');
  assert.equal(detailsStep(tree).descriptionTemplate.id, 3, 'the role template is offered');
  assert.equal(detailsStep(tree).description, 'Saved A', 'a new scope template never overwrites existing text');
  detailsStep(tree).setRoleNeeded('PHARMACIST');
  tree = await screen.flush();
  detailsStep(tree).setDescription('Updated');
  tree = await screen.flush();
  void detailsStep(tree).handleSaveDescriptionTemplate();
  finishSave();
  tree = await screen.flush();
  assert.deepEqual(saves, [[7, 'PHARMACIST', 'Updated']]);
  assert.equal(detailsStep(tree).descriptionTemplate.description, 'Updated');
  assert.equal(toast(tree), 'Description template saved for this role');
  // Switch pharmacy while a save is deferred: its result must not land in the new scope.
  void detailsStep(tree).handleSaveDescriptionTemplate();
  detailsStep(screen.render()).setPharmacyId(9);
  tree = await screen.flush();
  finishSave();
  tree = await screen.flush();
  assert.deepEqual(saves.map(s => s[0]), [7, 7], 'no write to the new scope');
  assert.equal(detailsStep(tree).descriptionTemplate, null, 'scope 9 shows no template');
  assert.equal(detailsStep(tree).descriptionTemplateSaving, false);
  // Delete: a confirm opened in one scope is ignored after a switch; in scope it deletes once and keeps the text.
  detailsStep(tree).setPharmacyId(7);
  tree = await screen.flush();
  detailsStep(tree).handleDeleteDescriptionTemplate();
  detailsStep(screen.render()).setPharmacyId(9);
  tree = await screen.flush();
  screen.alerts.at(-1)[2].find(b => b.text === 'Delete template').onPress();
  assert.deepEqual(deletes, [], 'stale confirm deletes nothing');
  detailsStep(tree).setPharmacyId(7);
  tree = await screen.flush();
  detailsStep(tree).handleDeleteDescriptionTemplate();
  screen.alerts.at(-1)[2].find(b => b.text === 'Delete template').onPress();
  tree = await screen.flush();
  assert.deepEqual(deletes, [1]);
  assert.equal(detailsStep(tree).descriptionTemplate, null);
  assert.equal(detailsStep(tree).description, 'Updated', 'delete keeps the current description');
  assert.equal(toast(tree), 'Description template removed');
});

const stepNode = (tree, name) => tree.find(n => n.type?.default === name);
const textOf = n => [].concat(n.props?.children).filter(c => typeof c === 'string').join('');
test('R review_helper: the Review step shows the web helper above the board preview', () => {
  const { slots, render } = mountPostShift();
  render();
  hydrateReview(slots, isoDayFromNow(5));
  const tree = render();
  const helper = tree.findIndex(n => n.type === 'Text' && textOf(n).includes('This is how your shift appears on the job board. Go back to change anything.'));
  const preview = tree.findIndex(n => n.type?.default === 'NativeShiftBoardPreview');
  assert.ok(helper >= 0, 'helper shown');
  assert.ok(preview > helper, 'helper sits above the preview');
});

test('C header and progress: titles, step count, next label and jump-back rules (new vs edit)', async () => {
  const fresh = mountPostShift(Date, { effects: true, pharmacies: [pharmacyA] });
  fresh.render();
  let tree = await fresh.flush();
  assert.ok(tree.some(n => textOf(n) === 'Create a New Shift'));
  assert.ok(tree.some(n => textOf(n) === 'Follow the steps to post a new shift opportunity.'));
  const progress = stepNode(tree, 'PostShiftProgress').props;
  assert.deepEqual(Array.from(progress.steps), ['details', 'skills', 'visibility', 'timetable', 'payrate', 'review']);
  progress.onSelect('payrate');
  assert.equal(stepNode(fresh.render(), 'PostShiftProgress').props.active, 'details', 'a new form cannot jump ahead');
  fresh.slots[45] = 'payrate';
  stepNode(fresh.render(), 'PostShiftProgress').props.onSelect('skills');
  assert.equal(stepNode(fresh.render(), 'PostShiftProgress').props.active, 'skills', 'jump back to a done step');
  const edit = mountPostShift(Date, { effects: true, params: { edit: '56' }, pharmacies: [pharmacyA],
    shift: id => editShift(id, pharmacyA, 'A notes') });
  edit.render();
  tree = await edit.flush();
  assert.ok(tree.some(n => textOf(n) === 'Edit Shift'));
  stepNode(tree, 'PostShiftProgress').props.onSelect('review');
  assert.equal(stepNode(edit.render(), 'PostShiftProgress').props.active, 'review', 'editing may jump to any step');

  const Progress = load('frontend_mobile/roles/shared/shifts/PostShiftProgress.tsx', { ...common,
    'react-native': { ...native, Pressable: 'Pressable' },
    '@/constants/tokens': { ...tokens, colors: { ...tokens.colors, tone: { blue: {}, cyan: {}, magenta: {} } } },
    'lucide-react-native': new Proxy({}, { get: (_, name) => String(name) }) }, true).default;
  const selected = [];
  const all = nodes(Progress({ steps: ['details', 'skills', 'visibility', 'payrate', 'review'], active: 'skills', onSelect: step => selected.push(step) }));
  assert.ok(all.some(n => [].concat(n.props.children).join('') === 'Step 2 of 5'));
  assert.ok(all.some(n => [].concat(n.props.children).join('') === 'Next: Who sees it'));
  const segments = all.filter(n => n.type === 'Pressable');
  assert.equal(segments[0].props.accessibilityLabel, 'Go to Details');
  segments[0].props.onPress();
  assert.deepEqual(selected, ['details']);
  assert.equal(segments[2].props.disabled, true, 'future steps are not reachable');
  assert.equal(segments[2].props.onPress, undefined);
});

// UI-only setters (menus, pickers, calendar paging) are deliberately unwrapped and never mark the form dirty.
const UI_ONLY = new Set(['setPharmacyMenuVisible', 'setSlotDatePickerOpen', 'setRecurringEndPickerOpen', 'setEscalationPicker',
  'setEscalationTimePicker', 'setCalendarMonthAnchor']);
const DATA_HANDLERS = { toggleRecurringDay: [1], handleSlotRateChange: [0, '50'], handleUseDescriptionTemplate: [],
  removeSlot: [0], editSlot: [0], addManualSlot: [], addAllSelectedSlots: [], addSelectedDateSlot: [isoDayFromNow(6)] };
test('C unsaved baseline: every data setter handed to a step freezes the baseline; UI-only setters do not', async () => {
  const steps = { details: 'PostShiftDetailsStep', skills: 'PostShiftSkillsStep', visibility: 'PostShiftVisibilityStep',
    timetable: 'PostShiftTimetableStep', payrate: 'PostShiftPayRateStep' };
  let checked = 0;
  for (const [step, name] of Object.entries(steps)) {
    const probe = mountPostShift(Date, { effects: true, pharmacies: [pharmacyA] });
    probe.render(); await probe.flush();
    probe.slots[45] = step;
    const probeProps = stepNode(probe.render(), name).props;
    const keys = Object.keys(probeProps).filter(k => (/^set[A-Z]/.test(k) || k in DATA_HANDLERS) && typeof probeProps[k] === 'function');
    for (const key of keys) {
      const screen = mountPostShift(Date, { effects: true, pharmacies: [pharmacyA] });
      screen.render(); await screen.flush();
      screen.slots[45] = step;
      const props = stepNode(screen.render(), name).props;
      screen.cleans.length = 0;
      props[key](...(DATA_HANDLERS[key] ?? [current => current]));
      screen.render();
      if (UI_ONLY.has(key)) assert.ok(screen.cleans.length > 0, key + ' is UI-only and keeps following the baseline');
      else { assert.equal(screen.cleans.length, 0, key + ' must freeze the unsaved baseline'); checked++; }
    }
  }
  assert.ok(checked >= 40, 'covers the data setters of every step: ' + checked);
});

test('C keyboard: footer sits outside the scroll content inside the keyboard-aware view (iOS padding)', () => {
  const { slots, render } = mountPostShift(Date, { platform: { OS: 'ios' } });
  render();
  hydrateReview(slots, isoDayFromNow(5));
  const tree = render();
  const kav = tree.find(n => n.type === 'KeyboardAvoidingView');
  assert.equal(kav.props.behavior, 'padding');
  const inKav = nodes(kav.props.children);
  const scroll = inKav.find(n => n.type === 'ScrollView');
  assert.ok(inKav.includes(postButton(tree)), 'Post Shift is inside the keyboard-aware view');
  assert.equal(nodes(scroll.props.children).includes(postButton(tree)), false, 'and not scrolled away with the form');
});
