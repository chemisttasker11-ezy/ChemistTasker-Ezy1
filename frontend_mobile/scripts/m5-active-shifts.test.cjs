// M4-05: executable Shift Centre route/panel tests (no source-text assertions).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({ type, props: props || {}, key });
function load(relative, imports) {
  const baseFile = process.env.M5_BASE && path.join(process.env.M5_BASE, relative);
  const source = fs.readFileSync(baseFile && fs.existsSync(baseFile) ? baseFile : path.join(root, relative), 'utf8');
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


function cardFixture() {
  const noop = () => {};
  const tokens = { colors: {}, font: {}, radius: {}, space: {}, touch: {} };
  const card = 'Card';
  const PaperCard = Object.assign(function Card(props) { return jsx(card, props); }, { Content: 'Card.Content' });
  const helpers = load('roles/shared/shifts/ActiveShiftsPage/utils/shiftHelpers.ts', {});
  const runtime = load('roles/shared/shifts/ActiveShiftsPage/utils/activeShiftRuntime.ts', {});
  const candidate = load('roles/shared/shifts/ActiveShiftsPage/utils/candidateHelpers.ts', {});
  const audiencePath = path.resolve(root, '../shared-core/src/domains/shifts/audience.ts');
  const audienceSource = fs.readFileSync(audiencePath, 'utf8');
  const audienceModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(audienceSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
    { module: audienceModule, exports: audienceModule.exports });
  const icons = Object.fromEntries(['Store','Share2','Pencil','Trash2','MapPin','Calendar','Users','Heart','ChevronUp','CreditCard'].map(x => [x,x]));
  const imports = {
    react: { default: { Fragment: 'Fragment' } }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: x => x } },
    'react-native-paper': { Button: 'Button', Card: PaperCard, Checkbox: 'Checkbox', Divider: 'Divider', Text: 'Text' },
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'ActivityIndicator' },
    'lucide-react-native': icons, '@/components/ui/Pill': { Pill: 'Pill' }, '@/constants/tokens': tokens,
    '../ShiftTermsSummary': { ShiftTermsSummary: 'ShiftTermsSummary' }, '@chemisttasker/shared-core': audienceModule.exports,
    './components/Escalation/EscalationStepper': { default: 'EscalationStepper' },
    './components/Candidates/PublicLevelView': { default: 'PublicLevelView' },
    './components/Candidates/CommunityLevelView': { default: 'CommunityLevelView' },
    './components/CandidatesSkeleton': { default: 'CandidatesSkeleton' },
    './utils/shiftHelpers': helpers, './utils/candidateHelpers': candidate,
    './utils/displayHelpers': { getCardBorderColor: () => '' }, './utils/activeShiftRuntime': runtime,
    './theme': { customTheme: { colors: {}, spacing: {} } }, './styles': { styles: {} },
  };
  const component = load('roles/shared/shifts/ActiveShiftsPage/ActiveShiftCards.tsx', imports).default;
  const shift = { id: 12, visibility: 'FULL_PART_TIME', roleNeeded: 'PHARMACIST', employmentType: 'LOCUM', isUrgent: true,
    slots: [{ id: 34, date: '2026-11-07' }], paymentOptions: [{ offerId: 81, slotId: 34 }] };
  const state = { expandedShifts: new Set(), selectedLevelByShift: {}, selectedSlotByShift: {}, paymentSlotSelection: {},
    setPaymentSlotSelection: noop, pillPayingShiftId: null, sharingShiftId: null, actionLoading: {},
    slotHasUpdatesByShift: { 12: { 34: true } }, revealingInterestId: null, buzzLoadingOfferId: null, reviewLoadingId: null,
    setDeleteConfirmDialog: x => { state.dialog = x; }, setSelectedLevelByShift: noop };
  const actions = { getTabKey: (id, level) => `${id}:${level}`, resolveSlotId: runtime.resolveSlotIdAny,
    isDedicatedShift: () => false, toggleShiftExpansion: id => state.expandedShifts.has(id) ? state.expandedShifts.delete(id) : state.expandedShifts.add(id),
    handleShare: s => { state.shared = s.id; }, handleEditShift: s => { state.edited = s.id; } };
  const data = { orderedShifts: [shift], tabData: { '12:FULL_PART_TIME': { membersBySlot: { 34: [
    { userId: 1, status: 'interested' }, { userId: 2, status: 'interested' }, { userId: 1, status: 'interested' },
  ] } } }, counterOffersByShift: {}, counterOffersLoadingByShift: {} };
  return { shift, state, actions, data, component, render: () => component({ data, state, actions }) };
}
const findNodes = (tree, predicate) => collect(tree, predicate);
const labels = tree => findNodes(tree, n => n.type === 'Pill').map(n => n.props.label);
const button = (tree, label) => findNodes(tree, n => n.props && (n.props.accessibilityLabel === label || (n.type === 'Button' && n.props.children === label)))[0];
test('R audience_pill: internal and platform labels and reach hints', () => {
  const f = cardFixture(); let tree = f.render();
  assert.ok(labels(tree).includes('Internal \u00b7 My Pharmacy'));
  assert.ok(findNodes(tree, n => n.props?.accessibilityHint === 'Visible now to your full-time and part-time team. Escalate inside the card to reach more people.').length);
  f.shift.visibility = 'PLATFORM'; tree = f.render();
  assert.ok(labels(tree).includes('Platform \u00b7 ChemistTasker'));
  assert.ok(findNodes(tree, n => n.props?.accessibilityHint === 'Visible now to verified professionals across ChemistTasker.').length);
});
test('R status_pills_collapsed: unique interested, payment and new activity', () => {
  const shown = labels(cardFixture().render());
  for (const label of ['2 waiting for review', 'Payment required', 'New activity']) assert.ok(shown.includes(label), label);
});
test('R metrics_and_hints: metric names and accessible explanations', () => {
  const tree = cardFixture().render(); const shown = texts(tree);
  for (const label of ['Slots', 'Candidates', 'Interested']) assert.ok(shown.includes(label), label);
  for (const hint of ['Dates in this shift. Each date is filled separately.', 'Everyone who responded or was invited, across all dates and audiences.', 'Said yes or sent an offer, and are waiting for your review.']) assert.ok(findNodes(tree, n => n.props?.accessibilityHint === hint).length, hint);
});
test('R humanized_pills: role, employment and urgency', () => {
  const shown = labels(cardFixture().render());
  for (const label of ['Pharmacist', 'Locum', 'Urgent']) assert.ok(shown.includes(label), label);
});
test('R manage_candidates_toggle: expanded state and candidate workspace', () => {
  const f = cardFixture(); let tree = f.render();
  assert.equal(button(tree, 'Manage candidates').props.accessibilityState.expanded, false);
  button(tree, 'Manage candidates').props.onPress(); tree = f.render();
  assert.equal(button(tree, 'Hide candidates').props.accessibilityState.expanded, true);
  assert.ok(findNodes(tree, n => n.type === 'EscalationStepper').length);
  button(tree, 'Hide candidates').props.onPress();
  assert.equal(button(f.render(), 'Manage candidates').props.accessibilityState.expanded, false);
});
test('C card body and edit/delete actions retain their handlers', () => {
  const f = cardFixture(); const tree = f.render();
  button(tree, 'Edit shift').props.onPress({ stopPropagation() {} }); assert.equal(f.state.edited, 12);
  button(tree, 'Delete shift').props.onPress({ stopPropagation() {} }); assert.equal(f.state.dialog.shiftId, 12);
  findNodes(tree, n => n.type === 'TouchableOpacity' && !n.props.accessibilityLabel)[0].props.onPress();
  assert.equal(f.state.expandedShifts.has(12), true);
});
test('R share_label: share action retains its handler', () => {
  const f = cardFixture(); const share = button(f.render(), 'Share shift link');
  assert.ok(share); share.props.onPress({ stopPropagation() {} }); assert.equal(f.state.shared, 12);
});

