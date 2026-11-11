// M4-02: real native finance screens, full-module transpilation, platform boundaries only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');

const repo = path.resolve(__dirname, '../..');
const jsx = (type, props) => ({ type, props: props || {} });
const later = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
// Execute the real shared-core ApiError, including its status contract.
const { ApiError } = compile('shared-core/src/transport/errors.ts', {
  '../domains/onboarding/ahpra': { reportAhpraError: () => null },
});
const refusal = status => new ApiError('Managed invoice unavailable', status,
  { detail: 'Finance invoice not accessible' });

function compile(relative, modules) {
  const source = fs.readFileSync(path.join(repo, relative), 'utf8');
  const output = ts.transpileModule(source, { fileName: relative,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, Date, URL, URLSearchParams, Blob, console,
    TextEncoder, Uint8Array, setTimeout, clearTimeout,
    require(name) {
      if (!Object.prototype.hasOwnProperty.call(modules, name)) {
        throw Error('Unmocked finance import: ' + name + ' from ' + relative);
      }
      return modules[name];
    },
  }, { filename: relative });
  return module.exports;
}

function createHooks() {
  const fibers = new Map(), pendingEffects = [];
  let active, cursor = 0;
  const equal = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  const react = {
    useState(initial) {
      const id = cursor++, slots = active.slots;
      if (!(id in slots)) slots[id] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[id].value, update => {
        slots[id].value = typeof update === 'function' ? update(slots[id].value) : update;
      }];
    },
    useRef(value) {
      const id = cursor++, slots = active.slots;
      if (!(id in slots)) slots[id] = { current: value };
      return slots[id];
    },
    useMemo(fn, deps) {
      const id = cursor++, slots = active.slots;
      if (!(id in slots) || !equal(slots[id].deps, deps)) slots[id] = { value: fn(), deps };
      return slots[id].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const id = cursor++, fiber = active, prior = fiber.effects.get(id);
      if (!prior || !equal(prior.deps, deps)) {
        pendingEffects.push(() => {
          prior?.cleanup?.();
          fiber.effects.set(id, { deps, cleanup: effect() });
        });
      }
    },
  };
  react.default = react;
  function flatten(node, key = 'root', result = []) {
    if (Array.isArray(node)) node.forEach((child, i) => flatten(child, key + '.' + i, result));
    else if (node && typeof node === 'object') {
      if (typeof node.type === 'function') {
        const fiberKey = key + ':' + node.type.name + ':' + String(node.props.key ?? '');
        if (!fibers.has(fiberKey)) fibers.set(fiberKey, { slots: [], effects: new Map() });
        const last = active, lastCursor = cursor;
        active = fibers.get(fiberKey); cursor = 0;
        const child = node.type(node.props);
        active = last; cursor = lastCursor;
        flatten(child, fiberKey, result);
      } else {
        result.push(node);
        flatten(node.props?.children, key + '.children', result);
      }
    }
    return result;
  }
  function render(component, props) {
    return flatten(jsx(component, props));
  }
  async function flush() {
    while (pendingEffects.length) pendingEffects.shift()();
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  async function settled(component, props) {
    for (let i = 0; i < 5; i++) { render(component, props); await flush(); }
    return render(component, props);
  }
  function unmount() {
    for (const f of fibers.values()) for (const e of f.effects.values()) e.cleanup?.();
    fibers.clear(); pendingEffects.length = 0;
  }
  return { react, render, flush, settled, unmount };
}
const text = node => typeof node === 'string' || typeof node === 'number'
  ? String(node) : Array.isArray(node) ? node.map(text).join(' ')
  : node && typeof node === 'object' ? text(node.props?.children) : '';
const button = (nodes, label) => nodes.find(node =>
  node.type === 'Button' && text(node).trim() === label);

function invoiceScreen(config = {}) {
  const h = createHooks(), calls = [], navigated = [];
  const state = { id: '48', userId: 701, role: 'pharmacist' };
  const router = { replace: destination => navigated.push(destination),
    back() {} };
  const core = {
    finance: {
      invoice: async id => { calls.push(['managed', id, state.userId]); return config.managed?.(id, state.userId); },
      receivedInvoice: async id => { calls.push(['received', id, state.userId]); return config.managed?.(id, state.userId); },
    },
    getInvoiceDetail: async id => {
      calls.push(['legacy', id, state.userId]);
      return config.legacy?.(id, state.userId) || { id, line_items: [], status: 'draft' };
    },
    reportInvoiceIssue: async () => {}, sendInvoiceEmail: async () => {},
    updateInvoice: async () => ({}),
  };
  const module = compile('frontend_mobile/roles/shared/invoices/InvoiceDetail.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ScrollView: 'ScrollView', View: 'View',
      StyleSheet: { create: v => v } },
    'react-native-paper': {
      Button: 'Button', Card: Object.assign('Card', { Content: 'CardContent' }),
      Chip: 'Chip', Divider: 'Divider', HelperText: 'HelperText',
      IconButton: 'IconButton', Snackbar: 'Snackbar', Text: 'Text', TextInput: 'TextInput',
    },
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'Spinner' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': {
      useLocalSearchParams: () => ({ id: state.id }),
      useRouter: () => router, useSegments: () => [state.role],
    },
    '@chemisttasker/shared-core': core,
    '@/context/AuthContext': { useAuth: () => ({ user: { id: state.userId } }) },
    './shareLegacyInvoicePdf': { shareLegacyInvoicePdf: async () => {} },
  });
  const render = () => h.settled(module.default, {});
  return { state, calls, navigated, render, unmount: h.unmount, flush: h.flush };
}

