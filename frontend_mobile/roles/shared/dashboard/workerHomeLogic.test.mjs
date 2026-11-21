import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
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

const manager = load('./managerHomeLogic.ts');
const {
  workerTab3, tab3Landing, bookedShifts, rosterShifts, canClockIn, isSoon, isRunning, startsIn, workerStep, explorerStep,
  myRequests, requestStatus, addressOf, isoDay, ownRosterAssignments,
} = load('./workerHomeLogic.ts', { './managerHomeLogic': manager });
const list = (rows, pick) => Array.from(rows, pick);

const now = new Date(2026, 10, 4, 10, 0); // Wed 4 Nov 2026, 10am

test('tab 3 follows the workspace: internal Roster, platform Invoices', () => {
  assert.equal(workerTab3('internal'), 'roster');
  assert.equal(workerTab3('platform'), 'invoice');
});

test('switching workspace on the tab-3 root lands on the new tab; everywhere else stays put', () => {
  assert.equal(tab3Landing('pharmacist', '/pharmacist/roster', 'internal', 'platform'), '/pharmacist/invoice');
  assert.equal(tab3Landing('pharmacist', '/pharmacist/invoice', 'platform', 'internal'), '/pharmacist/roster');
  assert.equal(tab3Landing('otherstaff', '/otherstaff/invoices', 'platform', 'internal'), '/otherstaff/roster');
  // Other tabs, inner screens (a draft invoice) and no-change renders never move.
  assert.equal(tab3Landing('pharmacist', '/pharmacist/dashboard', 'internal', 'platform'), null);
  assert.equal(tab3Landing('pharmacist', '/pharmacist/invoice/new', 'platform', 'internal'), null);
  assert.equal(tab3Landing('pharmacist', '/pharmacist/roster', 'internal', 'internal'), null);
  // Invoices opened from More while internal is not the tab, so a switch to platform keeps it.
  assert.equal(tab3Landing('pharmacist', '/pharmacist/invoice', 'internal', 'platform'), null);
  // Another persona's path is not this persona's tab.
  assert.equal(tab3Landing('otherstaff', '/pharmacist/roster', 'internal', 'platform'), null);
});

const booked = [
  {
    id: 7,
    pharmacyDetail: { name: 'Harbour Pharmacy', streetAddress: '1 Quay St', suburb: 'Sydney', state: 'NSW', postcode: '2000' },
    roleNeeded: 'PHARMACIST',
    slots: [
      { id: 1, date: '2026-11-03', startTime: '09:00', endTime: '17:00' }, // ended yesterday
      { id: 2, date: '2026-11-04', startTime: '09:00', endTime: '17:00' }, // running now
      { id: 3, date: '2026-11-06', startTime: '22:00', endTime: '06:00' }, // overnight, later
    ],
  },
];

test('booked shifts keep running and future slots, soonest first, with the pharmacy address', () => {
  const rows = bookedShifts(booked, now);
  assert.deepEqual(list(rows, (row) => row.key), ['booked-7-2', 'booked-7-3']);
  assert.equal(rows[0].address, '1 Quay St, Sydney, NSW, 2000');
  assert.equal(rows[1].end.getDate(), 7, 'overnight slot ends the next day');
  assert.equal(isRunning(rows[0], now), true);
});

test('roster rows skip drafts and ended slots and carry no address', () => {
  const rows = rosterShifts([
    { id: 1, slotDate: '2026-11-04', slotDetail: { startTime: '11:00', endTime: '15:00' }, shiftDetail: { id: 9, pharmacyName: 'Corner Chemist' } },
    { id: 2, slotDate: '2026-11-05', isUnpublished: true, slotDetail: { startTime: '09:00', endTime: '17:00' } },
    { id: 3, slotDate: '2026-11-03', slotDetail: { startTime: '09:00', endTime: '17:00' } },
  ], now);
  assert.deepEqual(list(rows, (row) => row.key), ['roster-1']);
  assert.equal(rows[0].address, '');
  assert.equal(rows[0].shiftId, 9);
});

