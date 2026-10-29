// Test-only React host shared by web/mobile attendance consent contracts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
// Captured from E17_ACCEPTED_LIST_ROW in the Postgres backend contract test.
// Refresh this fixture from that test's stdout whenever the backend contract changes.
export const acceptedCover = JSON.parse(readFileSync(new URL('./acceptedCoverBackendRow.json', import.meta.url), 'utf8'));
const terms = {
  version: 1, acceptance_required: true, engagement_kind: 'INDEPENDENT_CONTRACTOR',
  settlement_channel: 'INVOICE', payment_preference: 'ABN', accepted_at: null, blocked: false,
  provider_abn: '51824753556', provider_entity_name: 'Cover Provider',
  relationship_notice: 'The parties intend independent services.',
  occurrences: [{ slot_id: 31, date: '2026-10-29', start_time: '08:00:00', end_time: '10:00:00', agreed_rate: '73.50' }],
};
export const cover = {
  assignment_id: 41, provisional_id: 71, session_id: 81, pharmacy_id: 9,
  pharmacy_name: 'Cover Pharmacy', status: 'APPROVED', cover_type: 'UNBOOKED_LOCUM_COVER',
  ...(Object.hasOwn(acceptedCover, 'engagement_terms_accepted_at') ? { engagement_terms_accepted_at: null } : {}),
  engagement_terms_preview: terms,
};
const camelTerms = {
  version: 1, acceptanceRequired: true, engagementKind: 'INDEPENDENT_CONTRACTOR',
  settlementChannel: 'INVOICE', paymentPreference: 'ABN',
  occurrences: [{ slotId: 31, date: '2026-10-29', startTime: '08:00:00', endTime: '10:00:00', agreedRate: '73.50' }],
};

function hidden(node) {
  return node.props?.hidden || (node.type === 'Dialog' && (node.props.open === false || node.props.visible === false));
}
export function nodes(node, type) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (hidden(node)) return [];
  return [...(!type || node.type === type ? [node] : []), ...nodes(node.props?.children, type), ...nodes(node.props?.control, type), ...nodes(node.props?.action, type)];
}
export function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (hidden(node)) return '';
  return [node.props?.label, node.props?.title, node.props?.body, node.props?.subtitle, text(node.props?.children), text(node.props?.action)].filter(value => value != null).join(' ');
}