test('R: mobile managed 401/403/409/500/network is never a legacy-edit fallback', async () => {
  for (const error of [refusal(401), refusal(403), refusal(409), refusal(500), new Error('Network offline')]) {
    const app = invoiceScreen({ managed: () => Promise.reject(error),
      legacy: () => ({ id: 48, status: 'draft', line_items: [] }) });
    const nodes = await app.render();
    assert.equal(app.calls.some(call => call[0] === 'legacy'), false);
    assert.deepEqual(app.navigated, []);
    assert.ok(nodes.some(node => node.type === 'Text' &&
      /unable to load invoice/i.test(text(node))), 'recoverable error must be visible');
    app.unmount();
  }
});

test('C: mobile explicit managed 404 retains genuine legacy invoice editor, managed 200 redirects', async () => {
  const old = invoiceScreen({ managed: () => Promise.reject(refusal(404)),
    legacy: () => ({ id: 48, status: 'draft', line_items: [], reference: 'LEGACY-48' }) });
  const nodes = await old.render();
  assert.equal(old.calls.filter(c => c[0] === 'legacy').length, 1);
  assert.ok(nodes.some(node => node.type === 'Text' && /invoice #\s*48/i.test(text(node))));
  const modern = invoiceScreen({ managed: async () => ({ id: 48, number: 'MODERN-48' }) });
  await modern.render();
  assert.equal(modern.calls.some(c => c[0] === 'legacy'), false);
  assert.deepEqual(modern.navigated, ['/pharmacist/invoice?invoice=48']);
});

test('R: old managed result cannot navigate after account changes without changing invoice ID', async () => {
  const inFlight = later();
  const app = invoiceScreen({ managed: (_id, userId) =>
    userId === 701 ? inFlight.promise : Promise.reject(refusal(403)) });
  await app.render();
  app.state.userId = 702;
  await app.render();
  inFlight.resolve({ id: 48 });
  await app.flush();
  assert.deepEqual(app.navigated, []);
  assert.equal(app.calls.some(c => c[0] === 'legacy'), false);
  app.unmount();
});


test('C: both unavailable after explicit managed 404 displays failure and never opens editor', async () => {
  const app = invoiceScreen({ managed: async () => { throw refusal(404); },
    legacy: async () => { throw new ApiError('Legacy invoice missing', 404, { detail: 'Missing' }); } });
  const nodes = await app.render();
  assert.equal(app.calls.filter(call => call[0] === 'legacy').length, 1);
  assert.ok(nodes.some(n => n.type === 'Text' && /unable to load invoice/i.test(text(n))));
  assert.ok(button(nodes, 'Try again'), 'missing managed and legacy rows must allow retry');
  app.unmount();
});

test('C: received-mode identity is never exchanged for an issued invoice during account changes', async () => {
  const pending = later();
  const app = invoiceScreen({ managed: (_id, actor) =>
    actor === 701 ? pending.promise : Promise.reject(refusal(403)) });
  app.state.role = 'owner';
  await app.render();
  assert.ok(app.calls.some(([type]) => type === 'received'));
  assert.equal(app.calls.some(([type]) => type === 'managed'), false);
  app.state.userId = 702;
  await app.render();
  pending.resolve({ id: 48, number: 'OLD-RECEIVED' });
  await app.flush();
  assert.deepEqual(app.navigated, []);
  assert.equal(app.calls.some(([type]) => type === 'legacy'), false);
  app.unmount();
});

test('C: real 403 refusal preserves a visible retry and no legacy data is displayed', async () => {
  let attempts = 0;
  const app = invoiceScreen({ managed: async () => {
    attempts += 1;
    if (attempts === 1) throw refusal(403);
    return { id: 48, number: 'RETRY-48' };
  } });
  const nodes = await app.render();
  assert.ok(button(nodes, 'Try again'));
  assert.equal(app.calls.some(c => c[0] === 'legacy'), false);
  button(nodes, 'Try again').props.onPress();
  await app.render();
  assert.equal(attempts, 2);
  assert.deepEqual(app.navigated, ['/pharmacist/invoice?invoice=48']);
  app.unmount();
});

const invoice = (id, number) => ({
  id, invoice_id: id, number, version: 1, kind: 'invoice', status: 'sent',
  request_key: 'fixture-' + id, voided: false, balance: '80.00', paid: '30.00',
  payload: { customer: { name: 'ACME "Shop"' }, reference: 'M4', invoice_date: '2026-07-10',
    due_date: '2026-07-31', issuer_name: 'Worker', lines: [], super_mode: 'none' },
  calculation: { payable: '110.00', gst: '10.00', subtotal: '100.00' },
  revisions: [],
});
const expense = id => ({
  id, supplier: '=SUM(1,2)', description: 'Travel "A", room 2', incurred_on: '2026-07-10',
  paid_on: null, amount: '150.00', gst_amount: '13.64', business_use_percent: '75.00',
  gst_credit: '10.23', reference: 'M4', receipts: [],
});
const customer = () => ({
  id: 14, name: 'Customer A', legal_name: 'ACME', abn: '51824753556',
  email: 'account@example.test', payment_terms_days: 14,
  abn_checked_at: '2026-07-10T00:00:00Z',
  abn_result: { entity_name: 'ACME Group', entity_type: 'Private company',
    abn_status: 'Cancelled', abn_gst_registered: false },
});

function financeWorkspace(config = {}) {
  const h = createHooks(), state = { userId: 701, invoice: undefined, receivedMode: false }, shares = [], files = [], calls = [];
  let list = [invoice(1, 'INV-1'), invoice(51, 'INV-51')];
  const realCsv = fs.existsSync(path.join(repo, 'shared-core/src/domains/finance/csv.ts'))
    ? compile('shared-core/src/domains/finance/csv.ts', {}) : new Proxy({}, {
      get: () => () => { throw Error('M4 finance CSV helper absent on base'); },
    });
  class File {
    constructor(_cache, filename) { this.name = filename; this.uri = 'file:///cache/' + filename;
      this.deleted = false; files.push(this); }
    create() {}
    async write(value) { if (config.write) await config.write(); this.bytes = typeof value === 'string'
      ? new TextEncoder().encode(value) : value; }
    delete() { this.deleted = true; }
  }
  const sharing = { isAvailableAsync: async () => true,
    shareAsync: async (uri, opts) => { shares.push({ uri, opts }); } };
  const finance = {
    customers: async () => [customer()], items: async () => [],
    invoices: async () => list, expenses: async () => [expense(1), expense(51)],
    receivedInvoices: async () => [invoice(999, 'NADIA-RECEIVED')],
    lookupAbn: async id => { calls.push(['lookup', id]); return customer(); },
    worksheet: async () => ({ start: '2026-07-01', end: '2026-09-30', basis: 'cash',
      G1: '1000.00', '1A': '100.00', '1B': '20.00', estimated_gst_net: '80.00',
      excluded_legacy_invoice_count: 4, expenses_needing_evidence: [1],
      warnings: ['DRAFT estimate'], lodgement_ready: false }),
  };
  const modal = { GuardedModal: 'Modal' };
  const native = {
    Alert: { alert() {} }, RefreshControl: 'RefreshControl',
    ScrollView: 'ScrollView', View: 'View', KeyboardAvoidingView: 'KeyboardAvoidingView',
    Platform: { OS: 'ios' },
  };
  const paper = Object.fromEntries(['Button', 'Checkbox', 'Chip', 'IconButton', 'List',
    'Searchbar', 'Surface', 'Text', 'TextInput'].map(name => [name, name]));
  paper.List = { Item: 'ListItem' }; paper.Checkbox = { Item: 'CheckboxItem' };
  paper.useTheme = () => ({ colors: { background: '#fff', onSurfaceVariant: '#444',
    error: '#a00', surfaceVariant: '#eee' } });
  const palette = { colors: { textPrimary: '#000', textSecondary: '#333', surfaceBg: '#fff',
    border: '#eee', status: { red: { bg: '#fee', fg: '#c00' } } },
    font: { outfit: { medium: 'Outfit' } }, radius: { card: 12, control: 8 },
    space: { sm: 4, md: 8, lg: 16, '2xl': 32 }, touch: { min: 44 } };
  const module = compile('frontend_mobile/roles/shared/invoices/FinanceWorkspace.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/security/GuardedModal': modal,
    'react-native': native, 'react-native-paper': paper,
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'Spinner' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': {
      useRouter: () => ({ setParams() {}, replace() {} }),
      useLocalSearchParams: () => ({ invoice: state.invoice }),
    },
    'expo-file-system': { File, Paths: { cache: 'CACHE' } },
    'expo-sharing': sharing, '@chemisttasker/shared-core': {
      finance, financeStatus: row => row.status === 'sent' ? 'Sent' : row.status,
      financeToday: () => '2026-11-07', ...realCsv,
    },
    './FinanceInvoiceEditor': { __esModule: true, default: 'FinanceInvoiceEditor' },
    './receivedInvoicePolicy': { receivedInvoiceActions: () => ({
      approve: false, revise: false, paid: false }) },
    '@/features/parity/nativeFileBytes': { nativeFileBytes: config.bytes || (async blob => new Uint8Array(await blob.arrayBuffer())) },
    '@/constants/tokens': palette,
    '@/context/AuthContext': { useAuth: () => ({ user: { id: state.userId } }) },
    '@/components/ui/SegmentTabs': { SegmentTabs: 'SegmentTabs', tabPanelProps: () => ({}) },
    '@/components/ui/ResponsiveSegmentedButtons': {
      ResponsiveSegmentedButtons: 'ResponsiveSegmentedButtons' },
  });
  const render = () => h.settled(module.default, { receivedMode: state.receivedMode });
  return { h, state, files, shares, calls, finance, sharing, get list() { return list; },
    set list(value) { list = value; }, render };
}
const navigateTab = async (app, name) => {
  let nodes = await app.render();
  const tabs = nodes.find(n => n.type === 'SegmentTabs');
  assert.ok(tabs);
  tabs.props.onChange(name);
  return app.render();
};
const awaitAsyncWork = async (app, ready) => {
  for (let i = 0; i < 12 && !ready(); i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    await app.h.flush();
  }
  assert.ok(ready(), 'pending platform action must settle');
};
const click = async (app, label) => {
  const nodes = await app.render(), action = button(nodes, label);
  assert.ok(action, 'Missing native control ' + label);
  assert.equal(action.props.disabled === true, false, label + ' must be enabled');
  await action.props.onPress(); await app.h.flush();
};

