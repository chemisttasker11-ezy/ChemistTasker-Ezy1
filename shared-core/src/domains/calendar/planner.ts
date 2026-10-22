import type { CalendarRecurrence, PlannerCopyInput, PlannerCopyResult, PlannerRosterInput, SavedTaskApi, SavedTaskInput, WorkNoteApi } from '../../contracts/calendar';
import type { CalendarItem } from './mappers';

export const plannerTimeLabel = (start?: string | null, end?: string | null) =>
    start || end ? [start?.slice(0, 5), end?.slice(0, 5)].filter(Boolean).join(' - ') : undefined;

/** Timed tasks first; untimed tasks retain their feed order. Never mutate the feed. */
export const plannerDayTasks = (items: CalendarItem[], day: Date) => items
    .filter(item => item.noteData?.is_planner_task && localDate(item.date) === localDate(day))
    .sort((a, b) => (a.noteData.start_time || a.noteData.end_time || '24:00').slice(0, 5)
        .localeCompare((b.noteData.start_time || b.noteData.end_time || '24:00').slice(0, 5)));

export function plannerWeekSummary(items: CalendarItem[], day: Date) {
    const { from, to } = weekRange(day);
    const tasks = items.filter(item => item.noteData?.is_planner_task && localDate(item.date) >= from && localDate(item.date) <= to);
    return { total: tasks.length, unassigned: tasks.filter(item => !item.noteData.assignees.length).length,
        done: tasks.filter(item => item.status?.toUpperCase() === 'DONE').length };
}

export const plannerInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]?.toUpperCase()).join('') || '?';

export type CalendarNoteForm = {
    title: string;
    body: string;
    date: string;
    notify: boolean;
    isGeneral: boolean;
    isPlannerTask: boolean;
    isClinical: boolean;
    startTime: string;
    endTime: string;
    assigneeIds: number[];
    updatedAt?: string;
    locked: boolean;
    recurrence: { freq: "NONE" | CalendarRecurrence["freq"]; interval: number; until: string; byweekday: number[] };
};

