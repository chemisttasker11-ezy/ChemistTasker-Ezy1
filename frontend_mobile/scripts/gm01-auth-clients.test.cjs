const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const { resolve } = require('node:path');

function load(file, dependencies, exports) {
  const source = readFileSync(resolve(__dirname, file), 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'strip' })
    .replace(/^import [\s\S]*? from ['"][^'"]+['"];[ \t]*$/gm, '')
    .replace(/^export \{.*\} from .*;$/gm, '')
    .replace(/\bexport\s+/g, '');
  return Function(...Object.keys(dependencies), `${js}\nreturn {${exports.join(',')}};`)(...Object.values(dependencies));
}

test('biometric settings migrate to secure storage, use passcode-only devices, and clear both stores', async () => {
  const legacy = new Map([['BIOMETRIC_LOGIN_ENABLED', 'true'], ['BIOMETRIC_LOGIN_USER', JSON.stringify({ id: 1, email: 'a@example.test' })]]);
  const secure = new Map();
  const AsyncStorage = {
    getItem: async key => legacy.get(key) ?? null,
    multiRemove: async keys => keys.forEach(key => legacy.delete(key)),
  };
  const SecureStore = {
    getItemAsync: async key => secure.get(key) ?? null,
    setItemAsync: async (key, value) => secure.set(key, value),
    deleteItemAsync: async key => secure.delete(key),
  };
  let prompt;
  const native = { hasHardwareAsync: async () => false, isEnrolledAsync: async () => false,
    supportedAuthenticationTypesAsync: async () => [], getEnrolledLevelAsync: async () => 1,
    authenticateAsync: async options => { prompt = options; return { success: true }; } };
  const bio = load('../utils/biometricAuth.ts', { AsyncStorage, SecureStore, Platform: { OS: 'android' }, requireOptionalNativeModule: () => native },
    ['getBiometricAvailability', 'getSavedBiometricUser', 'authenticateWithBiometrics', 'disableBiometricLogin']);
  assert.deepEqual(await bio.getBiometricAvailability(), { available: true, label: 'device PIN or passcode' });
  assert.equal((await bio.getSavedBiometricUser()).email, 'a@example.test');
  assert.equal(legacy.size, 0);
  assert.equal(secure.size, 2);
  assert.equal(await bio.authenticateWithBiometrics(), true);
  assert.equal(prompt.disableDeviceFallback, false);
  await bio.disableBiometricLogin();
  assert.equal(secure.size, 0);
});

test('native login sends no remember_me (the server keeps the long phone session)', async () => {
  let sent;
  const transport = load('../utils/nativeIdentityTransport.ts', {
    apiClient: { post: async (...args) => { sent = args; } },
    NATIVE_IDENTITY_ROUTES: { login: '/login' },
    Platform: { OS: 'ios' }, browserLoginSession: async () => { throw new Error('not native'); }, resolveApiBaseUrl: () => '',
  }, ['nativeIdentityTransport']);
  await transport.nativeIdentityTransport.login('a@example.test', 'password');
  assert.deepEqual(sent[1], { email: 'a@example.test', password: 'password' });
});

test('Next shared transport forces cookie refresh after a 401', async () => {
  let config;
  const calls = [];
  const api = load('../../frontend_web/landing_next/migrated/config/api.ts', {
    configureApi: value => { config = value; }, configureStorage: () => {},
    getAccessToken: () => 'expired', refreshCookieSession: async force => { calls.push(force); return { access: 'fresh' }; },
    getSessionGeneration: () => 0, window: { location: { origin: 'https://example.test' } },
    expireBrowserSession: () => {}, fetchWithBrowserSession: fetch,
  }, ['initSharedCoreApi']);
  api.initSharedCoreApi();
  assert.equal(await config.refreshToken(), 'fresh');
  assert.deepEqual(calls, [true]);
});

test('web return destinations reject external and logout URLs', () => {
  const session = load('../../frontend_web/landing_next/shared/browser-session.ts', {}, ['safeNext']);
  assert.equal(session.safeNext('/dashboard/owner/shifts?day=1'), '/dashboard/owner/shifts?day=1');
  assert.equal(session.safeNext('//evil.example/path'), null);
  assert.equal(session.safeNext('/dashboard/owner/logout'), null);
  assert.equal(session.safeNext('/\\evil.example'), null);
  assert.equal(session.safeNext('/dashboard/%6cogin'), null);
});

