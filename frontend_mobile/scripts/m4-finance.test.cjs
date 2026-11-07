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

function financeWorkspace() {
  const h = createHooks(), state = { userId: 701, invoice: undefined }, shares = [], files = [], calls = [];
  let list = [invoice(1, 'INV-1'), invoice(51, 'INV-51')];
  const realCsv = fs.existsSync(path.join(repo, 'shared-core/src/domains/finance/csv.ts'))
    ? compile('shared-core/src/domains/finance/csv.ts', {}) : new Proxy({}, {
      get: () => () => { throw Error('M4 finance CSV helper absent on base'); },
    });
  class File {
    constructor(_cache, filename) { this.name = filename; this.uri = 'file:///cache/' + filename;
      this.deleted = false; files.push(this); }
    create() {}
    async write(value) { this.bytes = typeof value === 'string'
      ? new TextEncoder().encode(value) : value; }
    delete() { this.deleted = true; }
  }
  const sharing = { isAvailableAsync: async () => true,
    shareAsync: async (uri, opts) => { shares.push({ uri, opts }); } };
  const finance = {
    customers: async () => [customer()], items: async () => [],
    invoices: async () => list, expenses: async () => [expense(1), expense(51)],
    receivedInvoices: async () => [],
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
    './FinanceInvoiceEditor': { default: 'FinanceInvoiceEditor' },
    './receivedInvoicePolicy': { receivedInvoiceActions: () => ({
      approve: false, revise: false, paid: false }) },
    '@/features/parity/nativeFileBytes': { nativeFileBytes: async blob => new Uint8Array(await blob.arrayBuffer()) },
    '@/constants/tokens': palette,
    '@/context/AuthContext': { useAuth: () => ({ user: { id: state.userId } }) },
    '@/components/ui/SegmentTabs': { SegmentTabs: 'SegmentTabs', tabPanelProps: () => ({}) },
    '@/components/ui/ResponsiveSegmentedButtons': {
      ResponsiveSegmentedButtons: 'ResponsiveSegmentedButtons' },
  });
  const render = () => h.settled(module.default, {});
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

test('R: native finance provides CSV exports for filtered issued invoices and all-page expenses', async () => {
  const app = financeWorkspace();
  await app.render();
  await click(app, 'Export invoices CSV');
  assert.equal(app.shares.length, 1);
  assert.equal(app.shares[0].opts.mimeType, 'text/csv');
  const written = new TextDecoder('utf-8', { ignoreBOM: true }).decode(app.files[0].bytes);
  assert.ok(written.startsWith('\ufeff"Number"'));
  assert.ok(written.includes('"INV-51"'), 'page two invoice is exported');
  assert.ok(app.files[0].deleted, 'temporary file is removed after share');
  await navigateTab(app, 'Expenses');
  await click(app, 'Export expenses CSV');
  const expenses = new TextDecoder('utf-8', { ignoreBOM: true }).decode(app.files[1].bytes);
  assert.ok(expenses.includes('"\'=SUM(1,2)"'), 'spreadsheet injection is escaped');
  assert.ok(expenses.includes('"Travel ""A"", room 2"'));
  assert.ok(app.files[1].deleted);
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
  const state = { id: '14' }, existing = customer(), calls = [];
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
        lookupAbn: async id => { calls.push(['lookup', id]); throw Error('ABR unavailable: retry later'); },
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
});
