import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('workers see payroll readiness but cannot call the manager-only activation endpoint', () => {
  const mobile = readFileSync(new URL('./PublicShiftsView.tsx', import.meta.url), 'utf8');
  const web = readFileSync(new URL('../../../../frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx', import.meta.url), 'utf8');
  for (const [label, source] of [['mobile', mobile], ['web', web]]) {
    assert.doesNotMatch(source, /activateShiftOfferPayrollService|handleActivatePayroll/,
      label + ' worker offer board must not send manager-only payroll mutations');
    assert.match(source, /Complete private profile/, label + ' retains self-service onboarding');
    assert.match(source, /pharmacy manager activates payroll/, label + ' explains actual ownership');
  }
  const owner = readFileSync(new URL('./ConfirmedShiftsView.tsx', import.meta.url), 'utf8');
  assert.match(owner, /activateShiftOfferPayrollService/, 'manager confirmed-shifts action is preserved');
});
