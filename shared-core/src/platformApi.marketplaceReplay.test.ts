/**
 * REPLAY-t1 request contract (marketplace draft and photo replay, F2/F3):
 * - listing create keeps `client_request_id` in the JSON body (receipt LISTING_CREATE);
 * - updateListing(id, body, key) PATCH, updateAudience(id, body, key) POST,
 *   actOnListing(id, 'submit', expectedVersion, key) POST and uploadImage(id, formData, key) POST
 *   send the key as the `Idempotency-Key` header (receipts LISTING_UPDATE, LISTING_AUDIENCE,
 *   LISTING_SUBMIT, IMAGE_UPLOAD); the body is unchanged and an omitted key sends no header.
 */
import { describe, expect, it, vi } from 'vitest';
import { createChemistTaskerApi } from './platformApi';

const KEY = '0f7c2b8e-4c1d-4b6a-9e2f-3a5b7c9d1e2f';
type Call = { url: string; method: string; key: string | null; contentType: string | null; body: unknown };

function recordingApi() {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), method: init?.method ?? 'GET', key: headers.get('Idempotency-Key'),
      contentType: headers.get('Content-Type'), body: init?.body });
    return new Response(JSON.stringify({ id: 9, version: 2, publication_status: 'PENDING_REVIEW', current_circle: 'OWNED_CHAIN' }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const api = createChemistTaskerApi({ baseUrl: 'https://example.test/api/v1', getAuthToken: async () => 't', fetchImpl: fetchImpl as typeof fetch });
  // Cast: the keyed signatures are the contract under test and do not exist yet.
  return { calls, market: api.marketplace as any };
}

describe('marketplace keyed saves send Idempotency-Key', () => {
  it('patch, audience, submit and upload carry the caller key without changing the body', async () => {
    const { calls, market } = recordingApi();
    const form = new FormData();
    form.append('image', new Blob(['bytes'], { type: 'image/jpeg' }), 'photo.jpg');
    await market.updateListing('L1', { title: 'Frozen', expected_version: 3 }, KEY);
    await market.updateAudience('L1', { expected_version: 4, current_circle: 'OWNED_CHAIN' }, KEY);
    await market.actOnListing('L1', 'submit', 5, KEY);
    await market.uploadImage('L1', form, KEY);

    expect(calls.map(({ url, method, key }) => ({ url, method, key }))).toEqual([
      { url: 'https://example.test/api/v1/marketplace/listings/L1/', method: 'PATCH', key: KEY },
      { url: 'https://example.test/api/v1/marketplace/listings/L1/audience/', method: 'POST', key: KEY },
      { url: 'https://example.test/api/v1/marketplace/listings/L1/submit/', method: 'POST', key: KEY },
      { url: 'https://example.test/api/v1/marketplace/listings/L1/images/', method: 'POST', key: KEY },
    ]);
    expect(JSON.parse(String(calls[0].body))).toEqual({ title: 'Frozen', expected_version: 3 });
    expect(JSON.parse(String(calls[2].body))).toEqual({ expected_version: 5 });
    expect(calls[3].body).toBe(form);
    expect(calls[3].contentType).toBeNull(); // multipart boundary is left to fetch
  });

  it('unkeyed legacy calls send no Idempotency-Key header (positive control)', async () => {
    const { calls, market } = recordingApi();
    await market.updateListing('L1', { title: 'Legacy', expected_version: 1 });
    await market.actOnListing('L1', 'withdraw', 2);
    await market.createListing({ client_request_id: KEY, title: 'Create keeps its body key' });
    expect(calls.map(call => call.key)).toEqual([null, null, null]);
    expect(JSON.parse(String(calls[2].body)).client_request_id).toBe(KEY);
  });
});
