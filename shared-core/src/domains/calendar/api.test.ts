import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import type { CalendarEventApi, WorkNoteApi } from '../../contracts/calendar';
import {
    createWorkNoteService, updateWorkNoteService, deleteWorkNoteService,
    markWorkNoteDone, markWorkNoteOpen, fetchCalendarFeed,
} from './api';
import { mapCalendarEvent, mapWorkNote } from './mappers';
import {
    copyPlannerTasks, createSavedTask, updateSavedTask, listSavedTasks, deleteSavedTask,
    fillPlannerFromRoster, getOperationsContext,
} from './operations';

const recurrence = { freq: 'WEEKLY' as const, byweekday: [0, 2], until_date: '2027-02-01' };
const note: WorkNoteApi = {
    id: 18, pharmacy: 3, date: '2026-12-28', title: 'Opening', body: 'Instructions', status: 'open',
    is_planner_task: true, is_clinical: false, start_time: '09:00:00', end_time: null,
    recurrence, notify_on_shift_start: false, is_general: false, assignees: [],
    created_by: 1, created_by_name: 'Owner', created_at: '2026-12-01T00:00:00Z', updated_at: '2026-12-02T00:00:00.123456Z',
};
let fetchImpl: ReturnType<typeof vi.fn>;
const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' },
});
const body = (index = 0) => JSON.parse(fetchImpl.mock.calls[index][1].body);

beforeEach(() => {
    fetchImpl = vi.fn(async () => respond(note));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'fixture-token', fetchImpl });
});

