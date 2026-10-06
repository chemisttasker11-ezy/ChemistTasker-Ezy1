import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';
import { configureApi, fetchApi, performApiRequest } from './application';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
afterEach(() => vi.unstubAllGlobals());

describe('converged client security and compatibility', () => {
  it.each([
    'https://attacker.invalid/steal', '//attacker.invalid/steal',
    'https://user:pass@example.test/api/me/', 'javascript:alert(1)',
    '\\attacker.invalid/steal',
  ])('rejects unsafe URL %s before reading a token or using cookies', async (path) => {
    const token = vi.fn(() => 'secret');
    const fetchImpl = vi.fn(async () => json({}));
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1', getAuthToken: token, credentials: 'include', fetchImpl });
    await expect(client.get(path)).rejects.toThrow();
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    '/finance/../users/',
    '/finance/%2e%2e/users/',
    '/finance/%252e%252e/users/',
    '/finance/%2f..%2fusers/',
    '/finance-elsewhere/',
  ])('confines finance before credentials: %s', async (path) => {
    const fetchImpl = vi.fn(async () => json({}));
    const token = vi.fn(() => 'secret');
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: token, fetchImpl });
    await expect(performApiRequest(path, {}, { allowedPathPrefix: '/finance/' })).rejects.toThrow();
    expect(token).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('supports same-origin absolute finance next links and binary response without re-parsing', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init?.redirect).toBe('error');
      return new Response('pdf-bytes', { headers: { 'Content-Type': 'application/pdf' } });
    }) as typeof fetch;
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'a', fetchImpl });
    const response = await performApiRequest('https://example.test/api/v1/finance/invoices/?page=2', {}, {
      allowedPathPrefix: '/finance/',
    });
    expect(await (await response.blob()).text()).toBe('pdf-bytes');
  });

  it('keeps the application config snapshot for an in-flight request', async () => {
    const token = deferred<string>();
    const calls: Array<[string, string | null]> = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push([String(url), new Headers(init?.headers).get('Authorization')]);
      return json({});
    }) as typeof fetch;
    configureApi({ baseURL: 'https://a.test/api/v1', getToken: () => token.promise, fetchImpl });
    const first = fetchApi('/users/me/');
    configureApi({ baseURL: 'https://b.test/api/v1', getToken: () => 'b-token', fetchImpl });
    token.resolve('a-token');
    await Promise.all([first, fetchApi('/users/me/')]);
    expect(calls).toContainEqual(['https://a.test/api/v1/users/me/', 'Bearer a-token']);
    expect(calls).toContainEqual(['https://b.test/api/v1/users/me/', 'Bearer b-token']);
  });

  it('shares an in-flight refresh only inside one client', async () => {
    const refreshed = deferred<string>();
    const refresh = vi.fn(() => refreshed.promise);
    const fetchImpl = vi.fn(async (_url, init) => {
      return new Headers(init?.headers).get('Authorization') === 'Bearer renewed'
        ? json({ ok: true }) : json({}, 401);
    }) as typeof fetch;
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1', getAuthToken: () => 'old', refreshAuthToken: refresh, fetchImpl });
    const one = client.get('/one/');
    const two = client.get('/two/');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    refreshed.resolve('renewed');
    await expect(Promise.all([one, two])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not refresh or sign out on a public 401', async () => {
    const refresh = vi.fn(); const failure = vi.fn(); const getAuthToken = vi.fn();
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1', getAuthToken, refreshAuthToken: refresh, onAuthFailure: failure,
      fetchImpl: async (_url, init) => {
        expect(new Headers(init?.headers).has('Authorization')).toBe(false);
        return json({ detail: 'Public token expired.' }, 401);
      },
    });
    await expect(client.get('/public/', undefined, { auth: false, headers: { Authorization: 'do not send' } })).rejects.toMatchObject({ status: 401 });
    expect(getAuthToken).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled(); expect(failure).not.toHaveBeenCalled();
  });

  it('sanitizes 5xx payloads but retains structured validation/conflict payloads', async () => {
    const bad = createApiClient({ baseUrl: 'https://example.test/api/v1', fetchImpl: async () => json({ detail: 'password=internal' }, 500) });
    await expect(bad.get('/x/')).rejects.toMatchObject({ status: 500, message: 'Request failed with status 500', payload: null });
    const payload = { error: { revision: ['Review the changed revision.'], code: 'STALE' } };
    const conflict = createApiClient({ baseUrl: 'https://example.test/api/v1', fetchImpl: async () => json(payload, 409) });
    await expect(conflict.post('/publish/', {})).rejects.toMatchObject({ status: 409, message: 'Review the changed revision.', payload });
  });

  it('retains browser cookies/CSRF headers and native credentials omit', async () => {
    const seen: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url, init) => { seen.push(init!); return json({}); }) as typeof fetch;
    const browser = createApiClient({ baseUrl: 'https://example.test/api/v1', credentials: 'include', fetchImpl });
    const native = createApiClient({ baseUrl: 'https://example.test/api/v1', credentials: 'omit', fetchImpl });
    await browser.post('/x/', { a: 1 }, { headers: { 'X-CSRFToken': 'csrf-value', 'X-Client-Platform': 'web' } });
    await native.post('/x/', { a: 1 });
    expect(seen[0].credentials).toBe('include');
    expect(new Headers(seen[0].headers).get('X-CSRFToken')).toBe('csrf-value');
    expect(seen[1].credentials).toBe('omit');
  });

  it('resolves the Next browser BFF base without treating it as a server global', async () => {
    vi.stubGlobal('location', { href: 'https://web.test/dashboard' });
    const fetchImpl = vi.fn(async (url) => { expect(String(url)).toBe('https://web.test/api/platform/marketplace/listings/'); return json([]); }) as typeof fetch;
    const client = createApiClient({ baseUrl: '/api/platform', fetchImpl });
    await client.get('/marketplace/listings/');
  });

  it('preserves raw body formats, query semantics and old 204 mapping', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_url, init) => { calls.push(init!); return new Response(null, { status: 204 }); }) as typeof fetch;
    const client = createApiClient({ baseUrl: 'https://example.test/api/v1', fetchImpl });
    await expect(client.post('/upload/', bytes)).resolves.toBeUndefined();
    expect(calls[0].body).toBe(bytes); expect(new Headers(calls[0].headers).has('Content-Type')).toBe(false);
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => null, fetchImpl });
    await expect(fetchApi('/nothing/', { method: 'DELETE' })).resolves.toEqual({});
  });

  it('retains a structured ApiError instanceof contract', () => {
    expect(new ApiError('no', 403, {})).toBeInstanceOf(Error);
  });
});

it('cannot enable credential-following redirects through per-request options',async()=>{
  const client=createApiClient({baseUrl:'https://example.test/api/v1',fetchImpl:async(_url,options)=>{
    expect(options?.redirect).toBe('error');return json({});
  }});
  await client.get('/users/me/',undefined,{redirect:'follow'});
});

it('the exported refresh operation cannot recursively invoke the refresh callback',async()=>{
  const {refreshToken}=await import('../domains/auth/api');
  const recursive=vi.fn(()=>refreshToken('expired').then(()=> 'token'));
  const authFailure=vi.fn();const getToken=vi.fn(()=> 'old-token');
  const fetchImpl=vi.fn(async()=>json({detail:'Refresh expired.'},401));
  configureApi({baseURL:'https://example.test/api/v1',getToken,refreshToken:recursive,onAuthFailure:authFailure,fetchImpl});
  await expect(refreshToken('expired')).rejects.toMatchObject({status:401});
  expect(recursive).not.toHaveBeenCalled();expect(getToken).not.toHaveBeenCalled();
  expect(authFailure).not.toHaveBeenCalled();expect(fetchImpl).toHaveBeenCalledOnce();
});
