import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const appLockSrc = readFileSync(new URL('./appLock.ts', import.meta.url), 'utf8');
const { outputText: appLockJs } = ts.transpileModule(appLockSrc, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});

const gateSrc = readFileSync(new URL('../components/security/AppLockGate.tsx', import.meta.url), 'utf8');
const { outputText: gateJs } = ts.transpileModule(gateSrc, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
});

const mockStorage = new Map();
let mockProtectionStatus = false;
let platformOS = 'ios';
let mockUser = { id: 101 };
let mockLogoutShouldReject = false;
let deviceAuthDelay = 0;
let deviceAuthCalls = 0;
let deviceAuthResult = true;

function createReactHarness() {
  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];
  let rerenderScheduled = false;

  const reactMock = {
    useState(init) {
      const idx = cursor++;
      if (!(idx in state)) {
        state[idx] = typeof init === 'function' ? init() : init;
      }
      const setter = (v) => {
        const next = typeof v === 'function' ? v(state[idx]) : v;
        if (next !== state[idx]) {
          state[idx] = next;
          rerenderScheduled = true;
        }
      };
      return [state[idx], setter];
    },
    useRef(init) {
      const idx = cursor++;
      return (state[idx] ??= { current: init });
    },
    useMemo(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      if (prev && deps && prev.deps.every((d, i) => d === deps[i])) {
        return prev.value;
      }
      const value = fn();
      state[idx] = { deps, value };
      return value;
    },
    useCallback(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      if (prev && deps && prev.deps.every((d, i) => d === deps[i])) {
        return prev.fn;
      }
      state[idx] = { deps, fn };
      return fn;
    },
    useEffect(effect, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev[i]);
      state[idx] = deps;
      if (changed) {
        effects.push(() => {
          if (typeof cleanups[idx] === 'function') cleanups[idx]();
          const cl = effect();
          if (typeof cl === 'function') cleanups[idx] = cl;
        });
      }
    },
    useSyncExternalStore(sub, get) {
      return get();
    },
  };

  const flush = () => {
    while (effects.length > 0) {
      effects.shift()();
    }
  };

  const unmount = () => {
    for (const cl of cleanups) {
      if (typeof cl === 'function') cl();
    }
    cleanups.length = 0;
  };

  const renderUntilSettled = async (renderFn, maxTurns = 20) => {
    let turns = 0;
    let result;
    do {
      cursor = 0;
      rerenderScheduled = false;
      result = renderFn();
      flush();
      await new Promise((r) => setImmediate(r));
      turns++;
    } while (rerenderScheduled && turns < maxTurns);
    assert.ok(turns < maxTurns, `Render did not settle within ${maxTurns} turns (possible infinite loop)`);
    return result;
  };

  return { reactMock, flush, unmount, renderUntilSettled };
}

// Instantiate appLock module in VM
const appLockContext = {
  exports: {},
  require: (id) => {
    if (id === 'react') return { useSyncExternalStore: (s, g) => g() };
    if (id === 'react-native') return { Platform: { get OS() { return platformOS; } } };
    if (id === '@react-native-async-storage/async-storage') {
      return {
        __esModule: true,
        default: {
          getItem: async (k) => mockStorage.get(k) ?? null,
          setItem: async (k, v) => { mockStorage.set(k, v); },
        },
      };
    }
    if (id === 'expo-screen-capture') {
      return {
        enableAppSwitcherProtectionAsync: async () => { mockProtectionStatus = true; },
        disableAppSwitcherProtectionAsync: async () => { mockProtectionStatus = false; },
        preventScreenCaptureAsync: async () => { mockProtectionStatus = true; },
        allowScreenCaptureAsync: async () => { mockProtectionStatus = false; },
      };
    }
    throw new Error(`Unmocked dependency in appLock: ${id}`);
  },
  console, Date, Promise, Set, Array, Object, Number, String, Boolean, Error,
};
runInNewContext(appLockJs, appLockContext);
const appLock = appLockContext.exports;

test('validDelay accepts only approved grace periods', () => {
  assert.equal(appLock.validDelay(0), true);
  assert.equal(appLock.validDelay(30), true);
  assert.equal(appLock.validDelay(60), true);
  assert.equal(appLock.validDelay(300), true);
  assert.equal(appLock.validDelay(-1), false);
  assert.equal(appLock.validDelay('60'), false);
  assert.equal(appLock.validDelay(99999), false);
});

