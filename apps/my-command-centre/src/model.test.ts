import { describe, expect, it } from 'vitest';
import { brisbaneToday, createTask, initialState, isCompleted, nextDueDate, periodKey, toggleCompletion, validateImported, moveInBoard } from './model';

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

describe('simple statuses, postponing and independent copies', () => {
  it('starts every notebook task as Not started and migrates old local backups', async () => {
    const { STATUS_LABEL } = await import('./lib/progress');
    const data = initialState();
    expect(data.tasks).toHaveLength(26);
    expect(data.tasks.every(t => t.status === 'not-started')).toBe(true);
    const legacy = JSON.parse(JSON.stringify(data));
    delete legacy.tasks[0].status;
    delete legacy.tasks[0].scheduledTime;
    delete legacy.tasks[0].scheduleAnchor;
    expect(validateImported(legacy).tasks[0].status).toBe('not-started');
    expect(STATUS_LABEL.progressing).toBe('Progressing');
  });
  it('moves Not started -> Started -> Progressing without creating completion records', async () => {
    const { setTaskStatus } = await import('./model');
    let state = initialState();
    const id = state.tasks[0].id;
    state = setTaskStatus(state, id, 'started');
    state = setTaskStatus(state, id, 'progressing');
    expect(state.tasks[0].status).toBe('progressing');
    expect(state.completions).toHaveLength(0);
  });
  it('requires a later date to postpone and removes a postponed task from current focus', async () => {
    const { setTaskStatus, rescheduleTask } = await import('./model');
    const now = new Date('2026-10-16T01:00:00Z');
    const state = initialState();
    const id = state.tasks[0].id;
    expect(setTaskStatus(state, id, 'postponed', '2026-10-16', now)).toBe(state);
    const postponed = setTaskStatus(state, id, 'postponed', '2026-10-24', now);
    expect(postponed.tasks[0]).toMatchObject({ status: 'postponed', dueDate: '2026-10-24', scheduleAnchor: '2026-10-24' });
    const unplanned = rescheduleTask(postponed, id, '');
    expect(unplanned.tasks[0].dueDate).toBe('');
    expect(unplanned.tasks[0].status).toBe('not-started');
  });
  it('logs Finished and undo restores previous status, due date and checklist', async () => {
    const { setTaskStatus } = await import('./model');
    const now = new Date('2026-10-16T01:00:00Z');
    let state = initialState();
    const id = state.tasks[5].id; // daily family time
    state = setTaskStatus(state, id, 'started', undefined, now);
    state = setTaskStatus(state, id, 'finished', undefined, now);
    expect(state.completions).toHaveLength(1);
    expect(isCompleted(state.tasks[5], state.completions, '2026-10-16')).toBe(true);
    expect(isCompleted(state.tasks[5], state.completions, '2026-10-17')).toBe(false);
    expect(state.tasks[5].status).toBe('not-started');
    state = setTaskStatus(state, id, 'started', undefined, now);
    expect(state.completions).toHaveLength(0);
    expect(state.tasks[5].status).toBe('started');
  });
  it('copies title and checklist headings but not identity, ticks, status or completion', async () => {
    const { duplicateTask } = await import('./model');
    const original = createTask({ title: 'Compile pharmacy reports', status: 'finished', completedAt: '2026-10-01T02:00:00Z',
      dueDate: '2026-10-21', subtasks: [{ id: 'one', title: 'Draft report', done: true }] });
    const copy = duplicateTask(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe('Compile pharmacy reports (copy)');
    expect(copy.status).toBe('not-started');
    expect(copy.completedAt).toBe('');
    expect(copy.subtasks[0].id).not.toBe('one');
    expect(copy.subtasks[0]).toMatchObject({ title: 'Draft report', done: false });
    expect(copy.dueDate).toBe(original.dueDate);
  });
  it('records Finished when saving an edited task, but editing its notes again does not duplicate history', async () => {
    const { saveTaskChanges } = await import('./model');
    const now = new Date('2026-10-16T01:00:00Z');
    let data = initialState();
    const task = data.tasks[0];
    data = saveTaskChanges(data, { ...task, status: 'finished', description: 'Done.' }, now);
    expect(data.completions).toHaveLength(1);
    data = saveTaskChanges(data, { ...data.tasks[0], description: 'Done, filed.' }, now);
    expect(data.completions).toHaveLength(1);
    expect(data.tasks[0].description).toBe('Done, filed.');
  });
});
