import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./timesheetDetailPolicy.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const exported = {};
vm.runInNewContext(outputText, { exports: exported, Intl, Date, Number, Math, String });
const { canApproveTimesheet, isSourceCorrectionRequired, formatPharmacyClock, formatTimesheetMinutes } = exported;

test('timesheet approval only allows fresh non-blocked non-locked revision', () => {
  const fresh = { status: 'SUBMITTED', revision_number: 4, needs_rebuild: false, blocking_checks: 0, effective_blocking_checks: 0 };
  assert.equal(canApproveTimesheet(fresh, false), true);
  assert.equal(canApproveTimesheet(fresh, true), false);
  assert.equal(canApproveTimesheet({ ...fresh, status: 'APPROVED' }, false), false);
  assert.equal(canApproveTimesheet({ ...fresh, status: 'LOCKED' }, false), false);
  assert.equal(canApproveTimesheet({ ...fresh, needs_rebuild: true }, false), false);
  assert.equal(canApproveTimesheet({ ...fresh, revision_number: null }, false), false);
  assert.equal(canApproveTimesheet({ ...fresh, effective_blocking_checks: 1 }, false), false);
  assert.equal(canApproveTimesheet(null, false), false);
});

test('critical attendance exceptions require fixing source rather than waiving', () => {
  assert.equal(isSourceCorrectionRequired({ code: 'MISSING_CLOCK_IN' }), true);
  assert.equal(isSourceCorrectionRequired({ code: 'MISSING_CLOCK_OUT' }), true);
  assert.equal(isSourceCorrectionRequired({ code: 'UNRESOLVED_PROVISIONAL_ATTENDANCE' }), true);
  assert.equal(isSourceCorrectionRequired({ code: 'MINOR_VARIANCE' }), false);
});

test('UTC clock displays according to pharmacy timezone, not device timezone', () => {
  assert.equal(formatPharmacyClock('2026-11-04T00:00:00Z', 'Australia/Brisbane'), '10:00');
  assert.equal(formatPharmacyClock('2026-11-04T00:00:00Z', 'Australia/Perth'), '08:00');
  assert.equal(formatPharmacyClock(null, 'Australia/Brisbane'), '—');
  assert.equal(formatPharmacyClock('bad', 'Australia/Brisbane'), '—');
});

test('minutes and null totals are not silently confused', () => {
  assert.equal(formatTimesheetMinutes(75), '1h 15m');
  assert.equal(formatTimesheetMinutes(0), '0h 00m');
  assert.equal(formatTimesheetMinutes(null), '—');
});
