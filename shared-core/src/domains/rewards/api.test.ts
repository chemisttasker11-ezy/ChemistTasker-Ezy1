import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import {
  fetchPillBalanceService, fetchPillHistoryService, fetchPillReferralsService,
  createFriendPillReferralService, createShiftPillReferralService,
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

describe('Pill referral creation wire compatibility', () => {
  it('keeps POST JSON body and exact friend and shift endpoints', async () => {
    await createFriendPillReferralService({});
    await createShiftPillReferralService({ shift_id: 321 });
    const [friend, shift] = fetchMock.mock.calls.slice(-2);
    expect((friend[0] as URL).pathname).toBe('/api/v1/pill-rewards/refer-friend/');
    expect((shift[0] as URL).pathname).toBe('/api/v1/pill-rewards/refer-shift/');
    expect(friend[1].method).toBe('POST');
    expect(shift[1].method).toBe('POST');
    expect(JSON.parse(String(friend[1].body))).toEqual({});
    expect(JSON.parse(String(shift[1].body))).toEqual({ shift_id: 321 });
  });
});

describe('rewards authentication and failure parity', () => {
  it('sends the configured user bearer token for reward reads and mutations', async () => {
    await fetchPillBalanceService();
    await createFriendPillReferralService({});
    for (const [, options] of fetchMock.mock.calls) {
      const headers = new Headers(options.headers);
      expect(headers.get('Authorization')).toBe('Bearer session-token');
      expect(options.credentials).toBe('include');
    }
  });
  it('surfaces backend validation status and message instead of treating a failed referral as successful', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      detail: 'The referral limit has been reached.',
    }), { status: 400, headers: { 'content-type': 'application/json' } }));
    await expect(createFriendPillReferralService({})).rejects.toMatchObject({
      name: 'ApiError', status: 400, message: 'The referral limit has been reached.',
    });
  });
  it('never exposes raw 500 response details to mobile or browser callers', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<h1>internal traceback</h1>', {
      status: 500, headers: { 'content-type': 'text/html' },
    }));
    await expect(fetchPillBalanceService()).rejects.toMatchObject({
      status: 500, message: 'Request failed with status 500', payload: null,
    });
  });
  it('uses one refresh retry when configured and respects the rotated token', async () => {
    const refreshed = vi.fn(async () => 'rotated-token');
    fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Expired.' }), {
        status: 401, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ balance: 6 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
    configureApi({
      baseURL: 'https://example.test/api/v1',
      getToken: () => 'expired-token',
      refreshToken: refreshed,
      fetchImpl: fetchMock,
    });
    expect((await fetchPillBalanceService()).balance).toBe(6);
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer expired-token');
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer rotated-token');
  });
});
