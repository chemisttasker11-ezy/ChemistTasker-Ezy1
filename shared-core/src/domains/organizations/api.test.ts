import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { createPharmacy } from './api';

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
