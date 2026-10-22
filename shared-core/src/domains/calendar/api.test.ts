import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import {
  actOnWorkNote,
  createCalendarEvent,
  createWorkNote,
  deleteCalendarEvent,
  deleteWorkNote,
  getCalendarFeed,
  markWorkNoteDone,
  markWorkNoteOpen,
  updateCalendarEvent,
  updateWorkNote,
} from './api';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url: URL | RequestInfo) => {
    const rawUrl = String(url);
    const parsed = new URL(rawUrl, 'https://example.test');
    const path = parsed.pathname;

    let data: unknown = { ok: true };
    if (path.includes('/calendar-feed/')) {
      data = {
        events: [],
        work_notes: [],
        date_from: '2026-10-01',
        date_to: '2026-10-31',
        pharmacy_id: 42,
        organization_id: null,
      };
    } else if (path.includes('/calendar-events/')) {
      data = { id: 10, title: 'Test Event' };
    } else if (path.includes('/work-notes/')) {
      data = { id: 20, title: 'Test Note', status: 'OPEN' };
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  configureApi({
    baseURL: 'https://example.test/api/v1',
    getToken: () => 'calendar-bearer-token',
    fetchImpl: fetchMock,
  });
});

describe('GET feed scoping and feed response shape', () => {
  it('scopes calendar feed query by pharmacy_id and date range while preserving raw response shape', async () => {
    const feed = await getCalendarFeed({
      pharmacy_id: 42,
      date_from: '2026-10-01',
      date_to: '2026-10-31',
    });

    expect(feed).toEqual({
      events: [],
      work_notes: [],
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      pharmacy_id: 42,
      organization_id: null,
    });

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/calendar-feed/');
    expect(url.searchParams.get('pharmacy_id')).toBe('42');
    expect(url.searchParams.get('date_from')).toBe('2026-10-01');
    expect(url.searchParams.get('date_to')).toBe('2026-10-31');
    expect(options.method ?? 'GET').toBe('GET');
    expect(options.body).toBeUndefined();
  });

  it('supports camelCase filters and organization_id scoping without altering query semantics', async () => {
    await getCalendarFeed({
      pharmacyId: 99,
      organizationId: 7,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });

    const [callUrl] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.searchParams.get('pharmacy_id')).toBe('99');
    expect(url.searchParams.get('organization_id')).toBe('7');
    expect(url.searchParams.get('date_from')).toBe('2026-11-01');
    expect(url.searchParams.get('date_to')).toBe('2026-11-30');
  });
});

describe('Calendar Event wire payloads and mutations', () => {
  it('preserves all event fields including snake_case times, all_day false, and recurrence object on create', async () => {
    const payload = {
      pharmacy: 42,
      title: 'Pharmacy Audit',
      description: 'Annual quality inspection',
      date: '2026-10-25',
      all_day: false,
      start_time: '09:00',
      end_time: '17:00',
      recurrence: {
        freq: 'WEEKLY',
        interval: 1,
        until_date: '2026-12-31',
      },
    };

    await createCalendarEvent(payload);

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/calendar-events/');
    expect(options.method).toBe('POST');

    const sent = JSON.parse(String(options.body));
    expect(sent).toEqual({
      pharmacy: 42,
      title: 'Pharmacy Audit',
      description: 'Annual quality inspection',
      date: '2026-10-25',
      all_day: false,
      start_time: '09:00',
      end_time: '17:00',
      recurrence: {
        freq: 'WEEKLY',
        interval: 1,
        until_date: '2026-12-31',
      },
    });
  });

  it('preserves null values for recurrence and times without reinterpreting them or dropping keys', async () => {
    await createCalendarEvent({
      pharmacy: 42,
      title: 'All Day Event',
      date: '2026-10-26',
      all_day: true,
      start_time: null,
      end_time: null,
      recurrence: null,
    });

    const [, options] = fetchMock.mock.calls[0];
    const sent = JSON.parse(String(options.body));
    expect(sent.pharmacy).toBe(42);
    expect(sent.all_day).toBe(true);
    expect(sent.start_time).toBeNull();
    expect(sent.end_time).toBeNull();
    expect(sent.recurrence).toBeNull();
  });

  it('preserves pharmacy, recurrence null, and snake_case times on PATCH update', async () => {
    await updateCalendarEvent(123, {
      pharmacy: 42,
      title: 'Updated Audit',
      date: '2026-10-27',
      all_day: false,
      start_time: '10:00',
      end_time: '16:00',
      recurrence: null,
    });

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/calendar-events/123/');
    expect(options.method).toBe('PATCH');

    const sent = JSON.parse(String(options.body));
    expect(sent).toEqual({
      pharmacy: 42,
      title: 'Updated Audit',
      date: '2026-10-27',
      all_day: false,
      start_time: '10:00',
      end_time: '16:00',
      recurrence: null,
    });
  });

  it('dispatches DELETE to exact event resource path', async () => {
    await deleteCalendarEvent(123);

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/calendar-events/123/');
    expect(options.method).toBe('DELETE');
  });
});

