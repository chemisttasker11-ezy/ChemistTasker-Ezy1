const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const directory = path.resolve(__dirname, '../roles/shared/invoices');
// Load the shared owner and its real imports, without extracting expressions
// from component source or copying the production default into this fixture.
const sharedModules = new Map();
function loadSharedModule(filename) {
  if (sharedModules.has(filename)) return sharedModules.get(filename);
  const exports = {};
  sharedModules.set(filename, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  });
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(name.startsWith('.'), `Unexpected shared module dependency: ${name}`);
      return loadSharedModule(path.resolve(path.dirname(filename), `${name}.ts`));
    },
  }, { filename });
  return exports;
}
const { SUPER_GUARANTEE_PERCENT } = loadSharedModule(path.resolve(__dirname, '../../shared-core/src/domains/shifts/postingDraft.ts'));
const accepted = {
  id: '11-31-2026-10-29', assignmentId: 41, shiftId: 11, shiftSlotId: 31,
  date: '2026-10-29', start_time: '09:00:00', end_time: '10:00:00',
  description: 'Accepted work', category_code: 'ProfessionalServices', unit: 'Hours',
  quantity: 1, unit_price: 70, discount: 0, total: 70,
  gst_applicable: false, super_applicable: false, locked: true,
};
const profile = {
  first_name: 'Sarah', last_name: 'Worker', abn: '51824753556', gst_registered: true,
  bank_account_name: 'Sarah Worker', bsb: '123456', account_number: '12345678',
  super_rate_snapshot: '12.00',
};
const noContribution = {
  line_items: [{ ...accepted, quantity: '1.00', unit_price: '70.00', discount: '0.00', total: '70.00', origin: 'assignment' }],
  subtotal: '70.00', gst_amount: '0.00', super_amount: '0.00', total: '70.00',
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function children(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node;
  return [node.props?.anchor, ...(node.type === 'Menu' && !node.props.visible ? [] : [node.props?.children])];
}
function nodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  return [...(!Array.isArray(node) && (!type || node.type === type) ? [node] : []), ...children(node).flatMap(child => nodes(child, type))];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return [node.props?.label, node.props?.title, ...children(node).map(text)].filter(value => value != null).join(' ');
}