function mountedActive(overrides = {}) {
  const card = cardFixture();
  const surface = { ready: true, scopeKey: 'owner:7', canManageShifts: true,
    persona: 'owner', scopedPharmacyId: 7, ...overrides.surface };
  const params = { ...overrides.params };
  const user = { id: 91, role: 'OWNER' };
  const calls = { posts: [], share: [], checkout: [], buzz: [], pills: [], tabLoads: [], alerts: [], rendered: [], reload: 0 };
  let settledCheckout;
  const waitCheckout = new Promise(resolve => { settledCheckout = resolve; });
  let settledBuzz;
  const waitBuzz = new Promise(resolve => { settledBuzz = resolve; });
  const stateSlots = [], refSlots = [], memoSlots = [], effectSlots = [];
  let stateIndex = 0, refIndex = 0, memoIndex = 0, effectIndex = 0, queued = [], dirty = false, instance = 0;
  // With overrides.effects, memo/callback/effect hooks follow React's dependency rules and a key change remounts.
  const changed = (prev, deps) => !prev || !deps || deps.length !== prev.length || deps.some((v, i) => !Object.is(v, prev[i]));
  const memo = (fn, deps) => {
    const i = memoIndex++;
    if (changed(memoSlots[i]?.deps, deps)) memoSlots[i] = { value: fn(), deps };
    return memoSlots[i].value;
  };
  const react = {
    useState(init) {
      const i = stateIndex++, owner = instance;
      if (!(i in stateSlots)) stateSlots[i] = typeof init === 'function' ? init() : init;
      return [stateSlots[i], value => {
        if (owner !== instance) return; // an unmounted instance's setState is a no-op
        const next = typeof value === 'function' ? value(stateSlots[i]) : value;
        if (!Object.is(next, stateSlots[i])) dirty = true;
        stateSlots[i] = next;
      }];
    },
    useRef(init) {
      const i = refIndex++;
      return refSlots[i] ||= { current: init };
    },
    useMemo: overrides.effects ? memo : fn => fn(),
    useCallback: overrides.effects ? (fn, deps) => memo(() => fn, deps) : fn => fn,
    useEffect: overrides.effects ? (fn, deps) => {
      const i = effectIndex++;
      if (changed(effectSlots[i]?.deps, deps)) queued.push([i, fn, deps]);
    } : () => {},
  };
  react.default = react;
  const t = {};
  const runtime = load('roles/shared/shifts/ActiveShiftsPage/utils/activeShiftRuntime.ts', t);
  const shiftHelpers = load('roles/shared/shifts/ActiveShiftsPage/utils/shiftHelpers.ts', t);
  const candidate = load('roles/shared/shifts/ActiveShiftsPage/utils/candidateHelpers.ts', t);
  const offerHelpers = load('roles/shared/shifts/ActiveShiftsPage/utils/offerHelpers.ts', t);
  const core = {
    payShiftWithPills: overrides.pills ?? (() => new Promise(() => {})),
    chargeShiftFulfillment: async (...args) => {
      calls.checkout.push(args);
      await waitCheckout;
      if (overrides.checkout) return overrides.checkout(...args);
      return {};
    },
    resumeFulfillmentCheckout: async () => ({}),
    expireFulfillmentCheckout: async () => ({}),
    normalizeShiftWorkProfile: profile => profile,
    buzzShiftOffer: async (...args) => { calls.buzz.push(args); await waitBuzz; return { detail: 'Reminder sent' }; },
  };
  const page = load('roles/shared/shifts/ActiveShiftsPage/index.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      Alert: { alert: (...args) => calls.alerts.push(args) }, View: 'View', ScrollView: 'ScrollView',
      Linking: { openURL: async () => {} },
    },
    'lucide-react-native': { Plus: 'Plus' },
    'react-native-paper': { Text: 'Text', Snackbar: 'Snackbar' },
    '@/components/ui': { ScalePressable: 'ScalePressable' },
    '@/constants/tokens': { colors: {} },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': {
      useLocalSearchParams: () => params,
      useRouter: () => ({ push: url => calls.posts.push(url) }),
    },
    '@react-native-async-storage/async-storage': {
      getItem: async () => null, setItem: async () => null,
    },
    '@/utils/pushNotifications': { subscribeShiftSlotActivity: () => ({ remove() {} }) },
    '@chemisttasker/shared-core': core,
    '@/context/AuthContext': { useAuth: () => ({ user }) },
    // overrides.fetchAll mounts the real data hook over mocked shared-core loaders.
    './hooks/useShiftsData': overrides.fetchAll ? load('roles/shared/shifts/ActiveShiftsPage/hooks/useShiftsData.ts', {
      react, '../utils/activeShiftRuntime': runtime,
      '@chemisttasker/shared-core': { fetchAllActiveShifts: overrides.fetchAll, fetchPosterShiftDetailService: overrides.fetchDetail },
    }) : {
      useShiftsData: () => ({
        shifts: overrides.shifts ?? [card.shift],
        setShifts: () => {},
        loading: Boolean(overrides.loading),
        error: overrides.error ?? null,
        loadShifts: async () => { calls.reload++; },
      }),
    },
    // overrides.memberStatus mounts the real tab-data hook over mocked shared-core loaders.
    './hooks/useTabData': overrides.memberStatus ? load('roles/shared/shifts/ActiveShiftsPage/hooks/useTabData.ts', {
      react, '../utils/shiftHelpers': shiftHelpers, '../utils/activeShiftRuntime': runtime,
      '@chemisttasker/shared-core': { fetchShiftMemberStatus: overrides.memberStatus, fetchShiftInterests: overrides.interests },
    }) : {
      useTabData: () => overrides.tabs ? {
        tabData: overrides.tabs.data,
        setTabData: update => { overrides.tabs.data = typeof update === 'function' ? update(overrides.tabs.data) : update; },
        loadTabDataForShift: async (s, level) => { calls.tabLoads.push([s.id, level]); },
      } : ({
        tabData: { '12_FULL_PART_TIME': card.data.tabData['12:FULL_PART_TIME'] },
        setTabData: () => {},
        loadTabDataForShift: async (s, level) => { calls.tabLoads.push([s.id, level]); },
      }),
    },
    './hooks/useCounterOffers': {
      useCounterOffers: () => ({
        counterOffersByShift: { 12: [] }, counterOffersLoadingByShift: {},
        counterOffersErrorByShift: {}, loadCounterOffers: async () => {},
        acceptOffer: async () => ({}), rejectOffer: async () => ({}),
        counterActionLoading: {}, updateOfferCache: () => {},
      }),
    },
    './hooks/useRevealInterest': {
      useRevealInterest: () => ({ revealInterest: async () => ({}), revealingInterestId: null }),
    },
    './hooks/useWorkerRatings': {
      useWorkerRatings: () => ({ summary: null, comments: [], page: 1, pageCount: 0,
        loadRatings: async () => {}, reset: () => {} }),
    },
    // overrides.escalate mounts the real action hook over a mocked escalate service.
    './hooks/useShiftActions': overrides.escalate ? load('roles/shared/shifts/ActiveShiftsPage/hooks/useShiftActions.ts', {
      react, '@chemisttasker/shared-core': { escalateShiftService: overrides.escalate },
    }) : {
      useShiftActions: () => ({
        actionLoading: {}, handleEscalate: async () => true,
        handleDelete: async () => true, handleAccept: overrides.handleAccept ?? (async () => ({})),
      }),
    },
    './hooks/useShareShift': {
      useShareShift: () => ({ sharingShiftId: null, handleShare: async s => { calls.share.push(s.id); } }),
    },
    '../useShiftSurface': { useShiftSurface: () => surface },
    '@/components/ui/ContentState': { ContentState: 'ContentState' },
    '@/components/ui/ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
    './components/Dialogs/CounterOfferDialog': { default: 'CounterOfferDialog' },
    './ActiveShiftCards': { default: props => {
      overrides.captureActions?.(props.actions);
      calls.rendered.push(props.data.orderedShifts.map(s => s.id));
      return card.component(props);
    } },
    './utils/shiftHelpers': shiftHelpers,
    './utils/candidateHelpers': candidate,
    './utils/offerHelpers': offerHelpers,
    './utils/activeShiftRuntime': runtime,
    './styles': { styles: {} },
  }).default;

  const expanded = (node, out = []) => {
    if (Array.isArray(node)) node.forEach(child => expanded(child, out));
    else if (node && typeof node === 'object') {
      if (typeof node.type === 'function') expanded(node.type(node.props), out);
      else {
        out.push(node);
        expanded(node.props?.children, out);
      }
    }
    return out;
  };
  let centreKey;
  function render() {
    for (let pass = 0; pass < 50; pass++) {
      stateIndex = 0; refIndex = 0; memoIndex = 0; effectIndex = 0; queued = []; dirty = false;
      const element = page({ title: 'Active Shifts' });
      if (overrides.effects && centreKey !== undefined && element.key !== centreKey) {
        effectSlots.forEach(slot => slot?.cleanup?.());
        stateSlots.length = refSlots.length = memoSlots.length = effectSlots.length = 0;
        instance++;
      }
      centreKey = element.key;
      const tree = expanded(element);
      for (const [i, fn, deps] of queued) {
        effectSlots[i]?.cleanup?.();
        effectSlots[i] = { deps, cleanup: fn() };
      }
      if (!dirty) return tree;
    }
    throw Error('Active shifts state never settled');
  }
  async function flush() {
    let tree;
    for (let k = 0; k < 10; k++) {
      await new Promise(resolve => setImmediate(resolve));
      tree = render();
    }
    return tree;
  }
  return { render, flush, calls, surface, params, finishCheckout: () => settledCheckout(), finishBuzz: () => settledBuzz(), card };
}

