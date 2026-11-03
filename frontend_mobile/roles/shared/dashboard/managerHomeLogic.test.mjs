import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('./managerHomeLogic.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const exports = {};
vm.runInNewContext(outputText, { exports });
// Arrays come from the vm realm; Array.from rebuilds them here so deepEqual compares values.
const list = (rows, pick) => Array.from(rows, pick);
const { openSlots, weekCover, pharmacyGaps, needsManager, applicantCount, firstStep, ownerStep, organizationStep, adminStep, formatDay, formatTime, timeRange, roleWord } = exports;

function loadTs(path, imports) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const result = {};
  vm.runInNewContext(outputText, {
    exports: result,
    require: (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return result;
}

const jsx = (type, props) => ({ type, props });
const native = { StyleSheet: { create: (styles) => styles, hairlineWidth: 1 }, Platform: { OS: 'ios' } };
const tokens = loadTs('../../../constants/tokens.ts', { 'react-native': native });
const managerHome = (api) => loadTs('./ManagerHome.tsx', {
  react: {}, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, 'lucide-react-native': {},
  '@chemisttasker/shared-core': api, '@/components/ui': {}, '@/constants/tokens': tokens, './managerHomeLogic': exports,
});

const now = new Date(2026, 10, 4, 10, 0); // Wed 4 Nov 2026, 10am
const shifts = [
  {
    id: 1, pharmacyId: 7, pharmacyName: 'Bondi',
    slots: [
      { id: 11, date: '2026-11-04', startTime: '08:00:00', endTime: '09:00:00' }, // ended
      { id: 12, date: '2026-11-04', startTime: '09:00:00', endTime: '17:00:00' }, // in progress, booked
      { id: 13, date: '2026-11-06', startTime: '09:00:00', endTime: '17:00:00' }, // open
      { id: 14, date: '2026-11-05', startTime: '09:00:00', endTime: '17:00:00', awaitingPayment: true },
      { id: 15, date: '2026-11-20', startTime: '09:00:00', endTime: '17:00:00' }, // booked, past the week
    ],
    slotAssignments: [
      { slotId: 12, user: { firstName: 'Omar', lastName: 'Khan', name: 'omar@example.test', profilePhotoUrl: 'https://example.test/omar.jpg' } },
      { slotId: 15, user: { name: 'Sara Lee' } },
    ],
  },
  { id: 2, pharmacy: 8, pharmacyDetail: { name: 'Manly' }, slots: [{ id: 21, date: '2026-11-05', startTime: '22:00', endTime: '06:00' }] },
];

test('open slots skip ended, booked and awaiting-payment slots, soonest first', () => {
  assert.deepEqual(list(openSlots(shifts, now), (row) => row.shiftId + ':' + row.date), ['2:2026-11-05', '1:2026-11-06']);
  assert.deepEqual(list(openSlots(shifts, now, 8), (row) => row.pharmacyName), ['Manly']);
});

test('week cover names the person, in progress included, beyond the week excluded', () => {
  const rows = weekCover(shifts, now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Omar Khan');
  assert.equal(rows[0].photoUrl, 'https://example.test/omar.jpg');
  assert.equal(weekCover(shifts, now, 30)[1].name, 'Sara Lee');
});

test('pharmacy gaps sort by open slots then name', () => {
  const rows = pharmacyGaps([{ id: 9, name: 'Avalon' }, { id: 8, name: 'Manly' }, { id: 7, name: 'Bondi' }], openSlots(shifts, now));
  assert.deepEqual(list(rows, (row) => `${row.name}:${row.open}`), ['Bondi:1', 'Manly:1', 'Avalon:0']);
});

test('counts and first step', () => {
  assert.equal(needsManager('submitted'), true);
  assert.equal(needsManager('APPROVED'), false);
  assert.equal(applicantCount([{}, {}], [{ status: 'PENDING' }, { status: 'REJECTED' }, {}]), 4);
  assert.equal(firstStep(null, false, undefined, 'b', 'c'), 'b');
  assert.equal(firstStep(null, false), null);
});

const fullAccess = { roster: true, attendance: true, pharmacies: true, invite: true, comms: true };
const noAccess = { roster: false, attendance: false, pharmacies: false, invite: false, comms: false };
const competing = {
  setup: true, invitations: true, payment: true, applicants: true, urgentGap: true, gap: true,
  attendance: true, timesheets: true, can: fullAccess,
};

test('actual owner selector: setup, invitations, payment, applicants, urgent cover, attendance, timesheets, post', () => {
  const triggers = { ...competing };
  for (const [trigger, key] of [
    ['setup', 'setup'], ['invitations', 'invitations'], ['payment', 'payment'], ['applicants', 'applicants'],
    ['urgentGap', 'gap'], ['attendance', 'attendance'], ['timesheets', 'timesheets'],
  ]) {
    assert.equal(ownerStep(triggers), key);
    triggers[trigger] = false;
  }
  assert.equal(ownerStep(triggers), 'post');
});

test('actual organization selector: invitations, applicants, cover, attendance, timesheets, then permitted fallback', () => {
  const triggers = { ...competing };
  for (const [trigger, key] of [
    ['invitations', 'invitations'], ['applicants', 'applicants'], ['gap', 'gap'],
    ['attendance', 'attendance'], ['timesheets', 'timesheets'],
  ]) {
    assert.equal(organizationStep(triggers), key);
    triggers[trigger] = false;
  }
  assert.equal(organizationStep(triggers), 'post');
  assert.equal(organizationStep({ ...competing, can: noAccess }), 'invitations');
  assert.equal(organizationStep({ ...competing, invitations: false, can: noAccess }), 'profile');
  for (const [capability, key] of [['pharmacies', 'pharmacies'], ['invite', 'invite'], ['comms', 'chat']]) {
    assert.equal(organizationStep({ ...competing, invitations: false, can: { ...noAccess, [capability]: true } }), key);
  }
  assert.equal(organizationStep({ ...competing, invitations: false, can: { ...noAccess, attendance: true } }), 'attendance');
});

test('actual admin selector: invitations, attendance, cover, timesheets, post; current permissions gate every candidate', () => {
  const triggers = { ...competing };
  for (const [trigger, key] of [
    ['invitations', 'invitations'], ['attendance', 'attendance'], ['gap', 'gap'], ['timesheets', 'timesheets'],
  ]) {
    assert.equal(adminStep(triggers), key);
    triggers[trigger] = false;
  }
  assert.equal(adminStep(triggers), 'post');
  assert.equal(adminStep({ ...competing, invitations: false, can: noAccess }), 'chat');
  assert.equal(adminStep({ ...competing, invitations: false, can: { ...noAccess, comms: true } }), 'hub');
  assert.equal(adminStep({ ...competing, invitations: false, can: { ...noAccess, roster: true } }), 'gap');
});

test('the same competing triggers distinguish every persona pair, so swapping their priorities fails', () => {
  const paymentAndApplicants = { ...competing, setup: false, invitations: false };
  assert.equal(ownerStep(paymentAndApplicants), 'payment');
  assert.equal(organizationStep(paymentAndApplicants), 'applicants');
  assert.equal(adminStep(paymentAndApplicants), 'attendance');
  const coverAndAttendance = { ...paymentAndApplicants, payment: false, applicants: false };
  assert.equal(ownerStep(coverAndAttendance), 'gap');
  assert.equal(organizationStep(coverAndAttendance), 'gap');
  assert.equal(adminStep(coverAndAttendance), 'attendance');
});

test('legacy organization role never grants Invite; roster-only retains its own permissions', () => {
  const { orgCapabilities } = managerHome({ getOrganizationMembership: (user) => user.membership });
  assert.equal(orgCapabilities({ role: 'ORGANIZATION' }).invite, false);
  const rosterOnly = orgCapabilities({ role: 'ORGANIZATION', membership: { capabilities: ['MANAGE_ROSTER'] } });
  assert.equal(rosterOnly.roster, true);
  assert.equal(rosterOnly.pharmacies, false);
  assert.equal(rosterOnly.invite, false);
  assert.equal(orgCapabilities({ membership: { capabilities: ['invite_staff'] } }).invite, true);
  const allowed = orgCapabilities({ membership: { capabilities: ['invite_staff', 'view_all_pharmacies'] } });
  assert.equal(allowed.invite, true);
  assert.equal(allowed.pharmacies, true);
});

const dashboardScope = loadTs('./dashboardScope.tsx', {
  react: {}, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
  'react-native-paper': {}, 'expo-router': {}, '@chemisttasker/shared-core': { ORG_PORTAL_ROLES: [] },
  '@/context/AuthContext': {}, '@/context/WorkspaceContext': {}, '@/utils/mobilePersona': {},
  '@/roles/shared/forms/UnsavedChangesRegistryProvider': {},
});

test('dashboard response decisions require both the latest request and the selected scope', () => {
  const request = { scopeKey: 'internal:1', generation: 2 };
  assert.equal(dashboardScope.isCurrentDashboardRequest(request, { ...request }), true);
  assert.equal(dashboardScope.isCurrentDashboardRequest(request, { ...request, generation: 3 }), false);
  assert.equal(dashboardScope.isCurrentDashboardRequest(request, { ...request, scopeKey: 'internal:2' }), false);
  assert.equal(dashboardScope.isCurrentDashboardRequest(request, { ...request, scopeKey: 'platform:null' }), false);
});

test('single-pharmacy default preserves many-pharmacy, organization, explicit and platform scopes', () => {
  const pharmacy = { id: 1, name: 'A' };
  const decide = dashboardScope.singlePharmacyDefault;
  assert.equal(decide([pharmacy], null, 'internal', false), pharmacy);
  assert.equal(decide([], null, 'internal', false), null);
  assert.equal(decide([pharmacy, { id: 2, name: 'B' }], null, 'internal', false), null);
  assert.equal(decide([pharmacy], null, 'internal', true), null);
  assert.equal(decide([pharmacy], 2, 'internal', false), null);
  assert.equal(decide([pharmacy], null, 'platform', false), null);
});

function scopedDashboardHook({ role = 'OWNER', pharmacyId = 1, pharmacies = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] } = {}) {
  const refs = [];
  let cursor = 0;
  let cleanup;
  const pending = [];
  const writes = [];
  const user = { id: 7, role, pharmacies };
  const workspace = {
    workspace: 'internal', selectedPharmacyId: pharmacyId, selectedPharmacyName: pharmacyId === 1 ? 'A' : null,
    canUsePlatform: true, isLoading: false,
  };
  for (const [setter, key] of [
    ['setWorkspace', 'workspace'], ['setSelectedPharmacyId', 'selectedPharmacyId'], ['setSelectedPharmacyName', 'selectedPharmacyName'],
  ]) workspace[setter] = (value) => { workspace[key] = value; writes.push([key, value]); };
  const read = (params) => new Promise((resolve, reject) => pending.push({ params, resolve, reject }));
  const hook = loadTs('./dashboardScope.tsx', {
    react: {
      useState: (initial) => [initial, () => {}], useMemo: (fn) => fn(), useCallback: (fn) => fn,
      useRef: (initial) => refs[cursor++] ??= { current: initial },
      useEffect: (effect, deps) => { if (deps.length === 0 && !cleanup) cleanup = effect(); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, 'react-native-paper': {}, 'expo-router': {},
    '@chemisttasker/shared-core': {
      ORG_PORTAL_ROLES: ['ORGANIZATION'], getOrganizationMembership: () => ({ organization_id: 8 }),
      getOwnerDashboard: read, getPharmacistDashboard: read, getOtherStaffDashboard: read,
      getOrganizationDashboard: (_id, params) => read(params),
    },
    '@/context/AuthContext': { useAuth: () => ({ user }) }, '@/context/WorkspaceContext': { useWorkspace: () => workspace },
    '@/utils/mobilePersona': {}, '@/roles/shared/forms/UnsavedChangesRegistryProvider': {},
  });
  return {
    pending, workspace, writes,
    render: () => { cursor = 0; return hook.useScopedDashboard(); },
    unmount: () => cleanup(),
  };
}

const forbidden = { response: { status: 403 } };

test('null backend selection defaults a sole pharmacy only while its request and scope are current', async () => {
  for (const choice of ['none', 'local', 'shell', 'refresh', 'unmount']) {
    const h = scopedDashboardHook({ pharmacyId: null, pharmacies: [{ id: 1, name: 'A' }] });
    h.workspace.isLoading = true;
    assert.equal(await h.render().fetchDashboard(), null);
    assert.equal(h.pending.length, 0);
    assert.deepEqual(h.writes, []);
    h.workspace.isLoading = false;
    const scope = h.render();
    const request = scope.fetchDashboard();
    assert.equal(h.pending[0].params.pharmacy_id, undefined);
    let refresh;
    if (choice === 'local') scope.selectPharmacy({ id: 2, name: 'B' });
    if (choice === 'shell') {
      Object.assign(h.workspace, { selectedPharmacyId: 2, selectedPharmacyName: 'B' });
      h.render();
    }
    if (choice === 'refresh') refresh = scope.fetchDashboard();
    if (choice === 'unmount') h.unmount();
    const writes = [...h.writes];
    h.pending[0].resolve({ selected_pharmacy: null });
    await request;
    if (choice === 'none') {
      assert.equal(h.workspace.selectedPharmacyId, 1);
      assert.equal(h.workspace.selectedPharmacyName, 'A');
    } else {
      assert.deepEqual(h.writes, writes);
    }
    if (refresh) {
      h.pending[1].resolve({ selected_pharmacy: null });
      await refresh;
      assert.equal(h.workspace.selectedPharmacyId, 1);
    }
  }
});

test('late success and 403 cannot undo a shell picker selection, even before its new load starts', async () => {
  for (const role of ['OWNER', 'ORGANIZATION', 'PHARMACIST', 'OTHER_STAFF']) {
    for (const pharmacyId of [null, 1]) {
      for (const fail of [false, true]) {
        const h = scopedDashboardHook({ role, pharmacyId });
        const request = h.render().fetchDashboard();
        // Another hook instance owns the shell picker; its context change re-renders this instance.
        Object.assign(h.workspace, { selectedPharmacyId: 2, selectedPharmacyName: 'B' });
        h.render();
        if (fail) {
          h.pending[0].reject(forbidden);
          await assert.rejects(request, (error) => error === forbidden);
        } else {
          const payload = { selected_pharmacy: { id: 1, name: 'A' } };
          h.pending[0].resolve(payload);
          assert.equal(await request, payload);
        }
        assert.equal(h.workspace.selectedPharmacyId, 2);
        assert.equal(h.workspace.selectedPharmacyName, 'B');
        assert.deepEqual(h.writes, []);
      }
    }
  }
});

test('local pharmacy, platform and all-pharmacies selections invalidate pending defaults immediately', async () => {
  for (const select of ['selectPharmacy', 'selectPlatform', 'selectAllOrganizationPharmacies']) {
    for (const fail of [false, true]) {
      const h = scopedDashboardHook({ role: 'PHARMACIST' });
      const scope = h.render();
      const request = scope.fetchDashboard();
      scope[select]({ id: 2, name: 'B' });
      const writes = [...h.writes];
      if (fail) {
        h.pending[0].reject(forbidden);
        await assert.rejects(request, (error) => error === forbidden);
      } else {
        h.pending[0].resolve({ selected_pharmacy: { id: 1, name: 'A' } });
        await request;
      }
      assert.deepEqual(h.writes, writes);
    }
  }
});

test('overlapping initial load and refresh only allow the latest request to apply a default', async () => {
  for (const fail of [false, true]) {
    for (const olderFirst of [false, true]) {
      const h = scopedDashboardHook({ pharmacyId: null });
      const scope = h.render();
      const initial = scope.fetchDashboard();
      const refresh = scope.fetchDashboard();
      const finishInitial = async () => {
        if (fail) {
          h.pending[0].reject(forbidden);
          await assert.rejects(initial, (error) => error === forbidden);
        } else {
          h.pending[0].resolve({ selected_pharmacy: { id: 1, name: 'A' } });
          await initial;
        }
      };
      if (olderFirst) {
        await finishInitial();
        assert.deepEqual(h.writes, []);
      }
      h.pending[1].resolve({ selected_pharmacy: { id: 2, name: 'B' } });
      await refresh;
      if (!olderFirst) await finishInitial();
      assert.equal(h.workspace.selectedPharmacyId, 2);
      assert.equal(h.workspace.selectedPharmacyName, 'B');
      assert.equal(h.writes.length, 2);
    }
  }
});

test('current initial defaults and 403 fallbacks still update the scope', async () => {
  const initial = scopedDashboardHook({ pharmacyId: null });
  const load = initial.render().fetchDashboard();
  initial.pending[0].resolve({ selected_pharmacy: { id: 2, name: 'B' } });
  await load;
  assert.equal(initial.workspace.selectedPharmacyId, 2);
  assert.equal(initial.workspace.selectedPharmacyName, 'B');
  for (const pharmacies of [[{ id: 2, name: 'B' }], []]) {
    const h = scopedDashboardHook({ role: 'PHARMACIST', pharmacies });
    const request = h.render().fetchDashboard();
    h.pending[0].reject(forbidden);
    await assert.rejects(request, (error) => error === forbidden);
    assert.equal(h.workspace.workspace, pharmacies.length ? 'internal' : 'platform');
    assert.equal(h.workspace.selectedPharmacyId, pharmacies.length ? 2 : null);
    assert.equal(h.workspace.selectedPharmacyName, pharmacies.length ? 'B' : null);
  }
});

test('returning to the original scope or unmounting cannot revive its old request', async () => {
  for (const unmount of [false, true]) {
    const h = scopedDashboardHook();
    const request = h.render().fetchDashboard();
    if (unmount) h.unmount();
    else {
      h.workspace.selectedPharmacyId = 2;
      h.render();
      h.workspace.selectedPharmacyId = 1;
      h.render();
    }
    h.pending[0].resolve({ selected_pharmacy: { id: 2, name: 'B' } });
    await request;
    assert.deepEqual(h.writes, []);
  }
});

test('all backend dashboard activity link families reach mobile routes with query and fragment intact', () => {
  const { activityRoute } = dashboardScope;
  const query = '?pharmacy_id=7&post_id=12&tab=team%20posts#comments';
  for (const persona of ['owner', 'organization', 'admin', 'pharmacist', 'otherstaff', 'explorer']) {
    for (const base of ['', 'https://www.chemisttasker.com.au']) {
      assert.equal(activityRoute({ action_url: `${base}/dashboard/pharmacy-hub${query}` }, persona), `/${persona}/hub${query}`);
    }
    if (persona === 'admin') continue;
    for (const suffix of ['/shifts/12', '/invoice/12', '', '/']) {
      assert.equal(activityRoute({ actionUrl: `/dashboard/${persona}${suffix}${query}` }, persona), `/${persona}${suffix}${query}`);
    }
  }
  for (const suffix of ['/shifts/12', '/invoice/12', '']) {
    assert.equal(activityRoute({ action_url: `/dashboard/admin/7${suffix}${query}` }, 'admin'), `/admin${suffix}${query}`);
    assert.equal(activityRoute({ action_url: `/dashboard/owner${suffix}${query}` }, 'admin'), `/admin${suffix}${query}`);
  }
  assert.equal(activityRoute({ action_url: '/dashboard/pharmacy-hub' }, 'owner'), '/owner/hub');
  assert.equal(activityRoute({ action_url: '/dashboard/pharmacy-hub' }), null);
  assert.equal(activityRoute({}), null);
  assert.equal(activityRoute({ action_url: 'javascript:alert(1)' }), null);
});

test('activity guards preserve each permitted entry and deny shift taps to communications-only users', () => {
  for (const persona of ['admin', 'organization']) {
    for (const can of [noAccess, { ...noAccess, comms: true }, { ...noAccess, roster: true }, fullAccess]) {
      for (const suffix of ['', '/12', '/12?tab=applications#new']) {
        assert.equal(exports.canOpenManagerActivity(`/${persona}/shifts${suffix}`, can), can.roster);
      }
      assert.equal(exports.canOpenManagerActivity(`/${persona}/hub?post_id=12`, can), can.comms);
      assert.equal(exports.canOpenManagerActivity(`/${persona}/invoice/12`, can), true);
    }
  }
  assert.equal(exports.canOpenManagerActivity('/owner/shifts/12', noAccess), true);
  assert.equal(exports.canOpenManagerActivity('/owner/hub', noAccess), true);
});

test('activity render isolates pharmacy snapshots and applies current rights to already loaded rows', () => {
  const navigated = [];
  const snapshot = { scopeKey: 'a', activity: [
    { title: 'Shift', action_url: '/dashboard/owner/shifts/12' },
    { title: 'Hub', action_url: '/dashboard/pharmacy-hub?post_id=12' },
    { title: 'Invoice', action_url: '/dashboard/owner/invoice/12' },
  ] };
  function render(scopeKey, canRoster, canComms, ready = true, sheetOpen = false) {
    const states = [snapshot, null, sheetOpen];
    const { RecentActivity } = loadTs('./RecentActivity.tsx', {
      react: { useState: () => [states.shift(), () => {}], useCallback: (fn) => fn, useEffect: () => {}, useRef: () => ({ current: 0 }) },
      'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native, 'lucide-react-native': {},
      '@/components/ui': {}, '@/constants/tokens': tokens, './ManagerHome': {}, './managerHomeLogic': exports,
      './dashboardScope': dashboardScope, '@/components/shell': { useShell: () => ({ navigate: (route) => navigated.push(route) }) },
    });
    return RecentActivity({ scopeKey, canRoster, canComms, ready, persona: 'admin', load: async () => null });
  }
  const entries = (tree) => tree.props.children[0].props.children.props.entries;
  const commsOnly = entries(render('a', false, true));
  assert.equal(commsOnly[0].onOpen, null);
  commsOnly[1].onOpen();
  commsOnly[2].onOpen();
  assert.deepEqual(navigated, ['/admin/hub?post_id=12', '/admin/invoice/12']);
  entries(render('a', true, true))[0].onOpen();
  assert.equal(navigated.at(-1), '/admin/shifts/12');
  assert.equal(entries(render('a', true, false))[1].onOpen, null);
  for (const tree of [render('b', true, true, true, true), render('a', true, true, false, true)]) {
    assert.equal(tree.props.children[1].props.open, false);
    assert.equal(tree.props.children[1].props.children.props.entries.length, 0);
    assert.equal(tree.props.action, undefined);
  }
});

test('inbox preserves partial attendance and reports failure from either attendance source or any pharmacy', async () => {
  const { loadManagerInbox } = managerHome({
    attendance: {
      getManagerPending: async () => [{ worker_name: 'Omar' }],
      getManagerPendingKioskReviews: async () => { throw new Error('offline'); },
    },
    workforce: {
      listTimesheetPeriods: async (id) => {
        if (id === 2) throw new Error('offline');
        return [{ id: 1, status: 'OPEN', start_date: '2026-11-01' }];
      },
      listTimesheets: async () => [{ status: 'SUBMITTED', worker: { name: 'Sara' } }],
    },
  });
  const partial = await loadManagerInbox([1, 2], { attendance: true, timesheets: true });
  assert.equal(partial.failed, true);
  assert.equal(partial.attendance.count, 2);
  assert.equal(partial.timesheets.count, 1);
  const skipped = await loadManagerInbox([1], { attendance: false, timesheets: false });
  assert.equal(skipped.failed, false);
  assert.equal(skipped.attendance, null);
});

test('inbox distinguishes failed requests from successfully empty queues', async () => {
  for (const fail of [false, true]) {
    const read = async () => { if (fail) throw new Error('offline'); return []; };
    const { loadManagerInbox } = managerHome({
      attendance: { getManagerPending: read, getManagerPendingKioskReviews: read },
      workforce: { listTimesheetPeriods: read },
    });
    const inbox = await loadManagerInbox([1], { attendance: true, timesheets: true });
    assert.equal(inbox.failed, fail);
    assert.equal(inbox.attendance?.count ?? null, fail ? null : 0);
    assert.equal(inbox.timesheets?.count ?? null, fail ? null : 0);
  }
});

test('admin render hides prior pharmacy data immediately, even before effects run, and gates loaded candidates', () => {
  const snapshot = {
    scopeKey: '1:true:true', invitations: [], active: [], roster: [], pills: null, dashboard: {},
    inbox: { attendance: { count: 2, names: ['Omar'] }, timesheets: { count: 3, names: ['Sara'] }, failed: false },
  };
  function render(pharmacyId, capabilities, loaded = snapshot) {
    const states = [loaded, false, false, now];
    const home = loadTs('../../../app/admin/index.tsx', {
      react: {
        useState: () => [states.shift(), () => {}], useMemo: (fn) => fn(), useCallback: (fn) => fn,
        useEffect: () => {}, useRef: () => ({ current: 0 }),
      },
      'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-router': { useRouter: () => ({ push: () => {} }) },
      'lucide-react-native': {}, '@chemisttasker/shared-core': {}, '@/components/ui': {},
      '@/context/AuthContext': { useAuth: () => ({ hasCapability: (cap) => capabilities.includes(cap) }) },
      '@/context/AdminWorkspaceContext': { useAdminWorkspace: () => ({ activePharmacyId: pharmacyId, activePharmacyName: 'Pharmacy' }) },
      '@/components/ChooseAccountTypeCard': {}, '@/roles/shared/dashboard/managerHomeLogic': exports,
      '@/roles/shared/dashboard/ManagerHome': {
        NextStepCard: 'NextStepCard', attendanceStep: (queue) => ({ key: 'attendance', count: queue.count }),
        timesheetStep: (queue) => ({ key: 'timesheets', count: queue.count }), namesLine: (names) => names.join(', '),
      },
    });
    return home.default().props.children[0].props;
  }
  const allowed = ['MANAGE_STAFF', 'MANAGE_ROSTER'];
  assert.equal(render(1, allowed).step.key, 'attendance');
  assert.equal(render(2, allowed).step, null);
  assert.equal(render(2, allowed).loading, true);
  assert.equal(render(1, []).step, null);
  const restricted = { ...snapshot, scopeKey: '2:false:false' };
  assert.equal(render(2, [], restricted).step.key, 'chat');
  assert.equal(render(2, ['MANAGE_COMMUNICATIONS'], restricted).step.key, 'hub');
});

test('owner and organization render only the current pharmacy snapshot before effects run', () => {
  const inbox = { attendance: { count: 2, names: ['Omar'] }, timesheets: null, failed: false };
  const snapshots = {
    owner: { scopeKey: 'internal:1:1,2', progress: 100, invitations: [], awaiting: [], active: [], confirmed: [], pharmacies: [], applicants: [], queuesFailed: false, inbox },
    organization: { scopeKey: '7:1:1,2:true:true', invitations: [], shifts: [], applicants: [], queuesFailed: false, inbox, members: [], memberCount: 0 },
  };
  function render(persona, pharmacyId, isLoading = false) {
    const states = [snapshots[persona], false, false, now];
    const home = loadTs(`../../${persona}/dashboard.tsx`, {
      react: {
        useState: () => [states.shift(), () => {}], useMemo: (fn) => fn(), useCallback: (fn) => fn,
        useEffect: () => {}, useRef: () => ({ current: 0 }),
      },
      'react/jsx-runtime': { jsx, jsxs: jsx }, 'expo-router': { useRouter: () => ({ push: () => {} }) },
      'lucide-react-native': {}, '@chemisttasker/shared-core': { getOrganizationMembership: () => ({ organization_id: 7 }) },
      '@/components/ui': {}, '@/context/AuthContext': { useAuth: () => ({ user: {} }) },
      '@/roles/shared/dashboard/dashboardScope': { useScopedDashboard: () => ({
        workspace: 'internal', selectedPharmacyId: pharmacyId, pharmacies: [{ id: 1 }, { id: 2 }], isLoading,
      }) },
      '@/roles/shared/dashboard/managerHomeLogic': exports, '@/utils/ownerSetup': { ownerSetupPaths: {} },
      '@/roles/shared/dashboard/ManagerHome': {
        NextStepCard: 'NextStepCard', attendanceStep: (queue) => ({ key: 'attendance', count: queue.count }),
        namesLine: (names) => names.join(', '), orgCapabilities: () => fullAccess,
      },
    });
    return home.default().props.children[0].props;
  }
  for (const persona of ['owner', 'organization']) {
    assert.equal(render(persona, 1).step.key, 'attendance');
    for (const props of [render(persona, 2), render(persona, 1, true)]) {
      assert.equal(props.step, null);
      assert.equal(props.loading, true);
    }
  }
});

test('manager Home initial load and refresh each fetch the dashboard once without a render loop', async () => {
  for (const persona of ['owner', 'organization', 'admin']) {
    const slots = [];
    let cursor = 0;
    let effects = [];
    let calls = 0;
    const memo = (fn, deps) => {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        slots[index] = { value: fn(), deps };
      }
      return slots[index].value;
    };
    const read = async () => [];
    const fetchDashboard = async () => { calls += 1; return {}; };
    const scope = {
      workspace: 'internal', selectedPharmacyId: null, pharmacies: [{ id: 1, name: 'A' }],
      isLoading: true, fetchDashboard,
    };
    const home = loadTs(persona === 'admin' ? '../../../app/admin/index.tsx' : `../../${persona}/dashboard.tsx`, {
      react: {
        useState: (initial) => {
          const index = cursor++;
          slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
          return [slots[index].value, (value) => { slots[index].value = value; }];
        },
        useRef: (initial) => memo(() => ({ current: initial }), []), useMemo: memo,
        useCallback: (fn, deps) => memo(() => fn, deps),
        useEffect: (effect, deps) => memo(() => { effects.push(effect); }, deps),
      },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'expo-router': { useRouter: () => router }, 'lucide-react-native': {}, '@/components/ui': {},
      '@chemisttasker/shared-core': {
        getOnboardingDetail: read, getPendingPharmacyAdminInvitations: read, fetchShiftOffersService: read,
        fetchActiveShifts: read, fetchConfirmedShifts: read, fetchPharmaciesService: read,
        getOrganizationMembership: () => ({ organization_id: 7 }), getOrganizationMemberships: read,
        shiftsDomain: { mapShift: (shift) => shift }, getOwnerDashboard: fetchDashboard, fetchPillBalanceService: read,
      },
      '@/context/AuthContext': { useAuth: () => ({ user: {}, hasCapability: () => false }) },
      '@/context/AdminWorkspaceContext': { useAdminWorkspace: () => ({ activePharmacyId: 1 }) },
      '@/components/ChooseAccountTypeCard': {},
      '@/roles/shared/dashboard/dashboardScope': { useScopedDashboard: () => ({ ...scope }) },
      '@/roles/shared/dashboard/managerHomeLogic': exports, '@/utils/ownerSetup': { ownerSetupPaths: {} },
      '@/roles/shared/dashboard/ManagerHome': { loadManagerInbox: async () => ({}), orgCapabilities: () => ({}) },
    });
    const router = { push: () => {} };
    const render = () => {
      cursor = 0;
      effects = [];
      const tree = home.default();
      effects.forEach((effect) => effect());
      return tree;
    };
    render();
    assert.equal(calls, persona === 'admin' ? 1 : 0, `${persona}: wait for workspace`);
    scope.isLoading = false;
    let tree = render();
    assert.equal(calls, 1, `${persona}: initial load`);
    // Drain initial load, render its state updates, then pull to refresh.
    await new Promise((resolve) => setImmediate(resolve));
    tree = render();
    assert.equal(calls, 1, `${persona}: no duplicate on render`);
    await tree.props.onRefresh();
    assert.equal(calls, 2, `${persona}: refresh`);
    render();
    assert.equal(calls, 2, `${persona}: no loop after refresh`);
    if (persona !== 'admin') {
      scope.fetchDashboard = async () => { calls += 1; return {}; };
      render();
      assert.equal(calls, 3, `${persona}: updated fetch dependency`);
    }
  }
});

test('plain day and time words', () => {
  assert.equal(formatDay(new Date(2026, 10, 4, 18), now), 'Today');
  assert.equal(formatDay(new Date(2026, 10, 5), now), 'Tomorrow');
  assert.equal(formatDay(new Date(2026, 10, 7), now), 'Sat 7 Nov');
  assert.equal(formatTime('09:00:00'), '9am');
  assert.equal(formatTime('13:30'), '1:30pm');
  assert.equal(formatTime('00:15'), '12:15am');
  assert.equal(timeRange('09:00', '17:00'), '9am-5pm');
  assert.equal(roleWord('PHARMACY_ASSISTANT'), 'Pharmacy assistant');
  assert.equal(roleWord(null), '');
});
