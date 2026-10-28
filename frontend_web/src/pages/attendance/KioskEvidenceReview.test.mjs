import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const componentUrl = new URL('./KioskEvidenceReview.tsx', import.meta.url);
const evidence = {
  event_id: 'c0443a0b-482c-4ef5-973d-432e939cc058', employee_id: 17,
  worker_name: 'Casey Worker', event_type: 'CLOCK_IN', device_id: 4,
  device_name: 'Windows Counter', pharmacy_timezone: 'Australia/Brisbane',
  device_timestamp: '2026-10-28T07:30:00+10:00',
  trusted_time_estimate: '2026-10-28T08:00:00+10:00',
  received_at: '2026-10-28T08:10:00+10:00', integrity_flags: ['CLOCK_ANCHOR_DRIFT'],
  can_approve: true, approval_block_reason: null,
};

function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (node.type === 'Dialog' && !node.props?.open) return '';
  return text(node.props?.children);
}
function nodes(tree, type) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.type === 'Dialog' && !node.props?.open) return;
    if (node.type === type) found.push(node.props);
    for (const key of ['children', 'action', 'actions', 'endAdornment', 'startAdornment']) visit(node.props?.[key]);
  }
  visit(tree);
  return found;
}

// Same real-handler hook/JSX host used by TimesheetAdjustTimesDialog.test.mjs.
// T4 component contract: default export KioskEvidenceReview({ pharmacyId }).
async function review({ rows = [evidence], load, decide, page = false } = {}) {
  assert.ok(existsSync(componentUrl), 'T4 is missing: implement the planned KioskEvidenceReview.tsx component');
  const instances = new Map();
  let active;
  let dirty = true;
  let effects = [];
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const host = active;
      const index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [host.slots[index], (value) => {
        host.slots[index] = typeof value === 'function' ? value(host.slots[index]) : value;
        if (host.mounted) dirty = true;
      }];
    },
    useRef(initial) {
      const index = active.cursor++;
      return active.slots[index] ??= { current: initial };
    },
    useMemo(fn, deps) {
      const index = active.cursor++;
      if (!active.slots[index] || !equalDeps(active.slots[index].deps, deps)) active.slots[index] = { deps, value: fn() };
      return active.slots[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const host = active;
      const index = host.cursor++;
      if (!host.slots[index] || !equalDeps(host.slots[index].deps, deps)) {
        host.slots[index]?.cleanup?.();
        const slot = host.slots[index] = { deps };
        effects.push(() => { if (host.mounted) slot.cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const runtime = { Fragment: 'Fragment', jsx, jsxs: jsx };
  const names = new Proxy({}, { get: (_target, name) => name === '__esModule' ? false : String(name) });
  const calls = [];
  const attendance = {
    async getManagerPending() { return []; },
    async getManagerPendingKioskReviews(id) {
      calls.push(['load', id]);
      return load ? load(id) : structuredClone(rows);
    },
    async decideKioskReview(payload) {
      calls.push(['decide', structuredClone(payload)]);
      if (decide) return decide(payload);
      rows = rows.filter((row) => row.event_id !== payload.event_id);
      return { decision: payload.decision, review_id: 21, attendance_event_id: payload.decision === 'APPROVED' ? 33 : null };
    },
  };
  const imports = {
    react: hooks, 'react/jsx-runtime': runtime, '@mui/material': names,
    'lucide-react': names, '@mui/icons-material': names,
    '@chemisttasker/shared-core': {
      attendance,
      fetchPharmaciesService: async () => [{ id: 9, name: 'Old pharmacy' }, { id: 10, name: 'New pharmacy' }],
    },
    '../../components/ui/PageHeader': { __esModule: true, default: 'PageHeader' },
    '../../components/dashboard/DashboardContentState': { __esModule: true, default: 'DashboardContentState' },
    '../../components/ui/InitialsAvatar': { InitialsAvatar: 'InitialsAvatar' },
    '../../components/ui/Pill': { Pill: 'Pill' },
    '../../utils/labels': { humanizeEnum: (value) => value },
  };
  function loadModule(url) {
    const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const exports = {};
    new Function('require', 'exports', outputText)((name) => {
      if (name in imports) return imports[name];
      if (name.startsWith('.')) {
        for (const suffix of ['', '.ts', '.tsx']) {
          const local = new URL(name + suffix, url);
          if (existsSync(local)) return loadModule(local);
        }
      }
      return require(name);
    }, exports);
    return exports;
  }
  const { default: Component } = loadModule(componentUrl);
  assert.equal(typeof Component, 'function', 'T4 must export its review component');
  imports['./KioskEvidenceReview'] = { __esModule: true, default: Component };
  const Root = page ? loadModule(new URL('./ManagerAttendanceReviewPage.tsx', import.meta.url)).default : Component;
  let tree;
  function render() {
    dirty = false;
    const visited = new Set();
    function expand(node, path) {
      if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}/${index}`));
      if (node == null || typeof node !== 'object') return node;
      if (typeof node.type === 'function') {
        // React key changes discard the old hooks and run their effect cleanups.
        const identity = `${path}:${node.key ?? ''}`;
        if (!instances.has(identity)) instances.set(identity, { slots: [], mounted: true });
        active = instances.get(identity);
        active.cursor = 0;
        visited.add(identity);
        return expand(node.type(node.props), `${identity}/render`);
      }
      const props = { ...node.props };
      for (const name of ['children', 'action', 'actions', 'endAdornment', 'startAdornment']) {
        if (name in props) props[name] = expand(props[name], `${path}/${name}`);
      }
      return { ...node, props };
    }
    tree = expand({ type: Root, props: { pharmacyId: 9 } }, 'root');
    for (const [identity, host] of instances) {
      if (!visited.has(identity)) {
        host.mounted = false;
        host.slots.forEach((slot) => slot?.cleanup?.());
        instances.delete(identity);
      }
    }
    const queued = effects;
    effects = [];
    queued.forEach((effect) => effect());
  }
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) render();
      await new Promise(setImmediate);
      if (!dirty && effects.length === 0) return;
    }
    assert.fail('Review component effects did not settle');
  }
  function find(type, predicate, root = tree) {
    const found = nodes(root, type).find(predicate);
    assert.ok(found, `Missing ${type} matching the requested control: ${text(tree)}; calls=${JSON.stringify(calls)}`);
    return found;
  }
  function button(action, inDialog = false) {
    const root = inDialog ? { props: { children: nodes(tree, 'Dialog').filter((props) => props.open).map((props) => ({ type: 'Dialog', props })) } } : tree;
    return find('Button', (props) => new RegExp(action, 'i').test(text(props.children) || props['aria-label'] || ''), root);
  }
  const ui = {
    calls, flush,
    get dialogs() { return nodes(tree, 'Dialog').filter((props) => props.open); },
    async selectPharmacy(id) {
      find('Select', (props) => props.label === 'Pharmacy').onChange({ target: { value: id } });
      await flush();
    },
    get text() { return text(tree); },
    get loading() { return nodes(tree, 'CircularProgress').length > 0 || /loading/i.test(text(tree)); },
    button,
    async open(action) { button(action).onClick(); await flush(); },
    async edit(label, value) {
      find('TextField', (props) => label.test(String(props.label))).onChange({ target: { value } });
      await flush();
    },
    async submit(action) { await button(action, true).onClick(); await flush(); },
    get decisions() { return calls.filter(([kind]) => kind === 'decide').map(([, payload]) => payload); },
  };
  await flush();
  return ui;
}

test('manager page mounts flagged evidence separately with the selected pharmacy', () => {
  const source = readFileSync(new URL('./ManagerAttendanceReviewPage.tsx', import.meta.url), 'utf8');
  assert.ok(/<KioskEvidenceReview\b/.test(source), 'T4 must mount the evidence queue beside provisional reviews');
  assert.match(source, /pharmacyId=\{(?:Number\()?selectedPharmacyId/, 'Evidence queue must follow the pharmacy selection');
  assert.match(source, /attendance\.getManagerPending\(/, 'Existing provisional queue must remain available');
});

test('queue displays worker, device, flags and pharmacy timezone', async () => {
  const ui = await review();
  assert.deepEqual(ui.calls, [['load', 9]]);
  for (const label of ['Flagged Kiosk Evidence', 'Casey Worker', 'Windows Counter', 'Australia/Brisbane']) {
    assert.ok(ui.text.includes(label), `Missing display context: ${label}`);
  }
  assert.match(ui.text, /drift/i);
});

test('approval requires reason and corrected time, then refreshes the queue', async () => {
  const ui = await review();
  await ui.open('approve');
  await ui.edit(/reason|justification/i, '   ');
  assert.equal(ui.button('approve', true).disabled, true);
  await ui.submit('approve'); // Guard programmatic clicks as well as the button.
  assert.equal(ui.decisions.length, 0);
  await ui.edit(/reason|justification/i, 'Checked shift record.');
  await ui.edit(/corrected|actual time/i, '');
  assert.equal(ui.button('approve', true).disabled, true);
  await ui.submit('approve');
  assert.equal(ui.decisions.length, 0);
  await ui.edit(/corrected|actual time/i, '2026-10-28T08:00');
  assert.equal(Boolean(ui.button('approve', true).disabled), false);
  await ui.submit('approve');
  assert.equal(ui.decisions.length, 1);
  const [payload] = ui.decisions;
  assert.equal(payload.event_id, evidence.event_id);
  assert.equal(payload.decision, 'APPROVED');
  assert.equal(payload.reason, 'Checked shift record.');
  assert.match(payload.corrected_timestamp, /(?:Z|[+-]\d{2}:\d{2})$/);
  assert.equal(new Date(payload.corrected_timestamp).toISOString(), '2026-10-27T22:00:00.000Z');
  assert.equal(ui.calls.filter(([kind]) => kind === 'load').length, 2);
  assert.ok(!ui.text.includes('Casey Worker'));
});

test('rejection requires a reason and never submits a corrected timestamp', async () => {
  const ui = await review();
  await ui.open('reject');
  await ui.edit(/reason|justification/i, '   ');
  assert.equal(ui.button('reject', true).disabled, true);
  await ui.submit('reject');
  assert.equal(ui.decisions.length, 0);
  await ui.edit(/reason|justification/i, 'Unable to establish actual time.');
  await ui.submit('reject');
  assert.equal(ui.decisions.length, 1);
  assert.deepEqual(ui.decisions[0], {
    event_id: evidence.event_id, decision: 'REJECTED', reason: 'Unable to establish actual time.',
  });
  assert.equal(ui.calls.filter(([kind]) => kind === 'load').length, 2);
});

for (const flag of ['HASH_CHAIN_MISMATCH', 'SEQUENCE_GAP', 'UNEXPECTED_INITIAL_HASH', 'DEVICE_REVOKED_DRAIN', 'MONOTONIC_ROLLBACK']) {
  test(`${flag}: approval is disabled with an explanation and Reject stays available`, async () => {
    const reason = `Approval blocked: ${flag}`;
    const ui = await review({ rows: [{ ...evidence, integrity_flags: [flag], can_approve: false, approval_block_reason: reason }] });
    assert.equal(ui.button('approve').disabled, true);
    assert.ok(ui.text.includes(reason));
    assert.equal(Boolean(ui.button('reject').disabled), false);
    await ui.open('reject');
    await ui.edit(/reason|justification/i, 'Evidence is not trustworthy.');
    await ui.submit('reject');
    assert.equal(ui.decisions[0].decision, 'REJECTED');
  });
}

test('device revoked after queue entry disables approval while retaining rejection', async () => {
  const ui = await review({ rows: [{ ...evidence, can_approve: false, approval_block_reason: 'Device was revoked.' }] });
  assert.equal(ui.button('approve').disabled, true);
  assert.match(ui.text, /revoked/i);
  assert.equal(Boolean(ui.button('reject').disabled), false);
});

test('409 decision conflict explains the outcome and refreshes without retrying approval', async () => {
  let loads = 0;
  const ui = await review({
    load: async () => ++loads === 1 ? [evidence] : [],
    decide: async () => { throw Object.assign(new Error('Another manager already decided this evidence.'), {
      status: 409, payload: { code: 'REVIEW_ALREADY_DECIDED' },
    }); },
  });
  await ui.open('approve');
  await ui.edit(/reason|justification/i, 'Checked shift record.');
  await ui.edit(/corrected|actual time/i, '2026-10-28T08:00');
  await ui.submit('approve');
  assert.equal(ui.decisions.length, 1);
  assert.equal(loads, 2);
  assert.match(ui.text, /already decided|another manager|conflict/i);
  assert.ok(!ui.text.includes('Casey Worker'));
});

test('pending queue shows loading then rows, and load failure offers Retry', async () => {
  let resolve;
  let attempts = 0;
  const pending = new Promise((done) => { resolve = done; });
  const ui = await review({ load: () => {
    attempts++;
    return attempts === 1 ? pending : Promise.resolve([evidence]);
  } });
  assert.equal(ui.loading, true);
  resolve([evidence]);
  await ui.flush();
  assert.equal(ui.loading, false);
  assert.ok(ui.text.includes('Casey Worker'));
  let fail = true;
  const failed = await review({ load: async () => {
    if (fail) throw new Error('Evidence queue unavailable.');
    return [evidence];
  } });
  assert.match(failed.text, /unavailable|failed|could not/i);
  fail = false;
  await failed.button('retry').onClick();
  await failed.flush();
  assert.ok(failed.text.includes('Casey Worker'));
});


for (const action of ['approve', 'reject']) {
  test(`pharmacy selection clears old rows and the ${action} dialog before the new queue arrives`, async () => {
    let resolveNew;
    const newQueue = new Promise((resolve) => { resolveNew = resolve; });
    const replacement = { ...evidence, event_id: 'new-pharmacy-event', worker_name: 'New Pharmacy Worker' };
    const ui = await review({ page: true, load: (id) => id === 9 ? [evidence] : newQueue });
    await ui.open(action);
    await ui.edit(/reason|justification/i, 'Reason for the old pharmacy.');
    assert.equal(ui.dialogs.length, 1);
    await ui.selectPharmacy(10);
    assert.deepEqual(ui.calls.filter(([kind]) => kind === 'load'), [['load', 9], ['load', 10]]);
    assert.equal(ui.dialogs.length, 0, 'A decision dialog must not survive its pharmacy selection');
    assert.ok(!ui.text.includes('Casey Worker'), 'Old evidence must disappear while the new queue is loading');
    assert.equal(ui.loading, true);
    resolveNew([replacement]);
    await ui.flush();
    assert.ok(ui.text.includes('New Pharmacy Worker'));
    assert.ok(!ui.text.includes('Casey Worker'));
    assert.equal(ui.decisions.length, 0);
    await ui.open(action);
    assert.equal(ui.button(action, true).disabled, true, 'The old reason must not carry into a new decision');
  });
}

test('late pending response for the previous pharmacy cannot overwrite the selected pharmacy queue', async () => {
  let resolveOld;
  const oldQueue = new Promise((resolve) => { resolveOld = resolve; });
  const replacement = { ...evidence, event_id: 'new-pharmacy-event', worker_name: 'New Pharmacy Worker' };
  const ui = await review({ page: true, load: (id) => id === 9 ? oldQueue : [replacement] });
  assert.equal(ui.loading, true);
  await ui.selectPharmacy(10);
  assert.ok(ui.text.includes('New Pharmacy Worker'));
  resolveOld([evidence]);
  await ui.flush();
  assert.ok(ui.text.includes('New Pharmacy Worker'), 'The new queue must survive an older response');
  assert.ok(!ui.text.includes('Casey Worker'), 'A late response must not restore the previous pharmacy evidence');
  await ui.open('approve');
  await ui.edit(/reason|justification/i, 'Checked the selected pharmacy shift.');
  await ui.submit('approve');
  assert.equal(ui.decisions.length, 1);
  assert.equal(ui.decisions[0].event_id, replacement.event_id);
});