test('C mounted ActiveShiftsPage renders the real cards with audience, metrics and review attention', () => {
  const h = mountedActive();
  let tree = h.render();
  assert.ok(tree.some(n => n.type === 'Text' && n.props.children === 'Active Shifts'));
  for (const label of ['Internal · My Pharmacy', '2 waiting for review', 'Payment required']) {
    assert.ok(tree.some(n => n.type === 'Pill' && n.props.label === label), label);
  }
  for (const label of ['Slots', 'Candidates', 'Interested']) {
    assert.ok(tree.some(n => n.type === 'Text' && n.props.children === label), label);
  }
  const toggle = tree.find(n => n.type === 'Button' && n.props.children === 'Manage candidates');
  assert.ok(toggle && toggle.props.accessibilityState.expanded === false);
  toggle.props.onPress();
  tree = h.render();
  assert.ok(tree.some(n => n.type === 'EscalationStepper'), 'the actual card opens the candidate workspace');
  assert.ok(tree.some(n => n.type === 'Button' && n.props.children === 'Hide candidates'));
});

test('C mounted ActiveShiftsPage renders correct empty/error/permission states without cards', () => {
  for (const [opts, kind, title] of [
    [{ shifts: [] }, 'empty', 'No active shifts'],
    [{ error: 'Network unavailable' }, 'error', 'Active shifts did not load'],
    [{ surface: { canManageShifts: false } }, 'forbidden', 'No shift management access'],
  ]) {
    const h = mountedActive(opts);
    const tree = h.render();
    const status = tree.find(n => n.type === 'ContentState');
    assert.ok(status, `expected mounted ${kind}`);
    assert.equal(status.props.kind, kind);
    assert.equal(status.props.title, title);
    assert.equal(tree.some(n => n.type === 'Pill'), false);
    if (kind === 'error') {
      status.props.onAction();
      assert.equal(h.calls.reload, 1);
    }
  }
});

