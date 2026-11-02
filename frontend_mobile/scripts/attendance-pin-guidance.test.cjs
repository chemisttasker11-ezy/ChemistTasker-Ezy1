const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function nodes(node, type) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (typeof node !== 'object' || node.props?.hidden) return [];
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  return node.props?.hidden ? '' : text(node.props?.children);
}
const guidance = [/accepted\s+(?:staff\s+)?membership/i, /booked locums/i, /mobile app/i];

async function pinScreen() {
  const state = [], deps = [], requests = [], saves = [], routes = [];
  let cursor = 0, dirty = true, effects = [], tree;
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
  const names = new Proxy({ RadioButton: { Group: 'RadioButton.Group', Item: 'RadioButton.Item' } }, {
    get: (target, name) => name in target ? target[name] : String(name),
  });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { ScrollView: 'ScrollView', StyleSheet: { create: styles => styles } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' }, 'react-native-paper': names,
    'expo-router': { useRouter: () => ({ push: route => routes.push(route), navigate: route => routes.push(route), back() {} }) },
    '@chemisttasker/shared-core': { attendance: {
      getPinPharmacies: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
      updatePin: (pharmacyId, pin) => new Promise((resolve, reject) => saves.push({ pharmacyId, pin, resolve, reject })),
    } },
  };
  const { outputText } = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../app/attendance-pin.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, console,
    require(name) { assert.ok(name in imports, `Unmocked mobile dependency: ${name}`); return imports[name]; },
  });
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) {
        cursor = 0; dirty = false; tree = exports.default();
        const pending = effects; effects = []; pending.forEach(fn => fn());
      }
      await new Promise(setImmediate);
      if (!dirty && !effects.length) return;
    }
    assert.fail('Mobile PIN effects did not settle');
  }
  await flush();
  assert.equal(requests.length, 1, 'Screen mount must load self-service pharmacies');
  return {
    routes, requests, saves, flush, get tree() { return tree; },
    async pharmacies(pharmacies, index = 0) { requests[index].resolve({ pharmacies }); await flush(); },
    async fail() { requests[0].reject(new Error('Network unavailable')); await flush(); },
    async enter(label, value) {
      const field = nodes(tree, 'TextInput').find(node => node.props.label === label);
      assert.ok(field, `Missing mobile field ${label}`);
      assert.ok(!field.props.disabled);
      field.props.onChangeText(value); await flush();
    },
    async press(pattern) {
      const button = nodes(tree, 'Button').find(node => pattern.test(text(node)));
      assert.ok(button, `Missing mobile action ${pattern}; visible text: ${text(tree)}`);
      assert.ok(!button.props.disabled);
      // Reload stays pending until the test supplies its response.
      void button.props.onPress(); await flush();
    },
  };
}

test('mobile loaded-empty PIN screen explains membership eligibility and booked locum QR clock-in', async () => {
  const ui = await pinScreen(); await ui.pharmacies([]); const copy = text(ui.tree);
  assert.equal(nodes(ui.tree, 'ActivityIndicator').length, 0);
  assert.equal(nodes(ui.tree, 'HelperText').filter(node => node.props.type === 'error').length, 0);
  assert.match(copy, /accepted\s+staff\s+membership/i); assert.match(copy, /(?:that|this|the|selected|same) pharmacy/i);
  assert.match(copy, /kiosk PIN/i); assert.match(copy, /booked locums/i); assert.match(copy, /clock\s*in/i);
  assert.match(copy, /mobile app/i); assert.match(copy, /scan\w*/i); assert.match(copy, /pharmacy.*QR|QR.*pharmacy/i);
  assert.doesNotMatch(copy, /No active pharmacy memberships are available/i);
});

test('mobile loaded-empty PIN screen offers a QR clock action navigating to /attendance/clock', async () => {
  const ui = await pinScreen(); await ui.pharmacies([]);
  await ui.press(/scan|QR|clock in/i);
  assert.deepEqual(ui.routes, ['/attendance/clock']);
});

test('mobile loaded-empty PIN screen offers a pending invitations action navigating to /admin-invitations', async () => {
  assert.ok(fs.existsSync(path.resolve(__dirname, '../app/admin-invitations.tsx')), 'Invitation destination must exist');
  const ui = await pinScreen(); await ui.pharmacies([]);
  await ui.press(/invit/i);
  assert.deepEqual(ui.routes, ['/admin-invitations']);
  await ui.press(/scan|QR|clock in/i);
  assert.deepEqual(ui.routes, ['/admin-invitations', '/attendance/clock'], 'Invitation recovery must keep the QR clock action');
});

test('mobile PIN guidance and QR action are absent while pharmacies load', async () => {
  const ui = await pinScreen();
  assert.equal(nodes(ui.tree, 'ActivityIndicator').length, 1);
  for (const phrase of guidance) assert.doesNotMatch(text(ui.tree), phrase);
  assert.ok(!nodes(ui.tree, 'Button').some(node => /scan|QR|clock in/i.test(text(node))));
});

