import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// Run the real component and its handlers with a small hook/JSX host; no browser or test dependencies.
function loadComponent(filename, imports) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  new Function('require', 'exports', outputText)((name) => imports[name] ?? require(name), exports);
  return exports;
}

async function dialog() {
  const state = [];
  const effects = [];
  let cursor = 0;
  let pendingEffects = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = value; }];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect(fn, deps) {
      const index = cursor++;
      // fetchTimeline changes identity in this host, so use its stable session inputs.
      const key = deps[0];
      if (effects[index] !== key) {
        effects[index] = key;
        pendingEffects.push(fn);
      }
    },
  };
  const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const mui = Object.fromEntries([
    'Alert', 'Box', 'Button', 'CircularProgress', 'Dialog', 'DialogActions', 'DialogContent',
    'DialogTitle', 'Grid', 'Stack', 'TextField', 'Typography',
  ].map((name) => [name, name]));
  const timeline = [
    { event_id: 1, event_type: 'CLOCK_IN', original_timestamp: '2026-01-05T08:00:00+10:00', effective_timestamp: '2026-01-05T08:00:00+10:00' },
    { event_id: 2, event_type: 'CLOCK_OUT', original_timestamp: '2026-01-05T16:00:00+10:00', effective_timestamp: '2026-01-05T16:00:00+10:00' },
  ];
  const calls = [];
  const failures = { recalc: false, refresh: false, event: null, onSaved: false };
  let closed = 0;
  const attendance = {
    async getManagerTimeline() {
      calls.push('refresh');
      if (failures.refresh) throw new Error('Refresh unavailable');
      return { pharmacy_timezone: 'Australia/Brisbane', timeline: structuredClone(timeline) };
    },
    async correct(id, timestamp) {
      calls.push(['correct', id, timestamp]);
      if (failures.event === id) throw new Error('Correction rejected');
      timeline.find((event) => event.event_id === id).effective_timestamp = timestamp;
    },
  };
  const { correctionTimestamp } = loadComponent('../../pages/attendance/correctionTimestamp.ts', {});
  const { default: Component } = loadComponent('./TimesheetAdjustTimesDialog.tsx', {
    react: hooks, 'react/jsx-runtime': runtime, '@mui/material': mui,
    '@chemisttasker/shared-core': { attendance },
    '../../pages/attendance/correctionTimestamp': { correctionTimestamp },
    './api': { async recalculateTimesheet() {
      calls.push('recalculate');
      if (failures.recalc) throw new Error('Recalculation unavailable');
    } },
  });
  let tree;
  function render() {
    cursor = 0;
    tree = Component({
      open: true, sessionId: 1, timesheetId: 1, day: { date: '2026-01-05' },
      onClose: () => { closed++; },
      onSaved: async () => {
        calls.push('onSaved');
        if (failures.onSaved) throw new Error('Drawer unavailable');
      },
    });
  }
  function find(type, predicate) {
    function visit(node) {
      if (!node || typeof node !== 'object') return null;
      if (node.type === type && predicate(node.props)) return node.props;
      for (const child of [node.props?.children, node.props?.action].flat(Infinity)) {
        const result = visit(child);
        if (result) return result;
      }
      return null;
    }
    const result = visit(tree);
    assert.ok(result, `Missing ${type}`);
    return result;
  }
  render();
  for (const effect of pendingEffects) effect();
  pendingEffects = [];
  await new Promise(setImmediate);
  render();
  return {
    calls, failures, timeline, render,
    get closed() { return closed; },
    field: (label) => find('TextField', (props) => props.label === label),
    save: () => find('Button', (props) => props.children === 'Save adjustments'),
    retry: () => find('Button', (props) => props.children === 'Retry'),
    edit(label, value) { this.field(label).onChange({ target: { value } }); render(); },
    async submit() { await this.save().onClick(); render(); },
  };
}

test('retry after saved corrections and failed recalculation uses the refreshed finish baseline', async () => {
  const ui = await dialog();
  ui.edit('Start', '2026-01-05T09:00');
  ui.edit('Finish', '2026-01-05T17:00');
  ui.edit('Reason', 'Manager reviewed');
  ui.failures.recalc = true;
  await ui.submit();
  assert.equal(ui.closed, 0);
  assert.equal(ui.field('Start').value, '2026-01-05T09:00');
  assert.equal(ui.field('Finish').value, '2026-01-05T17:00');
  assert.ok(ui.calls.lastIndexOf('refresh') < ui.calls.indexOf('recalculate'));
  ui.edit('Finish', '2026-01-05T16:00');
  ui.failures.recalc = false;
  await ui.submit();
  assert.equal(ui.closed, 1);
  assert.deepEqual(ui.calls.filter(Array.isArray).map((call) => call[1]), [2, 1, 2]);
  assert.equal(new Date(ui.timeline[1].effective_timestamp).toISOString(), '2026-01-05T06:00:00.000Z');
});

for (const [start, finish, rejected, saved] of [
  ['09:00', '17:00', 1, 2], // Finish first, then start fails.
  ['07:00', '15:00', 2, 1], // Start first, then finish fails.
]) {
  test(`partial correction failure refreshes saved event ${saved} even if recalculation fails`, async () => {
    const ui = await dialog();
    ui.edit('Start', `2026-01-05T${start}`);
    ui.edit('Finish', `2026-01-05T${finish}`);
    ui.edit('Reason', 'Manager reviewed');
    ui.failures.event = rejected;
    ui.failures.recalc = true;
    await ui.submit();
    assert.equal(ui.closed, 0);
    assert.equal(ui.field(saved === 1 ? 'Start' : 'Finish').value, `2026-01-05T${saved === 1 ? start : finish}`);
    assert.equal(ui.field(rejected === 1 ? 'Start' : 'Finish').value, `2026-01-05T${rejected === 1 ? '08:00' : '16:00'}`);
    ui.failures.event = null;
    ui.failures.recalc = false;
    ui.edit(rejected === 1 ? 'Start' : 'Finish', `2026-01-05T${rejected === 1 ? start : finish}`);
    await ui.submit();
    assert.equal(ui.closed, 1);
    assert.deepEqual(ui.calls.filter(Array.isArray).map((call) => call[1]), [saved, rejected, rejected]);
  });
}

test('failed timeline refresh blocks saves until Retry loads current corrections', async () => {
  const ui = await dialog();
  ui.edit('Start', '2026-01-05T09:00');
  ui.edit('Reason', 'Manager reviewed');
  ui.failures.refresh = true;
  await ui.submit();
  assert.equal(ui.closed, 0);
  assert.equal(ui.save().disabled, true);
  const count = ui.calls.length;
  await ui.submit(); // Also check the handler guard against a stale/programmatic click.
  assert.equal(ui.calls.length, count);
  ui.failures.refresh = false;
  ui.retry().onClick();
  await new Promise(setImmediate);
  ui.render();
  assert.equal(ui.field('Start').value, '2026-01-05T09:00');
  ui.edit('Finish', '2026-01-05T17:00');
  assert.equal(ui.save().disabled, false);
  await ui.submit();
  assert.equal(ui.closed, 1);
});

test('successful correction refreshes, recalculates and closes', async () => {
  const ui = await dialog();
  ui.edit('Finish', '2026-01-05T17:00');
  ui.edit('Reason', 'Manager reviewed');
  await ui.submit();
  assert.equal(ui.closed, 1);
  assert.deepEqual(ui.calls.map((call) => Array.isArray(call) ? call[0] : call), [
    'refresh', 'correct', 'refresh', 'recalculate', 'onSaved',
  ]);
});
