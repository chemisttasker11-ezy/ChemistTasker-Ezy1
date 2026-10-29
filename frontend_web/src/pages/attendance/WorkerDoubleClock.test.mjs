import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function nodes(node, type) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, type));
  if (typeof node !== 'object') return [];
  if (node.type === 'Dialog' && !node.props.open) return [];
  return [...(node.type === type ? [node.props] : []), ...nodes(node.props?.children, type)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (node.type === 'Dialog' && !node.props.open) return '';
  return text(node.props?.children);
}

async function worker({ active = true, reject = true } = {}) {
  const state = [], deps = [];
  let cursor = 0, dirty = true, effects = [], tree, reloads = 0;
  const calls = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => {
        const next = typeof value === 'function' ? value(state[index]) : value;
        if (!Object.is(next, state[index])) { state[index] = next; dirty = true; }
      }];
    },
    useMemo(fn) { return fn(); },
    useEffect(fn, next) {
      const index = cursor++;
      if (!deps[index] || next.some((value, i) => !Object.is(value, deps[index][i]))) {
        deps[index] = next; effects.push(fn);
      }
    },
  };
  const endpoints = { workerClockIn: '/clock-in/', workerClockOut: '/clock-out/' };
  function load(relative, imports) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
      exports, console, setInterval: () => 1, clearInterval() {},
      require(name) { assert.ok(name in imports, `Unmocked worker dependency: ${name}`); return imports[name]; },
    });
    return exports;
  }
  const { attendance } = load('../../../../shared-core/src/domains/attendance/api.ts', {
    '../../constants/endpoints': { API_ENDPOINTS: { attendance: endpoints } },
    '../../transport/operational': { async operationalRequest(url, options) {
      calls.push(structuredClone({ url, ...options }));
      // Return the shared-core transport shape, with no Axios response/data aliases.
      if (reject && calls.length === 1) {
        throw { status: 409, payload: {
          code: 'CONFIRM_OPPOSITE_ACTION', last_action: active ? 'CLOCK_IN' : 'CLOCK_OUT',
          pending_action: active ? 'CLOCK_OUT' : 'CLOCK_IN', last_action_at: '2026-10-28T00:00:00Z',
          message: active ? 'You just clocked in. Clock out now?' : 'You just clocked out. Clock in now?',
        } };
      }
      return { status: active ? 'CLOCKED_OUT' : 'CLOCKED_IN', session_id: 8, pharmacy_name: 'CLOCK Pharmacy' };
    } },
  });
  attendance.getWorkerCoverTerms = async () => [];
  attendance.getWorkerStatus = async () => { reloads++; return { has_active_session: active, pharmacy_name: 'CLOCK Pharmacy' }; };
  const names = new Proxy({}, { get: (_, name) => String(name) });
  const exports = load('./WorkerAttendancePage.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@mui/material': names, 'lucide-react': names, moment: () => ({ format: () => '' }),
    'react-router-dom': { useNavigate: () => () => {} },
    '@chemisttasker/shared-core': { attendance, rosterV2: { getWorkerRoster: async () => ({ shifts: [] }) },
      formatAttendanceMinutes: load('../../../../shared-core/src/utils/attendanceDisplay.ts', {}).formatAttendanceMinutes,
    },
    '../../components/ui/PageHeader': 'PageHeader', '../../components/ui/IconTile': 'IconTile',
    '../../components/dashboard/DashboardContentState': 'DashboardContentState',
    '../../components/ui/Hint': { Hint: 'Hint' }, '../../components/ui/Pill': { Pill: 'Pill' },
    '../dashboard/sidebar/ShiftsBoard/components/ShiftEngagementTermsDialog': { __esModule: true, default: 'ShiftEngagementTermsDialog' },
    '../../contexts/AuthContext': { useAuth: () => ({ user: { role: 'PHARMACIST' } }) },
    '../../utils/labels': { humanizeEnum: (value) => value },
  });
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) {
        cursor = 0; dirty = false; tree = exports.default();
        const pending = effects; effects = []; pending.forEach((fn) => fn());
      }
      await new Promise(setImmediate);
      if (!dirty && !effects.length) return;
    }
    assert.fail('Worker page effects did not settle');
  }
  async function click(pattern, root = tree) {
    const button = nodes(root, 'Button').find((props) => pattern.test(text(props.children)));
    assert.ok(button, `Missing button ${pattern}; visible text: ${text(root)}`);
    assert.ok(!button.disabled);
    // React supplies a truthy MouseEvent to onClick. Calling it with no argument hides the bug.
    await button.onClick({ type: 'click', preventDefault() {}, stopPropagation() {} });
    await flush();
  }
  function prompt() {
    const found = nodes(tree, 'Dialog').find((props) => /You just clocked/.test(text(props.children)));
    assert.ok(found, `A shared-core 409 must open confirmation; visible text: ${text(tree)}`);
    return { type: 'Dialog', props: found };
  }
  await flush();
  return {
    calls, prompt, get reloads() { return reloads; },
    async submit() {
      await click(active ? /^Clock out$/i : /^Scan pharmacy QR$/i);
      const field = nodes(tree, 'TextField').find((props) => props.label === 'QR code');
      assert.ok(field, 'Missing QR input');
      field.onChange({ target: { value: 'signed-qr-token' } }); await flush();
      await click(active ? /^Clock out$/i : /^Clock in$/i, { type: 'Dialog', props: nodes(tree, 'Dialog')[0] });
    },
    async confirm() { await click(/^Confirm$/i, prompt()); },
    async cancel() { await click(/^Cancel$/i, prompt()); },
  };
}

for (const active of [true, false]) {
  const kind = active ? 'out' : 'in';
  test(`web worker clock ${kind}: ordinary mouse click does not send confirm_opposite:true`, async () => {
    const ui = await worker({ active, reject: false });
    await ui.submit();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.calls[0].url, `/clock-${kind}/`);
    assert.equal(ui.calls[0].body.qr_token, 'signed-qr-token');
    assert.notEqual(ui.calls[0].body.confirm_opposite, true);
  });

  test(`web worker clock ${kind}: shared-core 409 opens confirmation and explicit confirm reuses QR`, async () => {
    const ui = await worker({ active });
    await ui.submit();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.reloads, 1, 'A refused action must not refresh attendance as success');
    assert.match(text(ui.prompt()), active ? /You just clocked in\. Clock out now\?/ : /You just clocked out\. Clock in now\?/);
    assert.notEqual(ui.calls[0].body.confirm_opposite, true);
    await ui.confirm();
    assert.equal(ui.calls.length, 2);
    assert.equal(ui.calls[1].url, ui.calls[0].url);
    assert.equal(ui.calls[1].body.qr_token, ui.calls[0].body.qr_token);
    assert.equal(ui.calls[1].body.confirm_opposite, true);
    assert.equal(ui.reloads, 2);
  });

  test(`web worker clock ${kind}: cancelling a real 409 sends no confirmation`, async () => {
    const ui = await worker({ active });
    await ui.submit(); ui.prompt(); await ui.cancel();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.reloads, 1);
  });
}
