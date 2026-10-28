import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

// Same dependency-free hook/JSX approach as the existing attendance component tests.
// Run the real page handlers; replace only platform/UI boundaries and the clock.
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

async function kiosk({ desktop = false, lastAction = 'CLOCK_IN', reject = true, offline = false, timers } = {}) {
  let now = Date.parse('2026-10-28T00:00:00Z');
  class ControlledDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const state = [], deps = [], memo = [];
  let cursor = 0, dirty = true, effects = [], tree;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], (value) => {
        const next = typeof value === 'function' ? value(state[index]) : value;
        if (!Object.is(next, state[index])) { state[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
    useCallback(fn, next) {
      const index = cursor++;
      if (!equal(deps[index], next)) { deps[index] = next; memo[index] = fn; }
      return memo[index];
    },
    useMemo(fn, next) { return hooks.useCallback(fn, next)(); },
    useEffect(fn, next) {
      const index = cursor++;
      if (!equal(deps[index], next)) { deps[index] = next; effects.push(fn); }
    },
  };
  const calls = [], setupCalls = [], captures = [], prepared = [], receipts = [], networkCalls = [];
  let serverPending = false;
  const unresolvedRequest = new Promise(() => {});
  let setupPending = true;
  let serverReachable = !offline;
  const network = { onLine: !offline };
  const qr = () => ({ qr_token: 'qr', expires_at: new ControlledDate(now + 30000).toISOString(), pharmacy_name: 'CLOCK Pharmacy' });
  const runtime = {
    KIOSK_TOKEN_KEY: 'token', KIOSK_PHARMACY_NAME_KEY: 'name', KIOSK_PHARMACY_ID_KEY: 'pharmacy',
    kioskClient: { async post(url, body, config) {
      networkCalls.push(url);
      if (serverPending) return unresolvedRequest;
      if (!serverReachable) throw new Error('Network unavailable');
      if (url.endsWith('/qr/')) return { data: qr() };
      if (url.endsWith('/worker-pin/status/')) return { data: {
        status: 'NEEDS_SETUP', worker_name: 'Casey', masked_email: 'c***@example.test',
      } };
      if (url.endsWith('/worker-pin/setup/')) {
        setupCalls.push(structuredClone({ url, body, config }));
        if (setupPending && body.confirm_opposite !== true) throw { response: { status: 409, data: {
          code: 'CONFIRM_OPPOSITE_ACTION', last_action: 'CLOCK_OUT', pending_action: 'CLOCK_IN',
          last_action_at: new ControlledDate(now - 30000).toISOString(),
          message: 'You just clocked out. Clock in now?',
        } } };
        setupPending = false;
        return { data: { action: 'CLOCKED_IN', worker_name: 'Casey', session_id: 8 } };
      }
      assert.ok(url.endsWith('/pin-clock/'), `Unexpected API call: ${url}`);
      calls.push(structuredClone({ body, config }));
      if (reject && body.confirm_opposite !== true) {
        throw { response: { status: 409, data: {
          code: 'CONFIRM_OPPOSITE_ACTION', last_action: lastAction,
          pending_action: lastAction === 'CLOCK_IN' ? 'CLOCK_OUT' : 'CLOCK_IN',
          last_action_at: new ControlledDate(now - 30000).toISOString(),
          message: lastAction === 'CLOCK_IN' ? 'You just clocked in. Clock out now?' : 'You just clocked out. Clock in now?',
        } } };
      }
      return { data: { action: lastAction === 'CLOCK_IN' ? 'CLOCKED_OUT' : 'CLOCKED_IN', worker_name: 'Casey', session_id: 8 } };
    } },
  };
  const bridge = {
    isDesktopKiosk: () => desktop,
    getDesktopKioskStatus: async () => ({ paired: true, pharmacy_name: 'CLOCK Pharmacy' }),
    getDesktopOnlineQr: async () => {
      networkCalls.push('native/qr');
      if (serverPending) return unresolvedRequest;
      if (!serverReachable) throw new Error('Network unavailable');
      return qr();
    }, getDesktopPendingCount: async () => 0,
    prepareDesktopCaptureRequest: async (identifier, action) => {
      const id = randomUUID(); prepared.push({ identifier, action, id }); return id;
    },
    captureDesktopPinAttendance: async (identifier, pin, action, requestId) => {
      captures.push({ identifier, pin, action, requestId });
      return { action: action === 'CLOCK_IN' ? 'CLOCKED_IN' : action === 'CLOCK_OUT' ? 'CLOCKED_OUT' : action,
        worker_name: 'Casey', event: { event_id: randomUUID(), captured_at: new ControlledDate().toISOString() } };
    },
    confirmDesktopCaptureReceipt: async (requestId, eventId) => { receipts.push({ requestId, eventId }); },
  };
  const uiNames = new Proxy({}, { get: (_, name) => String(name) });
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@mui/material': uiNames, 'qrcode.react': uiNames,
    '../../kiosk/desktopBridge': bridge, './KioskPage.runtime': runtime,
    '../../constants/api': { API_BASE_URL: '/api/v1' }, '../../utils/tokenService': { clearTokens() {} },
    '../../kiosk/KioskSetup': 'KioskSetup', './KioskActivationView': 'KioskActivationView', './KioskBreakDialog': 'KioskBreakDialog',
  };
  const storage = new Map([['token', 'device-token'], ['name', 'CLOCK Pharmacy']]);
  const { outputText } = ts.transpileModule(readFileSync(new URL('./KioskPage.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, Date: ControlledDate, crypto: { randomUUID }, console,
    navigator: network,
    window: { addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    setTimeout: timers ? setTimeout : () => 1, clearTimeout: timers ? clearTimeout : () => {},
    setInterval: timers ? setInterval : () => 1, clearInterval: timers ? clearInterval : () => {},
    require(name) {
      if (name in imports) return imports[name];
      if (name.startsWith('@mui/icons-material/')) return 'Icon';
      throw new Error(`Unmocked page dependency: ${name}`);
    },
  });
  async function flush() {
    for (let i = 0; i < 40; i++) {
      if (dirty) {
        cursor = 0; dirty = false;
        tree = exports.default();
        const pending = effects; effects = []; pending.forEach((effect) => effect());
      }
      await new Promise(setImmediate);
      if (!dirty && effects.length === 0) return;
    }
    assert.fail('Kiosk effects did not settle');
  }
  function button(pattern, root = tree) {
    const found = nodes(root, 'Button').find((props) => pattern.test(text(props.children)));
    assert.ok(found, `Missing button ${pattern}; visible text: ${text(root)}`);
    return found;
  }
  async function click(pattern, root) {
    const control = button(pattern, root);
    assert.ok(!control.disabled, `Button ${pattern} is disabled`);
    await control.onClick(); await flush();
  }
  async function clickWithoutWaiting(pattern, root) {
    const control = button(pattern, root);
    assert.ok(!control.disabled, 'Native action is disabled');
    const completion = { settled: false };
    void Promise.resolve(control.onClick()).then(() => { completion.settled = true; });
    await flush();
    return completion;
  }
  function dialog() {
    const dialogs = nodes(tree, 'Dialog');
    const found = dialogs.find((props) => /You just clocked (in|out)\. Clock (out|in) now\?/i.test(text(props.children)));
    assert.ok(found, `A recent opposite action must open the double-clock confirmation dialog; visible text: ${text(tree)}`);
    return { type: 'Dialog', props: found };
  }
  const ui = {
    calls, setupCalls, captures, prepared, receipts, networkCalls, flush, dialog,
    network, requestQr: bridge.getDesktopOnlineQr,
    disconnectServer() { serverReachable = false; },
    hangServer() { serverPending = true; },
    get cachedQrToken() { return nodes(tree, 'QRCodeSVG')[0]?.value; },
    get text() { return text(tree); },
    advance(seconds) { now += seconds * 1000; timers?.tick(seconds * 1000); },
    async enter(identifier = 'casey@example.test') {
      const field = nodes(tree, 'TextField').find((props) => /Staff Email or ID/i.test(props.placeholder || ''));
      assert.ok(field, 'Missing staff identifier input');
      field.onChange({ target: { value: identifier } }); await flush();
      for (const digit of '1357') await click(new RegExp(`^${digit}$`));
    },
    async setup() {
      const identifier = nodes(tree, 'TextField').find((props) => /Staff Email or ID/i.test(props.placeholder || ''));
      assert.ok(identifier); identifier.onChange({ target: { value: 'casey@example.test' } }); await flush();
      await click(/^Reset PIN$/i);
      for (const [label, value] of [[/6-Digit Verification Code/i, '123456'], [/^New PIN/i, '2468'], [/^Confirm PIN/i, '2468']]) {
        const field = nodes(tree, 'TextField').find((props) => label.test(props.label || ''));
        assert.ok(field, `Missing setup field ${label}`);
        field.onChange({ target: { value } }); await flush();
      }
    },
    setupValues() {
      return nodes(tree, 'TextField').filter((props) => /Verification Code|New PIN|Confirm PIN/i.test(props.label || ''))
        .map((props) => props.value);
    },
    async submitSetup() { await click(/(?:Set|Create|Save).*PIN.*Clock|Confirm.*Setup/i); },
    async submit() { await click(desktop ? /^Confirm (Clock In|Clock Out|Start Break|End Break)$/i : /^Confirm Clock In \/ Out$/i); },
    async submitWithoutWaiting() { return clickWithoutWaiting(/^Confirm (Clock In|Clock Out|Start Break|End Break)$/i); },
    async confirmWithoutWaiting() {
      return clickWithoutWaiting(/^(confirm(?: clock (?:in|out))?|clock (?:in|out)(?: now)?|yes(?:,? clock (?:in|out))?)$/i, dialog());
    },
    async choose(action) { await click(new RegExp(`^${action}$`, 'i')); },
    async confirm() { await click(/^(confirm(?: clock (?:in|out))?|clock (?:in|out)(?: now)?|yes(?:,? clock (?:in|out))?)$/i, dialog()); },
    async cancel() { await click(/^cancel$|^no$|keep/i, dialog()); },
  };
  await flush();
  return ui;
}

for (const [lastAction, wording] of [['CLOCK_IN', 'You just clocked in. Clock out now?'], ['CLOCK_OUT', 'You just clocked out. Clock in now?']]) {
  test(`web kiosk ${lastAction}: 409 prompts and explicit confirm resubmits the same request`, async () => {
    const ui = await kiosk({ lastAction });
    await ui.enter(); await ui.submit();
    assert.equal(ui.calls.length, 1, 'Opening a prompt must not auto-confirm');
    assert.ok(text(ui.dialog()).includes(wording));
    const first = ui.calls[0];
    assert.notEqual(first.body.confirm_opposite, true);
    assert.ok(first.body.request_id);
    await ui.confirm();
    assert.equal(ui.calls.length, 2);
    assert.equal(ui.calls[1].body.confirm_opposite, true);
    assert.equal(ui.calls[1].body.request_id, first.body.request_id, 'Confirmation must reuse the uncommitted request ID');
    assert.equal(ui.calls[1].body.identifier, first.body.identifier);
    assert.equal(ui.calls[1].body.pin, first.body.pin);
    assert.equal(ui.calls[1].config.headers['X-Device-Token'], 'device-token');
  });

  test(`web kiosk ${lastAction}: cancelling does not send a second clock request`, async () => {
    const ui = await kiosk({ lastAction });
    await ui.enter(); await ui.submit();
    ui.dialog(); await ui.cancel();
    assert.equal(ui.calls.length, 1);
    assert.doesNotMatch(ui.text, /Clocked (In|Out) Successfully/);
  });
}

test('desktop kiosk asks locally before capturing an opposite action at +30 seconds', async () => {
  const ui = await kiosk({ desktop: true });
  await ui.enter(); await ui.submit();
  assert.equal(ui.captures.length, 1);
  ui.advance(30);
  await ui.choose('Clock Out'); await ui.enter(); await ui.submit();
  assert.equal(ui.captures.length, 1, 'A local prompt must precede signed evidence capture');
  assert.match(text(ui.dialog()), /You just clocked in\. Clock out now\?/);
  await ui.confirm();
  assert.equal(ui.captures.length, 2);
  assert.equal(ui.captures[1].action, 'CLOCK_OUT');
  assert.equal(ui.captures[1].identifier, 'casey@example.test');
  assert.equal(ui.captures[1].pin, '1357');
  assert.ok(ui.captures[1].requestId);
  assert.equal(ui.calls.length, 0, 'Native clocking must keep its local signed-evidence path');
});

test('desktop kiosk also prompts before clock-in just after clock-out', async () => {
  const ui = await kiosk({ desktop: true });
  await ui.choose('Clock Out'); await ui.enter(); await ui.submit();
  ui.advance(30);
  await ui.choose('Clock In'); await ui.enter(); await ui.submit();
  assert.equal(ui.captures.length, 1, 'Reentry must wait for explicit confirmation');
  assert.match(text(ui.dialog()), /You just clocked out\. Clock in now\?/);
  await ui.confirm();
  assert.equal(ui.captures.length, 2);
  assert.equal(ui.captures[1].action, 'CLOCK_IN');
});

test('desktop kiosk cancel leaves the local evidence count unchanged', async () => {
  const ui = await kiosk({ desktop: true });
  await ui.enter(); await ui.submit(); ui.advance(30);
  await ui.choose('Clock Out'); await ui.enter(); await ui.submit();
  await ui.cancel();
  assert.equal(ui.captures.length, 1);
});

test('desktop kiosk acts normally at +61 seconds', async () => {
  const ui = await kiosk({ desktop: true });
  await ui.enter(); await ui.submit(); ui.advance(61);
  await ui.choose('Clock Out'); await ui.enter(); await ui.submit();
  assert.equal(ui.captures.length, 2);
  assert.equal(ui.captures[1].action, 'CLOCK_OUT');
  assert.doesNotMatch(ui.text, /You just clocked/);
});

test('desktop kiosk recent action is scoped to the worker identifier', async () => {
  const ui = await kiosk({ desktop: true });
  await ui.enter(); await ui.submit(); ui.advance(10);
  await ui.choose('Clock Out'); await ui.enter('another@example.test'); await ui.submit();
  assert.equal(ui.captures.length, 2);
  assert.equal(ui.captures[1].identifier, 'another@example.test');
  assert.doesNotMatch(ui.text, /You just clocked/);
});

test('desktop kiosk repeated same action keeps its action and does not ask to reverse it', async () => {
  const ui = await kiosk({ desktop: true });
  await ui.enter(); await ui.submit(); ui.advance(30);
  await ui.enter(); await ui.submit();
  assert.deepEqual(ui.captures.map((row) => row.action), ['CLOCK_IN', 'CLOCK_IN']);
  assert.doesNotMatch(ui.text, /You just clocked/);
});

for (const first of ['Clock In', 'Clock Out']) {
  test(`offline desktop ${first}: rapid opposite action asks locally before signed evidence`, async () => {
    const ui = await kiosk({ desktop: true, offline: true });
    if (first === 'Clock Out') await ui.choose(first);
    await ui.enter(); await ui.submit();
    assert.equal(ui.captures.length, 1);
    ui.advance(30);
    await ui.choose(first === 'Clock In' ? 'Clock Out' : 'Clock In');
    await ui.enter(); await ui.submit();
    assert.equal(ui.captures.length, 1, 'E13a requires a local prompt even while offline');
    assert.match(text(ui.dialog()), first === 'Clock In'
      ? /You just clocked in\. Clock out now\?/ : /You just clocked out\. Clock in now\?/);
    await ui.confirm();
    assert.equal(ui.captures.length, 2);
    assert.deepEqual(ui.captures.map((row) => row.action), first === 'Clock In' ? ['CLOCK_IN', 'CLOCK_OUT'] : ['CLOCK_OUT', 'CLOCK_IN']);
    assert.equal(ui.prepared.length, 2);
    assert.ok(ui.captures.every((row) => row.requestId && row.pin === '1357'));
    assert.notEqual(ui.captures[0].requestId, ui.captures[1].requestId);
    assert.equal(ui.calls.length, 0);
    assert.doesNotMatch(ui.text, /You just clocked/);
  });
}

test('kiosk setup 409 retains OTP and new PIN and confirms against setup, never pin-clock', async () => {
  const ui = await kiosk();
  await ui.setup(); await ui.submitSetup();
  assert.equal(ui.setupCalls.length, 1);
  assert.deepEqual(ui.setupValues(), ['123456', '2468', '2468']);
  assert.notEqual(ui.setupCalls[0].body.confirm_opposite, true);
  assert.match(text(ui.dialog()), /You just clocked out\. Clock in now\?/);
  await ui.confirm();
  assert.equal(ui.setupCalls.length, 2);
  assert.equal(ui.setupCalls[1].url, ui.setupCalls[0].url);
  assert.equal(ui.setupCalls[1].body.confirm_opposite, true);
  for (const key of ['identifier', 'verification_code', 'new_pin']) {
    assert.equal(ui.setupCalls[1].body[key], ui.setupCalls[0].body[key]);
  }
  assert.equal(ui.setupCalls[1].config.headers['X-Device-Token'], 'device-token');
  assert.equal(ui.calls.length, 0, 'Setup confirmation must not call /pin-clock/');
  assert.match(ui.text, /Clocked In Successfully/i);
});

test('cancelling setup confirmation retains credentials for retry without another request', async () => {
  const ui = await kiosk();
  await ui.setup(); await ui.submitSetup(); ui.dialog(); await ui.cancel();
  assert.equal(ui.setupCalls.length, 1);
  assert.equal(ui.calls.length, 0);
  assert.deepEqual(ui.setupValues(), ['123456', '2468', '2468']);
  assert.doesNotMatch(ui.text, /Clocked In Successfully/i);
});


for (const first of ['Clock In', 'Clock Out']) {
  test('native kiosk pending server: immediate local prompt and confirmed evidence after ' + first, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const ui = await kiosk({ desktop: true, timers: t.mock.timers });
    assert.equal(ui.network.onLine, true);
    assert.equal(ui.cachedQrToken, 'qr', 'A cached QR must not hide a server outage');
    ui.hangServer();
    // Leave an actual QR promise pending throughout every assertion, including confirmation.
    let qrSettled = false;
    void ui.requestQr().finally(() => { qrSettled = true; });
    if (first === 'Clock Out') await ui.choose(first);
    await ui.enter();
    const firstNetworkCount = ui.networkCalls.length;
    const initial = await ui.submitWithoutWaiting();
    assert.equal(ui.captures.length, 1, 'First native action must capture without waiting for the server');
    assert.equal(initial.settled, true);
    assert.equal(ui.networkCalls.length, firstNetworkCount, 'First capture must not ask QR/HTTP permission');
    assert.doesNotMatch(ui.text, /You just clocked/);
    ui.advance(30);
    await ui.flush();
    await ui.choose(first === 'Clock In' ? 'Clock Out' : 'Clock In');
    await ui.enter();
    const beforeSubmit = ui.networkCalls.length;
    const opposite = await ui.submitWithoutWaiting();
    // No timer advance or network resolution between submission and the visible prompt.
    assert.match(text(ui.dialog()), first === 'Clock In'
      ? /You just clocked in\. Clock out now\?/ : /You just clocked out\. Clock in now\?/);
    assert.equal(opposite.settled, true, 'Opening the prompt must not await QR/HTTP');
    assert.equal(ui.networkCalls.length, beforeSubmit, 'Local confirmation must not start a QR/HTTP check');
    assert.equal(ui.captures.length, 1, 'Confirmation must precede the second signed capture');
    assert.equal(ui.prepared.length, 1, 'Do not prepare the pending action before confirmation');
    const confirmed = await ui.confirmWithoutWaiting();
    assert.equal(confirmed.settled, true, 'Confirmed evidence must not await the pending server');
    assert.equal(ui.captures.length, 2);
    assert.deepEqual(ui.captures.map((row) => row.action),
      first === 'Clock In' ? ['CLOCK_IN', 'CLOCK_OUT'] : ['CLOCK_OUT', 'CLOCK_IN']);
    assert.equal(ui.prepared.length, 2);
    assert.ok(ui.captures.every((row) => row.requestId && row.pin === '1357' && row.identifier === 'casey@example.test'));
    assert.notEqual(ui.captures[0].requestId, ui.captures[1].requestId);
    assert.deepEqual(ui.captures.map((row) => row.requestId), ui.prepared.map((row) => row.id));
    assert.deepEqual(ui.receipts.map((row) => row.requestId), ui.captures.map((row) => row.requestId));
    assert.ok(ui.receipts.every((row) => row.eventId));
    assert.equal(ui.networkCalls.length, beforeSubmit, 'Confirmed native capture must also avoid QR/HTTP');
    assert.equal(ui.calls.length, 0);
    assert.equal(qrSettled, false, 'The outage request must still be unresolved after capture');
    assert.doesNotMatch(ui.text, /You just clocked/);
  });

  test('native kiosk pending server: ' + first + ' then opposite at 61 seconds captures without a prompt', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const ui = await kiosk({ desktop: true, timers: t.mock.timers });
    ui.hangServer();
    if (first === 'Clock Out') await ui.choose(first);
    await ui.enter();
    await ui.submitWithoutWaiting();
    assert.equal(ui.captures.length, 1);
    ui.advance(61);
    await ui.flush();
    await ui.choose(first === 'Clock In' ? 'Clock Out' : 'Clock In');
    await ui.enter();
    const beforeSubmit = ui.networkCalls.length;
    const expired = await ui.submitWithoutWaiting();
    assert.equal(expired.settled, true);
    assert.equal(ui.captures.length, 2);
    assert.equal(ui.captures[1].action, first === 'Clock In' ? 'CLOCK_OUT' : 'CLOCK_IN');
    assert.equal(ui.networkCalls.length, beforeSubmit);
    assert.doesNotMatch(ui.text, /You just clocked/);
  });

  test('native kiosk pending server: repeating ' + first + ' keeps the same action without a prompt', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const ui = await kiosk({ desktop: true, timers: t.mock.timers });
    ui.hangServer();
    if (first === 'Clock Out') await ui.choose(first);
    await ui.enter();
    await ui.submitWithoutWaiting();
    assert.equal(ui.captures.length, 1);
    ui.advance(30);
    await ui.flush();
    await ui.enter();
    const beforeSubmit = ui.networkCalls.length;
    const repeated = await ui.submitWithoutWaiting();
    assert.equal(repeated.settled, true);
    const action = first === 'Clock In' ? 'CLOCK_IN' : 'CLOCK_OUT';
    assert.deepEqual(ui.captures.map((row) => row.action), [action, action]);
    assert.equal(ui.networkCalls.length, beforeSubmit);
    assert.doesNotMatch(ui.text, /You just clocked/);
  });
}
