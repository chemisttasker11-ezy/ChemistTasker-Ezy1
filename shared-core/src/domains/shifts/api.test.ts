// Replay contract: optional Idempotency-Key; unique (user, operation, key) receipt;
// 409 payload mismatch includes existing shift_id; replay rechecks current authorization.
import { afterEach, expect, it, vi } from 'vitest';
import { createPendingIntentStore } from '../talent/pendingPitch';
import { createOwnerShift, createOwnerShiftService, createShiftCounterOffer, submitShiftCounterOfferService } from './api';
import { configureApi } from '../../transport/application';
import { deleteShiftDescriptionTemplate } from './descriptionTemplates';
import { getActiveShiftDetail, getCommunityShiftDetail, getPublicShiftDetail, getActiveShiftsPage, getConfirmedShiftsPage, fetchAllActiveShifts, fetchAllConfirmedShifts, acceptShiftOfferService, fetchDeferredPayrollOffersService } from './api';

afterEach(() => vi.unstubAllGlobals());

const replayKey = '165416cf-c485-4aad-8914-d7580f831843';
const shiftBody = { pharmacy: 7, slots: [{ date: '2026-12-01', start_time: '09:00', end_time: '17:00' }] };
const offerBody = { shiftId: 42, slots: [{ slotId: 17, slotDate: '2026-12-01', proposedRate: 75 }] };
// Extra optional arguments are valid JavaScript today: failures must be behavior assertions.
const keyedOwner = createOwnerShift as (body: unknown, key?: string) => Promise<unknown>;
const keyedOwnerService = createOwnerShiftService as (body: unknown, key?: string) => Promise<unknown>;
const keyedOffer = createShiftCounterOffer as (id: number, body: unknown, key?: string) => Promise<unknown>;
const keyedOfferService = submitShiftCounterOfferService as (body: typeof offerBody, key?: string) => Promise<unknown>;

it.each([
    ['owner transport', (body: any, key?: string) => keyedOwner(body, key), shiftBody],
    ['owner service', (body: any, key?: string) => keyedOwnerService(body, key), shiftBody],
    ['offer transport', (body: any, key?: string) => keyedOffer(body.shiftId, body, key), offerBody],
    ['offer service', (body: any, key?: string) => keyedOfferService(body, key), offerBody],
] as const)('REPLAY %s resends persisted key and exact slots after commit + lost response', async (_label, send, body) => {
    const records = new Map<string, string>();
    const storage = { getItem: async (k: string) => records.get(k) ?? null,
        setItem: async (k: string, v: string) => { records.set(k, v); }, removeItem: async (k: string) => { records.delete(k); } };
    const store = () => createPendingIntentStore({ storage, lock: async (_k, run) => run(),
        environment: 'test', userId: 1, operation: _label.includes('owner') ? 'shift.create' : 'shift.counter_offer.create', newKey: () => replayKey });
    const intent = await store().acquire(body);
    const receipts = new Map<string, number>();
    const requests: Array<{ key: string | null; body: string }> = [];
    let outcomes = 0;
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: async () => 'account-1',
        fetchImpl: (async (_url: unknown, init?: RequestInit) => {
            const key = new Headers(init?.headers).get('Idempotency-Key');
            requests.push({ key, body: String(init?.body) });
            const id = key && receipts.get(key) || ++outcomes;
            if (key) receipts.set(key, id);
            if (requests.length === 1) throw Error('response lost AFTER server commit');
            return new Response(JSON.stringify({ id, slots: [] }), { status: 201, headers: { 'content-type': 'application/json' } });
        }) as typeof fetch });
    await expect(send(intent.exactPayload as any, intent.key)).rejects.toThrow();
    expect(outcomes).toBe(1); // The first request committed; no rollback simulation.
    const restored = await store().load(); // New store instance, same durable bytes.
    await send(restored!.exactPayload as any, restored!.key);
    expect(outcomes, 'retry created a second shift/offer because the header was dropped').toBe(1);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[0].key).toBe(replayKey);
});

it('REPLAY owner service returns the committed ID so recovery can edit the original shift', async () => {
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: async () => null,
        fetchImpl: (async () => new Response(JSON.stringify({ id: 42 }), {
            status: 201, headers: { 'content-type': 'application/json' },
        })) as typeof fetch });
    expect(await keyedOwnerService(shiftBody, replayKey)).toMatchObject({ id: 42 });
});

