import type { Task, TaskStatus } from '../model';

/** One set of human-readable statuses throughout the board and calendar. */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  'started': 'Started',
  'progressing': 'Progressing',
  'finished': 'Finished',
  'postponed': 'Postponed'
};

export const STATUS_ORDER: TaskStatus[] = ['not-started', 'started', 'progressing', 'finished', 'postponed'];

export function visibleStatus(task: Task, completed = false): TaskStatus {
  return completed ? 'finished' : task.status ?? 'not-started';
}

/** Only show numeric checklist progress for tasks that actually have steps. */
export function checklistTally(task: Task): { done: number; total: number } | null {
  if (!task.subtasks.length) return null;
  return { done: task.subtasks.filter(step => step.done).length, total: task.subtasks.length };
}