test('personal roster excludes colleagues and unknown owners, matching My roster ID forms', () => {
  const rows = [
    { id: 1, userId: 5 }, { id: 2, user_id: '5' }, { id: 3, user: 5 },
    { id: 4, user: { id: '5' } }, { id: 5, userDetail: { id: 5 } }, { id: 6, user_detail: { id: 5 } },
    { id: 7, userId: 8, user: 5 }, { id: 8 }, { id: 9, user: 8 },
    { id: 10, userId: null, user: 5 }, { id: 11, user: 0 },
  ];
  assert.deepEqual(list(ownRosterAssignments(rows, 5), row => row.id), [1, 2, 3, 4, 5, 6, 10]);
  for (const userId of [null, undefined, 0, -1, NaN, Infinity]) {
    assert.equal(ownRosterAssignments(rows, userId).length, 0);
  }
  const colleagues = rows.map(row => ({ ...row, slotDate: '2026-11-04', slotDetail: { startTime: '11:00', endTime: '15:00' } }));
  assert.equal(rosterShifts(ownRosterAssignments(colleagues, 99), now).length, 0, 'colleagues cannot trigger Clock in');
  assert.equal(rosterShifts(ownRosterAssignments(colleagues, 5), now).length, 7, 'own shifts stay visible');
});

test('clock in opens two hours before the start and closes at the end; the Now card takes 12 hours', () => {
  const [row] = rosterShifts([{ id: 1, slotDate: '2026-11-04', slotDetail: { startTime: '11:30', endTime: '15:00' } }], now);
  assert.equal(canClockIn(row, now), true);
  assert.equal(canClockIn(row, new Date(2026, 10, 4, 9, 0)), false);
  assert.equal(canClockIn(row, new Date(2026, 10, 4, 15, 0)), false);
  assert.equal(isSoon(row, new Date(2026, 10, 3, 23, 30)), true);
  assert.equal(isSoon(row, new Date(2026, 10, 3, 23, 0)), false);
  assert.equal(startsIn(row.start, now), 'Starts in 2 h');
  assert.equal(startsIn(row.start, new Date(2026, 10, 4, 11, 0)), 'Starts in 30 min');
});

test('worker next step: each trigger beats every later one, and a swap of any neighbours fails', () => {
  const none = { clockFailed: false, shiftsFailed: false, awaitingFailed: false, progressFailed: false, clockedIn: false, soon: false, payment: false, profile: false, upcoming: false, platform: true };
  const order = ['clockedIn', 'soon', 'payment', 'profile', 'upcoming'];
  for (let i = 0; i < order.length; i += 1) {
    const triggers = { ...none };
    for (const key of order.slice(i)) triggers[key] = true;
    assert.equal(workerStep(triggers), order[i], `${order[i]} wins over ${order.slice(i + 1).join(', ')}`);
  }
  assert.equal(workerStep(none), 'publish');
  assert.equal(workerStep({ ...none, platform: false }), 'availability');
});

test('failed sources require retry before any step whose priority depends on them', () => {
  const none = { clockFailed: false, shiftsFailed: false, awaitingFailed: false, progressFailed: false, clockedIn: false, soon: false, payment: false, profile: false, upcoming: false, platform: true };
  const order = ['clockFailed', 'clockedIn', 'shiftsFailed', 'soon', 'awaitingFailed', 'payment', 'progressFailed', 'profile', 'upcoming'];
  for (let i = 0; i < order.length; i += 1) {
    const triggers = { ...none };
    for (const key of order.slice(i)) triggers[key] = true;
    assert.equal(workerStep(triggers), order[i].endsWith('Failed') ? 'retry' : order[i], `${order[i]} takes precedence`);
  }
  for (const platform of [true, false]) {
    for (const failure of ['clockFailed', 'shiftsFailed', 'awaitingFailed', 'progressFailed']) {
      assert.equal(workerStep({ ...none, platform, [failure]: true }), 'retry', `${failure} must not offer availability`);
    }
  }
});

