import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function nodes(node, type) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (typeof node !== 'object') return [];
  if (node.props?.hidden || (node.type === 'Dialog' && !node.props.open)) return [];
  return [...(!type || node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (node.props?.hidden || (node.type === 'Dialog' && !node.props.open)) return '';
  return text(node.props?.children);
}
function load(relative, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, console, ...globals,
    require(name) { assert.ok(name in imports, `Unmocked worker dependency: ${name}`); return imports[name]; },
  });
  return exports;
}
const { formatAttendanceMinutes } = load('../../../../shared-core/src/utils/attendanceDisplay.ts');
const emptyPhrases = [/accepted\s+(?:staff\s+)?membership/i, /booked locums/i, /mobile app/i];

async function worker({ active = false, saveError = null, status = {} } = {}) {
  const state = [], deps = [];
  let cursor = 0, dirty = true, effects = [], tree, timer, resolvePin, rejectPin, pinLoads = 0;
  const pinResponse = new Promise((resolve, reject) => { resolvePin = resolve; rejectPin = reject; });
  let now = Date.parse('2026-10-29T07:05:00Z');
  class ControlledDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => {
        const next = typeof value === 'function' ? value(state[index]) : value;
        if (!Object.is(next, state[index])) { state[index] = next; dirty = true; }
      }];
    },
    useEffect(fn, next) {
      const index = cursor++;
      if (!deps[index] || next.some((value, i) => !Object.is(value, deps[index][i]))) {
        deps[index] = next; effects.push(fn);
      }
    },
  };
  const formatCalls = [];
  const pinSaveCalls = [];
  const names = new Proxy({}, { get: (_, name) => String(name) });
  const exports = load('./WorkerAttendancePage.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@mui/material': names, 'lucide-react': names, moment: () => ({ format: () => '' }),
    'react-router-dom': { Link: 'Link', NavLink: 'NavLink' },
    '@chemisttasker/shared-core': {
      attendance: {
        getWorkerStatus: async () => ({ has_active_session: active, pharmacy_name: 'Guidance Pharmacy', started_at: '2026-10-29T00:00:00Z', ...status }),
        getPinPharmacies() { pinLoads++; return pinResponse; },
        async updatePin(pharmacyId, pin) {
          pinSaveCalls.push({ pharmacyId, pin });
          if (saveError && pinSaveCalls.length === 1) throw saveError;
        },
      },
      rosterV2: { getWorkerRoster: async () => ({ shifts: [] }) },
      formatAttendanceMinutes(minutes) { formatCalls.push(minutes); return formatAttendanceMinutes(minutes); },
    },
    '../../components/ui/PageHeader': 'PageHeader', '../../components/ui/IconTile': 'IconTile',
    '../../components/dashboard/DashboardContentState': 'DashboardContentState',
    '../../components/ui/Hint': { Hint: 'Hint' }, '../../components/ui/Pill': { Pill: 'Pill' },
    '../../utils/labels': { humanizeEnum: value => value },
  }, { Date: ControlledDate, setInterval(fn) { timer = fn; return 1; }, clearInterval() {} });
  function render() {
    cursor = 0; dirty = false; tree = exports.default();
  }
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) render();
      const pending = effects; effects = []; pending.forEach(fn => fn());
      await new Promise(setImmediate);
      if (!dirty && !effects.length) return;
    }
    assert.fail('Worker effects did not settle');
  }
  const ui = {
    get tree() { return tree; }, formatCalls, pinSaveCalls,
    dialog() {
      const dialog = nodes(tree, 'Dialog').find(node => /Change kiosk PIN/i.test(text(node)));
      assert.ok(dialog, 'PIN dialog must be open'); return dialog;
    },
    async open() {
      const button = nodes(tree, 'Button').find(node => /(?:change|set|manage).*PIN/i.test(text(node)));
      assert.ok(button, 'Missing PIN dialog trigger'); assert.ok(!button.props.disabled);
      const result = button.props.onClick({ type: 'click' });
      // Preserve the committed tree before the pharmacy-loading effect runs.
      render();
      const firstDialog = ui.dialog();
      await result; await flush();
      assert.equal(pinLoads, 1, 'Opening PIN dialog must load self-service pharmacies');
      return firstDialog;
    },
    async pharmacies(pharmacies) { resolvePin({ pharmacies }); await flush(); },
    async fail() { rejectPin(new Error('Network unavailable')); await flush(); },
    async change(label, value) {
      const field = nodes(ui.dialog(), 'TextField').find(node => label.test(node.props.label));
      assert.ok(field, `Missing PIN field ${label}`);
      assert.ok(!field.props.disabled);
      field.props.onChange({ target: { value } }); await flush();
    },
    async save({ validation = false } = {}) {
      const button = nodes(ui.dialog(), 'Button').find(node => /^Save PIN$/i.test(text(node)));
      assert.ok(button, 'Save PIN must remain visible');
      assert.equal(!!button.props.disabled, validation);
      // Exercise the handler's defensive validation even when the UI disables Save.
      await button.props.onClick({ type: 'click' }); await flush();
    },
    async tick() { assert.equal(typeof timer, 'function'); now += 60000; timer(); await flush(); },
  };
  await flush(); return ui;
}
async function emptyWorker() {
  const ui = await worker(); await ui.open(); await ui.pharmacies([]); return ui;
}

