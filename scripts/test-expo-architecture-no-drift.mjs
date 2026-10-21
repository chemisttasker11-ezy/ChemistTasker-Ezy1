import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const form = readFileSync(new URL('../frontend_mobile/roles/shared/pharmacies/PharmacyForm.tsx', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../frontend_mobile/constants/theme.ts', import.meta.url), 'utf8');

test('pharmacy GET recovery is enabled, is retry-only and cannot resubmit a write', () => {
  const actionStart = form.indexOf('onPress={handleVerifySaved}');
  assert.ok(actionStart > 0, 'Missing the recovery control');
  const actionEnd = form.indexOf('Verify Saved Pharmacy\n', actionStart);
  assert.ok(actionEnd > actionStart, 'Missing recovery control label');
  const button = form.slice(actionStart, actionEnd);
  assert.match(button, /disabled=\{saving\}/);
  assert.doesNotMatch(button, /disabled=\{[^}]*verificationPending/);
  assert.match(form, /if \(pendingReadbackRef\.current\) \{\s*persistedPharmacyId = pendingReadbackRef\.current\.id;\s*\} else if \(hasFiles\)/);
  assert.match(form, /const persisted = \(await getPharmacyById\(persistedPharmacyId\)\)/);
});

test('native presentation is visually unchanged while shared brand tokens remain', () => {
  const existing = {
    owner: '#4F46E5', pharmacist: '#0EA5E9', otherStaff: '#22C55E',
    explorer: '#F97316', organization: '#0369A1', admin: '#6366F1',
  };
  for (const [role, shade] of Object.entries(existing)) {
    assert.ok(theme.includes(`${role}: { accent: '${shade}'`), `Visual drift detected for ${role}`);
  }
  assert.match(theme, /navy: CHEMISTTASKER_BRAND\.navy/);
});
