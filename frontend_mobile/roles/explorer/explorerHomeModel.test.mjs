import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./explorerHomeModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } });
const output = {};
vm.runInNewContext(compiled.outputText, { exports: output, Number, Array });
const { explorerDashboardFacts, explorerShiftDisplay } = output;

test('Explorer dashboard uses backend recommendations and worker commitments as separate lists', () => {
  const result = explorerDashboardFacts({
    recommended_shifts: [{ id: 10, pharmacy_name: 'Alpha', date: '2026-11-06', start_time: '09:00:00', end_time: '17:00:00', reason: 'Matches availability' }],
    shifts: [{ id: 11, pharmacy_name: 'Beta', date: '2026-11-07', status: 'Interested' }],
    shift_summary: { open_count: 1, confirmed_count: 2, all_count: 4 },
    community_shifts_count: 20,
    upcoming_stats: { week: 3 },
  });
  assert.deepEqual(Array.from(result.recommended, r => r.id), [10]);
  assert.deepEqual(Array.from(result.commitments, r => r.id), [11]);
  assert.equal(result.recommendedCount, 1);
  assert.equal(result.committedCount, 2);
  assert.equal(result.activeCount, 4);
  assert.equal(result.publicCount, 20);
  assert.equal(result.upcomingWeek, 3);
  assert.equal(explorerShiftDisplay(result.recommended[0]).detail, '2026-11-06 · 09:00–17:00 · Matches availability');
});

test('Explorer dashboard cannot infer personal matches from absent or malformed backend data', () => {
  assert.equal(explorerDashboardFacts(null), null);
  const result = explorerDashboardFacts({ recommended_shifts: [{ id: '1' }, { id: -3 }], shifts: [] });
  assert.equal(result.recommended.length, 0);
  assert.equal(result.recommendedCount, 0);
  assert.equal(result.committedCount, 0);
});
