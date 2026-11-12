import { expect, it, vi } from 'vitest';
import { configureApi } from './application';
import { financeApi } from '../domains/finance/api';
import { fetchAllPages } from '../utils/serialization';
import { createChemistTaskerApi } from '../platformApi';
import { fetchAccessibleOrganizationPharmacies } from '../domains/organizations/api';
import { getExplorerPostFeed } from '../domains/talent/api';
import { loadAllTalentPages } from '../talent';

for (const kind of ['organization', 'talent'] as const) {
  for (const switchSession of [false, true]) {
    it(`${kind} delayed page ${switchSession ? 'rejects after session switch with only the old-token request' : 'merges all same-session pages'}`, async () => {
      let generation = 7;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const requests: { page: string | null; token: string | null }[] = [];
      configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => `token-${generation}`,
        getSessionGeneration: () => generation,
        fetchImpl: async (url, init) => {
          const page = new URL(String(url)).searchParams.get('page');
          requests.push({ page, token: new Headers(init?.headers).get('Authorization') });
          if (page === '1') await gate;
          return new Response(JSON.stringify(page === '1'
            ? { count: 4, next: '?page=2', results: [
                { id: 11, name: 'North', organization: 4 }, { id: 12, name: 'Other', organization: 5 },
              ] }
            : { count: 4, next: null, results: [
                { id: 13, name: 'South', organization: 4 }, { id: 0, name: 'Invalid', organization: 4 },
              ] }), { headers: { 'content-type': 'application/json' } });
        },
      });
      const pending = kind === 'organization' ? fetchAccessibleOrganizationPharmacies(4)
        : loadAllTalentPages(page => getExplorerPostFeed({ page }));
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      if (switchSession) generation += 2;
      release();
      if (switchSession) {
        await expect(pending).rejects.toThrow(/Session changed/);
        expect(requests).toEqual([{ page: '1', token: 'Bearer token-7' }]);
      } else {
        const rows = await pending;
        expect(rows.map(row => row.id)).toEqual(kind === 'organization' ? [11, 13] : [11, 12, 13, 0]);
        expect(requests).toEqual([1, 2].map(page => ({ page: String(page), token: 'Bearer token-7' })));
      }
    });
  }
}

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

it('talent discards a delayed batch before progress or another batch, while same-session batching completes', async () => {
  for (const switchSession of [false, true]) {
    let generation = 7;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const requests: { page: number; generation: number }[] = [];
    const progress: number[][] = [];
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token', getSessionGeneration: () => generation });
    const pending = loadAllTalentPages(async page => {
      requests.push({ page, generation });
      if (page === 2) await gate;
      return { count: 4, results: [{ id: page }] };
    }, 2, rows => progress.push(rows.map(row => row.id)));
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    if (switchSession) generation += 2;
    release();
    if (switchSession) {
      await expect(pending).rejects.toThrow(/Session changed/);
      expect(progress).toEqual([[1]]);
    } else {
      await expect(pending).resolves.toEqual([1, 2, 3, 4].map(id => ({ id })));
      expect(progress).toEqual([[1], [1, 2], [1, 2, 3], [1, 2, 3, 4]]);
    }
    expect(requests).toEqual((switchSession ? [1, 2, 3] : [1, 2, 3, 4]).map(page => ({ page, generation: 7 })));
  }
});

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
