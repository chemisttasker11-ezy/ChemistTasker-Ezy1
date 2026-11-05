const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const text = readFileSync(resolve(__dirname, '../app/workforce-timesheets.tsx'), 'utf8');
test('timesheet list invalidates in-flight data when changing pharmacy and period', () => {
  assert.match(text, /periodsRequestRef\.current \+= 1/);
  assert.match(text, /detailRequestRef\.current \+= 1/);
  assert.match(text, /request !== periodsRequestRef\.current/);
  assert.match(text, /request !== detailRequestRef\.current/);
  assert.match(text, /setSummary\(null\); setRows\(\[\]\)/);
  assert.match(text, /useFocusEffect/);
});

test('manager timesheet lists do not show or mutate a previous account workspace', () => {
  assert.match(text, /const accountKey = user \? String\(user\.id \?\? user\.email/);
  assert.match(text, /if \(!pharmacyId \|\| loadedAccount !== scope\)/);
  assert.match(text, /if \(!periodId \|\| loadedAccount !== scope\)/);
  assert.match(text, /if \(!accountKey \|\| loadedAccount !== accountKey\) return/);
  assert.match(text, /actionId === writeGeneration\.current && accountRef\.current === scope/);
});
test('worker My Hours rejects stale account reads and submissions', () => {
  const worker = readFileSync(resolve(__dirname, '../app/my-hours.tsx'), 'utf8');
  assert.match(worker, /snapshot\.account === accountKey \? snapshot\.rows : \[\]/);
  assert.match(worker, /request === requestRef\.current && accountRef\.current === accountKey/);
  assert.match(worker, /submitGeneration\.current === action && accountRef\.current === scope/);
});