describe('calendar planner contracts', () => {
    it('sends direct add fields and maps planner metadata and exact timestamp', async () => {
        const result = await createWorkNoteService({
            pharmacy: 3, date: note.date, title: note.title, isPlannerTask: true,
            isClinical: false, recurrence, startTime: '09:00', endTime: null,
        });
        expect(body()).toMatchObject({
            pharmacy: 3, date: note.date, title: note.title, is_planner_task: true, is_clinical: false,
            recurrence, start_time: '09:00', end_time: null, assignee_membership_ids: [], notify_on_shift_start: false,
        });
        expect(result).toMatchObject({ isPlannerTask: true, recurrence, updatedAt: note.updated_at, startTime: '09:00:00' });
        expect(result).not.toHaveProperty('operation');
    });

    it('keeps informal note creation defaults', async () => {
        await createWorkNoteService({ pharmacy: 3, date: note.date, title: 'Note' });
        expect(body()).toMatchObject({ is_planner_task: false, notify_on_shift_start: false, is_general: false });
    });

    it('sends edited date, weekday rule and the unmodified stale token', async () => {
        await updateWorkNoteService(18, {
            date: note.date, recurrence, title: 'New wording', updatedAt: note.updated_at,
        });
        expect(body()).toEqual({ date: note.date, title: 'New wording', recurrence, updated_at: note.updated_at });
        expect(fetchImpl.mock.calls[0][1].method).toBe('PATCH');
    });

    it('propagates a stale edit conflict', async () => {
        fetchImpl.mockImplementation(async () => respond({ detail: 'This task changed. Reload it before trying again.' }, 409));
        await expect(updateWorkNoteService(18, { title: 'Stale', updatedAt: note.updated_at })).rejects.toThrow('This task changed.');
    });

    it.each([markWorkNoteDone, markWorkNoteOpen])('sends occurrence identity and timestamp for completion', async (action) => {
        await action(18, '2027-01-04', note.updated_at);
        expect(body()).toEqual({ occurrence_date: '2027-01-04', updated_at: note.updated_at });
    });

    it('keeps occurrence identity separate from the original series date', async () => {
        const occurrence = { ...note, id: '18-2027-01-04', date: '2027-01-04', series_id: 18,
            series_date: note.date, occurrence_date: '2027-01-04', is_occurrence: true,
            completed_by: ['Worker'], completed_count: 1 };
        expect(mapWorkNote(occurrence)).toMatchObject({
            id: '18-2027-01-04', date: '2027-01-04', seriesId: 18, seriesDate: note.date,
            occurrenceDate: '2027-01-04', isOccurrence: true, recurrence, completedCount: 1, completedBy: ['Worker'],
        });
        const event = { ...occurrence, all_day: true } as unknown as CalendarEventApi;
        expect(mapCalendarEvent(event)).toMatchObject({ seriesId: 18, occurrenceDate: '2027-01-04', recurrence });
        fetchImpl.mockImplementation(async () => respond({ events: [], work_notes: [occurrence],
            date_from: '2026-12-28', date_to: '2027-01-03', pharmacy_id: 3, organization_id: null }));
        const feed = await fetchCalendarFeed({ pharmacyId: 3, dateFrom: '2026-12-28', dateTo: '2027-01-03' });
        expect(String(fetchImpl.mock.calls[0][0])).toContain('date_from=2026-12-28&date_to=2027-01-03');
        expect(feed.workNotes[0].seriesDate).toBe(note.date);
    });

    it('preserves a caller-owned retry key and returns dropped/series warnings', async () => {
        const result = { created: 1, task_ids: [19], skipped_series: 2,
            dropped_assignees: [{ task_id: 18, membership_id: 7, name: 'Former worker' }] };
        fetchImpl.mockImplementation(async () => respond(result));
        const input = { pharmacy: 3, source_from: note.date, source_to: note.date,
            day_offset: 0, task_id: 18, request_key: 'stable-key' };
        expect(await copyPlannerTasks(input)).toEqual(result);
        expect(await copyPlannerTasks(input)).toEqual(result);
        expect(body(0)).toEqual(input);
        expect(body(1)).toEqual(input);
        expect(String(fetchImpl.mock.calls[0][0]).endsWith('/planner-copy/')).toBe(true);
    });

    it('sends day and week copy offsets without task IDs', async () => {
        await copyPlannerTasks({ pharmacy: 3, source_from: note.date, source_to: note.date, day_offset: 1, request_key: 'day' });
        await copyPlannerTasks({ pharmacy: 3, source_from: note.date, source_to: '2027-01-03', day_offset: 7, request_key: 'week' });
        expect(body(0)).toMatchObject({ day_offset: 1, request_key: 'day' });
        expect(body(1)).toMatchObject({ day_offset: 7, source_to: '2027-01-03', request_key: 'week' });
        expect(body(1)).not.toHaveProperty('task_id');
    });

    it('uses slim saved defaults and explicit roster input', async () => {
        const saved = { pharmacy: 3, title: 'Reusable', details: 'Details', start_time: null, end_time: null, is_clinical: true };
        await createSavedTask(saved);
        await updateSavedTask(4, { title: 'Edited reusable' });
        expect(body(0)).toEqual(saved);
        expect(body(1)).toEqual({ title: 'Edited reusable' });
        fetchImpl.mockImplementation(async () => respond({ results: [{ id: 4, ...saved }] }));
        expect(await listSavedTasks(3)).toEqual([{ id: 4, ...saved }]);
        await fillPlannerFromRoster({ pharmacy: 3, date: note.date, role: 'PHARMACIST', is_clinical: true });
        expect(body(3)).toEqual({ pharmacy: 3, date: note.date, role: 'PHARMACIST', is_clinical: true });
        await getOperationsContext();
        expect(String(fetchImpl.mock.calls[4][0]).endsWith('/operation-context/')).toBe(true);
    });

    it('accepts empty DELETE responses and sends the planner token', async () => {
        fetchImpl.mockImplementation(async () => new Response(null, { status: 204 }));
        await expect(deleteWorkNoteService(18, note.updated_at)).resolves.toBeUndefined();
        await expect(deleteSavedTask(4)).resolves.toBeUndefined();
        expect(body()).toEqual({ updated_at: note.updated_at });
        expect(fetchImpl.mock.calls.every(call => call[1].method === 'DELETE')).toBe(true);
    });
});
