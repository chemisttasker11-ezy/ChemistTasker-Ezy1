const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fallbackRoot = path.resolve(__dirname, '..');
const harnessRoot = fs.existsSync(path.join(__dirname, 'workforce-request-isolation.test.cjs')) ? path.resolve(__dirname, '..') : fallbackRoot;
const baseRequire = require('node:module').createRequire(path.join(harnessRoot, 'package.json'));
const dependency = id => { try { return require(id); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; return baseRequire(id); } };

// Reuse the existing VM screen harness, changing only host mocks and fixtures.
const old = fs.readFileSync(path.join(harnessRoot, 'scripts', 'workforce-request-isolation.test.cjs'), 'utf8');
let harnessSource = old.slice(0, old.indexOf("test('my-leave")) + old.slice(old.indexOf('function createWorkforceHarness'), old.indexOf("test('workforce-settings production:"));
harnessSource = harnessSource.replace("Chip: 'Chip',", "Chip: 'Chip', List: { Item: 'ListItem', Icon: 'ListIcon' },");
harnessSource = harnessSource.replace("[{ id: 1, name: 'Main Pharmacy' }, { id: 2, name: 'Branch Pharmacy' }]", "Array.from({length: 20}, (_, i) => ({id: i + 1, name: `Pharmacy ${i + 1}`}))");
harnessSource = harnessSource.replace('confirmDiscard: (fn) => fn(),', 'confirmDiscard: (fn) => { pendingGuard = fn; },');
harnessSource = harnessSource.replace('const guardInvocations = [];', 'let pendingGuard = null; const guardInvocations = [];');
harnessSource = harnessSource.replace('    guardInvocations,', '    guardInvocations, getPendingGuard: () => pendingGuard,');
const sandbox = { require: dependency, __dirname, console, setImmediate, Promise, exports: {} };
vm.runInNewContext(harnessSource + '\nexports.make = createWorkforceHarness; exports.find = findTreeNodes;', sandbox);
const { make, find } = sandbox.exports;
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('settings renders and filters 20 real pharmacy options and guards scope changes', async () => {
  const env = make({ preferredPharmacyId: 1 });
  const { harness, ScopedWorkforceSettings: Screen } = env;
  const render = () => { harness.reset(); return Screen({ preferredPharmacyId: 1 }); };
  let tree = render(); harness.flush(); await tick();
  tree = render(); harness.flush(); await tick(); tree = render();
  let toggle = find(tree, n => n.type === 'Button' && n.props.children === 'Change pharmacy')[0];
  assert.ok(toggle); assert.equal(toggle.props.disabled, false); toggle.props.onPress();
  tree = render();
  const input = find(tree, n => n.type === 'TextInput' && n.props.label === 'Search pharmacies')[0];
  assert.ok(input);
  let items = find(tree, n => n.type === 'ListItem');
  assert.equal(items.length, 20); assert.equal(items.filter(n => n.props.accessibilityState.checked).length, 1);
  input.props.onChangeText('Pharmacy 20'); tree = render();
  items = find(tree, n => n.type === 'ListItem'); assert.equal(items.length, 1);
  items[0].props.onPress();
  assert.ok(env.getPendingGuard(), 'selection invokes the unsaved-change guard');
  tree = render();
  assert.equal(find(tree, n => n.type === 'ListItem')[0].props.accessibilityState.checked, false, 'scope does not switch before confirmation');
  env.getPendingGuard()(); tree = render();
  assert.equal(find(tree, n => n.type === 'TextInput' && n.props.label === 'Search pharmacies').length, 0);
  assert.equal(env.requestedPharmacies.some(x => x.id === 20), false, 'no scope fetch until effects run after confirmed selection');
});

