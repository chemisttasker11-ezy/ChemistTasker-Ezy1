const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(path.resolve(__dirname, '../../../pr249-m1-integration-20261105/frontend_mobile/node_modules/typescript'));
const base = path.resolve(__dirname, '..');
const node = (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } });
const find = (tree, predicate) => {
  if (!tree) return null;
  if (Array.isArray(tree)) { for (const item of tree) { const found = find(item, predicate); if (found) return found; } return null; }
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate) || find(tree.props?.ListHeaderComponent, predicate);
};
const token = new Proxy({}, { get: (_, key) => key === Symbol.toPrimitive ? () => 8 : token });
const widget = new Proxy(function Widget() {}, { get: (_, key) => key === '__esModule' ? false : widget });
const groups = [
  { key: 'clinical', label: 'Clinical Services', items: [] },
  { key: 'dispensing', label: 'Dispensing & Workflow', items: [] },
  { key: 'operations', label: 'Operations & Retail', items: [] },
];
const candidateConfig = path.join(base, 'roles/shared/pharmacies/PharmacyForm.config.ts');
const activeConfig = path.resolve(__dirname, '../../../pr249-m1-integration-20261105/frontend_mobile/roles/shared/pharmacies/PharmacyForm.config.ts');
const configSource = fs.readFileSync(fs.existsSync(candidateConfig) ? candidateConfig : activeConfig, 'utf8');
const configModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(configSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: configModule, exports: configModule.exports });
const pharmacyConfig = configModule.exports;
const segment = function SegmentTabs() {};
const choices = function ResponsiveSegmentedButtons() {};
function harness(relative, initial = {}, extra = {}, exportName) {
  const slots = []; const refs = []; let si = 0, ri = 0;
  const react = {
    createElement: node,
    useState(value) { const i = si++; if (!(i in slots)) slots[i] = i in initial ? initial[i] : typeof value === 'function' ? value() : value; return [slots[i], action => { slots[i] = typeof action === 'function' ? action(slots[i]) : action; }]; },
    useRef(value) { const i = ri++; return refs[i] || (refs[i] = { current: value }); },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {},
  };
  react.default = react;
  const shared = {
    workerSkillRole: () => 'PHARMACIST', searchRoleSkillGroups: () => groups,
    financeToday: () => '2026-11-06', financeStatus: () => 'Saved', finance: {},
  };
  const mocks = {
    react,
    'react-native': { FlatList: 'FlatList', ScrollView: 'ScrollView', StyleSheet: { create: x => x, hairlineWidth: 1 }, Platform: { OS: 'ios', select: x => x.ios ?? x.default }, useWindowDimensions: () => ({ width: 320 }), LogBox: { ignoreLogs() {} } },
    'react-native-paper': new Proxy({ useTheme: () => ({ colors: { background: '', onSurfaceVariant: '', error: '' } }) }, { get: (o, k) => k in o ? o[k] : widget }),
    '@chemisttasker/shared-core': shared,
    '@chemisttasker/shared-core/skills_registry.json': { skills: [] },
    '@/components/ui/SegmentTabs': { SegmentTabs: segment, tabPanelProps: (id, value) => ({ nativeID: `${id}-panel`, accessibilityLabelledBy: `${id}-tab-${value}` }) },
    '@/components/ui/ResponsiveSegmentedButtons': { ResponsiveSegmentedButtons: choices },
    '@/constants/tokens': { colors: token, font: token, radius: token, space: token, touch: { min: 48 }, type: token },
    '@/context/AuthContext': { useAuth: () => ({ user: null, hasCapability: () => false }) },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ isLoading: false }) },
    'expo-router': { useRouter: () => ({ push() {}, back() {} }), useLocalSearchParams: () => ({}), useSegments: () => ['pharmacist'], usePathname: () => '' },
    'react-native-safe-area-context': { SafeAreaView: widget, useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../shared/skills/SoftwarePicker': { SOFTWARE_GROUP: 'software', roleSoftware: () => [], SoftwarePicker: widget },
    '../../shared/forms/useUnsavedChangesGuard': { useUnsavedChangesGuard: () => ({ markClean() {}, confirmDiscard: f => f() }) },
    '../forms/useUnsavedChangesGuard': { useUnsavedChangesGuard: () => ({ markClean() {}, confirmDiscard: f => f() }) },
    './PharmacyForm.config': pharmacyConfig,
    './PharmacyForm.styles': { styles: {} },
    './types': { surfaceTokens: token },
    './invoiceStats': { INVOICE_TIMEFRAMES: [{ value: '30d' }, { value: '90d' }, { value: 'this_year' }, { value: 'all' }], filterInvoicesByTimeframe: x => x, buildInvoiceStats: () => ({}), formatInvoiceCurrency: () => '$0' },
    ...extra,
  };
  let src = fs.readFileSync(path.join(base, relative), 'utf8');
  if (exportName) src += `\nexport { ${exportName} };`;
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require: name => mocks[name] || widget, process: { env: {} }, console, URL, Date, Intl, setTimeout, clearTimeout, __DEV__: true });
  vm.runInContext(js, context);
  return { render: props => { si = 0; ri = 0; return (exportName ? module.exports[exportName] : module.exports.default || module.exports.AnonymousShiftBoardScreen)(props || {}); }, slots };
}
for (const [role, loadingIndex] of [['pharmacist', 1], ['otherstaff', 2]]) {
  test(`${role} skills categories show full labels and change selected category`, () => {
    const h = harness(`roles/${role}/profile-tabs/SkillsScreen.tsx`, { [loadingIndex]: false });
    let control = find(h.render(), n => n.type === segment);
    assert.deepEqual(Array.from(control.props.tabs, t => t.label), groups.map(g => g.label));
    assert.equal(control.props.value, 'clinical');
    control.props.onChange('operations');
    control = find(h.render(), n => n.type === segment);
    assert.equal(control.props.value, 'operations');
  });
}
test('finance changes section and status through production callbacks', () => {
  const h = harness('roles/shared/invoices/FinanceWorkspace.tsx', { 8: false });
  let tree = h.render({});
  let status = find(tree, n => n.type === choices);
  status.props.onValueChange('Approved for payment');
  tree = h.render({});
  assert.equal(find(tree, n => n.type === choices).props.value, 'Approved for payment');
  find(tree, n => n.type === segment).props.onChange('Customers');
  assert.equal(find(h.render({}), n => n.type === segment).props.value, 'Customers');
});
test('invoice timeframe choices dispatch the selected value', () => {
  let selected;
  const h = harness('roles/shared/invoices/MobileInvoiceStats.tsx');
  const control = find(h.render({ invoices: [], timeframe: '30d', onTimeframeChange: v => { selected = v; } }), n => n.type === choices);
  assert.equal(control.props.buttons[0].label, 'Last 30 days');
  control.props.onValueChange('90d');
  assert.equal(selected, '90d');
});
test('public board role filter updates selected role', () => {
  const h = harness('roles/shared/shifts/AnonymousShiftBoardScreen.tsx');
  let control = find(h.render(), n => n.type === choices);
  control.props.onValueChange('TECHNICIAN');
  control = find(h.render(), n => n.type === choices);
  assert.equal(control.props.value, 'TECHNICIAN');
  assert.ok(control.props.buttons.some(b => b.label === 'Technician'));
});
test('pharmacy section uses full labels and changes section', () => {
  const h = harness('roles/shared/pharmacies/PharmacyForm.tsx');
  let control = find(h.render({ mode: 'create' }), n => n.type === segment);
  assert.ok(control.props.tabs.some(t => t.label === 'Employment'));
  control.props.onChange('3');
  control = find(h.render({ mode: 'create' }), n => n.type === segment);
  assert.equal(control.props.value, '3');
});
test('finance existing tools receives its section header without an outer scroll', () => {
  let header;
  const existingTools = value => { header = value; return node('legacy-list', {}); };
  const h = harness('roles/shared/invoices/FinanceWorkspace.tsx', { 8: false });
  let tree = h.render({ existingTools });
  find(tree, n => n.type === segment).props.onChange('Existing tools');
  tree = h.render({ existingTools });
  assert.ok(find(header, n => n.type === segment));
  assert.ok(find(tree, n => n.type === 'legacy-list'));
  assert.equal(find(tree, n => n.props?.refreshControl), null);
});

test('legacy invoice list renders provided finance controls in its virtualized header', () => {
  const h = harness('roles/shared/invoices/InvoiceList.tsx', {}, {}, 'LegacyInvoiceList');
  const header = node('finance-header', {});
  const tree = h.render({ header });
  const list = find(tree, n => n.type === 'FlatList');
  assert.ok(list);
  assert.ok(find(list.props.ListHeaderComponent, n => n.type === 'finance-header'));
  assert.equal(find(tree, n => n.type === 'ScrollView'), null);
});
