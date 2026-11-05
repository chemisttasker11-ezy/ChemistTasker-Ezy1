const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const source = readFileSync(resolve(__dirname, '../app/workforce-settings.tsx'), 'utf8');
test('workforce settings preserves payroll and contracted-hours editing while linking all web sibling jobs', () => {
  assert.match(source,/workforce\.updatePayrollConfiguration/);
  assert.match(source,/workforce\.saveWorkSettings/);
  for(const route of ['/manager/roster/coverage','/workforce/employment-engagements','/attendance/kiosk-status','/workforce/payroll-export'])
    assert.ok(source.includes(route), route);
});
test('linked tools disclose active-workspace scope and inherit branded mobile tokens', () => {
  assert.match(source,/These tools use your active pharmacy workspace/);
  assert.match(source,/fontFamily: font\.outfit\.medium/);
  assert.match(source,/minHeight: touch\.min/);
});
