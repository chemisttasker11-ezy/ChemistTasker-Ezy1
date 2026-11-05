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

const plain = (val) => JSON.parse(JSON.stringify(val));

const runtime = loadTs('./ActiveShiftsPage/utils/activeShiftRuntime.ts', {
  '@chemisttasker/shared-core': {},
});
const surface = loadTs('./shiftSurface.ts');

const {
  getShiftPharmacyId,
  filterShiftsByPharmacy,
  isCandidateLevelVisible,
  mergeSlotSignatures,
  getNextGeneration,
  isLatestGeneration,
  buildActiveShiftsScopeKey,
} = runtime;

const { resolveShiftSurface } = surface;

// ==========================================
// 1. Candidate Level Visibility
// ==========================================
test('candidate level visibility: earlier levels are visible, future levels are hidden', () => {
  // When shift is at LOCUM_CASUAL, FULL_PART_TIME and LOCUM_CASUAL are viewable; PLATFORM is not
  assert.equal(isCandidateLevelVisible('FULL_PART_TIME', 'LOCUM_CASUAL'), true);
  assert.equal(isCandidateLevelVisible('LOCUM_CASUAL', 'LOCUM_CASUAL'), true);
  assert.equal(isCandidateLevelVisible('OWNER_CHAIN', 'LOCUM_CASUAL'), false);
  assert.equal(isCandidateLevelVisible('ORG_CHAIN', 'LOCUM_CASUAL'), false);
  assert.equal(isCandidateLevelVisible('PLATFORM', 'LOCUM_CASUAL'), false);

  // When shift reaches PLATFORM, all levels in the sequence are viewable
  assert.equal(isCandidateLevelVisible('FULL_PART_TIME', 'PLATFORM'), true);
  assert.equal(isCandidateLevelVisible('LOCUM_CASUAL', 'PLATFORM'), true);
  assert.equal(isCandidateLevelVisible('OWNER_CHAIN', 'PLATFORM'), true);
  assert.equal(isCandidateLevelVisible('ORG_CHAIN', 'PLATFORM'), true);
  assert.equal(isCandidateLevelVisible('PLATFORM', 'PLATFORM'), true);

  // At FULL_PART_TIME, only FULL_PART_TIME is viewable
  assert.equal(isCandidateLevelVisible('FULL_PART_TIME', 'FULL_PART_TIME'), true);
  assert.equal(isCandidateLevelVisible('LOCUM_CASUAL', 'FULL_PART_TIME'), false);
});

test('candidate level visibility: precedence swap test fails', () => {
  // Swapping target level and current level changes visibility result
  const current = 'LOCUM_CASUAL';
  const target = 'PLATFORM';
  assert.equal(isCandidateLevelVisible(target, current), false, 'target PLATFORM is not visible when shift is at LOCUM_CASUAL');
  assert.equal(isCandidateLevelVisible(current, target), true, 'target LOCUM_CASUAL is visible when shift is at PLATFORM');
});

test('candidate level visibility: respects allowedLevels restriction', () => {
  const allowed = ['LOCUM_CASUAL', 'PLATFORM'];
  // FULL_PART_TIME is excluded by allowedLevels
  assert.equal(isCandidateLevelVisible('FULL_PART_TIME', 'PLATFORM', allowed), false);
  assert.equal(isCandidateLevelVisible('LOCUM_CASUAL', 'PLATFORM', allowed), true);
  assert.equal(isCandidateLevelVisible('PLATFORM', 'PLATFORM', allowed), true);
});

// ==========================================
// 2. Slot Signature Merge & Update Tracking
// ==========================================
test('slot signature merge: baseline initialization creates signatures with no update flags', () => {
  const seen = {};
  const currentSignatures = {
    '10:PLATFORM:1': { shiftId: 10, slotId: 1, signature: 'i:100:1#o:200:PENDING' },
    '10:PLATFORM:2': { shiftId: 10, slotId: 2, signature: 'i:101:1#o:none' },
  };

  const { mergedSeen, updatesByShift } = mergeSlotSignatures(seen, currentSignatures);

  assert.deepEqual(plain(mergedSeen), {
    '10:PLATFORM:1': 'i:100:1#o:200:PENDING',
    '10:PLATFORM:2': 'i:101:1#o:none',
  });
  // Baseline initialization must never show a false update dot
  assert.deepEqual(plain(updatesByShift), {});
});