test('needsUnlock correctly gates fresh launch and background delay', () => {
  assert.equal(appLock.needsUnlock(null, 60000, 60), true);
  assert.equal(appLock.needsUnlock(1000, 60999, 60), false);
  assert.equal(appLock.needsUnlock(1000, 61000, 60), true);
  assert.equal(appLock.needsUnlock(1000, 1001, 0), true);
});

test('getAppLockPreference distinguishes missing, valid, and malformed valid JSON states', async () => {
  mockStorage.clear();
  const k = appLock.key(101);

  // Missing -> missing
  assert.equal((await appLock.getAppLockPreference(101)).status, 'missing');
  // Malformed {} -> unreadable
  mockStorage.set(k, '{}');
  assert.equal((await appLock.getAppLockPreference(101)).status, 'unreadable');
  // Malformed [] -> unreadable
  mockStorage.set(k, '[]');
  assert.equal((await appLock.getAppLockPreference(101)).status, 'unreadable');
  // Non-boolean enabled -> unreadable
  mockStorage.set(k, JSON.stringify({ enabled: 'true', delaySeconds: 60 }));
  assert.equal((await appLock.getAppLockPreference(101)).status, 'unreadable');
  // Invalid delay -> unreadable
  mockStorage.set(k, JSON.stringify({ enabled: true, delaySeconds: 999 }));
  assert.equal((await appLock.getAppLockPreference(101)).status, 'unreadable');
  // Valid -> ok
  await appLock.setAppLockPreference(101, { enabled: true, delaySeconds: 30 });
  const validPref = await appLock.getAppLockPreference(101);
  assert.equal(validPref.enabled, true);
  assert.equal(validPref.delaySeconds, 30);
  assert.equal(validPref.status, 'ok');
});

test('ScopedLock VM hook lifecycle: mount settles once, same-tick unlock exclusion, failed logout keeps lock', async () => {
  mockStorage.clear();
  platformOS = 'ios';
  mockProtectionStatus = false;
  mockUser = { id: 101 };
  mockLogoutShouldReject = false;
  deviceAuthCalls = 0;
  deviceAuthResult = true;
  await appLock.setAppLockPreference(101, { enabled: true, delaySeconds: 60 });

  const harness = createReactHarness();
  const exports = {};
  const gateContext = {
    exports, module: { exports },
    require: (id) => {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
      if (id === 'react-native') {
        return {
          Platform: { get OS() { return platformOS; } },
          StyleSheet: { create: s => s, absoluteFillObject: {} },
          View: 'View',
          AppState: { addEventListener: () => ({ remove: () => {} }) },
          DeviceEventEmitter: { addListener: () => ({ remove: () => {} }) },
        };
      }
      if (id === 'react-native-paper') return { Button: 'Button', Portal: 'Portal', Text: 'Text' };
      if (id === 'expo-router') return { useRouter: () => ({ replace: () => {} }) };
      if (id === '@/context/AuthContext') {
        return {
          useAuth: () => ({
            user: mockUser,
            logout: async () => {
              if (mockLogoutShouldReject) throw new Error('Logout network error');
            },
          }),
        };
      }
      if (id === '@/utils/biometricAuth') {
        return {
          authenticateWithDeviceLock: async () => {
            deviceAuthCalls++;
            if (deviceAuthDelay > 0) await new Promise(r => setTimeout(r, deviceAuthDelay));
            return deviceAuthResult;
          },
        };
      }
      if (id === '@/utils/appLock') return appLock;
      if (id === '@/components/ui/BrandLoader') return { BrandLoader: 'BrandLoader' };
      if (id === '@/constants/tokens') return { colors: { pageBg: '#fff', textPrimary: '#000', textSecondary: '#666', status: { red: { fg: 'red' } } }, space: { lg: 16, '3xl': 32 } };
      throw new Error(`Unmocked dependency in gate: ${id}`);
    },
    console, Date, Promise, Set, Array, Object, Number, String, Boolean, Error, setTimeout,
  };

  runInNewContext(gateJs + '\nexports.__ScopedLock = ScopedLock;\nexports.__AppLockGate = AppLockGate;', gateContext);
  const ScopedLock = exports.__ScopedLock;

  // 1. Mount settles once without infinite reload
  await harness.renderUntilSettled(() => ScopedLock({ userId: 101 }), 20);
  assert.equal(appLock.getAppLockState().isLocked, true, 'Mount must settle in locked state for enabled policy');
  assert.equal(appLock.isNativeProtectionActive(), true, 'Native protection must be active');

  // 2. Same-tick unlock exclusion: only 1 OS prompt fired
  const actions = appLock.getAppLockActions();
  assert.ok(actions, 'Actions must be registered in coordinator');
  deviceAuthDelay = 15;
  const [u1, u2] = await Promise.all([actions.unlock(), actions.unlock()]);
  assert.equal(deviceAuthCalls, 1, 'Only one OS prompt should fire for concurrent unlock attempts');
  assert.equal(u1, true);
  assert.equal(u2, false);

  // 3. Settled re-render stays unlocked
  await harness.renderUntilSettled(() => ScopedLock({ userId: 101 }), 20);
  assert.equal(appLock.getAppLockState().isLocked, false, 'Unlock must remain unlocked across re-render');

  // 4. Failed logout keeps cover and protection
  mockLogoutShouldReject = true;
  await actions.signInWithPassword();
  assert.equal(appLock.getAppLockState().isLocked, true, 'Failed logout must keep cover locked');
  assert.equal(appLock.isNativeProtectionActive(), true, 'Failed logout must keep native protection active');

  harness.unmount();
});

