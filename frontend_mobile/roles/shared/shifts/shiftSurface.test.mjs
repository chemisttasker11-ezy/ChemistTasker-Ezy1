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
    require: (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return result;
}

const surface = loadTs('./shiftSurface.ts');
const nav = loadTs('../../../utils/notificationNavigation.ts', { '@/roles/shared/shifts/shiftSurface': surface });
const chat = loadTs('../../../utils/chatRoutes.ts');
const jsx = (type, props) => ({ type, props });
const dashboardScope = loadTs('../dashboard/dashboardScope.tsx', {
  react: {}, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': { StyleSheet: { create: (s) => s } },
  'react-native-paper': {}, 'expo-router': {}, '@chemisttasker/shared-core': { ORG_PORTAL_ROLES: [] },
  '@/context/AuthContext': {}, '@/context/WorkspaceContext': {}, '@/utils/mobilePersona': {},
  '@/roles/shared/forms/UnsavedChangesRegistryProvider': {},
  '@/roles/shared/shifts/shiftSurface': surface,
});
const { resolveShiftSurface, shiftSections, pickShiftSection, parseShiftLink, shiftRoute, shiftPersonaFromPath, shiftPersonaFromRole } = surface;
const plain = (value) => JSON.parse(JSON.stringify(value));
// hasCapability stub: the capabilities the user holds per pharmacy.
const caps = (grants) => (capability, pharmacyId) => Boolean(grants[pharmacyId]?.includes(capability));
// useAdminCan stub: the capabilities held on the active admin pharmacy.
const holds = (...held) => (capability) => held.includes(capability);
const roster = holds('MANAGE_ROSTER');

test('each of the six personas resolves its scope, workspace and rights', () => {
  const owner = resolveShiftSurface({ pathname: '/owner/shifts', role: 'OWNER', userId: 1, selectedPharmacyId: 4 });
  assert.deepEqual(plain(owner), {
    persona: 'owner', scopedPharmacyId: 4, workspace: null, publicOnly: false,
    canManageShifts: true, canManageAdmins: true, ready: true, scopeKey: 'owner:all:4:1',
  });

  const org = { pathname: '/organization/shifts', role: 'ORG_ADMIN', userId: 2, selectedPharmacyId: 9 };
  const orgRoster = resolveShiftSurface({ ...org, orgRoster: true, hasCapability: caps({ 9: ['MANAGE_ADMINS'] }) });
  assert.equal(orgRoster.persona, 'organization');
  assert.equal(orgRoster.scopedPharmacyId, 9);
  assert.equal(orgRoster.canManageShifts, true);
  assert.equal(orgRoster.canManageAdmins, true);
  const orgViewer = resolveShiftSurface({ ...org, orgRoster: false, hasCapability: caps({ 3: ['MANAGE_ADMINS'] }) });
  assert.equal(orgViewer.canManageShifts, false, 'org shifts need manage_roster');
  assert.equal(orgViewer.canManageAdmins, false, 'MANAGE_ADMINS on another pharmacy does not count');

  const admin = resolveShiftSurface({
    pathname: '/admin/shifts', role: 'PHARMACY_ADMIN', userId: 3, selectedPharmacyId: 99, adminPharmacyId: 7,
    hasCapability: caps({ 7: ['MANAGE_ROSTER'], 99: ['MANAGE_ADMINS'] }),
  });
  assert.equal(admin.persona, 'admin');
  assert.equal(admin.scopedPharmacyId, 7, 'admin scope is the active assignment, not WorkspaceContext');
  assert.equal(admin.canManageShifts, true);
  assert.equal(admin.canManageAdmins, false);
  assert.equal(admin.workspace, null);

  for (const persona of ['pharmacist', 'otherstaff']) {
    const role = persona === 'pharmacist' ? 'PHARMACIST' : 'OTHER_STAFF';
    const base = { pathname: `/${persona}/shifts`, role, userId: 5, selectedPharmacyId: 4 };
    const platform = resolveShiftSurface({ ...base, workspace: 'platform', canUsePlatform: true });
    assert.equal(platform.workspace, 'platform');
    assert.equal(platform.scopedPharmacyId, null, 'workers are not pharmacy-scoped');
    assert.equal(platform.canManageShifts, false);
    assert.equal(platform.publicOnly, false);
    assert.equal(platform.scopeKey, `${persona}:platform:all:5`);
    assert.equal(resolveShiftSurface({ ...base, workspace: 'internal', canUsePlatform: true }).workspace, 'internal');
    assert.equal(resolveShiftSurface({ ...base, workspace: 'platform', canUsePlatform: false }).workspace, 'internal');
  }

  const explorer = resolveShiftSurface({ pathname: '/explorer/shifts', role: 'EXPLORER', userId: 6, workspace: 'internal' });
  assert.equal(explorer.persona, 'explorer');
  assert.equal(explorer.workspace, 'platform');
  assert.equal(explorer.publicOnly, true);
  assert.equal(explorer.canManageShifts, false);
});

