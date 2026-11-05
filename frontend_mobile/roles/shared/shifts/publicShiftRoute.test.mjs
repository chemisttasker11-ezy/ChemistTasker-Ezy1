import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const result = {};
  vm.runInNewContext(outputText, {
    exports: result,
    URL,
    URLSearchParams,
    require: (name) => imports[name] || {},
  });
  return result;
}

const surface = loadTs('./shiftSurface.ts');
const publicRoute = loadTs('./publicShiftRoute.ts', {
  './shiftSurface': surface,
  '@/utils/mobilePersona': {
    readPersonaSelection: async () => null,
    resolvePersonaSelection: () => ({ mode: 'staff' }),
    getAssignmentPharmacyId: (assignment) => assignment?.pharmacy_id ?? assignment?.pharmacy?.id ?? null,
    getSelectedAdminAssignment: async (user) => user?.admin_assignments?.[0] ?? null,
  },
});

const landing = loadTs('./SharedShiftLandingScreen.tsx', {
  './publicShiftRoute': publicRoute,
  react: { useCallback: () => {}, useEffect: () => {}, useRef: () => ({ current: 0 }), useState: (v) => [v, () => {}] },
  'react-native': { StyleSheet: { create: (s) => s, hairlineWidth: 1 }, useWindowDimensions: () => ({ width: 375 }) },
  'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({}) },
  'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  'lucide-react-native': {},
  '@chemisttasker/shared-core': { getViewSharedShift: async () => ({}) },
  '@/context/AuthContext': { useAuth: () => ({ user: null, isLoading: false, hasCapability: () => false }) },
  '@/context/WorkspaceContext': { useWorkspace: () => ({ isLoading: false, selectedPharmacyId: null }) },
  '@/context/AdminWorkspaceContext': { useAdminCan: () => () => false },
  '@/components/ui': {},
  '@/constants/tokens': {
    colors: {}, font: { outfit: {}, inter: {} }, radius: {}, space: {}, touch: {},
    type: { titleMedium: {}, headlineMedium: {}, bodyMedium: {}, labelLarge: {} },
  },
  './ShiftSummary': { ShiftSummary: () => null },
});

const { isPublicShiftRoute, evaluateRouteDecision, resolvePostAuthShiftRoute, resolvePublicShiftHandoffRoute, buildReferralAuthParams, mapPublicShift } = publicRoute;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('SharedShiftLandingScreen re-exports publicShiftRoute functions', () => {
  assert.equal(typeof landing.isPublicShiftRoute, 'function');
  assert.equal(typeof landing.evaluateRouteDecision, 'function');
  assert.equal(typeof landing.resolvePostAuthShiftRoute, 'function');
  assert.equal(typeof landing.resolvePublicShiftHandoffRoute, 'function');
  assert.equal(typeof landing.buildReferralAuthParams, 'function');
  assert.equal(typeof landing.mapPublicShift, 'function');
});

test('isPublicShiftRoute exact two-segment allowlist rejects nested routes', () => {
  assert.equal(isPublicShiftRoute(['shifts', 'link']), true);
  assert.equal(isPublicShiftRoute(['shifts', 'public-board']), true);

  // Nested segments must be rejected
  assert.equal(isPublicShiftRoute(['shifts', 'link', 'nested']), false);
  assert.equal(isPublicShiftRoute(['shifts', 'public-board', 'extra']), false);
  assert.equal(isPublicShiftRoute(['shifts', 'link', 'sub', 'deep']), false);

  // Single or other routes
  assert.equal(isPublicShiftRoute(['shifts']), false);
  assert.equal(isPublicShiftRoute(['shifts', 'other']), false);
  assert.equal(isPublicShiftRoute(['pharmacist', 'shifts']), false);
  assert.equal(isPublicShiftRoute(['owner', 'dashboard']), false);
  assert.equal(isPublicShiftRoute(['welcome']), false);
  assert.equal(isPublicShiftRoute([]), false);
});

