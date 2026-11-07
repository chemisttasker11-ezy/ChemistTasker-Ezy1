const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(fs.existsSync(path.resolve(__dirname, '../node_modules/typescript')) ? path.resolve(__dirname, '../node_modules/typescript') : path.resolve(__dirname, '../node_modules/typescript'));
const deep = new Proxy(function () {}, { get: (_, key) => key === Symbol.toPrimitive ? () => 1 : deep, apply: () => deep });
const jsx = (type, props) => typeof type === 'function' ? type(props) : { type, props };
const react = { memo: x => x, createContext: () => ({}), useContext: () => ({}) };
const native = { Text: 'Text', View: 'View', StyleSheet: { create: x => x, hairlineWidth: 1 } };
function load(file, mocks) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: id => mocks[id] ?? deep });
  return exports;
}
const base = { react: { ...react, default: react }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': native, '@/constants/tokens': deep };
const { Pill } = load('components/ui/Pill.tsx', { ...base, './ScalePressable': { ScalePressable: 'ScalePressable' }, './tone': { toneColors: () => ({ bg: 'bg', fg: 'fg' }) }, './icon': { sizeIcon: () => null } });
const parity = load('features/parity/ParityUI.tsx', { ...base, '@/components/ui': { Pill }, '@/components/ui/tone': { alpha: () => 'color' } });
function label(tree) { return tree.props.children.props.children.props.children.at(-1); }
test('choice chips render uncapped full labels and retain selection and callbacks', () => {
  const calls = [];
  const tree = parity.ChoiceChips({ value: 'a', onChange: value => calls.push(value), options: [{ value: 'a', label: 'Professional services' }, { value: 'b', label: 'Not super eligible' }] });
  const [a, b] = tree.props.children;
  assert.equal(a.props.accessibilityLabel, 'Professional services');
  assert.equal(a.props.accessibilityState.selected, true);
  assert.equal(b.props.accessibilityState.selected, false);
  assert.equal(label(a).props.children, 'Professional services');
  assert.equal(label(a).props.numberOfLines, undefined);
  assert.equal(label(a).props.maxFontSizeMultiplier, undefined);
  b.props.onPress();
  assert.deepEqual(calls, ['b']);
  const disabled = parity.ChoiceChips({ value: 'a', options: [{ value: 'a', label: 'A' }], onChange: () => {}, disabled: true });
  assert.equal(disabled.props.children[0].props.accessibilityState.disabled, true);
});
test('status pills retain their existing one-line capped appearance', () => {
  const status = Pill({ label: 'Pending' });
  const text = status.props.children.props.children.at(-1);
  assert.equal(text.props.numberOfLines, 1);
  assert.equal(text.props.maxFontSizeMultiplier, 1.2);
});

test('shift time filters render uncapped choices and preserve their callback', () => {
  const sidebar = load('roles/shared/shifts/ShiftsBoard/components/FiltersSidebar.tsx', { ...base, '@/components/ui': { Pill, ScalePressable: 'ScalePressable', TextField: 'TextField' }, '../constants': { FILTER_SECTIONS: {} } }).default;
  const calls = [];
  const tree = sidebar({ filterConfig: { search: '', roles: [], dateRange: {}, employmentTypes: [], city: [], timeOfDay: ['morning'], minRate: 0 }, roleOptions: [], locationGroups: {}, expandedStates: {}, setFilterConfig: () => {}, toggleStateExpand: () => {}, toggleStateSelection: () => {}, toggleFilter: (...args) => calls.push(args), toggleBooleanFilter: () => {} });
  function find(node, name) {
    if (!node || typeof node !== 'object') return;
    if (node.props?.accessibilityLabel === name) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, name); if (result) return result; }
  }
  const morning = find(tree, 'Morning');
  const afternoon = find(tree, 'Afternoon');
  assert.equal(morning.props.accessibilityState.selected, true);
  assert.equal(label(morning).props.numberOfLines, undefined);
  assert.equal(label(morning).props.maxFontSizeMultiplier, undefined);
  afternoon.props.onPress();
  assert.deepEqual(calls, [['timeOfDay', 'afternoon']]);
});
