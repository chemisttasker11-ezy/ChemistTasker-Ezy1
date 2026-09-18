import { describe, expect, it, vi } from 'vitest';
import { createChemistTaskerApi } from './platformApi';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

describe('createChemistTaskerApi public content', () => {
  it('exposes the current-user session route without client-local URL construction', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://example.test/api/users/me/');
      return json({ id: 1 });
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await api.account.getCurrentUser();
  });

  it('isolates concurrent request-scoped server tokens and keeps public SSR anonymous', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      return json(String(input).includes('/articles/')
        ? { count: 0, next: null, previous: null, results: [] }
        : { eligible_pharmacies: [] });
    });
    const first = createChemistTaskerApi({
      baseUrl: 'https://example.test/api',
      getAuthToken: async () => 'request-one-token',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const second = createChemistTaskerApi({
      baseUrl: 'https://example.test/api',
      getAuthToken: async () => 'request-two-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await Promise.all([
      first.marketplace.getAccess(),
      second.marketplace.getAccess(),
      first.publicContent.listArticles(),
    ]);

    expect(calls).toHaveLength(3);
    expect(calls).toEqual(expect.arrayContaining([
      { url: 'https://example.test/api/marketplace/me/access/', authorization: 'Bearer request-one-token' },
      { url: 'https://example.test/api/marketplace/me/access/', authorization: 'Bearer request-two-token' },
      { url: 'https://example.test/api/public-hub/articles/', authorization: null },
    ]));
  });

  it('uses public reads without attaching the configured token', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.test/api/public-hub/articles/?kind=news');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return json({ count: 0, next: null, previous: null, results: [] });
    });
    const api = createChemistTaskerApi({
      baseUrl: 'https://example.test/api',
      getAuthToken: () => 'private-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await api.publicContent.listArticles({ kind: 'news' });
  });

  it('uses authenticated named comment and reporting operations', async () => {
    const calls: Array<{ url: string; method: string; body: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body as string ?? null });
      return json({ detail: 'Report received.' }, 201);
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await api.publicContent.reportPost(7, { reason: 'spam', comment_id: 8 });
    await api.publicContent.reportArticleComment(9, { reason: 'unsafe' });

    expect(calls).toEqual([
      { url: 'https://example.test/api/public-hub/posts/7/report/', method: 'POST', body: JSON.stringify({ reason: 'spam', comment_id: 8 }) },
      { url: 'https://example.test/api/public-hub/comments/9/report/', method: 'POST', body: JSON.stringify({ reason: 'unsafe' }) },
    ]);
  });
});

describe('createChemistTaskerApi content management', () => {
  it('routes document and invitation actions through named operations', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return json({ detail: 'ok' });
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api/', fetchImpl: fetchImpl as typeof fetch });

    await api.contentManagement.actOnDocument(3, 'submit', { version: 2 });
    await api.contentManagement.actOnInvitation(4, 'revoke');
    await api.contentManagement.moderate('hub', 5, 'hide');

    expect(urls).toEqual([
      'https://example.test/api/content/documents/3/submit/',
      'https://example.test/api/content/invitations/4/revoke/',
      'https://example.test/api/content/moderation/hub/5/',
    ]);
  });
});

describe('createChemistTaskerApi Marketplace', () => {
  it('uses named listing, enquiry, exchange and saved-listing routes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return init?.method === 'DELETE' || String(input).includes('/saved/')
        ? new Response(null, { status: 204 })
        : json({ id: 'result', state: 'ENQUIRY', version: 1 });
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await api.marketplace.createEnquiry('listing-id', { client_request_id: 'request-id', message: 'Hello' });
    await api.marketplace.sendExchangeMessage('exchange-id', 'Agreed');
    await api.marketplace.saveListing('listing-id');
    await api.marketplace.unsaveListing('listing-id');

    expect(calls).toEqual([
      { url: 'https://example.test/api/marketplace/listings/listing-id/enquiries/', method: 'POST' },
      { url: 'https://example.test/api/marketplace/exchanges/exchange-id/messages/', method: 'POST' },
      { url: 'https://example.test/api/marketplace/saved/listing-id/', method: 'POST' },
      { url: 'https://example.test/api/marketplace/saved/listing-id/', method: 'DELETE' },
    ]);
  });
});

describe('createChemistTaskerApi Ethical Marketplace', () => {
  it('uses named import, lot, listing and transfer routes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return json({ id: 1, status: 'ok', state: 'ok', version: 2 });
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });
    const form = new FormData();
    form.append('file', new Blob(['barcode,batch_number']), 'stock.csv');

    await api.ethicalMarketplace.uploadImport(form);
    await api.ethicalMarketplace.reconcileLot(2, { expected_version: 1, on_hand_quantity: 4 });
    await api.ethicalMarketplace.actOnListing('listing-id', 'publish', { expected_version: 1 });
    await api.ethicalMarketplace.actOnTransfer('transfer-id', 'dispatch', { expected_version: 1, client_request_id: 'request-id' });

    expect(calls).toEqual([
      { url: 'https://example.test/api/ethical/inventory/imports/', method: 'POST' },
      { url: 'https://example.test/api/ethical/inventory/lots/2/reconcile/', method: 'POST' },
      { url: 'https://example.test/api/ethical/listings/listing-id/publish/', method: 'POST' },
      { url: 'https://example.test/api/ethical/transfers/transfer-id/dispatch/', method: 'POST' },
    ]);
    expect(api.ethicalMarketplace.transferDocumentPath('transfer-id', 9)).toBe('/ethical/transfers/transfer-id/documents/9/');
  });
});

describe('createChemistTaskerApi roster and attendance', () => {
  it('uses named manager, PIN and roster action routes', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return json({ status: 'ok', request_id: 1, message: 'ok' });
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await api.attendance.updatePin(2, '1234');
    await api.attendance.approve(3, 'Roster confirmed');
    await api.rosterV2.copyWeek({ source_period_id: 4, target_week_start: '2026-09-21' });
    await api.rosterV2.approveReplacement(5, 6);

    expect(urls).toEqual([
      'https://example.test/api/client-profile/attendance/worker/pin/update/',
      'https://example.test/api/client-profile/attendance/manager/approve/',
      'https://example.test/api/client-profile/attendance/roster/copy-week/',
      'https://example.test/api/client-profile/attendance/roster/manager/approve-replacement/',
    ]);
  });
});

describe('createChemistTaskerApi workforce', () => {
  it('uses named roster, leave and timesheet routes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return json([]);
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await api.workforce.getRosterWorkspace(2, '2026-09-21');
    await api.workforce.createLeave({ membership_id: 3, leave_type: 'ANNUAL', start_at: '2026-09-21T09:00:00Z', end_at: '2026-09-21T17:00:00Z' });
    await api.workforce.submitTimesheet(4, 5);

    expect(calls).toEqual([
      { url: 'https://example.test/api/client-profile/workforce/roster/workspace/?pharmacy_id=2&week_start=2026-09-21', method: 'GET' },
      { url: 'https://example.test/api/client-profile/workforce/leave/', method: 'POST' },
      { url: 'https://example.test/api/client-profile/workforce/timesheets/4/submit/', method: 'POST' },
    ]);
  });
});