const core = '../../shared-core/src';
const webSession = '../../frontend_web/landing_next/shared/browser-session.ts';
const queue = load(`${core}/domains/auth/logoutQueue.ts`, {}, ['createLogoutQueue', 'isSessionRejection']);

function browserStorage() {
  return Object.create({
    getItem(key) { return this[key] ?? null; },
    setItem(key, value) { this[key] = value; },
    removeItem(key) { delete this[key]; },
  });
}

function browserEnvironment({ webLocks = true, indexedDB } = {}) {
  const urls = [];
  const window = Object.assign(new EventTarget(), {
    location: {
      origin: 'https://example.test', pathname: '/dashboard/owner/shifts', search: '?day=1&view=week',
      replace: path => urls.push(path), assign: path => urls.push(path),
    },
  });
  let locked = Promise.resolve();
  const locks = { request(_key, work) {
    const result = locked.then(work);
    locked = result.catch(() => {});
    return result;
  } };
  const globals = { window, navigator: { locks: webLocks ? locks : undefined }, indexedDB, localStorage: browserStorage(), sessionStorage: browserStorage() };
  const cookieState = load(`${core}/domains/auth/browserSession.ts`, { ...queue, ...globals },
    ['browserSessionIsSignedOut', 'markBrowserSessionSignedOut', 'createBrowserLogoutQueue', 'withBrowserSessionLock']);
  return { ...globals, ...cookieState, ...queue, urls };
}

test('parallel 401s across both browser transports announce expiry once and keep the route and query', async () => {
  const env = browserEnvironment();
  const session = load(webSession, env, [
    'claimUserBrowserStorage', 'expireBrowserSession', 'getSessionGeneration', 'returnDestination', 'finishDestination',
  ]);
  const { apiUrl, assertAllowedPath } = load(`${core}/transport/urls.ts`, {}, ['apiUrl', 'assertAllowedPath']);
  const { createApiClient } = load(`${core}/transport/client.ts`, {
    apiUrl, assertAllowedPath, responseError: async response => new Error(String(response.status)),
  }, ['createApiClient']);
  const config = {
    baseUrl: 'https://api.example.test/api/v1', getSessionGeneration: session.getSessionGeneration,
    onAuthFailure: session.expireBrowserSession, getAuthToken: () => 'expired',
    refreshAuthToken: () => null, fetchImpl: async () => new Response(null, { status: 401 }),
  };
  session.claimUserBrowserStorage(7);
  let logouts = 0;
  env.window.addEventListener('ct:session-changed', () => logouts++);
  const app = createApiClient(config);
  const facade = createApiClient(config);
  const requests = await Promise.allSettled([app.get('first'), app.get('second'), facade.get('third')]);
  assert.ok(requests.every(request => request.status === 'rejected'));
  assert.equal(logouts, 1);
  assert.equal(env.urls.length, 1);
  const target = '/dashboard/owner/shifts?day=1&view=week';
  assert.equal(new URL(env.urls[0], env.window.location.origin).searchParams.get('sessionEnded'), '1');
  assert.equal(session.returnDestination(), target);
  session.finishDestination(session.returnDestination());
  assert.equal(env.urls[1], target);
  assert.equal(session.returnDestination(), null);
});

test('browser sign-out retries before the login request and is discarded after successful login', async () => {
  const env = browserEnvironment();
  let offline = true;
  const sent = [];
  const browser = load(`${core}/domains/auth/browserOperations.ts`, {
    ...env,
    API_ENDPOINTS: { login: '/login/' },
    createApiClient: () => ({
      get: async () => ({ csrfToken: 'csrf' }),
      post: async () => { sent.push('login'); return { access: 'new', user: { id: 9 } }; },
    }),
    logoutSession: async () => { sent.push('logout'); if (offline) throw new Error('offline'); },
  }, ['browserLoginSession', 'browserLogoutQueue']);
  const login = () => browser.browserLoginSession({ baseUrl: '/api/v1' }, { email: 'a@example.test', password: 'password', remember_me: false });
  assert.equal(await browser.browserLogoutQueue.signOut('/api/v1'), false);
  assert.equal(env.browserSessionIsSignedOut(), true);
  offline = false;
  await browser.browserLogoutQueue.retry();
  assert.deepEqual(sent, ['logout', 'logout']);
  assert.equal(env.browserSessionIsSignedOut(), true);

  offline = true;
  assert.equal(await browser.browserLogoutQueue.signOut('/api/v1'), false);
  await Promise.all([login(), browser.browserLogoutQueue.retry()]);
  assert.equal(env.browserSessionIsSignedOut(), false);
  assert.deepEqual(sent, ['logout', 'logout', 'logout', 'logout', 'login']);
  offline = false;
  await browser.browserLogoutQueue.retry();
  assert.deepEqual(sent.slice(3), ['logout', 'login']);
  assert.equal(env.localStorage.getItem('ct:pending-logout'), null);
});

