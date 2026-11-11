import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

describe('createApiClient', () => {
  it('uses the configured base url, query and bearer token', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.test/api/v1/marketplace/listings/?page=2&role=PHARMACIST');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1/',
      getAuthToken: () => 'access-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(api.get('/marketplace/listings/', { page: 2, role: 'PHARMACIST' })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('serializes query arrays and omits nullish values', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://example.test/api/v1/items/?role=OWNER&role=PHARMACIST&active=false&count=0');
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const api = createApiClient({ baseUrl: 'https://example.test/api/v1///', fetchImpl: fetchImpl as typeof fetch });

    await api.get('items/', {
      role: ['OWNER', null, 'PHARMACIST', undefined],
      active: false,
      count: 0,
      search: null,
    });
  });

  it('supports public calls without an authorization header', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      getAuthToken: () => 'must-not-be-used',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await api.get('/public-hub/articles/', undefined, { auth: false });
  });

  it('refreshes once after a 401 and retries with the refreshed token', async () => {
    const seenTokens: Array<string | null> = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenTokens.push(new Headers(init?.headers).get('Authorization'));
      if (seenTokens.length === 1) return new Response('', { status: 401 });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const refreshAuthToken = vi.fn(async () => 'new-token');
    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      getAuthToken: () => 'old-token',
      getSessionGeneration: () => 1,
      refreshAuthToken,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(api.get('/attendance/worker/status/')).resolves.toEqual({ ok: true });
    expect(seenTokens).toEqual(['Bearer old-token', 'Bearer new-token']);
    expect(refreshAuthToken).toHaveBeenCalledOnce();
  });

  it('rejects a delayed 401 after the session changes without refreshing or replaying the write', async () => {
    let generation = 0;
    let release!: (response: Response) => void;
    const fetchImpl = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    const refreshAuthToken = vi.fn(async () => 'token-b');
    const onAuthFailure = vi.fn();
    const api = createApiClient({ baseUrl: 'https://example.test/api', getAuthToken: () => 'token-a',
      getSessionGeneration: () => generation, refreshAuthToken, onAuthFailure, fetchImpl });
    const pending = api.post('/write/', { owner: 'a' });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    generation++;
    release(new Response('', { status: 401 }));
    await expect(pending).rejects.toBeDefined();
    expect(refreshAuthToken).not.toHaveBeenCalled();
    expect(onAuthFailure).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('shares one refresh across concurrent 401s in the same session', async () => {
    let release!: (token: string) => void;
    const refreshAuthToken = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Response(null, { status: new Headers(init?.headers).get('Authorization') === 'Bearer fresh' ? 204 : 401 }));
    const api = createApiClient({ baseUrl: 'https://example.test/api', getAuthToken: () => 'old',
      getSessionGeneration: () => 1, refreshAuthToken, fetchImpl });
    const calls = [api.post('/one/', {}), api.post('/two/', {})];
    await vi.waitFor(() => expect(refreshAuthToken).toHaveBeenCalledOnce());
    release('fresh');
    await expect(Promise.all(calls)).resolves.toEqual([undefined, undefined]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(refreshAuthToken).toHaveBeenCalledOnce();
  });

  it('does not send after the session changes during token lookup', async () => {
    let generation = 0;
    let release!: (token: string) => void;
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: 'https://example.test/api', getSessionGeneration: () => generation,
      getAuthToken: () => new Promise<string>(resolve => { release = resolve; }), fetchImpl });
    const pending = api.post('/write/', {});
    generation++;
    release('token-b');
    await expect(pending).rejects.toBeDefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not replay after the session changes during refresh', async () => {
    let generation = 0;
    let release!: (token: string) => void;
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    const refreshAuthToken = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const api = createApiClient({ baseUrl: 'https://example.test/api', getSessionGeneration: () => generation,
      getAuthToken: () => 'old', refreshAuthToken, fetchImpl });
    const pending = api.post('/write/', {});
    await vi.waitFor(() => expect(refreshAuthToken).toHaveBeenCalledOnce());
    generation++;
    release('fresh');
    await expect(pending).rejects.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not retry forever when the refreshed token is also rejected', async () => {
    const onAuthFailure = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ detail: 'Expired' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      getAuthToken: () => 'old-token',
      refreshAuthToken: async () => 'new-token',
      onAuthFailure,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(api.get('/users/me/')).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onAuthFailure).toHaveBeenCalledOnce();
  });

  it('reports a thrown refresh failure without retrying the request', async () => {
    const refreshError = new Error('refresh unavailable');
    const onAuthFailure = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('', { status: 401 }));
    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      refreshAuthToken: async () => { throw refreshError; },
      onAuthFailure,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(api.get('/users/me/')).rejects.toBe(refreshError);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(onAuthFailure).toHaveBeenCalledOnce();
  });

  it('keeps authentication isolated between concurrent clients', async () => {
    const seen = new Map<string, string | null>();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      await Promise.resolve();
      seen.set(String(input), new Headers(init?.headers).get('Authorization'));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const clientA = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      getAuthToken: async () => 'token-a',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const clientB = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      getAuthToken: async () => 'token-b',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await Promise.all([clientA.get('/request-a/'), clientB.get('/request-b/')]);

    expect(seen.get('https://example.test/api/v1/request-a/')).toBe('Bearer token-a');
    expect(seen.get('https://example.test/api/v1/request-b/')).toBe('Bearer token-b');
  });

  it('serializes plain objects as JSON', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      expect(init?.body).toBe(JSON.stringify({ period_id: 5 }));
      return new Response(null, { status: 204 });
    });

    const api = createApiClient({ baseUrl: 'https://example.test/api/v1', fetchImpl: fetchImpl as typeof fetch });
    await api.post('/attendance/roster/publish/', { period_id: 5 });
  });

  it('passes FormData through without forcing a content type', async () => {
    const form = new FormData();
    form.append('title', 'Roster');
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.body).toBe(form);
      expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
      expect(init).not.toHaveProperty('auth');
      expect(init).not.toHaveProperty('query');
      expect(init).not.toHaveProperty('retryAuth');
      return new Response(null, { status: 204 });
    });
    const api = createApiClient({ baseUrl: 'https://example.test/api/v1', fetchImpl: fetchImpl as typeof fetch });

    await expect(api.post('/content/media/', form)).resolves.toBeUndefined();
  });

  it('returns plain text responses', async () => {
    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetchImpl: (async () => new Response('accepted', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })) as typeof fetch,
    });

    await expect(api.get<string>('/status/')).resolves.toBe('accepted');
  });

  it('preserves network failures', async () => {
    const networkError = new TypeError('network unavailable');
    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetchImpl: (async () => { throw networkError; }) as typeof fetch,
    });

    await expect(api.get('/status/')).rejects.toBe(networkError);
  });

  it('throws ApiError with the server payload', async () => {
    const api = createApiClient({
      baseUrl: 'https://example.test/api/v1',
      fetchImpl: (async () => new Response(JSON.stringify({ detail: 'Denied' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch,
    });

    await expect(api.get('/ethical/me/access/')).rejects.toMatchObject<ApiError>({
      name: 'ApiError',
      status: 403,
      message: 'Denied',
    });
  });
});
