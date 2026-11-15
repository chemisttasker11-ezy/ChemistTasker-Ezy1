import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// O4 N6: the correction notice links /dashboard/workforce/timesheets?timesheet=<id>; the page opens that timesheet.
test('R the timesheets page opens the ?timesheet= drawer on load', () => {
  const page = readFileSync(new URL('./TimesheetsPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /const initialTimesheet = Number\(params\.get\('timesheet'\) \|\| ''\) \|\| null;/);
  assert.match(page, /useState<number \| null>\(initialTimesheet\)/);
  // The drawer loads the timesheet itself, so the server's permission check still decides what is shown.
  assert.match(page, /<TimesheetDetailDrawer\s+open=\{selectedTimesheetId != null\}\s+timesheetId=\{selectedTimesheetId\}/);
});