test('slot signature merge: detects changed signature and marks the exact slot updated', () => {
  const seen = {
    '10:PLATFORM:1': 'i:100:1#o:200:PENDING',
    '10:PLATFORM:2': 'i:101:1#o:none',
  };

  // Slot 2 gets a new candidate interest, altering its signature
  const nextSignatures = {
    '10:PLATFORM:1': { shiftId: 10, slotId: 1, signature: 'i:100:1#o:200:PENDING' },
    '10:PLATFORM:2': { shiftId: 10, slotId: 2, signature: 'i:101:1|102:0#o:none' },
  };

  const { mergedSeen, updatesByShift } = mergeSlotSignatures(seen, nextSignatures);

  // Slot 1 has no changes
  assert.equal(updatesByShift[10]?.[1], undefined);
  // Slot 2 has an update
  assert.equal(updatesByShift[10]?.[2], true);
  // Seen remains intact until marked seen
  assert.equal(mergedSeen['10:PLATFORM:2'], 'i:101:1#o:none');
});

test('slot signature merge: multi-shift isolation', () => {
  const seen = {
    '10:PLATFORM:1': 'sig10_1',
    '20:PLATFORM:5': 'sig20_5',
  };

  const nextSignatures = {
    '10:PLATFORM:1': { shiftId: 10, slotId: 1, signature: 'sig10_1' },
    '20:PLATFORM:5': { shiftId: 20, slotId: 5, signature: 'sig20_5_changed' },
  };

  const { updatesByShift } = mergeSlotSignatures(seen, nextSignatures);

  assert.equal(updatesByShift[10], undefined, 'shift 10 had no updates');
  assert.equal(updatesByShift[20]?.[5], true, 'shift 20 slot 5 marked updated');
});

// ==========================================
// 3. Scope Keying & Pharmacy Filtering
// ==========================================
test('pharmacy filtering: extracts pharmacy ID from diverse backend representations', () => {
  assert.equal(getShiftPharmacyId({ pharmacyDetail: { id: 42 } }), 42);
  assert.equal(getShiftPharmacyId({ pharmacy_detail: { id: 55 } }), 55);
  assert.equal(getShiftPharmacyId({ pharmacyId: 17 }), 17);
  assert.equal(getShiftPharmacyId({ pharmacy_id: 23 }), 23);
  assert.equal(getShiftPharmacyId({ pharmacy: 8 }), 8);
  assert.equal(getShiftPharmacyId(null), null);
  assert.equal(getShiftPharmacyId({}), null);
});

test('pharmacy filtering: scopes shift lists by pharmacy ID', () => {
  const shifts = [
    { id: 1, pharmacyDetail: { id: 4 } },
    { id: 2, pharmacyDetail: { id: 9 } },
    { id: 3, pharmacy_detail: { id: 4 } },
    { id: 4, pharmacy: 7 },
  ];

  // When pharmacyId is null (all pharmacies)
  assert.equal(filterShiftsByPharmacy(shifts, null).length, 4);

  // When scoped to pharmacy 4
  const scoped4 = filterShiftsByPharmacy(shifts, 4);
  assert.equal(scoped4.length, 2);
  assert.deepEqual(scoped4.map(s => s.id), [1, 3]);

  // When scoped to pharmacy 9
  const scoped9 = filterShiftsByPharmacy(shifts, 9);
  assert.equal(scoped9.length, 1);
  assert.equal(scoped9[0].id, 2);

  // When scoped to a pharmacy with no shifts
  const scoped99 = filterShiftsByPharmacy(shifts, 99);
  assert.equal(scoped99.length, 0);

  // Empty list returns empty list
  assert.equal(filterShiftsByPharmacy([], 4).length, 0);
});

