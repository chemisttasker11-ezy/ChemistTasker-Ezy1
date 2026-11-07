// M4-02: browser-click worksheet export must match the actual shared/native CSV bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props) => ({ type, props: props || {} });
function load(file, modules, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports, URL, Blob, console, Date, URLSearchParams,
    ...globals,
    require(name) {
      if (!(name in modules)) throw Error('Unmocked worksheet import: ' + name);
      const value = modules[name];
      return value && typeof value === 'object' && 'default' in value && !value.__esModule
        ? { __esModule: true, ...value } : value;
    },
  }, { filename: file });
  return module.exports;
}
const csv = load('../../../../shared-core/src/domains/finance/csv.ts', {});
const worksheet = {
  start: '2026-07-01', end: '2026-09-30', basis: 'cash',
  G1: '1000.00', '1A': '100.00', '1B': '20.00',
  estimated_gst_net: '80.00', expenses_needing_evidence: [4],
  excluded_legacy_invoice_count: 3, lodgement_ready: false,
  warnings: ['Missing supporting receipt'],
};
const ui = name => name;
const defaults = names => Object.fromEntries(names.split(' ').map(name =>
  [name, { __esModule: true, default: ui(name) }]));
function nodes(tree, result = []) {
  if (Array.isArray(tree)) tree.forEach(item => nodes(item, result));
  else if (tree && typeof tree === 'object') {
    if ('type' in tree) result.push(tree);
    nodes(tree.props?.children, result);
    nodes(tree.props?.actions, result);
    nodes(tree.props?.action, result);
  }
  return result;
}
test('R: actual web worksheet button emits byte-identical native/shared CSV and revokes its browser URL', async () => {
  const created = [], revoked = [], clicks = [], removed = [], timers = [];
  const fakeURL = { createObjectURL(blob) { created.push(blob); return 'blob:worksheet'; },
    revokeObjectURL(url) { revoked.push(url); } };
  const document = {
    createElement(tag) {
      assert.equal(tag, 'a');
      return { click() { clicks.push([this.href, this.download]); },
        remove() { removed.push(true); } };
    },
    body: { appendChild() {} },
  };
  const helpers = load('./helpers.ts', { '@chemisttasker/shared-core': csv }, {
    URL: fakeURL, document, window: { setTimeout(fn, ms) {
      timers.push([fn, ms]); return 1;
    } },
  });
  let cursor = 0;
  const states = [];
  const react = {
    useState(initial) {
      const id = cursor++;
      if (!(id in states)) states[id] = typeof initial === 'function' ? initial() : initial;
      return [states[id], update => {
        states[id] = typeof update === 'function' ? update(states[id]) : update;
      }];
    },
    useRef(initial) {
      const id = cursor++;
      if (!(id in states)) states[id] = { current: initial };
      return states[id];
    },
    useEffect() { cursor++; },
  };
  const mui = Object.fromEntries('Alert Box Button CircularProgress Divider ListItemIcon ListItemText Menu MenuItem Snackbar Stack Tab Table TableBody TableCell TableContainer TableHead TableRow Tabs TextField Tooltip Typography'.split(' ').map(x => [x,x]));
  const placeholders = defaults('DashboardContentState ConfirmDialog MetricStrip PageHeader Pill SectionCard InvoiceComposer InvoiceReviewDialog InvoiceReviewDrawer');
  const parts = Object.fromEntries('Empty InvoiceRow ReceivedInvoiceRow'.split(' ').map(x => [x,x]));
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react, '@mui/material': mui,
    'lucide-react': new Proxy({}, { get: (_target, name) => String(name) }),
    '@chemisttasker/shared-core': {
      finance: { worksheet: async () => worksheet },
      financeStatus: row => row.status,
      invoiceCsvRows: csv.invoiceCsvRows, expenseCsvRows: csv.expenseCsvRows,
    },
    'react-router-dom': { useSearchParams: () => [
      new URLSearchParams('tool=bas'), () => {},
    ] },
    '../../components/dashboard/DashboardContentState': { default: placeholders.DashboardContentState },
    '../../components/ui/ConfirmDialog': { ConfirmDialog: 'ConfirmDialog' },
    '../../components/ui/MetricStrip': { default: placeholders.MetricStrip },
    '../../components/ui/PageHeader': { default: placeholders.PageHeader },
    '../../components/ui/Pill': { Pill: 'Pill' },
    '../../components/ui/SectionCard': { default: placeholders.SectionCard },
    '../dashboard/sidebar/Invoices/invoiceParts': { formatDay: v => v },
    '../dashboard/sidebar/Invoices/invoiceStats': {
      buildInvoiceStats: () => ({}), filterInvoicesByTimeframe: rows => rows,
      INVOICE_TIMEFRAME_OPTIONS: [],
    },
    './Editors': { CustomerEditor: 'CustomerEditor', ExpenseEditor: 'ExpenseEditor',
      ItemEditor: 'ItemEditor', PaymentEditor: 'PaymentEditor' },
    './helpers': helpers,
    './InvoiceComposer': { default: placeholders.InvoiceComposer },
    './invoiceFilters': {
      receivedKey: () => 'all', receivedOrder: {}, receivedTabs: [],
      statusKey: () => 'all', statusTabs: [],
    },
    './InvoiceReviewDialog': { default: placeholders.InvoiceReviewDialog },
    './InvoiceReviewDrawer': { default: placeholders.InvoiceReviewDrawer },
    './InvoiceRows': { ...parts, rowTitle: {}, rowMeta: {}, amountSx: {} },
    './useFinanceData': { useFinanceData: () => ({
      customers: [], items: [], invoices: [], receivedInvoices: [], expenses: [],
      loading: false, loadFailed: null, reload: async () => {}, retry: () => {},
    }) },
  };
  const actual = load('./FinanceWorkspace.tsx', modules);
  const render = () => { cursor = 0; return nodes(actual.default({})); };
  const control = (label) => render().find(node => node.type === 'Button'
    && nodes(node.props.children).length === 0
    && String(node.props.children) === label);
  const calculate = control('Calculate');
  assert.ok(calculate, 'real Calculate button must be rendered');
  calculate.props.onClick();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const download = control('Download worksheet (CSV)');
  assert.ok(download, 'real draft worksheet download button must be rendered');
  download.props.onClick();
  assert.equal(created.length, 1);
  assert.deepEqual(clicks, [['blob:worksheet', 'gst-worksheet-DRAFT.csv']]);
  assert.equal(removed.length, 1);
  const bytes = await created[0].text();
  assert.equal(bytes, csv.renderFinanceCsv(csv.worksheetCsvRows(worksheet)),
    'web download and native share must use identical cross-platform worksheet rows');
  assert.equal(timers.length, 1);
  assert.equal(timers[0][1], 1000);
  timers[0][0]();
  assert.deepEqual(revoked, ['blob:worksheet']);
});