test('route decision: signed-out, signed-in gated, nested rejection, and every persona allowed', () => {
  const cases = [
    ['signed-out public link', { user: null, segments: ['shifts', 'link'] }, { type: 'allow' }],
    ['signed-out public board', { user: null, segments: ['shifts', 'public-board'] }, { type: 'allow' }],
    ['signed-out nested link rejects', { user: null, segments: ['shifts', 'link', 'nested'] }, { type: 'redirect', path: '/login' }],
    ['signed-out nested board rejects', { user: null, segments: ['shifts', 'public-board', 'child'] }, { type: 'redirect', path: '/login' }],
    ['signed-out welcome', { user: null, segments: ['welcome'] }, { type: 'allow' }],
    ['signed-out private pharmacist', { user: null, segments: ['pharmacist', 'shifts'] }, { type: 'redirect', path: '/login' }],
    ['signed-out private owner', { user: null, segments: ['owner', 'dashboard'] }, { type: 'redirect', path: '/login' }],
    ['gated ahpra frozen', { user: { role: 'PHARMACIST', is_mobile_verified: true }, segments: ['shifts', 'link'], ahpra: { frozen: true, state: 'active' } }, { type: 'redirect', path: '/pharmacist/profile-basic-info' }],
    ['gated ahpra refusal', { user: { role: 'OTHER_STAFF', is_mobile_verified: true }, segments: ['shifts', 'public-board'], ahpra: { refusal: true, state: 'active' } }, { type: 'redirect', path: '/otherstaff/profile-regulatory' }],
    ['gated mobile unverified', { user: { role: 'PHARMACIST', is_mobile_verified: false, mobile_check_skipped: false }, segments: ['shifts', 'link'] }, { type: 'redirect', path: '/mobile-verify' }],
    ['allowed mobile skipped', { user: { role: 'PHARMACIST', is_mobile_verified: false, mobile_check_skipped: true }, segments: ['shifts', 'link'] }, { type: 'allow' }],
    ['gated owner setup pending', { user: { role: 'OWNER', is_mobile_verified: true }, segments: ['shifts', 'link'], ownerNextPath: '/setup/owner/step-pharmacies' }, { type: 'redirect', path: '/setup/owner/step-pharmacies' }],
    ['allowed owner setup complete link', { user: { role: 'OWNER', is_mobile_verified: true }, segments: ['shifts', 'link'], ownerNextPath: null }, { type: 'allow' }],
    ['allowed owner setup complete board', { user: { role: 'OWNER', is_mobile_verified: true }, segments: ['shifts', 'public-board'], ownerNextPath: null }, { type: 'allow' }],
    ['signed-in pharmacist nested link rejects', { user: { role: 'PHARMACIST', is_mobile_verified: true }, segments: ['shifts', 'link', 'nested'] }, { type: 'redirect', path: '/pharmacist/dashboard' }],
    ['signed-in owner nested link rejects', { user: { role: 'OWNER', is_mobile_verified: true }, segments: ['shifts', 'link', 'nested'] }, { type: 'redirect', path: '/owner/dashboard' }],
    ['signed-in org nested link rejects', { user: { role: 'ORGANIZATION', is_mobile_verified: true }, segments: ['shifts', 'link', 'nested'] }, { type: 'redirect', path: '/organization/dashboard' }],
    ['signed-in on welcome redirects', { user: { role: 'PHARMACIST', is_mobile_verified: true }, segments: ['welcome'] }, { type: 'redirect', path: '/pharmacist/dashboard' }],
    ['signed-in owner on welcome redirects', { user: { role: 'OWNER', is_mobile_verified: true }, segments: ['welcome'], ownerNextPath: null }, { type: 'redirect', path: '/owner/dashboard' }],
  ];

  // Every persona allowed on both public shift routes once verified
  const allPersonas = [
    'OWNER',
    'ORGANIZATION',
    'ORG_ADMIN',
    'ORG_OWNER',
    'ORG_STAFF',
    'CHIEF_ADMIN',
    'REGION_ADMIN',
    'PHARMACY_MANAGER',
    'PHARMACY_ADMIN',
    'ADMIN',
    'PHARMACIST',
    'OTHER_STAFF',
    'EXPLORER',
  ];

  for (const role of allPersonas) {
    cases.push([`allowed persona ${role} link`, { user: { role, is_mobile_verified: true }, segments: ['shifts', 'link'] }, { type: 'allow' }]);
    cases.push([`allowed persona ${role} board`, { user: { role, is_mobile_verified: true }, segments: ['shifts', 'public-board'] }, { type: 'allow' }]);
  }

  for (const [name, input, expected] of cases) {
    assert.deepEqual(plain(evaluateRouteDecision(input)), expected, name);
  }
});

test('resolvePostAuthShiftRoute targets persona shift detail route', () => {
  const routes = [
    ['PHARMACIST', 101, '/pharmacist/shifts/101'], ['OTHER_STAFF', 102, '/otherstaff/shifts/102'],
    ['EXPLORER', 103, '/explorer/shifts/103'], ['OWNER', 104, '/owner/shifts/104'],
    ['ORGANIZATION', 105, '/organization/shifts/105'], ['ORG_ADMIN', 106, '/organization/shifts/106'],
    ['PHARMACY_MANAGER', 107, '/admin/shifts/107'], [null, 108, '/pharmacist/shifts/108'],
  ];
  for (const [role, id, expected] of routes) {
    assert.equal(resolvePostAuthShiftRoute(role, id), expected);
  }
});