test('scope keying: surface keys differ per scope and persona for isolated caching', () => {
  const ownerPharm4 = resolveShiftSurface({ pathname: '/owner/shifts', role: 'OWNER', userId: 1, selectedPharmacyId: 4 });
  const ownerPharm9 = resolveShiftSurface({ pathname: '/owner/shifts', role: 'OWNER', userId: 1, selectedPharmacyId: 9 });
  const adminPharm7 = resolveShiftSurface({
    pathname: '/admin/shifts', role: 'PHARMACY_ADMIN', userId: 3, adminPharmacyId: 7,
  });

  assert.equal(ownerPharm4.scopeKey, 'owner:all:4:1');
  assert.equal(ownerPharm9.scopeKey, 'owner:all:9:1');
  assert.equal(adminPharm7.scopeKey, 'admin:all:7:3');

  // Changing pharmacy scope produces distinct keys, preventing stale response leakage
  assert.notEqual(ownerPharm4.scopeKey, ownerPharm9.scopeKey);
  assert.notEqual(ownerPharm4.scopeKey, adminPharm7.scopeKey);
});
// ==========================================
// 4. Request Generations & Scope Key Isolation
// ==========================================
test('request generations: tracks generation per key independently and increments sequentially', () => {
  const generations = {};
  const genA1 = getNextGeneration(generations, 'shift_1');
  const genB1 = getNextGeneration(generations, 'shift_2');
  const genA2 = getNextGeneration(generations, 'shift_1');

  assert.equal(genA1, 1);
  assert.equal(genB1, 1);
  assert.equal(genA2, 2);

  // shift_1 at genA1 is stale
  assert.equal(isLatestGeneration(generations, 'shift_1', genA1), false);
  // shift_1 at genA2 is current
  assert.equal(isLatestGeneration(generations, 'shift_1', genA2), true);
  // shift_2 at genB1 is current
  assert.equal(isLatestGeneration(generations, 'shift_2', genB1), true);
  // unrecorded generation or key is never latest
  assert.equal(isLatestGeneration(generations, 'shift_3', 1), false);
});

test('request generations: race condition resolution lets latest generation win', () => {
  const generations = {};
  // Call 1 initiates
  const call1Gen = getNextGeneration(generations, 'candidates_42_PLATFORM');
  // Call 2 initiates before Call 1 finishes
  const call2Gen = getNextGeneration(generations, 'candidates_42_PLATFORM');

  // When Call 1 arrives late, it must be rejected
  assert.equal(isLatestGeneration(generations, 'candidates_42_PLATFORM', call1Gen), false);
  // When Call 2 arrives, it must be accepted
  assert.equal(isLatestGeneration(generations, 'candidates_42_PLATFORM', call2Gen), true);
});

test('scope keying: buildActiveShiftsScopeKey binds surface scope with shiftId', () => {
  const allShiftsKey = buildActiveShiftsScopeKey('owner:all:4:1', null);
  const shift42Key = buildActiveShiftsScopeKey('owner:all:4:1', 42);
  const shift99Key = buildActiveShiftsScopeKey('owner:all:4:1', 99);
  const otherScopeKey = buildActiveShiftsScopeKey('owner:all:9:1', 42);

  assert.equal(allShiftsKey, 'owner:all:4:1:all');
  assert.equal(shift42Key, 'owner:all:4:1:shift:42');
  assert.equal(shift99Key, 'owner:all:4:1:shift:99');

  // Key differs when shiftId changes (preventing shift-detail card/dialog bleed)
  assert.notEqual(shift42Key, shift99Key);
  assert.notEqual(shift42Key, allShiftsKey);

  // Key differs when scopeKey changes (preventing pharmacy/workspace switch bleed)
  assert.notEqual(shift42Key, otherScopeKey);
});
