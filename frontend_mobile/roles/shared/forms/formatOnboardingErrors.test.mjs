import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./formatOnboardingErrors.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
runInNewContext(js, context);
const format = context.exports.formatOnboardingErrors;
test('onboarding validation displays string, list, scalar and nested field errors', () => {
  assert.equal(format({ detail: 'Phone already used.' }, 'Fallback'), 'Phone already used.');
  assert.equal(format({ phone_number: ['Invalid', 'Required'], postcode: 400 }, 'Fallback'), 'phone_number: Invalid, Required\npostcode: 400');
  assert.equal(format({ identity: { type: ['Missing'] } }, 'Fallback'), 'identity: type: Missing');
  assert.equal(format(null, 'Fallback'), 'Fallback');
});
test('worker Basic Info unlocks legal names until the mobile is verified and offers retry', () => {
  for (const persona of ['pharmacist', 'otherstaff']) {
    const screen = readFileSync(new URL(`../../${persona}/profile-tabs/BasicInfoScreen.tsx`, import.meta.url), 'utf8');
    assert.match(screen, /const isMobileVerified = Boolean\(user\?\.is_mobile_verified\)/);
    assert.match(screen, /first: isMobileVerified, last: isMobileVerified/);
    assert.match(screen, /editable=\{!isMobileVerified\} keyboardType="phone-pad"/);
    assert.match(screen, /formatOnboardingErrors\(/);
    assert.match(screen, /actionLabel="Try again"/);
    assert.match(screen, /ProfileBasicActions persona=/);
  }
});
test('authenticated profile OTP back does not sign out', () => {
  const otp = readFileSync(new URL('../../../app/mobile-verify.tsx', import.meta.url), 'utf8');
  assert.match(otp, /const fromProfile = source === 'profile'/);
  assert.match(otp, /if \(fromProfile\) \{/);
  assert.match(otp, /Back to profile/);
  assert.match(otp, /router\.replace\(profile as any\)/);
});