// Execute the real screen and its adjacent helper. Native controls are a small
// inert host; API responses are server contract fixtures, never a JS tax calculator.
async function mount({ onboarding, source, preview, sharedSuperRate = SUPER_GUARANTEE_PERCENT } = {}) {
  const slots = [], calls = { preview: [], saved: [], routes: [] }, timers = new Map();
  let cursor = 0, dirty = true, tree, effects = [], timerId = 0;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => {
        const value = typeof next === 'function' ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) { slots[index] = value; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { deps, value: fn() };
      return slots[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !equal(slots[index].deps, deps)) {
        const cleanup = slots[index]?.cleanup;
        slots[index] = { deps };
        effects.push(() => { cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const user = { id: 17, role: 'PHARMACIST', email: 'sarah@example.invalid' };
  const shifts = [11, 12].map(id => ({ id, pharmacy_detail: { id: 9, name: `Pharmacy ${id}` }, created_by_email: 'owner@example.invalid' }));
  const Card = Object.assign('Card', { Content: 'Card.Content' });
  const Menu = Object.assign('Menu', { Item: 'Menu.Item' });
  const native = { View: 'View', ScrollView: 'ScrollView', Alert: { alert() {} }, StyleSheet: { create: value => value } };
  const api = {
    SUPER_GUARANTEE_PERCENT: sharedSuperRate,
    getOnboarding: async () => onboarding ? onboarding() : profile,
    getMyHistoryShifts: async () => shifts,
    previewInvoice: async id => source ? source(id) : [{ ...accepted, shiftId: id }],
    previewGeneratedInvoice: async input => {
      calls.preview.push(structuredClone(input));
      return preview ? preview(input) : structuredClone(noContribution);
    },
    generateInvoice: async body => { calls.saved.push(Object.fromEntries(body.entries())); return { id: 81 }; },
  };
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type: String(type), props }), jsxs: (type, props) => ({ type: String(type), props }) },
    'react-native': native,
    'react-native-paper': { ...Object.fromEntries(['ActivityIndicator', 'Button', 'Chip', 'HelperText', 'IconButton', 'SegmentedButtons', 'Snackbar', 'Switch', 'Text', 'TextInput'].map(name => [name, name])), Card, Menu },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useSegments: () => ['pharmacist'], useRouter: () => ({ back() {}, replace: value => calls.routes.push(value) }) },
    '@/context/AuthContext': { useAuth: () => ({ user }) },
    '@chemisttasker/shared-core': api,
  };
  function load(filename) {
    const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, filename), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const exports = {};
    vm.runInNewContext(outputText, {
      exports, console, FormData, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
      require(name) {
        if (name === './invoiceGeneration') return load('invoiceGeneration.ts');
        assert.ok(name in imports, `Unmocked screen dependency: ${name}`);
        return imports[name];
      },
    });
    return exports;
  }
  const Component = load('InvoiceGenerate.tsx').default;
  async function flush() {
    for (let count = 0; count < 40; count++) {
      if (dirty) {
        dirty = false; cursor = 0; tree = Component({ basePath: '/pharmacist/invoice' });
        const pending = effects; effects = []; pending.forEach(fn => fn());
      }
      await new Promise(setImmediate);
      if (dirty || effects.length) continue;
      const pendingTimers = [...timers.values()]; timers.clear(); pendingTimers.forEach(fn => fn());
      await new Promise(setImmediate);
      if (!dirty && !effects.length && !timers.size) return;
    }
    assert.fail('Invoice screen did not settle.');
  }
  const ui = {
    calls, flush, get tree() { return tree; },
    all: type => nodes(tree, type),
    button: title => { const button = nodes(tree, 'Button').find(node => text(node).trim() === title); assert.ok(button, `Missing ${title}`); return button; },
    async change(node, value) { (node.props.onChangeText || node.props.onValueChange)(value); await flush(); },
    async press(node) { assert.ok(!node.props.disabled, `${text(node)} disabled`); await node.props.onPress(); await flush(); },
    async selectShift(id = 11) { await ui.press(nodes(tree, 'Chip').find(node => new RegExp(`#\\s*${id}\\b`).test(text(node)))); },
    helper: () => load('invoiceGeneration.ts'),
  };
  await flush(); return ui;
}

test('accepted source rows stay locked and their false eligibility reaches the server preview unchanged', async () => {
  const ui = await mount();
  await ui.selectShift();
  const sourceInputs = ui.all('TextInput').filter(node => ['YYYY-MM-DD', 'HH:MM'].includes(node.props.placeholder));
  assert.equal(sourceInputs.length, 3);
  assert.ok(sourceInputs.every(node => node.props.disabled), 'Accepted date and times must be read-only.');
  assert.ok(ui.calls.preview.length, 'Use the generation-compatible server preview.');
  assert.deepEqual(ui.calls.preview.at(-1).line_items, []);
  assert.match(text(ui.tree), /\$70\.00/);
  assert.doesNotMatch(text(ui.tree), /\$86\.80/);
});

test('a generated contribution is displayed separately and never submitted as a manual row', async () => {
  const preview = {
    line_items: [
      { ...noContribution.line_items[0], super_applicable: true },
      { origin: 'generated_super', description: 'Superannuation', category_code: 'Superannuation', unit: 'Lump Sum', quantity: '1.00', unit_price: '8.40', discount: '0.00', total: '8.40', gst_applicable: false, super_applicable: false, locked: true },
    ], subtotal: '70.00', gst_amount: '0.00', super_amount: '8.40', total: '70.00',
  };
  const ui = await mount({ source: () => [{ ...accepted, super_applicable: true }], preview: () => preview });
  await ui.selectShift();
  assert.match(text(ui.tree), /Worker payable[^$]*\$70\.00/);
  assert.match(text(ui.tree), /Super contribution[^$]*\$8\.40/);
  await ui.press(ui.button('Generate invoice'));
  assert.equal(ui.calls.saved.length, 1);
  assert.deepEqual(JSON.parse(ui.calls.saved[0].line_items), [], 'Only deliberate extras belong in custom line_items.');
});

