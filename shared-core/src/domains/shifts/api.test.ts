import { afterEach, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { getActiveShiftDetail, getCommunityShiftDetail, getPublicShiftDetail } from './api';

afterEach(() => vi.unstubAllGlobals());

it.each([
    ['active', getActiveShiftDetail, 'shifts/active'],
    ['community', getCommunityShiftDetail, 'community-shifts'],
    ['public', getPublicShiftDetail, 'public-shifts'],
] as const)('loads %s shift details without a Django redirect away from the browser proxy', async (_, loadDetail, path) => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), method: init?.method ?? 'GET' });
        return new Response(JSON.stringify({ id: 42 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
    configureApi({ baseURL: 'https://dashboard.example.test/api/v1', getToken: async () => null, fetchImpl });

    expect(await loadDetail(42)).toEqual({ id: 42 });
    expect(requests).toEqual([{ url: `https://dashboard.example.test/api/v1/${path}/42/`, method: 'GET' }]);
});
