import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const dialogUrl = new URL('./KioskPairingDialog.tsx', import.meta.url);
const detailUrl = new URL('../dashboard/sidebar/owner/OwnerPharmacyDetailPage.tsx', import.meta.url);
const pharmacies = [
  { id: 9, name: 'Manageable Alpha', timezone: 'Australia/Brisbane' },
  { id: 10, name: 'Manageable Beta', timezone: 'Australia/Sydney' },
];

function children(node) {
  return ['children', 'actions', 'action', 'endAdornment', 'startAdornment'].map((key) => node.props?.[key]);
}
function nodes(node, predicate) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, predicate));
  if (node.type === 'Dialog' && !node.props.open) return [];
  return [...(predicate(node) ? [node.props] : []), ...children(node).flatMap((child) => nodes(child, predicate))];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (node.type === 'Dialog' && !node.props.open) return '';
  return children(node).map(text).join(' ');
}

// Real TSX handlers and effects, with the same hook/JSX host approach as the
// existing attendance tests. Only UI, clock, clipboard and API boundaries are fake.
// T7 dialog contract: default export ({ open, onClose, pharmacyId? }).
async function pairing({ options = pharmacies, pharmacyId = 9, issue, load, page = false, adminLevel } = {}) {
  if (!page) assert.ok(existsSync(dialogUrl), 'T7 is missing: implement KioskPairingDialog.tsx');
  let now = Date.parse('2026-10-29T00:00:00Z');
  class ControlledDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  let dirty = true, active, tree, effects = [], timerId = 0;
  const hosts = new Map(), timers = new Map(), calls = [], copied = [], stateUpdates = [];
  const props = { open: true, pharmacyId, onClose: () => { props.open = false; dirty = true; } };
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const host = active, index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [host.slots[index], (value) => {
        const next = typeof value === 'function' ? value(host.slots[index]) : value;
        if (host.mounted && !Object.is(next, host.slots[index])) {
          stateUpdates.push({ index, value: next });
          host.slots[index] = next; dirty = true;
        }
      }];
    },
    useRef(initial) { const index = active.cursor++; return active.slots[index] ??= { current: initial }; },
    useMemo(fn, deps) {
      const index = active.cursor++;
      if (!active.slots[index] || !equal(active.slots[index].deps, deps)) active.slots[index] = { deps, value: fn() };
      return active.slots[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const host = active, index = host.cursor++;
      if (!host.slots[index] || !equal(host.slots[index].deps, deps)) {
        host.slots[index]?.cleanup?.();
        const slot = host.slots[index] = { deps };
        effects.push(() => { if (host.mounted) slot.cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const names = new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
  const attendance = {
    async getKioskPairingOptions(...args) {
      calls.push(['options', ...args]);
      return load ? load() : { pharmacies: structuredClone(options) };
    },
    async createKioskPairingCode(...args) {
      calls.push(['issue', ...args]);
      return issue ? issue(...args) : { pairing_code: '012345', expires_in_seconds: 900 };
    },
  };
  const imports = {
    react: hooks, 'react/jsx-runtime': { Fragment: 'Fragment', jsx, jsxs: jsx },
    '@mui/material': names, '@mui/icons-material': names, 'lucide-react': names,
    '@chemisttasker/shared-core': {
      attendance,
      // Broader dashboard visibility must never supply the pairing selector.
      fetchPharmaciesService: async () => [...pharmacies, { id: 99, name: 'Unmanageable pharmacy' }],
    },
    'react-router-dom': {
      useNavigate: () => () => {},
      useLocation: () => ({ pathname: `/dashboard/${adminLevel ? 'admin/4' : 'owner'}/manage-pharmacies/${pharmacyId}` }),
      useSearchParams: () => [new URLSearchParams(), () => {}],
    },
    './usePayrollSetting': { usePayrollSetting: () => ({}) },
    './teamUi': { roleLabel: (value) => value },
  };
  const context = vm.createContext({
    Date: ControlledDate, console, URLSearchParams,
    navigator: { clipboard: { writeText: async (value) => { copied.push(value); } } },
    setInterval(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, due: now + delay, repeat: true }); return id; },
    clearInterval(id) { timers.delete(id); },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  function loadModule(url) {
    assert.ok(existsSync(url), `T7 is missing: ${url.pathname}`);
    const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const exports = {};
    const run = vm.runInContext(`(function(require, exports) { ${outputText}\n})`, context);
    run((name) => {
      if (name in imports) return imports[name];
      if (name.startsWith('@mui/')) return { __esModule: true, default: name.split('/').at(-1) };
      if (name.startsWith('.')) {
        if (/\/KioskPairingDialog(?:\.tsx)?$/.test(name)) return loadModule(dialogUrl);
        // Keep existing detail-page child panels outside this interaction test.
        if (url.href === detailUrl.href) return new Proxy({ __esModule: true, default: name }, { get: (obj, key) => key in obj ? obj[key] : String(key) });
        const target = ['', '.tsx', '.ts'].map((suffix) => new URL(name + suffix, url)).find(existsSync);
        assert.ok(target, `Missing relative module: ${name}`);
        return loadModule(target);
      }
      assert.fail(`Unmocked pairing boundary: ${name}`);
    }, exports);
    return exports;
  }
  const Root = loadModule(page ? detailUrl : dialogUrl).default;
  assert.equal(typeof Root, 'function');
  const rootProps = page ? {
    pharmacy: { id: pharmacyId, name: 'Manageable Alpha', can_edit: true },
    staffMemberships: [], locumMemberships: [],
    adminAssignments: adminLevel ? [{ id: 4, pharmacy: pharmacyId, admin_level: adminLevel, is_active: true }] : [],
    onMembershipsChanged() {},
  } : props;
  function render() {
    dirty = false;
    const visited = new Set();
    function expand(node, path) {
      if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}/${i}`));
      if (!node || typeof node !== 'object') return node;
      if (typeof node.type === 'function') {
        const id = `${path}:${node.key ?? ''}`;
        if (!hosts.has(id)) hosts.set(id, { slots: [], mounted: true });
        active = hosts.get(id); active.cursor = 0; visited.add(id);
        return expand(node.type(node.props), `${id}/render`);
      }
      const result = { ...node, props: { ...node.props } };
      for (const key of ['children', 'actions', 'action', 'endAdornment', 'startAdornment']) {
        if (key in result.props) result.props[key] = expand(result.props[key], `${path}/${key}`);
      }
      return result;
    }
    tree = expand({ type: Root, props: rootProps }, 'root');
    for (const [id, host] of hosts) if (!visited.has(id)) {
      host.mounted = false; host.slots.forEach((slot) => slot?.cleanup?.()); hosts.delete(id);
    }
    const queued = effects; effects = []; queued.forEach((fn) => fn());
  }
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) render();
      await new Promise(setImmediate);
      if (!dirty && !effects.length) return;
    }
    assert.fail('Pairing effects did not settle');
  }
  function find(type, match) {
    const found = nodes(tree, (node) => node.type === type).find(match);
    assert.ok(found, `Missing ${type}: ${text(tree)}`);
    return found;
  }
  const ui = {
    calls, copied, flush, stateUpdates,
    get text() { return text(tree); },
    get issues() { return calls.filter(([kind]) => kind === 'issue'); },
    hasButton(label) { return nodes(tree, (node) => node.type === 'Button').some((p) => label.test(text(p.children) || p['aria-label'] || '')); },
    button(label) { return find('Button', (p) => label.test(text(p.children) || p['aria-label'] || '')); },
    async click(label) { await ui.button(label).onClick(); await flush(); },
    async name(value = 'Front counter') {
      find('TextField', (p) => /terminal name|device name/i.test(p.label)).onChange({ target: { value } });
      await flush();
    },
    displayedValues() { return nodes(tree, () => true).map((p) => p.value).filter((v) => typeof v === 'string'); },
    async advance(seconds) {
      now += seconds * 1000;
      for (const [id, timer] of [...timers]) if (timer.due <= now) {
        if (timer.repeat) timer.due = now + timer.delay; else timers.delete(id);
        timer.fn();
      }
      await flush();
    },
    async pharmacy(id) { props.pharmacyId = id; dirty = true; await flush(); },
    async reopen() { props.open = true; dirty = true; await flush(); },
  };
  await flush();
  return ui;
}

test('owner/manager pharmacy detail opens the pairing dialog for its selected pharmacy', async () => {
  const ui = await pairing({ page: true });
  await ui.click(/pair new terminal/i);
  await ui.name();
  await ui.click(/generate|create.*code/i);
  assert.deepEqual(ui.issues, [['issue', 9, 'Front counter', 'web']]);
});

for (const adminLevel of ['ROSTER_MANAGER', 'COMMUNICATION_MANAGER']) {
  test(`${adminLevel}-only pharmacy detail hides the pairing trigger when no pharmacies are manageable`, async () => {
    const ui = await pairing({ page: true, adminLevel, options: [] });
    assert.equal(ui.hasButton(/pair new terminal/i), false);
    assert.equal(ui.issues.length, 0);
  });
}

test('pharmacy detail hides the pairing trigger when only another pharmacy is manageable', async () => {
  const ui = await pairing({ page: true, options: [pharmacies[1]] });
  assert.equal(ui.hasButton(/pair new terminal/i), false, 'Pairing access to a sibling pharmacy must not expose this trigger');
  assert.equal(ui.issues.length, 0);
});

test('owner pharmacy detail shows the pairing trigger when this pharmacy is manageable', async () => {
  const ui = await pairing({ page: true, options: [pharmacies[0]] });
  assert.equal(ui.hasButton(/pair new terminal/i), true);
});

test('dialog uses manageable pairing options and the authenticated shared-core web operations', async () => {
  const ui = await pairing();
  assert.deepEqual(ui.calls, [['options', 'web']]);
  assert.match(ui.text, /Manageable Alpha/);
  assert.doesNotMatch(ui.text, /Unmanageable pharmacy/);
  await ui.name();
  await ui.click(/generate|create.*code/i);
  assert.deepEqual(ui.issues, [['issue', 9, 'Front counter', 'web']]);
});

test('an out-of-scope pharmacy cannot issue even if a generate handler is invoked', async () => {
  const ui = await pairing({ pharmacyId: 99 });
  await ui.name();
  assert.doesNotMatch(ui.text, /Unmanageable pharmacy/);
  assert.equal(ui.issues.length, 0);
  const generate = ui.button(/generate|create.*code/i);
  assert.equal(generate.disabled, true);
  await generate.onClick();
  await ui.flush();
  assert.equal(ui.issues.length, 0);
});

test('empty manageable options explain the lack of access and cannot issue', async () => {
  const ui = await pairing({ options: [] });
  assert.match(ui.text, /no.*pharmac|not.*authori[sz]ed|no.*access|cannot.*pair/i);
  assert.equal(ui.button(/generate|create.*code/i).disabled, true);
  await ui.click(/generate|create.*code/i);
  assert.equal(ui.issues.length, 0);
});

test('six-digit code keeps its leading zero, displays expiry and copies the exact code', async () => {
  const ui = await pairing();
  await ui.name();
  await ui.click(/generate|create.*code/i);
  assert.ok(ui.text.includes('012345') || ui.displayedValues().includes('012345'), 'Display the code as a string');
  assert.match(ui.text, /15:00|15\s*(?:m|minutes)|900\s*s/i);
  await ui.click(/copy/i);
  assert.deepEqual(ui.copied, ['012345']);
  await ui.advance(1);
  assert.match(ui.text, /14:59|14\s*m.*59|899\s*s/i, 'The expiry display must count down');
});

test('expiry uses the server TTL, disables copying and permits a fresh code', async () => {
  let requests = 0;
  const ui = await pairing({ issue: async () => ({ pairing_code: ++requests === 1 ? '012345' : '654321', expires_in_seconds: 2 }) });
  await ui.name();
  await ui.click(/generate|create.*code/i);
  await ui.advance(2);
  assert.match(ui.text, /expired/i);
  const copy = ui.button(/copy/i);
  assert.equal(copy.disabled, true);
  await copy.onClick();
  await ui.flush();
  assert.deepEqual(ui.copied, [], 'Programmatic clicks must not copy an expired code');
  assert.equal(Boolean(ui.button(/generate|create.*code/i).disabled), false);
  await ui.click(/generate|create.*code/i);
  assert.equal(ui.issues.length, 2);
  assert.ok(ui.text.includes('654321') || ui.displayedValues().includes('654321'));
});

test('issuance failure is visible without inventing a local code or retrying issuance', async () => {
  const ui = await pairing({ issue: async () => { throw Object.assign(new Error('Pairing permission was removed.'), { status: 403 }); } });
  await ui.name();
  await ui.click(/generate|create.*code/i);
  assert.match(ui.text, /permission|removed|authori[sz]|failed|unable/i);
  assert.equal(ui.issues.length, 1);
  assert.ok(!ui.text.includes('012345'));
  assert.ok(!ui.displayedValues().includes('012345'));
});

test('unresolved issuance is submitted once even if the handler is invoked again', async () => {
  let complete;
  const result = new Promise((resolve) => { complete = resolve; });
  const ui = await pairing({ issue: () => result });
  await ui.name();
  const pending = ui.button(/generate|create.*code/i).onClick();
  await ui.flush();
  const generate = ui.button(/generat|creat|loading/i);
  assert.equal(generate.disabled, true);
  const duplicate = generate.onClick();
  await ui.flush();
  assert.equal(ui.issues.length, 1);
  complete({ pairing_code: '012345', expires_in_seconds: 900 });
  await Promise.all([pending, duplicate]);
  await ui.flush();
});

test('changing pharmacy clears its old code and ignores a late issuance response', async () => {
  let complete;
  const result = new Promise((resolve) => { complete = resolve; });
  const ui = await pairing({ issue: () => result });
  await ui.name();
  const pending = ui.button(/generate|create.*code/i).onClick();
  await ui.flush();
  await ui.pharmacy(10);
  complete({ pairing_code: '012345', expires_in_seconds: 900 });
  await pending;
  await ui.flush();
  assert.ok(!ui.text.includes('012345'), 'A code for the previous pharmacy must not appear in the new context');
  assert.ok(!ui.displayedValues().includes('012345'));
  assert.equal(ui.issues.length, 1);
});

test('closing during issuance ignores the stale success without changing state or showing its code on reopen', async () => {
  let complete;
  const result = new Promise((resolve) => { complete = resolve; });
  const ui = await pairing({ issue: () => result });
  await ui.name();
  const pending = ui.button(/generate|create.*code/i).onClick();
  await ui.flush();
  await ui.click(/^close$/i);
  const updatesAfterClose = ui.stateUpdates.length;

  complete({ pairing_code: '012345', expires_in_seconds: 900 });
  await pending;
  await ui.flush();
  const staleUpdates = ui.stateUpdates.slice(updatesAfterClose);
  await ui.reopen();

  assert.deepEqual({
    codeShown: ui.text.includes('012345') || ui.displayedValues().includes('012345'),
    stateChanges: staleUpdates.length,
  }, { codeShown: false, stateChanges: 0 }, 'Ignore the closed request entirely, including its state cleanup');
  assert.equal(Boolean(ui.button(/generate|create.*code/i).disabled), false, 'The reopened dialog can generate a fresh code');
  assert.equal(ui.issues.length, 1);
});

test('a response from a closed dialog cannot replace a newer issuance after reopening', async () => {
  let completeOld, completeNew;
  const oldResult = new Promise((resolve) => { completeOld = resolve; });
  const newResult = new Promise((resolve) => { completeNew = resolve; });
  let requests = 0;
  const ui = await pairing({ issue: () => ++requests === 1 ? oldResult : newResult });
  const oldPending = ui.button(/generate|create.*code/i).onClick();
  await ui.flush();
  await ui.click(/^close$/i);
  await ui.reopen();
  assert.equal(Boolean(ui.button(/generat|creat|loading/i).disabled), false, 'Closing must release the previous issuance state');
  const newPending = ui.button(/generate|create.*code/i).onClick();
  await ui.flush();
  const updatesBeforeOldResponse = ui.stateUpdates.length;

  completeOld({ pairing_code: '012345', expires_in_seconds: 900 });
  await oldPending;
  await ui.flush();
  assert.equal(ui.stateUpdates.length, updatesBeforeOldResponse, 'The old response must not clear the new request\'s loading state');
  assert.equal(ui.button(/generat|creat|loading/i).disabled, true);
  assert.ok(!ui.text.includes('012345') && !ui.displayedValues().includes('012345'));

  completeNew({ pairing_code: '654321', expires_in_seconds: 900 });
  await newPending;
  await ui.flush();
  assert.ok(ui.text.includes('654321') || ui.displayedValues().includes('654321'));
  assert.equal(ui.issues.length, 2);
});
