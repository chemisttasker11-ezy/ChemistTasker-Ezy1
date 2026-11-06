import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, extra = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, URL, URLSearchParams, require: (n) => extra[n] || {} });
  return exports;
}

const helpers = load('./PostShiftScreen.helpers.ts', { '@chemisttasker/shared-core': {} });
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

test('slot validation covers missing/reversed time, recurrence, bad global vs overrides', () => {
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '', endTime: '17:00' }), /start and finish/);
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '09:00garbage', endTime: '17:00' }), /start and finish/);
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '17:00', endTime: '09:00' }), /after the start/);
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '09:00', endTime: '09:00' }), /after the start/);
  assert.equal(validateSlotEntry({ date: '2026-11-20', startTime: '09:00', endTime: '17:00', isRecurring: true, recurringDays: [1], recurringEndDate: '2026-12-01' }), null);
  assert.match(validateSlotEntry({ date: '2026-11-20', startTime: '09:00', endTime: '17:00', isRecurring: true, recurringDays: [] }), /repeats until/);

  const badGlobal = { startTime: '17:00', endTime: '09:00' };
  const overrides = { '2026-11-20': { startTime: '09:00', endTime: '17:00' }, '2026-11-21': { startTime: '10:00', endTime: '18:00' } };
  const validBulk = ['2026-11-20', '2026-11-21'].map((d) => ({ date: d, ...(overrides[d] || badGlobal), isRecurring: false, recurringDays: [], recurringEndDate: '' }));
  assert.equal(validateSlotEntries(validBulk), null);

  const mixed = [{ date: '2026-11-20', startTime: '09:00', endTime: '17:00' }, { date: '2026-11-21', startTime: '18:00', endTime: '10:00' }];
  assert.match(validateSlotEntries(mixed), /after the start/);
});

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