test('explorer next step: profile, then interests, then a first Talent Board post, else browse shifts', () => {
  const loaded = { onboardingFailed: false, postsFailed: false };
  assert.equal(explorerStep({ ...loaded, profile: true, interests: true, noPost: true }), 'profile');
  assert.equal(explorerStep({ ...loaded, profile: false, interests: true, noPost: true }), 'interests');
  assert.equal(explorerStep({ ...loaded, profile: false, interests: false, noPost: true }), 'talent');
  assert.equal(explorerStep({ ...loaded, profile: false, interests: false, noPost: false }), 'shifts');
});

test('explorer retries failed sources before dependent steps and keeps known higher-priority steps', () => {
  const none = { onboardingFailed: false, postsFailed: false, profile: false, interests: false, noPost: false };
  const order = ['onboardingFailed', 'profile', 'interests', 'postsFailed', 'noPost'];
  for (let i = 0; i < order.length; i += 1) {
    const triggers = { ...none };
    for (const key of order.slice(i)) triggers[key] = true;
    const expected = order[i].endsWith('Failed') ? 'retry' : order[i] === 'noPost' ? 'talent' : order[i];
    assert.equal(explorerStep(triggers), expected, `${order[i]} takes precedence`);
  }
  for (const noPost of [true, false]) {
    assert.equal(explorerStep({ ...none, onboardingFailed: true, noPost }), 'retry', 'unknown onboarding blocks Talent Board and Browse shifts');
  }
  assert.equal(explorerStep({ ...none, postsFailed: true }), 'retry', 'unknown posts block Browse shifts');
});

test('requests list only the worker’s own leave, newest first, in plain words', () => {
  const rows = myRequests(
    [{ id: 1, requestedBy: 5, pharmacyName: 'Corner Chemist', slotDate: '2026-11-06', startTime: '09:00', endTime: '13:00', status: 'PENDING', createdAt: '2026-11-02' }],
    [
      { id: 10, user: 5, leaveType: 'ANNUAL', status: 'APPROVED', dateApplied: '2026-11-03', startAt: '2026-11-08T09:00:00Z', pharmacyName: 'Harbour Pharmacy' },
      { id: 11, user: 8, leaveType: 'SICK', status: 'PENDING', dateApplied: '2026-11-04' }, // a teammate's, seen as a manager
      { id: 12, leaveType: 'SICK', status: 'PENDING', dateApplied: '2026-11-04' }, // owner unknown
    ],
    5,
  );
  assert.deepEqual(list(rows, (row) => `${row.title}: ${row.status}`), ['Annual leave: Approved', 'Shift request: Waiting']);
  assert.equal(rows[0].date, '2026-11-08T09:00:00Z');
  assert.equal(rows[0].pharmacyName, 'Harbour Pharmacy');
  assert.equal(rows[0].dateLabel, '');
  assert.equal(myRequests([], [{ id: 1, user: 5, slotDate: '2026-11-07', dateApplied: '2026-11-02' }], 5)[0].date, '2026-11-07');
  assert.equal(myRequests([], [{ id: 1, user: 5, dateApplied: '2026-11-02' }], 5)[0].date, '2026-11-02');
  assert.equal(myRequests([], [{ id: 1, user: 5, dateApplied: '2026-11-02' }], 5)[0].dateLabel, 'Applied ', 'application dates are not leave dates');
  assert.equal(myRequests([], [{ id: 1, user: 5 }], null).length, 0, 'no signed-in user, no rows');
  assert.equal(requestStatus('REJECTED'), 'Declined');
  assert.equal(requestStatus('AUTO_PUBLISHED'), 'Shared with the team');
});

test('address and roster dates', () => {
  assert.equal(addressOf({ suburb: 'Parramatta', state: 'NSW' }), 'Parramatta, NSW');
  assert.equal(addressOf(null), '');
  assert.equal(isoDay(new Date(2026, 0, 5)), '2026-01-05');
});