// Adapt the existing production-timesheets VM test only at the host fixtures and
// interaction sequence; the screen and its callbacks remain the real TSX.
{
  const source = fs.readFileSync(path.join(harnessRoot, 'scripts', 'timesheet-workspace-scope.test.cjs'), 'utf8');
  let caseSource = source.slice(source.indexOf("test('production timesheets screen:"), source.indexOf("test('timesheets screen mounts"));
  caseSource = caseSource.replace("test('production timesheets screen: busy pharmacy changes are blocked and later writes stay available'", "test('timesheets selectors filter production options and reject retained callbacks during a pending write'");
  caseSource = caseSource.replace("listTimesheetPeriods: async () => [{ id: 1, start_date: '2026-11-02', end_date: '2026-11-15', status: 'OPEN' }]", "listTimesheetPeriods: async (id) => { requested.push(id); return Array.from({length: 20}, (_, i) => ({id: i + 1, start_date: `2026-11-${String(i + 1).padStart(2, '0')}`, end_date: '2026-12-01', status: 'OPEN'})); }");
  caseSource = caseSource.replace('  let deferredAction = null;', '  let deferredAction = null; const requested = [];');
  caseSource = caseSource.replace("Button: 'Button', Chip: 'Chip', Card:", "Button: 'Button', Chip: 'Chip', List: {Item: 'ListItem', Icon: 'ListIcon'}, Card:");
  caseSource = caseSource.replace("[{ id: 101, name: 'Pharma A' }, { id: 102, name: 'Pharma B' }]", "Array.from({length: 20}, (_, i) => ({id: 101 + i, name: `Pharma ${i + 1}`}))");
  const tail = caseSource.indexOf('  const buttons = findNodes(tree,');
  assert.ok(tail > 0, 'Existing timesheet VM interaction anchor is present');
  caseSource = caseSource.slice(0, tail) + `
  let toggle = findNodes(tree, 'Button').find(b => b.children === 'Change pharmacy');
  assert.ok(toggle); toggle.onPress();
  cursor = 0; tree = Screen();
  let options = findNodes(tree, 'ListItem');
  assert.equal(options.length, 20);
  assert.equal(options.filter(p => p.accessibilityState.checked).length, 1);
  findNodes(tree, 'TextInput').find(p => p.label === 'Search pharmacies').onChangeText('Pharma 20');
  cursor = 0; tree = Screen();
  options = findNodes(tree, 'ListItem'); assert.equal(options.length, 1);
  const retainedPharmacy = options[0].onPress;
  toggle = findNodes(tree, 'Button').find(b => b.children === 'Change period' || b.children === 'Choose period');
  assert.ok(toggle); toggle.onPress();
  cursor = 0; tree = Screen();
  const periodInput = findNodes(tree, 'TextInput').find(p => p.label === 'Search periods');
  assert.ok(periodInput);
  assert.equal(findNodes(tree, 'ListItem').length, 21, 'all 20 periods are rendered before search');
  periodInput.onChangeText('2026-11-20');
  cursor = 0; tree = Screen();
  options = findNodes(tree, 'ListItem'); assert.equal(options.length, 2, 'one filtered option in each picker');
  const retainedPeriod = options.find(p => p !== undefined && !p.accessibilityState.checked && Array.isArray(p.title().props.children) && p.title().props.children.join('').includes('2026-11-20')).onPress;
  const openBtn = findNodes(tree, 'Button').find(b => b.children === 'Open current fortnight');
  assert.ok(openBtn && !openBtn.disabled); openBtn.onPress(); assert.ok(deferredAction);
  const before = requested.length;
  retainedPharmacy(); retainedPeriod();
  cursor = 0; tree = Screen(); flush(); await new Promise(setImmediate);
  assert.equal(requested.length, before, 'pending write prevents foreign-scope requests');
  cursor = 0; tree = Screen();
  assert.equal(findNodes(tree, 'ListItem').filter(p => p.accessibilityState.checked).length, 0, 'filtered non-selected options did not become selected');
  deferredAction.resolve({ id: 999 }); await new Promise(setImmediate);
});\n`;
  const context = {test, assert, fs, path, vm, ts: dependency('typescript'), text: fs.readFileSync(path.join(__dirname, '../app/workforce-timesheets.tsx'), 'utf8'), __dirname, setImmediate, console, Promise};
  vm.runInNewContext(caseSource, context);
}
