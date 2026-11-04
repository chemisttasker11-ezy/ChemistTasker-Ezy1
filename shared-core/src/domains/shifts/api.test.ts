import { afterEach, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { getActiveShiftDetail, getCommunityShiftDetail, getPublicShiftDetail, getActiveShiftsPage, getConfirmedShiftsPage, fetchAllActiveShifts, fetchAllConfirmedShifts } from './api';

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

it.each([
    ['active', getActiveShiftsPage, fetchAllActiveShifts],
    ['confirmed', getConfirmedShiftsPage, fetchAllConfirmedShifts],
] as const)('paginates %s shifts through shared-core with no client-built transport URLs', async (kind, fetchPage, fetchAll) => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        const page = Number(new URL(url).searchParams.get('page') || 1);
        return new Response(JSON.stringify({
            results: [{ id: page, pharmacy: 10 }],
            next: page === 1 ? `https://dashboard.example.test/api/v1/shifts/${kind}/?page=2` : null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    configureApi({ baseURL: 'https://dashboard.example.test/api/v1', getToken: async () => null, fetchImpl });
    const raw = await fetchPage(3);
    expect((raw as { results: Array<{ id: number }> }).results[0].id).toBe(3);
    const all = await fetchAll();
    expect(all).toHaveLength(2);
    expect(requests).toEqual([
        `https://dashboard.example.test/api/v1/shifts/${kind}/?page=3`,
        `https://dashboard.example.test/api/v1/shifts/${kind}/?page=1`,
        `https://dashboard.example.test/api/v1/shifts/${kind}/?page=2`,
    ]);
});
