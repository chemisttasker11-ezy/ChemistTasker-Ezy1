import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./dashboardScope.tsx', import.meta.url), 'utf8');
const start = source.indexOf('export function translateDashboardJobPath(');
const end = source.indexOf('/** The mobile route for a dashboard activity link', start);
assert.ok(start > 0 && end > start);
const snippet = source.slice(start, end);
const js = ts.transpileModule(snippet, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const scope = { exports: {} };
runInNewContext(js, scope);
const translate = scope.exports.translateDashboardJobPath;

test('owner and organization pharmacy activity opens real native destinations', () => {
  assert.equal(translate('/dashboard/owner/manage-pharmacies/my-pharmacies'), '/owner/pharmacies');
  assert.equal(translate('/dashboard/owner/manage-pharmacies/my-chain'), '/owner/chain');
  assert.equal(translate('/dashboard/organization/manage-pharmacies/my-chain'), '/organization/chain');
  assert.equal(translate('/dashboard/organization/manage-pharmacies/roster'), '/manager/roster');
});
test('delegated admin activity keeps the admin shell and routes shared work correctly', () => {
  assert.equal(translate('/dashboard/admin/123/manage-pharmacies/my-pharmacies'), '/admin/pharmacies');
  assert.equal(translate('/dashboard/owner/manage-pharmacies/my-pharmacies', 'admin'), '/admin/pharmacies');
  assert.equal(translate('/dashboard/admin/123/attendance-reviews'), '/attendance/reviews');
  assert.equal(translate('/dashboard/workforce/timesheets'), '/workforce-timesheets');
});
test('normal native detail, profile and query destinations remain usable', () => {
  assert.equal(translate('/dashboard/pharmacist/invoice/42?revision=3'), '/pharmacist/invoice/42?revision=3');
  assert.equal(translate('/dashboard/owner/onboarding'), '/owner/profile');
  assert.equal(translate('/dashboard/owner/overview'), '/owner/dashboard');
  assert.equal(translate('/dashboard/organization/calendar?day=2026-11-06'), '/organization/calendar?day=2026-11-06');
});
test('unknown managed or unsafe web destinations cannot silently open a different native task', () => {
  assert.equal(translate('/dashboard/owner/manage-pharmacies/not-a-route'), null);
  assert.equal(translate('/dashboard/owner/shift-center'), null);
  assert.equal(translate('//evil.example/route'), null);
  assert.equal(translate('/dashboard/owner/logout'), null);
});
