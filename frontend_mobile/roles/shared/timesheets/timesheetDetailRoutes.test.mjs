import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('worker and manager timesheet routes share a native detail implementation but not actions', () => {
  const manager = read('../../../app/workforce-timesheets/[id].tsx');
  const worker = read('../../../app/my-hours/[id].tsx');
  const detail = read('./TimesheetDetailScreen.tsx');
  const managerList = read('../../../app/workforce-timesheets.tsx');
  const workerList = read('../../../app/my-hours.tsx');
  assert.match(manager, /managerMode=\{true\}/);
  assert.match(worker, /managerMode=\{false\}/);
  assert.match(managerList, /\/workforce-timesheets\/\$\{row\.id\}/);
  assert.match(workerList, /\/my-hours\/\$\{row\.id\}/);
  assert.match(detail, /getTimesheet\(timesheetId\)/);
  assert.match(detail, /effective_blocking_checks/);
  assert.match(detail, /canApproveTimesheet\(data, false\)/);
  assert.match(detail, /managerAllowed && !sourceRequired/);
  assert.match(detail, /isSourceCorrectionRequired\(check\)/);
  assert.match(detail, /workforce\.addMissingPunch/);
  assert.match(detail, /session_id: sessionId, event_type: eventType, occurred_at_local: when/);
  assert.match(detail, /workforce\.addTimesheetComment/);
  assert.match(detail, /workerVisible/);
  assert.match(detail, /hasCapability\('MANAGE_ROSTER'/);
});
