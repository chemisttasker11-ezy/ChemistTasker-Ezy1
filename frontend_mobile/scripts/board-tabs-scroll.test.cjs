const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const local = path.resolve(__dirname, '../node_modules/typescript');
const fallback = path.resolve(__dirname, '../../../pr249-m1-integration-20261105/frontend_mobile/node_modules/typescript');
const ts = require(fs.existsSync(local) ? local : fallback);
const root = path.resolve(__dirname, '../roles/shared/shifts');

// Evaluate each production return expression with presentation data; handlers are not invoked.
function render(file, overrides) {
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('    return (\n        <View style={styles.container}>', source.indexOf('const boardHeader ='));
  assert.ok(start >= 0);
  const end = source.indexOf('\n    );', start) + '\n    );'.length;
  const fragment = source.slice(start, end);
  const code = ts.transpileModule(`function screen(){${fragment}}; result = screen();`, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const jsx = (type, props) => ({ type, props: props || {} });
  const header = { type: 'BoardTabs', props: { value: overrides.boardTab || 'browse', savedCount: 3 } };
  const context = new Proxy({
    Object, Array, String, Number, Boolean, Math, JSON, exports: {}, undefined,
    require: () => ({ jsx, jsxs: jsx, Fragment: 'Fragment' }),
    boardHeader: header, styles: {}, boardTab: 'browse', offersLoading: false, offersError: false,
    offerShifts: [], payrollContent: { type: 'Payroll' }, loadError: false, loading: false,
    shifts: [], filters: {}, debouncedFilters: {}, page: 1, pageSize: 20, totalCount: 0,
    savedShiftIds: new Set(), appliedShiftIds: [], appliedSlotIds: [], rejectedShiftIds: [], rejectedSlotIds: [],
    termsState: { offers: [], selectedOfferIds: [], status: '' }, termsConfirming: false,
    isTermsDialogVisible: () => false, workerPaymentPath: '', error: '', errorOpen: false,
    BoardTabs: 'BoardTabs', ShiftsBoard: 'ShiftsBoard', View: 'View', ScrollView: 'ScrollView',
    ContentState: 'ContentState', ShiftEngagementTermsDialog: 'Dialog', Portal: 'Portal', Snackbar: 'Snackbar',
    ...overrides,
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  vm.runInNewContext(code, context);
  return { tree: context.result, header };
}
function find(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(n => find(n, type));
  return [...(node.type === type ? [node] : []), ...find(node.props?.children, type)];
}
for (const file of ['PublicShiftsView.tsx', 'CommunityShiftsView.tsx']) {
  test(`${file}: production browse passes the same header into the board`, () => {
    const { tree, header } = render(file, {});
    const board = find(tree, 'ShiftsBoard')[0];
    assert.equal(board.props.header, header);
    assert.equal(board.props.hideTabs, true);
    assert.equal(board.props.title, file.startsWith('Public') ? 'Public shifts' : 'Community shifts');
  });
  for (const state of [{ offersLoading: true }, { offersError: true }, { offerShifts: [] }]) {
    test(`${file}: offers state ${Object.keys(state)[0]} scrolls with header`, () => {
      const { tree, header } = render(file, { boardTab: 'accepted', ...state });
      const scroll = find(tree, 'ScrollView')[0];
      assert.ok(scroll);
      assert.ok(find(scroll, 'BoardTabs').includes(header));
      assert.ok(find(scroll, 'ContentState').length);
    });
  }
}
test('ShiftsBoard places supplied header and footer inside its existing scroll view', () => {
  const source = fs.readFileSync(path.join(root, 'ShiftsBoard/index.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('<ScrollView\n');
  const end = source.indexOf('</ScrollView>', start);
  const scroll = source.slice(start, end);
  assert.ok(scroll.includes('{header}'));
  assert.ok(scroll.includes('{footer}'));
});
