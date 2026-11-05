import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { createPharmacy, fetchChainsService, fetchChainPharmaciesService, createChainService, updateChainService, deleteChainService, addPharmacyToChain, removePharmacyFromChain } from './api';

let mockedFetch: ReturnType<typeof vi.fn>;
const key = '93ad2253-7a26-4ba8-8c86-080bb0eda3e8';
const lastCall = () => mockedFetch.mock.calls.at(-1) as [URL, RequestInit];

beforeEach(() => {
    mockedFetch = vi.fn(async () => new Response(JSON.stringify({ id: 42 }), {
        status: 201, headers: { 'content-type': 'application/json' },
    }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token', fetchImpl: mockedFetch });
});

describe('pharmacy create idempotency wire contract', () => {
    it.each(['json', 'multipart'])('sends the optional key on every %s retry', async (format) => {
        const payload = format === 'multipart' ? new FormData() : { name: 'Retry Pharmacy' };
        await createPharmacy(payload, key);
        await createPharmacy(payload, key);
        expect(mockedFetch).toHaveBeenCalledTimes(2);
        for (const [url, request] of mockedFetch.mock.calls as [URL, RequestInit][]) {
            expect(url.pathname).toBe('/api/v1/pharmacies/');
            expect(request.method).toBe('POST');
            const headers = new Headers(request.headers);
            expect(headers.get('Idempotency-Key')).toBe(key);
            expect(headers.get('Authorization')).toBe('Bearer token');
            expect(request.body).toEqual(format === 'multipart' ? payload : JSON.stringify(payload));
            if (format === 'multipart') expect(headers.has('Content-Type')).toBe(false);
        }
    });

    it('leaves the key absent for existing callers', async () => {
        const payload = { name: 'Ordinary Pharmacy' };
        await createPharmacy(payload);
        expect(new Headers(lastCall()[1].headers).has('Idempotency-Key')).toBe(false);
        expect(lastCall()[1].body).toBe(JSON.stringify(payload));
    });

    it('preserves the supplied key after a lost create response', async () => {
        mockedFetch.mockRejectedValueOnce(new TypeError('Response lost'));
        await expect(createPharmacy({ name: 'Retry Pharmacy' }, key)).rejects.toThrow('Response lost');
        await expect(createPharmacy({ name: 'Retry Pharmacy' }, key)).resolves.toEqual({ id: 42 });
        for (const [, request] of mockedFetch.mock.calls as [URL, RequestInit][]) {
            expect(new Headers(request.headers).get('Idempotency-Key')).toBe(key);
        }
    });

    it.each(['json', 'multipart'])('rejects a changed %s retry with the recovery pharmacy ID', async (format) => {
        const conflict = { detail: 'Pharmacy already saved with different details.', pharmacy_id: 42 };
        mockedFetch.mockResolvedValueOnce(new Response(JSON.stringify(conflict), {
            status: 409, headers: { 'content-type': 'application/json' },
        }));
        const payload = format === 'multipart' ? new FormData() : { name: 'Changed Pharmacy' };
        await expect(createPharmacy(payload, key)).rejects.toMatchObject({
            name: 'ApiError', status: 409, message: conflict.detail, payload: conflict,
        });
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        expect(new Headers(lastCall()[1].headers).get('Idempotency-Key')).toBe(key);
    });
});

describe('W4 chain management shared API boundaries', () => {
    it('reads only chain-scoped routes and writes expected chain/pharmacy IDs', async () => {
        mockedFetch.mockImplementation(async (url: URL) => {
            const isList = url.pathname === '/api/v1/chains/';
            const isLinked = url.pathname === '/api/v1/chains/12/pharmacies/';
            return new Response(JSON.stringify(isList
                ? [{ id: 12, name: 'North Chain', primary_contact_email: 'chain@example.test' }]
                : isLinked ? [{ id: 34, name: 'Store A' }] : { id: 12, name: 'North Chain' }), {
                status: 200, headers: { 'content-type': 'application/json' },
            });
        });
        expect((await fetchChainsService())[0]).toMatchObject({id: 12, name: 'North Chain', primaryContactEmail: 'chain@example.test'});
        expect((await fetchChainPharmaciesService(12))[0]).toMatchObject({id: 34, name: 'Store A'});
        const create = new FormData(); create.append('name', 'North Chain');
        await createChainService(create);
        await updateChainService(12, create);
        await addPharmacyToChain(12, 34);
        await removePharmacyFromChain(12, 34);
        await deleteChainService(12);
        const requests = mockedFetch.mock.calls as unknown as [URL, RequestInit][];
        expect(requests.map(([url, opts]) => [url.pathname, opts.method || 'GET'])).toEqual([
            ['/api/v1/chains/', 'GET'],
            ['/api/v1/chains/12/pharmacies/', 'GET'],
            ['/api/v1/chains/', 'POST'],
            ['/api/v1/chains/12/', 'PUT'],
            ['/api/v1/chains/12/add_pharmacy/', 'POST'],
            ['/api/v1/chains/12/remove_pharmacy/', 'POST'],
            ['/api/v1/chains/12/', 'DELETE'],
        ]);
        expect(JSON.parse(String(requests[4][1].body))).toEqual({ pharmacy_id: 34 });
        expect(JSON.parse(String(requests[5][1].body))).toEqual({ pharmacy_id: 34 });
        expect(new Headers(requests[2][1].headers).has('Content-Type')).toBe(false);
    });
});
