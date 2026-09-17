import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client';

describe('createApiClient', () => {
  it('uses the configured base url, query and bearer token', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.test/api/marketplace/listings/?page=2&role=PHARMACIST');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer access-token');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const api = createApiClient({
      baseUrl: 'https://example.test/api/',
      getAuthToken: () => 'access-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(api.get('/marketplace/listings/', { page: 2, role: 'PHARMACIST' })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('serializes query arrays and omits nullish values', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://example.test/api/items/?role=OWNER&role=PHARMACIST&active=false&count=0');
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const api = createApiClient({ baseUrl: 'https://example.test/api///', fetchImpl: fetchImpl as typeof fetch });

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
      baseUrl: 'https://example.test/api',
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

    const api = createApiClient({
      baseUrl: 'https://example.test/api',
      getAuthToken: () => 'old-token',
      refreshAuthToken: async () => 'new-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(api.get('/client-profile/attendance/worker/status/')).resolves.toEqual({ ok: true });
    expect(seenTokens).toEqual(['Bearer old-token', 'Bearer new-token']);
  });

  it('does not retry forever when the refreshed token is also rejected', async () => {
    const onAuthFailure = vi.fn();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ detail: 'Expired' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));
    const api = createApiClient({
      baseUrl: 'https://example.test/api',
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
      baseUrl: 'https://example.test/api',
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
      baseUrl: 'https://example.test/api',
      getAuthToken: async () => 'token-a',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const clientB = createApiClient({
      baseUrl: 'https://example.test/api',
      getAuthToken: async () => 'token-b',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await Promise.all([clientA.get('/request-a/'), clientB.get('/request-b/')]);

    expect(seen.get('https://example.test/api/request-a/')).toBe('Bearer token-a');
    expect(seen.get('https://example.test/api/request-b/')).toBe('Bearer token-b');
  });

  it('serializes plain objects as JSON', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      expect(init?.body).toBe(JSON.stringify({ period_id: 5 }));
      return new Response(null, { status: 204 });
    });

    const api = createApiClient({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });
    await api.post('/client-profile/attendance/roster/publish/', { period_id: 5 });
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
    const api = createApiClient({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await expect(api.post('/content/media/', form)).resolves.toBeUndefined();
  });

  it('returns plain text responses', async () => {
    const api = createApiClient({
      baseUrl: 'https://example.test/api',
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
      baseUrl: 'https://example.test/api',
      fetchImpl: (async () => { throw networkError; }) as typeof fetch,
    });

    await expect(api.get('/status/')).rejects.toBe(networkError);
  });

  it('throws ApiError with the server payload', async () => {
    const api = createApiClient({
      baseUrl: 'https://example.test/api',
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
