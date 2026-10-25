import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi, logoutSession, skipMobileOverseas } from './api';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function mobileSession(os = 'ios') {
  const stored = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => stored.get(key) ?? null,
    setItem: vi.fn(async (key: string, value: string) => { stored.set(key, value); }),
    removeItem: async (key: string) => { stored.delete(key); },
  };
  const fetch = vi.fn();
  const exports: any = {};
  const source = readFileSync(new URL('../../frontend_mobile/utils/authSession.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, fetch, console, atob,
    require: (name: string) => {
      if (name === '@react-native-async-storage/async-storage') return { default: storage };
      if (name === 'react-native') return { Platform: { OS: os } };
      if (name === './browserAuth') return { getBrowserCsrfToken: async () => 'csrf' };
      if (name === './secureStorage') return { secureGet: storage.getItem, secureSet: storage.setItem, secureRemove: storage.removeItem };
      throw new Error(name);
    },
  });
  return { session: exports, stored, fetch, storage };
}

function mobileProvider(os = 'ios') {
  const env = mobileSession(os);
  const states: any[] = [];
  const refs: any[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effects: (() => void)[] = [];
  const react = {
    createContext: () => ({ Provider: 'AuthProvider' }),
    createElement: (type: unknown, props: any) => ({ type, props }),
    useState: (initial: unknown) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = value; }];
    },
    useRef: (initial: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
    useEffect: (effect: () => void) => { effects.push(effect); },
    useCallback: (callback: unknown) => callback,
  };
  const onboarding = vi.fn(async () => ({}));
  const currentUser = vi.fn();
  const logout = vi.fn(async () => ({}));
  const getPushToken = vi.fn(async () => 'expo-current');
  const registerPush = vi.fn(async () => undefined);
  const exports: any = {};
  const mocks: Record<string, any> = {
    react: { ...react, default: react },
    'react-native': { Platform: { OS: os }, Alert: { alert: vi.fn() } },
    '@chemisttasker/shared-core': { getOnboarding: onboarding, logoutSession: logout },
    '../utils/authSession': env.session,
    '../utils/nativeIdentityTransport': { nativeIdentityTransport: { currentUser } },
    '../utils/apiUrl': { resolveApiBaseUrl: () => 'https://example.test' },
    '../utils/browserAuth': { getBrowserCsrfToken: async () => 'csrf' },
    '../utils/pushNotifications': { registerForPushNotificationsAsync: getPushToken, registerDeviceTokenWithBackend: registerPush },
    '../utils/biometricAuth': { getBiometricAvailability: async () => ({ available: false }), getSavedBiometricUser: async () => null },
    '../utils/networkDiagnostics': {},
    'expo-device': { osName: 'ios' },
    './AhpraContext': { AhpraProvider: 'AhpraProvider' },
  };
  const source = readFileSync(new URL('../../frontend_mobile/context/AuthContext.tsx', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, {
    exports, console, process: { env: {} }, require: (name: string) => {
      if (!(name in mocks)) throw new Error(name);
      return mocks[name];
    },
  });
  const render = () => {
    stateIndex = refIndex = 0;
    effects = [];
    return exports.AuthProvider({ children: null }).props.value;
  };
  return { ...env, render, onboarding, currentUser, logout, getPushToken, registerPush, effects: () => effects };
}

function mobileClient() {
  const env = mobileSession();
  let request!: (config: any) => Promise<any>;
  let rejectResponse!: (error: any) => Promise<any>;
  const client = Object.assign(vi.fn(), { interceptors: {
    request: { use: (callback: typeof request) => { request = callback; } },
    response: { use: (_resolve: unknown, callback: typeof rejectResponse) => { rejectResponse = callback; } },
  } });
  const exports: any = {};
  const source = readFileSync(new URL('../../frontend_mobile/utils/apiClient.ts', import.meta.url), 'utf8');
  const mocks: Record<string, any> = {
    axios: { default: { create: () => client, CanceledError: Error } },
    '@chemisttasker/shared-core': { reportAhpraError: () => undefined },
    'react-native': { Platform: { OS: 'ios' } },
    './authSession': env.session,
    './browserAuth': {},
    './apiUrl': { resolveApiBaseUrl: () => 'https://example.test' },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, console, require: (name: string) => mocks[name],
  });
  return { ...env, request: (config: any) => request(config), rejectResponse: (error: any) => rejectResponse(error) };
}

