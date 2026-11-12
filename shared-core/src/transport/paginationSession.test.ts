import { expect, it, vi } from 'vitest';
import { configureApi } from './application';
import { financeApi } from '../domains/finance/api';
import { fetchAllPages } from '../utils/serialization';
import { createChemistTaskerApi } from '../platformApi';

for (const kind of ['finance', 'generic'] as const) {
  for (const next of [null, '/finance/items/?page=2']) {
    it(`${kind} pagination rejects a delayed ${next ? 'intermediate' : 'final'} page after a session switch and preserves same-session results`, async () => {
      for (const switchSession of [false, true]) {
        let generation = 7;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const fetchPage = vi.fn(async () => {
          if (fetchPage.mock.calls.length === 1) {
            await gate;
            return { results: [{ id: 1 }], next };
          }
          return { results: [{ id: 2 }], next: null };
        });
        configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => `token-${generation}`,
          getSessionGeneration: () => generation,
          fetchImpl: async () => new Response(JSON.stringify(await fetchPage()), {
            headers: { 'content-type': 'application/json' },
          }),
        });
        const pending = kind === 'finance' ? financeApi.items() : fetchAllPages(fetchPage);
        await vi.waitFor(() => expect(fetchPage).toHaveBeenCalledOnce());
        if (switchSession) generation += 2; // Logout and login, including returning to the same account.
        release();
        if (switchSession) {
          await expect(pending).rejects.toThrow(/Session changed/);
          expect(fetchPage).toHaveBeenCalledOnce();
        } else {
          await expect(pending).resolves.toEqual(next ? [{ id: 1 }, { id: 2 }] : [{ id: 1 }]);
          expect(fetchPage).toHaveBeenCalledTimes(next ? 2 : 1);
        }
      }
    });
  }
}

it('public optional-auth reads fall back anonymously after token lookup invalidates a session', async () => {
  for (const invalidate of [false, true]) {
    let generation = 0;
    const getAuthToken = vi.fn(async () => { if (invalidate) generation++; return invalidate ? null : 'valid-token'; });
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe(invalidate ? null : 'Bearer valid-token');
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api/v1',
      getAuthToken, getSessionGeneration: () => generation, fetchImpl });
    await api.publicContent.getPost(1);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(getAuthToken).toHaveBeenCalledOnce();
  }
});
