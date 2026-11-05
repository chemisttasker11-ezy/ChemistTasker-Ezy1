import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
    },
  });
  const result = {};
  const rnStub = {
    StyleSheet: { create: (s) => s },
    Platform: { select: (p) => p.default ?? p.ios ?? p.android, OS: 'ios' },
    View: () => null,
    Text: () => null,
    ScrollView: () => null,
    Pressable: () => null,
    TouchableOpacity: () => null,
    useWindowDimensions: () => ({ width: 375, height: 812 }),
    Linking: { openURL: () => Promise.resolve() },
  };
  const dummyTokens = {
    colors: {
      brandNavy: '#06214A',
      primary: '#5222B8',
      primarySoft: '#EFE7FF',
      accentStrong: '#3C18A8',
      border: '#E5ECF7',
      surfaceBg: '#FFFFFF',
      subtleBg: '#F7F8FC',
      textPrimary: '#06123A',
      textSecondary: '#5E6B8D',
      textMuted: '#63708C',
      status: {
        green: { bg: '#E4F5EA', fg: '#17663A', solid: '#117A50' },
        amber: { bg: '#FDF0D9', fg: '#8A4B00', solid: '#A15C07' },
        red: { bg: '#FDE8E7', fg: '#B42318', solid: '#C9364A' },
      },
      tone: {
        magenta: { bg: '#FCE6F8', fg: '#A3008F' },
        blue: { bg: '#E6F1FC', fg: '#0063A8' },
      },
    },
    radius: { sheet: 24, card: 20, banner: 20, nested: 14, control: 12, pill: 999 },
    space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
  };
  vm.runInNewContext(outputText, {
    exports: result,
    module: { exports: result },
    require: (name) => {
      if (name in imports) return imports[name];
      if (name === 'react-native') return rnStub;
      if (name === 'react') return { useState: () => [null, () => {}], useEffect: () => {}, useCallback: (f) => f, useRef: () => ({ current: 0 }) };
      if (name === 'react-native-paper') return { Button: () => null, Card: () => null, Chip: () => null, Surface: () => null, Text: () => null, Dialog: () => null, Portal: () => null, Snackbar: () => null, ActivityIndicator: () => null, TextInput: () => null };
      if (name === 'lucide-react-native') return new Proxy({}, { get: () => () => null });
      if (name === 'expo-router') return { useRouter: () => ({ push: () => {} }) };
      if (name === '@/constants/tokens') return dummyTokens;
      if (name.startsWith('@/')) return {};
      if (name === '@chemisttasker/shared-core') return {};
      return {};
    },
    console,
  });
  return result;
}

const chatRoutes = loadTs('../../../utils/chatRoutes.ts');
const confirmedModule = loadTs('./ConfirmedShiftsView.tsx');
const boardModule = loadTs('./OwnerAssignedShiftBoard.tsx');
const bookedModule = loadTs('./WorkerBookedShifts.tsx');
const surfaceModule = loadTs('./shiftSurface.ts');
const logicModule = loadTs('./shiftsScreenLogic.ts', { './shiftSurface': surfaceModule });
const historyOwnerModule = loadTs('./HistoryShiftsView.tsx', {
  './ConfirmedShiftsView': confirmedModule,
  './OwnerAssignedShiftBoard': boardModule,
  './shiftsScreenLogic': logicModule,
});
const historyWorkerModule = loadTs('./WorkerHistoryShiftsView.tsx', {
  './HistoryShiftsView': historyOwnerModule,
  './WorkerBookedShifts': bookedModule,
  './shiftsScreenLogic': logicModule,
});
const profileModule = loadTs('./WorkerProfileDialog.tsx', { '@/utils/chatRoutes': chatRoutes });

const { filterShiftsByPharmacy, filterDeferredPayrollOffers } = confirmedModule;
const {
  filterWorkerShiftsByWorkspace,
  isRatingSaveDisabled,
  shouldApplyRatingResponse,
  createInitialRatingState,
} = historyOwnerModule;
const { buildWorkerInvoicePath } = historyWorkerModule;
const { resolveAssignedProfileRoute } = profileModule;
const {
  formatSlotLockedRate,
  formatTimeRange,
  formatDateLabel,
  getAssignedName,
  getAssignedDetails,
} = boardModule;
const { pharmacyAddress, humanize, clock } = bookedModule;

test('filterShiftsByPharmacy scopes shifts to selected pharmacy and handles various shapes', () => {
  const shifts = [
    { id: 1, pharmacyDetail: { id: 10 } },
    { id: 2, pharmacyId: 10 },
    { id: 3, pharmacy: 20 },
    { id: 4, pharmacyDetail: { id: 30 } },
  ];

  // When scopedPharmacyId is null, all shifts are returned
  assert.equal(filterShiftsByPharmacy(shifts, null).length, 4);

  // Scoped to pharmacy 10: matches shift 1 and 2
  const scoped10 = filterShiftsByPharmacy(shifts, 10);
  assert.equal(scoped10.length, 2);
  assert.deepEqual([...scoped10.map((s) => s.id)], [1, 2]);

  // Scoped to pharmacy 20: matches shift 3
  const scoped20 = filterShiftsByPharmacy(shifts, 20);
  assert.equal(scoped20.length, 1);
  assert.equal(scoped20[0].id, 3);

  // Handles non-array gracefully
  assert.equal(filterShiftsByPharmacy(null, 10).length, 0);
});

