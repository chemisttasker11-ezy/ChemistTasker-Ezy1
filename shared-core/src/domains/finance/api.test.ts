import { beforeEach, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { financeApi } from './api';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'test', fetchImpl: fetchMock });
});

it('markPaid sends explicit super fund confirmation with the invoice version', async () => {
    await financeApi.markPaid(12, 3, true);
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    expect(url.pathname).toBe('/api/v1/finance/invoices/12/mark-paid/');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ version: 3, fund_payment_confirmed: true });
});

it('markPaid preserves ordinary invoice payloads and never invents fund confirmation', async () => {
    for (const [version, confirmed, payload] of [
        [3, undefined, { version: 3 }],
        [undefined, undefined, {}],
        [3, false, { version: 3, fund_payment_confirmed: false }],
    ] as const) {
        await financeApi.markPaid(12, version, confirmed);
        expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual(payload);
    }
});
