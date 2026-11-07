process.env.TZ = 'UTC';
// M4-01: actual Vite manager form submits the existing shared pharmacy-wall-time contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jsx = (type, props) => ({ type, props: props || {} });
const file = p => new URL(p, import.meta.url);
function compile(p, modules) {
  const source = readFileSync(file(p), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: p,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, URL, URLSearchParams, console,
    require(id) {
      if (Object.prototype.hasOwnProperty.call(modules, id)) return modules[id];
      throw Error('Unmocked import ' + id + ' in ' + p);
    },
  }, { filename: p });
  return module.exports;
}
const timezonePackages = {
  dayjs: require('dayjs'),
  'dayjs/plugin/utc': require('dayjs/plugin/utc'),
  'dayjs/plugin/utc.js': require('dayjs/plugin/utc'),
  'dayjs/plugin/timezone': require('dayjs/plugin/timezone'),
  'dayjs/plugin/timezone.js': require('dayjs/plugin/timezone'),
};
const sharedPath = '../../../../shared-core/src/utils/correctionTimestamp.ts';
const converter = compile(existsSync(file(sharedPath)) ? sharedPath : './correctionTimestamp.ts',
  timezonePackages).correctionTimestamp;

test('C: web conversion retains exact offset and applies Sydney rollback/Perth wall time', () => {
  assert.equal(converter('2026-07-10T09:00', '2026-07-10T01:00:27+00:00', 'Australia/Perth'),
    '2026-07-10T01:00:27+00:00');
  assert.equal(converter('2026-07-10T09:00', '2026-07-10T00:00:00Z', 'Australia/Perth'),
    '2026-07-10T01:00:00.000Z');
  assert.equal(converter('2026-04-05T02:30', '2026-04-04T12:00:00Z', 'Australia/Sydney'),
    '2026-04-04T15:30:00.000Z');
});

function mount() {
  let index = 0;
  const states = [], effects = [], calls = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
  const react = {
    useState(initial) {
      const i = index++;
      if (!states[i]) states[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [states[i].value, value => {
        states[i].value = typeof value === 'function' ? value(states[i].value) : value;
      }];
    },
    useCallback(fn, deps) {
      const i = index++;
      if (!states[i] || !equal(states[i].deps, deps)) states[i] = { value: fn, deps };
      return states[i].value;
    },
    useEffect(fn, deps) {
      const i = index++;
      if (!states[i] || !equal(states[i].deps, deps)) {
        states[i] = { deps };
        effects.push(fn);
      }
    },
  };
  react.default = react;
  const mui = Object.fromEntries(
    ['Alert', 'Box', 'Button', 'CircularProgress', 'Dialog', 'DialogActions',
      'DialogContent', 'DialogTitle', 'FormControl', 'Grid', 'IconButton',
      'InputLabel', 'MenuItem', 'Paper', 'Select', 'Stack', 'Table', 'TableBody',
      'TableCell', 'TableContainer', 'TableHead', 'TableRow', 'TextField',
      'Tooltip', 'Typography'].map(name => [name, name]));
  const icons = Object.fromEntries(
    ['Check', 'ClipboardCheck', 'History', 'PencilLine', 'RefreshCw', 'X']
      .map(name => [name, name]));
  const pending = [{
    provisional_id: 7, session_id: 8, worker_id: 5,
    worker_name: 'Worker A', worker_email: 'a@example.test',
    started_at: '2026-07-10T00:00:00Z', ended_at: null,
    cover_type: 'UNROSTERED_LOCAL', status: 'PENDING',
  }];
  const attendance = {
    getManagerPending: async pharmacyId => { calls.push(['pending', pharmacyId]); return pending; },
    getManagerTimeline: async sessionId => {
      calls.push(['timeline', sessionId]);
      return {
        session_id: sessionId, pharmacy_id: 23, pharmacy_name: 'Perth A',
        pharmacy_timezone: 'Australia/Perth', worker_name: 'Worker A', is_provisional: true,
        timeline: [{
          event_id: 44, event_type: 'CLOCK_IN',
          original_timestamp: '2026-07-10T00:00:00Z',
          effective_timestamp: '2026-07-10T00:00:00Z',
          is_corrected: false,
        }],
      };
    },
    correct: async (...args) => { calls.push(['correct', ...args]); },
    approve: async () => {}, reject: async () => {},
  };
  const page = compile('./ManagerAttendanceReviewPage.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    ...timezonePackages, '@mui/material': mui, 'lucide-react': icons,
    '@chemisttasker/shared-core': {
      attendance, correctionTimestamp: converter, fetchPharmaciesService: async () => [{ id: 23, name: 'Perth A' }],
      formatAttendanceMinutes: n => n + 'min',
    },
    '../../components/ui/PageHeader': { default: 'PageHeader' },
    './KioskEvidenceReview': { default: 'KioskEvidenceReview' },
    '../../components/dashboard/DashboardContentState': { default: 'DashboardContentState' },
    '../../components/ui/InitialsAvatar': { InitialsAvatar: 'InitialsAvatar' },
    '../../components/ui/Pill': { Pill: 'Pill' },
    '../../components/ui/tone': {},
    '../../utils/labels': { humanizeEnum: text => text },
    './correctionTimestamp': { correctionTimestamp: converter },
  });
  function flatten(node, out = []) {
    if (Array.isArray(node)) node.forEach(n => flatten(n, out));
    else if (node && typeof node === 'object') {
      out.push(node);
      flatten(node.props?.children, out);
    }
    return out;
  }
  function render() {
    index = 0;
    return flatten(page.default());
  }
  async function flush() {
    while (effects.length) effects.shift()();
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  async function stable() {
    for (let i = 0; i < 4; i++) { render(); await flush(); }
    return render();
  }
  const label = node => String(node.props?.children ?? '').trim();
  function click(nodes, text) {
    const button = nodes.find(n => (n.type === 'Button' || n.type === 'IconButton') &&
      (label(n) === text || n.props['aria-label'] === text));
    assert.ok(button, 'Expected rendered action: ' + text);
    assert.notEqual(button.props.disabled, true, 'Expected enabled control: ' + text);
  }
  return { calls, stable, render, flush, label };
}

test('C: clicking Vite event correction sends an ISO instant for the pharmacy timezone', async () => {
  const h = mount();
  let tree = await h.stable();
  const button = (name) => tree.find(node => (node.type === 'Button' || node.type === 'IconButton') &&
    (h.label(node) === name || node.props['aria-label'] === name));
  assert.ok(button('Clock times'));
  await button('Clock times').props.onClick({ type: 'click' });
  tree = await h.stable();
  assert.ok(button('Correct clock_in time'));
  await button('Correct clock_in time').props.onClick({ type: 'click' });
  tree = await h.stable();
  const date = tree.find(n => n.type === 'TextField' && n.props.label === 'Correct date and time');
  const reason = tree.find(n => n.type === 'TextField' && n.props.label === 'Reason' && n.props.placeholder === 'e.g. CCTV shows arrival at 8:55 AM');
  assert.ok(date && reason);
  date.props.onChange({ target: { value: '2026-07-10T09:00' } });
  reason.props.onChange({ target: { value: 'Verified after kiosk outage' } });
  tree = await h.stable();
  assert.ok(button('Save correction'));
  await button('Save correction').props.onClick({ type: 'click' });
  await h.flush();
  assert.deepEqual(h.calls.filter(row => row[0] === 'correct'), [[
    'correct', 44, '2026-07-10T01:00:00.000Z', 'Verified after kiosk outage',
  ]]);
});
