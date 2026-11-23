import { periodKey, type Completion, type Recurrence, type Task } from '../model';

export type CalendarScale = 'day' | 'week' | 'month' | 'year';
export interface CalendarOccurrence {
  task: Task;
  date: string;
  completed: boolean;
}

const DAY_MS = 86400000;

export function dateUTC(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}
export function isoDay(date: Date): string { return date.toISOString().slice(0, 10); }
export function addDays(iso: string, days: number): string {
  const date = dateUTC(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}
export function mondayOf(iso: string): string {
  const weekday = (dateUTC(iso).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return isoDay(first);
}
export function monthDates(iso: string): string[] {
  const first = iso.slice(0, 7) + '-01';
  const start = mondayOf(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}
export function visibleRange(anchor: string, scale: CalendarScale): { start: string; end: string } {
  if (scale === 'day') return { start: anchor, end: anchor };
  if (scale === 'week') {
    const start = mondayOf(anchor);
    return { start, end: addDays(start, 6) };
  }
  if (scale === 'month') {
    const dates = monthDates(anchor);
    return { start: dates[0], end: dates[41] };
  }
  const year = anchor.slice(0, 4);
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
export function shiftCalendar(anchor: string, scale: CalendarScale, direction: number): string {
  if (scale === 'day') return addDays(anchor, direction);
  if (scale === 'week') return addDays(anchor, direction * 7);
  if (scale === 'month') return addMonths(`${anchor.slice(0, 7)}-01`, direction);
  return addMonths(`${anchor.slice(0, 4)}-01-01`, direction * 12);
}
export function dateTitle(anchor: string, scale: CalendarScale): string {
  if (scale === 'year') return anchor.slice(0, 4);
  const formatter = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-AU', { ...options, timeZone: 'UTC' }).format(dateUTC(date));
  if (scale === 'day') return formatter(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (scale === 'month') return formatter(anchor, { month: 'long', year: 'numeric' });
  const start = mondayOf(anchor);
  const end = addDays(start, 6);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${formatter(start, { day: 'numeric' })}–${formatter(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${formatter(start, { day: 'numeric', month: 'short' })} – ${formatter(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function occurrenceDate(anchor: string, recurrence: Recurrence, n: number): string {
  if (recurrence === 'daily') return addDays(anchor, n);
  if (recurrence === 'weekly') return addDays(anchor, n * 7);
  if (recurrence === 'monthly') return addMonths(anchor, n);
  if (recurrence === 'quarterly') return addMonths(anchor, n * 3);
  return addMonths(anchor, n * 12);
}

function firstIndex(anchor: string, start: string, recurrence: Recurrence): number {
  if (start <= anchor) return 0;
  if (recurrence === 'daily' || recurrence === 'weekly') {
    const difference = (dateUTC(start).getTime() - dateUTC(anchor).getTime()) / DAY_MS;
    return Math.max(0, Math.floor(difference / (recurrence === 'daily' ? 1 : 7)) - 1);
  }
  const [ay, am] = anchor.split('-').map(Number);
  const [sy, sm] = start.split('-').map(Number);
  const months = (sy - ay) * 12 + sm - am;
  const step = recurrence === 'monthly' ? 1 : recurrence === 'quarterly' ? 3 : 12;
  return Math.max(0, Math.floor(months / step) - 1);
}

/** Return dated task instances without inventing dates for undated routines.
 * Existing recurrence dates are projected from the original schedule anchor.
 * Completions are looked up for the occurrence's own period, not the visible day.
 */
export function calendarOccurrences(tasks: Task[], completions: Completion[], start: string, end: string): CalendarOccurrence[] {
  if (end < start) return [];
  const completionKeys = new Set(completions.map(c => `${c.taskId}|${c.periodKey}`));
  const result: CalendarOccurrence[] = [];
  for (const task of tasks) {
    if (task.archivedAt || !task.dueDate) continue;
    if (task.recurrence === 'none') {
      if (task.dueDate >= start && task.dueDate <= end) {
        result.push({ task, date: task.dueDate, completed: Boolean(task.completedAt) });
      }
      continue;
    }
    const anchor = task.scheduleAnchor || task.dueDate;
    // Every iteration moves at least one calendar day, and ranges span <= 42 days or one year.
    const limit = 420;
    for (let n = firstIndex(anchor, start, task.recurrence), count = 0; count < limit; n++, count++) {
      const date = occurrenceDate(anchor, task.recurrence, n);
      if (date > end) break;
      if (date < start) continue;
      result.push({ task, date, completed: completionKeys.has(`${task.id}|${periodKey(task.recurrence, date)}`) });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.task.scheduledTime.localeCompare(b.task.scheduledTime) || a.task.title.localeCompare(b.task.title));
}