test('resolvePostAuthShiftRoute respects active persona with capability guard', () => {
  // Delegated pharmacist in Admin with MANAGE_ROSTER stays in /admin
  assert.equal(
    resolvePostAuthShiftRoute('PHARMACIST', 201, {
      persona: 'admin',
      adminCan: (capability) => capability === 'MANAGE_ROSTER',
    }),
    '/admin/shifts/201',
  );

  // Delegated pharmacist in Admin without MANAGE_ROSTER falls back to /pharmacist
  assert.equal(
    resolvePostAuthShiftRoute('PHARMACIST', 201, {
      persona: 'admin',
      adminCan: () => false,
    }),
    '/pharmacist/shifts/201',
  );

  // Active persona owner stays in /owner
  assert.equal(
    resolvePostAuthShiftRoute('PHARMACIST', 201, {
      persona: 'owner',
    }),
    '/owner/shifts/201',
  );
});

test('buildReferralAuthParams preserves referral parameters and mapPublicShift normalizes', () => {
  assert.deepEqual(plain(buildReferralAuthParams({ referral_code: 'REF1', referral_event_id: 'EVT1', referral_shift_id: '12', role: 'PHARMACIST' })),
    { referral_code: 'REF1', referral_event_id: 'EVT1', referral_shift_id: '12', role: 'PHARMACIST' });
  assert.deepEqual(plain(buildReferralAuthParams({ referral_code: 'REF2' })), { referral_code: 'REF2' });
  assert.deepEqual(plain(buildReferralAuthParams({})), {});

  const mapped = mapPublicShift({
    id: 55, role_needed: 'PHARMACIST', employment_type: 'LOCUM', rate_type: 'HOURLY', min_hourly_rate: 75,
    post_anonymously: true, slots: [{ id: 1, date: '2026-11-20', start_time: '09:00', end_time: '17:00', rate: 75 }],
    pharmacy_detail: { name: 'Secret Chemist', suburb: 'Richmond', state: 'VIC' },
  });
  assert.equal(mapped.id, 55);
  assert.equal(mapped.roleNeeded, 'PHARMACIST');
  assert.equal(mapped.slots?.[0].rate, 75);
  assert.equal(mapped.uiLocationCity, 'Richmond');
});


test('resolvePublicShiftHandoffRoute: waits for hydration, checks admin assignment and capability, falls back to role', async () => {
  const delegatedAdmin = {
    role: 'PHARMACIST',
    admin_assignments: [{ id: 10, pharmacy_id: 42 }],
  };

  // 1. Not-yet-hydrated: must return null without navigating
  const unhydrated = await resolvePublicShiftHandoffRoute({
    user: delegatedAdmin,
    shiftId: 101,
    isHydrated: false,
    hasCapability: () => true,
    resolvePersona: () => 'admin',
    resolveAdminAssignment: () => ({ id: 10, pharmacy_id: 42 }),
  });
  assert.equal(unhydrated, null, 'must wait for hydration before returning route');

  // 2. Hydrated delegated admin with MANAGE_ROSTER capability routes to /admin/shifts/:id
  const adminWithCap = await resolvePublicShiftHandoffRoute({
    user: delegatedAdmin,
    shiftId: 101,
    isHydrated: true,
    hasCapability: (cap, id) => cap === 'MANAGE_ROSTER' && id === 42,
    resolvePersona: () => 'admin',
    resolveAdminAssignment: () => ({ id: 10, pharmacy_id: 42 }),
  });
  assert.equal(adminWithCap, '/admin/shifts/101', 'delegated admin with MANAGE_ROSTER must route to /admin');

  // 3. Hydrated delegated admin WITHOUT MANAGE_ROSTER falls back to worker route
  const adminWithoutCap = await resolvePublicShiftHandoffRoute({
    user: delegatedAdmin,
    shiftId: 101,
    isHydrated: true,
    hasCapability: () => false,
    resolvePersona: () => 'admin',
    resolveAdminAssignment: () => ({ id: 10, pharmacy_id: 42 }),
  });
  assert.equal(adminWithoutCap, '/pharmacist/shifts/101', 'delegated admin without MANAGE_ROSTER must fall back to /pharmacist');

  // 4. Hydrated owner routes to /owner/shifts/:id
  const ownerRoute = await resolvePublicShiftHandoffRoute({
    user: { role: 'OWNER' },
    shiftId: 102,
    isHydrated: true,
    resolvePersona: () => 'owner',
  });
  assert.equal(ownerRoute, '/owner/shifts/102', 'owner must route to /owner');

  // 5. Hydrated worker routes to /pharmacist/shifts/:id
  const workerRoute = await resolvePublicShiftHandoffRoute({
    user: { role: 'PHARMACIST' },
    shiftId: 103,
    isHydrated: true,
    resolvePersona: () => 'pharmacist',
  });
  assert.equal(workerRoute, '/pharmacist/shifts/103', 'worker must route to /pharmacist');
});