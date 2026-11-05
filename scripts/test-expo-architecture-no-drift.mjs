import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const form = readFileSync(new URL('../frontend_mobile/roles/shared/pharmacies/PharmacyForm.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const theme = readFileSync(new URL('../frontend_mobile/constants/theme.ts', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../frontend_mobile/constants/tokens.ts', import.meta.url), 'utf8');
const appConfig = JSON.parse(readFileSync(new URL('../frontend_mobile/app.json', import.meta.url), 'utf8'));

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

test('intentional Expo redesign keeps canonical brand and persona color contracts', () => {
  // The 2026 mobile mirror deliberately changed theme.ts: do not assert
  // legacy hardcoded accents or reject a reviewed redesign as visual drift.
  const approvedAccents = {
    owner: '#4F46E5', pharmacist: '#0EA5E9', otherStaff: '#22C55E',
    explorer: '#F97316', organization: '#0369A1', admin: '#6366F1',
  };
  for (const [persona, accent] of Object.entries(approvedAccents)) {
    const tokenLine = new RegExp(`${persona}: \\{[^\\n]*accentFill: '${accent}'`);
    assert.match(tokens, tokenLine, `Missing approved ${persona} accent token`);
    const themeRef = new RegExp(`accent: tokens\\.light\\.persona\\.${persona}\\.accentFill`);
    assert.match(theme, themeRef, `Theme must consume the ${persona} token`);
  }
  assert.match(tokens, /brandNavy: '#06214A'/);
  assert.match(tokens, /primary: '#5222B8'/);
  assert.match(theme, /navy: tokens\.light\.brandNavy/);
  assert.match(theme, /purple: tokens\.light\.primary/);
  assert.match(theme, /\.\.\.MD3LightTheme/);
  assert.equal(appConfig.expo.userInterfaceStyle, 'light', 'Launch UI must remain light until dark QA is approved');
});
