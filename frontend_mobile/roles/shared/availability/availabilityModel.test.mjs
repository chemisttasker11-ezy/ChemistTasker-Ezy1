import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./availabilityModel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
runInNewContext(outputText, { exports, FormData: globalThis.FormData || class FormData { append(){} } });

const {
  unsavedAvailabilityPayloads, validateAvailabilityDraft, isValidIsoDate,
  computeMonthAvailabilityDates, toSafeOnboardingRole, normalizeOnboardingRole, AvailabilityController
} = exports;

test('unsavedAvailabilityPayloads distinguishes metadata and normalizes times', () => {
  const base = { date: '2026-11-11', startTime: '09:00:00', endTime: '17:00:00', isRecurring: false, recurringDays: [], recurringEndDate: null };
  const input = [{ ...base, start_time: '09:00', end_time: '17:00', notes: 'note-a', notify_new_shifts: true, is_all_day: false }];
  const existing = [{ id: 1, ...base, notes: 'note-b', notifyNewShifts: false, isAllDay: false }];
  assert.equal(unsavedAvailabilityPayloads(input, existing).length, 1);
  assert.equal(unsavedAvailabilityPayloads(input, [{ ...existing[0], notes: 'note-a', notifyNewShifts: true }]).length, 0);
  assert.equal(unsavedAvailabilityPayloads([{ ...input[0], is_all_day: true }], [{ ...input[0], isAllDay: false }]).length, 1);
});

test('validation handles leap years, end-after-start, recurrence NaN traps and all-day', () => {
  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2025-02-29'), false);
  assert.equal(isValidIsoDate('2026-04-31'), false);

  const draft = { date: '2026-11-10', startTime: '17:00', endTime: '09:00', isAllDay: false, isRecurring: false, recurringDays: [], recurringEndDate: '', notifyNewShifts: false, notes: '' };
  assert.equal(validateAvailabilityDraft(draft, ['2026-11-10']).error, 'End must be after start');
  assert.equal(validateAvailabilityDraft({ ...draft, isAllDay: true }, ['2026-11-10']).valid, true);

  const badRecur = { ...draft, startTime: '09:00', endTime: '17:00', isRecurring: true, recurringDays: [1], recurringEndDate: 'invalid-text' };
  assert.equal(validateAvailabilityDraft(badRecur, ['2026-11-10']).error, 'Invalid repeat end date');
  assert.equal(validateAvailabilityDraft({ ...badRecur, recurringEndDate: '2026-11-01' }, ['2026-11-10']).error, 'Repeat end must be after date');
});

test('validateAvailabilityDraft rejects invalid typed date text without silently saving old selectedDates', () => {
  const draft = { date: '2026-99-99', startTime: '09:00', endTime: '17:00', isAllDay: false, isRecurring: false, recurringDays: [], recurringEndDate: '', notifyNewShifts: false, notes: '' };
  const res = validateAvailabilityDraft(draft, ['2026-11-10']);
  assert.equal(res.valid, false);
  assert.equal(res.error, 'Invalid date format: 2026-99-99');
});

test('month recurrence computes visible month without 180-day truncation', () => {
  const recurring = [{ date: '2025-01-01', recurringEndDate: '2027-12-31', isRecurring: true, recurringDays: [1] }];
  const nov2026 = computeMonthAvailabilityDates(recurring, new Date('2026-11-15'));
  assert.ok(nov2026.has('2026-11-02'));
  assert.ok(nov2026.has('2026-11-30'));
  assert.ok(!nov2026.has('2026-11-03'));
});

test('same-tick double add is blocked by synchronous mutex', async () => {
  const ctrl = new AvailabilityController('user-1:PHARMACIST');
  const draft = { date: '2026-11-10', startTime: '09:00', endTime: '17:00', isAllDay: false, isRecurring: false, recurringDays: [], recurringEndDate: '', notifyNewShifts: false, notes: '' };
  let resolveCreate;
  const p1 = ctrl.addSlots({
    draft, selectedDates: ['2026-11-10'], notifyNewShifts: false, currentEntries: [],
    createService: () => new Promise((res) => { resolveCreate = res; }), refreshService: async () => [],
    onSuccess: () => {}, onPartialRetry: () => {}, onReconcileFailure: () => {}, onAlreadySaved: () => {}, onError: () => {},
  });
  const p2 = ctrl.addSlots({
    draft, selectedDates: ['2026-11-10'], notifyNewShifts: false, currentEntries: [],
    createService: async (p) => p, refreshService: async () => [], onSuccess: () => {},
    onPartialRetry: () => {}, onReconcileFailure: () => {}, onAlreadySaved: () => {}, onError: () => {},
  });
  const res2 = await p2;
  assert.equal(res2.status, 'busy');
  resolveCreate({ id: 1, date: '2026-11-10' });
  const res1 = await p1;
  assert.equal(res1.status, 'success');
});