// The pay controls are touchables wrapping a Text label, so match on the label they contain.
const touchableWith = (tree, pattern) => tree.filter(n => n.type === 'TouchableOpacity' &&
  collect(n.props.children, c => c.type === 'Text' && pattern.test([].concat(c.props.children).join(''))).length);
test('C mounted ActiveShiftsPage keeps rapid payment taps single-flight', async () => {
  const shift = { id: 12, visibility: 'FULL_PART_TIME', roleNeeded: 'PHARMACIST', employmentType: 'LOCUM',
    slots: [{ id: 34, date: '2026-11-20' }, { id: 35, date: '2026-11-21' }],
    paymentOptions: [{ offerId: 81, slotId: 34 }, { offerId: 82, slotId: 34 }, { offerId: 83, slotId: 35 }] };
  const h = mountedActive({ shifts: [shift] });
  let tree = h.render();
  assert.ok(tree.find(n => n.type === 'Card'), 'real active card is mounted');
  tree.find(n => n.type === 'Button' && n.props.children === 'Manage candidates').props.onPress();
  tree = h.render();
  const [checkout] = touchableWith(tree, /Pay selected with Stripe/);
  assert.ok(checkout, 'a payable shift must render the Stripe control');
  assert.notEqual(checkout.props.disabled, true);
  checkout.props.onPress(); checkout.props.onPress();
  assert.equal(h.calls.checkout.length, 1, 'rapid taps create one checkout attempt');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.checkout[0])), [12, { offerIds: [81, 83], platform: 'mobile' }],
    'one default offer per slot is charged on the mobile platform');
  h.finishCheckout();
  await new Promise(resolve => setImmediate(resolve));
  touchableWith(h.render(), /Offer #82/)[0].props.onPress();
  touchableWith(h.render(), /Pay selected with Stripe/)[0].props.onPress();
  assert.equal(h.calls.checkout.length, 2, 'a settled checkout releases the lock for the next payment');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.checkout[1])), [12, { offerIds: [83, 82], platform: 'mobile' }],
    'the row the poster picked replaces the other offer on the same slot');
});

