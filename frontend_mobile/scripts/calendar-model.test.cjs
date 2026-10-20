const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the mobile model with the existing Node runner, without booting Expo's transport.
const filename = path.resolve(__dirname, '../roles/shared/calendar/calendarModel.ts');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const modelModule = new Module(filename, module);
modelModule.filename = filename;
modelModule.require = id => id === '@/utils/apiClient' ? {} : Module.createRequire(filename)(id);
modelModule._compile(compiled, filename);
const { plannerWeek, plannerCopyRequest, copyResultMessage, taskStatusLabel, taskFormFromNote } = modelModule.exports;

test('planner fetches a Monday to Sunday week across month and year boundaries', () => {
  assert.deepEqual(plannerWeek(new Date(2027, 0, 1)), { from: '2026-12-28', to: '2027-01-03' });
  assert.deepEqual(plannerWeek(new Date(2027, 0, 3)), { from: '2026-12-28', to: '2027-01-03' });
  assert.deepEqual(plannerWeek(new Date(2027, 0, 4)), { from: '2027-01-04', to: '2027-01-10' });
});

test('duplicate stays on the same day; day and week copies use the atomic API offsets', () => {
  const day = new Date(2027, 0, 1);
  assert.deepEqual({ ...plannerCopyRequest(3, day, 'task', null, 18), request_key: 'key' }, {
    pharmacy: 3, source_from: '2027-01-01', source_to: '2027-01-01', day_offset: 0, task_id: 18, request_key: 'key',
  });
  assert.deepEqual({ ...plannerCopyRequest(3, day, 'day', null), request_key: 'key' }, {
    pharmacy: 3, source_from: '2027-01-01', source_to: '2027-01-01', day_offset: 1, request_key: 'key',
  });
  assert.deepEqual({ ...plannerCopyRequest(3, day, 'week', null), request_key: 'key' }, {
    pharmacy: 3, source_from: '2026-12-28', source_to: '2027-01-03', day_offset: 7, request_key: 'key',
  });
});

test('an uncertain copy reuses its key only for identical input, including the source task and pharmacy', () => {
  const day = new Date(2027, 0, 1);
  const previous = plannerCopyRequest(3, day, 'task', null, 18);
  assert.equal(plannerCopyRequest(3, day, 'task', previous, 18), previous);
  assert.notEqual(plannerCopyRequest(3, day, 'task', previous, 19).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(4, day, 'task', previous, 18).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(3, day, 'day', previous).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(3, new Date(2027, 0, 2), 'task', previous, 18).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(3, day, 'task', null, 18).request_key, previous.request_key);
});

test('copy feedback reports copied, skipped repeating, and dropped people by name', () => {
  assert.equal(copyResultMessage({ created: 2, skipped_series: 1, dropped_assignees: [
    { task_id: 18, membership_id: 7, name: 'Sam' }, { task_id: 19, membership_id: 7, name: 'Sam' },
  ] }), '2 copied; 1 repeating skipped; 2 people dropped: Sam.');
  assert.equal(copyResultMessage({ created: 0, skipped_series: 0, dropped_assignees: [] }),
    '0 copied; 0 repeating skipped; 0 people dropped.');
});

test('tasks start unassigned with notifications off and the clicked date', () => {
  assert.deepEqual(taskFormFromNote('2027-01-01'), {
    title: '', body: '', date: '2027-01-01', notify: false, isGeneral: false, assigneeIds: [],
    isPlannerTask: true, isClinical: false, startTime: '', endTime: '', recurrence: null,
  });
});

test('series editing retains the original date and weekday rule; informal notes retain their kind', () => {
  const note = { date: '2027-01-06', series_date: '2026-12-28', title: 'Opening', body: 'Details',
    is_planner_task: false, recurrence: { freq: 'WEEKLY', byweekday: [0, 2], interval: 2 },
    assignees: [{ membership_id: 7 }], start_time: '09:30:00' };
  const form = taskFormFromNote('2027-01-06', note);
  assert.equal(form.date, '2026-12-28');
  assert.deepEqual(form.recurrence, note.recurrence);
  assert.deepEqual(form.assigneeIds, [7]);
  assert.equal(form.isPlannerTask, false);
  assert.equal(form.startTime, '09:30');
});

test('staff see their own To do / Done state; managers see completion counts', () => {
  const note = { status: 'open', assignees: [{}, {}, {}], completed_count: 2 };
  assert.equal(taskStatusLabel(note, false), 'To do');
  assert.equal(taskStatusLabel({ ...note, status: 'done' }, false), 'Done');
  assert.equal(taskStatusLabel(note, true), '2 of 3 done');
  assert.equal(taskStatusLabel({ status: 'open', assignees: [] }, true), '0 of 0 done');
});

test('Calendar replaces Operations in every role menu that had it, with the same visibility', () => {
  // The menus are inline literals in the layouts; Operations had no visibility rule on any of them.
  for (const role of ['owner', 'organization', 'admin']) {
    const layout = readFileSync(path.resolve(__dirname, `../app/${role}/_layout.tsx`), 'utf8');
    const entry = layout.match(/\{ label: 'Calendar',[^}]*route: '\/\w+\/calendar'[^}]*\}/)?.[0];
    assert.ok(entry, role);
    assert.doesNotMatch(entry, /visible: (?!true)/, role);
    assert.doesNotMatch(layout, /\/operations/, role);
  }
});

test('each copy action gets a fresh key', () => {
  const day = new Date(2027, 0, 1);
  assert.notEqual(plannerCopyRequest(3, day, 'day', null).request_key, plannerCopyRequest(3, day, 'day', null).request_key);
});
