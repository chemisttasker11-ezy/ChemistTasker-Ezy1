import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const locum = {
  provisional_id: 71, session_id: 81, worker_id: 17,
  worker_name: 'Verified Locum', worker_email: 'locum@example.test',
  started_at: '2026-10-29T08:00:00+10:00', ended_at: null,
  cover_type: 'UNBOOKED_LOCUM_COVER', source_membership: null,
  source_pharmacy: null, source_pharmacy_name: null,
  status: 'PENDING', decision_reason: null, created_at: '2026-10-29T08:00:00+10:00',
};
const provisional = {
  has_active_session: true, session_id: 81, pharmacy_id: 9,
  pharmacy_name: 'Cover Pharmacy', started_at: locum.started_at,
  is_provisional: true, is_on_break: false, last_event_type: 'CLOCK_IN',
  cover_type: 'UNBOOKED_LOCUM_COVER',
};

function nodes(node, type) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (node.props?.hidden) return [];
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (node.props?.hidden) return '';
  return [node.props?.title, node.props?.subtitle, node.props?.body, text(node.props?.children)]
    .filter(value => value != null).join(' ');
}
function load(relative, imports) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, console, require(name) {
    assert.ok(name in imports, `Unmocked mobile dependency: ${name}`); return imports[name];
  } });
  return exports;
}

async function attendanceScreen({ screen = 'reviews', rows = [locum], status = provisional } = {}) {
  const instances = new Map(), calls = [], fallbacks = [], routes = [];
  const manager = ['reviews', 'review-detail', 'review-decision', 'exception'].includes(screen);
  const detail = manager && screen !== 'reviews';
  let active, dirty = true, effects = [], tree;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const host = active, index = host.cursor++;
      if (!(index in host.slots)) host.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [host.slots[index], value => {
        const next = typeof value === 'function' ? value(host.slots[index]) : value;
        if (!Object.is(next, host.slots[index])) { host.slots[index] = next; dirty = true; }
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
      const index = active.cursor++;
      if (!active.slots[index] || !equal(active.slots[index].deps, deps)) {
        active.slots[index] = { deps }; effects.push(fn);
      }
    },
  };
  const utils = load('./utils.ts', {});
  const names = new Proxy({}, { get: (_, name) => String(name) });
  const { AttendanceParityScreen } = load('./attendance.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View', Alert: { alert() {} }, Linking: { openSettings() {} },
      StyleSheet: { create: styles => styles, absoluteFill: {}, absoluteFillObject: {} } },
    'react-native-paper': names,
    'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })] },
    'expo-router': { useRouter: () => ({ push: route => routes.push(route) }), useLocalSearchParams: () => detail ? { id: String(locum.provisional_id) } : {} },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ selectedPharmacyId: 9 }) },
    '@/context/AuthContext': { useAuth: () => ({ user: { role: manager ? 'OWNER' : 'PHARMACIST' } }) },
    '@chemisttasker/shared-core': {
      attendance: {
        async getWorkerCoverTerms() { return []; },
        async getManagerPending(id) { calls.push(['pending', id]); return structuredClone(rows); },
        async getManagerTimeline(id) { calls.push(['timeline', id]); return { timeline: [] }; },
        async getWorkerStatus() { calls.push(['status']); return structuredClone(status); },
      }, workforce: {}, canManageKioskDevices: () => false,
    },
    '../../roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog': { __esModule: true, default: 'ShiftEngagementTermsDialog' },
    './ParityUI': {
      ...Object.fromEntries(['ActionButtons', 'DataRow', 'EmptyState', 'Field', 'InfoNote', 'MetricGrid', 'ParityPage', 'PharmacyRequired', 'ScreenLink', 'Section'].map(name => [name, name])), palette: {},
    },
    './utils': { ...utils, replaceUnderscore(value) { fallbacks.push(value); return utils.replaceUnderscore(value); } },
  });
  function expand(node, path) {
    if (Array.isArray(node)) return node.map((child, i) => expand(child, `${path}/${i}`));
    if (node == null || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      if (!instances.has(path)) instances.set(path, { slots: [] });
      active = instances.get(path); active.cursor = 0;
      return expand(node.type(node.props), `${path}/render`);
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children, `${path}/children`) } };
  }
  for (let i = 0; i < 30; i++) {
    if (dirty) {
      dirty = false;
      tree = expand({ type: AttendanceParityScreen, props: { screen } }, 'root');
      const pending = effects; effects = []; pending.forEach(fn => fn());
    }
    await new Promise(setImmediate);
    if (!dirty && !effects.length) {
      assert.deepEqual(calls, manager ? [['pending', 9], ...(detail ? [['timeline', locum.session_id]] : [])] : [['status']], 'Render the public screen through its real data load');
      assert.equal(tree.props.loading, false);
      assert.equal(tree.props.error, '');
      return { tree, fallbacks, routes };
    }
  }
  assert.fail('Mobile attendance effects did not settle');
}

