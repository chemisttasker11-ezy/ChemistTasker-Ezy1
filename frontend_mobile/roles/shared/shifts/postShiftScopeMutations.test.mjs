import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('./PostShiftScreen.tsx', import.meta.url), 'utf8');
test('template mutations ignore late pharmacy or role callbacks', () => {
  assert.match(code, /const templateScope = `\$\{pharmacyId\}:\$\{roleNeeded\}`/);
  assert.match(code, /const templateMutationGen = React\.useRef\(0\)/);
  assert.match(code, /if \(!stillCurrent\(\)\) return;\s*setDescriptionTemplate\(data as ShiftDescriptionTemplate\)/);
  assert.match(code, /if \(stillCurrent\(\)\) setDescriptionTemplateSaving\(false\)/);
});
test('confirmed delete cannot execute in a different scoped pharmacy', () => {
  assert.match(code, /if \(templateScopeRef\.current !== scope\) return/);
  assert.match(code, /deleteShiftDescriptionTemplate\(selectedTemplateId\)/);
});
test('rate changes cannot overwrite data or busy state for another pharmacy', () => {
  assert.match(code, /const rateMutationGen = React\.useRef\(0\)/);
  assert.match(code, /if \(!stillCurrent\(\)\) return;\s*setPharmacies/);
  assert.match(code, /if \(stillCurrent\(\)\) setSavingPharmacyRates\(false\)/);
});
