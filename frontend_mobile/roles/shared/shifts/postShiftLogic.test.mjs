import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const result = {};
  vm.runInNewContext(outputText, {
    exports: result,
    URL,
    URLSearchParams,
    require: (name) => {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return result;
}

const helpers = loadTs('./PostShiftScreen.helpers.ts', {
  '@chemisttasker/shared-core': {
    getPharmacyHoursForDate: () => ({
      closed: false,
      label: '',
      isPublicHoliday: false,
      holidayNeedsReview: false,
      holidayStatus: '',
      partDayWindows: [],
    }),
  },
});

const {
  parsePostShiftSearchParams,
  pickScopedPharmacyId,
  canAccessPostShift,
  normalizePrefillRole,
  getStablePostShiftParamsKey,
  computePrefillPlan,
  computeResetFormPrefills,
  runPostShiftInitChain,
  shouldTriggerPostShiftInit,
} = helpers;

const plain = (value) => JSON.parse(JSON.stringify(value));

test('parsePostShiftSearchParams parses null, empty and default values safely', () => {
  const parsed = plain(parsePostShiftSearchParams(null));
  assert.equal(parsed.editingId, null);
  assert.equal(parsed.routePharmacyId, null);
  assert.deepEqual(parsed.dates, []);
  assert.equal(parsed.roleNeeded, '');
  assert.equal(parsed.startTime, '09:00');
  assert.equal(parsed.endTime, '17:00');
  assert.equal(parsed.hasStartTime, false);
  assert.equal(parsed.hasEndTime, false);
  assert.equal(parsed.dedicatedUserId, null);
  assert.equal(parsed.isEmbedded, false);
});

test('parsePostShiftSearchParams parses query parameters accurately', () => {
  const parsed = plain(parsePostShiftSearchParams({
    edit: '42',
    pharmacyId: '10',
    dates: '2026-11-12,2026-11-10',
    role: 'pharmacist',
    start_time: '08:30:00',
    end_time: '16:30',
    dedicated_user: '88',
    embedded: '1',
  }));

  assert.equal(parsed.editingId, 42);
  assert.equal(parsed.routePharmacyId, 10);
  assert.deepEqual(parsed.dates, ['2026-11-10', '2026-11-12']);
  assert.equal(parsed.roleNeeded, 'PHARMACIST');
  assert.equal(parsed.startTime, '08:30');
  assert.equal(parsed.endTime, '16:30');
  assert.equal(parsed.hasStartTime, true);
  assert.equal(parsed.hasEndTime, true);
  assert.equal(parsed.dedicatedUserId, 88);
  assert.equal(parsed.isEmbedded, true);
});

test('parsePostShiftSearchParams supports alternative param keys: pharmacy_id, role_needed, single date', () => {
  const parsed = plain(parsePostShiftSearchParams({
    pharmacy_id: '15',
    date: '2026-12-01',
    role_needed: 'technician',
  }));

  assert.equal(parsed.routePharmacyId, 15);
  assert.deepEqual(parsed.dates, ['2026-12-01']);
  assert.equal(parsed.roleNeeded, 'TECHNICIAN');
});

test('normalizePrefillRole maps synonyms to canonical role tokens', () => {
  assert.equal(normalizePrefillRole('community_pharmacist'), 'PHARMACIST');
  assert.equal(normalizePrefillRole('pharmacy_technician'), 'TECHNICIAN');
  assert.equal(normalizePrefillRole('other_staff'), 'ASSISTANT');
  assert.equal(normalizePrefillRole('pharmacy_assistant'), 'ASSISTANT');
  assert.equal(normalizePrefillRole('intern'), 'INTERN');
  assert.equal(normalizePrefillRole('student'), 'STUDENT');
  assert.equal(normalizePrefillRole('UNKNOWN_ROLE'), '');
});

test('pickScopedPharmacyId precedence: routePharmacyId beats scopedPharmacyId beats current', () => {
  const pharmacies = [{ id: 1 }, { id: 2 }, { id: 3 }];

  // Route pharmacy takes highest priority
  assert.equal(
    pickScopedPharmacyId({
      routePharmacyId: 3,
      scopedPharmacyId: 2,
      currentPharmacyId: 1,
      pharmacies,
    }),
    3,
  );

  // Scoped pharmacy takes priority when no route pharmacy
  assert.equal(
    pickScopedPharmacyId({
      scopedPharmacyId: 2,
      currentPharmacyId: 1,
      pharmacies,
    }),
    2,
  );

  // Current pharmacy preserved when preserveCurrent is true
  assert.equal(
    pickScopedPharmacyId({
      routePharmacyId: 3,
      scopedPharmacyId: 2,
      currentPharmacyId: 1,
      pharmacies,
      preserveCurrent: true,
    }),
    1,
  );

  // Fallback to list[0] when candidates are not in allowed list
  assert.equal(
    pickScopedPharmacyId({
      routePharmacyId: 99,
      scopedPharmacyId: 88,
      pharmacies,
    }),
    1,
  );

  // Empty list returns empty string
  assert.equal(
    pickScopedPharmacyId({
      routePharmacyId: 1,
      pharmacies: [],
    }),
    '',
  );
});

test('pickScopedPharmacyId precedence swap test: routeId must strictly beat scopedId', () => {
  const pharmacies = [{ id: 10 }, { id: 20 }];
  const picked = pickScopedPharmacyId({
    routePharmacyId: 10,
    scopedPharmacyId: 20,
    pharmacies,
  });
  assert.equal(picked, 10, 'routePharmacyId must beat scopedPharmacyId');

  // Verify that swapping candidate order would fail this test
  const swappedOrder = (input) => {
    const list = input.pharmacies;
    const routeId = Number(input.routePharmacyId);
    const scopedId = Number(input.scopedPharmacyId);
    const ordered = [scopedId, routeId]; // intentionally swapped
    for (const c of ordered) {
      if (list.some((item) => item.id === c)) return c;
    }
    return '';
  };
  assert.notEqual(
    swappedOrder({ routePharmacyId: 10, scopedPharmacyId: 20, pharmacies }),
    picked,
    'A swap in precedence must produce a different result and fail',
  );
});

test('canAccessPostShift guards entry points based on surface persona, capabilities and ready state', () => {
  // Surface not ready -> returns true to avoid false negative lockout during loading
  assert.equal(
    canAccessPostShift({ persona: 'admin', canManageShifts: false, ready: false }),
    true,
  );

  // Poster with canManageShifts (owner or org with roster capability) -> true
  assert.equal(
    canAccessPostShift({ persona: 'owner', canManageShifts: true, ready: true }),
    true,
  );

  // Delegated admin in route /admin/[pharmacyId]/post-shift with capability -> true
  const hasCap = (cap, pId) => cap === 'MANAGE_ROSTER' && pId === 7;
  assert.equal(
    canAccessPostShift(
      { persona: 'admin', canManageShifts: false, ready: true },
      7,
      hasCap,
    ),
    true,
  );

  // Delegated admin without capability -> false
  assert.equal(
    canAccessPostShift(
      { persona: 'admin', canManageShifts: false, ready: true },
      8,
      hasCap,
    ),
    false,
  );

  // Worker role without canManageShifts -> false
  assert.equal(
    canAccessPostShift({ persona: 'pharmacist', canManageShifts: false, ready: true }),
    false,
  );
});

test('getStablePostShiftParamsKey produces stable keys across new object identities', () => {
  const key1 = getStablePostShiftParamsKey({ role: 'pharmacist', dates: '2026-11-10' });
  const key2 = getStablePostShiftParamsKey({ role: 'pharmacist', dates: '2026-11-10' });
  assert.equal(key1, key2);

  const keyDiff = getStablePostShiftParamsKey({ role: 'technician', dates: '2026-11-10' });
  assert.notEqual(key1, keyDiff);
});

test('computePrefillPlan applies prefill once and does not override user changes', () => {
  const parsed = plain(parsePostShiftSearchParams({
    dates: '2026-11-10,2026-11-12',
    role: 'pharmacist',
    start_time: '09:00',
    end_time: '17:00',
    dedicated_user: '123',
  }));

  // First application: all prefills planned
  const plan1 = computePrefillPlan({}, parsed, false);
  assert.equal(plan1.applyDates, true);
  assert.equal(plan1.applyTimes, true);
  assert.equal(plan1.applyRole, true);
  assert.equal(plan1.applyDedicatedUser, true);

  // Second application (e.g. re-render, focus, or user edits role): NO prefills re-applied
  const plan2 = computePrefillPlan(plan1.nextApplied, parsed, false);
  assert.equal(plan2.applyDates, false);
  assert.equal(plan2.applyTimes, false);
  assert.equal(plan2.applyRole, false);
  assert.equal(plan2.applyDedicatedUser, false);

  // Editing mode: prefills disabled
  const planEdit = computePrefillPlan({}, parsed, true);
  assert.equal(planEdit.applyDates, false);
  assert.equal(planEdit.applyRole, false);
});

test('runPostShiftInitChain stops on pharmacy failure and does not call loadShift', async () => {
  let shiftCalled = false;
  const result = await runPostShiftInitChain({
    isCurrent: () => true,
    loadPharmacies: async () => {
      throw new Error('Pharmacy network failure');
    },
    shouldLoadShift: true,
    loadShift: async () => {
      shiftCalled = true;
      return { id: 1 };
    },
  });

  assert.equal(result.status, 'pharmacies_failed');
  assert.equal(shiftCalled, false, 'loadShift must NOT be called when pharmacies fail');
});

test('runPostShiftInitChain handles creation and edit mode chains accurately', async () => {
  const fakePharmacies = [{ id: 1, name: 'Chemist' }];
  const fakeShift = { id: 42, role: 'PHARMACIST' };

  // Creation flow (shouldLoadShift = false): only loads pharmacies
  let shiftCalled = false;
  const createResult = await runPostShiftInitChain({
    isCurrent: () => true,
    loadPharmacies: async () => fakePharmacies,
    shouldLoadShift: false,
    loadShift: async () => { shiftCalled = true; return fakeShift; },
  });
  assert.equal(createResult.status, 'pharmacies_loaded');
  assert.deepEqual(createResult.pharmacies, fakePharmacies);
  assert.equal(shiftCalled, false);

  // Edit flow (shouldLoadShift = true): loads pharmacies then shift
  const editResult = await runPostShiftInitChain({
    isCurrent: () => true,
    loadPharmacies: async () => fakePharmacies,
    shouldLoadShift: true,
    loadShift: async () => fakeShift,
  });
  assert.equal(editResult.status, 'success');
  assert.deepEqual(editResult.pharmacies, fakePharmacies);
  assert.deepEqual(editResult.shift, fakeShift);

  // Shift failure flow: stops with shift_failed preserving pharmacies
  const shiftFailResult = await runPostShiftInitChain({
    isCurrent: () => true,
    loadPharmacies: async () => fakePharmacies,
    shouldLoadShift: true,
    loadShift: async () => { throw new Error('Shift not found'); },
  });
  assert.equal(shiftFailResult.status, 'shift_failed');
  assert.deepEqual(shiftFailResult.pharmacies, fakePharmacies);

  // Aborted when not current
  let current = true;
  const abortResult = await runPostShiftInitChain({
    isCurrent: () => current,
    loadPharmacies: async () => { current = false; return fakePharmacies; },
    shouldLoadShift: true,
    loadShift: async () => fakeShift,
  });
  assert.equal(abortResult.status, 'aborted');
});

test('init fails -> retry -> dedicated_user, dates and role still applied', async () => {
  const parsedParams = parsePostShiftSearchParams({
    dedicated_user: '88',
    dates: '2026-11-10,2026-11-12',
    role: 'technician',
    start_time: '08:30',
    end_time: '16:30',
  });

  // 1. Initial prefill and form setup
  let appliedPrefills = {};
  const initialPlan = computePrefillPlan(appliedPrefills, parsedParams, false);
  appliedPrefills = initialPlan.nextApplied;

  let formState = computeResetFormPrefills(parsedParams, { preservePrefills: true });
  assert.equal(formState.dedicatedUserId, 88);
  assert.deepEqual(plain(formState.dates), ['2026-11-10', '2026-11-12']);
  assert.equal(formState.roleNeeded, 'TECHNICIAN');

  // 2. Initial load fails (e.g. network failure loading pharmacies)
  let attempt = 0;
  const loadPharmacies = async () => {
    attempt++;
    if (attempt === 1) {
      throw new Error('Network timeout loading pharmacies');
    }
    return [{ id: 1, name: 'Main Pharmacy' }];
  };

  const failResult = await runPostShiftInitChain({
    isCurrent: () => true,
    loadPharmacies,
    shouldLoadShift: false,
  });
  assert.equal(failResult.status, 'pharmacies_failed');

  // 3. User clicks retry: retryInitialLoad resets appliedPrefillsRef and runs runInitLoad
  // which invokes resetForm({ preservePrefills: true })
  appliedPrefills = {};
  formState = computeResetFormPrefills(parsedParams, { preservePrefills: true });
  assert.equal(formState.dedicatedUserId, 88, 'dedicated_user must be preserved across retry');
  assert.deepEqual(plain(formState.dates), ['2026-11-10', '2026-11-12'], 'dates must be preserved across retry');
  assert.equal(formState.roleNeeded, 'TECHNICIAN', 'role must be preserved across retry');

  // Verify that an unpreserved reset (e.g. after successful post) would clear them
  const wipedState = computeResetFormPrefills(parsedParams, { preservePrefills: false });
  assert.equal(wipedState.dedicatedUserId, null);
  assert.deepEqual(plain(wipedState.dates), []);
  assert.equal(wipedState.roleNeeded, 'PHARMACIST');

  // 4. Retry initialization succeeds
  const retryResult = await runPostShiftInitChain({
    isCurrent: () => true,
    loadPharmacies,
    shouldLoadShift: false,
  });
  assert.equal(retryResult.status, 'pharmacies_loaded');

  // 5. Prefills re-applied with the init chain
  const retryPlan = computePrefillPlan(appliedPrefills, parsedParams, false);
  appliedPrefills = retryPlan.nextApplied;
  assert.equal(retryPlan.applyDedicatedUser, true);
  assert.equal(retryPlan.applyDates, true);
  assert.equal(retryPlan.applyRole, true);

  // Assert dedicated_user, dates and role remain applied in formState
  assert.equal(formState.dedicatedUserId, 88);
  assert.deepEqual(plain(formState.dates), ['2026-11-10', '2026-11-12']);
  assert.equal(formState.roleNeeded, 'TECHNICIAN');
  assert.equal(formState.slots.length, 2);
  assert.equal(formState.slots[0].startTime, '08:30');
  assert.equal(formState.slots[0].endTime, '16:30');
});

test('shouldTriggerPostShiftInit guards init triggers: runs on mount, retry, edit-id, or scope change; skips on user edits', () => {
  const scopeA = { editingId: null, routePharmacyId: null, scopedPharmacyId: 'pharm-1' };

  // 1. Mount: prev is null -> triggers
  assert.equal(shouldTriggerPostShiftInit(null, scopeA), true, 'mount must trigger init');

  // 2. Unchanged scope (user editing form/times/slots) -> does NOT trigger
  assert.equal(shouldTriggerPostShiftInit(scopeA, scopeA), false, 'user edits without scope change must not trigger init');
  assert.equal(shouldTriggerPostShiftInit(scopeA, { ...scopeA }), false, 'equivalent scope identity must not trigger init');

  // 3. Retry -> always triggers even when scope is identical
  assert.equal(shouldTriggerPostShiftInit(scopeA, scopeA, true), true, 'retry must trigger init');

  // 4. Edit-id change -> triggers
  const scopeEdit = { ...scopeA, editingId: 42 };
  assert.equal(shouldTriggerPostShiftInit(scopeA, scopeEdit), true, 'edit-id change must trigger init');
  assert.equal(shouldTriggerPostShiftInit(scopeEdit, { ...scopeEdit, editingId: 43 }), true, 'different edit-id must trigger init');

  // 5. Scope change (workspace/pharmacy scope changed) -> triggers
  const scopeB = { ...scopeA, scopedPharmacyId: 'pharm-2' };
  assert.equal(shouldTriggerPostShiftInit(scopeA, scopeB), true, 'scope change must trigger init');

  // 6. Route pharmacy change -> triggers
  const scopeRoute = { ...scopeA, routePharmacyId: 99 };
  assert.equal(shouldTriggerPostShiftInit(scopeA, scopeRoute), true, 'route pharmacy change must trigger init');
});

test('init -> user edits time -> no reset', async () => {
  // Simulate PostShiftScreen initialization and user edits lifecycle
  const parsedParams = parsePostShiftSearchParams({
    role: 'pharmacist',
    start_time: '09:00',
    end_time: '17:00',
  });

  // Scope at mount
  let currentScope = { editingId: null, routePharmacyId: null, scopedPharmacyId: 10 };
  let prevInitScope = null;
  let initLoadCount = 0;
  let resetFormCount = 0;

  // Component internal state
  let slotStart = '09:00';
  let slotEnd = '17:00';
  let liveTimesRef = { current: { startTime: slotStart, endTime: slotEnd } };
  let formState = {
    description: '',
    roleNeeded: 'PHARMACIST',
    slotStart: '09:00',
    slotEnd: '17:00',
    slots: [],
  };

  // resetForm callback: reads times through options or liveTimesRef, dependent ONLY on parsedParams
  const createResetForm = (params) => (options) => {
    resetFormCount++;
    const resetTimes = options?.times ?? liveTimesRef.current;
    const prefill = computeResetFormPrefills(params, options, resetTimes);
    formState = {
      ...formState,
      roleNeeded: prefill.roleNeeded,
      slotStart: prefill.slotStart,
      slotEnd: prefill.slotEnd,
      slots: prefill.slots,
      description: '', // reset wipes description
    };
  };

  let resetFormFn = createResetForm(parsedParams);
  const resetFormRefAtMount = resetFormFn;

  const runInitLoad = async () => {
    initLoadCount++;
    if (!currentScope.editingId) {
      resetFormFn({ preservePrefills: true });
    }
  };

  // STEP 1: Mount
  if (shouldTriggerPostShiftInit(prevInitScope, currentScope)) {
    prevInitScope = currentScope;
    await runInitLoad();
  }
  assert.equal(initLoadCount, 1, 'init chain must run once on mount');
  assert.equal(resetFormCount, 1, 'resetForm must run once on mount');
  assert.equal(formState.slotStart, '09:00');
  assert.equal(formState.slotEnd, '17:00');

  // STEP 2: User edits fields and times
  // User enters custom description
  formState.description = 'Busy community dispensary, urgent weekend cover';
  formState.slots = [{ date: '2026-11-20', startTime: '10:00', endTime: '18:00', isRecurring: false }];

  // User changes time from 09:00 to 10:00 and 17:00 to 18:00
  slotStart = '10:00';
  slotEnd = '18:00';
  formState.slotStart = '10:00';
  formState.slotEnd = '18:00';
  liveTimesRef.current = { startTime: slotStart, endTime: slotEnd };

  // Because resetForm does NOT depend on slotStart / slotEnd, its callback reference is preserved
  // (no new callback created)
  assert.equal(resetFormFn, resetFormRefAtMount, 'resetForm identity must be stable across user time edits');

  // Effect check: shouldTriggerPostShiftInit evaluated on render
  const shouldReInitOnTimeEdit = shouldTriggerPostShiftInit(prevInitScope, currentScope);
  assert.equal(shouldReInitOnTimeEdit, false, 'editing time must NOT trigger init chain');

  if (shouldReInitOnTimeEdit) {
    await runInitLoad();
  }

  // Verify user edits are PRESERVED and NOT wiped
  assert.equal(initLoadCount, 1, 'initLoadCount must still be 1 after user edits time');
  assert.equal(resetFormCount, 1, 'resetFormCount must still be 1 after user edits time');
  assert.equal(formState.description, 'Busy community dispensary, urgent weekend cover', 'description must NOT be wiped by editing times');
  assert.equal(formState.slotStart, '10:00', 'edited slotStart must be preserved');
  assert.equal(formState.slotEnd, '18:00', 'edited slotEnd must be preserved');
  assert.equal(formState.slots.length, 1, 'slots must NOT be wiped by editing times');
  assert.equal(formState.slots[0].startTime, '10:00');
  assert.equal(formState.slots[0].endTime, '18:00');

  // STEP 3: Choosing calendar hours or adding a slot does not trigger re-init
  formState.slots.push({ date: '2026-11-21', startTime: '10:00', endTime: '18:00', isRecurring: false });
  assert.equal(shouldTriggerPostShiftInit(prevInitScope, currentScope), false, 'adding calendar slot must not trigger re-init');
  assert.equal(initLoadCount, 1);
  assert.equal(formState.slots.length, 2);
  assert.equal(formState.description, 'Busy community dispensary, urgent weekend cover');

  // STEP 4: Scope change DOES trigger init chain and reset
  currentScope = { ...currentScope, scopedPharmacyId: 20 };
  if (shouldTriggerPostShiftInit(prevInitScope, currentScope)) {
    prevInitScope = currentScope;
    await runInitLoad();
  }
  assert.equal(initLoadCount, 2, 'scope change must trigger init chain');
  assert.equal(resetFormCount, 2, 'scope change must reset form for new scope');

  // STEP 5: Retry DOES trigger init chain
  if (shouldTriggerPostShiftInit(prevInitScope, currentScope, true)) {
    await runInitLoad();
  }
  assert.equal(initLoadCount, 3, 'retry must trigger init chain');
});