test('R mounted M5-02 Buzz action does not double-send from same render', async () => {
  let actions;
  const h=mountedActive({captureActions: captured=>{actions=captured;}});
  h.render();
  assert.equal(typeof actions.handleBuzzWorker,'function');
  const first=actions.handleBuzzWorker(901);
  const second=actions.handleBuzzWorker(901);
  assert.equal(h.calls.buzz.length,1,'a second immediate tap must not send a duplicate reminder');
  h.finishBuzz();
  await Promise.all([first,second]);
  await actions.handleBuzzWorker(0);
  assert.equal(h.calls.buzz.length,1,'invalid offers cannot send reminders');
  await actions.handleBuzzWorker(901);
  assert.equal(h.calls.buzz.length,2,'completed reminder permits an explicit later retry');
});

function twoSlotOffer() {
  const shift = { id: 12, visibility: 'FULL_PART_TIME', roleNeeded: 'PHARMACIST', employmentType: 'LOCUM',
    slots: [{ id: 201, date: '2026-11-20' }, { id: 202, date: '2026-11-21' }], paymentOptions: [] };
  const member = slotId => ({ userId: 87, slotId, status: 'interested', displayName: 'Wren Worker' });
  const tabs = { data: { '12_FULL_PART_TIME': { loading: false, error: null,
    members: [member(201), member(202)], membersBySlot: { 201: [member(201)], 202: [member(202)] } } } };
  let release;
  const accepted = new Promise(resolve => { release = resolve; });
  let actions;
  const h = mountedActive({ shifts: [shift], tabs, handleAccept: async () => { await accepted; return { offerId: 555 }; },
    captureActions: captured => { actions = captured; } });
  h.render();
  const dialog = () => h.render().find(n => n.type === 'CounterOfferDialog');
  return { shift, member, tabs, h, dialog, release: () => release(), actions: () => actions };
}
test('R slot-specific offer: assigning W to slot A leaves W on slot B unpatched', async () => {
  const f = twoSlotOffer();
  await f.actions().handleReviewCandidate(f.shift, f.member(201), null, 201);
  assert.equal(f.dialog().props.slotId, 201);
  const assign = f.dialog().props.onAssign(87, 201);
  f.release(); await assign;
  const data = f.tabs.data['12_FULL_PART_TIME'];
  assert.equal(data.membersBySlot[201][0].pendingOfferId, 555, 'slot A shows its pending offer');
  assert.equal(data.membersBySlot[202][0].pendingConfirmation, undefined, 'slot B must not be marked pending');
  assert.equal(data.members.find(m => m.slotId === 202).pendingConfirmation, undefined, 'flat slot B record stays clean');
  assert.equal(data.members.find(m => m.slotId === 201).pendingConfirmation, true);
  await f.actions().handleReviewCandidate(f.shift, data.membersBySlot[202][0], null, 202);
  assert.equal(f.dialog().props.candidate.pendingConfirmation, false, 'slot B dialog still offers Assign');
});
test('R slot-specific offer: a slot A result must not change an open slot B dialog', async () => {
  const f = twoSlotOffer();
  await f.actions().handleReviewCandidate(f.shift, f.member(201), null, 201);
  const assign = f.dialog().props.onAssign(87, 201);
  await f.actions().handleReviewCandidate(f.shift, f.member(202), null, 202);
  f.release(); await assign;
  assert.equal(f.dialog().props.slotId, 202);
  assert.equal(f.dialog().props.candidate.pendingConfirmation, false);
  assert.equal(f.dialog().props.candidate.pendingOfferId, null);
});
test('C slot-specific offer: the assigned slot dialog shows its pending offer', async () => {
  const f = twoSlotOffer();
  await f.actions().handleReviewCandidate(f.shift, f.member(201), null, 201);
  const assign = f.dialog().props.onAssign(87, 201);
  f.release(); await assign;
  assert.equal(f.dialog().props.candidate.pendingConfirmation, true);
  assert.equal(f.dialog().props.candidate.pendingOfferId, 555);
});

