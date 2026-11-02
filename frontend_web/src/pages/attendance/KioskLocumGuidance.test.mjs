import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

function nodes(node, type) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (typeof node !== 'object') return [];
  if (node.props?.hidden || (node.type === 'Dialog' && !node.props.open)) return [];
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (node.props?.hidden || (node.type === 'Dialog' && !node.props.open)) return '';
  return text(node.props?.children);
}

async function kiosk({ desktop = false } = {}) {
  const state = [], deps = [], memo = [];
  let cursor = 0, dirty = true, effects = [], tree;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => {
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
    useEffect(fn, next) {
      const index = cursor++;
      if (!equal(deps[index], next)) { deps[index] = next; effects.push(fn); }
    },
  };
  const calls = [];
  const qr = () => ({ qr_token: 'signed-qr', expires_at: new Date(Date.now() + 30000).toISOString(), pharmacy_name: 'Guidance Pharmacy' });
  const names = new Proxy({}, { get: (_, name) => String(name) });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@mui/material': names, 'qrcode.react': names,
    '../../kiosk/desktopBridge': {
      isDesktopKiosk: () => desktop,
      getDesktopKioskStatus: async () => ({ paired: true, pharmacy_name: 'Guidance Pharmacy' }),
      getDesktopOnlineQr: async () => qr(), getDesktopPendingCount: async () => 0,
    },
    './KioskPage.runtime': {
      KIOSK_TOKEN_KEY: 'token', KIOSK_PHARMACY_NAME_KEY: 'name', KIOSK_PHARMACY_ID_KEY: 'pharmacy',
      kioskClient: { async post(url, body, config) {
        if (url.endsWith('/qr/')) return { data: qr() };
        assert.ok(url.endsWith('/pin-clock/'), `Unexpected kiosk API call: ${url}`);
        calls.push(structuredClone({ url, body, config }));
        return { data: { action: 'CLOCKED_IN', worker_name: 'Casey', session_id: 8 } };
      } },
    },
    '../../constants/api': { API_BASE_URL: '/api/v1' }, '../../utils/tokenService': { clearTokens() {} },
    '../../kiosk/KioskSetup': 'KioskSetup', './KioskActivationView': 'KioskActivationView', './KioskBreakDialog': 'KioskBreakDialog',
  };
  const storage = new Map([['token', 'device-token'], ['name', 'Guidance Pharmacy']]);
  const { outputText } = ts.transpileModule(readFileSync(new URL('./KioskPage.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, console, crypto: { randomUUID }, navigator: { onLine: true },
    window: { addEventListener() {}, removeEventListener() {} },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    require(name) {
      if (name in imports) return imports[name];
      if (name.startsWith('@mui/icons-material/')) return 'Icon';
      throw new Error(`Unmocked kiosk dependency: ${name}`);
    },
  });
  async function flush() {
    for (let i = 0; i < 40; i++) {
      if (dirty) {
        cursor = 0; dirty = false; tree = exports.default();
        const pending = effects; effects = []; pending.forEach(fn => fn());
      }
      await new Promise(setImmediate);
      if (!dirty && !effects.length) return;
    }
    assert.fail('Kiosk effects did not settle');
  }
  async function click(pattern) {
    const button = nodes(tree, 'Button').find(node => pattern.test(text(node)));
    assert.ok(button, `Missing kiosk button ${pattern}`); assert.ok(!button.props.disabled);
    await button.props.onClick({ type: 'click' }); await flush();
  }
  await flush();
  return {
    calls,
    pinPanel() {
      // Scope guidance to the PIN entry card, excluding QR/settings/setup dialogs.
      const panel = nodes(tree, 'Paper').find(node => nodes(node, 'TextField').some(field => /Staff Email or ID/i.test(field.props.placeholder || '')));
      assert.ok(panel, 'The paired kiosk must show PIN entry without extra interaction'); return panel;
    },
    async submit() {
      const field = nodes(tree, 'TextField').find(node => /Staff Email or ID/i.test(node.props.placeholder || ''));
      assert.ok(field); assert.ok(!field.props.disabled);
      field.props.onChange({ target: { value: 'casey@example.test' } }); await flush();
      for (const digit of '1357') await click(new RegExp(`^${digit}$`));
      await click(/^Confirm Clock In \/ Out$/i);
    },
  };
}

