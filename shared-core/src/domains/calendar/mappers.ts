import type { CalendarEventApi, CalendarFeedApi, WorkNoteApi, WorkNoteAssigneeApi } from '../../contracts/calendar';
/** Domain-owned operations extracted from the established shared API. */
import { ensureArray } from '../../utils/serialization';
export const mapCalendarEvent = (api: CalendarEventApi) => ({
    id: api.id,
    pharmacy: api.pharmacy,
    organization: api.organization,
    title: api.title,
    description: api.description,
    date: api.date,
    startTime: api.start_time,
    endTime: api.end_time,
    allDay: api.all_day ?? true,
    source: api.source,
    sourceDisplay: api.source_display,
    sourceMembership: api.source_membership,
    isReadOnly: api.is_read_only ?? false,
    recurrence: api.recurrence ?? null,
    seriesId: api.series_id,
    seriesDate: api.series_date,
    occurrenceDate: api.occurrence_date,
    isOccurrence: api.is_occurrence ?? false,
    createdBy: api.created_by,
    createdByName: api.created_by_name,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
});
const mapWorkNoteAssignee = (api: WorkNoteAssigneeApi) => ({
    id: api.id,
    membershipId: api.membership_id,
    userId: api.user_id,
    userName: api.user_name,
    notifiedAt: api.notified_at,
    createdAt: api.created_at,
});
export const mapWorkNote = (api: WorkNoteApi) => ({
    id: api.id,
    pharmacy: api.pharmacy,
    date: api.date,
    title: api.title,
    body: api.body,
    status: api.status,
    isPlannerTask: api.is_planner_task ?? false,
    isClinical: api.is_clinical ?? false,
    startTime: api.start_time,
    endTime: api.end_time,
    completedBy: api.completed_by,
    completedCount: api.completed_count,
    notifyOnShiftStart: api.notify_on_shift_start ?? false,
    isGeneral: api.is_general ?? false,
    assignees: ensureArray(api.assignees).map(mapWorkNoteAssignee),
    recurrence: api.recurrence ?? null,
    seriesId: api.series_id,
    seriesDate: api.series_date,
    occurrenceDate: api.occurrence_date,
    isOccurrence: api.is_occurrence ?? false,
    createdBy: api.created_by,
    createdByName: api.created_by_name,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
});

export type CalendarItem = {
    id: number | string;
    seriesId?: number;
    isOccurrence?: boolean;
    type: "event" | "note" | "birthday";
    title: string;
    date: Date;
    time?: string;
    allDay?: boolean;
    source: string;
    assignees?: string[];
    assigneeMembershipIds?: number[];
    status?: string;
    completedBy?: string[];
    readOnly?: boolean;
    description?: string;
    eventData?: any;
    noteData?: any;
};


const toDate = (value: string) => {
    const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const formatTimeRange = (start?: string | null, end?: string | null) =>
    start || end ? [start?.slice(0, 5), end?.slice(0, 5)].filter(Boolean).join(' - ') : undefined;

export function projectCalendarFeed(feed: CalendarFeedApi): CalendarItem[] {
    const mappedEvents: CalendarItem[] = ensureArray(feed.events).map((evt: any) => {
        const dateObj = toDate(evt.date) ?? new Date();
        const type: CalendarItem["type"] = evt.source === "birthday" ? "birthday" : "event";
        const rawId = evt.id;
        const id = typeof rawId === "number" ? rawId : String(rawId ?? "");
        const seriesId = evt.series_id ?? (typeof rawId === "number" ? rawId : undefined);
        return {
            id,
            seriesId,
            isOccurrence: Boolean(evt.is_occurrence),
            type,
            title: evt.title,
            date: dateObj,
            time: formatTimeRange(evt.start_time, evt.end_time),
            allDay: evt.all_day ?? !evt.start_time,
            source: evt.source,
            readOnly: evt.source !== "manual",
            description: evt.description,
            eventData: evt,
        };
    });

    const mappedNotes: CalendarItem[] = ensureArray(feed.work_notes).map((note: any) => {
        const dateObj = toDate(note.date) ?? new Date();
        const assigneeNames = (note.assignees ?? []).map(
            (a: any) =>
                a.user_name ||
                a.userName ||
                a.name ||
                a.email ||
                a.user?.full_name ||
                "Assignee"
        );
        const rawId = note.id;
        const id = typeof rawId === "number" ? rawId : String(rawId ?? "");
        const seriesId = note.series_id ?? (typeof rawId === "number" ? rawId : undefined);
        return {
            id,
            seriesId,
            isOccurrence: Boolean(note.is_occurrence),
            type: "note",
            title: note.title,
            date: dateObj,
            allDay: !note.start_time,
            time: formatTimeRange(note.start_time, note.end_time),
            source: "work_note",
            assignees: assigneeNames,
            completedBy: Array.isArray(note.completed_by) ? note.completed_by : [],
            assigneeMembershipIds: (note.assignees ?? []).map((a: any) => a.membershipId ?? a.membership_id),
            status: (note.status ?? "").toString().toUpperCase(),
            noteData: note,
        };
    });

    const combined = [...mappedEvents, ...mappedNotes];
    return combined;
}
