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

  it('uses authenticated named discussion operations with Django methods', async () => {
    const calls: Array<{ url: string; method: string; body: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body as string ?? null });
      if ((init?.method ?? 'GET') === 'DELETE' && String(input).includes('/comments/10/')) {
        return new Response(null, { status: 204 });
      }
      if (String(input).includes('/reaction/')) return json({ counts: { like: 1 }, mine: 'like' });
      return json({ detail: 'Report received.' }, 201);
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await api.publicContent.createArticleComment('hello', { body: 'Comment' });
    await api.publicContent.deleteArticleComment(10);
    await api.publicContent.reactToArticle('hello', { kind: 'like' });
    await api.publicContent.removeArticleReaction('hello');
    await api.publicContent.reactToArticleComment(11, { kind: 'support' });
    await api.publicContent.removeArticleCommentReaction(11);
    await api.publicContent.reportPost(7, { reason: 'spam', comment_id: 8 });
    await api.publicContent.reportArticleComment(9, { reason: 'unsafe' });

    expect(calls).toEqual([
      { url: 'https://example.test/api/public-hub/articles/hello/comments/', method: 'POST', body: JSON.stringify({ body: 'Comment' }) },
      { url: 'https://example.test/api/public-hub/comments/10/', method: 'DELETE', body: null },
      { url: 'https://example.test/api/public-hub/articles/hello/reaction/', method: 'PUT', body: JSON.stringify({ kind: 'like' }) },
      { url: 'https://example.test/api/public-hub/articles/hello/reaction/', method: 'DELETE', body: null },
      { url: 'https://example.test/api/public-hub/comments/11/reaction/', method: 'PUT', body: JSON.stringify({ kind: 'support' }) },
      { url: 'https://example.test/api/public-hub/comments/11/reaction/', method: 'DELETE', body: null },
      { url: 'https://example.test/api/public-hub/posts/7/report/', method: 'POST', body: JSON.stringify({ reason: 'spam', comment_id: 8 }) },
      { url: 'https://example.test/api/public-hub/comments/9/report/', method: 'POST', body: JSON.stringify({ reason: 'unsafe' }) },
    ]);
  });

describe('createChemistTaskerApi named community operations', () => {
  it('uses canonical login and original Hub endpoint owners without client-local routes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return json({ ok: true });
    });
    const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api', fetchImpl: fetchImpl as typeof fetch });

    await api.account.login({ email: 'user@example.test', password: 'secret' });
    await api.publicContent.createCommunityComment(4, { body: 'Reply', parent_comment: 2 });
    await api.publicContent.updateCommunityComment(4, 5, { body: 'Updated' });
    await api.publicContent.reactToCommunityPost(4, 'LIKE');
    await api.publicContent.removeCommunityCommentReaction(4, 5);

    expect(calls).toEqual([
      { url: 'https://example.test/api/users/login/', method: 'POST' },
      { url: 'https://example.test/api/client-profile/hub/posts/4/comments/', method: 'POST' },
      { url: 'https://example.test/api/client-profile/hub/posts/4/comments/5/', method: 'PATCH' },
      { url: 'https://example.test/api/client-profile/hub/posts/4/reactions/', method: 'POST' },
      { url: 'https://example.test/api/client-profile/hub/posts/4/comments/5/reactions/', method: 'DELETE' },
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

describe('createChemistTaskerApi ownership boundary', () => {
  it('keeps authenticated operational domains out of the Next/platform facade', () => {
    const api = createChemistTaskerApi({
      baseUrl: 'https://example.test/api',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    }) as Record<string, unknown>;

    expect('attendance' in api).toBe(false);
    expect('rosterV2' in api).toBe(false);
    expect('workforce' in api).toBe(false);
    expect('finance' in api).toBe(false);
    expect('marketplace' in api).toBe(true);
    expect('publicContent' in api).toBe(true);
  });
});
