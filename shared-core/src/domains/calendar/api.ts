import type { CalendarEventApi, WorkNoteApi, CalendarFeedApi } from '../../contracts/calendar';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi, type ApplicationRequestOptions } from '../../transport/application';
import { asList, buildQuery, ensureArray } from '../../utils/serialization';
import { mapCalendarEvent, mapWorkNote } from './mappers';
export interface CalendarEventFilters {
    pharmacyId?: number | string;
    organizationId?: number | string;
    dateFrom?: string;
    dateTo?: string;
    source?: string;
    pharmacy_id?: number | string;
    organization_id?: number | string;
    date_from?: string;
    date_to?: string;
}
export interface WorkNoteFilters {
    pharmacyId?: number | string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    assignedToMe?: boolean;
    pharmacy_id?: number | string;
    date_from?: string;
    date_to?: string;
    assigned_to_me?: boolean;
}
export interface CalendarEventRecurrence {
    freq: string;
    interval?: number;
    until_date?: string | null;
}
export interface CreateCalendarEventPayload {
    pharmacy?: number;
    organization?: number;
    title: string;
    description?: string;
    date: string;
    startTime?: string | null;
    start_time?: string | null;
    endTime?: string | null;
    end_time?: string | null;
    allDay?: boolean;
    all_day?: boolean;
    recurrence?: CalendarEventRecurrence | null;
}
export type UpdateCalendarEventPayload = Partial<CreateCalendarEventPayload>;

export interface CreateWorkNotePayload {
    pharmacy: number;
    date: string;
    title: string;
    body?: string;
    status?: string;
    notifyOnShiftStart?: boolean;
    notify_on_shift_start?: boolean;
    isGeneral?: boolean;
    is_general?: boolean;
    assigneeMembershipIds?: number[];
    assignee_membership_ids?: number[];
    recurrence?: CalendarEventRecurrence | null;
}
export type UpdateWorkNotePayload = Partial<CreateWorkNotePayload>;