describe('Work Note wire payloads and mutations', () => {
  it('preserves all note fields including notify_on_shift_start, is_general, assignees and recurrence', async () => {
    const payload = {
      pharmacy: 42,
      date: '2026-10-25',
      title: 'Check CD Safe',
      body: 'Count S8 safe balance before opening',
      notify_on_shift_start: true,
      is_general: false,
      assignee_membership_ids: [101, 102],
      recurrence: {
        freq: 'DAILY',
        interval: 1,
        until_date: null,
      },
    };

    await createWorkNote(payload);

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/work-notes/');
    expect(options.method).toBe('POST');

    const sent = JSON.parse(String(options.body));
    expect(sent).toEqual({
      pharmacy: 42,
      date: '2026-10-25',
      title: 'Check CD Safe',
      body: 'Count S8 safe balance before opening',
      status: undefined,
      notify_on_shift_start: true,
      is_general: false,
      assignee_membership_ids: [101, 102],
      recurrence: {
        freq: 'DAILY',
        interval: 1,
        until_date: null,
      },
    });
  });

  it('preserves pharmacy, date, assignees and recurrence null on PATCH update', async () => {
    await updateWorkNote(456, {
      pharmacy: 42,
      date: '2026-10-28',
      title: 'General Maintenance',
      body: 'Clean dispensary counter',
      notify_on_shift_start: false,
      is_general: true,
      assignee_membership_ids: [],
      recurrence: null,
    });

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/work-notes/456/');
    expect(options.method).toBe('PATCH');

    const sent = JSON.parse(String(options.body));
    expect(sent).toEqual({
      pharmacy: 42,
      date: '2026-10-28',
      title: 'General Maintenance',
      body: 'Clean dispensary counter',
      notify_on_shift_start: false,
      is_general: true,
      assignee_membership_ids: [],
      recurrence: null,
    });
  });

  it('dispatches DELETE to exact work note resource path', async () => {
    await deleteWorkNote(456);

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/work-notes/456/');
    expect(options.method).toBe('DELETE');
  });
});

describe('Dynamic action mapping and recurring work note completions', () => {
  it('dispatches mark_done with occurrence_date payload when options are provided', async () => {
    await markWorkNoteDone(456, { occurrence_date: '2026-10-25' });

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/work-notes/456/mark_done/');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({
      occurrence_date: '2026-10-25',
    });
  });

  it('dispatches mark_open with occurrence_date payload when options are provided', async () => {
    await markWorkNoteOpen(456, { occurrence_date: '2026-10-25' });

    const [callUrl, options] = fetchMock.mock.calls[0];
    const url = new URL(String(callUrl));
    expect(url.pathname).toBe('/api/v1/work-notes/456/mark_open/');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({
      occurrence_date: '2026-10-25',
    });
  });

  it('retains bodyless compatibility when mark_done or mark_open is called without occurrence argument', async () => {
    await markWorkNoteDone(456);
    await markWorkNoteOpen(456);

    const [firstCall, secondCall] = fetchMock.mock.calls.slice(-2);
    expect(new URL(String(firstCall[0])).pathname).toBe('/api/v1/work-notes/456/mark_done/');
    expect(firstCall[1].body).toBeUndefined();
    expect(new URL(String(secondCall[0])).pathname).toBe('/api/v1/work-notes/456/mark_open/');
    expect(secondCall[1].body).toBeUndefined();
  });

  it('maps dynamic actions mark_done and mark_open via actOnWorkNote', async () => {
    await actOnWorkNote(456, 'mark_done', { occurrence_date: '2026-10-25' });
    await actOnWorkNote(456, 'mark_open', { occurrence_date: '2026-10-25' });

    const [doneCall, openCall] = fetchMock.mock.calls.slice(-2);
    expect(new URL(String(doneCall[0])).pathname).toBe('/api/v1/work-notes/456/mark_done/');
    expect(JSON.parse(String(doneCall[1].body))).toEqual({ occurrence_date: '2026-10-25' });

    expect(new URL(String(openCall[0])).pathname).toBe('/api/v1/work-notes/456/mark_open/');
    expect(JSON.parse(String(openCall[1].body))).toEqual({ occurrence_date: '2026-10-25' });
  });

});