it('REPLAY unkeyed web owner creates remain independent', async () => {
    const keys: Array<string | null> = [];
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: async () => null,
        fetchImpl: (async (_url: unknown, init?: RequestInit) => {
            keys.push(new Headers(init?.headers).get('Idempotency-Key'));
            return new Response(JSON.stringify({ id: keys.length }), { status: 201, headers: { 'content-type': 'application/json' } });
        }) as typeof fetch });
    await createOwnerShift(shiftBody);
    await createOwnerShift(shiftBody);
    expect(keys).toEqual([null, null]);
});

it.each([
    ['active', getActiveShiftDetail, 'shifts/active'],
    ['community', getCommunityShiftDetail, 'community-shifts'],
    ['public', getPublicShiftDetail, 'public-shifts'],
] as const)('loads %s shift details without a Django redirect away from the browser proxy', async (_, loadDetail, path) => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), method: init?.method ?? 'GET' });
        return new Response(JSON.stringify({ id: 42 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
    configureApi({ baseURL: 'https://dashboard.example.test/api/v1', getToken: async () => null, fetchImpl });

    expect(await loadDetail(42)).toEqual({ id: 42 });
    expect(requests).toEqual([{ url: `https://dashboard.example.test/api/v1/${path}/42/`, method: 'GET' }]);
});

it.each([
    ['active', getActiveShiftsPage, fetchAllActiveShifts],
    ['confirmed', getConfirmedShiftsPage, fetchAllConfirmedShifts],
] as const)('paginates %s shifts through shared-core with no client-built transport URLs', async (kind, fetchPage, fetchAll) => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        const page = Number(new URL(url).searchParams.get('page') || 1);
        return new Response(JSON.stringify({
            results: [{ id: page, pharmacy: 10 }],
            next: page === 1 ? `https://dashboard.example.test/api/v1/shifts/${kind}/?page=2` : null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    configureApi({ baseURL: 'https://dashboard.example.test/api/v1', getToken: async () => null, fetchImpl });
    const raw = await fetchPage(3);
    expect((raw as { results: Array<{ id: number }> }).results[0].id).toBe(3);
    const all = await fetchAll();
    expect(all).toHaveLength(2);
    expect(requests).toEqual([
        `https://dashboard.example.test/api/v1/shifts/${kind}/?page=3`,
        `https://dashboard.example.test/api/v1/shifts/${kind}/?page=1`,
        `https://dashboard.example.test/api/v1/shifts/${kind}/?page=2`,
    ]);
});

it('echoes the version of each reviewed shift offer while preserving no-consent acceptance', async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(JSON.stringify({ status: 'ACCEPTED_AWAITING_PAYMENT' }), {
            status: 200, headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
    configureApi({ baseURL: 'https://dashboard.example.test/api/v1', getToken: async () => null, fetchImpl });

    await acceptShiftOfferService(3, {
        engagementTermsAccepted: true, independentContractorStatusConfirmed: true,
        termsVersion: 'reviewed-offer-version-3',
    });
    await acceptShiftOfferService(4);
    expect(payloads[0]).toMatchObject({
        engagement_terms_accepted: true,
        independent_contractor_status_confirmed: true,
        terms_version: 'reviewed-offer-version-3',
    });
    expect(payloads[1]).toEqual({
        engagement_terms_accepted: false,
        independent_contractor_status_confirmed: false,
    });
});

it('deletes a scoped shift-description template through the shared SDK', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({url: String(input), method: init?.method ?? 'GET'});
        return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    configureApi({baseURL: 'https://dashboard.example.test/api/v1', getToken: async () => null, fetchImpl});
    await deleteShiftDescriptionTemplate(31);
    expect(requests).toEqual([{url: 'https://dashboard.example.test/api/v1/shift-description-templates/31/', method: 'DELETE'}]);
});

it('paginates both deferred payroll offer states without mobile deep transport imports', async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const status = url.searchParams.get('status');
        const page = Number(url.searchParams.get('page') || 1);
        requested.push(status + ':' + page);
        return new Response(JSON.stringify({
            results: [{ id: page + (status === 'ACCEPTED' ? 10 : 20), payment_preference_snapshot: 'TFN', engagement_terms_preview: {payroll_activation_required: true} }],
            next: page === 1 ? '?page=2' : null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    configureApi({ baseURL: 'https://dashboard.example.test/api/v1', getToken: async () => null, fetchImpl });
    const offers = await fetchDeferredPayrollOffersService();
    expect(offers.map((row) => row.id).sort((a,b) => a-b)).toEqual([11,12,21,22]);
    expect(offers[0]).toMatchObject({paymentPreferenceSnapshot: 'TFN'});
    expect(requested.sort()).toEqual(['ACCEPTED:1','ACCEPTED:2','ACCEPTED_AWAITING_PAYMENT:1','ACCEPTED_AWAITING_PAYMENT:2']);
});
