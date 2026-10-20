import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import {
  fetchPillBalanceService, fetchPillHistoryService, fetchPillReferralsService,
} from './api';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: URL) => {
    const path = url.pathname;
    const data = path.endsWith('/balance/')
      ? { balance: 12, shift_post_cost: 2 }
      : { results: [] };
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  });
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'session-token', fetchImpl: fetchMock });
});

describe('Pill rewards cross-platform domain read contracts', () => {
  it('keeps the same three exact backend routes, response shapes and authenticated transport', async () => {
    const [balance, history, referrals] = await Promise.all([
      fetchPillBalanceService(), fetchPillHistoryService(), fetchPillReferralsService(),
    ]);
    expect(balance).toEqual({ balance: 12, shift_post_cost: 2 });
    expect(history).toEqual({ results: [] });
    expect(referrals).toEqual({ results: [] });
    expect(fetchMock.mock.calls.map(([url]) => (url as URL).pathname)).toEqual([
      '/api/v1/pill-rewards/balance/',
      '/api/v1/pill-rewards/history/',
      '/api/v1/pill-rewards/referrals/',
    ]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.method ?? 'GET').toBe('GET');
    }
  });
});
