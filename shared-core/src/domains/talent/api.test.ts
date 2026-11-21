import { afterEach, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { fetchUserAvailabilityService } from './api';

afterEach(() => vi.unstubAllGlobals());

it('fetches all availability pages before deciding whether a retry already saved a date', async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        requests.push(url.pathname + url.search);
        const page = url.searchParams.get('page') || '1';
        return new Response(JSON.stringify({
            results: [{
                id: Number(page), date: '2026-11-' + (page === '1' ? '11' : '12'),
                start_time: '09:00:00', end_time: '17:00:00', is_recurring: false,
                recurring_days: [], notify_new_shifts: true,
            }],
            next: page === '1' ? '?page=2' : null,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    configureApi({baseURL:'https://example.test/api/v1',getToken:()=> 'worker-token',fetchImpl});
    const entries = await fetchUserAvailabilityService();
    expect(entries.map((item) => item.id)).toEqual([1,2]);
    expect(entries[1]).toMatchObject({date:'2026-11-12',startTime:'09:00:00'});
    expect(requests).toEqual(['/api/v1/user-availability/?page=1','/api/v1/user-availability/?page=2']);
});

it('keeps a single unpaginated availability response compatible', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{id:7,date:'2026-11-12'}]), {headers:{'content-type':'application/json'}})) as unknown as typeof fetch;
    configureApi({baseURL:'https://example.test/api/v1',getToken:()=>null,fetchImpl});
    expect((await fetchUserAvailabilityService()).map((item) => item.id)).toEqual([7]);
    expect(fetchImpl).toHaveBeenCalledOnce();
});
