import { describe, it, expect, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { getUnreadRoomSummary } from './api';

describe('Expo unread room summary contract', () => {
  it('keeps exact filtered route, raw backend fields and bearer token', async () => {
    const fetchImpl: ReturnType<typeof vi.fn> = vi.fn(async () => new Response(JSON.stringify({
      unread_total: 3, results: [{ unread_count: 2 }, { unread_count: 1 }],
    }), { headers: { 'content-type': 'application/json' } }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'chat-token', fetchImpl });
    const result = await getUnreadRoomSummary();
    expect(result.unread_total).toBe(3);
    expect((fetchImpl.mock.calls[0][0] as URL).pathname).toBe('/api/v1/rooms/');
    expect((fetchImpl.mock.calls[0][0] as URL).search).toBe('?unread=1');
    expect(new Headers(fetchImpl.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer chat-token');
  });
});