test('a delegated admin (role PHARMACIST) in /admin is an admin with the assignment rights', () => {
  const input = {
    pathname: '/admin/shifts/12', role: 'PHARMACIST', userId: 8, workspace: 'platform', canUsePlatform: true,
    adminPharmacyId: 7, hasCapability: caps({ 7: ['MANAGE_ROSTER', 'MANAGE_ADMINS'] }),
  };
  const delegated = resolveShiftSurface(input);
  assert.equal(delegated.persona, 'admin');
  assert.equal(delegated.scopedPharmacyId, 7);
  assert.equal(delegated.workspace, null);
  assert.equal(delegated.canManageShifts, true);
  assert.equal(delegated.canManageAdmins, true);
  assert.equal(delegated.scopeKey, 'admin:all:7:8');
  // Same user in their own shell: a worker again (route wins over role, role only when the route names no persona).
  assert.equal(resolveShiftSurface({ ...input, pathname: '/pharmacist/shifts' }).persona, 'pharmacist');
  assert.equal(resolveShiftSurface({ ...input, pathname: '/notifications' }).persona, 'pharmacist');
  // Without MANAGE_ROSTER on the active pharmacy there is no shift management.
  assert.equal(resolveShiftSurface({ ...input, hasCapability: caps({ 7: ['MANAGE_STAFF'] }) }).canManageShifts, false);
  assert.equal(resolveShiftSurface({ ...input, adminPharmacyId: null }).canManageShifts, false);
});

test('the surface waits for the workspace and the admin assignment; scope keys differ per scope', () => {
  assert.equal(resolveShiftSurface({ pathname: '/owner/shifts', workspaceLoading: true }).ready, false);
  assert.equal(resolveShiftSurface({ pathname: '/admin/shifts', adminLoading: true }).ready, false);
  assert.equal(resolveShiftSurface({ pathname: '/owner/shifts', adminLoading: true }).ready, true);
  const a = resolveShiftSurface({ pathname: '/owner/shifts', userId: 1, selectedPharmacyId: 4 }).scopeKey;
  const b = resolveShiftSurface({ pathname: '/owner/shifts', userId: 1, selectedPharmacyId: 5 }).scopeKey;
  const c = resolveShiftSurface({ pathname: '/owner/shifts', userId: 1, selectedPharmacyId: null }).scopeKey;
  assert.equal(new Set([a, b, c]).size, 3);
});

test('persona from the route and from the role', () => {
  assert.equal(shiftPersonaFromPath('/admin/notifications?x=1'), 'admin');
  assert.equal(shiftPersonaFromPath('/notifications'), null);
  assert.equal(shiftPersonaFromPath(''), null);
  const roles = { OWNER: 'owner', PHARMACIST: 'pharmacist', OTHER_STAFF: 'otherstaff', EXPLORER: 'explorer', ORG_ADMIN: 'organization', CHIEF_ADMIN: 'organization', PHARMACY_ADMIN: 'admin', admin: 'admin', NOPE: null };
  for (const [role, persona] of Object.entries(roles)) assert.equal(shiftPersonaFromRole(role), persona, role);
});

test('sections per persona, and a stale ?section= falls back to the first', () => {
  for (const persona of ['owner', 'organization', 'admin']) assert.deepEqual(Array.from(shiftSections({ persona, workspace: null })), ['active', 'confirmed', 'history']);
  assert.deepEqual(Array.from(shiftSections({ persona: 'pharmacist', workspace: 'platform' })), ['public', 'confirmed', 'history']);
  assert.deepEqual(Array.from(shiftSections({ persona: 'otherstaff', workspace: 'internal' })), ['community', 'confirmed', 'history']);
  assert.deepEqual(Array.from(shiftSections({ persona: 'explorer', workspace: 'platform' })), ['public', 'community', 'confirmed', 'history']);
  assert.deepEqual(Array.from(shiftSections({ persona: null, workspace: null })), []);
  assert.equal(pickShiftSection(['active', 'confirmed'], 'Confirmed'), 'confirmed');
  assert.equal(pickShiftSection(['active', 'confirmed'], 'public'), 'active');
  assert.equal(pickShiftSection([], 'active'), null);
});