const localDate = (day: Date) => `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

export function weekRange(day: Date) {
    const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { from: localDate(monday), to: localDate(sunday) };
}

export function emptyNoteForm(day: Date, planner = false): CalendarNoteForm {
    return { title: "", body: "", date: localDate(day), notify: false, isGeneral: false,
        isPlannerTask: planner, isClinical: false, startTime: "", endTime: "", assigneeIds: [], locked: false,
        recurrence: { freq: "NONE", interval: 1, until: "", byweekday: [] } };
}

export function editNoteForm(note: WorkNoteApi, completedCount = 0): CalendarNoteForm {
    return { title: note.title, body: note.body, date: note.series_date ?? note.date,
        notify: note.notify_on_shift_start, isGeneral: note.is_general, isPlannerTask: note.is_planner_task,
        isClinical: note.is_clinical, startTime: note.start_time?.slice(0, 5) ?? "", endTime: note.end_time?.slice(0, 5) ?? "",
        assigneeIds: note.assignees.map(a => a.membership_id), updatedAt: note.updated_at,
        locked: !canEditTaskSchedule(note, completedCount),
        recurrence: { freq: note.recurrence?.freq ?? "NONE", interval: note.recurrence?.interval ?? 1,
            until: note.recurrence?.until_date ?? "", byweekday: note.recurrence?.byweekday ?? [] } };
}

export function notePayload(form: CalendarNoteForm, pharmacy: number) {
    return { pharmacy, title: form.title.trim(), body: form.body, date: form.date,
        notifyOnShiftStart: form.notify, isGeneral: form.isPlannerTask ? false : form.isGeneral,
        isPlannerTask: form.isPlannerTask, isClinical: form.isClinical,
        startTime: form.startTime || null, endTime: form.endTime || null,
        assigneeMembershipIds: form.isGeneral && !form.isPlannerTask ? [] : form.assigneeIds,
        updatedAt: form.updatedAt,
        recurrence: form.recurrence.freq === "NONE" ? null : {
            freq: form.recurrence.freq, interval: form.recurrence.interval,
            until_date: form.recurrence.until || null, byweekday: form.recurrence.byweekday,
        } };
}

export function copyResultMessage(result: PlannerCopyResult) {
    const dropped = [...new Set(result.dropped_assignees.map(person => person.name))];
    return [`${result.created} copied`, result.skipped_series && `${result.skipped_series} repeating skipped`,
        dropped.length && `${result.dropped_assignees.length} ${result.dropped_assignees.length === 1 ? "person" : "people"} dropped: ${dropped.join(", ")}`].filter(Boolean).join("; ") + ".";
}

export function applySavedTask(form: CalendarNoteForm, task: SavedTaskApi): CalendarNoteForm {
    return { ...form, title: task.title, body: task.details, startTime: task.start_time?.slice(0, 5) ?? "",
        endTime: task.end_time?.slice(0, 5) ?? "", isClinical: task.is_clinical };
}

export const plannerCopyRequest = (pharmacy: number, day: Date, mode: 'task' | 'day' | 'week',
  previous: PlannerCopyInput | null, taskId?: number | null): PlannerCopyInput => {
  const week = weekRange(day);
  const date = localDate(day);
  const source = {
    pharmacy, source_from: mode === 'week' ? week.from : date,
    source_to: mode === 'week' ? week.to : date,
    day_offset: mode === 'week' ? 7 : mode === 'day' ? 1 : 0,
    ...(mode === 'task' ? { task_id: taskId } : {}),
  };
  // Keep the key after an uncertain response; retrying the same action must not append duplicates.
  if (previous && Object.entries(source).every(([key, value]) => previous[key as keyof PlannerCopyInput] === value)
    && previous.task_id === source.task_id) return previous;
  return { ...source, request_key: `planner-${Date.now()}-${Math.random().toString(36).slice(2)}` };
};

// Empty for an unassigned task on the manager view: the card already says "Unassigned".
export const taskStatusLabel = (note: WorkNoteApi, manager: boolean) => manager
  ? note.assignees.length ? `${note.completed_count ?? note.completed_by?.length ?? 0} of ${note.assignees.length} done` : ''
  : note.status.toLowerCase() === 'done' ? 'Done' : 'To do';

export const canEditTaskSchedule = (note: WorkNoteApi, completedCount = 0) =>
    !note.is_planner_task || Math.max(completedCount, note.completed_count ?? 0, note.completed_by?.length ?? 0) === 0;

export const plannerRosterInput = (form: CalendarNoteForm, pharmacy: number): PlannerRosterInput => ({
    pharmacy, date: form.date, start_time: form.startTime || null,
    end_time: form.endTime || null, is_clinical: form.isClinical,
});

export const mergeRosterAssignees = (form: CalendarNoteForm, ids: number[]): CalendarNoteForm => ({
    ...form, assigneeIds: [...new Set([...form.assigneeIds, ...ids])],
});

export const savedTaskInput = (form: CalendarNoteForm, pharmacy: number): SavedTaskInput => ({
    pharmacy, title: form.title.trim(), details: form.body, start_time: form.startTime || null,
    end_time: form.endTime || null, is_clinical: form.isClinical,
});

export const taskRepeatLabel = (recurrence: CalendarRecurrence) => {
    const { freq, interval = 1 } = recurrence;
    return interval > 1 ? `Every ${interval} ${{ DAILY: 'days', WEEKLY: 'weeks', MONTHLY: 'months' }[freq]}`
        : { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' }[freq];
};

export const calendarTaskState = (note: WorkNoteApi, manager: boolean, userId?: number) => ({
    label: taskStatusLabel(note, manager),
    canEdit: !note.is_planner_task || manager,
    canComplete: !note.is_planner_task || note.assignees.some(person => person.user_id === userId),
});
