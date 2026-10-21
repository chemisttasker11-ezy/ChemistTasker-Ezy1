import { it, expect, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { buzzShiftOffer } from './api';

it('buzzes an offer as a bodyless authenticated POST without changing lifecycle policy', async () => {
  const seen: Array<{path: string; method: string; body: unknown}> = [];
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'owner-token',
    fetchImpl: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({path: new URL(String(url)).pathname, method: init?.method ?? 'GET', body: init?.body ?? null});
      return new Response(JSON.stringify({detail: 'Reminder sent.'}), {headers:{'content-type':'application/json'}});
    }) as unknown as typeof fetch });
  expect((await buzzShiftOffer(7)).detail).toBe('Reminder sent.');
  expect(seen).toEqual([{path:'/api/v1/shift-offers/7/buzz/',method:'POST',body:null}]);
});
