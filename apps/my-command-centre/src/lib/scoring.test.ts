import { describe, expect, it } from 'vitest';
import { createTask, initialState, saveWeekReview, setTaskStatus, setWeekCommitment, toggleCompletion, toggleDailyFocus, validateImported } from '../model';
import { scoreWeek, STATUS_POINTS } from './scoring';

const today = new Date('2026-10-16T02:00:00Z');
const week = '2026-10-12';
describe('weekly score and deliberate focus', () => {
  it('documents status points and priority weighting', () => {
    expect(STATUS_POINTS).toEqual({ 'not-started': 0, started: 25, progressing: 60, finished: 100, postponed: 0 });
    let state = initialState();
    const high = createTask({ title: 'High', lane: 'urgent', priority: 'high', dueDate: '2026-10-13', status: 'progressing' });
    const low = createTask({ title: 'Low', lane: 'urgent', priority: 'low', dueDate: '2026-10-14' });
    state = { ...state, tasks: [...state.tasks, high, low] };
    state = setWeekCommitment(state, week, high, true);
    state = setWeekCommitment(state, week, low, true);
    state = toggleCompletion(state, low.id, today);
    const score = scoreWeek(state.weekPlans[week], state, week, '2026-10-16');
    expect(score.percent).toBe(70); // (60*3 + 100*1) / 400
    expect(score.finished).toBe(1);
  });
  it('postponing cannot silently improve a weekly score or remove a commitment', () => {
    let state = initialState();
    const task = createTask({ title: 'Delayed', dueDate: '2026-10-13', status: 'progressing', priority: 'high' });
    state = { ...state, tasks: [...state.tasks, task] };
    state = setWeekCommitment(state, week, task, true);
    const before = scoreWeek(state.weekPlans[week], state, week, '2026-10-16');
    state = setTaskStatus(state, task.id, 'postponed', '2026-10-22', today);
    const after = scoreWeek(state.weekPlans[week], state, week, '2026-10-16');
    expect(before.percent).toBe(60);
    expect(after.percent).toBe(0);
    expect(after.planned).toBe(1);
    expect(after.postponed).toBe(1);
    expect(after.items[0].commitment.plannedDate).toBe('2026-10-13');
  });
  it('saves an immutable review score for later comparison', () => {
    let state = initialState();
    const task = createTask({ title: 'Review', dueDate: '2026-10-12', status: 'started' });
    state = { ...state, tasks: [...state.tasks, task] };
    state = setWeekCommitment(state, week, task, true);
    state = saveWeekReview(state, week, { wins: 'Shipped', blockers: 'Waiting', adjustment: 'Plan fewer tasks' }, 25, today);
    expect(state.weekPlans[week].review?.scoreSnapshot).toBe(25);
    state = setTaskStatus(state, task.id, 'progressing', undefined, today);
    expect(state.weekPlans[week].review?.scoreSnapshot).toBe(25);
    state = setWeekCommitment(state, week, task, false);
    expect(state.weekPlans[week].review?.scoreSnapshot).toBeNull();
    expect(state.weekPlans[week].review?.wins).toBe('Shipped');
  });
  it('limits each day to three distinct priorities and preserves legacy backups', () => {
    let state = initialState();
    for (const task of state.tasks.slice(0, 4)) state = toggleDailyFocus(state, '2026-10-16', task.id);
    expect(state.dailyFocus['2026-10-16']).toHaveLength(3);
    state = toggleDailyFocus(state, '2026-10-16', state.tasks[1].id);
    expect(state.dailyFocus['2026-10-16']).toHaveLength(2);
    const old = { ...initialState() } as Record<string, unknown>;
    delete old.weekPlans; delete old.dailyFocus;
    expect(validateImported(old).weekPlans).toEqual({});
    expect(validateImported(old).dailyFocus).toEqual({});
  });
  it('rejects imported plans with duplicated IDs or invalid scores', () => {
    let state = initialState();
    const task = state.tasks[0];
    state = setWeekCommitment(state, week, task, true);
    const tampered = JSON.parse(JSON.stringify(state));
    tampered.weekPlans[week].commitments.push({ ...tampered.weekPlans[week].commitments[0] });
    expect(() => validateImported(tampered)).toThrow(/Invalid weekly commitment/);
    const reviewBad = JSON.parse(JSON.stringify(state));
    reviewBad.weekPlans[week].review = { wins: '', blockers: '', adjustment: '', savedAt: '', scoreSnapshot: 999 };
    expect(() => validateImported(reviewBad)).toThrow(/Invalid weekly review/);
  });
});
