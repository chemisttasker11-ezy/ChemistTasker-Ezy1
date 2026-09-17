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

  it('serializes plain objects as JSON', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
      expect(init?.body).toBe(JSON.stringify({ period_id: 5 }));
      return new Response(null, { status: 204 });
    });

    const api = createApiClient({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });
    await api.post('/client-profile/attendance/roster/publish/', { period_id: 5 });
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
