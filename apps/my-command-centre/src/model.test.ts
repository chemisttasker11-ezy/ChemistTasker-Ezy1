import { describe, expect, it } from 'vitest';
import { brisbaneToday, createTask, initialState, isCompleted, nextDueDate, periodKey, toggleCompletion, validateImported } from './model';

describe('periods and recurring completion', () => {
  it('computes Australia/Brisbane date correctly', () => {
    expect(brisbaneToday(new Date('2026-10-16T01:00:00Z'))).toBe('2026-10-16');
    expect(brisbaneToday(new Date('2026-10-15T15:00:00Z'))).toBe('2026-10-16');
  });
  it('uses Monday as start of week', () => {
    expect(periodKey('weekly', '2026-10-16')).toBe('2026-10-12');
    expect(periodKey('weekly', '2026-10-18')).toBe('2026-10-12');
    expect(periodKey('weekly', '2026-10-19')).toBe('2026-10-19');
  });
  it('recognises quarterly and yearly periods', () => {
    expect(periodKey('quarterly', '2026-10-16')).toBe('2026-Q4');
    expect(periodKey('yearly', '2026-10-16')).toBe('2026');
  });
  it('logs a recurring task once per period and resets next day', () => {
    let data = initialState();
    const task = data.tasks.find(t => t.title === 'Family time')!;
    data = toggleCompletion(data, task.id, new Date('2026-10-16T01:00:00Z'));
    expect(isCompleted(task, data.completions, '2026-10-16')).toBe(true);
    expect(isCompleted(task, data.completions, '2026-10-17')).toBe(false);
    expect(data.completions).toHaveLength(1);
    data = toggleCompletion(data, task.id, new Date('2026-10-16T01:00:00Z'));
    expect(data.completions).toHaveLength(0);
  });
  it('keeps a one-time completion completed', () => {
    let data = initialState();
    const t = data.tasks.find(t => t.title === 'Tax')!;
    data = toggleCompletion(data, t.id, new Date('2026-10-16T01:00:00Z'));
    expect(isCompleted(data.tasks.find(v => v.id === t.id)!, data.completions, '2028-01-01')).toBe(true);
  });
  it('rolls monthly due dates from January 31 safely', () => {
    expect(nextDueDate('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28');
    expect(nextDueDate('2026-01-31', 'monthly', '2026-02-28')).toBe('2026-03-31');
  });
  it('validates backups, never executing arbitrary text', () => {
    const s = initialState();
    expect(validateImported(JSON.parse(JSON.stringify(s))).tasks.length).toBeGreaterThan(20);
    const bad = initialState();
    bad.tasks[0].category = 'Bad' as never;
    expect(() => validateImported(bad)).toThrow();
  });
  it('permits independent tasks in all six lanes', () => {
    const t = createTask({ title: 'Trial', lane: 'goals', category: 'Family' });
    expect(t.recurrence).toBe('none');
    expect(t.lane).toBe('goals');
  });
});

import { moveInBoard } from './model';

describe('task board ordering and undo semantics', () => {
  it('moves a notebook card into a different lane without losing its identity', () => {
    const state = initialState();
    const task = state.tasks[0];
    const next = moveInBoard(state, task.id, 'weekly');
    expect(state.tasks[0].lane).toBe('urgent');
    expect(next.tasks.find(t => t.id === task.id)?.lane).toBe('weekly');
    expect(next.tasks).toHaveLength(state.tasks.length);
    expect(next.tasks.filter(t => t.id === task.id)).toHaveLength(1);
  });
  it('reorders tasks inside the same lane', () => {
    const state = initialState();
    const first = state.tasks.find(t => t.lane === 'weekly')!;
    const last = [...state.tasks].reverse().find(t => t.lane === 'weekly')!;
    const next = moveInBoard(state, last.id, 'weekly', first.id);
    const weekly = next.tasks.filter(t => t.lane === 'weekly');
    expect(weekly[0].id).toBe(last.id);
    expect(new Set(weekly.map(t => t.id)).size).toBe(weekly.length);
  });
  it('undoes a recurring task without losing its original due date', () => {
    const state = initialState();
    const task = createTask({ title: 'Invoice review', lane: 'monthly', dueDate: '2026-10-01' });
    state.tasks.push(task);
    const now = new Date('2026-10-16T02:00:00Z');
    const completed = toggleCompletion(state, task.id, now);
    expect(completed.tasks.find(t => t.id === task.id)?.dueDate).toBe('2026-11-01');
    const undone = toggleCompletion(completed, task.id, now);
    expect(undone.tasks.find(t => t.id === task.id)?.dueDate).toBe('2026-10-01');
    expect(undone.completions).toHaveLength(0);
  });
  it('ignores unknown cards and refuses to move archived cards', () => {
    const state = initialState();
    expect(moveInBoard(state, 'unknown', 'weekly')).toBe(state);
    state.tasks[0].archivedAt = new Date().toISOString();
    expect(moveInBoard(state, state.tasks[0].id, 'daily')).toBe(state);
  });
});
