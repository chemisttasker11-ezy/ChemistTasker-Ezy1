const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const local = path.resolve(__dirname, '../node_modules/typescript');
const fallback = path.resolve(__dirname, '../../../pr249-m1-integration-20261105/frontend_mobile/node_modules/typescript');
const ts = require(fs.existsSync(local) ? local : fallback);

function load(name) {
  const exports = {};
  const tokens = { colors: { border: 'border', surfaceBg: 'white', textPrimary: 'black', textSecondary: 'gray', accentStrong: 'violet', tone: { violet: { bg: 'light' } } }, font: { inter: { medium: 'medium' } }, radius: { nested: 8, card: 12 }, space: { xs: 4, sm: 8 }, touch: { min: 44 }, type: { labelMedium: { fontSize: 14, lineHeight: 20 } } };
  const jsx = (component, props) => typeof component === 'function' ? component(props) : { type: component, props };
  const react = { useEffect: () => {} };
  const animated = { View: 'AnimatedView', Text: 'AnimatedText' };
  const mocks = {
    react: { ...react, default: react }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: x => x } },
    'react-native-paper': { Icon: 'Icon' },
    'react-native-reanimated': { __esModule: true, default: animated, interpolateColor: () => 'color', useAnimatedStyle: f => f(), useReducedMotion: () => true, useSharedValue: value => ({ value }), withTiming: x => x },
    '@/constants/tokens': tokens, '@/constants/motion': { durations: {}, easings: {} },
    './icon': { sizeIcon: () => null }, './ScalePressable': { ScalePressable: 'ScalePressable' },
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../components/ui', name + '.tsx'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: id => { if (!(id in mocks)) throw Error(id); return mocks[id]; } });
  return exports;
}
function flattenStyle(style) { return Object.assign({}, ...[style].flat(Infinity).filter(x => x && typeof x === 'object')); }

test('form choices expose full labels and disabled state, with Paper handler order', () => {
  const { ResponsiveSegmentedButtons } = load('ResponsiveSegmentedButtons');
  const calls = [];
  const tree = ResponsiveSegmentedButtons({ value: 'a', onValueChange: v => calls.push(v), buttons: [
    { value: 'a', label: 'Open to Opportunities' },
    { value: 'b', label: 'Posting Availability', onPress: () => calls.push('press') },
    { value: 'c', label: 'Disabled choice', disabled: true },
  ] });
  const buttons = tree.props.children;
  assert.equal(tree.props.accessibilityRole, 'radiogroup');
  assert.equal(flattenStyle(tree.props.style).flexWrap, 'wrap');
  assert.equal(buttons[0].props.accessibilityLabel, 'Open to Opportunities');
  assert.equal(buttons[0].props.accessibilityState.checked, true);
  assert.equal(buttons[2].props.accessibilityState.disabled, true);
  assert.equal(flattenStyle(buttons[0].props.style).minHeight, 48);
  assert.equal(flattenStyle(buttons[0].props.style).maxWidth, '100%');
  buttons[1].props.onPress({}); buttons[2].props.onPress({});
  assert.deepEqual(calls, ['press', 'b']);
});

test('tabs keep names, panel IDs, stable selection geometry and wrap without font caps', () => {
  const { SegmentTabs, tabPanelProps } = load('SegmentTabs');
  const calls = [];
  const tabs = [{ value: 'a', label: 'A long category' }, { value: 'b', label: 'Another category' }];
  const tree = SegmentTabs({ tabs, value: 'a', onChange: v => calls.push(v), label: 'Categories', idPrefix: 'example' });
  const children = tree.props.children;
  assert.equal(tree.props.accessibilityRole, 'tablist');
  assert.equal(flattenStyle(tree.props.style).flexWrap, 'wrap');
  assert.equal(children[0].props.accessibilityState.selected, true);
  assert.equal(children[0].props.accessibilityLabel, 'A long category');
  assert.equal(children[0].props.nativeID, 'example-tab-a');
  assert.equal(tabPanelProps('example', 'a').accessibilityLabelledBy, 'example-tab-a');
  assert.deepEqual(flattenStyle(children[0].props.style), flattenStyle(children[1].props.style));
  const text = children[0].props.children.props.children.at(-1);
  assert.equal(text.props.numberOfLines, undefined);
  assert.equal(text.props.maxFontSizeMultiplier, undefined);
  children[0].props.onPress(); children[1].props.onPress();
  assert.deepEqual(calls, ['b']);
});
