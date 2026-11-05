import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./availabilityModel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(outputText, { exports });

test('W4 availability retry skips already-saved identical date and time windows', () => {
  const input = [
    { date: '2026-11-11', start_time: '09:00', end_time: '17:00', is_recurring: false, recurring_days: [], recurring_end_date: null },
    { date: '2026-11-12', start_time: '09:00', end_time: '17:00', is_recurring: false, recurring_days: [], recurring_end_date: null },
  ];
  const existing = [{ id: 9, date: '2026-11-11', startTime: '09:00:00', endTime: '17:00:00', isRecurring: false, recurringDays: [], recurringEndDate: null }];
  assert.deepEqual(JSON.parse(JSON.stringify(exports.unsavedAvailabilityPayloads(input, existing))), [input[1]]);
  assert.equal(exports.unsavedAvailabilityPayloads(input, [existing[0], { ...existing[0], date: '2026-11-12' }]).length, 0);
});

test('W4 availability does not collapse different shifts or different recurring rules', () => {
  const proposal = { date: '2026-11-11', start_time: '22:00', end_time: '23:00', is_recurring: true, recurring_days: [1,3], recurring_end_date: '2026-11-30' };
  const existing = [{ id: 10, date: proposal.date, startTime: '09:00', endTime: '17:00', isRecurring: false, recurringDays: [], recurringEndDate: null }];
  assert.equal(exports.unsavedAvailabilityPayloads([proposal], existing).length, 1);
  assert.equal(exports.unsavedAvailabilityPayloads([proposal], [{ ...existing[0], startTime: '22:00', endTime: '23:00', isRecurring: true, recurringDays: [3,1], recurringEndDate: '2026-11-30' }]).length, 0);
});
