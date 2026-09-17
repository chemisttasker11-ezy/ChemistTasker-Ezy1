import { describe, expect, it, vi } from 'vitest';
import { createChemistTaskerApi } from './platformApi';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

describe('createChemistTaskerApi public content', () => {
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