describe('Authentication and 400/403 failure semantics', () => {
  it('sends the configured bearer token on calendar operations', async () => {
    await getCalendarFeed({ pharmacy_id: 42, date_from: '2026-10-01', date_to: '2026-10-31' });

    const [, options] = fetchMock.mock.calls[0];
    const headers = new Headers(options.headers);
    expect(headers.get('Authorization')).toBe('Bearer calendar-bearer-token');
    expect(options.credentials).toBe('include');
  });

  it('surfaces backend 400 validation error status and message without loss of detail', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          occurrence_date: ['Invalid date format. Use YYYY-MM-DD.'],
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(
      markWorkNoteDone(456, { occurrence_date: 'invalid-date' })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Invalid date format. Use YYYY-MM-DD.',
      payload: {
        occurrence_date: ['Invalid date format. Use YYYY-MM-DD.'],
      },
    });
  });

  it('surfaces backend 403 permission error detail without degrading text', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          detail: "You don't have permission to edit this work note.",
        }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(deleteWorkNote(456)).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      message: "You don't have permission to edit this work note.",
      payload: {
        detail: "You don't have permission to edit this work note.",
      },
    });
  });
});


describe('Request signal forwarding and abort semantics', () => {
  it.each([
    ['getCalendarFeed', (s: AbortSignal) => getCalendarFeed({ pharmacy_id: 42, date_from: '2026-10-01', date_to: '2026-10-31' }, { signal: s })],
    ['createCalendarEvent', (s: AbortSignal) => createCalendarEvent({ pharmacy: 42, title: 'Budget Event', date: '2026-10-25' }, { signal: s })],
    ['updateCalendarEvent', (s: AbortSignal) => updateCalendarEvent(123, { title: 'Updated Event' }, { signal: s })],
    ['deleteCalendarEvent', (s: AbortSignal) => deleteCalendarEvent(123, { signal: s })],
    ['createWorkNote', (s: AbortSignal) => createWorkNote({ pharmacy: 42, title: 'Check CD Safe', date: '2026-10-25' }, { signal: s })],
    ['updateWorkNote', (s: AbortSignal) => updateWorkNote(456, { title: 'General Maintenance' }, { signal: s })],
    ['deleteWorkNote', (s: AbortSignal) => deleteWorkNote(456, { signal: s })],
    ['markWorkNoteDone', (s: AbortSignal) => markWorkNoteDone(456, { occurrence_date: '2026-10-25' }, { signal: s })],
    ['markWorkNoteOpen', (s: AbortSignal) => markWorkNoteOpen(456, { occurrence_date: '2026-10-25' }, { signal: s })],
    ['actOnWorkNote', (s: AbortSignal) => actOnWorkNote(456, 'mark_done', { occurrence_date: '2026-10-25' }, { signal: s })],
  ] as const)('forwards signal to transport fetch options for %s', async (_name, invoke) => {
    const controller = new AbortController();
    await invoke(controller.signal);
    const [, options] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(options.signal).toBe(controller.signal);
  });

  it('rejects when aborted during a stalled fetch request', async () => {
    let onFetchStart!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      onFetchStart = resolve;
    });

    fetchMock.mockImplementationOnce((_url: URL | RequestInfo, options?: RequestInit) => {
      onFetchStart();
      return new Promise((_resolve, reject) => {
        if (options?.signal?.aborted) {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        options?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const controller = new AbortController();
    const feedPromise = getCalendarFeed(
      { pharmacy_id: 42, date_from: '2026-10-01', date_to: '2026-10-31' },
      { signal: controller.signal }
    );

    await fetchStarted;
    controller.abort();
    await expect(feedPromise).rejects.toThrow('The operation was aborted.');
  });

  it('rejects when aborted during stalled response body consumption', async () => {
    let onBodyStart!: () => void;
    const bodyStarted = new Promise<void>((resolve) => {
      onBodyStart = resolve;
    });

    fetchMock.mockImplementationOnce((_url: URL | RequestInfo, options?: RequestInit) => {
      const forwardedSignal = options?.signal;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => {
          onBodyStart();
          return new Promise((_resolve, reject) => {
            if (forwardedSignal?.aborted) {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }
            forwardedSignal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          });
        },
      } as unknown as Response);
    });

    const controller = new AbortController();
    const feedPromise = getCalendarFeed(
      { pharmacy_id: 42, date_from: '2026-10-01', date_to: '2026-10-31' },
      { signal: controller.signal }
    );

    await bodyStarted;
    controller.abort();
    await expect(feedPromise).rejects.toThrow('The operation was aborted.');
  });

  it('remains backward compatible when no signal is provided', async () => {
    const feed = await getCalendarFeed({
      pharmacy_id: 42,
      date_from: '2026-10-01',
      date_to: '2026-10-31',
    });
    expect(feed.pharmacy_id).toBe(42);
    const [, feedOptions] = fetchMock.mock.calls[0];
    expect(feedOptions.signal).toBeUndefined();

    await updateCalendarEvent(123, { title: 'Updated Event' });
    const [, updateOptions] = fetchMock.mock.calls[1];
    expect(updateOptions.signal).toBeUndefined();

    await deleteCalendarEvent(123);
    const [, deleteOptions] = fetchMock.mock.calls[2];
    expect(deleteOptions.signal).toBeUndefined();
  });
});