for (const desktop of [false, true]) {
  test(`${desktop ? 'desktop' : 'web'} kiosk PIN guidance tells pending members to accept invitations in the app`, async () => {
    const ui = await kiosk({ desktop }); const panel = ui.pinPanel(); const copy = text(panel);
    assert.match(copy, /pending[^.!?]*invit/i);
    assert.match(copy, /accept[^.!?]*invit|invit[^.!?]*accept/i);
    assert.match(copy, /(?:app[^.!?]*invit|invit[^.!?]*app)/i);
    for (const type of ['Button', 'Link', 'a']) {
      assert.ok(!nodes(panel, type).some(node => /invit|accept/i.test(text(node))), 'Shared terminals provide invitation guidance as text only');
    }
    assert.equal(ui.calls.length, 0, 'Invitation guidance must not submit attendance');
  });

  test(`${desktop ? 'desktop' : 'web'} kiosk PIN entry directs booked locums without staff membership to mobile QR`, async () => {
    const ui = await kiosk({ desktop }); const copy = text(ui.pinPanel());
    assert.match(copy, /booked locums/i); assert.match(copy, /(?:without|no|not have|don't have).*staff membership/i);
    assert.match(copy, /mobile app/i); assert.match(copy, /scan\w*/i); assert.match(copy, /QR/i);
    assert.equal(ui.calls.length, 0, 'Reading locum guidance must not submit attendance');
  });
}

test('kiosk PIN entry explains that a booking alone gives no kiosk PIN', async () => {
  const ui = await kiosk(); const copy = text(ui.pinPanel());
  assert.match(copy, /booking alone/i);
  assert.match(copy, /(?:no|not|doesn.t|won.t|cannot|can.t)[^.!?]{0,70}kiosk PIN|kiosk PIN[^.!?]{0,70}(?:not|unavailable)/i);
});

test('kiosk PIN entry still submits an eligible worker without a guidance acknowledgement', async () => {
  const ui = await kiosk(); ui.pinPanel(); await ui.submit();
  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].body.identifier, 'casey@example.test'); assert.equal(ui.calls[0].body.pin, '1357');
  assert.ok(ui.calls[0].body.request_id); assert.notEqual(ui.calls[0].body.confirm_opposite, true);
  assert.equal(ui.calls[0].config.headers['X-Device-Token'], 'device-token');
});

for (const desktop of [false, true]) {
  test(`${desktop ? 'desktop' : 'web'} kiosk guides unbooked verified pharmacists to scan pharmacy QR in the ChemistTasker app`, async () => {
    const ui = await kiosk({ desktop }); const copy = text(ui.pinPanel());
    assert.match(copy, /unbooked|no booking/i);
    assert.match(copy, /verified\s+pharmacist/i);
    assert.match(copy, /scan/i); assert.match(copy, /pharmacy[^.!?]*QR|QR[^.!?]*pharmacy/i);
    assert.match(copy, /ChemistTasker\s+app/i);
    assert.equal(ui.calls.length, 0, 'Reading unbooked locum guidance must not submit attendance');
  });

  test(`${desktop ? 'desktop' : 'web'} kiosk explains manager approval before unbooked locum cover is paid`, async () => {
    const ui = await kiosk({ desktop }); const copy = text(ui.pinPanel());
    assert.match(copy, /manager[^.!?]*approve|approve[^.!?]*manager/i);
    assert.match(copy, /before[^.!?]*(?:paid|payable)/i);
    assert.equal(ui.calls.length, 0);
  });
}
