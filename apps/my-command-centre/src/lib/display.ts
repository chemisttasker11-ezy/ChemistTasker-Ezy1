import { CATEGORIES, LANES, type Category, type Lane, type Recurrence, type Task } from '../model';

export const RECUR_LABEL: Record<Recurrence, string> = {
  none: 'One-time', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly'
};
export const LANE_LABEL: Record<Lane, string> = Object.fromEntries(LANES.map(l => [l.id, l.title])) as Record<Lane, string>;

export function formatDate(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
export function longToday(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}
export function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat('en-AU', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Australia/Brisbane' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}
export function categoryInfo(category: Category) { return CATEGORIES.find(c => c.id === category)!; }
export function activeItem(task: Task) { return !task.archivedAt; } // Finished tasks remain visible on the board.
export function taskDue(task: Task, day: string, done: boolean) { return Boolean(task.dueDate && task.dueDate <= day && !done); }
export function downloadable(filename: string, value: string) {
  const objectURL = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = objectURL; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
}