test('mobile PIN load errors retain error/reload controls without empty guidance or QR action', async () => {
  const ui = await pinScreen(); await ui.fail();
  assert.match(text(ui.tree), /unable to load/i);
  assert.ok(nodes(ui.tree, 'HelperText').some(node => node.props.type === 'error'));
  assert.ok(nodes(ui.tree, 'Button').some(node => /reload pharmacies/i.test(text(node))));
  assert.equal(nodes(ui.tree, 'RadioButton.Group').length, 0, 'Load errors must hide the pharmacy picker');
  assert.equal(nodes(ui.tree, 'TextInput').length, 0, 'Load errors must hide both PIN fields');
  assert.ok(!nodes(ui.tree, 'Button').some(node => /save attendance PIN/i.test(text(node))));
  assert.equal(nodes(ui.tree, 'ActivityIndicator').length, 0);
  for (const phrase of guidance) assert.doesNotMatch(text(ui.tree), phrase);
  assert.ok(!nodes(ui.tree, 'Button').some(node => /scan|QR|clock in/i.test(text(node))));
});

test('mobile PIN reload after error still fetches and selects an eligible pharmacy', async () => {
  const ui = await pinScreen(); await ui.fail(); await ui.press(/^Reload pharmacies$/i);
  assert.equal(ui.requests.length, 2); assert.equal(nodes(ui.tree, 'ActivityIndicator').length, 1);
  assert.doesNotMatch(text(ui.tree), /unable to load/i);
  await ui.pharmacies([{ id: 17, name: 'Accepted Pharmacy', has_pin: false }], 1);
  assert.equal(nodes(ui.tree, 'ActivityIndicator').length, 0);
  assert.equal(nodes(ui.tree, 'RadioButton.Group')[0].props.value, '17');
  assert.equal(nodes(ui.tree, 'RadioButton.Item')[0].props.label, 'Accepted Pharmacy');
  for (const phrase of guidance) assert.doesNotMatch(text(ui.tree), phrase);
  assert.ok(!nodes(ui.tree, 'Button').some(node => /scan|QR|clock in/i.test(text(node))));
});

for (const [kind, error, message] of [
  ['backend refusal', { status: 403, payload: { error: 'PIN update refused by pharmacy.' }, message: 'Request failed' }, 'PIN update refused by pharmacy.'],
  ['network error', new Error('Network unavailable while saving PIN.'), 'Network unavailable while saving PIN.'],
]) {
  test(`mobile PIN ${kind} shows the save error, preserves the form and allows a successful retry`, async () => {
    const ui = await pinScreen();
    await ui.pharmacies([{ id: 17, name: 'Accepted Pharmacy', has_pin: false }]);
    await ui.enter('New attendance PIN', '4826');
    await ui.enter('Confirm attendance PIN', '4826');
    await ui.press(/^Save attendance PIN$/i);
    assert.equal(ui.saves.length, 1, 'A valid PIN must reach updatePin');
    assert.equal(ui.saves[0].pharmacyId, 17);
    assert.equal(ui.saves[0].pin, '4826');
    ui.saves[0].reject(error); await ui.flush();
    assert.ok(nodes(ui.tree, 'HelperText').some(node => node.props.type === 'error' && text(node) === message),
      'The rejected save must display its backend or network error');
    assert.doesNotMatch(text(ui.tree), /Attendance PIN saved/i);
    assert.deepEqual({
      picker: nodes(ui.tree, 'RadioButton.Group').length,
      pinFields: nodes(ui.tree, 'TextInput').map(node => node.props.label),
      save: nodes(ui.tree, 'Button').filter(node => /^Save attendance PIN$/i.test(text(node))).length,
    }, {
      picker: 1, pinFields: ['New attendance PIN', 'Confirm attendance PIN'], save: 1,
    }, 'A save error must keep the pharmacy picker, both PIN fields and Save visible');
    assert.equal(nodes(ui.tree, 'RadioButton.Group')[0].props.value, '17');
    assert.ok(nodes(ui.tree, 'RadioButton.Item').every(node => !node.props.disabled));
    for (const field of nodes(ui.tree, 'TextInput')) {
      assert.equal(field.props.value, '4826');
      assert.ok(!field.props.disabled, 'PIN fields must remain editable after a save failure');
    }
    await ui.press(/^Save attendance PIN$/i);
    assert.equal(ui.saves.length, 2, 'Retry must call updatePin again without reloading');
    assert.equal(ui.saves[1].pharmacyId, 17);
    assert.equal(ui.saves[1].pin, '4826');
    ui.saves[1].resolve({}); await ui.flush();
    assert.match(text(ui.tree), /Attendance PIN saved for Accepted Pharmacy/i);
    assert.equal(nodes(ui.tree, 'HelperText').filter(node => node.props.type === 'error').length, 0);
    assert.equal(nodes(ui.tree, 'TextInput').length, 2);
    assert.ok(nodes(ui.tree, 'TextInput').every(node => node.props.value === ''));
    assert.equal(ui.requests.length, 1, 'A successful retry must not require a pharmacy reload');
  });
}
