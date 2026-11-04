import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./confirmedPayroll.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(outputText, { exports });

const candidate = {
  id: 10, paymentPreferenceSnapshot: 'TFN', engagementKind: 'SHIFT_EMPLOYMENT',
  settlementChannel: 'TIMESHEET_ONLY', payrollActivatedAt: null,
  engagementTermsSnapshot: { payrollActivationRequired: true, pharmacyId: 7 },
};

test('W3e only offers genuinely deferred payroll activation in matching pharmacy', () => {
  const f = exports.filterDeferredPayrollOffers;
  assert.deepEqual(JSON.parse(JSON.stringify(f([candidate], 7))), [candidate]);
  assert.equal(f([candidate], 8).length, 0, 'no cross pharmacy activation');
  assert.equal(f([{...candidate, paymentPreferenceSnapshot:'ABN'}],7).length,0);
  assert.equal(f([{...candidate, settlementChannel:'PAYROLL'}],7).length,0);
  assert.equal(f([{...candidate, engagementKind:'STAFF_EMPLOYMENT'}],7).length,0);
  assert.equal(f([{...candidate, engagementTermsSnapshot:{...candidate.engagementTermsSnapshot, payrollActivationRequired:false}}],7).length,0);
  assert.equal(f([{...candidate, payrollActivatedAt:'2026-11-04T00:00:00Z'}],7).length,0);
});