test('controller finally guards mutex release against obsolete generation', async () => {
  const ctrl = new AvailabilityController('user-1:PHARMACIST');
  const draft = { date: '2026-11-10', startTime: '09:00', endTime: '17:00', isAllDay: false, isRecurring: false, recurringDays: [], recurringEndDate: '', notifyNewShifts: false, notes: '' };
  let finishFirst;
  const p1 = ctrl.addSlots({
    draft, selectedDates: ['2026-11-10'], notifyNewShifts: false, currentEntries: [],
    createService: () => new Promise((res) => { finishFirst = res; }), refreshService: async () => [],
    onSuccess: () => {}, onPartialRetry: () => {}, onReconcileFailure: () => {}, onAlreadySaved: () => {}, onError: () => {},
  });
  ctrl.switchAccount('user-2:PHARMACIST');
  let finishSecond;
  const p2 = ctrl.addSlots({
    draft, selectedDates: ['2026-11-10'], notifyNewShifts: false, currentEntries: [],
    createService: () => new Promise((res) => { finishSecond = res; }), refreshService: async () => [],
    onSuccess: () => {}, onPartialRetry: () => {}, onReconcileFailure: () => {}, onAlreadySaved: () => {}, onError: () => {},
  });
  assert.equal(ctrl.isBusy, true);
  finishFirst({ id: 1 });
  await p1;
  assert.equal(ctrl.isBusy, true);
  finishSecond({ id: 2 });
  await p2;
  assert.equal(ctrl.isBusy, false);
});

test('partial failure reconciles with retry or blocks on reconcile failure', async () => {
  const ctrl = new AvailabilityController('user-1:PHARMACIST');
  const draft = { date: '2026-11-10', startTime: '09:00', endTime: '17:00', isAllDay: false, isRecurring: false, recurringDays: [], recurringEndDate: '', notifyNewShifts: false, notes: '' };
  let partialArgs = null;
  const resSuccess = await ctrl.addSlots({
    draft, selectedDates: ['2026-11-10', '2026-11-11'], notifyNewShifts: false, currentEntries: [],
    createService: async (payload) => {
      if (payload.date === '2026-11-11') throw new Error('net fail');
      return { id: 101, ...payload };
    },
    refreshService: async () => [{ id: 101, date: '2026-11-10', startTime: '09:00', endTime: '17:00', isRecurring: false, recurringDays: [], recurringEndDate: null }],
    onSuccess: () => {}, onPartialRetry: (dates, auth, saved, total) => { partialArgs = { dates, saved, total }; },
    onReconcileFailure: () => {}, onAlreadySaved: () => {}, onError: () => {},
  });
  assert.equal(resSuccess.status, 'partial_success');
  assert.deepEqual({ ...partialArgs, dates: [...partialArgs.dates] }, { dates: ['2026-11-11'], saved: 1, total: 2 });

  let reconcileFailedCalled = false;
  const resFail = await ctrl.addSlots({
    draft, selectedDates: ['2026-11-12'], notifyNewShifts: false, currentEntries: [],
    createService: async () => { throw new Error('drop'); }, refreshService: async () => { throw new Error('lost server'); },
    onSuccess: () => {}, onPartialRetry: () => {}, onReconcileFailure: () => { reconcileFailedCalled = true; },
    onAlreadySaved: () => {}, onError: () => {},
  });
  assert.equal(resFail.status, 'reconcile_failure');
  assert.equal(reconcileFailedCalled, true);
});

test('account switch invalidates in-flight actions across pharmacist and other staff', async () => {
  const ctrl = new AvailabilityController('user-1:PHARMACIST');
  let loadedAccount = null;
  const p = ctrl.loadInitialLocation({
    onboardingRole: 'pharmacist',
    fetchService: async () => new Promise((res) => setTimeout(() => res({ suburb: 'OldSub' }), 10)),
    onLoaded: (d) => { loadedAccount = d; }, onError: () => {},
  });
  ctrl.switchAccount('user-2:OTHER_STAFF');
  await p;
  assert.equal(loadedAccount, null);
  assert.equal(toSafeOnboardingRole('other_staff'), 'otherstaff');
  assert.equal(normalizeOnboardingRole('OTHER_STAFF'), 'other_staff');
});

test('late location load does not overwrite user edits', async () => {
  const ctrl = new AvailabilityController('user-1:PHARMACIST');
  ctrl.markLocationDirty();
  let loaded = false;
  const res = await ctrl.loadInitialLocation({
    onboardingRole: 'pharmacist', fetchService: async () => ({ suburb: 'ServerVal' }),
    onLoaded: () => { loaded = true; }, onError: () => {},
  });
  assert.equal(res.status, 'preserved_user_edits');
  assert.equal(loaded, false);
});

test('source accessibility, date cell, and location gating structure matches contract', () => {
  const screenSrc = readFileSync(new URL('./SetAvailabilityScreen.tsx', import.meta.url), 'utf8');
  assert.ok(!screenSrc.includes('getCalendarDateFromTouch'));
  assert.ok(screenSrc.includes('accessibilityRole="button"'));
  assert.ok(screenSrc.includes('minHeight: 44'));
  assert.ok(screenSrc.includes('!locationLoaded ?'));
  assert.ok(screenSrc.includes('setSelectedDates([]);'));
  assert.ok(screenSrc.includes('disabled={loading}'));
});