test('filterDeferredPayrollOffers selects only pending TFN shifts matching pharmacy', () => {
  const offers = [
    {
      id: 101,
      paymentPreferenceSnapshot: 'TFN',
      engagementKind: 'SHIFT_EMPLOYMENT',
      settlementChannel: 'TIMESHEET_ONLY',
      engagementTermsSnapshot: { payrollActivationRequired: true, pharmacyId: 5, workerName: 'Alice' },
      payrollActivatedAt: null,
    },
    {
      id: 102,
      paymentPreferenceSnapshot: 'ABN', // Not TFN
      engagementKind: 'SHIFT_EMPLOYMENT',
      settlementChannel: 'TIMESHEET_ONLY',
      engagementTermsSnapshot: { payrollActivationRequired: true, pharmacyId: 5 },
      payrollActivatedAt: null,
    },
    {
      id: 103,
      paymentPreferenceSnapshot: 'TFN',
      engagementKind: 'SHIFT_EMPLOYMENT',
      settlementChannel: 'TIMESHEET_ONLY',
      engagementTermsSnapshot: { payrollActivationRequired: true, pharmacyId: 5 },
      payrollActivatedAt: '2026-11-01T10:00:00Z', // Already activated
    },
    {
      id: 104,
      paymentPreferenceSnapshot: 'TFN',
      engagementKind: 'SHIFT_EMPLOYMENT',
      settlementChannel: 'TIMESHEET_ONLY',
      engagementTermsSnapshot: { payrollActivationRequired: true, pharmacyId: 9 },
      payrollActivatedAt: null,
    },
  ];

  // Scoped to pharmacy 5
  const for5 = filterDeferredPayrollOffers(offers, 5);
  assert.equal(for5.length, 1);
  assert.equal(for5[0].id, 101);

  // Unscoped: includes both pharmacy 5 and 9
  const all = filterDeferredPayrollOffers(offers, null);
  assert.equal(all.length, 2);
  assert.deepEqual([...all.map((o) => o.id)], [101, 104]);

  // Invalid input
  assert.equal(filterDeferredPayrollOffers(undefined, 5).length, 0);
});

test('filterWorkerShiftsByWorkspace filters internal workspace by selected pharmacy and preserves platform shifts', () => {
  const shifts = [
    { id: 1, pharmacyDetail: { id: 10 } },
    { id: 2, pharmacyId: 10 },
    { id: 3, pharmacy: 20 },
    { id: 4, pharmacyDetail: { id: 30 } },
  ];

  // Internal workspace with pharmacy 10: only matching shifts
  const internal10 = filterWorkerShiftsByWorkspace(shifts, 'internal', 10);
  assert.equal(internal10.length, 2);
  assert.deepEqual(internal10.map((s) => s.id), [1, 2]);

  // Internal workspace without selected pharmacy: returns all
  const internalAll = filterWorkerShiftsByWorkspace(shifts, 'internal', null);
  assert.equal(internalAll.length, 4);

  // Platform workspace: returns all shifts even if a pharmacy is selected
  const platform10 = filterWorkerShiftsByWorkspace(shifts, 'platform', 10);
  assert.equal(platform10.length, 4);

  // Null/undefined workspace: returns all
  assert.equal(filterWorkerShiftsByWorkspace(shifts, null, 10).length, 4);

  // Non-array input: safe empty array
  assert.equal(filterWorkerShiftsByWorkspace(null, 'internal', 10).length, 0);
});

test('isRatingSaveDisabled correctly disables Save button during loading, error, saving, or 0 stars', () => {
  // Enabled only when stars > 0 and no loading/saving/error
  assert.equal(isRatingSaveDisabled({ loading: false, saving: false, stars: 5, hasError: false }), false);
  assert.equal(isRatingSaveDisabled({ loading: false, saving: false, stars: 1, hasError: false }), false);

  // Disabled when 0 stars
  assert.equal(isRatingSaveDisabled({ loading: false, saving: false, stars: 0, hasError: false }), true);

  // Disabled while loading
  assert.equal(isRatingSaveDisabled({ loading: true, saving: false, stars: 5, hasError: false }), true);

  // Disabled while saving
  assert.equal(isRatingSaveDisabled({ loading: false, saving: true, stars: 5, hasError: false }), true);

  // Disabled when error
  assert.equal(isRatingSaveDisabled({ loading: false, saving: false, stars: 5, hasError: true }), true);
});