test('logout unmount invalidates an in-flight private invoice PDF before another account mounts', async () => {
  const app = financeWorkspace(), pending = later();
  app.finance.pdf = () => pending.promise;
  await click(app, 'View invoice');
  const nodes = await app.render();
  button(nodes, 'Share PDF').props.onPress();
  await app.h.flush();
  app.h.unmount();
  const next = financeWorkspace();
  next.state.userId = 702;
  await next.render();
  pending.resolve(new Blob(['%PDF-1.4']));
  await app.h.flush();
  assert.equal(app.shares.length, 0);
  assert.ok(app.files.every(file => file.deleted));
  next.h.unmount();
});

test('invoice alias redirects each active persona to its canonical route with parameters', async () => {
  for (const [home, expected] of [['/owner/dashboard', '/owner/invoice'], ['/admin', '/admin/invoice'],
    ['/organization/dashboard', '/organization/invoice'], ['/pharmacist/dashboard', '/pharmacist/invoice'],
    ['/otherstaff/dashboard', '/otherstaff/invoice']]) {
    const h = createHooks(), redirects = [], user = { id: 1 }, params = { invoice: '51' };
    const router = { replace: value => redirects.push(value) };
    const page = compile('frontend_mobile/app/invoices.tsx', {
      react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
      '@/components/RootPageHeader': { RootPageHeader: 'Header' },
      '../roles/shared/invoices/InvoiceList': { default: 'InvoiceList' },
      '@/context/AuthContext': { useAuth: () => ({ user, isLoading: false }) },
      '@/utils/mobilePersona': { resolveInitialWorkspace: async () => home },
      'expo-router': { useRouter: () => router, useLocalSearchParams: () => params },
    });
    await h.settled(page.default, {});
    assert.equal(redirects.length, 1);
    assert.equal(redirects[0].pathname, expected);
    assert.equal(redirects[0].params.invoice, '51');
    h.unmount();
  }
});