for (const { label, onboardingRate, sharedSuperRate = SUPER_GUARANTEE_PERCENT, expected } of [
  { label: 'missing onboarding rate uses the shared SG default', expected: String(SUPER_GUARANTEE_PERCENT) },
  // This distinct imported value catches a hardcoded screen default. It is a
  // test fixture, not an alternative financial policy.
  { label: 'missing onboarding rate follows the imported default', sharedSuperRate: 19.75, expected: '19.75' },
  { label: 'agreed onboarding rate preserves decimal text', onboardingRate: '11.50', expected: '11.50' },
  { label: 'explicit zero onboarding rate stays zero', onboardingRate: '0.00', expected: '0.00' },
  { label: 'numeric zero onboarding rate stays zero', onboardingRate: 0, expected: '0' },
]) test(`super rate screen, preview and save: ${label}`, async () => {
  const onboardingProfile = { ...profile };
  delete onboardingProfile.super_rate_snapshot;
  if (onboardingRate !== undefined) onboardingProfile.super_rate_snapshot = onboardingRate;
  const ui = await mount({ onboarding: () => onboardingProfile, sharedSuperRate });
  assert.equal(ui.all('TextInput').find(node => node.props.label === 'Super rate snapshot (%)').props.value, expected);
  await ui.selectShift();
  assert.equal(ui.calls.preview.at(-1).super_rate_snapshot, expected);
  await ui.press(ui.button('Generate invoice'));
  assert.equal(ui.calls.saved.length, 1);
  assert.equal(ui.calls.saved[0].super_rate_snapshot, expected);
});

test('a late onboarding response preserves an explicit false GST choice and an explicit super rate', async () => {
  const late = deferred();
  const ui = await mount({ onboarding: () => late.promise });
  await ui.change(ui.all('Switch')[0], false);
  await ui.change(ui.all('TextInput').find(node => node.props.label === 'Super rate snapshot (%)'), '0.00');
  late.resolve(profile); await ui.flush();
  assert.equal(ui.all('Switch')[0].props.value, false);
  assert.equal(ui.all('TextInput').find(node => node.props.label === 'Super rate snapshot (%)').props.value, '0.00');
  await ui.selectShift();
  assert.equal(ui.calls.preview.at(-1).gst_registered, false);
  assert.equal(ui.calls.preview.at(-1).super_rate_snapshot, '0.00');
  await ui.press(ui.button('Generate invoice'));
  assert.equal(ui.calls.saved.length, 1);
  assert.equal(ui.calls.saved[0].gst_registered, 'false');
  assert.equal(ui.calls.saved[0].super_rate_snapshot, '0.00');
});

test('pending and rejected previews cannot be saved or display the previous total', async () => {
  const pending = deferred();
  let fail = false;
  const ui = await mount({ preview: () => fail ? pending.promise : noContribution });
  await ui.selectShift();
  fail = true;
  await ui.change(ui.all('TextInput').find(node => node.props.label === 'Super rate snapshot (%)'), '11.00');
  assert.equal(ui.button('Generate invoice').props.disabled, true);
  assert.doesNotMatch(text(ui.tree), /Worker payable[^$]*\$70\.00/);
  await ui.button('Generate invoice').props.onPress();
  assert.equal(ui.calls.saved.length, 0, 'The handler also rejects a stale preview.');
  pending.reject(new Error('Invalid super rate')); await ui.flush();
  assert.match(text(ui.tree), /Invalid super rate/);
  assert.equal(ui.button('Generate invoice').props.disabled, true);
});

