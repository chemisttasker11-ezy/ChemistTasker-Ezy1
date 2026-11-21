// M4-02: execute the whole Vite legacy invoice component and its real load/effect callbacks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const jsx = (type, props) => ({ type, props: props || {} });
const errorsSource = readFileSync(new URL('../../../../shared-core/src/transport/errors.ts', import.meta.url), 'utf8');
const errorsOutput = ts.transpileModule(errorsSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
}}).outputText;
const errorModule = { exports: {} };
vm.runInNewContext(errorsOutput, { module: errorModule, exports: errorModule.exports,
  require: () => ({ reportAhpraError: () => null }) });
const { ApiError } = errorModule.exports;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => {
  resolve = yes; reject = no;
}); return { promise, resolve, reject }; };

function invoiceUi(options = {}) {
  const request = { id: '48', role: 'PHARMACIST', pathname: '/dashboard/pharmacist/invoice/48',
    userId: 7 };
  const effects = [], slots = [], calls = [], destinations = [];
  let cursor = 0, mounted = true;
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x === b[i]);
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, change => {
        slots[i].value = typeof change === 'function' ? change(slots[i].value) : change;
      }];
    },
    useRef(value) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { current: value };
      return slots[i];
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++, prev = slots[i];
      if (!prev || !same(prev.deps, deps)) effects.push(() => {
        prev?.cleanup?.();
        slots[i] = { deps, cleanup: fn() };
      });
    },
  };
  const MUI = Object.fromEntries(
    ['Alert', 'Box', 'Button', 'CircularProgress', 'Dialog', 'DialogActions',
      'DialogContent', 'DialogTitle', 'FormControlLabel', 'IconButton', 'InputAdornment',
      'Paper', 'Skeleton', 'Snackbar', 'Stack', 'Switch', 'TextField', 'Tooltip',
      'Typography'].map(name => [name, name]));
  const icons = new Proxy({}, { get: (_, key) => String(key) });
  const parts = new Proxy({}, { get: (_, key) =>
    key === 'money' ? value => String(value) :
    key === 'formatDay' ? value => String(value) :
    key === 'splitDescription' ? value => ({ description: String(value || '') }) :
    key === 'invoiceStatus' ? value => String(value?.status || '') :
    key === 'descriptionForSave' ? value => value :
    key === 'syncDescription' ? value => value : String(key) });
  const dayjs = Object.assign((..._args) => ({ format: () => '2026-07-10' }), { extend() {} });
  const core = {
    finance: {
      invoice: async id => { calls.push(['managed', id, request.userId]); return options.managed?.(id, request.userId); },
      receivedInvoice: async id => { calls.push(['received', id, request.userId]); return options.managed?.(id, request.userId); },
    },
    getInvoiceDetail: async id => {
      calls.push(['legacy', id, request.userId]);
      return options.legacy?.(id, request.userId) || { id, line_items: [], status: 'draft' };
    },
    updateInvoice: async () => ({}), reportInvoiceIssue: async () => ({}),
    downloadInvoicePdf: async () => new Blob([]),
  };
  const real = readFileSync(new URL('../dashboard/sidebar/InvoiceDetailPage.tsx', import.meta.url), 'utf8');
  // Replace only the Vite build-time env binding; all application logic is executed unchanged.
  const output = ts.transpileModule(real.replaceAll('import.meta.env', '__VITE_ENV'), {
    fileName: 'InvoiceDetailPage.tsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '@mui/material': MUI, '@mui/icons-material': icons, 'lucide-react': icons,
    '../../../components/ui/PageHeader': { __esModule: true, default: 'PageHeader' },
    '../../../components/dashboard/DashboardContentState': { __esModule: true, default: 'DashboardContentState' },
    './Invoices/invoiceParts': parts,
    'react-router-dom': {
      useParams: () => ({ id: request.id }),
      useNavigate: () => (to, opts) => destinations.push([to, opts]),
      useLocation: () => ({ pathname: request.pathname, search: '' }),
    },
    '../../../contexts/AuthContext': { useAuth: () => ({ user: { id: request.userId, role: request.role } }) },
    '@react-google-maps/api': { useJsApiLoader: () => ({ isLoaded: false }), Autocomplete: 'Autocomplete' },
    dayjs: { default: dayjs, __esModule: true }, 'dayjs/plugin/utc': { default: () => {}, __esModule: true },
    '@chemisttasker/shared-core': core,
    '../../../utils/invoiceIssuer': { isIssuerWorkspace: () => request.role === 'PHARMACIST' },
  };
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, __VITE_ENV: { VITE_Maps_API_KEY: '' },
    URL, Blob, console, window: { setTimeout() {} },
    require(name) {
      if (!(name in modules)) throw Error('Unmocked invoice import ' + name);
      return modules[name];
    },
  }, { filename: 'InvoiceDetailPage.tsx' });
  const flatten = (node, out = []) => {
    if (Array.isArray(node)) node.forEach(entry => flatten(entry, out));
    else if (node && typeof node === 'object') {
      out.push(node); flatten(node.props?.children, out);
    }
    return out;
  };
  function render() {
    assert.ok(mounted);
    cursor = 0;
    return flatten(module.exports.default());
  }
  async function flush() {
    while (effects.length) effects.shift()();
    for (let i = 0; i < 6; i++) await Promise.resolve();
  }
  async function settle() {
    for (let i = 0; i < 4; i++) { render(); await flush(); }
    return render();
  }
  function unmount() {
    mounted = false;
    for (const s of slots) s?.cleanup?.();
  }
  return { request, calls, destinations, render, flush, settle, unmount };
}