test('canonical invoice screens retain received and issued persona modes', async () => {
  for (const role of ['owner', 'admin', 'organization', 'pharmacist', 'otherstaff']) {
    const h = createHooks();
    const module = compile('frontend_mobile/roles/shared/invoices/InvoiceList.tsx', {
      react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
      'react-native': { StyleSheet: { create: v => v } }, 'react-native-paper': {},
      '@/components/ui/BrandActivityIndicator': {}, 'react-native-safe-area-context': {},
      'expo-router': { useSegments: () => [role] }, '@chemisttasker/shared-core': {},
      './shareLegacyInvoicePdf': {}, './MobileInvoiceStats': {}, './FinanceWorkspace': { __esModule: true, default: 'FinanceWorkspace' },
      '@/context/AuthContext': {}, './invoiceStats': {},
      '@/constants/tokens': { colors: { status: { red: {} } }, font: { outfit: {} }, radius: {}, space: {}, touch: {} },
    });
    const nodes = await h.settled(module.default, {});
    assert.equal(nodes.find(n => n.type === 'FinanceWorkspace').props.receivedMode,
      ['owner', 'admin', 'organization'].includes(role), role);
    h.unmount();
  }
});

test('legacy PDF abandons stale downloads and removes files abandoned during write', async () => {
  for (const stage of ['download', 'write', 'success']) {
    const pending = later(), files = [], shares = [];
    let live = true;
    class File {
      constructor() { this.uri = 'file:///invoice.pdf'; files.push(this); }
      create() {}
      async write() { if (stage === 'write') await pending.promise; }
      delete() { this.deleted = true; }
    }
    const helper = compile('frontend_mobile/roles/shared/invoices/shareLegacyInvoicePdf.ts', {
      'expo-file-system': { File, Paths: { cache: 'cache' } },
      'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async uri => shares.push(uri) },
      '@chemisttasker/shared-core': { downloadInvoicePdf: () => stage === 'download' ? pending.promise : Promise.resolve('pdf') },
      '@/features/parity/nativeFileBytes': { nativeFileBytes: async () => new Uint8Array([37, 80, 68, 70, 45]) },
    });
    const work = helper.shareLegacyInvoicePdf(1, () => live);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    if (stage !== 'success') { live = false; pending.resolve('pdf'); }
    await work;
    assert.equal(shares.length, stage === 'success' ? 1 : 0, stage);
    assert.ok(files.every(file => file.deleted), stage);
  }
});