export interface WorkNoteOccurrencePayload {
    occurrenceDate?: string;
    occurrence_date?: string;
}
export type WorkNoteAction = 'mark_done' | 'mark_open';
export function getCalendarEvents(params: CalendarEventFilters) {
    const query = buildQuery({
        pharmacy_id: params.pharmacy_id ?? params.pharmacyId,
        organization_id: params.organization_id ?? params.organizationId,
        date_from: params.date_from ?? params.dateFrom,
        date_to: params.date_to ?? params.dateTo,
        source: params.source,
    });
    return fetchApi<Collection<CalendarEventApi>>(`/calendar-events/${query}`);
}
export async function fetchCalendarEvents(params: CalendarEventFilters) {
    const data = await getCalendarEvents(params);
    return asList(data).map(mapCalendarEvent);
}
export function getCalendarEventDetail(id: number | string) {
    return fetchApi<CalendarEventApi>(`/calendar-events/${id}/`);
}
export async function fetchCalendarEventDetail(id: number | string) {
    const data = await getCalendarEventDetail(id);
    return mapCalendarEvent(data);
}
export function createCalendarEvent(payload: CreateCalendarEventPayload, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    const startTime = 'start_time' in payload ? payload.start_time : payload.startTime;
    const endTime = 'end_time' in payload ? payload.end_time : payload.endTime;
    const allDay = payload.all_day !== undefined
        ? payload.all_day
        : (payload.allDay !== undefined ? payload.allDay : true);

    const body: Record<string, unknown> = {
        title: payload.title,
        description: payload.description,
        date: payload.date,
        start_time: startTime,
        end_time: endTime,
        all_day: allDay,
    };
    if ('pharmacy' in payload) body.pharmacy = payload.pharmacy;
    if ('organization' in payload) body.organization = payload.organization;
    if ('recurrence' in payload) body.recurrence = payload.recurrence;

    return fetchApi<CalendarEventApi>('/calendar-events/', {
        ...request,
        method: 'POST',
        body: JSON.stringify(body),
    });
}
export async function createCalendarEventService(payload: Parameters<typeof createCalendarEvent>[0]) {
    const data = await createCalendarEvent(payload);
    return mapCalendarEvent(data);
}
export function updateCalendarEvent(id: number | string, payload: UpdateCalendarEventPayload, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    const body: Record<string, unknown> = {};
    if ('pharmacy' in payload) body.pharmacy = payload.pharmacy;
    if ('organization' in payload) body.organization = payload.organization;
    if ('title' in payload) body.title = payload.title;
    if ('description' in payload) body.description = payload.description;
    if ('date' in payload) body.date = payload.date;
    if ('start_time' in payload) body.start_time = payload.start_time;
    else if ('startTime' in payload) body.start_time = payload.startTime;
    if ('end_time' in payload) body.end_time = payload.end_time;
    else if ('endTime' in payload) body.end_time = payload.endTime;
    if ('all_day' in payload) body.all_day = payload.all_day;
    else if ('allDay' in payload) body.all_day = payload.allDay;
    if ('recurrence' in payload) body.recurrence = payload.recurrence;

    return fetchApi<CalendarEventApi>(`/calendar-events/${id}/`, {
        ...request,
        method: 'PATCH',
        body: JSON.stringify(body),
    });
}
export async function updateCalendarEventService(id: number | string, payload: Parameters<typeof updateCalendarEvent>[1]) {
    const data = await updateCalendarEvent(id, payload);
    return mapCalendarEvent(data);
}
export function deleteCalendarEvent(id: number | string, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    return fetchApi(`/calendar-events/${id}/`, { ...request, method: 'DELETE' });
}
export async function deleteCalendarEventService(id: number | string) {
    await deleteCalendarEvent(id);
}
export function getWorkNotes(params: WorkNoteFilters) {
    const assigned = params.assigned_to_me !== undefined ? params.assigned_to_me : params.assignedToMe;
    const query = buildQuery({
        pharmacy_id: params.pharmacy_id ?? params.pharmacyId,
        date_from: params.date_from ?? params.dateFrom,
        date_to: params.date_to ?? params.dateTo,
        status: params.status,
        assigned_to_me: assigned ? 'true' : undefined,
    });
    return fetchApi<Collection<WorkNoteApi>>(`/work-notes/${query}`);
}
export async function fetchWorkNotes(params: WorkNoteFilters) {
    const data = await getWorkNotes(params);
    return asList(data).map(mapWorkNote);
}
export function getWorkNoteDetail(id: number | string) {
    return fetchApi<WorkNoteApi>(`/work-notes/${id}/`);
}
export async function fetchWorkNoteDetail(id: number | string) {
    const data = await getWorkNoteDetail(id);
    return mapWorkNote(data);
}
export function createWorkNote(payload: CreateWorkNotePayload, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    const notify = payload.notify_on_shift_start !== undefined
        ? payload.notify_on_shift_start
        : (payload.notifyOnShiftStart ?? false);
    const general = payload.is_general !== undefined
        ? payload.is_general
        : (payload.isGeneral ?? false);
    const assignees = payload.assignee_membership_ids !== undefined
        ? payload.assignee_membership_ids
        : (payload.assigneeMembershipIds ?? []);

    const body: Record<string, unknown> = {
        pharmacy: payload.pharmacy,
        date: payload.date,
        title: payload.title,
        body: payload.body,
        status: payload.status,
        notify_on_shift_start: notify,
        is_general: general,
        assignee_membership_ids: assignees,
    };
    if ('recurrence' in payload) {
        body.recurrence = payload.recurrence;
    }
    return fetchApi<WorkNoteApi>('/work-notes/', {
        ...request,
        method: 'POST',
        body: JSON.stringify(body),
    });
}
export async function createWorkNoteService(payload: Parameters<typeof createWorkNote>[0]) {
    const data = await createWorkNote(payload);
    return mapWorkNote(data);
}
export function updateWorkNote(id: number | string, payload: UpdateWorkNotePayload, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    const body: Record<string, unknown> = {};
    if ('pharmacy' in payload) body.pharmacy = payload.pharmacy;
    if ('date' in payload) body.date = payload.date;
    if ('title' in payload) body.title = payload.title;
    if ('body' in payload) body.body = payload.body;
    if ('status' in payload) body.status = payload.status;
    if ('notify_on_shift_start' in payload) body.notify_on_shift_start = payload.notify_on_shift_start;
    else if ('notifyOnShiftStart' in payload) body.notify_on_shift_start = payload.notifyOnShiftStart;
    if ('is_general' in payload) body.is_general = payload.is_general;
    else if ('isGeneral' in payload) body.is_general = payload.isGeneral;
    if ('assignee_membership_ids' in payload) body.assignee_membership_ids = payload.assignee_membership_ids;
    else if ('assigneeMembershipIds' in payload) body.assignee_membership_ids = payload.assigneeMembershipIds;
    if ('recurrence' in payload) body.recurrence = payload.recurrence;

    return fetchApi<WorkNoteApi>(`/work-notes/${id}/`, {
        ...request,
        method: 'PATCH',
        body: JSON.stringify(body),
    });
}
export async function updateWorkNoteService(id: number | string, payload: Parameters<typeof updateWorkNote>[1]) {
    const data = await updateWorkNote(id, payload);
    return mapWorkNote(data);
}
export function deleteWorkNote(id: number | string, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    return fetchApi(`/work-notes/${id}/`, { ...request, method: 'DELETE' });
}
export async function deleteWorkNoteService(id: number | string) {
    await deleteWorkNote(id);
}
export function markWorkNoteDone(id: number | string, options?: WorkNoteOccurrencePayload | string, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    const occurrenceDate = typeof options === 'string'
        ? options
        : (options?.occurrence_date ?? options?.occurrenceDate);
    return fetchApi<WorkNoteApi>(`/work-notes/${id}/mark_done/`, {
        ...request,
        method: 'POST',
        ...(occurrenceDate ? { body: JSON.stringify({ occurrence_date: occurrenceDate }) } : {}),
    });
}
export async function markWorkNoteDoneService(id: number | string, options?: WorkNoteOccurrencePayload | string) {
    const data = await markWorkNoteDone(id, options);
    return mapWorkNote(data);
}
export function markWorkNoteOpen(id: number | string, options?: WorkNoteOccurrencePayload | string, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    const occurrenceDate = typeof options === 'string'
        ? options
        : (options?.occurrence_date ?? options?.occurrenceDate);
    return fetchApi<WorkNoteApi>(`/work-notes/${id}/mark_open/`, {
        ...request,
        method: 'POST',
        ...(occurrenceDate ? { body: JSON.stringify({ occurrence_date: occurrenceDate }) } : {}),
    });
}
export async function markWorkNoteOpenService(id: number | string, options?: WorkNoteOccurrencePayload | string) {
    const data = await markWorkNoteOpen(id, options);
    return mapWorkNote(data);
}
export function actOnWorkNote(
    id: number | string,
    action: WorkNoteAction,
    options?: WorkNoteOccurrencePayload | string,
    request?: Pick<ApplicationRequestOptions, 'signal'>
) {
    if (action === 'mark_open') {
        return markWorkNoteOpen(id, options, request);
    }
    return markWorkNoteDone(id, options, request);
}
export function getCalendarFeed(params: CalendarEventFilters, request?: Pick<ApplicationRequestOptions, 'signal'>) {
    const query = buildQuery({
        pharmacy_id: params.pharmacy_id ?? params.pharmacyId,
        organization_id: params.organization_id ?? params.organizationId,
        date_from: params.date_from ?? params.dateFrom,
        date_to: params.date_to ?? params.dateTo,
    });
    return fetchApi<CalendarFeedApi>(`/calendar-feed/${query}`, request);
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