test('a browser login with an unknown outcome leaves the old cookie retry disarmed', async () => {
  const env = browserEnvironment();
  let sends = 0;
  const browser = env.createBrowserLogoutQueue(async () => { sends++; throw new Error('offline'); });
  await browser.signOut('/api/v1');
  await assert.rejects(browser.login(async () => {}, async () => { throw new Error('login connection lost'); }));
  await browser.retry();
  assert.equal(sends, 2);
  assert.ok(env.localStorage.getItem('ct:pending-logout'));
  await browser.login(async () => {}, async () => ({ access: 'new' }));
  assert.equal(sends, 2);
  assert.equal(env.localStorage.getItem('ct:pending-logout'), null);
});

test('sign-out after a login with an unknown outcome still revokes, but never a later login', async () => {
  const env = browserEnvironment();
  let offline = false;
  let sends = 0;
  const browser = env.createBrowserLogoutQueue(async () => { sends++; if (offline) throw new Error('offline'); });
  await assert.rejects(browser.login(async () => {}, async () => { throw new Error('login connection lost'); }));
  assert.equal(await browser.signOut('/api/v1'), true);
  assert.equal(sends, 1);

  await assert.rejects(browser.login(async () => {}, async () => { throw new Error('login connection lost'); }));
  offline = true;
  assert.equal(await browser.signOut('/api/v1'), false);
  await browser.login(async () => {}, async () => ({ access: 'new' }));
  offline = false;
  await browser.retry();
  assert.equal(sends, 3);
  assert.equal(env.localStorage.getItem('ct:pending-logout'), null);
});

test('a rejected browser login leaves the old cookie queued for the next retry', async () => {
  const env = browserEnvironment();
  let offline = true;
  let sends = 0;
  const browser = env.createBrowserLogoutQueue(async () => { sends++; if (offline) throw new Error('offline'); });
  await browser.signOut('/api/v1');
  await assert.rejects(browser.login(async () => {}, async () => { throw Object.assign(new Error('Invalid password'), { status: 401 }); }));
  assert.equal(env.browserSessionIsSignedOut(), true);
  offline = false;
  await browser.retry();
  assert.equal(sends, 3);
  assert.equal(env.localStorage.getItem('ct:pending-logout'), null);
});

test('a failed browser login preparation leaves sign-out queued', async () => {
  const env = browserEnvironment();
  let offline = true;
  let sends = 0;
  const browser = env.createBrowserLogoutQueue(async () => { sends++; if (offline) throw new Error('offline'); });
  await browser.signOut('/api/v1');
  await assert.rejects(browser.login(async () => { throw new Error('CSRF connection lost'); }, async () => assert.fail('login was sent')));
  offline = false;
  await browser.retry();
  assert.equal(sends, 3);
  assert.equal(env.localStorage.getItem('ct:pending-logout'), null);
});

test('browser retries with an IndexedDB lock when Web Locks are unavailable', async () => {
  const db = {
    createObjectStore() {},
    transaction() {
      return { objectStore: () => ({ get() {
        const request = {};
        setImmediate(() => request.onsuccess());
        return request;
      } }) };
    },
  };
  const indexedDB = { open() {
    const request = { result: db };
    setImmediate(() => { request.onupgradeneeded(); request.onsuccess(); });
    return request;
  } };
  const env = browserEnvironment({ webLocks: false, indexedDB });
  let offline = true;
  const sent = [];
  const browser = env.createBrowserLogoutQueue(async root => {
    sent.push(root);
    if (offline) throw new Error('offline');
  });
  assert.equal(await browser.signOut('/api/v1'), false);
  offline = false;
  await browser.retry();
  assert.deepEqual(sent, ['/api/v1', '/api/v1']);
  assert.equal(env.localStorage.getItem('ct:pending-logout'), null);
});

