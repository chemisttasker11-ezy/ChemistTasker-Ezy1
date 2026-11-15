const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(path.resolve(__dirname, '../node_modules/typescript'));
const deep = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => 1 : deep, apply: () => deep });
const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
function load(file, mocks) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Set, Map, Math, Number, Array, Object, Date, require: id => mocks[id] ?? deep });
  return exports;
}
function hookReact() {
  const cells = [];
  let i = 0;
  const react = {
    useState(init) { const k = i++; if (!(k in cells)) cells[k] = init; return [cells[k], u => { cells[k] = typeof u === 'function' ? u(cells[k]) : u; }]; },
    useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
  };
  return { react, rerender() { i = 0; } };
}
const filters = { city: [], roles: [], employmentTypes: [], minRate: 0, search: '', timeOfDay: [], dateRange: { start: '', end: '' }, onlyUrgent: false, negotiableOnly: false, flexibleOnly: false, travelProvided: false, accommodationProvided: false, bulkShiftsOnly: false };
function find(node, label) {
  if (!node || typeof node !== 'object') return;
  if (node.props?.label === label) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const hit = find(child, label); if (hit) return hit; }
}

test('typing in the board search reaches onFiltersChange (server-filtered boards refetch with the text)', () => {
  const h = hookReact();
  const { useFilterSort } = load('roles/shared/shifts/ShiftsBoard/hooks/useFilterSort.ts', { react: h.react, 'date-fns': deep, '../utils/rates': deep, '../utils/shift': deep });
  const changes = [];
  const run = () => { h.rerender(); return useFilterSort({ shifts: [], filters, onFiltersChange: f => changes.push(f), useServerFiltering: true, activeTab: 'browse', savedShiftIds: new Set(), savedFeatureEnabled: false }); };
  const board = run();
  const Sidebar = load('roles/shared/shifts/ShiftsBoard/components/FiltersSidebar.tsx', {
    react: { default: {} }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: x => x } },
    '@/components/ui': { Pill: 'Pill', ScalePressable: 'ScalePressable', TextField: 'TextField' }, '../constants': { FILTER_SECTIONS: {} },
  }).default;
  const tree = Sidebar({ ...board, roleOptions: [], locationGroups: {}, expandedStates: {} });
  find(tree, 'Search').props.onChangeText('amox');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].search, 'amox');
  assert.equal(run().filterConfig.search, 'amox');
  find(tree, 'From').props.onChangeText('2026-12-01');
  assert.equal(changes.at(-1).dateRange.start, '2026-12-01');
  assert.equal(changes.at(-1).search, 'amox');
});

test('community board debounces filter changes before loading, like the public board', () => {
  const source = fs.readFileSync(path.join(__dirname, '../roles/shared/shifts/CommunityShiftsView.tsx'), 'utf8');
  assert.match(source, /setTimeout\(\(\) => setDebouncedFilters\(filters\), 350\)/);
  assert.match(source, /loadShifts\(debouncedFilters, page\);\r?\n\s*\}, \[debouncedFilters, page, loadShifts, userId\]\);/);
});
