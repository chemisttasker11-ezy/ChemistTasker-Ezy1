import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute each host's actual edit-load mapping, without mounting the whole form.
function hydrate(relativePath, rawSlots, expanded) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const start = source.indexOf('const initialSlotRateRows = expanded.map(');
  assert.notEqual(start, -1, 'edit-load mapping exists');
  const end = source.indexOf('setSlotRateRows(initialSlotRateRows)', start);
  assert.notEqual(end, -1, 'mapping is applied to form state');
  const { outputText } = ts.transpileModule(`${source.slice(start, end)}; initialSlotRateRows;`, {});
  const rows = runInNewContext(outputText, {
    rawSlots, expanded,
    getSlotRateValue: (slot) => slot?.rate,
    toRateInputString: (value) => value == null ? '' : String(value),
  });
  return Array.from(rows, (row) => ({ ...row }));
}

for (const [host, path] of [
  ['web', '../shared/postShift/PostShiftForm.tsx'],
  ['mobile', '../../frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx'],
]) {
  test(`${host}: edit rates follow their source when dates arrive out of order`, () => {
    const rows = hydrate(path, [{ date: '2026-11-07', rate: '95' }, { date: '2026-11-02', rate: '70' }], [
      { date: '2026-11-02', sourceIndex: 1 }, { date: '2026-11-07', sourceIndex: 0 },
    ]);
    assert.deepEqual(rows.map((row) => row.rate), ['70', '95']);
  });
  test(`${host}: every recurrence occurrence inherits its own source override`, () => {
    const rows = hydrate(path, [{ date: '2026-11-02', rate: '80' }, { date: '2026-11-07', rate: '110' }], [
      { date: '2026-11-02', sourceIndex: 0 }, { date: '2026-11-07', sourceIndex: 1 },
      { date: '2026-11-09', sourceIndex: 0 },
    ]);
    assert.deepEqual(rows.map((row) => row.rate), ['80', '110', '80']);
    assert.ok(rows.every((row) => row.dirty && row.status === 'success'));
  });
  test(`${host}: already ordered one-off rates stay unchanged`, () => {
    const rows = hydrate(path, [{ date: '2026-11-02', rate: '70' }, { date: '2026-11-07', rate: null }], [
      { date: '2026-11-02', sourceIndex: 0 }, { date: '2026-11-07', sourceIndex: 1 },
    ]);
    assert.deepEqual(rows, [
      { rate: '70', status: 'success', dirty: true }, { rate: '', status: 'idle', dirty: false },
    ]);
  });
}