function escalationShift() {
  return { id: 12, visibility: 'FULL_PART_TIME', roleNeeded: 'PHARMACIST', employmentType: 'LOCUM',
    allowedEscalationLevels: ['FULL_PART_TIME', 'LOCUM_CASUAL', 'PLATFORM'], slots: [{ id: 34, date: '2026-11-20' }], paymentOptions: [] };
}
function openWorkspace(h) {
  h.render().find(n => n.type === 'Button' && n.props.children === 'Manage candidates').props.onPress();
  return h.render().find(n => n.type === 'EscalationStepper').props;
}
const snackbarText = tree => tree.find(n => n.type === 'Snackbar' && n.props.visible)?.props.children;
test('C escalation: locked level is refused locally, success reloads, server refusal keeps the level', async () => {
  const sent = [];
  let outcome = async () => ({});
  for (const surface of [{}, { persona: 'admin', scopeKey: 'admin:7', scopedPharmacyId: 7 }]) {
    const h = mountedActive({ shifts: [escalationShift()], surface, escalate: (...args) => { sent.push(args); return outcome(); } });
    sent.length = 0; outcome = async () => ({});
    let stepper = openWorkspace(h);
    h.calls.tabLoads.length = 0;
    stepper.onSelectLevel('PLATFORM');
    assert.equal(snackbarText(h.render()), 'Escalate to this level to review members status.');
    assert.deepEqual(sent, [], 'a locked level never calls the server');
    assert.deepEqual(h.calls.tabLoads, []);
    await stepper.onEscalate(escalationShift(), 'LOCUM_CASUAL');
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [[12, { targetVisibility: 'LOCUM_CASUAL' }]], 'one escalate call (Dee too)');
    assert.deepEqual(h.calls.tabLoads, [[12, 'LOCUM_CASUAL']], 'reloads the new level');
    assert.equal(h.calls.reload, 1, 'reloads shifts');
    stepper = h.render().find(n => n.type === 'EscalationStepper').props;
    assert.equal(stepper.selectedLevel, 'LOCUM_CASUAL');
    outcome = async () => { throw Object.assign(new Error('Permission denied.'), { status: 403 }); };
    await stepper.onEscalate(escalationShift(), 'PLATFORM');
    const tree = h.render();
    assert.equal(snackbarText(tree), 'Failed to escalate shift', 'web shows the same failure text');
    assert.equal(tree.find(n => n.type === 'EscalationStepper').props.selectedLevel, 'LOCUM_CASUAL', 'level unchanged');
    assert.equal(h.calls.reload, 1, 'no reload after a refusal');
    assert.equal(h.calls.tabLoads.length, 1);
  }
});
test('C payment box: Pills pays the selected offers once and each payable row shows Payment pending', async () => {
  let finish;
  const shift = { id: 12, visibility: 'FULL_PART_TIME', roleNeeded: 'PHARMACIST', employmentType: 'LOCUM',
    slots: [{ id: 34, date: '2026-11-20' }, { id: 35, date: '2026-11-21' }],
    paymentOptions: [{ offerId: 81, slotId: 34 }, { offerId: 82, slotId: 34 }, { offerId: 83, slotId: 35 }] };
  const h = mountedActive({ shifts: [shift], pills: (...args) => { h.calls.pills.push(args); return new Promise(r => { finish = r; }); } });
  h.render().find(n => n.type === 'Button' && n.props.children === 'Manage candidates').props.onPress();
  let tree = h.render();
  assert.equal(tree.filter(n => n.type === 'Pill' && n.props.label === 'Payment pending').length, 3);
  touchableWith(tree, /Offer #82/)[0].props.onPress();
  const [pills] = touchableWith(h.render(), /Pay selected with Pills/);
  assert.ok(pills, 'Pills control rendered');
  pills.props.onPress(); pills.props.onPress();
  assert.equal(h.calls.pills.length, 1, 'single-flight');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.pills[0])), [12, [83, 82]], 'the selected offer per slot');
  finish({ detail: 'Paid' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(snackbarText(h.render()), 'Paid');
  assert.equal(h.calls.reload, 1);
});
test('C personas: Sam (no shift management) never mounts the candidate workspace', () => {
  const h = mountedActive({ shifts: [escalationShift()], surface: { persona: 'admin', canManageShifts: false, scopeKey: 'admin:7' } });
  const tree = h.render();
  assert.equal(tree.find(n => n.type === 'ContentState')?.props.kind, 'forbidden');
  assert.equal(tree.some(n => n.type === 'EscalationStepper' || n.type === 'Card'), false);
  assert.deepEqual(h.calls.tabLoads, [], 'no member-status loads');
});
function countedDataHooks() {
  const sent = { shifts: 0, members: 0, interests: 0 };
  return { sent, effects: true,
    fetchAll: async () => { sent.shifts++; return [{ ...escalationShift(), pharmacy: 7 }]; },
    memberStatus: async () => { sent.members++; return []; },
    interests: async () => { sent.interests++; return []; } };
}
test('R personas: Sam with both real data hooks requests no active shifts, member status or interests', async () => {
  const hooks = countedDataHooks();
  const h = mountedActive({ ...hooks, surface: { persona: 'admin', canManageShifts: false, scopeKey: 'admin:7', scopedPharmacyId: 7 } });
  const tree = await h.flush();
  assert.equal(tree.find(n => n.type === 'ContentState')?.props.kind, 'forbidden');
  assert.equal(tree.some(n => n.type === 'EscalationStepper' || n.type === 'Card'), false);
  assert.deepEqual(hooks.sent, { shifts: 0, members: 0, interests: 0 }, 'zero fetchAllActiveShifts / fetchShiftMemberStatus / fetchShiftInterests calls');
});
test('C personas: owner and Dee with both real data hooks load shifts and member status', async () => {
  for (const surface of [{}, { persona: 'admin', scopeKey: 'admin:7', scopedPharmacyId: 7 }]) {
    const hooks = countedDataHooks();
    const h = mountedActive({ ...hooks, surface });
    const tree = await h.flush();
    assert.ok(tree.some(n => n.type === 'Card'), 'shift card rendered');
    assert.equal(hooks.sent.shifts, 1, 'one fetchAllActiveShifts call');
    assert.ok(hooks.sent.members >= 1, 'member status loaded for the shift slot');
  }
});

