import { describe, expect, it } from 'vitest';
import { createTask, initialState, rescheduleTask, setTaskStatus } from '../model';
import { addDays, addMonths, calendarOccurrences, mondayOf, shiftCalendar, visibleRange } from './calendar';

describe('calendar: day, week, month and year', () => {
  it('uses Brisbane dates and Monday-start weeks', () => {
    expect(mondayOf('2026-10-16')).toBe('2026-10-12');
    expect(visibleRange('2026-10-16', 'day')).toEqual({ start: '2026-10-16', end: '2026-10-16' });
    expect(visibleRange('2026-10-16', 'week')).toEqual({ start: '2026-10-12', end: '2026-10-18' });
    expect(visibleRange('2026-10-16', 'year')).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(visibleRange('2026-10-16', 'month').start).toBe('2026-09-28');
    expect(shiftCalendar('2026-12-16', 'month', 1)).toBe('2027-01-01');
  });
  it('handles leap years and last days correctly', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('never invents a date for undated notebook routines', () => {
    const state = initialState();
    expect(calendarOccurrences(state.tasks, state.completions, '2026-10-01', '2026-10-31')).toHaveLength(0);
  });
  it('projects repeating tasks from their anchor and recognises a Finished occurrence', () => {
    const task = createTask({ title: 'Monthly review', lane: 'monthly', recurrence: 'monthly', dueDate: '2026-01-31' });
    let state = { ...initialState(), tasks: [task] };
    state = setTaskStatus(state, task.id, 'finished', undefined, new Date('2026-02-28T10:00:00Z'));
    const dates = calendarOccurrences(state.tasks, state.completions, '2026-01-01', '2026-04-30');
    expect(dates.map(v => v.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(dates.find(v => v.date === '2026-02-28')?.completed).toBe(true);
  });
  it('reschedules or removes events without deleting the task or its checklist', () => {
    const task = createTask({ title: 'Visit', lane: 'weekly', recurrence: 'none', dueDate: '2026-10-19', subtasks: [{ id: 'step', title: 'Call first', done: false }] });
    const state = { ...initialState(), tasks: [task] };
    const moved = rescheduleTask(state, task.id, '2026-10-25');
    expect(moved.tasks).toHaveLength(1);
    expect(calendarOccurrences(moved.tasks, [], '2026-10-25', '2026-10-25')).toHaveLength(1);
    const cleared = rescheduleTask(moved, task.id, '');
    expect(cleared.tasks[0].subtasks).toHaveLength(1);
    expect(calendarOccurrences(cleared.tasks, [], '2026-01-01', '2026-12-31')).toHaveLength(0);
  });
});
