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

test('late pharmacy defaults do not overwrite a manually entered rate in the same posting scope', () => {
  assert.match(code, /const manualRateEdits = React\.useRef/);
  assert.match(code, /if \(edits\.pharmacyId !== pharmacyId\)/);
  assert.match(code, /if \(!touched\.has\('rateWeekday'\)\) setRateWeekday/);
  assert.match(code, /if \(!touched\.has\('ratePublicHoliday'\)\) setRatePublicHoliday/);
  assert.match(code, /manualRateEdits\.current\.fields\.add\(field\)/);
  assert.match(code, /setRateWeekday=\{editedRate\('rateWeekday', setRateWeekday\)\}/);
  assert.match(code, /setRateType=\{editedRate\('rateType', setRateType\)\}/);
});
