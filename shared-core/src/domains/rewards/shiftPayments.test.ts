import { describe, it, expect, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { payShiftWithPills } from './api';

describe('shift pills server contract remains identical for Vite and Expo', () => {
  it('retains POST route, bearer token and optional offer_ids without duplicating pricing', async () => {
    const requests: { path: string; body: unknown; method: string; token: string | null }[] = [];
    configureApi({
      baseURL: 'https://example.test/api/v1',
      getToken: () => 'owner-token',
      fetchImpl: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          path: new URL(String(url)).pathname,
          body: JSON.parse(String(init?.body)),
          method: init?.method ?? '',
          token: new Headers(init?.headers).get('Authorization'),
        });
        return new Response(JSON.stringify({ detail: 'Shift paid with pills.' }), { headers: { 'content-type': 'application/json' } });
      }) as unknown as typeof fetch,
    });
    expect((await payShiftWithPills(81, [4, 7])).detail).toBe('Shift paid with pills.');
    await payShiftWithPills(82);
    expect(requests).toEqual([
      { path: '/api/v1/pill-rewards/pay-shift/', method: 'POST', body: { shift_id: 81, offer_ids: [4, 7] }, token: 'Bearer owner-token' },
      { path: '/api/v1/pill-rewards/pay-shift/', method: 'POST', body: { shift_id: 82 }, token: 'Bearer owner-token' },
    ]);
  });
});
