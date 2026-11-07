const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
function setup(fontScale = 1) {
  const state = []; let cursor = 0;
  const react = { useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; }, useRef: () => ({ current: { measureInWindow: cb => cb(10, 20, 120, 48) } }) };
  const jsx = (type, props) => ({ type, props: props || {} });
  const tokens = { colors: { border: 'border', surfaceBg: 'white', textSecondary: 'gray', accentStrong: 'violet', tone: { violet: { bg: 'light', border: 'border' } } }, font: { inter: { medium: 'medium', semiBold: 'bold' } }, radius: { nested: 8, card: 12 }, space: { sm: 8 }, type: { labelMedium: { fontSize: 14, lineHeight: 20 } } };
  const mocks = { react: { ...react, default: react }, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { AccessibilityInfo: { setAccessibilityFocus() {} }, findNodeHandle: () => null, Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: x => x, absoluteFill: {} }, useWindowDimensions: () => ({ fontScale, height: 800 }) }, '@/components/security/GuardedModal': { GuardedModal: 'Modal' }, 'react-native-paper': { Dialog: Object.assign('Dialog', { Title: 'Title', ScrollArea: 'ScrollArea' }), Portal: 'Portal' }, 'lucide-react-native': { ChevronDown: 'ChevronDown', Check: 'Check' }, '@/constants/tokens': tokens };
  const exports = {}; const source = fs.readFileSync(path.join(__dirname, '../components/ui/FitChoices.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { exports, require: id => mocks[id] ?? (() => { throw Error(id); })(), requestAnimationFrame: f => f() });
  return props => { cursor = 0; return exports.FitChoices(props); };
}
const children = node => node.props.children;
const layout = width => ({ nativeEvent: { layout: { width } } });
const style = value => Object.assign({}, ...[value].flat(Infinity).filter(x => x && typeof x === 'object'));
const containsTick = node => typeof node === 'string' ? node === '✓' : Array.isArray(node) ? node.some(containsTick) : node && typeof node === 'object' ? containsTick(node.props?.children) : false;
for (const tabs of [true, false]) test(`${tabs ? 'tabs' : 'form choices'} fit in a row or open an accessible selector`, () => {
  const render = setup(), calls = [];
  const props = { choices: [{ value: 'a', label: 'First', accessibilityLabel: 'First option' }, { value: 'b', label: 'Second', onPress: () => calls.push('press') }, { value: 'c', label: 'Disabled', disabled: true }], value: 'a', onChange: v => calls.push(v), label: 'Group', idPrefix: 'test', tabs };
  let tree = render(props); tree.props.onLayout(layout(400)); children(children(tree)[0]).forEach(n => n.props.onLayout(layout(50)));
  tree = render(props); const row = children(tree)[1]; assert.equal(row.props.accessibilityRole, tabs ? 'tablist' : 'radiogroup');
  const items = children(row); assert.equal(style(items[0].props.style).flex, 1); assert.equal(items[0].props.accessibilityLabel, 'First option'); assert.equal(items[2].props.accessibilityState.disabled, true);
  if (tabs) assert.equal(items[0].props.nativeID, 'test-tab-a');
  items[1].props.onPress({}); items[2].props.onPress({}); assert.deepEqual(calls, ['press', 'b']); calls.length = 0;
  tree.props.onLayout(layout(120)); tree = render(props); const pill = children(tree)[1]; assert.equal(pill.props.accessibilityRole, 'button'); assert.match(pill.props.accessibilityLabel, /Group, First option, double tap to change/); pill.props.onPress();
  tree = render(props); const dialog = children(tree)[2]; assert.equal(dialog.props.visible, true); const list = children(children(children(dialog))[1]); assert.equal(list.props.accessibilityRole, 'radiogroup'); const options = children(list); assert.equal(options.length, 3); assert.equal(options[0].props.accessibilityState.checked, true); assert.equal(options[0].props.nativeID, undefined); options[1].props.onPress({}); assert.deepEqual(calls, ['press', 'b']); assert.equal(children(render(props))[2].props.visible, false); assert.equal(containsTick(tree), false);
});

test('count changes keep the measured row until its new width arrives', () => {
  const render = setup();
  const props = { choices: [{ value: 'saved', label: 'Saved ? 3' }, { value: 'all', label: 'All' }], value: 'saved', onChange() {}, label: 'Views', tabs: true };
  let tree = render(props); assert.equal(children(tree)[1].props.accessibilityRole, 'tablist');
  tree.props.onLayout(layout(240)); children(children(tree)[0]).forEach(n => n.props.onLayout(layout(50)));
  tree = render({ ...props, choices: [{ value: 'saved', label: 'Saved ? 4' }, props.choices[1]] });
  assert.equal(children(tree)[1].props.accessibilityRole, 'tablist');
});
test('a label over the width limit collapses', () => {
  const render = setup(); const props = { choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], value: 'a', onChange() {}, label: 'Views', tabs: true };
  let tree = render(props); tree.props.onLayout(layout(145)); children(children(tree)[0]).forEach(n => n.props.onLayout(layout(50)));
  assert.equal(children(render(props))[1].props.accessibilityRole, 'button');
});

for (const [scale, width, labelWidth, expected] of [[1, 328, 65.5, 'tablist'], [1.3, 328, 85.15, 'button'], [1.3, 379.4, 85.15, 'button']]) test(`three icon tabs at ${width}dp and ${scale} scale`, () => {
  const render = setup(scale);
  const props = { choices: ['Public', 'Confirmed', 'History'].map(label => ({ value: label, label, icon: 'icon' })), value: 'Public', onChange() {}, label: 'Shifts', tabs: true };
  let tree = render(props); tree.props.onLayout(layout(width));
  children(children(tree)[0]).forEach((node, index) => node.props.onLayout(layout(index === 1 ? labelWidth : labelWidth - 10)));
  assert.equal(children(render(props))[1].props.accessibilityRole, expected);
});
