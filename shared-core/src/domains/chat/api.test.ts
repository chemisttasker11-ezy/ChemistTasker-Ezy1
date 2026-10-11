import { describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { reactToMessageService } from './api';

describe('chat reaction response contract', () => {
    it.each([
        ['add', 201, '❤️'],
        ['change', 201, '🔥'],
        ['remove', 204, '🔥'],
    ])('accepts an empty %s response', async (_action, status, reaction) => {
        const fetchImpl = vi.fn(async () => new Response(null, { status }));
        configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'fixture-token', fetchImpl });

        await expect(reactToMessageService(448, reaction)).resolves.toBeUndefined();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, options] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(String(url)).toBe('https://example.test/api/v1/messages/448/react/');
        expect(options.method).toBe('POST');
        expect(JSON.parse(options.body as string)).toEqual({ reaction });
    });

    it('still rejects an API failure', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ detail: 'Invalid reaction.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        }));
        configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'fixture-token', fetchImpl });
        await expect(reactToMessageService(448, 'invalid')).rejects.toThrow('Invalid reaction.');
    });
});