test('an old source response cannot replace the newly selected shift', async () => {
  const firstSource = deferred();
  const second = { ...noContribution, subtotal: '71.00', total: '71.00', line_items: [{ ...noContribution.line_items[0], shiftId: 12, unit_price: '71.00', total: '71.00' }] };
  const ui = await mount({
    source: id => id === 11 ? firstSource.promise : [{ ...accepted, shiftId: 12, unit_price: 71, total: 71 }],
    preview: () => second,
  });
  await ui.selectShift(11); await ui.selectShift(12);
  firstSource.resolve([{ ...accepted }]); await ui.flush();
  assert.match(text(ui.tree), /Worker payable[^$]*\$71\.00/);
  assert.doesNotMatch(text(ui.tree), /Worker payable[^$]*\$70\.00/);
  await ui.press(ui.button('Generate invoice'));
  assert.equal(ui.calls.saved[0].shift_ids, '[12]');
});

test('a late monetary response cannot overwrite the explicitly selected invoice GST treatment', async () => {
  const stale = deferred();
  const ui = await mount({ preview: input => input.gst_registered ? stale.promise : noContribution });
  await ui.selectShift();
  assert.equal(ui.calls.preview.length, 1, 'First preview is in flight.');
  await ui.change(ui.all('Switch')[0], false);
  stale.resolve({ ...noContribution, gst_amount: '7.00', total: '77.00' }); await ui.flush();
  assert.match(text(ui.tree), /Worker payable[^$]*\$70\.00/);
  assert.doesNotMatch(text(ui.tree), /\$77\.00/);
  await ui.press(ui.button('Generate invoice'));
  assert.equal(ui.calls.saved[0].gst_registered, 'false');
});

test('the executable mapping preserves accepted evidence and only deliberate custom rows form the payload', async () => {
  const ui = await mount();
  const helper = ui.helper();
  const [source] = helper.acceptedGenerationLines([accepted]);
  assert.equal(source.assignmentId, 41);
  assert.equal(source.shiftSlotId, 31);
  assert.equal(source.gst_applicable, false);
  assert.equal(source.super_applicable, false);
  assert.equal(source.total, '70');
  assert.equal(helper.editGenerationLine(source, 'unit_price', '999'), source);
  const manual = {
    ...helper.customGenerationLine('manual', 'internal'), description: 'Reviewed expense',
    quantity: '1.50', unit_price: '3.03', gst_applicable: false, super_applicable: false,
  };
  const generated = { ...manual, id: 'generated', origin: 'generated_super', category_code: 'Superannuation', locked: true };
  const request = helper.generationInput({ mode: 'internal', pharmacy: 9, shiftId: 11, lines: [source, manual, generated], gstRegistered: true, superRate: '12.00' });
  assert.deepEqual(JSON.parse(JSON.stringify(request)), {
    external: false, pharmacy: 9, shift_ids: [11], gst_registered: true, super_rate_snapshot: '12.00',
    line_items: [{ description: 'Reviewed expense', category_code: 'Miscellaneous', unit: 'Lump Sum', quantity: '1.50', unit_price: '3.03', discount: '0.00', gst_applicable: false, super_applicable: false }],
  });
});

test('a deliberate manual super row stays editable and is submitted once while payable excludes it', async () => {
  const ui = await mount({ preview: input => {
    if (!input.line_items.length) return noContribution;
    const line = input.line_items[0];
    if (!line.description || line.unit_price !== '9.09' || line.discount !== '50') throw new Error('Complete the manual item');
    return {
      line_items: [noContribution.line_items[0], { ...line, origin: 'custom', custom_index: 0, total: '4.55' }],
      subtotal: '70.00', gst_amount: '0.00', super_amount: '4.55', total: '70.00',
    };
  } });
  await ui.selectShift();
  await ui.press(ui.all('IconButton').find(node => node.props.icon === 'plus'));
  await ui.press(ui.button('Miscellaneous'));
  assert.ok(!ui.all('Menu.Item').some(node => node.props.title === 'Professional services'), 'Internal extras cannot masquerade as accepted work.');
  await ui.press(ui.all('Menu.Item').find(node => node.props.title === 'Superannuation'));
  await ui.change(ui.all('TextInput').find(node => node.props.accessibilityLabel === 'Line description' && !node.props.disabled), 'Agreed manual super');
  await ui.change(ui.all('TextInput').find(node => node.props.accessibilityLabel === 'Line unit price' && !node.props.disabled), '9.09');
  await ui.change(ui.all('TextInput').find(node => node.props.accessibilityLabel === 'Line discount' && !node.props.disabled), '50');
  assert.match(text(ui.tree), /Super contribution[^$]*\$4\.55/);
  assert.match(text(ui.tree), /Worker payable[^$]*\$70\.00/);
  assert.equal(ui.all('IconButton').filter(node => node.props.icon === 'delete' && !node.props.disabled).length, 1);
  await ui.press(ui.button('Generate invoice'));
  const custom = JSON.parse(ui.calls.saved[0].line_items);
  assert.equal(custom.length, 1);
  assert.equal(custom[0].category_code, 'Superannuation');
  assert.equal(custom[0].unit_price, '9.09');
  assert.equal(custom[0].discount, '50');
  assert.equal(custom[0].gst_applicable, false);
  assert.equal(custom[0].super_applicable, false);
  assert.ok(!('total' in custom[0]), 'The server calculates the manual amount.');
});

