const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadBrandLoader(mockReanimated, mockReducedMotion = false) {
  let renderedTree;
  let effectCleanup;
  const effects = [];

  const react = {
    createElement: (type, props, ...children) => {
      const node = { type, props: props || {}, children: children.flat(Infinity) };
      renderedTree = node;
      return node;
    },
    useEffect: (effect) => {
      effects.push(effect);
    },
  };

  const reanimated = {
    __esModule: true,
    useReducedMotion: () => mockReducedMotion,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: (updater) => updater(),
    cancelAnimation: mockReanimated.cancelAnimation,
    withRepeat: mockReanimated.withRepeat,
    withTiming: mockReanimated.withTiming,
    Easing: { linear: 'linear-easing' },
    default: {
      Image: 'Animated.Image',
    },
  };

  const modules = {
    react,
    'react-native': {
      StyleSheet: { create: (s) => s },
      View: 'View',
    },
    'react-native-reanimated': reanimated,
    '../../assets/images/splash-logo.png': 'mock-splash-logo-asset',
  };

  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../components/ui/BrandLoader.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;

  vm.runInNewContext(compiled, {
    exports,
    require: (id) => {
      if (modules[id]) return modules[id];
      throw new Error(`Unexpected import in BrandLoader: ${id}`);
    },
    console,
  });

  const Component = exports.BrandLoader;
  return {
    render: (props = {}) => {
      renderedTree = null;
      effects.length = 0;
      const element = Component(props);
      if (effects[0]) {
        effectCleanup = effects[0]();
      }
      return {
        element: renderedTree || element,
        cleanup: () => {
          if (effectCleanup) effectCleanup();
        },
      };
    },
    exports,
  };
}

function loadBrandActivityIndicator(brandLoaderExport) {
  const react = {
    createElement: (type, props, ...children) => typeof type === 'function' ? type(props) : ({
      type,
      props: props || {},
      children: children.flat(Infinity),
    }),
  };

  const modules = {
    react,
    'react-native': {
      View: 'View',
    },
    './BrandLoader': {
      BrandLoader: brandLoaderExport,
    },
  };

  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../components/ui/BrandActivityIndicator.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;

  vm.runInNewContext(compiled, {
    exports,
    require: (id) => {
      if (modules[id]) return modules[id];
      throw new Error(`Unexpected import in BrandActivityIndicator: ${id}`);
    },
    console,
  });

  return exports.BrandActivityIndicator;
}

test('BrandLoader uses PR248 splash-logo.png asset and scales by ~1.7 to compensate for padding', () => {
  const mockReanimated = {
    withTiming: (toValue, config) => ({ type: 'timing', toValue, config }),
    withRepeat: (animation, numberOfReps, reverse) => ({ type: 'repeat', animation, numberOfReps, reverse }),
    cancelAnimation: () => {},
  };

  const harness = loadBrandLoader(mockReanimated, false);
  assert.equal(harness.exports.BRAND_LOADER_SYMBOL, 'mock-splash-logo-asset', 'Must require splash-logo.png');
  assert.equal(harness.exports.BRAND_LOADER_SCALE, 1.7, 'Must export scale 1.7');

  const result = harness.render({ size: 44 });
  const container = result.element;
  assert.equal(container.props.style[1].width, 44);
  assert.equal(container.props.style[1].height, 44);
  assert.equal(container.props.style[0].overflow, 'visible', 'Container must have overflow visible so rotation is not clipped');

  // Animated.Image
  const image = container.children[0];
  assert.equal(image.type, 'Animated.Image');
  assert.equal(image.props.source, 'mock-splash-logo-asset');
  assert.equal(image.props.style[1].width, 44);
  assert.equal(image.props.style[1].height, 44);
  assert.equal(image.props.style[1].opacity, 0.65);

  // Animated style transform has rotate and scale: 1.7
  const transform = image.props.style[2].transform;
  assert.ok(Array.isArray(transform));
  assert.deepEqual(JSON.parse(JSON.stringify(transform[1])), { scale: 1.7 }, 'Animated transform must include scale 1.7');
});

test('BrandLoader animates positive 360 continuous clockwise with linear repeat (false reverse)', () => {
  let withRepeatCalled = false;
  let withRepeatArgs;
  let withTimingArgs;
  let cancelledSharedValue;

  const mockReanimated = {
    withTiming: (toValue, config) => {
      withTimingArgs = { toValue, config };
      return { type: 'timing', toValue, config };
    },
    withRepeat: (animation, numberOfReps, reverse) => {
      withRepeatCalled = true;
      withRepeatArgs = { animation, numberOfReps, reverse };
      return { type: 'repeat', animation, numberOfReps, reverse };
    },
    cancelAnimation: (sharedValue) => {
      cancelledSharedValue = sharedValue;
    },
  };

  const harness = loadBrandLoader(mockReanimated, false);
  const result = harness.render({ size: 56, accessibilityLabel: 'Checking registration status' });

  // 1. Clockwise positive 360 linear
  assert.equal(withTimingArgs.toValue, 360, 'Rotation target must be positive 360deg for clockwise rotation');
  assert.equal(withTimingArgs.config.easing, 'linear-easing', 'Must use linear easing for continuous spin');
  assert.equal(withRepeatCalled, true);
  assert.equal(withRepeatArgs.numberOfReps, -1, 'Must repeat infinitely');
  assert.equal(withRepeatArgs.reverse, false, 'Must NOT reverse (clockwise continuous 0 -> 360)');

  // 2. Accessibility & busy label
  const container = result.element;
  assert.equal(container.props.accessibilityRole, 'progressbar');
  assert.equal(container.props.accessibilityLabel, 'Checking registration status');
  assert.equal(container.props.accessibilityState.busy, true);

  // 3. Cleanup properly cancels animation
  result.cleanup();
  assert.ok(cancelledSharedValue, 'cancelAnimation must be called on cleanup');
  assert.equal(typeof cancelledSharedValue.value, 'object');
});