const plain = value => JSON.parse(JSON.stringify(value));
function linkedShift(extra = {}) {
  return { id: 12, visibility: 'PLATFORM', roleNeeded: 'PHARMACIST', employmentType: 'LOCUM', pharmacy: 7,
    allowedEscalationLevels: ['FULL_PART_TIME', 'PLATFORM'],
    slots: [{ id: 34, date: '2026-11-20' }, { id: 35, date: '2026-11-21' }], paymentOptions: [], ...extra };
}
test('C deep links: shift_id + slot_id expand that shift and select that slot', async () => {
  const h = mountedActive({ effects: true, shifts: [linkedShift()], params: { shift_id: '12', slot_id: '35' } });
  const tree = await h.flush();
  assert.ok(tree.some(n => n.type === 'Button' && n.props.children === 'Hide candidates'), 'linked shift is expanded');
  assert.equal(tree.find(n => n.type === 'PublicLevelView').props.slotId, 35, 'linked slot selected');
});
test('C deep links: a new notification_id reloads exactly once', async () => {
  const fetches = [];
  const h = mountedActive({ effects: true, params: { notification_id: 'n1' },
    fetchAll: async () => { fetches.push(1); return [linkedShift()]; } });
  await h.flush();
  assert.equal(fetches.length, 1);
  await h.flush();
  assert.equal(fetches.length, 1, 'rerender with the same notification does not reload');
  h.params.notification_id = 'n2';
  await h.flush();
  assert.equal(fetches.length, 2, 'a new notification reloads once');
});
test('C deep links: dedicated shifts are listed first under Direct / Private Offers', () => {
  const h = mountedActive({ shifts: [linkedShift(), linkedShift({ id: 14, dedicatedUser: 88 })] });
  const tree = h.render();
  assert.deepEqual(plain(h.calls.rendered.at(-1)), [14, 12]);
  const heading = tree.findIndex(n => n.type === 'Text' && n.props.children === 'Direct / Private Offers');
  assert.ok(heading >= 0, 'private section heading shown');
  assert.equal(tree.filter(n => n.type === 'Text' && n.props.children === 'Direct / Private Offers').length, 1);
  assert.ok(heading < tree.findIndex(n => n.type === 'Card'), 'heading sits above the first (private) card');
});
test('C deep links: a checkout conflict keeps its three choices', async () => {
  const shift = linkedShift({ visibility: 'FULL_PART_TIME', paymentOptions: [{ offerId: 81, slotId: 34 }] });
  const h = mountedActive({ shifts: [shift], checkout: async () => {
    throw Object.assign(new Error('conflict'), { status: 409, payload: { checkout_id: 'c1' } });
  } });
  h.render().find(n => n.type === 'Button' && n.props.children === 'Manage candidates').props.onPress();
  touchableWith(h.render(), /Pay selected with Stripe/)[0].props.onPress();
  h.finishCheckout();
  for (let k = 0; k < 5; k++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.alerts.length, 1);
  assert.equal(h.calls.alerts[0][0], 'Checkout already in progress');
  assert.deepEqual(plain(h.calls.alerts[0][2].map(b => b.text)), ['Cancel', 'Expire unpaid and replace', 'Continue existing']);
});