test('worker loaded-empty PIN dialog explains accepted staff membership eligibility', async () => {
  const ui = await emptyWorker(); const dialog = ui.dialog();
  assert.equal(nodes(dialog, 'CircularProgress').length, 0, 'Successful empty response must stop loading');
  assert.equal(nodes(dialog, 'LinearProgress').length, 0);
  assert.ok(!nodes(dialog, 'DashboardContentState').some(node => /loading|error/.test(node.props.kind)));
  assert.equal(nodes(dialog, 'Alert').filter(node => node.props.severity === 'error').length, 0);
  assert.match(text(dialog), /kiosk PIN/i);
  assert.match(text(dialog), /accepted\s+staff\s+membership/i);
  assert.match(text(dialog), /(?:that|this|the|selected|same) pharmacy/i);
});

test('worker loaded-empty PIN dialog sends booked locums to mobile pharmacy QR scanning', async () => {
  const ui = await emptyWorker(); const copy = text(ui.dialog());
  assert.match(copy, /booked locums/i); assert.match(copy, /mobile app/i);
  assert.match(copy, /clock\s*in/i);
  assert.match(copy, /scan\w*/i); assert.match(copy, /pharmacy.*QR|QR.*pharmacy/i);
});

test('worker loaded-empty PIN dialog links pending invites to the app invitations route', async () => {
  const ui = await emptyWorker(); const dialog = ui.dialog();
  assert.match(text(dialog), /pending invit/i);
  const link = nodes(dialog).find(node => (node.props.href || node.props.to) === '/dashboard/admin-invitations');
  assert.ok(link, 'Pending invites need a link to /dashboard/admin-invitations (main.tsx)');
  assert.match(text(link), /invit/i);
});

test('worker PIN guidance waits for pharmacy loading to finish', async () => {
  const ui = await worker(); await ui.open();
  for (const phrase of emptyPhrases) assert.doesNotMatch(text(ui.dialog()), phrase);
});

test('worker PIN guidance is absent on the first open render before effects run', async () => {
  const ui = await worker(); const firstDialog = await ui.open();
  for (const phrase of emptyPhrases) assert.doesNotMatch(text(firstDialog), phrase,
    'No-membership guidance must wait for a successful pharmacy load, including the first render');
});

test('worker PIN load failure shows the error instead of loaded-empty guidance', async () => {
  const ui = await worker(); await ui.open(); await ui.fail();
  const dialog = ui.dialog();
  assert.match(text(dialog), /unable to load/i);
  assert.ok(nodes(dialog, 'Alert').some(node => node.props.severity === 'error'));
  for (const phrase of emptyPhrases) assert.doesNotMatch(text(dialog), phrase);
  assert.equal(nodes(dialog, 'TextField').length, 0, 'Load errors must not expose a PIN form');
  assert.ok(!nodes(dialog, 'Button').some(node => /^Save PIN$/i.test(text(node))));
});

test('worker eligible pharmacy remains selectable without loaded-empty guidance', async () => {
  const ui = await worker(); await ui.open(); await ui.pharmacies([{ id: 17, name: 'Accepted Pharmacy' }]);
  const dialog = ui.dialog();
  assert.match(text(dialog), /Accepted Pharmacy/);
  assert.equal(nodes(dialog, 'TextField').find(node => node.props.label === 'Pharmacy').props.value, '17');
  for (const phrase of emptyPhrases) assert.doesNotMatch(text(dialog), phrase);
});

