import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./calendarModel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(outputText, {
  exports,
  require: (name) => {
    assert.equal(name, 'date-fns');
    return { isValid: () => true };
  },
});

const rows = [
  { pharmacyId: 3 },
  { pharmacy_id: 4 },
  { pharmacyDetail: { id: 5 } },
  { pharmacy: { id: 6 } },
];

test('W4 calendar deep links only select a pharmacy visible to this worker', () => {
  const pick = exports.pickAllowedCalendarPharmacyId;
  assert.equal(pick(rows, 4), 4);
  assert.equal(pick(rows, 6), 6);
  assert.equal(pick(rows, 999), 3, 'unauthorized requested pharmacy falls back to first permitted');
  assert.equal(pick(rows, null), 3);
  assert.equal(pick([], 999), null, 'no memberships means no selected pharmacy');
});

test('W4 calendar scope ignores malformed and nonpositive pharmacy identifiers', () => {
  const pick = exports.pickAllowedCalendarPharmacyId;
  assert.equal(pick([{ pharmacyId: 0 }, { pharmacy_id: 'x' }, { pharmacyDetail: { id: 7 } }], 0), 7);
  assert.equal(pick([{ pharmacyId: 0 }], 0), null);
});
