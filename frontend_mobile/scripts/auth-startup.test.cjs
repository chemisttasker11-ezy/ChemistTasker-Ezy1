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

async function bootstrap(currentUser, { baseURL = 'https://api.example.test', token = 'cached-access', refreshResponse, onBindSession, onReadStoredSession, onClearStoredSession, session } = {}) {
  const states = [];
  const effects = [];
  const appStateListeners = [];
  const netInfoListeners = [];
  let context;
  let generation = 0;
  let stored = session || { access: 'cached-access', refresh: 'cached-refresh', user: { id: 7, username: 'cached', role: 'OWNER' } };
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
    '@chemisttasker/shared-core': { getOnboarding: async () => ({}), logoutSession: async () => {} },
    'react-native': {
      Platform: { OS: 'ios' },
      AppState: { addEventListener: (_, listener) => { appStateListeners.push(listener); return { remove() {} }; } },
    },
    '@react-native-community/netinfo': { addEventListener: (listener) => { netInfoListeners.push(listener); return () => {}; } },
    '../utils/apiUrl': { resolveApiBaseUrl: () => baseURL },
    '../utils/nativeIdentityTransport': { nativeIdentityTransport: { currentUser } },
    '../utils/authSession': {
      readStoredSession: async () => {
        const snapshot = stored;
        if (onReadStoredSession) await onReadStoredSession();
        return snapshot;
      },
      primeInMemorySession: () => {},
      getValidAccessToken: async () => token,
      clearStoredSession: async () => {
        generation++;
        stored = null;
        if (onClearStoredSession) await onClearStoredSession();
      },
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
  if (onBindSession) onBindSession(modules['../utils/authSession']);
  const exports = loadModule('../context/AuthContext.tsx', modules);
  exports.AuthProvider({ children: null });
  effects[0]();
  await new Promise(setImmediate);
  const emit = async (listeners, value) => {
    assert.ok(listeners.length, 'no listener registered');
    for (const listener of listeners) listener(value);
    await new Promise(setImmediate);
  };
  return {
    states,
    stored: refreshResponse ? modules['../utils/authSession'].readStoredSession : () => stored,
    context,
    active: () => emit(appStateListeners, 'active'),
    reconnect: () => emit(netInfoListeners, { isConnected: true }),
  };
}

// Answers currentUser with each step in turn: an Error to throw, else the server user.
function serverSteps(...steps) {
  const fn = async () => {
    const step = steps[Math.min(fn.calls++, steps.length - 1)];
    if (step instanceof Error) throw step;
    return { data: step };
  };
  fn.calls = 0;
  return fn;
}
const networkError = () => new Error('Network Error');
const roleChanged = { id: 7, username: 'verified', role: 'PHARMACIST' };

for (const status of [401, 403]) {
  test(`startup does not trust cached identity after ${status}`, async () => {
    const env = await bootstrap(async () => { throw Object.assign(new Error('Unable to verify'), { response: { status } }); });
    assert.equal(env.states[0], null);
    assert.equal(env.states[1], null);
    assert.equal(env.states[2], null);
    assert.equal(env.states[3], false);
    assert.equal(env.stored(), null);
  });
}

for (const [label, error] of [['500', { response: { status: 500 } }], ['network error', {}]]) {
  test(`cold launch keeps the stored session and user after a ${label} from currentUser`, async () => {
    const env = await bootstrap(async () => { throw Object.assign(new Error('Network Error'), error); });
    assert.equal(env.states[0], 'cached-access');
    assert.equal(env.states[1], 'cached-refresh');
    assert.equal(env.states[2].username, 'cached');
    assert.equal(env.states[3], false);
    assert.equal(env.stored().refresh, 'cached-refresh');
  });
}

for (const [label, refreshResponse] of [['503', async () => ({ status: 503, ok: false })], ['network error', async () => { throw new TypeError('Network request failed'); }]]) {
  test(`cold launch keeps the stored session when its own refresh hits a ${label}`, async () => {
    const env = await bootstrap(() => assert.fail('No access token, no currentUser call'), { refreshResponse });
    assert.equal(env.states[1], 'cached-refresh');
    assert.equal(env.states[2].username, 'cached');
    assert.equal(env.states[3], false);
    assert.equal((await env.stored()).refresh, 'cached-refresh');
  });
}

test('offline start re-verifies on the next active and applies the changed server role', async () => {
  const currentUser = serverSteps(networkError(), roleChanged);
  const env = await bootstrap(currentUser);
  assert.equal(env.states[2].role, 'OWNER');
  await env.active();
  assert.equal(currentUser.calls, 2);
  assert.equal(env.states[2].role, 'PHARMACIST');
  assert.equal(env.stored().user.role, 'PHARMACIST');
  assert.equal(env.stored().refresh, 'cached-refresh');
  await env.active();
  assert.equal(currentUser.calls, 2, 'verified once, no more re-verification');
});

test('offline start then a 401 on the next active signs out and clears the session', async () => {
  const env = await bootstrap(serverSteps(networkError(), Object.assign(new Error('Unauthorized'), { response: { status: 401 } })));
  await env.active();
  assert.deepEqual(env.states.slice(0, 4), [null, null, null, false]);
  assert.equal(env.stored(), null);
});

test('offline start stays signed in through a failed re-verification and applies the next one', async () => {
  const currentUser = serverSteps(networkError(), Object.assign(new Error('Bad gateway'), { response: { status: 502 } }), roleChanged);
  const env = await bootstrap(currentUser);
  await env.active();
  assert.equal(currentUser.calls, 2);
  assert.equal(env.states[2].role, 'OWNER');
  assert.equal(env.stored().refresh, 'cached-refresh');
  await env.active();
  assert.equal(currentUser.calls, 3);
  assert.equal(env.states[2].role, 'PHARMACIST');
  assert.equal(env.stored().user.role, 'PHARMACIST');
});

test('sign-out after an offline start cancels the pending re-verification', async () => {
  const currentUser = serverSteps(networkError(), roleChanged);
  const env = await bootstrap(currentUser);
  await env.context.logout();
  await env.active();
  assert.equal(currentUser.calls, 1);
  assert.equal(env.states[2], null);
  assert.equal(env.stored(), null);
});

test('offline start re-verifies when connectivity returns', async () => {
  const currentUser = serverSteps(networkError(), roleChanged);
  const env = await bootstrap(currentUser);
  await env.reconnect();
  assert.equal(env.states[2].role, 'PHARMACIST');
});

test('a session verified at startup is not re-verified on active', async () => {
  const currentUser = serverSteps(roleChanged);
  const env = await bootstrap(currentUser);
  await env.active();
  assert.equal(currentUser.calls, 1);
});

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
  // No refresh token to retry with: an expired session is not an offline one.
  for (const options of [{ baseURL: '' }, { token: null, session: { access: 'cached-access', user: { id: 7, username: 'cached', role: 'OWNER' } } }]) {
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

test('startup finishes signed out when currentUser interceptor refresh clears session and throws 401', async () => {
  let sessionApi;
  const env = await bootstrap(
    async () => {
      // Production apiClient response interceptor clears stored session on me401 + refresh401
      await sessionApi.clearStoredSession();
      throw Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    },
    {
      onBindSession: (api) => { sessionApi = api; },
    }
  );
  assert.equal(env.states[0], null);
  assert.equal(env.states[1], null);
  assert.equal(env.states[2], null);
  assert.equal(env.states[3], false);
  assert.equal(await env.stored(), null);
});

test('a newer login while startup cleanup is awaited wins over stale session clearing', async () => {
  let sessionApi;
  let releaseCleanupRead;
  const cleanupReadGate = new Promise((resolve) => { releaseCleanupRead = resolve; });
  let currentUserCalled = false;

  const env = await bootstrap(
    async () => {
      currentUserCalled = true;
      await sessionApi.clearStoredSession();
      throw Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    },
    {
      onBindSession: (api) => { sessionApi = api; },
      onReadStoredSession: async () => {
        // Pause when readStoredSession is called during cleanup after currentUser cleared the session
        if (currentUserCalled) {
          await cleanupReadGate;
        }
      },
    }
  );

  // While startup cleanup is waiting on readStoredSession, a newer login completes:
  const newerUser = { id: 9, username: 'newer-login', role: 'PHARMACIST' };
  await env.context.login('new-access', 'new-refresh', newerUser);
  assert.equal(env.states[0], 'new-access');
  assert.equal(env.states[1], 'new-refresh');
  assert.equal(env.states[2]?.id, 9);
  assert.equal(env.states[3], false);

  // Now release the pending cleanup read:
  releaseCleanupRead();
  await new Promise(setImmediate);

  // Stale cleanup must not clear the newer user or override loading:
  assert.equal(env.states[0], 'new-access');
  assert.equal(env.states[1], 'new-refresh');
  assert.equal(env.states[2]?.id, 9);
  assert.equal(env.states[3], false);
  assert.equal((await env.stored())?.user?.id, 9);
});

test('a newer login while final clearStoredSession is pending wins over stale clearing', async () => {
  let releaseClear;
  const clearGate = new Promise((resolve) => { releaseClear = resolve; });
  let clearStarted = false;

  const env = await bootstrap(
    // Throws status 401 without clearing session, so bootstrapId stays unchanged and reaches bottom clear
    async () => {
      throw Object.assign(new Error('Unauthorized'), { response: { status: 401 } });
    },
    {
      onClearStoredSession: async () => {
        clearStarted = true;
        await clearGate;
      },
    }
  );

  assert.equal(clearStarted, true);
  // While clearStoredSession is pending, a newer login completes:
  const newerUser = { id: 10, username: 'login-during-clear', role: 'PHARMACIST' };
  await env.context.login('new-access', 'new-refresh', newerUser);
  assert.equal(env.states[0], 'new-access');
  assert.equal(env.states[1], 'new-refresh');
  assert.equal(env.states[2]?.id, 10);
  assert.equal(env.states[3], false);

  // Now release the pending clearStoredSession:
  releaseClear();
  await new Promise(setImmediate);

  // Verify newer login state and session are preserved:
  assert.equal(env.states[0], 'new-access');
  assert.equal(env.states[1], 'new-refresh');
  assert.equal(env.states[2]?.id, 10);
  assert.equal(env.states[3], false);
  assert.equal((await env.stored())?.user?.id, 10);
});
