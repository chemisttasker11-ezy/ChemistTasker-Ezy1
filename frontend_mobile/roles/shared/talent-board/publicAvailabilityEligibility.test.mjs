import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const talentSource = readFileSync(new URL('../../../../shared-core/src/talent.ts', import.meta.url), 'utf8');
const { outputText: talentTranspiled } = ts.transpileModule(talentSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const talentExports = {};
runInNewContext(talentTranspiled, { exports: talentExports, require: () => ({}) });
const actualPolicy = talentExports.canPublishTalent;

let hookState;
const reactMock = {
  useState: (init) => [hookState ?? (typeof init === 'function' ? init() : init), (v) => { hookState = typeof v === 'function' ? v(hookState) : v; }],
  useRef: (init) => ({ current: init }),
  useCallback: (fn) => fn,
  useEffect: () => {},
};

const source = readFileSync(new URL('./publicAvailabilityEligibility.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(outputText, {
  exports,
  require: (id) => (id === '@chemisttasker/shared-core' ? { canPublishTalent: actualPolicy, getOnboarding: async () => ({}) } : id === 'react' ? reactMock : {}),
});

const { EligibilityManager, usePublicAvailabilityEligibility, computeUserKey } = exports;

test('same-user refresh keeps only the latest success or failure generation', async () => {
  const pending = [];
  const mgr = new EligibilityManager(() => new Promise((resolve, reject) => pending.push({ resolve, reject })), actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 1, role: 'OTHER_STAFF', is_mobile_verified: true, is_active: true });
  pending[0].resolve({ verified: false });
  await new Promise(setImmediate);
  assert.equal(mgr.getState().status, 'ineligible');
  const older = mgr.load();
  const newer = mgr.load();
  pending[2].resolve({ verified: true });
  await newer;
  pending[1].reject(new Error('old offline request'));
  await older;
  assert.equal(mgr.getState().status, 'verified');
  const staleSuccess = mgr.load();
  const latest = mgr.load();
  pending[4].resolve({ verified: false });
  await latest;
  pending[3].resolve({ verified: true });
  await staleSuccess;
  assert.equal(mgr.getState().status, 'ineligible');
});

test('real canPublishTalent policy negatives and positives for both roles', async () => {
  // negatives: otherstaff unverified, inactive, mobilefalse
  let mgr = new EligibilityManager(async () => ({ verified: false }), actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 1, role: 'OTHER_STAFF', is_mobile_verified: true, is_active: true });
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, false);

  mgr = new EligibilityManager(async () => ({ verified: true }), actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 1, role: 'OTHER_STAFF', is_mobile_verified: true, is_active: false });
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, false);

  mgr.setUser({ id: 1, role: 'OTHER_STAFF', is_mobile_verified: false, is_active: true });
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, false);

  // negative: pharmacist expired
  mgr = new EligibilityManager(async () => ({ verified: true, ahpra_verified: true, ahpra_expiry_date: '2025-01-01' }), actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 2, role: 'PHARMACIST', is_mobile_verified: true, is_active: true });
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, false);

  // positives: both roles
  mgr = new EligibilityManager(async () => ({ verified: true, ahpra_verified: true, ahpra_expiry_date: '2027-01-01' }), actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 2, role: 'PHARMACIST', is_mobile_verified: true, is_active: true });
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, true);

  mgr = new EligibilityManager(async () => ({ verified: true }), actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 3, role: 'OTHER_STAFF', is_mobile_verified: true, is_active: true });
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, true);
});

test('failed eligibility load captures error without setting false, and retry recovers', async () => {
  let fail = true;
  const mgr = new EligibilityManager(async () => {
    if (fail) throw new Error('Offline');
    return { verified: true, ahpra_verified: true, ahpra_expiry_date: '2027-01-01' };
  }, actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 4, role: 'PHARMACIST', is_mobile_verified: true, is_active: true });
  await mgr.load();
  assert.equal(mgr.getState().status, 'error');
  assert.equal(mgr.getState().staffPublicAccess, null);

  fail = false;
  mgr.retry();
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, true);
});

test('account switch drops in-flight result and hook scopes state to latest user at render', async () => {
  let finishFirst;
  const slow = new Promise((res) => { finishFirst = res; });
  const mgr = new EligibilityManager(async (role) => (role === 'pharmacist' ? slow : { verified: true }), actualPolicy, () => '2026-11-05');
  mgr.setUser({ id: 10, role: 'PHARMACIST', is_mobile_verified: true, is_active: true });
  const p1 = mgr.load();
  mgr.setUser({ id: 20, role: 'OTHER_STAFF', is_mobile_verified: true, is_active: true });
  await mgr.load();
  assert.equal(mgr.getState().staffPublicAccess, true);
  finishFirst({ verified: false });
  await p1;
  assert.equal(mgr.getState().staffPublicAccess, true);

  hookState = { status: 'verified', staffPublicAccess: true, error: null, userKey: computeUserKey({ id: 10, role: 'PHARMACIST', is_mobile_verified: true }) };
  const resB = usePublicAvailabilityEligibility({ id: 20, role: 'OTHER_STAFF', is_mobile_verified: true });
  assert.equal(resB.staffPublicAccess, null);
  assert.equal(resB.status, 'loading');
});
