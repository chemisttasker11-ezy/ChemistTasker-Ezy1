import { describe, expect, it, vi } from 'vitest';
import { createChemistTaskerApi } from './platformApi';
import type { MarketplaceListingWrite } from './contracts/marketplace';

const BASE = 'https://m4.example.test/api/v1';
const ID = 'a1111111-1111-4111-8111-111111111111';
const KEY = 'b2222222-2222-4222-8222-222222222222';
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'content-type': 'application/json' },
});
const body: MarketplaceListingWrite = {
  client_request_id: KEY,
  seller_context: 'PHARMACY', pharmacy: 11, category: 7,
  mode: 'SELL', title: 'Well-maintained shelving', description: 'Pharmacy fixtures',
  condition: 'GOOD', quantity: 1, unit: 'item', amount: '150.00',
  desired_swap: '', suburb: 'Brisbane', state: 'QLD', postcode: '4000',
  private_pickup_details: 'Private', allowed_buyer_roles: ['OWNER'],
  delivery: { method: 'PICKUP' },
};

function transport() {
  const calls: Array<{ url: string; method: string; headers: Headers; body: BodyInit | null }> = [];
  const replies: Array<Response> = [];
  const api = createChemistTaskerApi({
    baseUrl: BASE, getAuthToken: () => 'M4-test-account',
    fetchImpl: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method || 'GET',
        headers: new Headers(init?.headers), body: init?.body || null });
      const reply = replies.shift();
      if (!reply) throw new Error('Unscripted network request ' + input);
      return reply;
    }) as typeof fetch,
  });
  return { api, calls, replies };
}
const parsed = (call: { body: BodyInit | null }) => JSON.parse(String(call.body));

describe('M4-04 real platform Marketplace transport boundary', () => {
  it('GET listing options is scoped to the caller and does not confuse HTTP 200 with trading eligibility', async () => {
    const h = transport();
    h.replies.push(json({
      can_trade_personally: false, can_trade_for_pharmacy: false,
      role_code: 'EXPLORER', blockers: [{ code: 'TERMS_NOT_ACCEPTED' }],
      eligible_pharmacies: [], personal_categories: [], pharmacy_categories: [],
    }));
    const options = await h.api.marketplace.getListingOptions();
    expect(options.can_trade_for_pharmacy).toBe(false);
    expect(options.blockers[0].code).toBe('TERMS_NOT_ACCEPTED');
    expect(h.calls[0].url).toBe(BASE + '/marketplace/me/listing-options/');
    expect(h.calls[0].headers.get('Authorization')).toBe('Bearer M4-test-account');
  });

  it('create always sends the captured UUID and unchanged seller/delivery data on retry', async () => {
    const h = transport();
    h.replies.push(json({ id: ID, version: 1 }, 201), json({ id: ID, version: 1 }, 200));
    expect((await h.api.marketplace.createListing(body)).id).toBe(ID);
    expect((await h.api.marketplace.createListing(body)).version).toBe(1);
    expect(h.calls.map(x => x.url)).toEqual([BASE + '/marketplace/listings/',
      BASE + '/marketplace/listings/']);
    expect(h.calls.map(x => x.method)).toEqual(['POST', 'POST']);
    expect(parsed(h.calls[0])).toEqual(body);
    expect(parsed(h.calls[1])).toEqual(body);
  });

  it('PATCH carries expected_version and audience returns new version for review', async () => {
    const h = transport();
    h.replies.push(json({ id: ID, version: 2 }),
      json({ current_circle: 'OWNED_CHAIN', maximum_circle: 'PLATFORM', version: 3 }),
      json({ publication_status: 'PENDING_REVIEW', availability_status: 'AVAILABLE', version: 4 }));
    const updated = await h.api.marketplace.updateListing(ID, { ...body, expected_version: 1 });
    const audience = await h.api.marketplace.updateAudience(ID, {
      expected_version: updated.version, current_circle: 'OWNED_CHAIN', maximum_circle: 'PLATFORM',
    });
    const submitted = await h.api.marketplace.actOnListing(ID, 'submit', audience.version);
    expect(submitted.version).toBe(4);
    expect(h.calls.map(c => [c.method, c.url])).toEqual([
      ['PATCH', BASE + '/marketplace/listings/' + ID + '/'],
      ['POST', BASE + '/marketplace/listings/' + ID + '/audience/'],
      ['POST', BASE + '/marketplace/listings/' + ID + '/submit/'],
    ]);
    expect(parsed(h.calls[0]).expected_version).toBe(1);
    expect(parsed(h.calls[1])).toEqual({
      expected_version: 2, current_circle: 'OWNED_CHAIN', maximum_circle: 'PLATFORM',
    });
    expect(parsed(h.calls[2])).toEqual({ expected_version: 3 });
  });

  it('multipart image upload preserves its Blob and has no fabricated version parameter', async () => {
    const h = transport();
    h.replies.push(json({ id: 17, moderation_status: 'PENDING' }, 201));
    const form = new FormData();
    form.append('image', new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' }), 'listing.jpg');
    const image = await h.api.marketplace.uploadImage(ID, form);
    expect(image.id).toBe(17);
    expect(h.calls[0].url).toBe(BASE + '/marketplace/listings/' + ID + '/images/');
    expect(h.calls[0].method).toBe('POST');
    expect(h.calls[0].body).toBe(form);
    expect(h.calls[0].headers.has('Content-Type')).toBe(false);
    expect((form.get('image') as Blob).size).toBe(3);
    expect(form.has('expected_version')).toBe(false);
  });

  it('does not silently convert policy, stale version or image responses into success', async () => {
    const h = transport();
    h.replies.push(json({ code: 'NEW_LISTINGS_DISABLED' }, 503),
      json({ code: 'STALE_VERSION' }, 409),
      json({ code: 'IMAGE_TOO_LARGE_OR_MISSING' }, 413),
      json({ image: ['Upload a valid, safe raster image.'] }, 400));
    await expect(h.api.marketplace.createListing(body)).rejects.toThrow();
    await expect(h.api.marketplace.updateListing(ID, { expected_version: 1 })).rejects.toThrow();
    const form = new FormData();
    form.append('image', new Blob(['bad']), 'bad.jpg');
    await expect(h.api.marketplace.uploadImage(ID, form)).rejects.toThrow();
    await expect(h.api.marketplace.uploadImage(ID, form)).rejects.toThrow();
    expect(h.calls).toHaveLength(4);
  });

  it('separate scoped API clients never share a mutable auth token or request body', async () => {
    const calls: string[] = [];
    const config = (name: string) => createChemistTaskerApi({
      baseUrl: BASE, getAuthToken: async () => name,
      fetchImpl: vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Headers(init?.headers).get('Authorization') || '');
        return json({ id: ID, version: 1 }, 201);
      }) as typeof fetch,
    });
    await Promise.all([
      config('Tom').marketplace.createListing(body),
      config('Nadia').marketplace.createListing({ ...body, pharmacy: 22, title: 'Nadia listing' }),
    ]);
    expect(calls.sort()).toEqual(['Bearer Nadia', 'Bearer Tom']);
  });
});