test('Expo saves the current path with its query and rejects unsafe return destinations', () => {
  const { sanitizeReturnTo, updateSessionReturnRoute, getSessionReturnRoute } = load('../utils/authReturnRoute.ts', {},
    ['sanitizeReturnTo', 'updateSessionReturnRoute', 'getSessionReturnRoute']);
  updateSessionReturnRoute('/owner/shifts/7', { id: '7', view: 'week', filter: ['a', 'b'] }, ['owner', 'shifts', '[id]']);
  assert.equal(getSessionReturnRoute(), '/owner/shifts/7?view=week&filter=a&filter=b');
  for (const path of ['//evil.test', '/owner/%2fetc', '/owner/../login', '/owner/logout', '/reset-password?token=1']) {
    assert.equal(sanitizeReturnTo(path, 'session'), null);
  }
});

test('Expo clears the offline shift snapshot on logout and expiry, and retries only the old refresh token', async () => {
  const secure = browserStorage();
  const disk = browserStorage();
  const AsyncStorage = {
    getItem: async key => disk.getItem(key),
    setItem: async (key, value) => disk.setItem(key, value),
    removeItem: async key => disk.removeItem(key),
  };
  const { clearConfirmedShiftSnapshot } = load('../features/nextShift/offlineConfirmedShifts.ts', { AsyncStorage },
    ['clearConfirmedShiftSnapshot']);
  let offline = true;
  const sent = [];
  const { logoutSession } = load(`${core}/domains/auth/api.ts`, {
    fetchApi: async (_path, request) => {
      sent.push({ body: JSON.parse(request.body), credentials: request.credentials, skipAuth: request.skipAuth });
      if (offline) throw new Error('offline');
    },
  }, ['logoutSession']);
  let finishRotation;
  const mobile = load('../utils/authSession.ts', {
    ...queue, AsyncStorage, clearConfirmedShiftSnapshot, Platform: { OS: 'android' },
    SecureStore: { getItemAsync: key => secure.getItem(key), setItemAsync: (key, value) => secure.setItem(key, value),
      deleteItemAsync: async key => secure.removeItem(key) },
    secureGet: key => secure.getItem(key), secureSet: (key, value) => secure.setItem(key, value),
    secureRemove: async key => secure.removeItem(key),
    logoutSession,
    refreshNativeSession: () => new Promise(resolve => { finishRotation = resolve; }),
  }, ['primeInMemorySession', 'signOutStoredSession', 'retryQueuedLogout', 'expireAuthSession', 'watchSessionExpiry', 'readStoredSession', 'refreshAccessToken']);
  await AsyncStorage.setItem('ct.offline.confirmed-shifts.v2.7', 'private old shifts');
  mobile.primeInMemorySession({ refresh: 'old-refresh', user: { id: 7 } });
  assert.equal(await mobile.signOutStoredSession('https://example.test', 7, 'old-push'), false);
  assert.equal(await AsyncStorage.getItem('ct.offline.confirmed-shifts.v2.7'), null);
  assert.deepEqual(JSON.parse(secure.getItem('PENDING_LOGOUTS')), ['old-refresh']);

  await AsyncStorage.setItem('ct.offline.confirmed-shifts.v2.9', 'private new shifts');
  mobile.primeInMemorySession({ refresh: 'new-refresh', user: { id: 9 } });
  offline = false;
  await mobile.retryQueuedLogout();
  assert.deepEqual(sent, [
    { body: { refresh: 'old-refresh', device_token: 'old-push' }, credentials: 'omit', skipAuth: true },
    { body: { refresh: 'old-refresh' }, credentials: 'omit', skipAuth: true },
  ]);
  assert.equal(secure.getItem('PENDING_LOGOUTS'), null);
  assert.equal((await mobile.readStoredSession()).refresh, 'new-refresh');
  let messages = 0;
  mobile.watchSessionExpiry(() => messages++);
  await Promise.all([mobile.expireAuthSession(), mobile.expireAuthSession()]);
  assert.equal(await AsyncStorage.getItem('ct.offline.confirmed-shifts.v2.9'), null);
  assert.equal(messages, 1);

  mobile.primeInMemorySession({ refresh: 'unrotated', user: { id: 12 } });
  const refresh = mobile.refreshAccessToken('https://example.test');
  await new Promise(setImmediate);
  const logout = mobile.signOutStoredSession('https://example.test', 12);
  assert.equal(await mobile.readStoredSession(), null);
  finishRotation({ access: 'rotated-access', refresh: 'rotated-refresh' });
  assert.equal(await refresh, null);
  assert.equal(await logout, true);
  assert.deepEqual(sent.at(-1).body, { refresh: 'rotated-refresh' });
});
