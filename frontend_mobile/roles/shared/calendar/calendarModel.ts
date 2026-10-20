import { addDays, format, isValid, startOfWeek } from 'date-fns';
import type { CalendarRecurrence, PlannerCopyInput, PlannerCopyResult, WorkNoteApi } from '@chemisttasker/shared-core';
import apiClient from '@/utils/apiClient';

export type ItemType = 'all' | 'events' | 'notes' | 'birthdays';

export type CalendarItem = {
  id: number | string;
  seriesId?: number;
  isOccurrence?: boolean;
  type: 'event' | 'note' | 'birthday';
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

export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const normalizeList = (data: any) =>
  Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

export const fetchJson = async (path: string, params?: Record<string, any>) => {
  const res = await apiClient.get(path, { params });
  return res.data;
};

export const postJson = async (
  path: string,
  body: any = null,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
) => {
  if (method === 'DELETE') {
    const res = await apiClient.delete(path);
    return res.data;
  }
  const res = await apiClient.request({ url: path, method, data: body });
  return res.data;
};

export const toDate = (value?: string | null) => {
  if (!value) return null;
  const base = String(value);
  const normalized = base.includes('T') ? base : `${base}T00:00:00`;
  const parsed = new Date(normalized);
  return isValid(parsed) ? parsed : null;
};

export const formatTimeRange = (start?: string | null, end?: string | null) => {
  if (!start && !end) return undefined;
  const trim = (time?: string | null) => (time ? time.slice(0, 5) : '');
  return [trim(start), trim(end)].filter(Boolean).join(' - ');
};

export const ROLE_LABELS: Record<string, string> = {
  PHARMACIST: 'Pharmacist',
  INTERN: 'Intern Pharmacist',
  TECHNICIAN: 'Dispensary Technician',
  ASSISTANT: 'Pharmacy Assistant',
  STUDENT: 'Pharmacy Student',
  CONTACT: 'Contact',
};

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  LOCUM: 'Locum',
  CASUAL: 'Casual',
  SHIFT_HERO: 'Shift Hero',
};

export const formatChoiceLabel = (value: any, labels: Record<string, string>) => {
  const key = String(value ?? '').trim().toUpperCase();
  return key
    ? labels[key] ??
        key
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase())
    : '';
};

export const parseTime = (value?: string | null) => {
  if (!value) return { hours: 9, minutes: 0 };
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return {
    hours: Number.isFinite(hours) ? hours : 9,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
};

export const formatTime = (hours: number, minutes: number) => {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const plannerWeek = (day: Date) => {
  const monday = startOfWeek(day, { weekStartsOn: 1 });
  return { from: format(monday, 'yyyy-MM-dd'), to: format(addDays(monday, 6), 'yyyy-MM-dd') };
};

export const plannerCopyRequest = (pharmacy: number, day: Date, mode: 'task' | 'day' | 'week',
  previous: PlannerCopyInput | null, taskId?: number | null): PlannerCopyInput => {
  const week = plannerWeek(day);
  const date = format(day, 'yyyy-MM-dd');
  const source = {
    pharmacy, source_from: mode === 'week' ? week.from : date,
    source_to: mode === 'week' ? week.to : date,
    day_offset: mode === 'week' ? 7 : mode === 'day' ? 1 : 0,
    ...(mode === 'task' ? { task_id: taskId } : {}),
  };
  // Keep the key after an uncertain response; retrying the same action must not append duplicates.
  if (previous && Object.entries(source).every(([key, value]) => previous[key as keyof PlannerCopyInput] === value)
    && previous.task_id === source.task_id) return previous;
  return { ...source, request_key: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}` };
};

export const copyResultMessage = (result: PlannerCopyResult) => {
  const dropped = [...new Set(result.dropped_assignees.map(person => person.name))];
  return `${result.created} copied; ${result.skipped_series} repeating skipped; ${result.dropped_assignees.length} people dropped${dropped.length ? `: ${dropped.join(', ')}` : ''}.`;
};

export const taskStatusLabel = (note: WorkNoteApi, manager: boolean) => manager
  ? `${note.completed_count ?? note.completed_by?.length ?? 0} of ${note.assignees.length} done`
  : note.status.toLowerCase() === 'done' ? 'Done' : 'To do';

export const taskFormFromNote = (date: string, note?: WorkNoteApi) => ({
  title: note?.title ?? '',
  body: note?.body ?? '',
  date: note?.series_date ?? note?.date ?? date,
  notify: note?.notify_on_shift_start ?? false,
  isGeneral: note?.is_general ?? false,
  assigneeIds: note?.assignees.map(person => person.membership_id) ?? [] as number[],
  isPlannerTask: note?.is_planner_task ?? true,
  isClinical: note?.is_clinical ?? false,
  startTime: note?.start_time?.slice(0, 5) ?? '',
  endTime: note?.end_time?.slice(0, 5) ?? '',
  recurrence: note?.recurrence ?? null as CalendarRecurrence | null,
});
