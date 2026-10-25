import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { fetchRosterWorkerAssignments, fetchWorkerShiftRequestsService, rosterV2 } from './api';

let mockedFetch: ReturnType<typeof vi.fn>;
const success = (value: unknown) => new Response(JSON.stringify(value), {
    status: 200, headers: { 'content-type': 'application/json' },
});
const lastCall = () => mockedFetch.mock.calls.at(-1) as [URL, RequestInit];
const requestBody = () => JSON.parse(String(lastCall()[1].body));

beforeEach(() => {
    mockedFetch = vi.fn(async () => success({ period_id: 101 }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token', fetchImpl: mockedFetch });
});

describe('roster V2 shared wire parity', () => {
    it('initializes a draft with the unchanged week anchor', async () => {
        await rosterV2.initializePeriod(7, '2026-10-19');
        expect(lastCall()[0].pathname).toBe('/api/v1/attendance/roster/period/');
        expect(lastCall()[1].method).toBe('POST');
        expect(requestBody()).toEqual({ pharmacy_id: 7, week_start: '2026-10-19' });
    });
    it('retains atomic move operations including the explicit unassignment sentinel', async () => {
        await rosterV2.bulkEdit(101, [{ action: 'move_shift', slot_id: 9, target_date: '2026-10-20', target_user_id: 0 }]);
        expect(lastCall()[0].pathname).toBe('/api/v1/attendance/roster/bulk-edit/');
        expect(requestBody()).toEqual({ period_id: 101, operations: [
            { action: 'move_shift', slot_id: 9, target_date: '2026-10-20', target_user_id: 0 },
        ] });
    });
    it('retains full-week unpublish body and week-copy flags', async () => {
        await rosterV2.unpublish({ period_id: 101 });
        expect(lastCall()[0].pathname).toBe('/api/v1/attendance/roster/unpublish/');
        expect(requestBody()).toEqual({ period_id: 101 });
        await rosterV2.copyWeek({ source_period_id: 101, target_week_start: '2026-10-26', include_assignments: false, overwrite: false });
        expect(requestBody()).toEqual({ source_period_id: 101, target_week_start: '2026-10-26', include_assignments: false, overwrite: false });
    });
    it('keeps scoped template search and apply operations identical', async () => {
        await rosterV2.getTemplates(7);
        expect(lastCall()[0].pathname).toBe('/api/v1/attendance/roster/templates/');
        expect(lastCall()[0].searchParams.get('pharmacy_id')).toBe('7');
        await rosterV2.applyTemplate({ template_id: 12, target_week_start: '2026-10-26', include_assignments: true, overwrite: false });
        expect(lastCall()[0].pathname).toBe('/api/v1/attendance/roster/templates/apply/');
        expect(requestBody()).toEqual({ template_id: 12, target_week_start: '2026-10-26', include_assignments: true, overwrite: false });
    });
});

describe('roster collections', () => {
    it('reads cover requests beyond page one while preserving roster scope', async () => {
        mockedFetch.mockImplementation(async (url: URL) => success(url.searchParams.get('page') === '2'
            ? { results: [{ id: 51 }], next: null }
            : { results: [{ id: 1 }], next: '?page=2' }));
        const rows = await fetchWorkerShiftRequestsService({ pharmacyId: 7, startDate: '2026-10-19', endDate: '2026-10-25' });
        expect(rows.map((item) => item.id)).toEqual([1, 51]);
        expect(mockedFetch).toHaveBeenCalledTimes(2);
        expect(lastCall()[0].searchParams.get('pharmacy')).toBe('7');
        expect(lastCall()[0].searchParams.get('start_date')).toBe('2026-10-19');
        expect(lastCall()[0].searchParams.get('end_date')).toBe('2026-10-25');
    });
    it('retains an unpaginated cover-request response without extra fetches', async () => {
        mockedFetch.mockResolvedValue(success([{ id: 9 }]));
        expect((await fetchWorkerShiftRequestsService()).map((item) => item.id)).toEqual([9]);
        expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
    it('reads every page so a worker on page 2 is not dropped', async () => {
        const row = (id: number) => ({ id, slot_date: '2026-10-26', user: id });
        mockedFetch.mockImplementation(async (url: URL) => success(url.searchParams.get('page') === '2'
            ? { results: [row(51)], next: null }
            : { results: [row(1)], next: 'https://example.test/api/v1/roster-worker/?page=2' }));
        const rows = await fetchRosterWorkerAssignments({ pharmacyId: 7 });
        expect(rows.map((item) => item.id)).toEqual([1, 51]);
        expect(lastCall()[0].searchParams.get('pharmacy')).toBe('7');
    });
});