test('account and mode switches clear finance and review while ignoring old loads and history', async () => {
  for (const change of ['account', 'mode']) {
    const app = financeWorkspace(), oldLoad = later(), newLoad = later(), history = later();
    const original = invoice(1, 'OLD-INVOICE');
    original.revisions = [{ version: 2, invoice_status: 'sent', calculation: original.calculation }];
    app.list = [original];
    let nodes = await app.render();
    assert.ok(nodes.some(n => text(n) === 'OLD-INVOICE'));
    await click(app, 'View invoice');
    nodes = await app.render();
    assert.ok(nodes.some(n => n.type === 'Modal' && n.props.visible));
    app.finance.invoiceRevision = () => history.promise;
    button(nodes, 'View').props.onPress();
    await app.h.flush();
    app.finance.invoices = () => oldLoad.promise;
    nodes = await app.render();
    const refresh = nodes.find(n => n.type === 'ScrollView' && n.props.refreshControl);
    assert.ok(refresh, 'refresh starts a second old-scope load');
    refresh.props.refreshControl.props.onRefresh();
    await app.h.flush();
    app.finance.invoices = () => newLoad.promise;
    app.finance.receivedInvoices = () => newLoad.promise;
    if (change === 'account') app.state.userId = 702;
    else app.state.receivedMode = true;
    nodes = await app.render();
    assert.ok(nodes.some(n => n.type === 'Spinner' && n.props.accessibilityLabel === 'Loading finance records'));
    assert.ok(nodes.filter(n => n.type === 'Modal').every(n => !n.props.visible));
    assert.ok(!nodes.some(n => text(n).includes('OLD-INVOICE')));
    newLoad.resolve([invoice(4, 'NEW-INVOICE')]);
    nodes = await app.render();
    if (change === 'mode') nodes = await navigateTab(app, 'Received');
    assert.ok(nodes.some(n => text(n) === 'NEW-INVOICE'));
    oldLoad.resolve([invoice(3, 'STALE-LOAD')]);
    history.resolve({ ...invoice(1, 'STALE-HISTORY'), version: 2 });
    await app.h.flush();
    nodes = await app.render();
    assert.ok(nodes.some(n => text(n) === 'NEW-INVOICE'));
    assert.ok(nodes.filter(n => n.type === 'Modal').every(n => !n.props.visible));
    assert.ok(!nodes.some(n => /OLD-INVOICE|STALE-LOAD|STALE-HISTORY/.test(text(n))));
    app.h.unmount();
  }
});

test('C: rejected new-account load leaves no previous finance rows', async () => {
  for (const received of [false, true]) {
    const app = financeWorkspace();
    app.state.receivedMode = received;
    let nodes = await app.render();
    assert.ok(nodes.some(n => text(n) === (received ? 'NADIA-RECEIVED' : 'INV-1')));
    if (!received) {
      nodes = await navigateTab(app, 'Customers');
      assert.ok(nodes.some(n => text(n).includes('Customer A')));
    }
    const rejected = later();
    app.finance.invoices = () => rejected.promise;
    app.finance.receivedInvoices = () => rejected.promise;
    app.state.userId = 702;
    await app.render();
    rejected.reject(new Error('New account load failed'));
    nodes = await app.render();
    assert.ok(nodes.some(n => text(n).includes('New account load failed')));
    for (const [tab, old] of received
      ? [['Received', 'NADIA-RECEIVED']]
      : [['Invoices', 'INV-1'], ['Customers', 'Customer A']]) {
      nodes = await navigateTab(app, tab);
      assert.ok(!nodes.some(n => text(n).includes(old)), `${tab} must not show old account rows`);
    }
    app.h.unmount();
  }
});

test('account switch closes finance forms and invoice editor while authorization loads', async () => {
  for (const view of ['form', 'editor']) {
    const app = financeWorkspace(), next = later();
    if (view === 'form') {
      await navigateTab(app, 'Customers');
      await click(app, 'Create customer');
      assert.ok((await app.render()).some(n => n.type === 'Modal' && n.props.visible));
    } else {
      const nodes = await app.render();
      nodes.find(n => n.type === 'IconButton' && n.props.accessibilityLabel === 'Create invoice').props.onPress();
      assert.ok((await app.render()).some(n => n.type === 'FinanceInvoiceEditor'));
    }
    app.finance.invoices = () => next.promise;
    app.state.userId = 702;
    const nodes = await app.render();
    assert.ok(nodes.some(n => n.type === 'Spinner' && n.props.accessibilityLabel === 'Loading finance records'));
    assert.ok(nodes.filter(n => n.type === 'Modal').every(n => !n.props.visible));
    assert.ok(!nodes.some(n => n.type === 'FinanceInvoiceEditor'));
    next.resolve([]);
    await app.render();
    app.h.unmount();
  }
});