const refusal = status => new ApiError('Managed invoice refused', status,
  { detail: 'Not permitted to inspect this finance invoice' });

test('R: managed auth/conflict/server/network failures never open the legacy edit surface', async () => {
  for (const failure of [refusal(401), refusal(403), refusal(409), refusal(500), new TypeError('Network unavailable')]) {
    const ui = invoiceUi({ managed: () => Promise.reject(failure), legacy: () => ({
      id: 48, status: 'draft', line_items: [],
    }) });
    const nodes = await ui.settle();
    assert.equal(ui.calls.filter(([source]) => source === 'legacy').length, 0);
    assert.deepEqual(ui.destinations, []);
    assert.ok(nodes.some(node => node.type === 'DashboardContentState' ||
      (node.type === 'Alert' && /invoice/i.test(String(node.props.children)))),
      'must expose a recoverable managed error');
    ui.unmount();
  }
});

test('C: explicit 404 allows exactly one legacy lookup without managed write', async () => {
  const ui = invoiceUi({ managed: () => Promise.reject(refusal(404)),
    legacy: () => ({ id: 48, status: 'draft', line_items: [], reference: 'LEGACY-48' }) });
  const nodes = await ui.settle();
  assert.equal(ui.calls.filter(([source]) => source === 'legacy').length, 1);
  assert.ok(nodes.some(node => node.type === 'PageHeader' &&
    /invoice/i.test(JSON.stringify(node.props.title || ''))));
  assert.deepEqual(ui.destinations, []);
});

test('C: successful managed invoice navigates to revision-aware workspace, never loads legacy', async () => {
  const ui = invoiceUi({ managed: async () => ({ id: 48, number: 'MANAGED-48' }) });
  await ui.settle();
  assert.equal(ui.calls.filter(([source]) => source === 'legacy').length, 0);
  assert.equal(ui.destinations.length, 1);
  assert.equal(ui.destinations[0][0], '/dashboard/pharmacist/invoice?invoice=48');
  assert.equal(ui.destinations[0][1].replace, true);
});

test('R: old account or route completion cannot navigate or show legacy data in new scope', async () => {
  const late = deferred();
  const ui = invoiceUi({ managed: (_, userId) =>
    userId === 7 ? late.promise : Promise.reject(refusal(403)),
    legacy: () => ({ id: 48, status: 'draft', line_items: [] }) });
  await ui.settle();
  ui.request.userId = 17;
  ui.request.id = '49';
  await ui.settle();
  late.resolve({ id: 48, number: 'OLD-ACCOUNT' });
  await ui.flush();
  assert.deepEqual(ui.destinations, []);
  assert.equal(ui.calls.filter(([source]) => source === 'legacy').length, 0);
  ui.unmount();
});


test('C: web missing managed and legacy invoices exposes failure without navigation', async () => {
  const ui = invoiceUi({ managed: async () => { throw refusal(404); },
    legacy: async () => { throw refusal(404); } });
  const nodes = await ui.settle();
  assert.equal(ui.calls.filter(([source]) => source === 'legacy').length, 1);
  assert.deepEqual(ui.destinations, []);
  assert.ok(nodes.some(node => node.type === 'DashboardContentState' ||
    (node.type === 'Alert' && /invoice/i.test(String(node.props.children)))));
  ui.unmount();
});