async function mount(platform, { rows = [cover], loadError = false, acceptError = false, pending = false, acceptPending = false, dialogOnly = false, pathname = '/dashboard/pharmacist/attendance', role = 'PHARMACIST' } = {}) {
  const mobile = platform === 'mobile';
  // Resolve from the app under test: clean CI installs each app separately.
  const ts = createRequire(new URL(mobile ? 'frontend_mobile/package.json' : 'frontend_web/package.json', root))('typescript');
  const instances = new Map(), calls = [], routes = [], dialogsUsed = [];
  let active, dirty = true, effects = [], tree, release, releaseAccept, loads = 0, attempts = 0;
  const deferred = new Promise(resolve => { release = resolve; });
  const accepting = new Promise(resolve => { releaseAccept = resolve; });
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
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
  const native = {
    View: 'View', ScrollView: 'ScrollView', Alert: { alert() {} }, Linking: { openSettings() {} },
    StyleSheet: { create: value => value, absoluteFill: {}, absoluteFillObject: {} },
  };
  const names = new Proxy({}, { get: (_, name) => String(name) });
  const Dialog = props => ({ type: 'Dialog', props });
  for (const name of ['Title', 'Actions', 'ScrollArea', 'Content']) Dialog[name] = `Dialog.${name}`;
  const paper = { ...Object.fromEntries(['Button', 'Chip', 'Icon', 'Text', 'Portal'].map(name => [name, name])), Dialog, Checkbox: { Item: 'Checkbox.Item' } };
  const api = {
    async getWorkerStatus() { calls.push(['status']); return { has_active_session: false, session_id: null, cover_type: null }; },
    async getWorkerCoverTerms() {
      calls.push(['covers']); loads++;
      if (pending && loads === 1) await deferred;
      if (loadError && loads === 1) throw new Error('Cover terms unavailable');
      return structuredClone(rows);
    },
    async acceptWorkerCoverTerms(id, payload) {
      calls.push(['accept', id, structuredClone(payload)]); attempts++;
      if (acceptPending && attempts === 1) await accepting;
      if (acceptError && attempts === 1) throw new Error('Could not accept cover terms');
      rows = rows.map(row => {
        if (row.assignment_id !== id) return row;
        const { engagement_terms_accepted_at: _oldTimestamp, ...originalRow } = row;
        return { ...acceptedCover, ...originalRow,
          engagement_terms_preview: { ...row.engagement_terms_preview, ...acceptedCover.engagement_terms_preview } };
      });
      return structuredClone(rows.find(row => row.assignment_id === id));
    },
    async getPinPharmacies() { return { pharmacies: [] }; },
  };
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    '@mui/material': names, 'lucide-react': names, 'react-native': native, 'react-native-paper': paper,
    moment: () => ({ format: () => '' }),
    'react-router-dom': {
      Link: 'Link', NavLink: 'NavLink',
      useLocation: () => ({ pathname }),
      useNavigate: () => route => {
        // Mirror route-relative navigation for the three actual attendance routes.
        const parent = pathname === '/dashboard/attendance' ? '/' : pathname.replace(/\/attendance$/, '/');
        routes.push(route.startsWith('/') ? route : new URL(route.replace(/^\.\.\//, ''), `https://example.test${parent}`).pathname + (route.includes('?') ? `?${route.split('?')[1]}` : ''));
      },
    },
    'expo-router': { useRouter: () => ({ push: route => routes.push(route) }), useLocalSearchParams: () => ({}) },
    'expo-camera': { CameraView: 'CameraView', useCameraPermissions: () => [{ granted: true }, async () => ({ granted: true })] },
    '@/context/WorkspaceContext': { useWorkspace: () => ({ selectedPharmacyId: null }) },
    [mobile ? '@/context/AuthContext' : '../../contexts/AuthContext']: { useAuth: () => ({ user: { id: 17, role } }) },
    '@chemisttasker/shared-core': {
      attendance: api, workforce: {}, canManageKioskDevices: () => false,
      rosterV2: { async getWorkerRoster() { return { shifts: [] }; } },
      formatAttendanceMinutes: minutes => `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
    },
    '../../components/ui/PageHeader': 'PageHeader', '../../components/ui/IconTile': 'IconTile',
    '../../components/dashboard/DashboardContentState': 'DashboardContentState',
    '../../components/ui/Hint': { Hint: 'Hint' }, '../../components/ui/Pill': { Pill: 'Pill' },
    '../../utils/labels': { humanizeEnum: value => value },
    './ParityUI': { ...Object.fromEntries(['ActionButtons', 'DataRow', 'EmptyState', 'Field', 'InfoNote', 'MetricGrid', 'ParityPage', 'PharmacyRequired', 'ScreenLink', 'Section'].map(name => [name, name])), palette: {} },
  };
  function load(path) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
      exports, console, setInterval: () => 1, clearInterval() {},
      require(name) {
        if (name.endsWith('/ShiftEngagementTermsDialog')) { dialogsUsed.push(name); return { default: TermsDialog, __esModule: true }; }
        assert.ok(name in imports, `Unmocked ${platform} dependency: ${name}`); return imports[name];
      },
    });
    return exports;
  }
  imports['./utils'] = load('frontend_mobile/features/parity/utils.ts');
  const dialogPath = mobile
    ? 'frontend_mobile/roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog.tsx'
    : 'frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/components/ShiftEngagementTermsDialog.tsx';
  const TermsDialog = load(dialogPath).default;
  let Component, props;
  if (dialogOnly) {
    Component = TermsDialog;
    props = { open: true, visible: true, offers: [{ id: 21, engagementTermsPreview: camelTerms }], onClose() {}, onDismiss() {}, onConfirm(payload) { calls.push(['booking-confirm', structuredClone(payload)]); } };
  } else {
    const module = load(mobile ? 'frontend_mobile/features/parity/attendance.tsx' : 'frontend_web/src/pages/attendance/WorkerAttendancePage.tsx');
    Component = mobile ? module.AttendanceParityScreen : module.default;
    props = mobile ? { screen: 'home' } : {};
  }
  function expand(node, path) {
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}/${index}`));
    if (node == null || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      if (!instances.has(path)) instances.set(path, { slots: [] });
      active = instances.get(path); active.cursor = 0;
      return expand(node.type(node.props), `${path}/render`);
    }
    return { ...node, props: { ...node.props, children: expand(node.props?.children, `${path}/children`), control: expand(node.props?.control, `${path}/control`), action: expand(node.props?.action, `${path}/action`) } };
  }
  async function flush() {
    for (let index = 0; index < 35; index++) {
      if (dirty) {
        dirty = false; tree = expand({ type: Component, props }, 'root');
        const pendingEffects = effects; effects = []; pendingEffects.forEach(fn => fn());
      }
      await new Promise(setImmediate);
      if (!dirty && !effects.length) return;
    }
    assert.fail(`${platform} effects did not settle`);
  }
  function button(pattern, scope = tree) {
    const control = nodes(scope, 'Button').find(node => pattern.test(text(node).trim()));
    assert.ok(control, `Missing ${platform} action ${pattern}: ${text(scope)}`); return control;
  }
  async function click(control) {
    assert.ok(!control.props.disabled, `${text(control)} is disabled`);
    const handler = control.props.onClick || control.props.onPress;
    assert.equal(typeof handler, 'function'); await handler(); await flush();
  }
  const ui = {
    calls, routes, dialogsUsed, button, click, flush,
    get tree() { return tree; },
    get loads() { return loads; },
    async resolve() { release(); await flush(); },
    resolveAccept: () => releaseAccept(),
    async open() { await click(button(/^Accept (?:engagement )?terms$/i)); },
    dialog() { const dialogs = nodes(tree, 'Dialog'); assert.equal(dialogs.length, 1, 'Reuse the existing engagement terms dialog'); return dialogs[0]; },
    confirm() { return button(/^Accept & confirm(?: shift)?$/i, ui.dialog()); },
    async consent(index) {
      const checkboxes = mobile ? nodes(ui.dialog(), 'Checkbox.Item') : nodes(ui.dialog(), 'Checkbox');
      assert.equal(checkboxes.length, 2, 'Keep independent agreement and contractor consents');
      if (mobile) checkboxes[index].props.onPress(); else checkboxes[index].props.onChange({}, true);
      await flush();
    },
  };
  await flush(); return ui;
}

export function coverTermsTests(platform) {
  test(`${platform} FE-B1 accepted backend LIST row shows Terms accepted without Accept terms`, async () => {
    const ui = await mount(platform, { rows: [acceptedCover] });
    assert.equal(ui.loads, 1);
    assert.match(text(ui.tree), /terms accepted/i);
    assert.equal(nodes(ui.tree, 'Button').filter(node => /^Accept (?:engagement )?terms$/i.test(text(node).trim())).length, 0);
  });
  for (const [label, channel, kind, preference] of [
    ['local staff', 'TIMESHEET_ONLY', 'STAFF_EMPLOYMENT', 'TFN'],
    ['TFN cover', 'TIMESHEET_ONLY', 'SHIFT_EMPLOYMENT', 'TFN'],
    ['payroll staff', 'PAYROLL', 'STAFF_EMPLOYMENT', 'TFN'],
    ['payroll TFN cover', 'PAYROLL', 'SHIFT_EMPLOYMENT', 'TFN'],
  ]) {
    test(`${platform} FE-B2 ${label} blocked invoice preview never offers payment profile repair`, async () => {
      const ui = await mount(platform, { rows: [{ ...cover, engagement_terms_preview: {
        settlement_channel: channel, engagement_kind: kind, payment_preference: preference,
        blocked: true, payment_profile_incomplete: false, accepted_at: null,
        notice: 'This cover is settled through timesheets or payroll, not by invoice; there are no invoice terms to accept.',
        occurrences: terms.occurrences,
      } }] });
      assert.equal(ui.loads, 1);
      assert.doesNotMatch(text(ui.tree), /payment details incomplete|complete payment profile/i);
      const repair = nodes(ui.tree).filter(node => /profile/i.test(text(node)) &&
        (node.props?.href || node.props?.to || node.props?.onClick || node.props?.onPress));
      assert.equal(repair.length, 0, 'Staff/TFN rows must not send workers to repair valid payment profiles');
      assert.equal(nodes(ui.tree, 'Button').filter(node => /^Accept (?:engagement )?terms$/i.test(text(node).trim())).length, 0);
    });
  }
  if (platform === 'web') {
    for (const [pathname, role, expected] of [
      ['/dashboard/attendance', 'PHARMACIST', '/dashboard/pharmacist/onboarding?step=payment'],
      ['/dashboard/attendance', 'OTHER_STAFF', '/dashboard/otherstaff/onboarding?step=payment'],
      ['/dashboard/pharmacist/attendance', 'PHARMACIST', '/dashboard/pharmacist/onboarding?step=payment'],
      ['/dashboard/otherstaff/attendance', 'OTHER_STAFF', '/dashboard/otherstaff/onboarding?step=payment'],
    ]) {
      test(`web FE-minor profile action resolves from ${pathname} for ${role}`, async () => {
        const ui = await mount(platform, { pathname, role, rows: [{ ...cover, engagement_terms_preview: {
          settlement_channel: 'TIMESHEET_ONLY', blocked: true, payment_profile_incomplete: true,
          notice: 'Your payment details are incomplete; complete your ABN details to accept invoice terms for this cover.',
          accepted_at: null, occurrences: terms.occurrences,
        } }] });
        await ui.click(ui.button(/complete payment profile/i));
        assert.deepEqual(ui.routes, [expected], 'Profile completion must resolve to an existing role route');
      });
    }
  }
  if (platform === 'web') {
    for (const role of ['OWNER', 'ORGANIZATION']) {
      test(`web F3 incomplete ABN cover preserves notice without a profile action for ${role}`, async () => {
        const notice = 'Your payment details are incomplete; complete your ABN details to accept invoice terms for this cover.';
        const ui = await mount(platform, { pathname: '/dashboard/attendance', role, rows: [{ ...cover, engagement_terms_preview: {
          ...terms, settlement_channel: 'TIMESHEET_ONLY', blocked: true, payment_profile_incomplete: true, notice,
        } }] });
        assert.equal(ui.loads, 1);
        assert.ok(text(ui.tree).includes(notice), 'Keep the incomplete-payment notice visible for every role');
        const profileActions = nodes(ui.tree).filter(node => /profile/i.test(text(node)) &&
          (node.props?.href || node.props?.to || node.props?.onClick || node.props?.onPress));
        assert.equal(profileActions.length, 0, 'Unsupported roles must not get a profile action that navigates to an unavailable payment page');
        assert.deepEqual(ui.routes, []);
        assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 0);
      });
    }
  }
  for (const tier of ['FAVOURITE_COVER', 'UNBOOKED_LOCUM_COVER']) {
    test(`${platform} approved ${tier} discovers closed cover and opens the existing terms dialog`, async () => {
      const ui = await mount(platform, { rows: [{ ...cover, cover_type: tier }] });
      assert.equal(ui.loads, 1, 'Load approved cover independently of the inactive-session status');
      await ui.open();
      assert.equal(ui.dialogsUsed.length, 1, 'Import the existing ShiftEngagementTermsDialog');
      assert.match(text(ui.dialog()), /73\.50/);
      assert.match(text(ui.dialog()), /2026-10-29/);
      assert.match(text(ui.dialog()), /08:00/);
      assert.match(text(ui.dialog()), /10:00/);
      assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 0, 'Opening does not accept');
    });
  }
  for (const [state, row] of [
    ['pending', { ...cover, status: 'PENDING' }],
    ['rejected', { ...cover, status: 'REJECTED' }],
    ['TFN', { ...cover, engagement_terms_preview: { ...terms, settlement_channel: 'PAYROLL', payment_preference: 'TFN' } }],
    ['staff timesheet', { ...cover, engagement_terms_preview: { ...terms, settlement_channel: 'TIMESHEET_ONLY', engagement_kind: 'STAFF_EMPLOYMENT' } }],
    ['accepted', { ...cover, engagement_terms_accepted_at: '2026-10-29T01:00:00Z' }],
  ]) {
    test(`${platform} ${state} cover has no accept-terms action`, async () => {
      const ui = await mount(platform, { rows: [row] });
      assert.equal(ui.loads, 1, 'Check the loaded cover, not a screen that ignored it');
      assert.equal(nodes(ui.tree, 'Button').filter(node => /^Accept (?:engagement )?terms$/i.test(text(node).trim())).length, 0);
      assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 0);
    });
  }
  test(`${platform} both consents are required and success refreshes the cover list`, async () => {
    const ui = await mount(platform); await ui.open();
    assert.ok(ui.confirm().props.disabled);
    await ui.consent(0); assert.ok(ui.confirm().props.disabled);
    await ui.consent(1); assert.ok(!ui.confirm().props.disabled);
    await ui.click(ui.confirm());
    const accepts = ui.calls.filter(call => call[0] === 'accept');
    assert.equal(accepts.length, 1);
    assert.deepEqual(accepts[0], ['accept', 41, { engagementTermsAccepted: true, independentContractorStatusConfirmed: true }]);
    assert.ok(ui.loads >= 2, 'Refresh authoritative server state after acceptance');
    assert.equal(nodes(ui.tree, 'Button').filter(node => /^Accept (?:engagement )?terms$/i.test(text(node).trim())).length, 0);
  });
  test(`${platform} loading cover does not expose premature acceptance`, async () => {
    const ui = await mount(platform, { pending: true });
    assert.equal(ui.loads, 1);
    assert.equal(nodes(ui.tree, 'Button').filter(node => /^Accept (?:engagement )?terms$/i.test(text(node).trim())).length, 0);
    await ui.resolve(); await ui.open(); assert.match(text(ui.dialog()), /73\.50/);
  });
  test(`${platform} acceptance in flight disables confirmation until the server responds`, async () => {
    const ui = await mount(platform, { acceptPending: true }); await ui.open();
    await ui.consent(0); await ui.consent(1);
    const submission = ui.click(ui.confirm());
    try {
      await ui.flush();
      const confirm = nodes(ui.dialog(), 'Button').find(node => /accept.*confirm|confirming/i.test(text(node)));
      assert.ok(confirm?.props.disabled, 'Disable repeated acceptance while saving');
      assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 1);
    } finally { ui.resolveAccept(); await submission; }
  });
  if (platform === 'mobile') {
    test('mobile F4 two confirm presses in the same render accept cover only once', async () => {
      const ui = await mount(platform, { acceptPending: true }); await ui.open();
      await ui.consent(0); await ui.consent(1);
      const confirm = ui.confirm();
      assert.ok(!confirm.props.disabled);
      // Native presses can share this handler before loading reaches the button.
      const first = confirm.props.onPress();
      const second = confirm.props.onPress();
      try {
        assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 1, 'Acquire the in-flight guard synchronously, before the next render');
      } finally {
        ui.resolveAccept();
        await Promise.all([first, second]);
        await ui.flush();
      }
    });
  }
  test(`${platform} discovery error remains visible and can retry`, async () => {
    const ui = await mount(platform, { loadError: true });
    assert.equal(ui.loads, 1);
    assert.match(text(ui.tree), /unavailable|unable|failed|could not/i);
    await ui.click(ui.button(/retry|try again|refresh/i));
    assert.ok(ui.loads >= 2); await ui.open();
  });
  test(`${platform} failed acceptance keeps an error and permits retry`, async () => {
    const ui = await mount(platform, { acceptError: true }); await ui.open();
    await ui.consent(0); await ui.consent(1); await ui.click(ui.confirm());
    assert.match(text(ui.tree), /could not|unable|failed|error/i);
    assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 1, 'The first acceptance failed');
    assert.ok(!ui.confirm().props.disabled); await ui.click(ui.confirm());
    assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 2);
    assert.ok(ui.loads >= 2);
  });
  test(`${platform} incomplete ABN cover shows notice and profile completion instead of accepting`, async () => {
    const ui = await mount(platform, { rows: [{ ...cover, engagement_terms_preview: {
      ...terms, settlement_channel: 'TIMESHEET_ONLY', blocked: true, payment_profile_incomplete: true,
      notice: 'Worker payment details are incomplete; complete your payment profile.',
    } }] });
    assert.equal(ui.loads, 1);
    assert.match(text(ui.tree), /incomplete|payment.*details|payment.*profile/i);
    assert.equal(ui.calls.filter(call => call[0] === 'accept').length, 0);
    const profile = nodes(ui.tree).find(node => /complete|open/i.test(text(node)) && /profile/i.test(text(node)) &&
      (node.props?.href || node.props?.to || node.props?.onClick || node.props?.onPress));
    assert.ok(profile, 'Provide a usable private profile completion action');
    const accept = nodes(ui.tree, 'Button').find(node => /^Accept (?:engagement )?terms$/i.test(text(node).trim()));
    assert.ok(!accept || accept.props.disabled, 'Incomplete profile cannot be accepted');
  });
  test(`${platform} CONTROL existing attendance status still loads with no active session`, async () => {
    const ui = await mount(platform, { rows: [] });
    assert.equal(ui.calls.filter(call => call[0] === 'status').length, 1);
    assert.equal(nodes(ui.tree, 'Dialog').length, 0);
  });
  test(`${platform} CONTROL existing booking dialog still requires two consents and returns its payload`, async () => {
    const ui = await mount(platform, { dialogOnly: true });
    assert.ok(ui.confirm().props.disabled);
    await ui.consent(0); assert.ok(ui.confirm().props.disabled);
    await ui.consent(1); await ui.click(ui.confirm());
    assert.deepEqual(ui.calls, [['booking-confirm', { engagementTermsAccepted: true, independentContractorStatusConfirmed: true }]]);
  });
}