test('R: native finance provides CSV exports for filtered issued invoices and all-page expenses', async () => {
  const app = financeWorkspace();
  await app.render();
  await click(app, 'Export invoices CSV');
  assert.equal(app.shares.length, 1);
  assert.equal(app.shares[0].opts.mimeType, 'text/csv');
  const written = new TextDecoder('utf-8', { ignoreBOM: true }).decode(app.files[0].bytes);
  assert.ok(written.startsWith('\ufeff"Number"'));
  assert.ok(written.includes('"INV-51"'), 'page two invoice is exported');
  await awaitAsyncWork(app, () => app.files[0].deleted);
  assert.ok(app.files[0].deleted, 'temporary file is removed after share');
  await navigateTab(app, 'Expenses');
  await click(app, 'Export expenses CSV');
  const expenses = new TextDecoder('utf-8', { ignoreBOM: true }).decode(app.files[1].bytes);
  assert.ok(expenses.includes('"\'=SUM(1,2)"'), 'spreadsheet injection is escaped');
  assert.ok(expenses.includes('"Travel ""A"", room 2"'));
  await awaitAsyncWork(app, () => app.files[1].deleted);
});

test('R: native BAS worksheet export is explicitly draft and never represented as a lodgement', async () => {
  const app = financeWorkspace();
  await navigateTab(app, 'GST / BAS');
  await click(app, 'Calculate worksheet');
  await click(app, 'Export draft worksheet CSV');
  assert.equal(app.shares.length, 1);
  const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(app.files[0].bytes);
  for (const value of ['DRAFT', 'Not a complete BAS', 'cash', '1000.00', '80.00', '4']) {
    assert.ok(csv.includes(value), 'missing draft worksheet value ' + value);
  }
});

test('R: customer list shows entity name and cancelled ABN status; lookup refreshes evidence', async () => {
  const app = financeWorkspace();
  const nodes = await navigateTab(app, 'Customers');
  assert.ok(nodes.some(n => n.type === 'Text' && text(n).includes('ACME Group')));
  assert.ok(nodes.some(n => n.type === 'Text' && /cancelled/i.test(text(n))));
  await click(app, 'Check ABN');
  assert.deepEqual(app.calls, [['lookup', 14]]);
});

test('C: CSV share cancellation/failure cleans private file and leaves a retry action', async () => {
  const app = financeWorkspace();
  app.sharing.shareAsync = async () => { throw Error('Share sheet cancelled'); };
  await app.render();
  const nodes = await app.render();
  const action = button(nodes, 'Export invoices CSV');
  assert.ok(action);
  await action.props.onPress();
  await awaitAsyncWork(app, () => app.files.length === 1 && app.files[0].deleted);
  assert.equal(app.files.length, 1);
  assert.ok(app.files[0].deleted);
  const retryNodes = await app.render();
  assert.ok(retryNodes.some(n => n.type === 'Text' && /share|cancel|retry/i.test(text(n))));
});


test('R: parity native customer editor renders ABN evidence, then hides it when ABN is edited', async () => {
  const engine = createHooks();
  const state = { id: '14', status: 503 }, existing = customer(), calls = [];
  const widgets = Object.fromEntries([
    'ActionButtons', 'ChoiceChips', 'DataRow', 'EmptyState', 'Field',
    'InfoNote', 'MetricGrid', 'ParityPage', 'Section',
  ].map(name => [name, name]));
  const module = compile('frontend_mobile/features/parity/finance.tsx', {
    react: engine.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/context/AuthContext': { useAuth: () => ({ user: { id: 701 } }) },
    './receiptShare': { ReceiptShareSession: class {} },
    'react-native-paper': { Button: 'Button', Chip: 'Chip', IconButton: 'IconButton' },
    'expo-router': { useLocalSearchParams: () => state,
      useRouter: () => ({ push() {}, replace() {}, back() {} }) },
    'expo-image-picker': {}, 'expo-sharing': {},
    'expo-file-system': { File: class {}, Paths: { cache: '' } },
    './nativeFileBytes': { nativeFileBytes: async () => new Uint8Array() },
    '@chemisttasker/shared-core': {
      finance: { customers: async () => [existing],
        lookupAbn: async id => { calls.push(['lookup', id]); throw new ApiError('ABR unavailable: retry later', state.status, {}); },
        saveCustomer: async data => ({ ...existing, ...data }) },
      financeStatus: row => row.status, financeToday: () => '2026-11-07',
    },
    '@/roles/shared/invoices/FinanceWorkspace': { default: 'FinanceWorkspace' },
    './ParityUI': widgets,
    './utils': { dateLabel: value => String(value), errorMessage: err => err.message,
      idempotencyKey: () => 'fixture-key', money: value => String(value),
      replaceUnderscore: value => String(value), toNumber: value => Number(value || 0) },
  });
  const render = () => engine.settled(module.FinanceParityScreen, { screen: 'customer-new' });
  let nodes = await render();
  const info = nodes.find(n => n.type === 'InfoNote' && n.props.title === 'ABR lookup evidence');
  assert.ok(info);
  assert.match(text(info), /ACME Group/);
  assert.match(text(info), /Cancelled/);
  assert.match(text(info), /GST not registered/);
  assert.match(text(info), /does not establish ownership/i);
  const abn = nodes.find(n => n.type === 'Field' && n.props.label === 'ABN');
  assert.ok(abn);
  abn.props.onChangeText('53004085616');
  nodes = await render();
  assert.equal(nodes.some(n => n.type === 'InfoNote' && n.props.title === 'ABR lookup evidence'), false);
  assert.equal(nodes.find(n => n.type === 'Field' && n.props.label === 'ABN').props.value, '53004085616');
  await button(nodes, 'Verify ABN').props.onPress();
  await engine.flush();
  nodes = await render();
  assert.match(String(nodes.find(n => n.type === 'ParityPage').props.error), /ABR unavailable/);
  assert.equal(nodes.find(n => n.type === 'Field' && n.props.label === 'ABN').props.value, '53004085616');
  assert.deepEqual(calls, [['lookup', 14]]);
  for (const status of [422, 429]) {
    state.status = status;
    await button(nodes, 'Verify ABN').props.onPress();
    await engine.flush();
    nodes = await render();
    assert.match(String(nodes.find(n => n.type === 'ParityPage').props.error), /ABR unavailable/);
    assert.equal(nodes.find(n => n.type === 'Field' && n.props.label === 'ABN').props.value, '53004085616');
  }
  assert.equal(calls.length, 3);
});


