import { describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { fetchChatParticipants, reactToMessageService, startDirectMessageByMembership } from './api';

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

describe('chat participant identity contract', () => {
    it('exposes searchable names without replacing membership IDs with user IDs', async () => {
        const fetchImpl = vi.fn(async (url: RequestInfo | URL) => new Response(JSON.stringify(
            String(url).includes('chat-participants')
                ? { results: [{ id: 7, user_details: { id: 91, first_name: 'Omar', last_name: 'Ali', email: 'omar@example.test' } }] }
                : { id: 12, type: 'DM', title: '', participant_ids: [7] },
        ), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'fixture-token', fetchImpl });
        const participants = await fetchChatParticipants();
        const matches = participants.filter((person: any) => `${person.firstName} ${person.lastName}`.toLowerCase().includes('omar'));
        expect(matches).toHaveLength(1);
        expect(participants.filter((person: any) => `${person.firstName} ${person.lastName}`.toLowerCase().includes('unrelated'))).toHaveLength(0);
        expect(matches[0]).toMatchObject({ id: 7, membership_id: 7, firstName: 'Omar', email: 'omar@example.test', userDetails: { id: 91 } });
        await startDirectMessageByMembership((matches[0] as any).membership_id, null);
        expect(JSON.parse((fetchImpl.mock.calls[1] as any)[1].body)).toEqual({ partner_membership_id: 7 });
    });
});

describe('chat multipart ownership contract', () => {
    it('passes the same FormData to transport without forcing a JSON boundary', async () => {
        const { sendRoomMessage } = await import('./api');
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{ id: 71 }]), {
            status: 201, headers: { 'Content-Type': 'application/json' },
        }));
        configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'fixture-token', fetchImpl });
        const form = new FormData();
        form.append('attachments', new Blob(['%PDF-1.4 test']), 'report.pdf');
        form.append('attachments', new Blob(['test image']), 'image.png');
        await sendRoomMessage(12, form);
        const [, options] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(options.body).toBe(form);
        expect(new Headers(options.headers).has('Content-Type')).toBe(false);
        expect(form.getAll('attachments')).toHaveLength(2);
    });
});
