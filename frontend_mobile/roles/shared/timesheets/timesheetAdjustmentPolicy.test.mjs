import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./timesheetAdjustmentPolicy.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const exports = {};
vm.runInNewContext(output.outputText, { exports, Intl, Date, Math, Set, Number, Object });
const { formatLocalMinute, resolveAttendanceLocalMinute, correctionOrder, correctionValidation } = exports;

test('pharmacy-local dates work independently of the phone timezone', () => {
  assert.equal(formatLocalMinute('2026-11-03T23:00:00Z', 'Australia/Brisbane'), '2026-11-04T09:00');
  assert.equal(resolveAttendanceLocalMinute('2026-11-04T09:00', '2026-11-04T00:00:00Z', 'Australia/Brisbane'), '2026-11-03T23:00:00.000Z');
  assert.equal(resolveAttendanceLocalMinute('2026-11-04T09:00', '2026-11-04T00:00:00Z', 'Australia/Perth'), '2026-11-04T01:00:00.000Z');
  assert.equal(resolveAttendanceLocalMinute('2026-02-30T09:00', '', 'Australia/Brisbane'), null);
});

test('DST gap is rejected and repeated Sydney hour has deterministic safe resolution', () => {
  assert.equal(resolveAttendanceLocalMinute('2026-10-04T02:30', '', 'Australia/Sydney'), null);
  const earlier = resolveAttendanceLocalMinute('2026-04-05T02:30', '2026-04-04T17:00:00Z', 'Australia/Sydney');
  assert.equal(earlier, '2026-04-04T15:30:00.000Z');
  const originalLater = '2026-04-04T16:30:00Z';
  assert.equal(resolveAttendanceLocalMinute('2026-04-05T02:30', originalLater, 'Australia/Sydney'), originalLater);
});

test('corrections keep intermediate start/finish chronology and preserve breaks', () => {
  assert.deepEqual(Array.from(correctionOrder('2026-11-04T09:30:00Z', '2026-11-04T18:00:00Z', '2026-11-04T17:00:00Z')), ['finish', 'start']);
  assert.deepEqual(Array.from(correctionOrder('2026-11-04T07:30:00Z', '2026-11-04T16:30:00Z', '2026-11-04T17:00:00Z')), ['start', 'finish']);
  assert.equal(correctionValidation('2026-11-04T18:00:00Z', '2026-11-04T09:00:00Z', []), 'Start must be before finish.');
  assert.match(correctionValidation('2026-11-04T08:00:00Z', '2026-11-04T17:00:00Z', ['2026-11-04T07:00:00Z']), /recorded breaks/);
  assert.equal(correctionValidation('2026-11-04T08:00:00Z', '2026-11-04T17:00:00Z', ['2026-11-04T12:00:00Z'], Date.parse('2026-11-05T00:00:00Z')), null);
});