test('mobile pending list uses explicit Unbooked locum cover wording instead of the enum fallback', async () => {
  const ui = await attendanceScreen();
  const row = nodes(ui.tree, 'DataRow').find(node => node.props.title === locum.worker_name);
  assert.ok(row, 'The null-source locum must remain in the pending list');
  assert.match(row.props.subtitle, /Unbooked locum cover/i);
  assert.ok(!ui.fallbacks.includes(locum.cover_type), 'Unbooked locum cover needs a dedicated label, not replaceUnderscore');
});

test('mobile null-source pending locum keeps the review link without null or undefined copy', async () => {
  const ui = await attendanceScreen();
  const row = nodes(ui.tree, 'DataRow').find(node => node.props.title === locum.worker_name);
  assert.ok(row); assert.equal(row.props.status, 'PENDING');
  assert.doesNotMatch(text(ui.tree), /\b(?:undefined|null)\b/i);
  row.props.onPress(); assert.deepEqual(ui.routes, ['/attendance/reviews/71']);
});

for (const screen of ['home', 'clock']) {
  test(`mobile ${screen} unbooked provisional session explains manager approval before payable`, async () => {
    const ui = await attendanceScreen({ screen });
    const copy = nodes(ui.tree, 'InfoNote').map(node => text(node)).join(' ');
    assert.match(copy, /manager/i); assert.match(copy, /approve/i); assert.match(copy, /payable/i);
  });

  test(`mobile ${screen} non-provisional session has no provisional approval or payable note`, async () => {
    const ui = await attendanceScreen({ screen, status: { ...provisional, is_provisional: false, cover_type: null } });
    const copy = nodes(ui.tree, 'InfoNote').map(node => text(node)).join(' ');
    assert.doesNotMatch(copy, /provisional|manager.*approve|payable/i);
  });
}

test('mobile ordinary provisional cover keeps the existing manager-review note', async () => {
  const ui = await attendanceScreen({ screen: 'home', status: { ...provisional, cover_type: 'UNROSTERED_LOCAL' } });
  const note = nodes(ui.tree, 'InfoNote').find(node => /Provisional attendance/i.test(node.props.title));
  assert.ok(note);
  assert.match(text(note), /This session needs manager review before it is treated as approved roster history\./i);
  assert.doesNotMatch(text(note), /unbooked|no booking/i);
});

for (const coverType of ['UNROSTERED_LOCAL', 'CROSS_SITE_CHAIN', 'CROSS_SITE_ORG']) {
  test(`mobile pending list keeps existing ${coverType} readable`, async () => {
    const ui = await attendanceScreen({ rows: [{ ...locum, cover_type: coverType, source_membership: 4, source_pharmacy: 3, source_pharmacy_name: 'Home Pharmacy' }] });
    const row = nodes(ui.tree, 'DataRow').find(node => node.props.title === locum.worker_name);
    assert.ok(row); assert.ok(row.props.subtitle.toLowerCase().includes(coverType.replaceAll('_', ' ').toLowerCase()));
    assert.equal(row.props.status, 'PENDING');
  });
}


test('mobile pending unbooked row visibly explains no booking and approval before payable', async () => {
  const ui = await attendanceScreen();
  const section = nodes(ui.tree, 'Section').find(node => node.props.title === 'Pending provisional shifts');
  assert.ok(section, 'Pending list must load before checking its warning');
  const copy = text(section);
  assert.match(copy, /no booking/i);
  assert.match(copy, /approv(?:e|al)[\s\S]*before[\s\S]*payable/i);
});

for (const screen of ['review-detail', 'review-decision', 'exception']) {
  test(`mobile ${screen} shows the exact unbooked label and visible approval-before-payable hint`, async () => {
    const ui = await attendanceScreen({ screen });
    const cover = nodes(ui.tree, 'MetricGrid').flatMap(node => node.props.items)
      .find(item => item.label === 'Cover type');
    assert.ok(cover, 'Selected unbooked record must load its cover metric');
    const copy = text(ui.tree);
    assert.deepEqual({
      label: cover.value,
      noBookingHint: /no booking/i.test(copy),
      approvalBeforePayableHint: /approv(?:e|al)[\s\S]*before[\s\S]*payable/i.test(copy),
    }, {
      label: 'Unbooked locum cover', noBookingHint: true, approvalBeforePayableHint: true,
    });
    assert.doesNotMatch(copy, /UNBOOKED LOCUM COVER/);
    assert.doesNotMatch(copy, /\b(?:undefined|null)\b/i);
  });
}