test('web shift links parse to persona, section and id; anything else is not a shift link', () => {
  assert.deepEqual(plain(parseShiftLink('https://app.chemisttasker.com.au/dashboard/owner/shifts/12?x=1#a')), { persona: 'owner', section: null, shiftId: 12, suffix: '?x=1#a' });
  assert.deepEqual(plain(parseShiftLink('/dashboard/admin/7/shift-center/active/12')), { persona: 'admin', section: 'active', shiftId: 12, suffix: '' });
  assert.deepEqual(plain(parseShiftLink('/dashboard/organization/shift-center/confirmed')), { persona: 'organization', section: 'confirmed', shiftId: null, suffix: '' });
  assert.deepEqual(plain(parseShiftLink('/dashboard/pharmacist/shifts?tab=accepted&shift_id=3')), { persona: 'pharmacist', section: null, shiftId: null, suffix: '?tab=accepted&shift_id=3' });
  for (const url of ['/dashboard/owner/shifts/create', '/dashboard/owner/shifts/12/applications', '/dashboard/owner/invoice/12', '/dashboard/pharmacy-hub', null, 'javascript:alert(1)']) {
    assert.equal(parseShiftLink(url), null, String(url));
  }
});

test('shift routes keep the query, add ?section=, and send worker roster links to /my-roster', () => {
  assert.equal(shiftRoute('owner', { shiftId: 12, suffix: '?a=1' }), '/owner/shifts/12?a=1');
  assert.equal(shiftRoute('admin', { section: 'active', suffix: '' }), '/admin/shifts?section=active');
  assert.equal(shiftRoute('owner', { section: 'history', suffix: '?a=1#b' }), '/owner/shifts?a=1&section=history#b');
  assert.equal(shiftRoute('owner', { section: 'history', suffix: '?section=active' }), '/owner/shifts?section=active');
  assert.equal(shiftRoute('pharmacist', { section: 'roster', suffix: '' }), '/my-roster');
  assert.equal(shiftRoute('otherstaff', { section: 'roster', suffix: '?d=1' }), '/my-roster?d=1');
  assert.equal(shiftRoute('owner', { section: 'roster', suffix: '' }), '/owner/shifts');
  assert.equal(shiftRoute('explorer', {}), '/explorer/shifts');
});

test('notification taps: the active shell beats the role, the role beats the URL slug', () => {
  const route = nav.resolveShiftNotificationRoute;
  const ownerLink = '/dashboard/owner/shifts/12';
  // Delegated admin in /admin/notifications stays in /admin; in their own shell they are a pharmacist.
  assert.equal(route({ actionUrl: ownerLink, userRole: 'PHARMACIST', persona: 'admin', adminCan: roster }), '/admin/shifts/12');
  assert.equal(route({ actionUrl: ownerLink, userRole: 'PHARMACIST' }), '/pharmacist/shifts/12');
  assert.equal(route({ actionUrl: ownerLink }), '/owner/shifts/12');
  assert.equal(route({ actionUrl: '/dashboard/admin/7/shifts/12', persona: 'admin', adminCan: roster }), '/admin/shifts/12');
  assert.equal(route({ actionUrl: '/dashboard/admin/7/shifts/12' }), '/admin/shifts/12');
  for (const persona of ['owner', 'organization', 'admin', 'pharmacist', 'otherstaff', 'explorer']) {
    assert.equal(route({ actionUrl: `/dashboard/${persona === 'admin' ? 'admin/7' : persona}/shifts/5`, persona, adminCan: roster }), `/${persona}/shifts/5`);
  }
  // Payload-only notifications still open the shift.
  assert.equal(route({ payload: { shift_id: '44' }, userRole: 'OWNER' }), '/owner/shifts/44');
  assert.equal(route({ payload: { shift_id: 44 } }), null);
});