test('shouldApplyRatingResponse guards completion against generation bumps and target changes', () => {
  // Same generation, same target: applies
  assert.equal(shouldApplyRatingResponse(1, 1, 42, 42), true);

  // Stale generation: does not apply
  assert.equal(shouldApplyRatingResponse(2, 1, 42, 42), false);

  // Target changed while request was in-flight: does not apply
  assert.equal(shouldApplyRatingResponse(1, 1, 42, 99), false);

  // Target dismissed (null): does not apply
  assert.equal(shouldApplyRatingResponse(1, 1, null, 42), false);
  assert.equal(shouldApplyRatingResponse(1, 1, 42, null), false);
});

test('createInitialRatingState initializes pristine target state with loading true and 0 stars', () => {
  const target = { id: 10, name: 'Test Pharmacy' };
  const state = createInitialRatingState(target);
  assert.equal(state.target.id, 10);
  assert.equal(state.target.name, 'Test Pharmacy');
  assert.equal(state.stars, 0);
  assert.equal(state.comment, '');
  assert.equal(state.loading, true);
  assert.equal(state.error, null);
  assert.equal(state.saving, false);
});

test('buildWorkerInvoicePath creates valid invoice route only when route is provided', () => {
  assert.equal(
    buildWorkerInvoicePath('/pharmacist/invoice/new', 42, 10),
    '/pharmacist/invoice/new?shiftId=42&pharmacyId=10',
  );
  assert.equal(
    buildWorkerInvoicePath('/otherstaff/invoice/new', 55, null),
    '/otherstaff/invoice/new?shiftId=55&pharmacyId=',
  );
  // Explorer has no invoiceRoute -> returns null, button is omitted
  assert.equal(buildWorkerInvoicePath(undefined, 42, 10), null);
  assert.equal(buildWorkerInvoicePath('', 42, 10), null);
});

test('resolveAssignedProfileRoute honors surface persona so delegated admins stay in /admin', () => {
  // Delegated admin: role is PHARMACIST, but surface persona is 'admin'
  assert.equal(
    resolveAssignedProfileRoute('PHARMACIST', 88, 'admin'),
    '/admin/messages/88',
  );
  // Owner stays in owner shell
  assert.equal(
    resolveAssignedProfileRoute('OWNER', 99, 'owner'),
    '/owner/messages/99',
  );
  // Fallback to role when persona is omitted
  assert.equal(
    resolveAssignedProfileRoute('PHARMACIST', 77, null),
    '/pharmacist/messages/77',
  );
});

test('formatSlotLockedRate handles numeric, string, and null rates', () => {
  assert.equal(formatSlotLockedRate({ rate: 75 }), '$75/hr locked');
  assert.equal(formatSlotLockedRate({ hourlyRate: '68.50' }), '$68.5/hr locked');
  assert.equal(formatSlotLockedRate({ hourly_rate: 80 }), '$80/hr locked');
  assert.equal(formatSlotLockedRate({ rate: null }), 'Rate locked');
  assert.equal(formatSlotLockedRate({}), 'Rate locked');
});

test('formatTimeRange and formatDateLabel format slot timings correctly', () => {
  const slot = { startTime: '09:00:00', endTime: '17:30:00', date: '2026-11-10' };
  assert.equal(formatTimeRange(slot), '09:00 - 17:30');
  const dateResult = formatDateLabel(slot.date);
  assert.ok(dateResult.day.length > 0);
  assert.ok(dateResult.date.length > 0);
  const nullDate = formatDateLabel(null);
  assert.equal(nullDate.day, 'TBD');
  assert.equal(nullDate.date, '--');
});

test('getAssignedName and getAssignedDetails resolve candidate info safely', () => {
  const assignment = { user: { firstName: 'Sarah', lastName: 'Connor', email: 'sarah@test.com' } };
  assert.equal(getAssignedName(assignment, null), 'Sarah Connor');
  assert.equal(getAssignedDetails(assignment, null), 'sarah@test.com');

  const fallback = { user: {} };
  const member = { userFirstName: 'John', userLastName: 'Doe', role: 'Pharmacist' };
  assert.equal(getAssignedName(fallback, member), 'John Doe');
  assert.equal(getAssignedDetails(fallback, member), 'Pharmacist');

  assert.equal(getAssignedName(null, null), 'Assigned candidate');
  assert.equal(getAssignedDetails(null, null), 'Profile locked to this slot');
});

test('WorkerBookedShifts pure helpers format address, time, and text labels', () => {
  const p = { streetAddress: '123 High St', suburb: 'Prahran', state: 'VIC', postcode: '3181' };
  assert.equal(pharmacyAddress(p), '123 High St, Prahran, VIC, 3181');
  assert.equal(pharmacyAddress(null), '');

  assert.equal(clock('08:30:00'), '08:30');
  assert.equal(clock(null), '--');

  assert.equal(humanize('COMMUNITY_PHARMACIST'), 'Community pharmacist');
  assert.equal(humanize(''), '');
});
