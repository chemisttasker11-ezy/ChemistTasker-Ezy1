import type { CalendarEventApi, WorkNoteApi, CalendarFeedApi } from '../../contracts/calendar';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { asList, buildQuery, ensureArray } from '../../utils/serialization';
import { mapCalendarEvent, mapWorkNote } from './mappers';
export interface CalendarEventFilters {
    pharmacyId?: number | string;
    organizationId?: number | string;
    dateFrom?: string;
    dateTo?: string;
    source?: string;
}
export interface WorkNoteFilters {
    pharmacyId?: number | string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    assignedToMe?: boolean;
}
export function getCalendarEvents(params: CalendarEventFilters) {
    const query = buildQuery({
        pharmacy_id: params.pharmacyId,
        organization_id: params.organizationId,
        date_from: params.dateFrom,
        date_to: params.dateTo,
        source: params.source,
    });
    return fetchApi<Collection<CalendarEventApi>>(`/client-profile/calendar-events/${query}`);
}
export async function fetchCalendarEvents(params: CalendarEventFilters) {
    const data = await getCalendarEvents(params);
    return asList(data).map(mapCalendarEvent);
}
export function getCalendarEventDetail(id: number | string) {
    return fetchApi<CalendarEventApi>(`/client-profile/calendar-events/${id}/`);
}
export async function fetchCalendarEventDetail(id: number | string) {
    const data = await getCalendarEventDetail(id);
    return mapCalendarEvent(data);
}
export function createCalendarEvent(payload: {
    pharmacy?: number;
    organization?: number;
    title: string;
    description?: string;
    date: string;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
}) {
    return fetchApi<CalendarEventApi>('/client-profile/calendar-events/', {
        method: 'POST',
        body: JSON.stringify({
            pharmacy: payload.pharmacy,
            organization: payload.organization,
            title: payload.title,
            description: payload.description,
            date: payload.date,
            start_time: payload.startTime,
            end_time: payload.endTime,
            all_day: payload.allDay ?? true,
        }),
    });
}
export async function createCalendarEventService(payload: Parameters<typeof createCalendarEvent>[0]) {
    const data = await createCalendarEvent(payload);
    return mapCalendarEvent(data);
}
export function updateCalendarEvent(id: number | string, payload: Partial<Parameters<typeof createCalendarEvent>[0]>) {
    return fetchApi<CalendarEventApi>(`/client-profile/calendar-events/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
            title: payload.title,
            description: payload.description,
            date: payload.date,
            start_time: payload.startTime,
            end_time: payload.endTime,
            all_day: payload.allDay,
        }),
    });
}
export async function updateCalendarEventService(id: number | string, payload: Parameters<typeof updateCalendarEvent>[1]) {
    const data = await updateCalendarEvent(id, payload);
    return mapCalendarEvent(data);
}
export function deleteCalendarEvent(id: number | string) {
    return fetchApi(`/client-profile/calendar-events/${id}/`, { method: 'DELETE' });
}
export async function deleteCalendarEventService(id: number | string) {
    await deleteCalendarEvent(id);
}
export function getWorkNotes(params: WorkNoteFilters) {
    const query = buildQuery({
        pharmacy_id: params.pharmacyId,
        date_from: params.dateFrom,
        date_to: params.dateTo,
        status: params.status,
        assigned_to_me: params.assignedToMe ? 'true' : undefined,
    });
    return fetchApi<Collection<WorkNoteApi>>(`/client-profile/work-notes/${query}`);
}
export async function fetchWorkNotes(params: WorkNoteFilters) {
    const data = await getWorkNotes(params);
    return asList(data).map(mapWorkNote);
}
export function getWorkNoteDetail(id: number | string) {
    return fetchApi<WorkNoteApi>(`/client-profile/work-notes/${id}/`);
}
export async function fetchWorkNoteDetail(id: number | string) {
    const data = await getWorkNoteDetail(id);
    return mapWorkNote(data);
}
export function createWorkNote(payload: {
    pharmacy: number;
    date: string;
    title: string;
    body?: string;
    status?: string;
    notifyOnShiftStart?: boolean;
    isGeneral?: boolean;
    assigneeMembershipIds?: number[];
}) {
    return fetchApi<WorkNoteApi>('/client-profile/work-notes/', {
        method: 'POST',
        body: JSON.stringify({
            pharmacy: payload.pharmacy,
            date: payload.date,
            title: payload.title,
            body: payload.body,
            status: payload.status,
            notify_on_shift_start: payload.notifyOnShiftStart ?? false,
            is_general: payload.isGeneral ?? false,
            assignee_membership_ids: payload.assigneeMembershipIds ?? [],
        }),
    });
}
export async function createWorkNoteService(payload: Parameters<typeof createWorkNote>[0]) {
    const data = await createWorkNote(payload);
    return mapWorkNote(data);
}
export function updateWorkNote(id: number | string, payload: Partial<Parameters<typeof createWorkNote>[0]>) {
    return fetchApi<WorkNoteApi>(`/client-profile/work-notes/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
            title: payload.title,
            body: payload.body,
            status: payload.status,
            notify_on_shift_start: payload.notifyOnShiftStart,
            is_general: payload.isGeneral,
            assignee_membership_ids: payload.assigneeMembershipIds,
        }),
    });
}
export async function updateWorkNoteService(id: number | string, payload: Parameters<typeof updateWorkNote>[1]) {
    const data = await updateWorkNote(id, payload);
    return mapWorkNote(data);
}
export function deleteWorkNote(id: number | string) {
    return fetchApi(`/client-profile/work-notes/${id}/`, { method: 'DELETE' });
}
export async function deleteWorkNoteService(id: number | string) {
    await deleteWorkNote(id);
}
export function markWorkNoteDone(id: number | string) {
    return fetchApi<WorkNoteApi>(`/client-profile/work-notes/${id}/mark_done/`, { method: 'POST' });
}
export async function markWorkNoteDoneService(id: number | string) {
    const data = await markWorkNoteDone(id);
    return mapWorkNote(data);
}
export function markWorkNoteOpen(id: number | string) {
    return fetchApi<WorkNoteApi>(`/client-profile/work-notes/${id}/mark_open/`, { method: 'POST' });
}
export async function markWorkNoteOpenService(id: number | string) {
    const data = await markWorkNoteOpen(id);
    return mapWorkNote(data);
}
export function getCalendarFeed(params: CalendarEventFilters) {
    const query = buildQuery({
        pharmacy_id: params.pharmacyId,
        organization_id: params.organizationId,
        date_from: params.dateFrom,
        date_to: params.dateTo,
    });
    return fetchApi<CalendarFeedApi>(`/client-profile/calendar-feed/${query}`);
}
export async function fetchCalendarFeed(params: CalendarEventFilters) {
    const data = await getCalendarFeed(params);
    return {
        events: ensureArray(data.events).map(mapCalendarEvent),
        workNotes: ensureArray(data.work_notes).map(mapWorkNote),
        dateFrom: data.date_from,
        dateTo: data.date_to,
        pharmacyId: data.pharmacy_id,
        organizationId: data.organization_id,
    };
}