test('notification taps: offers, sections and the backend link shapes', () => {
  const route = nav.resolveShiftNotificationRoute;
  const offer = '/dashboard/pharmacist/shifts?tab=accepted&shift_id=12&offer_id=9';
  assert.equal(route({ actionUrl: offer, userRole: 'PHARMACIST' }), '/pharmacist/shifts?tab=accepted&shift_id=12&offer_id=9');
  assert.equal(route({ actionUrl: offer, userRole: 'EXPLORER', persona: 'explorer' }), '/explorer/shifts?tab=accepted&shift_id=12&offer_id=9');
  // Posters never get the worker offers tab; the shift opens.
  assert.equal(route({ actionUrl: offer, persona: 'owner' }), '/owner/shifts/12');
  assert.equal(route({ payload: { offer_id: 9 }, userRole: 'OTHER_STAFF' }), '/otherstaff/shifts?tab=accepted&offer_id=9');
  assert.equal(route({ actionUrl: '/dashboard/owner/shifts/active/12', userRole: 'OWNER' }), '/owner/shifts/12');
  assert.equal(route({ actionUrl: '/dashboard/owner/shift-center/active', userRole: 'OWNER' }), '/owner/shifts?section=active');
  assert.equal(route({ actionUrl: '/dashboard/admin/7/shift-center/confirmed', persona: 'admin', adminCan: roster }), '/admin/shifts?section=confirmed');
  assert.equal(route({ actionUrl: '/dashboard/pharmacist/shifts/roster', userRole: 'PHARMACIST' }), '/my-roster');
  assert.equal(route({ actionUrl: '/dashboard/owner/shifts', userRole: 'OWNER' }), '/owner/shifts');
  assert.equal(route({ actionUrl: '/dashboard/owner/invoice/3', userRole: 'OWNER' }), null);
});

test('chat thread routes follow the active shell, then the role', () => {
  assert.equal(chat.getMessageDetailRoute('PHARMACIST', 5, 'admin'), '/admin/messages/5');
  assert.equal(chat.getMessageDetailRoute('PHARMACIST', 5), '/pharmacist/messages/5');
  assert.equal(chat.getMessageDetailRoute('PHARMACIST', 5, null), '/pharmacist/messages/5');
  assert.equal(chat.getMessageDetailRoute('ORG_STAFF', 5), '/organization/messages/5');
  assert.equal(chat.getMessageDetailRoute(null, 5), '/shared/messages/5');
});

test('dashboard activity shift links reach the native Shifts screen', () => {
  const { activityRoute } = dashboardScope;
  assert.equal(activityRoute({ action_url: '/dashboard/owner/shift-center/active' }, 'owner'), '/owner/shifts?section=active');
  assert.equal(activityRoute({ action_url: '/dashboard/owner/shift-center' }, 'admin'), '/admin/shifts');
  assert.equal(activityRoute({ action_url: '/dashboard/admin/7/shift-center/history/3' }, 'admin'), '/admin/shifts/3');
  assert.equal(activityRoute({ action_url: 'https://x.au/dashboard/organization/shifts/confirmed?p=1' }, 'organization'), '/organization/shifts?p=1&section=confirmed');
  assert.equal(activityRoute({ action_url: '/dashboard/otherstaff/shifts/roster' }, 'otherstaff'), '/my-roster');
  // Non-shift and deeper shift paths keep the existing role mapping.
  assert.equal(activityRoute({ action_url: '/dashboard/owner/shifts/12/applications' }, 'owner'), '/owner/shifts/12/applications');
  assert.equal(activityRoute({ action_url: '/dashboard/owner/invoice/12' }, 'admin'), '/admin/invoice/12');
});

test('every push listener and the Notifications screen pass the active shell to both route helpers', () => {
  const files = ['owner', 'organization', 'pharmacist', 'otherstaff', 'explorer'].map((p) => `../../../app/${p}/_layout.tsx`);
  for (const file of [...files, '../../../features/notifications/NotificationsScreen.tsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    const chatCalls = src.match(/getMessageDetailRoute\([^)]*\)/g) ?? [];
    assert.ok(chatCalls.length > 0, `${file}: no chat route call`);
    for (const call of chatCalls) assert.match(call, /,\s*persona\)$/, `${file}: ${call}`);
    for (const [, body] of src.matchAll(/resolve(?:Calendar|Shift)NotificationRoute\(\{([^}]*)\}\)/g)) {
      assert.match(body, /\bpersona\b/, `${file}: route helper call without persona`);
      assert.match(body, /\badminCan\b/, `${file}: route helper call without adminCan`);
    }
    if (file.includes('/app/')) assert.match(src, /const persona = shiftPersonaFromPath\(pathname\) \?\? '\w+';/, file);
  }
  // What a listener passes decides the shell: a delegated admin (role PHARMACIST) in /admin stays there.
  assert.equal(nav.resolveCalendarNotificationRoute({ payload: { date: '2026-11-05' }, userRole: 'PHARMACIST', persona: 'admin', adminCan: holds('MANAGE_COMMUNICATIONS') }), '/admin/calendar?date=2026-11-05');
  assert.equal(nav.resolveCalendarNotificationRoute({ payload: { date: '2026-11-05' }, userRole: 'PHARMACIST' }), '/pharmacist/calendar?date=2026-11-05');
  assert.equal(nav.resolveShiftNotificationRoute({ payload: { shift_id: 4 }, userRole: 'OWNER', persona: 'organization' }), '/organization/shifts/4');
});