for (const scenario of [
  { name: 'backend refusal', error: Object.assign(new Error('Membership is no longer eligible.'), { status: 403 }), message: /Membership is no longer eligible\./ },
  { name: 'network error', error: new TypeError('Network unavailable'), message: /Network unavailable/ },
  { name: 'Select a pharmacy. validation', error: null, message: /Select a pharmacy\./, validation: true },
]) {
  test(`worker PIN ${scenario.name} shows the error and retains all retry controls`, async () => {
    const ui = await worker({ saveError: scenario.error }); await ui.open();
    await ui.pharmacies([{ id: 17, name: 'Accepted Pharmacy' }, { id: 18, name: 'Other Accepted Pharmacy' }]);
    if (!scenario.validation) await ui.change(/^Pharmacy$/, '17');
    await ui.change(/^New PIN/, '1357'); await ui.change(/^Confirm new PIN$/, '1357');
    await ui.save({ validation: !!scenario.validation });
    const dialog = ui.dialog();
    const errors = nodes(dialog, 'Alert').filter(node => node.props.severity === 'error');
    assert.ok(errors.some(node => scenario.message.test(text(node))), 'The save error must be visible');
    assert.equal(ui.pinSaveCalls.length, scenario.validation ? 0 : 1);
    const fields = nodes(dialog, 'TextField');
    assert.ok(fields.some(node => node.props.label === 'Pharmacy'), 'Pharmacy picker must remain visible after a save error');
    assert.equal(fields.find(node => /^New PIN/.test(node.props.label))?.props.value, '1357', 'New PIN must remain available for retry');
    assert.equal(fields.find(node => /^Confirm new PIN$/.test(node.props.label))?.props.value, '1357', 'Confirm PIN must remain available for retry');
    assert.ok(fields.every(node => !node.props.disabled), 'Retry fields must be enabled');
    assert.ok(nodes(dialog, 'Button').some(node => /^Save PIN$/i.test(text(node))), 'Save PIN must remain visible');
    for (const phrase of emptyPhrases) assert.doesNotMatch(text(dialog), phrase);
    await ui.change(/^Pharmacy$/, '17'); await ui.save();
    assert.deepEqual(ui.pinSaveCalls.at(-1), { pharmacyId: 17, pin: '1357' });
    assert.ok(!nodes(ui.tree, 'Dialog').some(node => /Change kiosk PIN/i.test(text(node))), 'A successful retry closes the same dialog');
  });
}

test('worker timer calls shared formatAttendanceMinutes directly without a local fallback', () => {
  const source = ts.createSourceFile('WorkerAttendancePage.tsx',
    readFileSync(new URL('./WorkerAttendancePage.tsx', import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const durationCalls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'setElapsedDuration') {
      durationCalls.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(durationCalls.length > 0, 'Timer must update the elapsed duration');
  for (const expression of durationCalls) {
    assert.ok(ts.isCallExpression(expression) && expression.expression.getText(source) === 'formatAttendanceMinutes',
      `Elapsed duration must call shared formatAttendanceMinutes directly; found ${expression.getText(source)}`);
  }
  assert.doesNotMatch(source.text, /typeof\s+formatAttendanceMinutes/, 'Do not retain a local fallback for a missing shared-core mock');
});

test('worker open shift uses shared hours/minutes formatting at 425 minutes and keeps updating', async () => {
  const ui = await worker({ active: true });
  const duration = () => nodes(ui.tree, 'Typography').find(node => node.props['aria-live'] === 'off');
  assert.ok(duration(), 'Open shift must display elapsed duration');
  assert.equal(text(duration()), formatAttendanceMinutes(425));
  assert.doesNotMatch(text(duration()), /\d+:\d{2}:\d{2}/);
  assert.ok(ui.formatCalls.includes(425), 'Use the shared formatter for attendance duration');
  await ui.tick();
  assert.equal(text(duration()), formatAttendanceMinutes(426));
  assert.doesNotMatch(text(duration()), /\d+:\d{2}:\d{2}/);
});


test('web worker unbooked provisional session explains manager approval before payable', async () => {
  const ui = await worker({ active: true, status: { is_provisional: true, cover_type: 'UNBOOKED_LOCUM_COVER' } });
  const note = nodes(ui.tree, 'Alert').find(node => node.props.severity === 'warning' && /provisional/i.test(text(node)));
  assert.ok(note, 'An open provisional session must show its attendance warning');
  const copy = text(note);
  assert.match(copy, /manager/i);
  assert.match(copy, /approv(?:e|al)[\s\S]*before[\s\S]*payable/i);
});

test('web worker ordinary provisional session keeps the existing recorded-hours review note', async () => {
  const ui = await worker({ active: true, status: { is_provisional: true, cover_type: 'UNROSTERED_LOCAL' } });
  const note = nodes(ui.tree, 'Alert').find(node => node.props.severity === 'warning' && /provisional/i.test(text(node)));
  assert.ok(note);
  const copy = text(note).replace(/\s+/g, ' ').trim();
  assert.match(copy, /This shift wasn't on the roster \(or is cover at another site\)\. Your hours are still recorded and sent to the pharmacy manager to review\./);
  assert.doesNotMatch(copy, /unbooked|no booking|payable/i);
});

test('web worker non-provisional session has no provisional approval or payable note', async () => {
  const ui = await worker({ active: true, status: { is_provisional: false, cover_type: null } });
  const copy = nodes(ui.tree, 'Alert').map(text).join(' ');
  assert.doesNotMatch(copy, /provisional|manager.*approv|payable/i);
});
