import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import {
  getNotifications, markNotificationsAsRead, fetchNotificationsPage,
  markNotificationsReadService, getNotificationPushPreferences,
  updateNotificationPushPreferences,
} from './api';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json' },
});
let userToken = 'omar-token';
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  userToken = 'omar-token';
  fetchMock = vi.fn(async () => json({ count: 0, next: null, previous: null, results: [] }));
  configureApi({
    baseURL: 'https://m4.example.test/api/v1', getToken: () => userToken,
    fetchImpl: fetchMock,
  });
});

describe('M4-03 real notifications transport contracts', () => {
  it('requests the exact paginated endpoint and preserves the row/read receipt shape', async () => {
    fetchMock.mockImplementationOnce(async () => json({
      count: 21, next: 'https://m4.example.test/api/v1/notifications/?page=2',
      previous: null, unread: 19, results: [{
        id: 41, type: 'message', title: 'Hello', body: 'Message',
        action_url: '/dashboard/pharmacist/chat', payload: { room_id: 7 },
        created_at: '2026-11-07T01:00:00Z', read_at: null,
      }],
    }));
    const page = await fetchNotificationsPage(1);
    expect(page.count).toBe(21);
    expect(page.next).toContain('page=2');
    expect(page.unread).toBe(19);
    expect(page.results[0].id).toBe(41);
    expect(page.results[0].readAt).toBeNull();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url.pathname + url.search).toBe('/api/v1/notifications/?page=1');
    expect(options.method ?? 'GET').toBe('GET');
  });

  it('posts selected IDs only and propagates failed read receipts', async () => {
    fetchMock.mockImplementationOnce(async () => json({ marked: 1, unread: 3 }));
    expect(await markNotificationsReadService([41])).toEqual({ marked: 1, unread: 3 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.pathname).toBe('/api/v1/notifications/mark-read/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ids: [41] });
    fetchMock.mockImplementationOnce(async () => json({ detail: 'Access denied' }, 403));
    await expect(markNotificationsAsRead([41])).rejects.toThrow();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ids: [41] });
  });

  it('keeps auth headers scoped to whichever token initiated each request', async () => {
    let resolveFirst!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveFirst = resolve; }));
    const a = getNotifications(1);
    userToken = 'zoe-token';
    const b = getNotifications(2);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, first] = fetchMock.mock.calls[0];
    const [, second] = fetchMock.mock.calls[1];
    expect(new Headers(first.headers).get('Authorization')).toContain('omar-token');
    expect(new Headers(second.headers).get('Authorization')).toContain('zoe-token');
    resolveFirst(json({ count: 1, next: null, results: [{ id: 3 }] }));
    await Promise.all([a, b]);
  });

  it('GET/PATCH preferences use the existing user-owned endpoint and validate HTTP errors', async () => {
    fetchMock.mockImplementationOnce(async () => json({
      push_messages: true, push_tasks: true, push_work_notes: true,
      push_alerts: true, quiet_hours_enabled: false,
      quiet_start: '22:00:00', quiet_end: '07:00:00', time_zone: 'Australia/Brisbane',
    }));
    expect((await getNotificationPushPreferences()).push_messages).toBe(true);
    fetchMock.mockImplementationOnce(async () => json({
      push_messages: false, push_tasks: true, push_work_notes: true,
      push_alerts: true, quiet_hours_enabled: false,
      quiet_start: '22:00:00', quiet_end: '07:00:00', time_zone: 'Australia/Perth',
    }));
    const value = await updateNotificationPushPreferences({
      push_messages: false, time_zone: 'Australia/Perth',
    });
    expect(value.time_zone).toBe('Australia/Perth');
    expect(fetchMock.mock.calls[0][0].pathname).toBe('/api/v1/notification-push-preferences/');
    const [url, init] = fetchMock.mock.calls[1];
    expect(url.pathname).toBe('/api/v1/notification-push-preferences/');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ push_messages: false, time_zone: 'Australia/Perth' });
    fetchMock.mockImplementationOnce(async () => json({ time_zone: ['Invalid time zone'] }, 400));
    await expect(updateNotificationPushPreferences({ time_zone: 'Invalid/Zone' })).rejects.toThrow();
  });
});
