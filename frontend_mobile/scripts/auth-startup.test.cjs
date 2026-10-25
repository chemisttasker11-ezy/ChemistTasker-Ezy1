const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

async function bootstrap(currentUser, { baseURL = 'https://api.example.test', token = 'cached-access' } = {}) {
  const states = [];
  const effects = [];
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
    createElement: () => null,
  };
  const modules = {
    react,
    'react-native': { Platform: { OS: 'ios' } },
    '../utils/apiUrl': { resolveApiBaseUrl: () => baseURL },
    '../utils/nativeIdentityTransport': { nativeIdentityTransport: { currentUser } },
    '../utils/authSession': {
      readStoredSession: async () => stored,
      primeInMemorySession: () => {},
      getValidAccessToken: async () => token,
      clearStoredSession: async () => { stored = null; },
      writeStoredSession: async (session) => { stored = session; return true; },
      getSessionGeneration: () => 0,
      invalidateSessionGeneration: () => 1,
    },
    '../utils/biometricAuth': {
      getBiometricAvailability: async () => ({ available: false }),
      getSavedBiometricUser: async () => null,
    },
  };
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, '../context/AuthContext.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, { exports, require: (id) => modules[id] || {}, console });
  exports.AuthProvider({ children: null });
  effects[0]();
  await new Promise(setImmediate);
  return { states, stored: () => stored };
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