test('external invoice editing and save preserve legacy-rounded amounts supplied by the server', async () => {
  const ui = await mount({ preview: input => {
    const line = input.line_items[0];
    if (!line?.description || line.quantity !== '1.50' || line.unit_price !== '3.03') throw new Error('Complete the external item');
    return {
      line_items: [{ ...line, origin: 'custom', custom_index: 0, total: '4.54' }],
      subtotal: '4.54', gst_amount: '0.00', super_amount: '0.00', total: '4.54',
    };
  } });
  await ui.change(ui.all('SegmentedButtons')[0], 'external');
  await ui.change(ui.all('TextInput').find(node => node.props.label === 'Bill to name'), 'External pharmacy');
  await ui.change(ui.all('TextInput').find(node => node.props.label === 'Bill to email'), 'accounts@example.invalid');
  await ui.change(ui.all('Switch')[0], false);
  await ui.change(ui.all('TextInput').find(node => node.props.label === 'Super rate snapshot (%)'), '0.00');
  await ui.change(ui.all('TextInput').find(node => node.props.accessibilityLabel === 'Line description'), 'Reviewed external services');
  await ui.change(ui.all('TextInput').find(node => node.props.placeholder === 'YYYY-MM-DD'), '2026-10-29');
  await ui.change(ui.all('TextInput').filter(node => node.props.placeholder === 'HH:MM')[0], '09:00');
  await ui.change(ui.all('TextInput').filter(node => node.props.placeholder === 'HH:MM')[1], '10:30');
  await ui.change(ui.all('TextInput').find(node => node.props.accessibilityLabel === 'Line unit price'), '3.03');
  assert.match(text(ui.tree), /Worker payable[^$]*\$4\.54/);
  assert.doesNotMatch(text(ui.tree), /\$4\.55/);
  await ui.press(ui.button('Generate invoice'));
  const saved = ui.calls.saved[0];
  assert.equal(saved.external, 'true');
  assert.ok(!('shift_ids' in saved) && !('pharmacy' in saved));
  const [line] = JSON.parse(saved.line_items);
  assert.equal(line.quantity, '1.50');
  assert.equal(line.unit_price, '3.03');
  assert.equal(line.description, 'Reviewed external services');
});

test('invalid monetary text reaches validation without becoming zero and cannot be saved', async () => {
  const ui = await mount({ preview: input => {
    if (input.line_items[0]?.unit_price === 'NaN') throw new Error('Unit price must be a finite decimal.');
    if (input.line_items.length) throw new Error('Complete the custom item.');
    return noContribution;
  } });
  await ui.selectShift();
  await ui.press(ui.all('IconButton').find(node => node.props.icon === 'plus'));
  await ui.change(ui.all('TextInput').find(node => node.props.accessibilityLabel === 'Line unit price' && !node.props.disabled), 'NaN');
  assert.equal(ui.calls.preview.at(-1).line_items[0].unit_price, 'NaN');
  assert.match(text(ui.tree), /Unit price must be a finite decimal/);
  assert.equal(ui.button('Generate invoice').props.disabled, true);
  await ui.button('Generate invoice').props.onPress();
  assert.equal(ui.calls.saved.length, 0);
});