test('C: issued export uses exact header and current search, excluding received rows', async () => {
  const app = financeWorkspace();
  let nodes = await app.render();
  const search = nodes.find(n => n.type === 'Searchbar');
  assert.ok(search);
  search.props.onChangeText('INV-51');
  await app.render();
  await click(app, 'Export invoices CSV');
  const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(app.files[0].bytes);
  assert.equal(csv.split('\r\n')[0], '\ufeff"Number","Kind","Customer","Date","Due","Worker or fund payable AUD","GST AUD","Paid AUD","Balance AUD","Status"');
  assert.match(csv, /INV-51/);
  assert.doesNotMatch(csv, /INV-1"|NADIA-RECEIVED/);
});

test('C: unavailable share reports an error and permits retry', async () => {
  const app = financeWorkspace();
  app.sharing.isAvailableAsync = async () => false;
  await click(app, 'Export invoices CSV');
  await awaitAsyncWork(app, () => true);
  let nodes = await app.render();
  assert.ok(nodes.some(n => n.type === 'Text' && /sharing is unavailable/i.test(text(n))));
  assert.equal(app.files.length, 0);
  app.sharing.isAvailableAsync = async () => true;
  await click(app, 'Export invoices CSV');
  await awaitAsyncWork(app, () => app.shares.length === 1);
});

test('C: double export from same render starts one share', async () => {
  const app = financeWorkspace(), pending = later();
  app.sharing.isAvailableAsync = () => pending.promise;
  const nodes = await app.render(), action = button(nodes, 'Export invoices CSV');
  action.props.onPress(); action.props.onPress();
  pending.resolve(true);
  await awaitAsyncWork(app, () => app.shares.length === 1 && app.files[0].deleted);
  assert.equal(app.files.length, 1);
  assert.equal(app.shares.length, 1);
});

test('C: account switch while sharing availability is pending discards old export', async () => {
  const app = financeWorkspace(), pending = later();
  let checks = 0;
  app.sharing.isAvailableAsync = () => { checks++; return pending.promise; };
  const action = button(await app.render(), 'Export invoices CSV');
  action.props.onPress();
  assert.equal(checks, 1);
  app.state.userId = 702;
  await app.render();
  pending.resolve(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  await app.h.flush();
  assert.equal(app.files.length, 0);
  assert.equal(app.shares.length, 0);
});


async function parityBas(worksheetCall) {
  const engine = createHooks();
  const state = { id: '14', status: 503 }, existing = customer(), calls = [];
  const widgets = Object.fromEntries([
    'ActionButtons', 'ChoiceChips', 'DataRow', 'EmptyState', 'Field',
    'InfoNote', 'MetricGrid', 'ParityPage', 'Section',
  ].map(name => [name, name]));
  const module = compile('frontend_mobile/features/parity/finance.tsx', {
    react: engine.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/context/AuthContext': { useAuth: () => ({ user: { id: 701 } }) },
    './receiptShare': { ReceiptShareSession: class {} },
    'react-native-paper': { Button: 'Button', Chip: 'Chip', IconButton: 'IconButton' },
    'expo-router': { useLocalSearchParams: () => state,
      useRouter: () => ({ push() {}, replace() {}, back() {} }) },
    'expo-image-picker': {}, 'expo-sharing': {},
    'expo-file-system': { File: class {}, Paths: { cache: '' } },
    './nativeFileBytes': { nativeFileBytes: async () => new Uint8Array() },
    '@chemisttasker/shared-core': {
      finance: { customers: async () => [existing],
        worksheet: worksheetCall || (async () => ({ G1: '1', '1A': '2', '1B': '3', estimated_gst_net: '4', excluded_legacy_invoice_count: 7, warnings: ['Review'] })),
        saveCustomer: async data => ({ ...existing, ...data }) },
      financeStatus: row => row.status, financeToday: () => '2026-11-07',
    },
    '@/roles/shared/invoices/FinanceWorkspace': { default: 'FinanceWorkspace' },
    './ParityUI': widgets,
    './utils': { dateLabel: value => String(value), errorMessage: err => err.message,
      idempotencyKey: () => 'fixture-key', money: value => String(value),
      replaceUnderscore: value => String(value), toNumber: value => Number(value || 0) },
  });
  const render = () => engine.settled(module.FinanceParityScreen, { screen: 'bas' });
  return { engine, render };
}

test('C: parity BAS summary displays excluded legacy count and warnings', async () => {
  const { engine, render } = await parityBas();
  let nodes = await render();
  button(nodes, 'Calculate worksheet').props.onPress();
  await engine.flush();
  nodes = await render();
  const note = nodes.find(n => n.type === 'InfoNote' && n.props.title === 'Excluded legacy invoices');
  assert.ok(note);
  assert.match(text(note), /7\s+legacy invoice/);
  assert.ok(nodes.some(n => n.type === 'DataRow' && n.props.title === 'Review'));
});


test('C: customer ABN 422, 503 and 429 leave the workspace usable for retry', async () => {
  for (const status of [422, 503, 429]) {
    const app = financeWorkspace();
    let attempts = 0;
    app.finance.lookupAbn = async () => {
      attempts++;
      if (attempts === 1) throw new ApiError('Lookup unavailable ' + status, status, {});
      return customer();
    };
    await navigateTab(app, 'Customers');
    await click(app, 'Check ABN');
    let nodes = await app.render();
    assert.ok(nodes.some(n => n.type === 'Text' && text(n).includes('Lookup unavailable ' + status)));
    assert.ok(nodes.some(n => n.type === 'Text' && text(n).includes('Customer A')));
    await click(app, 'Check ABN');
    assert.equal(attempts, 2);
    nodes = await app.render();
    assert.ok(nodes.some(n => n.type === 'Text' && text(n).includes('ACME Group')));
  }
});


for (const boundary of ['availability', 'bytes', 'write']) {
  test(`R: unmounted CSV export stops at ${boundary}`, async () => {
    const pending = later();
    const config = boundary === 'bytes' ? { bytes: () => pending.promise } :
      boundary === 'write' ? { write: () => pending.promise } : {};
    const app = financeWorkspace(config);
    if (boundary === 'availability') app.sharing.isAvailableAsync = () => pending.promise;
    const action = button(await app.render(), 'Export invoices CSV');
    const task = action.props.onPress();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    app.h.unmount();
    pending.resolve(boundary === 'availability' ? true : new Uint8Array([1]));
    await task;
    for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(app.files.filter(file => file.bytes && !file.deleted).length, 0, boundary);
    assert.equal(app.shares.length, 0, boundary);
    if (boundary === 'write') assert.ok(app.files[0].deleted, 'in-flight write is removed');
  });
}

test('R: workspace discards a worksheet calculated for an edited period or basis', async () => {
  for (const field of ['start', 'end', 'basis']) {
    const app = financeWorkspace(), pending = later();
    let calls = 0;
    app.finance.worksheet = async (...args) => { calls++; return calls === 1 ? pending.promise :
      { start: args[0], end: args[1], basis: args[2], G1:'1', '1A':'2', '1B':'3', estimated_gst_net:'4', warnings:[], excluded_legacy_invoice_count:0 }; };
    let nodes = await navigateTab(app, 'GST / BAS');
    button(nodes, 'Calculate worksheet').props.onPress();
    nodes = await app.render();
    if (field === 'basis') nodes.find(n => n.type === 'Chip' && text(n) === 'Accrual').props.onPress();
    else nodes.find(n => n.type === 'TextInput' && n.props.label.startsWith(field === 'start' ? 'Start' : 'End')).props.onChangeText('2026-10-01');
    await app.render();
    pending.resolve({ G1:'999', '1A':'2', '1B':'3', estimated_gst_net:'4', warnings:[], excluded_legacy_invoice_count:0 });
    await app.h.flush(); nodes = await app.render();
    assert.equal(!!button(nodes, 'Export draft worksheet CSV'), false, field);
    await click(app, 'Calculate worksheet');
    assert.ok(button(await app.render(), 'Export draft worksheet CSV'), field);
  }
});

test('R: parity BAS rejects results for edited period and basis and can recalculate', async () => {
  for (const field of ['start', 'end', 'basis']) {
    const pending = later(); let calls = 0;
    const result = { G1:'1', '1A':'2', '1B':'3', estimated_gst_net:'4', warnings:[], excluded_legacy_invoice_count:0 };
    const app = await parityBas(async () => ++calls === 1 ? pending.promise : result);
    let nodes = await app.render(); button(nodes, 'Calculate worksheet').props.onPress();
    nodes = await app.render();
    if (field === 'basis') nodes.find(n => n.type === 'ChoiceChips').props.onChange('accrual');
    else nodes.find(n => n.type === 'Field' && n.props.label.startsWith(field === 'start' ? 'Start' : 'End')).props.onChangeText('2026-10-01');
    await app.render(); pending.resolve(result); await app.engine.flush(); nodes = await app.render();
    assert.equal(nodes.some(n => n.type === 'MetricGrid'), false, field);
    button(nodes, 'Calculate worksheet').props.onPress(); await app.engine.flush();
    assert.ok((await app.render()).some(n => n.type === 'MetricGrid'), field);
  }
});
