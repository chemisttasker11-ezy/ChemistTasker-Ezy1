import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-07T12:00:00'])); }
  static now() { return new Date('2026-11-07T12:00:00').getTime(); }
}

function load(file, extra = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, URL, URLSearchParams, Date: FixedDate, require: (n) => extra[n] || {} });
  return exports;
}

const posting = load('../../../../shared-core/src/domains/shifts/postingDraft.ts');
const windowPolicy = load('../../../../shared-core/src/domains/shifts/postingWindow.ts');
const helpers = load('./PostShiftScreen.helpers.ts', { '@chemisttasker/shared-core': { ...posting, ...windowPolicy } });
const { validateSlotEntry, validateSlotEntries } = helpers;

const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat() } }) };
const progress = load('./PostShiftProgress.tsx', {
  react: { __esModule: true, default: React },
  'react-native': { Pressable: 'Pressable', StyleSheet: { create: (s) => s }, View: 'View' },
  'react-native-paper': { Text: 'Text' },
  'lucide-react-native': new Proxy({}, { get: () => () => null }),
  '@/constants/tokens': { colors: { tone: { blue: {}, cyan: {}, magenta: {} } }, radius: {}, space: {}, touch: { min: 44 }, type: new Proxy({}, { get: () => ({}) }) },
  './PostShiftScreen.helpers': helpers,
}).default;

test('slot validation covers missing/equal time, recurrence, bad global vs overrides', () => {
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '', endTime: '17:00' }), /start and finish/);
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '09:00garbage', endTime: '17:00' }), /start and finish/);
  assert.equal(validateSlotEntry({ date: '2026-11-20', startTime: '17:00', endTime: '09:00' }), null);
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '09:00', endTime: '09:00' }), /cannot be the same/);
  assert.equal(validateSlotEntry({ date: '2026-11-20', startTime: '09:00', endTime: '17:00', isRecurring: true, recurringDays: [1], recurringEndDate: '2026-12-01' }), null);
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '09:00', endTime: '17:00', isRecurring: true, recurringDays: [] }), /repeats until/);

  const badGlobal = { startTime: '09:00', endTime: '09:00' };
  const overrides = { '2026-11-20': { startTime: '09:00', endTime: '17:00' }, '2026-11-21': { startTime: '10:00', endTime: '18:00' } };
  const validBulk = ['2026-11-20', '2026-11-21'].map((d) => ({ date: d, ...(overrides[d] || badGlobal), isRecurring: false, recurringDays: [], recurringEndDate: '' }));
  assert.equal(validateSlotEntries(validBulk), null);

  const mixed = [{ date: '2026-11-20', startTime: '09:00', endTime: '17:00' }, { date: '2026-11-21', startTime: '18:00', endTime: '10:00' }];
  assert.equal(validateSlotEntries(mixed), null);
});

// Execute the screen's actual add callbacks with state setters captured for assertions.
const screen = readFileSync(new URL('./PostShiftScreen.tsx', import.meta.url), 'utf8');
const addCallbacks = screen.slice(screen.indexOf('    const addSlotEntries ='), screen.indexOf('    const removeSlot ='));
function addSlot(path, times) {
  const state = { slots: [], error: '' };
  const date = '2026-11-20';
  const { outputText } = ts.transpileModule(`${addCallbacks}\nexports.result = ${path === 'bulk' ? 'addAllSelectedSlots()' : path === 'per-date' ? 'addSelectedDateSlot(slotDate)' : 'addManualSlot()'};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, validateSlotEntries, pharmacyToday: () => '2026-11-07', toLocalIsoDate: helpers.toLocalIsoDate,
    splitPostableDates: windowPolicy.splitPostableDates, postingWindow: { minIso: '2026-11-07' },
    slots: [], slotDate: date, slotStart: path === 'bulk' || path === 'per-date' ? '09:00' : times.startTime,
    slotEnd: path === 'bulk' || path === 'per-date' ? '09:00' : times.endTime,
    slotRecurring: path === 'recurring', slotRecurringDays: [5], slotRecurringEnd: '2026-12-04',
    selectedDates: [date, '2026-11-21'], selectedDateTimes: { [date]: times, '2026-11-21': times },
    setSlots: (update) => { state.slots = update(state.slots); },
    setError: (error) => { state.error = error; },
    setToast: () => {}, setSelectedDates: () => {}, setSelectedDateTimes: () => {},
    setSlotRecurring: () => {}, setSlotRecurringDays: () => {}, setSlotRecurringEnd: () => {},
  });
  return { ...state, result: exports.result };
}

for (const path of ['single', 'per-date', 'bulk', 'recurring']) {
  test(`${path} additions accept overnight slots and remain valid for posting`, () => {
    for (const times of [{ startTime: '22:00', endTime: '06:00' }, { startTime: '22:00:00', endTime: '06:00:00' }]) {
      const state = addSlot(path, times);
      assert.equal(state.result, true, state.error);
      assert.equal(state.error, '');
      assert.equal(state.slots.length, path === 'bulk' ? 2 : 1);
      for (const slot of state.slots) {
        assert.equal(slot.startTime, times.startTime);
        assert.equal(slot.endTime, times.endTime);
        assert.equal(slot.isRecurring, path === 'recurring');
      }
      assert.equal(posting.validateShiftPostingDraft({ pharmacyId: 1, roleNeeded: 'PHARMACIST', employmentType: 'LOCUM', slots: state.slots }), null);
    }
  });

  test(`${path} additions still reject equal and malformed times`, () => {
    for (const times of [
      { startTime: '22:00', endTime: '22:00' },
      { startTime: '22:00:00', endTime: '22:00:30' },
      { startTime: '', endTime: '06:00' },
      { startTime: '22:00', endTime: '' },
      { startTime: '24:00', endTime: '06:00' },
      { startTime: '22:00', endTime: '06:60' },
      { startTime: '22:00garbage', endTime: '06:00' },
      { startTime: '22:00', endTime: '06:00garbage' },
    ]) {
      const state = addSlot(path, times);
      assert.equal(state.result, false, JSON.stringify(times));
      assert.ok(state.error);
      assert.equal(state.slots.length, 0);
    }
  });
}

test('progress bar honest step accessibility: past navigable, current selected, future disabled', () => {
  const steps = ['details', 'skills', 'visibility'];
  const tree = progress({ steps, active: 'skills', onSelect: () => {} });
  const segments = tree.props.children[1].props.children;
  assert.equal(segments[0].props.accessibilityLabel, 'Go to Details');
  assert.equal(segments[0].props.accessibilityState.disabled, false);
  assert.equal(segments[1].props.accessibilityState.selected, true);
  assert.equal(segments[2].props.disabled, true);
  assert.equal(segments[2].props.accessibilityState.disabled, true);
  assert.equal(segments[2].props.accessibilityLabel, 'Who sees it');
});