test('notification taps: /admin wins only when its route guard lets the delegated admin in', () => {
  const shift = nav.resolveShiftNotificationRoute;
  const calendar = nav.resolveCalendarNotificationRoute;
  const own = { payload: { shift_id: 12 }, userRole: 'PHARMACIST', persona: 'admin' };
  // Without MANAGE_ROSTER /admin/shifts bounces to /admin: their own shift opens in the pharmacist shell.
  assert.equal(shift({ ...own, adminCan: holds('MANAGE_STAFF', 'MANAGE_ADMINS') }), '/pharmacist/shifts/12');
  assert.equal(shift({ ...own }), '/pharmacist/shifts/12');
  assert.equal(shift({ ...own, adminCan: roster }), '/admin/shifts/12');
  assert.equal(shift({ actionUrl: '/dashboard/owner/shift-center/active', userRole: 'OWNER', persona: 'admin', adminCan: holds() }), '/owner/shifts?section=active');
  // Calendar: MANAGE_COMMUNICATIONS, MANAGE_STAFF or MANAGE_ROSTER; a MANAGE_ADMINS-only admin keeps their own calendar.
  const note = { payload: { date: '2026-11-05' }, userRole: 'PHARMACIST', persona: 'admin' };
  assert.equal(calendar({ ...note, adminCan: holds('MANAGE_ADMINS') }), '/pharmacist/calendar?date=2026-11-05');
  for (const capability of ['MANAGE_COMMUNICATIONS', 'MANAGE_STAFF', 'MANAGE_ROSTER']) {
    assert.equal(calendar({ ...note, adminCan: holds(capability) }), '/admin/calendar?date=2026-11-05', capability);
  }
  // Other shells carry no admin guard.
  assert.equal(shift({ payload: { shift_id: 4 }, userRole: 'OWNER', persona: 'organization', adminCan: holds() }), '/organization/shifts/4');
  // Organization roles without admin calendar rights keep the organization calendar.
  for (const userRole of ['CHIEF_ADMIN', 'REGION_ADMIN', 'ORG_ADMIN']) {
    assert.equal(calendar({ ...note, userRole, adminCan: holds('MANAGE_ADMINS') }), '/organization/calendar?date=2026-11-05', userRole);
  }
});

