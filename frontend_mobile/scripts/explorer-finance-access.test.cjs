const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props: props || {} });
function load(file, imports) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (!(name in imports)) throw Error(`Unmocked ${name} in ${file}`);
    return imports[name];
  }});
  return module.exports;
}
function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(`${dir}/${e.name}`) : e.name.endsWith('.tsx') ? [`${dir}/${e.name}`] : []);
}
test('every finance and invoice route prevents explorer screen mounts and allows existing roles', () => {
  let role, calls, redirect, current;
  const Redirect = ({ href }) => { redirect = href; return null; };
  const runtime = { jsx, jsxs: jsx };
  const guard = load('components/FinanceAccess.tsx', { 'react/jsx-runtime': runtime,
    'expo-router': { Redirect }, '@/context/AuthContext': { useAuth: () => ({ user: { role }, isLoading: false }) }, }).FinanceAccess;
  const apiScreen = () => { calls++; return null; };
  const Slot = () => jsx(current, {});
  const imports = { 'react/jsx-runtime': runtime, react: { useEffect: () => {} },
    'expo-router': { Slot, useRouter: () => ({}), useLocalSearchParams: () => ({}) },
    '@/context/AuthContext': { useAuth: () => ({ user: { role }, isLoading: false }) },
    '@/utils/mobilePersona': { resolveInitialWorkspace: () => Promise.resolve('/explorer/dashboard') },
    '@/components/FinanceAccess': { FinanceAccess: guard },
    '@/features/parity/finance': { FinanceParityScreen: apiScreen },
    '@/roles/shared/invoices/InvoiceList': { __esModule: true, default: apiScreen },
    '@/roles/shared/invoices/InvoiceDetail': { __esModule: true, default: apiScreen },
    '@/roles/shared/invoices/InvoiceGenerate': { __esModule: true, default: apiScreen },
  };
  function render(node) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function') render(node.type(node.props));
    else render(node.props?.children);
  }
  const finance = files('app/finance').filter(f => !f.endsWith('/_layout.tsx'));
  const invoice = ['owner','admin','organization','pharmacist','otherstaff'].flatMap(p => files(`app/${p}`).filter(f => /\/invoice(?:s\.tsx|\.tsx|\/)/.test(f)));
  const layout = load('app/finance/_layout.tsx', imports).default;
  for (const file of [...finance, ...invoice]) {
    current = load(file, imports).default;
    const screen = finance.includes(file) ? layout : current;
    for (role of ['EXPLORER', 'PHARMACIST', 'OTHER_STAFF', 'OWNER', 'ORG_STAFF']) {
      calls = 0; redirect = null;
      render(jsx(screen, {}));
      assert.equal(calls, role === 'EXPLORER' ? 0 : 1, `${file}: ${role}`);
      if (role === 'EXPLORER') assert.equal(redirect, '/explorer/dashboard', file);
    }
  }
});