test('C scope: Dee scoped to A sees only A rows', async () => {
  const h = mountedActive({ effects: true, surface: { persona: 'admin', scopeKey: 'admin:7', scopedPharmacyId: 7 },
    fetchAll: async () => [linkedShift(), linkedShift({ id: 13, pharmacy: 8 })] });
  await h.flush();
  assert.deepEqual(plain(h.calls.rendered.at(-1)), [12]);
  assert.equal(h.calls.rendered.some(ids => ids.includes(13)), false, 'B row never rendered');
});
test('R scope: Sam gets the forbidden state and never loads active shifts', async () => {
  const fetches = [];
  const h = mountedActive({ effects: true, surface: { persona: 'admin', canManageShifts: false, scopeKey: 'admin:7', scopedPharmacyId: 7 },
    fetchAll: async () => { fetches.push(1); return [linkedShift()]; } });
  const tree = await h.flush();
  assert.equal(tree.find(n => n.type === 'ContentState')?.props.kind, 'forbidden');
  assert.equal(fetches.length, 0, 'zero fetchAllActiveShifts calls');
});
test('C scope: switching Tom -> Nadia while Tom\'s load is deferred never renders Tom\'s rows', async () => {
  const pending = {};
  const h = mountedActive({ effects: true, surface: { persona: 'owner', scopeKey: 'owner:91', scopedPharmacyId: null },
    fetchAll: () => new Promise(resolve => { pending[h.surface.scopeKey] = resolve; }) });
  await h.flush();
  assert.ok(pending['owner:91'], 'Tom load in flight');
  Object.assign(h.surface, { scopeKey: 'owner:92' });
  await h.flush();
  assert.ok(pending['owner:92'], 'Nadia load in flight');
  pending['owner:91']([linkedShift({ id: 501 })]);
  await h.flush();
  pending['owner:92']([linkedShift({ id: 601 })]);
  await h.flush();
  assert.equal(h.calls.rendered.some(ids => ids.includes(501)), false, 'Tom rows never rendered');
  assert.deepEqual(plain(h.calls.rendered.at(-1)), [601]);
});
