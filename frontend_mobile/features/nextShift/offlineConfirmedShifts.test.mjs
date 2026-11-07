import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadOfflineShifts(asyncStorageMock) {
  const source = readFileSync(new URL('./offlineConfirmedShifts.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = {
    exports: {},
    require: (id) => {
      if (id === '@react-native-async-storage/async-storage') return asyncStorageMock;
      if (id === './nextShiftModel') {
        return {
          sanitizeConfirmedShifts: (shifts) => shifts.map((s) => ({
            shiftId: s.id, slotId: 10, pharmacy: 'Test', address: '123 St',
            role: 'Pharmacist', start: '2027-01-01T00:00:00.000Z', end: '2027-01-01T08:00:00.000Z',
            wallStart: '2027-01-01T09:00:00', wallEnd: '2027-01-01T17:00:00', timeZone: 'Australia/Brisbane',
          })),
        };
      }
      throw new Error(`Unexpected import: ${id}`);
    },
    Date, JSON, Number, String, Array,
  };
  runInNewContext(js, scope);
  return scope.exports;
}

function loadSequenceHelper() {
  const source = readFileSync(new URL('../../app/next-shifts.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const scope = {
    exports: {},
    require: (id) => {
      if (id === '@/features/nextShift/nextShiftModel') {
        return {
          calendarEditorUrl: () => '', directionsUrl: () => null, offlineShiftKey: (r) => `${r.shiftId}:${r.slotId}:${r.wallStart}`,
          sanitizeConfirmedShifts: (shifts) => shifts.map((s) => ({ shiftId: s.id, slotId: 10, wallStart: '2027-01-01T09:00:00' })),
          upcomingShifts: (r) => r,
        };
      }
      if (id === '@/features/nextShift/offlineConfirmedShifts') {
        return { readConfirmedShiftSnapshot: async () => null, saveConfirmedShiftSnapshot: async () => {} };
      }
      if (id === '@chemisttasker/shared-core') return { fetchMyConfirmedShifts: async () => [] };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: null }) };
      if (id === '@/constants/tokens') return { colors: { status: { amber: { fg: '#000' } } }, radius: {}, space: {} };
      if (id === 'react') return { useCallback: (f) => f, useEffect: () => {}, useRef: () => ({ current: 0 }), useState: () => [[], () => {}] };
      if (id === '@/components/RootPageHeader') return { RootPageHeader: () => null };
      if (id === 'react-native' || id === 'expo-router' || id === 'react-native-safe-area-context' || id === 'react-native-paper' || id === 'react/jsx-runtime' || id === '@/components/ui/BrandActivityIndicator') {
        return { StyleSheet: { create: (s) => s }, BrandActivityIndicator: 'ActivityIndicator', ActivityIndicator: 'ActivityIndicator' };
      }
      throw new Error(`Unexpected import: ${id}`);
    },
    Date, Promise, Array,
  };
  runInNewContext(js, scope);
  return scope.exports.loadNextShiftsSequence;
}

test('readConfirmedShiftSnapshot returns null on storage rejection without throwing', async () => {
  const storageMock = { getItem: async () => { throw new Error('Simulated AsyncStorage rejection'); } };
  const { readConfirmedShiftSnapshot } = loadOfflineShifts(storageMock);
  const result = await readConfirmedShiftSnapshot(42);
  assert.equal(result, null);
});

test('per-user isolation preserves separate keys', async () => {
  const requestedKeys = [];
  const storageMock = { getItem: async (k) => { requestedKeys.push(k); return null; } };
  const { readConfirmedShiftSnapshot } = loadOfflineShifts(storageMock);
  await readConfirmedShiftSnapshot(101);
  assert.equal(requestedKeys[0], 'ct.offline.confirmed-shifts.v2.101');
});

test('cache read rejection does not block live fetch in next shifts loader', async () => {
  const loadSequence = loadSequenceHelper();
  let liveLoaded = false;
  await loadSequence({
    userId: 42,
    isCurrent: () => true,
    readSnapshot: async () => { throw new Error('Unreadable cache'); },
    fetchLive: async () => [{ id: 77, assignedOccurrences: [{ slotId: 10 }] }],
    onCached: () => {},
    onLive: (rows) => { liveLoaded = true; assert.equal(rows[0].shiftId, 77); },
    onError: (msg) => assert.fail(`Unexpected error: ${msg}`),
  });
  assert.equal(liveLoaded, true);
});

test('slow live fetch displays cached rows immediately while refresh is pending', async () => {
  const loadSequence = loadSequenceHelper();
  const events = [];
  await loadSequence({
    userId: 42,
    isCurrent: () => true,
    readSnapshot: async () => ({ rows: [{ shiftId: 10, slotId: 1, wallStart: '2027-01-01' }], savedAt: '2027-01-01T00:00:00Z' }),
    fetchLive: async () => {
      events.push('fetchStarted');
      await new Promise((r) => setTimeout(r, 10));
      events.push('fetchFinished');
      return [{ id: 20, assignedOccurrences: [{ slotId: 2 }] }];
    },
    onCached: () => events.push('cachedDisplayed'),
    onLive: () => events.push('liveDisplayed'),
    onError: () => {},
  });
  assert.deepEqual(events, ['cachedDisplayed', 'fetchStarted', 'fetchFinished', 'liveDisplayed']);
});

test('stale user completion rejected when user changes mid-flight', async () => {
  const loadSequence = loadSequenceHelper();
  let activeUser = 42;
  let liveCalled = false;
  await loadSequence({
    userId: 42,
    isCurrent: () => activeUser === 42,
    readSnapshot: async () => null,
    fetchLive: async () => {
      activeUser = 99; // account changed while live request was in flight
      return [{ id: 88, assignedOccurrences: [{ slotId: 1 }] }];
    },
    onCached: () => {},
    onLive: () => { liveCalled = true; },
    onError: () => {},
  });
  assert.equal(liveCalled, false);
});
