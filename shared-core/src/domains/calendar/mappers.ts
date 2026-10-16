import type { CalendarEventApi, WorkNoteApi, WorkNoteAssigneeApi } from '../../contracts/calendar';
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
    operation: api.operation ?? null,
    notifyOnShiftStart: api.notify_on_shift_start ?? false,
    isGeneral: api.is_general ?? false,
    assignees: ensureArray(api.assignees).map(mapWorkNoteAssignee),
    createdBy: api.created_by,
    createdByName: api.created_by_name,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
});
