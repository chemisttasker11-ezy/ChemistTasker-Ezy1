import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const screen = readFileSync(new URL('./PostShiftScreen.tsx', import.meta.url), 'utf8');
const step = readFileSync(new URL('./PostShiftDetailsStep.tsx', import.meta.url), 'utf8');
test('template request failures are not treated as missing saved templates', () => {
  assert.match(screen,/setDescriptionTemplateError\(failure\?\.message/);
  assert.match(screen,/\[pharmacyId, roleNeeded, editingId, templateRetry\]/);
  assert.match(step,/Saved description unavailable:/);
  assert.match(step,/Retry saved description/);
});
test('template Save cannot replace unknown state until lookup recovers', () => {
  assert.match(step,/Boolean\(descriptionTemplateError\)/);
  assert.match(screen,/descriptionTemplateSaving \|\| descriptionTemplateLoading \|\| descriptionTemplateError/);
});
test('retry does not reset the shift form or shift description', () => {
  assert.match(screen,/retryDescriptionTemplate=\{\(\) => setTemplateRetry\(current => current \+ 1\)\}/);
  assert.doesNotMatch(screen,/retryDescriptionTemplate=\{\(\) => resetForm/);
});
