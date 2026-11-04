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
