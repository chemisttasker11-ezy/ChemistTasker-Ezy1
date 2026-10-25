const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(relativePath, modules, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (id) => modules[id] || {}, console, ...globals });
  return exports;
}

async function bootstrap(currentUser, { baseURL = 'https://api.example.test', token = 'cached-access', refreshResponse } = {}) {
  const states = [];
  const effects = [];
  let context;
  let generation = 0;
  let stored = { access: 'cached-access', refresh: 'cached-refresh', user: { id: 7, username: 'cached', role: 'OWNER' } };
  const react = {
    createContext: () => ({ Provider: () => null }),
    useState: (initial) => {
      const index = states.length;
      states.push(initial);
      return [initial, (value) => { states[index] = value; }];
    },
    useEffect: (effect) => effects.push(effect),
    useRef: (current) => ({ current }),
    useCallback: (fn) => fn,
    createElement: (_, props) => { if (props?.value) context = props.value; return null; },
  };
  const modules = {
    react,
    '@chemisttasker/shared-core': { getOnboarding: async () => ({}) },
    'react-native': { Platform: { OS: 'ios' } },
    '../utils/apiUrl': { resolveApiBaseUrl: () => baseURL },
    '../utils/nativeIdentityTransport': { nativeIdentityTransport: { currentUser } },
    '../utils/authSession': {
      readStoredSession: async () => stored,
      primeInMemorySession: () => {},
      getValidAccessToken: async () => token,
      clearStoredSession: async () => { generation++; stored = null; },
      writeStoredSession: async (session, expected = generation) => {
        if (expected !== generation) return false;
        stored = session;
        return true;
      },
      getSessionGeneration: () => generation,
      invalidateSessionGeneration: () => ++generation,
    },
    '../utils/biometricAuth': {
      getBiometricAvailability: async () => ({ available: false }),
      getSavedBiometricUser: async () => null,
    },
  };
  if (refreshResponse) {
    const secure = new Map([['ACCESS_KEY', stored.access], ['REFRESH_KEY', stored.refresh]]);
    const asyncStorage = new Map([['AUTH_USER', JSON.stringify(stored.user)]]);
    modules['../utils/authSession'] = loadModule('../utils/authSession.ts', {
      'react-native': modules['react-native'],
      '@react-native-async-storage/async-storage': {
        getItem: async (key) => asyncStorage.get(key) ?? null,
        setItem: async (key, value) => { asyncStorage.set(key, value); },
        removeItem: async (key) => { asyncStorage.delete(key); },
      },
      './secureStorage': {
        secureGet: async (key) => secure.get(key) ?? null,
        secureSet: async (key, value) => { secure.set(key, value); },
        secureRemove: async (key) => { secure.delete(key); },
      },
    }, { fetch: refreshResponse, Buffer });
  }
  const exports = loadModule('../context/AuthContext.tsx', modules);
  exports.AuthProvider({ children: null });
  effects[0]();
  await new Promise(setImmediate);
  return { states, stored: refreshResponse ? modules['../utils/authSession'].readStoredSession : () => stored, context };
}

for (const status of [401, 403, 500, 'network']) {
  test(`startup does not trust cached identity after ${status}`, async () => {
    const env = await bootstrap(async () => { throw Object.assign(new Error('Unable to verify'), { response: { status } }); });
    assert.equal(env.states[0], null);
    assert.equal(env.states[1], null);
    assert.equal(env.states[2], null);
    assert.equal(env.states[3], false);
    assert.equal(env.stored(), null);
  });
}

test('startup never exposes cached role while verification is pending', async () => {
  const env = await bootstrap(() => new Promise(() => {}));
  assert.equal(env.states[2], null);
  assert.equal(env.states[3], true);
});

test('startup accepts server-verified identity instead of cached role', async () => {
  const env = await bootstrap(async () => ({ data: { id: 7, username: 'verified', role: 'PHARMACIST' } }));
  assert.equal(env.states[0], 'cached-access');
  assert.equal(env.states[2].role, 'PHARMACIST');
  assert.equal(env.stored().user.username, 'verified');
  assert.equal(env.states[3], false);
});

test('startup clears cached identity if verification is unavailable', async () => {
  for (const options of [{ baseURL: '' }, { token: null }]) {
    const env = await bootstrap(async () => ({ data: null }), options);
    assert.equal(env.states[2], null);
    assert.equal(env.stored(), null);
  }
});

for (const status of [400, 401]) {
  test(`startup finishes signed out when its own refresh returns ${status}`, async () => {
    let refreshCalls = 0;
    const env = await bootstrap(() => assert.fail('Invalid refresh must not load a user'), {
      refreshResponse: async () => { refreshCalls++; return { status, ok: false }; },
    });
    assert.equal(refreshCalls, 1);
    assert.equal(await env.stored(), null);
    assert.deepEqual(env.states.slice(0, 4), [null, null, null, false]);
  });
}

test('startup accepts a successful refresh and the server-verified user', async () => {
  const env = await bootstrap(async () => ({ data: { id: 7, username: 'verified', role: 'PHARMACIST' } }), {
    refreshResponse: async () => ({ status: 200, ok: true, json: async () => ({ access: 'rotated-access', refresh: 'rotated-refresh' }) }),
  });
  assert.equal(env.states[0], 'rotated-access');
  assert.equal(env.states[1], 'rotated-refresh');
  assert.equal(env.states[2].role, 'PHARMACIST');
  assert.equal(env.states[3], false);
  assert.equal((await env.stored()).user.username, 'verified');
});

test('a newer login wins over a pending startup refresh rejection', async () => {
  let rejectRefresh;
  const env = await bootstrap(() => assert.fail('Stale startup must not load a user'), {
    refreshResponse: () => new Promise((resolve) => { rejectRefresh = resolve; }),
  });
  assert.equal(env.states[3], true);
  const user = { id: 8, username: 'new-login', role: 'PHARMACIST' };
  await env.context.login('new-access', 'new-refresh', user);
  rejectRefresh({ status: 401, ok: false });
  await new Promise(setImmediate);
  assert.equal(env.states[0], 'new-access');
  assert.equal(env.states[1], 'new-refresh');
  assert.equal(env.states[2].id, 8);
  assert.equal(env.states[3], false);
  assert.equal((await env.stored()).user.id, 8);
});