test('BrandLoader remains static and keeps 1.7 visual scale under reduced motion', () => {
  let withRepeatCalled = false;

  const mockReanimated = {
    withTiming: () => {},
    withRepeat: () => { withRepeatCalled = true; },
    cancelAnimation: () => {},
  };

  const harness = loadBrandLoader(mockReanimated, true);
  const result = harness.render({ size: 44, accessibilityLabel: 'Loading workspace' });

  assert.equal(withRepeatCalled, false, 'withRepeat must not be called when reduced motion is enabled');
  const container = result.element;
  assert.equal(container.props.accessibilityLabel, 'Loading workspace');
  assert.equal(container.props.accessibilityRole, 'progressbar');

  const image = container.children[0];
  // Static style has transform [{ scale: 1.7 }]
  assert.deepEqual(JSON.parse(JSON.stringify(image.props.style[2].transform)), [{ scale: 1.7 }], 'Static mark must preserve scale 1.7');
});

test('BrandLoader animating=false displays static mark without animation loop', () => {
  let withRepeatCalled = false;

  const mockReanimated = {
    withTiming: () => {},
    withRepeat: () => { withRepeatCalled = true; },
    cancelAnimation: () => {},
  };

  const harness = loadBrandLoader(mockReanimated, false);
  const result = harness.render({ size: 44, animating: false, accessibilityLabel: 'Still mark' });

  assert.equal(withRepeatCalled, false, 'withRepeat must not be called when animating is false');
  const container = result.element;
  assert.equal(container.props.accessibilityState.busy, false);

  const image = container.children[0];
  assert.deepEqual(JSON.parse(JSON.stringify(image.props.style[2].transform)), [{ scale: 1.7 }], 'Static mark must preserve scale 1.7');
});

test('BrandActivityIndicator: handles size mapping, wrapper layout style, and animating/hidesWhenStopped states', () => {
  let lastBrandLoaderProps = null;
  const mockBrandLoader = (props) => {
    lastBrandLoaderProps = props;
    return { type: 'BrandLoader', props };
  };

  const BrandActivityIndicator = loadBrandActivityIndicator(mockBrandLoader);

  // 1. Size mapping
  // Default: small -> 24
  let node = BrandActivityIndicator({ size: 'small' });
  assert.equal(node.type, 'View');
  assert.equal(lastBrandLoaderProps.size, 24);

  // Large -> 44
  node = BrandActivityIndicator({ size: 'large' });
  assert.equal(lastBrandLoaderProps.size, 44);

  // Numeric -> 36
  node = BrandActivityIndicator({ size: 36 });
  assert.equal(lastBrandLoaderProps.size, 36);

  // 2. Wrapper style belongs to outer View, not inner BrandLoader
  const customStyle = { marginVertical: 16, alignSelf: 'center' };
  node = BrandActivityIndicator({ size: 'small', style: customStyle, testID: 'indicator-wrapper' });
  assert.equal(node.props.style, customStyle, 'Outer View must receive style');
  assert.equal(node.props.testID, 'indicator-wrapper', 'Outer View must receive testID');
  assert.equal(lastBrandLoaderProps.style, undefined, 'Inner BrandLoader must not receive wrapper layout style');

  // 3. animating=false + hidesWhenStopped=true (default) returns null
  node = BrandActivityIndicator({ animating: false });
  assert.equal(node, null, 'Must return null when stopped and hidesWhenStopped is true');

  node = BrandActivityIndicator({ animating: false, hidesWhenStopped: true });
  assert.equal(node, null, 'Must return null when stopped and hidesWhenStopped is explicitly true');

  // 4. animating=false + hidesWhenStopped=false returns still mark
  node = BrandActivityIndicator({ animating: false, hidesWhenStopped: false, testID: 'still-indicator' });
  assert.notEqual(node, null, 'Must not return null when hidesWhenStopped is false');
  assert.equal(node.type, 'View');
  assert.equal(node.props.testID, 'still-indicator');
  assert.equal(lastBrandLoaderProps.animating, false, 'BrandLoader must receive animating=false for still mark');
});
