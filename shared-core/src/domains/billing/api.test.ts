import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { chargeShiftFulfillment } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('shift fulfillment payment contract', () => {
    it('keeps the original endpoint and optional offer_ids payload through shared-core', async () => {
        const requests: Array<{ url: string; method: string; body: string | null; authorization: string | null }> = [];
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push({
                url: String(input),
                method: init?.method ?? 'GET',
                body: typeof init?.body === 'string' ? init.body : null,
                authorization: new Headers(init?.headers).get('Authorization'),
            });
            return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/test' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }) as unknown as typeof fetch;
        configureApi({
            baseURL: 'https://api.example.test/api/v1',
            getToken: async () => 'shift-owner-token',
            fetchImpl,
        });

        const result = await chargeShiftFulfillment(81, { offerIds: [21, 22] });
        await chargeShiftFulfillment(82, { offerIds: [] });
        await chargeShiftFulfillment(83);

        expect(result.url).toBe('https://checkout.stripe.com/test');
        expect(requests).toEqual([
            { url: 'https://api.example.test/api/v1/billing/charge-fulfillment/81/', method: 'POST',
              body: JSON.stringify({ offer_ids: [21, 22] }), authorization: 'Bearer shift-owner-token' },
            { url: 'https://api.example.test/api/v1/billing/charge-fulfillment/82/', method: 'POST',
              body: JSON.stringify({}), authorization: 'Bearer shift-owner-token' },
            { url: 'https://api.example.test/api/v1/billing/charge-fulfillment/83/', method: 'POST',
              body: null, authorization: 'Bearer shift-owner-token' },
        ]);
    });
});