test('Web session skips native lock initialization and avoids deadlock', async () => {
  mockStorage.clear();
  platformOS = 'web';
  mockUser = { id: 777 };
  await appLock.setAppLockPreference(777, { enabled: true, delaySeconds: 60 });
  appLock.resetAppLockCoordinator();

  const harness = createReactHarness();
  const exports = {};
  const gateContext = {
    exports, module: { exports },
    require: (id) => {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
      if (id === 'react-native') {
        return {
          Platform: { get OS() { return platformOS; } },
          StyleSheet: { create: s => s, absoluteFillObject: {} },
          View: 'View',
          AppState: { addEventListener: () => ({ remove: () => {} }) },
          DeviceEventEmitter: { addListener: () => ({ remove: () => {} }) },
        };
      }
      if (id === 'react-native-paper') return { Button: 'Button', Portal: 'Portal', Text: 'Text' };
      if (id === 'expo-router') return { useRouter: () => ({ replace: () => {} }) };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: mockUser, logout: async () => {} }) };
      if (id === '@/utils/biometricAuth') return { authenticateWithDeviceLock: async () => true };
      if (id === '@/utils/appLock') return appLock;
      if (id === '@/components/ui/BrandLoader') return { BrandLoader: 'BrandLoader' };
      if (id === '@/constants/tokens') return { colors: { pageBg: '#fff', textPrimary: '#000', textSecondary: '#666', status: { red: { fg: 'red' } } }, space: { lg: 16, '3xl': 32 } };
      throw new Error(`Unmocked dependency in gate: ${id}`);
    },
    console, Date, Promise, Set, Array, Object, Number, String, Boolean, Error, setTimeout,
  };
  runInNewContext(gateJs + '\nexports.__AppLockGate = AppLockGate;', gateContext);
  const AppLockGate = exports.__AppLockGate;

  const result = await harness.renderUntilSettled(() => AppLockGate(), 20);
  assert.equal(result, null, 'AppLockGate must render null on web');
  assert.equal(appLock.getAppLockState().isLocked, false, 'Web session must not lock coordinator');
  assert.equal(appLock.isNativeProtectionActive(), false, 'Web session must not activate native protection');

  harness.unmount();
});

test('GuardedModal presentation logic retains mounted native modal while blocking subtree', () => {
  const gSrc = readFileSync(new URL('../components/security/GuardedModal.tsx', import.meta.url), 'utf8');
  assert.match(gSrc, /<Modal visible=\{visible\}/);
  assert.match(gSrc, /styles\.hiddenSubtree/);
  assert.match(gSrc, /style=\{\[styles\.container, style, isLocked && styles\.hiddenSubtree\]\}/);
  assert.match(gSrc, /pointerEvents=\{isLocked \? 'none' : 'auto'\}/);
  assert.match(gSrc, /if \(isLocked\) \{[\s\S]*return;[\s\S]*onRequestClose\?\.\(event\)/);
  assert.match(gSrc, /withModal=\{isLocked \? false : originalWithModal\}/);
});
