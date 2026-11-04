import { brisbaneToday, type BoardState, type Priority, type Task, type TaskStatus, type WeeklyCommitment, type WeeklyPlan } from '../model';
import { addDays, mondayOf } from './calendar';

/** Points are intentionally transparent. A postponed task remains in the denominator. */
export const STATUS_POINTS: Record<TaskStatus, number> = {
  'not-started': 0,
  'started': 25,
  'progressing': 60,
  'finished': 100,
  'postponed': 0
};
export const PRIORITY_WEIGHTS: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export interface ScoredCommitment {
  commitment: WeeklyCommitment;
  task: Task | undefined;
  status: TaskStatus;
  points: number;
  weight: number;
  earned: number;
  possible: number;
}
export interface WeekScore {
  percent: number | null;
  earned: number;
  possible: number;
  planned: number;
  finished: number;
  postponed: number;
  items: ScoredCommitment[];
}

function completedOnDate(value: string): string {
  try {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return brisbaneToday(date);
  } catch { return ''; }
}

export function scoreWeek(plan: WeeklyPlan | undefined, state: Pick<BoardState, 'tasks' | 'completions'>, weekStart: string, today: string): WeekScore {
  const end = addDays(weekStart, 6);
  const currentWeek = mondayOf(today) === weekStart;
  const items: ScoredCommitment[] = (plan?.commitments ?? []).map(commitment => {
    const task = state.tasks.find(item => item.id === commitment.taskId);
    const completedInWeek = state.completions.some(c =>
      c.taskId === commitment.taskId && completedOnDate(c.completedAt) >= weekStart && completedOnDate(c.completedAt) <= end);
    // For past and future weeks, never rewrite history using today's live status.
    const status: TaskStatus = completedInWeek ? 'finished' :
      currentWeek && task && !task.archivedAt
        ? (task.status === 'finished' ? 'not-started' : task.status)
        : 'not-started';
    const points = STATUS_POINTS[status];
    const weight = PRIORITY_WEIGHTS[commitment.priority];
    return { commitment, task, status, points, weight, earned: points * weight, possible: 100 * weight };
  });
  const earned = items.reduce((sum, item) => sum + item.earned, 0);
  const possible = items.reduce((sum, item) => sum + item.possible, 0);
  return {
    percent: possible ? Math.round(100 * earned / possible) : null,
    earned, possible, planned: items.length,
    finished: items.filter(item => item.status === 'finished').length,
    postponed: items.filter(item => item.status === 'postponed').length,
    items
  };
}
