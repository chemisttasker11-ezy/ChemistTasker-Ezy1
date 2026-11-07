const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function getTs() {
  try {
    return require('typescript');
  } catch {
    const candidatePath = path.resolve(__dirname, '../node_modules/typescript');
    return require(candidatePath);
  }
}

const ts = getTs();

function loadProductionModule(mocks = {}) {
  const componentPath = path.resolve(__dirname, '../components/RootPageHeader.tsx');
  const sourceCode = fs.readFileSync(componentPath, 'utf8');
  const transpiled = ts.transpileModule(sourceCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const defaultMocks = {
    react: require('react'),
    'react-native': {
      BackHandler: { addEventListener: () => ({ remove: () => {} }) },
      StyleSheet: { create: (s) => s },
    },
    'expo-router': {
      Stack: { Screen: (props) => props },
      useFocusEffect: (cb) => cb(),
      useRouter: () => ({ canGoBack: () => false, back: () => {}, replace: () => {} }),
    },
    'lucide-react-native': {
      ChevronLeft: () => null,
    },
    '@/context/AuthContext': {
      useAuth: () => ({ user: null }),
    },
    '@/components/ui': {
      ScalePressable: (props) => props,
    },
    '@/constants/tokens': {
      colors: { textPrimary: '#000' },
      radius: { pill: 999 },
      touch: { min: 48 },
    },
    '@/roles/shared/forms/UnsavedChangesRegistryProvider': {
      useGuardedNavigation: () => (fn) => fn(),
    },
    '@/utils/mobilePersona': {
      getRoleHome: (role) => `/${String(role).toLowerCase()}/dashboard`,
      resolveInitialWorkspace: async () => '/resolved/home',
    },
  };

  const mergedMocks = { ...defaultMocks, ...mocks };

  const moduleExports = {};
  const moduleObj = { exports: moduleExports };
  const customRequire = (specifier) => {
    if (mergedMocks[specifier]) return mergedMocks[specifier];
    try {
      return require(specifier);
    } catch {
      throw new Error(`Unhandled mock for specifier: ${specifier}`);
    }
  };

  const context = vm.createContext({
    module: moduleObj,
    exports: moduleExports,
    require: customRequire,
    console,
    process,
  });

  vm.runInContext(transpiled, context);
  return moduleObj.exports;
}

test('executeRootBack actual history', async () => {
  const { executeRootBack } = loadProductionModule();
  let backed = false;
  let replaced = null;
  const router = {
    canGoBack: () => true,
    back: () => { backed = true; },
    replace: (dst) => { replaced = dst; },
  };
  await executeRootBack(router, { id: 1, role: 'PHARMACIST' });
  assert.equal(backed, true);
  assert.equal(replaced, null);
});

test('executeRootBack cold workspace resolution (admin fallback)', async () => {
  const { executeRootBack } = loadProductionModule({
    '@/utils/mobilePersona': {
      resolveInitialWorkspace: async () => '/admin',
      getRoleHome: (r) => `/${r}/dashboard`,
    },
  });
  let replaced = null;
  const router = {
    canGoBack: () => false,
    back: () => {},
    replace: (dst) => { replaced = dst; },
  };
  await executeRootBack(router, { id: 1, role: 'PHARMACY_MANAGER' });
  assert.equal(replaced, '/admin');
});

test('executeRootBack signedout fallback', async () => {
  const { executeRootBack } = loadProductionModule();
  let replaced = null;
  const router = {
    canGoBack: () => false,
    back: () => {},
    replace: (dst) => { replaced = dst; },
  };
  await executeRootBack(router, null);
  assert.equal(replaced, '/welcome');
});

test('executeRootBack error fallback to roleHome', async () => {
  const { executeRootBack } = loadProductionModule({
    '@/utils/mobilePersona': {
      resolveInitialWorkspace: async () => { throw new Error('failure'); },
      getRoleHome: (r) => `/${String(r).toLowerCase()}/dashboard`,
    },
  });
  let replaced = null;
  const router = {
    canGoBack: () => false,
    back: () => {},
    replace: (dst) => { replaced = dst; },
  };
  await executeRootBack(router, { id: 1, role: 'EXPLORER' });
  assert.equal(replaced, '/explorer/dashboard');
});

test('executeRootBack accountchange success expects no stale replace', async () => {
  let resolvePromise;
  const { executeRootBack } = loadProductionModule({
    '@/utils/mobilePersona': {
      resolveInitialWorkspace: () => new Promise((resolve) => { resolvePromise = resolve; }),
      getRoleHome: (r) => `/${String(r).toLowerCase()}/dashboard`,
    },
  });
  let replaced = null;
  const router = {
    canGoBack: () => false,
    back: () => {},
    replace: (dst) => { replaced = dst; },
  };
  const userRef = { current: { id: 1, email: 'initial@playground.test' } };
  const callPromise = executeRootBack(router, userRef.current, userRef);
  userRef.current = { id: 2, email: 'new@playground.test' };
  resolvePromise('/initial/dashboard');
  await callPromise;
  assert.equal(replaced, null, 'Must return without any navigation on account change');
});

test('executeRootBack accountchange error expects no stale replace', async () => {
  let rejectPromise;
  const { executeRootBack } = loadProductionModule({
    '@/utils/mobilePersona': {
      resolveInitialWorkspace: () => new Promise((_, reject) => { rejectPromise = reject; }),
      getRoleHome: (r) => `/${String(r).toLowerCase()}/dashboard`,
    },
  });
  let replaced = null;
  const router = {
    canGoBack: () => false,
    back: () => {},
    replace: (dst) => { replaced = dst; },
  };
  const userRef = { current: { id: 1, email: 'initial@playground.test' } };
  const callPromise = executeRootBack(router, userRef.current, userRef);
  userRef.current = { id: 2, email: 'new@playground.test' };
  rejectPromise(new Error('fail'));
  await callPromise;
  assert.equal(replaced, null, 'Must return without any navigation on account change even in catch');
});

test('executeRootBack signedout while resolving navigates to /welcome', async () => {
  let resolvePromise;
  const { executeRootBack } = loadProductionModule({
    '@/utils/mobilePersona': {
      resolveInitialWorkspace: () => new Promise((resolve) => { resolvePromise = resolve; }),
      getRoleHome: (r) => `/${String(r).toLowerCase()}/dashboard`,
    },
  });
  let replaced = null;
  const router = {
    canGoBack: () => false,
    back: () => {},
    replace: (dst) => { replaced = dst; },
  };
  const userRef = { current: { id: 1, email: 'initial@playground.test' } };
  const callPromise = executeRootBack(router, userRef.current, userRef);
  userRef.current = null;
  resolvePromise('/initial/dashboard');
  await callPromise;
  assert.equal(replaced, '/welcome', 'Signed out during resolution falls back to /welcome');
});

test('RootPageHeader wiring: headerLeft.onPress with guardedNavigation denied leaves router untouched', () => {
  let routerTouched = false;
  const router = {
    canGoBack: () => { routerTouched = true; return false; },
    back: () => { routerTouched = true; },
    replace: () => { routerTouched = true; },
  };
  let effectCleanup = null;
  let backHandlerRemoved = false;

  const React = { ...require('react'), useRef: (current) => ({ current }), useCallback: (callback) => callback };
  const { RootPageHeader } = loadProductionModule({
    react: React,
    'expo-router': {
      Stack: { Screen: (props) => props },
      useRouter: () => router,
      useFocusEffect: (cb) => { effectCleanup = cb(); },
    },
    'react-native': {
      BackHandler: {
        addEventListener: () => ({
          remove: () => { backHandlerRemoved = true; },
        }),
      },
      StyleSheet: { create: (s) => s },
    },
    '@/context/AuthContext': {
      useAuth: () => ({ user: { id: 10 } }),
    },
    '@/roles/shared/forms/UnsavedChangesRegistryProvider': {
      useGuardedNavigation: () => (_action) => {
        // Navigation denied by guard
      },
    },
  });

  const rendered = RootPageHeader({ title: 'Notifications' }).props;
  assert.equal(rendered.options.headerShown, true);
  assert.equal(rendered.options.title, 'Notifications');

  const headerLeftElement = rendered.options.headerLeft();
  headerLeftElement.props.onPress();
  assert.equal(routerTouched, false, 'Router must remain untouched when guardedNavigation denies leave');

  if (typeof effectCleanup === 'function') {
    effectCleanup();
    assert.equal(backHandlerRemoved, true, 'Focus effect cleanup must remove BackHandler listener');
  }
});

test('RootPageHeader disabled mode disables back navigation, consumes hardware back, and disables gestures', () => {
  let routerTouched = false;
  const router = {
    canGoBack: () => { routerTouched = true; return false; },
    back: () => { routerTouched = true; },
    replace: () => { routerTouched = true; },
  };
  let backHandlerCallback = null;
  let backHandlerRemoved = false;
  let effectCleanup = null;

  const React = { ...require('react'), useRef: (current) => ({ current }), useCallback: (callback) => callback };
  const { RootPageHeader } = loadProductionModule({
    react: React,
    'expo-router': {
      Stack: { Screen: (props) => props },
      useRouter: () => router,
      useFocusEffect: (cb) => { effectCleanup = cb(); },
    },
    'react-native': {
      BackHandler: {
        addEventListener: (event, cb) => {
          if (event === 'hardwareBackPress') backHandlerCallback = cb;
          return { remove: () => { backHandlerRemoved = true; } };
        },
      },
      StyleSheet: { create: (s) => s },
    },
    '@/context/AuthContext': {
      useAuth: () => ({ user: { id: 10 } }),
    },
    '@/roles/shared/forms/UnsavedChangesRegistryProvider': {
      useGuardedNavigation: () => (fn) => fn(),
    },
  });

  // 1. Normal caller (default disabled=false): gestureEnabled is true, headerLeft button not disabled
  const normalProps = RootPageHeader({ title: 'My Hours' }).props;
  assert.equal(normalProps.options.gestureEnabled, true, 'Default caller must have gestures enabled');
  const normalButton = normalProps.options.headerLeft();
  assert.equal(Boolean(normalButton.props.disabled), false, 'Default headerLeft button must not be disabled');

  // 2. Disabled caller (disabled: true, e.g. submitting != null): gestureEnabled is false, button disabled
  const disabledProps = RootPageHeader({ title: 'My Hours', disabled: true }).props;
  assert.equal(disabledProps.options.gestureEnabled, false, 'Disabled header must disable Stack swipe gesture');
  const disabledButton = disabledProps.options.headerLeft();
  assert.equal(disabledButton.props.disabled, true, 'Disabled headerLeft button must have disabled prop');
  assert.equal(disabledButton.props.accessibilityState?.disabled, true, 'Disabled headerLeft button must be accessible disabled');

  // Button onPress must not touch router
  disabledButton.props.onPress();
  assert.equal(routerTouched, false, 'Pressing disabled header button must not navigate');

  // Hardware back press must consume event and not touch router
  assert.equal(typeof backHandlerCallback, 'function', 'Hardware back listener must be registered');
  const consumed = backHandlerCallback();
  assert.equal(consumed, true, 'Hardware back handler must consume event when disabled');
  assert.equal(routerTouched, false, 'Hardware back must not navigate while disabled');

  // Focus effect cleanup removes BackHandler listener
  if (typeof effectCleanup === 'function') {
    effectCleanup();
    assert.equal(backHandlerRemoved, true, 'Focus effect cleanup must remove BackHandler listener');
  }
});

test('useRootBackAction: active outside shell registers BackHandler and invokes executeRootBack with persona helper', async () => {
  let backed = false;
  let replaced = null;
  const router = {
    canGoBack: () => false,
    back: () => { backed = true; },
    replace: (dst) => { replaced = dst; },
  };

  let backHandlerCallback = null;
  let backHandlerRemoved = false;
  let guardedCalled = false;

  const React = {
    ...require('react'),
    useRef: (current) => ({ current }),
    useCallback: (cb) => cb,
  };

  let effectCleanup = null;
  const { useRootBackAction } = loadProductionModule({
    react: React,
    'expo-router': {
      useRouter: () => router,
      useFocusEffect: (cb) => { effectCleanup = cb(); },
    },
    'react-native': {
      BackHandler: {
        addEventListener: (event, cb) => {
          if (event === 'hardwareBackPress') backHandlerCallback = cb;
          return { remove: () => { backHandlerRemoved = true; } };
        },
      },
      StyleSheet: { create: (s) => s },
    },
    '@/context/AuthContext': {
      useAuth: () => ({ user: { id: 42, role: 'PHARMACIST' } }),
    },
    '@/roles/shared/forms/UnsavedChangesRegistryProvider': {
      useGuardedNavigation: () => (fn) => { guardedCalled = true; fn(); },
    },
    '@/utils/mobilePersona': {
      getRoleHome: (role) => `/${String(role).toLowerCase()}/dashboard`,
      resolveInitialWorkspace: async (u) => `/resolved/${u.role.toLowerCase()}`,
    },
  });

  // 1. Outside shell (active=true, disabled=false)
  const { handleBack } = useRootBackAction({ active: true, disabled: false });
  assert.equal(typeof backHandlerCallback, 'function', 'BackHandler listener registered when active outside shell');

  // Trigger hardware back
  const consumed = backHandlerCallback();
  assert.equal(consumed, true, 'Hardware back returns true to consume event');
  assert.equal(guardedCalled, true, 'Guarded navigation was invoked');

  // Flush promises to let executeRootBack complete
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(replaced, '/resolved/pharmacist', 'Cold back used persona-aware resolveInitialWorkspace helper');

  // Cleanup
  if (typeof effectCleanup === 'function') {
    effectCleanup();
    assert.equal(backHandlerRemoved, true);
  }
});

test('useRootBackAction: inactive inside PersonaShell registers NO BackHandler listener', () => {
  let backHandlerRegistered = false;
  const React = {
    ...require('react'),
    useRef: (current) => ({ current }),
    useCallback: (cb) => cb,
  };

  const { useRootBackAction } = loadProductionModule({
    react: React,
    'expo-router': {
      useRouter: () => ({ canGoBack: () => false, back: () => {}, replace: () => {} }),
      useFocusEffect: (cb) => cb(),
    },
    'react-native': {
      BackHandler: {
        addEventListener: () => {
          backHandlerRegistered = true;
          return { remove: () => {} };
        },
      },
      StyleSheet: { create: (s) => s },
    },
  });

  // Inside PersonaShell (active=false)
  useRootBackAction({ active: false });
  assert.equal(backHandlerRegistered, false, 'No BackHandler listener registered when inactive inside shell');
});

test('useRootBackAction: disabled/busy consumes hardware back without navigating', () => {
  let routerNavigated = false;
  let guardedNavigated = false;
  let backHandlerCallback = null;

  const React = {
    ...require('react'),
    useRef: (current) => ({ current }),
    useCallback: (cb) => cb,
  };

  const { useRootBackAction } = loadProductionModule({
    react: React,
    'expo-router': {
      useRouter: () => ({
        canGoBack: () => true,
        back: () => { routerNavigated = true; },
        replace: () => { routerNavigated = true; },
      }),
      useFocusEffect: (cb) => cb(),
    },
    'react-native': {
      BackHandler: {
        addEventListener: (event, cb) => {
          if (event === 'hardwareBackPress') backHandlerCallback = cb;
          return { remove: () => {} };
        },
      },
      StyleSheet: { create: (s) => s },
    },
    '@/roles/shared/forms/UnsavedChangesRegistryProvider': {
      useGuardedNavigation: () => (fn) => { guardedNavigated = true; fn(); },
    },
  });

  const { handleBack } = useRootBackAction({ active: true, disabled: true });
  // Calling handleBack directly when disabled
  handleBack();
  assert.equal(guardedNavigated, false, 'Disabled handleBack does not invoke guarded navigation');
  assert.equal(routerNavigated, false, 'Disabled handleBack does not navigate');

  // Triggering hardware back when disabled
  assert.equal(typeof backHandlerCallback, 'function');
  const consumed = backHandlerCallback();
  assert.equal(consumed, true, 'Hardware back returns true to consume event while disabled');
  assert.equal(routerNavigated, false, 'Hardware back does not navigate while disabled');
});

test('ParityPage source wiring: uses useRootBackAction only outside shell, honors backDisabled, no generic / fallback', () => {
  const parityPath = path.resolve(__dirname, '../features/parity/ParityUI.tsx');
  const paritySource = fs.readFileSync(parityPath, 'utf8');

  // Static checks on ParityUI source
  assert.match(paritySource, /import \{ useRootBackAction \} from '@\/components\/RootPageHeader'/);
  assert.match(paritySource, /const \{ handleBack \} = useRootBackAction\({/);
  assert.match(paritySource, /active: !inShell/);
  assert.match(paritySource, /disabled: backDisabled/);
  assert.match(paritySource, /onPress=\{handleBack\}/);
  assert.doesNotMatch(paritySource, /router\.replace\('\/'\)/, 'Generic "/" cold fallback must be eliminated from ParityPage');

  // VM compilation check
  const transpiled = ts.transpileModule(paritySource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  assert.ok(transpiled.length > 0, 'ParityUI transpiled successfully');
});