const jwt = `header.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`;
const alice = { id: 1, role: 'PHARMACIST', username: 'alice' };
const bob = { id: 2, role: 'OWNER', username: 'bob' };

describe('mobile session lifecycle', () => {
  it('keeps a new account when an old axios refresh finishes or fails', async () => {
    const env = mobileClient();
    await env.session.writeStoredSession({ access: jwt, refresh: 'alice-refresh', user: alice });
    const config = await env.request({ headers: {} });
    expect(config.headers.Authorization).toBe(`Bearer ${jwt}`);
    let finish!: (value: unknown) => void;
    env.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = env.rejectResponse({ config, response: { status: 401 } }).catch(() => null);
    await vi.waitFor(() => expect(env.fetch).toHaveBeenCalledOnce());
    await env.session.clearStoredSession();
    const newToken = jwt.replace('header.', 'bob.');
    await env.session.writeStoredSession({ access: newToken, refresh: 'bob-refresh', user: bob });
    finish({ status: 401, ok: false });
    await pending;
    expect((await env.session.readStoredSession()).user.id).toBe(2);
    const fresh = await env.request({ headers: {} });
    expect(fresh.headers.Authorization).toBe(`Bearer ${newToken}`);
    await expect(env.request(config)).rejects.toThrow();
  });
  it.each(['ios', 'web'])('keeps the new %s account when old bootstrap or profile hydration completes', async os => {
    for (const kind of ['bootstrap', 'profile']) {
      const env = mobileProvider(os);
      await env.session.writeStoredSession({ access: jwt, refresh: 'alice-refresh', user: alice });
      const auth = env.render();
      let complete!: (value: any) => void;
      if (kind === 'bootstrap') {
        env.currentUser.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        env.effects()[0]();
        await vi.waitFor(() => expect(env.currentUser).toHaveBeenCalledOnce());
      } else {
        env.onboarding.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
        void auth.login(jwt, 'alice-refresh', alice);
        await vi.waitFor(() => expect(env.onboarding).toHaveBeenCalledOnce());
      }
      await auth.logout();
      await auth.login('bob-access', 'bob-refresh', bob);
      complete(kind === 'bootstrap' ? { data: alice } : { profile_photo: 'alice-photo' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(env.render().user.id).toBe(2);
      expect((await env.session.readStoredSession()).user.id).toBe(2);
      expect(env.stored.get('ACCESS_KEY')).toBe('bob-access');
    }
  });

  it('hydrates the current user and waits for device registration before logging out', async () => {
    const env = mobileProvider();
    env.onboarding.mockResolvedValue({ profile_photo: 'alice-photo' });
    await env.render().login(jwt, 'alice-refresh', alice);
    expect(env.render().user.profile_photo).toBe('alice-photo');
    let finish!: () => void;
    env.registerPush.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    env.effects()[1]();
    await vi.waitFor(() => expect(env.registerPush).toHaveBeenCalledOnce());
    const pending = env.render().logout();
    expect(env.logout).not.toHaveBeenCalled();
    finish();
    await pending;
    expect(env.logout).toHaveBeenCalledWith(expect.objectContaining({ deviceToken: 'expo-current', refreshToken: 'alice-refresh' }));
    expect(env.render().user).toBeNull();
    expect(await env.session.readStoredSession()).toBeNull();
  });
  it.each(['ios', 'web'])('discards refresh results and failures from a previous %s session', async os => {
    for (const status of [200, 401, 503]) {
      for (const switchAccount of [false, true]) {
        const { session, stored, fetch } = mobileSession(os);
        await session.writeStoredSession({ access: 'old-access', refresh: 'old-refresh', user: { id: 1 } });
        let complete!: (value: unknown) => void;
        fetch.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const pending = session.refreshAccessToken('https://example.test');
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
        await session.clearStoredSession();
        if (switchAccount) await session.writeStoredSession({ access: 'new-access', refresh: 'new-refresh', user: { id: 2 } });
        complete({ status, ok: status === 200, json: async () => ({ access: 'stale-access', refresh: 'stale-refresh' }) });
        expect(await pending).toBeNull();
        if (switchAccount) expect((await session.readStoredSession()).user.id).toBe(2);
        else expect(await session.readStoredSession()).toBeNull();
        expect(stored.get('ACCESS_KEY')).toBe(switchAccount ? 'new-access' : undefined);
        expect(stored.get('REFRESH_KEY')).toBe(os === 'web' || !switchAccount ? undefined : 'new-refresh');
      }
    }
  });

  it.each([false, true])('serializes pending storage writes across logout, including failures (%s)', async fail => {
    const { session, stored, storage } = mobileSession();
    await session.writeStoredSession({ access: 'old', refresh: 'old-refresh', user: alice });
    let finish!: () => void;
    storage.setItem.mockImplementationOnce((key, value) => new Promise((resolve, reject) => {
      finish = () => {
        if (fail) reject(new Error('storage unavailable'));
        else { stored.set(key, value); resolve(); }
      };
    }));
    const stale = session.writeStoredSession({ access: 'stale' }).catch(() => false);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const logout = session.clearStoredSession();
    const login = session.writeStoredSession({ access: 'new', refresh: 'new-refresh', user: bob });
    finish();
    await Promise.all([stale, logout, login]);
    expect(stored.get('ACCESS_KEY')).toBe('new');
    expect((await session.readStoredSession()).user.id).toBe(2);
  });

  it('allows a current native session to refresh normally', async () => {
    const { session, stored, fetch } = mobileSession();
    await session.writeStoredSession({ access: 'old', refresh: 'old-refresh', user: { id: 1 } });
    fetch.mockResolvedValue({ status: 200, ok: true, json: async () => ({ access: 'new', refresh: 'rotated' }) });
    expect(await session.refreshAccessToken('https://example.test')).toBe('new');
    expect(stored.get('REFRESH_KEY')).toBe('rotated');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function configure(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  configureApi({
    baseURL: 'https://example.test/api/v1',
    credentials: 'omit',
    getToken: async () => 'should-not-be-used',
  });
}

describe('logoutSession', () => {
  it('includes the current device in native logout without sending it from browsers', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ detail: 'Logged out.' })) as unknown as typeof fetch;
    configure(fetchImpl);
    await logoutSession({ refreshToken: 'native-refresh', deviceToken: 'expo-current' });
    expect(JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0][1]?.body))).toEqual({
      refresh: 'native-refresh', device_token: 'expo-current',
    });
    await logoutSession({ isBrowser: true, deviceToken: 'expo-current' });
    expect(vi.mocked(fetchImpl).mock.calls[1][1]?.body).toBe('{}');
  });
  it('uses browser cookies and CSRF without exposing a refresh token', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ detail: 'Logged out.' })) as unknown as typeof fetch;
    configure(fetchImpl);

    await logoutSession({ isBrowser: true, csrfToken: 'csrf-value', refreshToken: 'hidden-refresh' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toBe('https://example.test/api/v1/users/logout/');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBe('{}');
    expect(new Headers(init?.headers).get('X-CSRFToken')).toBe('csrf-value');
    expect(new Headers(init?.headers).get('X-Client-Platform')).toBe('web');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('uses the explicit native refresh token without cookies', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ detail: 'Logged out.' })) as unknown as typeof fetch;
    configure(fetchImpl);

    await logoutSession({ refreshToken: 'native-refresh' });

    const [, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(init?.credentials).toBe('omit');
    expect(JSON.parse(String(init?.body))).toEqual({ refresh: 'native-refresh' });
    expect(new Headers(init?.headers).get('X-Client-Platform')).toBe('mobile');
    expect(new Headers(init?.headers).has('X-CSRFToken')).toBe(false);
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
});

describe('skipMobileOverseas', () => {
  it('uses the canonical authenticated endpoint and legal identity fields', async () => {
    const payload = { first_name: 'Amina', last_name: 'Ali', username: 'amina.ali' };
    const fetchImpl = vi.fn(async () => Response.json({
      detail: 'Mobile check skipped.',
      user: { role: 'EXPLORER', newcomer_type: 'OVERSEAS', mobile_check_skipped: true },
    })) as unknown as typeof fetch;
    configure(fetchImpl);

    const result = await skipMobileOverseas(payload);

    expect(result).toMatchObject({ user: { mobile_check_skipped: true } });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toBe('https://example.test/api/v1/users/mobile/skip-overseas/');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(payload);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer should-not-be-used');
  });
});