test('the organization listener opens the resolved route as is (a pharmacist member keeps /pharmacist/...)', () => {
  const src = readFileSync(new URL('../../../app/organization/_layout.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /inShell/);
  assert.doesNotMatch(src, /'\/organization\/shifts' as any/);
});

test('shift notifications open the shift, calendar-only notifications open the calendar', () => {
  const calendar = nav.resolveCalendarNotificationRoute;
  const shift = nav.resolveShiftNotificationRoute;
  // Backend shift cancellation: shift_id + date.
  const cancelled = { shift_id: 12, date: '2026-11-05' };
  assert.equal(calendar({ payload: cancelled, userRole: 'PHARMACIST' }), null);
  assert.equal(shift({ payload: cancelled, userRole: 'PHARMACIST' }), '/pharmacist/shifts/12');
  assert.equal(calendar({ payload: { shiftId: '12', date: '2026-11-05' }, persona: 'owner' }), null);
  assert.equal(calendar({ payload: { offer_id: 9, date: '2026-11-05' }, userRole: 'OTHER_STAFF' }), null);
  assert.equal(calendar({ actionUrl: '/dashboard/owner/shifts/12', payload: { date: '2026-11-05' }, userRole: 'OWNER' }), null);
  // Calendar-only, and an explicit calendar link even when the payload names a shift.
  assert.equal(calendar({ payload: { date: '2026-11-05', pharmacy_id: 3 }, userRole: 'OWNER' }), '/owner/calendar?pharmacy_id=3&date=2026-11-05');
  assert.equal(calendar({ payload: { note_id: 7 }, persona: 'organization' }), '/organization/calendar?note_id=7');
  assert.equal(calendar({ actionUrl: '/dashboard/calendar?date=2026-11-05', payload: { shift_id: 12 }, persona: 'pharmacist' }), '/pharmacist/calendar?date=2026-11-05');
});

test('shift notification routes keep the incoming query, merging the offer params', () => {
  const route = nav.resolveShiftNotificationRoute;
  assert.equal(route({ actionUrl: '/dashboard/pharmacist/shifts?tab=accepted&shift_id=12&offer_id=9&ref=push#top', persona: 'pharmacist' }), '/pharmacist/shifts?tab=accepted&shift_id=12&offer_id=9&ref=push#top');
  assert.equal(route({ actionUrl: '/dashboard/pharmacist/shifts/community?ref=push', payload: { offer_id: 9 }, persona: 'pharmacist' }), '/pharmacist/shifts?ref=push&tab=accepted&offer_id=9&section=community');
  assert.equal(route({ actionUrl: '/dashboard/owner/shifts/12?tab=applications', persona: 'owner' }), '/owner/shifts/12?tab=applications');
  assert.equal(route({ actionUrl: '/dashboard/admin/7/shift-center/active/12?x=1#a', persona: 'admin', adminCan: roster }), '/admin/shifts/12?x=1#a');
  assert.equal(route({ actionUrl: '/dashboard/owner/shift-center/history?p=2', persona: 'owner' }), '/owner/shifts?p=2&section=history');
});

test('slot rates: hourly employee contracts disclose each rate, annual packages do not', () => {
  const native = { StyleSheet: { create: (s) => s, hairlineWidth: 1 }, Platform: { OS: 'ios' } };
  const tokens = loadTs('../../../constants/tokens.ts', { 'react-native': native });
  const rates = loadTs('./ShiftsBoard/utils/rates.ts', { 'date-fns': { getDay: (d) => d.getDay() } });
  const { slotRateText } = loadTs('./ShiftSummary.tsx', {
    react: { memo: (c) => c }, 'react-native': native, 'lucide-react-native': {}, '@chemisttasker/shared-core/skills_registry.json': {},
    '@chemisttasker/shared-core': {}, '@/components/ui': {}, '@/constants/tokens': tokens, '@/roles/shared/dashboard/managerHomeLogic': {},
    './ShiftsBoard/utils/rates': rates, './ShiftsBoard/utils/shift': {}, './ShiftTermsSummary': {}, 'react/jsx-runtime': { jsx, jsxs: jsx },
  });
  assert.equal(slotRateText(52, { employmentType: 'FULL_TIME', rateType: 'FIXED' }, true), '$52/hr');
  assert.equal(slotRateText(48.5, { employmentType: 'PART_TIME', minHourlyRate: 45 }, true), '$48.5/hr');
  assert.equal(slotRateText(52, { employmentType: 'FULL_TIME', minAnnualSalary: '95000' }, true), null);
  assert.equal(slotRateText(0, { employmentType: 'PART_TIME', maxAnnualSalary: 80000 }, true), null);
  assert.equal(slotRateText(60, { employmentType: 'LOCUM' }, true), '$60/hr');
  assert.equal(slotRateText(60, { employmentType: 'LOCUM' }, false), null);
  assert.equal(slotRateText(0, { employmentType: 'LOCUM', rateType: 'PHARMACIST_PROVIDED' }, true), 'Your rate');
  // The API sends decimals as strings: "0.00" is no package (getRateSummary reads it with Number too).
  assert.equal(slotRateText(52, { employmentType: 'FULL_TIME', minAnnualSalary: '0.00', maxAnnualSalary: '0.00' }, true), '$52/hr');
  assert.equal(slotRateText(52, { employmentType: 'PART_TIME', minAnnualSalary: '0.00', maxAnnualSalary: null }, true), '$52/hr');
  assert.equal(slotRateText(52, { employmentType: 'FULL_TIME', minAnnualSalary: '0.00', maxAnnualSalary: '90000.00' }, true), null);
});
