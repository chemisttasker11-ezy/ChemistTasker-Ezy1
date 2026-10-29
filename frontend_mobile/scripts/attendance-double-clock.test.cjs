const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');

function nodes(node, type) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, type));
  if (typeof node !== 'object') return [];
  if (node.type === 'Dialog' && !(node.props.visible ?? node.props.open)) return [];
  return [...(node.type === type ? [node.props] : []), ...nodes(node.props?.children, type)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
function load(relativePath, imports, globals = {}, append = '') {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText + append, {
    exports, ...globals,
    require(name) {
      assert.ok(name in imports, `Unmocked mobile dependency: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

async function clock({ active = true, reject = true } = {}) {
  const state = [];
  let cursor = 0, dirty = true, tree, alert = null, reloads = 0;
  const calls = [];
  const now = Date.parse('2026-10-28T00:00:30Z');
  class ControlledDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => {
        state[index] = typeof value === 'function' ? value(state[index]) : value; dirty = true;
      }];
    },
    useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
    useMemo: (fn) => fn(), useCallback: (fn) => fn(),
  };
  const endpoints = { workerClockIn: '/clock-in/', workerClockOut: '/clock-out/', workerBreakStart: '/break-start/', workerBreakEnd: '/break-end/' };
  // Exercise the real shared-core serializer as well as the real screen handler.
  // Confirm must reach the server as a JSON boolean, whichever public helper
  // signature TC2 chooses.
  const { attendance } = load('../../shared-core/src/domains/attendance/api.ts', {
    '../../constants/endpoints': { API_ENDPOINTS: { attendance: endpoints } },
    '../../transport/operational': { async operationalRequest(url, options) {
      calls.push(structuredClone({ url, ...options }));
      if (reject && /clock-(in|out)/.test(url) && options.body.confirm_opposite !== true) {
        throw { status: 409, payload: {
          code: 'CONFIRM_OPPOSITE_ACTION', last_action: active ? 'CLOCK_IN' : 'CLOCK_OUT',
          pending_action: active ? 'CLOCK_OUT' : 'CLOCK_IN', last_action_at: '2026-10-28T00:00:00Z',
          message: active ? 'You just clocked in. Clock out now?' : 'You just clocked out. Clock in now?',
        } };
      }
      return { status: active ? 'CLOCKED_OUT' : 'CLOCKED_IN', session_id: 8 };
    } },
  });
  const names = new Proxy({}, { get: (_, name) => String(name) });
  const native = {
    ...Object.fromEntries(['View', 'Text', 'Pressable', 'Modal'].map((name) => [name, name])),
    StyleSheet: { create: (styles) => styles, absoluteFill: {}, absoluteFillObject: {} },
    Alert: { alert(title, message, buttons) { alert = { title, message, buttons }; } },
    Linking: { openSettings: async () => {} },
  };
  const utils = load('../features/parity/utils.ts', {}, { Date: ControlledDate });
  const exports = load('../features/parity/attendance.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': native, 'react-native-paper': names,
    'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })] },
    'expo-router': { useRouter: () => ({}), useLocalSearchParams: () => ({}) },
    '@chemisttasker/shared-core': { attendance }, '@/context/WorkspaceContext': {}, '@/context/AuthContext': {},
    './ParityUI': { ...Object.fromEntries(['ActionButtons', 'DataRow', 'EmptyState', 'Field', 'InfoNote', 'MetricGrid', 'ParityPage', 'PharmacyRequired', 'ScreenLink', 'Section'].map((name) => [name, name])), palette: {} },
    '../../roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog': { __esModule: true, default: 'ShiftEngagementTermsDialog' },
    './utils': utils,
  }, { Date: ControlledDate, crypto: { randomUUID }, console }, '\nexports.__ClockScreen = ClockScreen;');
  // Expose the private screen only in the transpiled test module; app code is untouched.
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) {
        cursor = 0; dirty = false;
        tree = exports.__ClockScreen({ status: { has_active_session: active, pharmacy_name: 'CLOCK Pharmacy' },
          loading: false, error: '', onReload: async () => { reloads++; } });
      }
      await new Promise(setImmediate);
      if (!dirty) return;
    }
    assert.fail('Mobile clock handlers did not settle');
  }
  function button(pattern, root = tree) {
    const control = nodes(root, 'Button').find((props) => pattern.test(text(props.children)));
    assert.ok(control, `Missing mobile button ${pattern}; visible text: ${text(root)}`);
    return control;
  }
  async function press(pattern, root) {
    const control = button(pattern, root);
    assert.ok(!control.disabled, `Mobile button ${pattern} is disabled`);
    await control.onPress(); await flush();
  }
  function prompt() {
    if (alert && /You just clocked/.test(`${alert.title} ${alert.message}`)) return alert;
    const found = nodes(tree, 'Dialog').find((props) => /You just clocked/.test(text(props.children)));
    assert.ok(found, `409 must open a confirmation prompt, not just show an error; visible text: ${text(tree)}`);
    return { root: { type: 'Dialog', props: found }, message: text(found.children) };
  }
  async function respond(confirm) {
    const current = prompt();
    const pattern = confirm ? /^(confirm(?: clock (?:in|out))?|clock (?:in|out)(?: now)?|yes(?:,? clock (?:in|out))?)$/i : /^cancel$|^no$|keep/i;
    if (current.root) await press(pattern, current.root);
    else {
      const choice = current.buttons.find((candidate) => pattern.test(candidate.text));
      assert.ok(choice, `Missing native confirmation choice ${pattern}`);
      alert = null;
      await choice.onPress?.(); await flush();
    }
  }
  const ui = {
    calls, prompt, flush,
    get reloads() { return reloads; },
    async token(value = 'signed-qr-token') {
      const field = nodes(tree, 'Field').find((props) => props.label === 'Kiosk QR token');
      assert.ok(field, 'Missing manual QR input'); field.onChangeText(value); await flush();
    },
    async submit() { await press(active ? /^Clock out with token$/ : /^Clock in with token$/); },
    async scan() {
      await press(/^Open camera$/);
      const camera = nodes(tree, 'CameraView')[0];
      assert.ok(camera?.onBarcodeScanned, 'The QR camera must accept a scan');
      camera.onBarcodeScanned({ data: 'signed-qr-token' }); await flush();
    },
    async confirm() { await respond(true); }, async cancel() { await respond(false); },
    async breakStart() { await press(/^Start break$/); },
  };
  await flush(); return ui;
}

for (const active of [true, false]) {
  const kind = active ? 'out' : 'in';
  const message = active ? 'You just clocked in. Clock out now?' : 'You just clocked out. Clock in now?';
  test(`mobile clock ${kind}: 409 prompts and confirm sends confirm_opposite:true with the same QR`, async () => {
    const ui = await clock({ active });
    await ui.token(); await ui.submit();
    assert.equal(ui.calls.length, 1);
    assert.equal(ui.reloads, 0, 'A refused action must not be treated as a successful clock');
    const prompt = ui.prompt();
    assert.ok(`${prompt.title || ''} ${prompt.message}`.includes(message));
    assert.notEqual(ui.calls[0].body.confirm_opposite, true);
    await ui.confirm();
    assert.equal(ui.calls.length, 2);
    assert.equal(ui.calls[1].url, ui.calls[0].url);
    assert.equal(ui.calls[1].body.qr_token, ui.calls[0].body.qr_token);
    assert.equal(ui.calls[1].body.confirm_opposite, true);
    if (ui.calls[0].body.request_id) assert.equal(ui.calls[1].body.request_id, ui.calls[0].body.request_id);
    assert.equal(ui.reloads, 1);
  });

  test(`mobile clock ${kind}: cancel sends no confirm request`, async () => {
    const ui = await clock({ active });
    await ui.token(); await ui.submit(); ui.prompt(); await ui.cancel();
    assert.equal(ui.calls.length, 1); assert.equal(ui.reloads, 0);
  });

  test(`mobile scanner clock ${kind}: scan cannot auto-confirm a 409`, async () => {
    const ui = await clock({ active });
    await ui.scan();
    assert.equal(ui.calls.length, 1); assert.equal(ui.reloads, 0);
    ui.prompt(); await ui.confirm();
    assert.equal(ui.calls.length, 2);
    assert.equal(ui.calls[1].body.qr_token, 'signed-qr-token');
    assert.equal(ui.calls[1].body.confirm_opposite, true);
  });
}

test('mobile normal clock success still refreshes attendance', async () => {
  const ui = await clock({ reject: false });
  await ui.token(); await ui.submit();
  assert.equal(ui.calls.length, 1); assert.equal(ui.reloads, 1);
  assert.notEqual(ui.calls[0].body.confirm_opposite, true);
});

test('mobile breaks keep their existing confirmation-free route', async () => {
  const ui = await clock(); await ui.breakStart();
  assert.equal(ui.calls.length, 1); assert.equal(ui.calls[0].url, '/break-start/');
  assert.equal(ui.reloads, 1);
});
