const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

/**
 * Regression Proof: Pharmacist & OtherStaff PaymentScreen Super Disclosure Persistence
 * and False-Dirty Elimination.
 *
 * Contracts:
 *  1. showSuperABN is strictly a UI disclosure toggle.
 *  2. Closing/hiding the Super disclosure switch (showSuperABN = false) MUST NEVER
 *     clear, wipe, or overwrite existing persisted super fields (super_fund_name, super_usi, super_member_number).
 *  3. In useUnsavedChangesGuard and every markClean snapshot, showSuperABN is excluded,
 *     guarding only actual data fields { data, tfnInput, abnInput }.
 *     Toggling the disclosure switch alone leaves the guarded snapshot 100% unchanged (no false-dirty).
 *  4. saveABN appends all 3 non-null super fields from data state, ensuring they are posted
 *     identically even when the disclosure section is closed.
 *  5. Null super fields do not append empty keys.
 *  6. Zero API update calls occur from toggling the disclosure alone before Save.
 */

class MockFormData {
  constructor() {
    this._entries = [];
  }
  append(key, value) {
    this._entries.push([key, String(value)]);
  }
  get(key) {
    const found = this._entries.find(([k]) => k === key);
    return found ? found[1] : null;
  }
  getAll(key) {
    return this._entries.filter(([k]) => k === key).map(([, v]) => v);
  }
  has(key) {
    return this._entries.some(([k]) => k === key);
  }
  entries() {
    return this._entries[Symbol.iterator]();
  }
}

function createHarness({ componentRelativePath, roleKey, initialOnboardingData, onUpdate }) {
  const componentPath = path.resolve(__dirname, componentRelativePath);
  const source = fs.readFileSync(componentPath, 'utf8');

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;

  let stateStore = [];
  let stateCursor = 0;
  let effectQueue = [];
  let effectCleanups = [];

  const reactMock = {
    useState(initial) {
      const idx = stateCursor++;
      if (!(idx in stateStore)) {
        stateStore[idx] = typeof initial === 'function' ? initial() : initial;
      }
      const setState = (next) => {
        stateStore[idx] = typeof next === 'function' ? next(stateStore[idx]) : next;
      };
      return [stateStore[idx], setState];
    },
    useMemo(fn, deps) {
      const idx = stateCursor++;
      const prev = stateStore[idx];
      const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
      if (changed) {
        stateStore[idx] = { deps, value: fn() };
      }
      return stateStore[idx].value;
    },
    useCallback(fn, deps) {
      return reactMock.useMemo(() => fn, deps);
    },
    useEffect(effect, deps) {
      const idx = stateCursor++;
      const prev = stateStore[idx];
      const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
      stateStore[idx] = { deps };
      if (changed) {
        effectQueue.push({ idx, effect });
      }
    },
    createElement(type, props, ...children) {
      const flat = children.flat(Infinity).filter((c) => c !== undefined && c !== null);
      if (typeof type === 'function') return type({ ...props, children: flat.length === 1 ? flat[0] : flat });
      return {
        type,
        props: {
          ...props,
          children: flat.length === 1 ? flat[0] : flat,
        },
      };
    },
    Fragment: Symbol.for('react.fragment'),
  };

  const guardSpy = {
    guardedValues: [],
    markCleanSnapshots: [],
    lastOptions: null,
  };

  let apiCalls = {
    getDetailCalls: [],
    updateFormCalls: [],
  };

  const modules = {
    react: reactMock,
    'react-native': {
      Alert: { alert: () => {} },
      ScrollView: (props) => ({ type: 'ScrollView', props: props || {} }),
      StyleSheet: { create: (s) => s },
      View: (props) => ({ type: 'View', props: props || {} }),
    },
    'react-native-safe-area-context': {
      SafeAreaView: (props) => ({ type: 'SafeAreaView', props: props || {} }),
    },
    'react-native-paper': {
      Button: (props) => ({ type: 'Button', props: props || {} }),
      Chip: (props) => ({ type: 'Chip', props: props || {} }),
      HelperText: (props) => ({ type: 'HelperText', props: props || {} }),
      Switch: (props) => ({ type: 'Switch', props: props || {} }),
      Text: (props) => ({ type: 'Text', props: props || {} }),
      TextInput: (props) => ({ type: 'TextInput', props: props || {} }),
    },
    '@chemisttasker/shared-core': {
      getOnboardingDetail: async (key) => {
        apiCalls.getDetailCalls.push(key);
        return JSON.parse(JSON.stringify(initialOnboardingData));
      },
      updateOnboardingForm: async (key, fd) => {
        apiCalls.updateFormCalls.push({ key, fd });
        if (onUpdate) {
          return onUpdate(key, fd);
        }
        return JSON.parse(JSON.stringify(initialOnboardingData));
      },
    },
    './shared': {
      roleKey,
    },
    '../../shared/forms/useUnsavedChangesGuard': {
      useUnsavedChangesGuard: (value, options) => {
        guardSpy.guardedValues.push(JSON.parse(JSON.stringify(value)));
        guardSpy.lastOptions = options;
        return {
          markClean: (snap) => {
            guardSpy.markCleanSnapshots.push(JSON.parse(JSON.stringify(snap)));
          },
        };
      },
    },
    '@/components/ui': {
      BrandLoader: (props) => ({ type: 'BrandLoader', props: props || {} }),
    },
  };

  const moduleExports = {};
  const moduleObj = { exports: moduleExports };

  const customRequire = (specifier) => {
    if (modules[specifier]) return modules[specifier];
    throw new Error(`Unexpected import in PaymentScreen test harness: ${specifier}`);
  };

  const context = vm.createContext({
    module: moduleObj,
    exports: moduleExports,
    require: customRequire,
    FormData: MockFormData,
    console,
    process,
  });

  vm.runInContext(transpiled, context);
  const PaymentScreen = moduleObj.exports.default || moduleObj.exports;

  const renderComponent = () => {
    stateCursor = 0;
    const tree = PaymentScreen();
    while (effectQueue.length > 0) {
      const { idx, effect } = effectQueue.shift();
      if (effectCleanups[idx]) {
        effectCleanups[idx]();
      }
      const cleanup = effect();
      if (typeof cleanup === 'function') {
        effectCleanups[idx] = cleanup;
      }
    }
    return tree;
  };

  return {
    render: renderComponent,
    apiCalls,
    guardSpy,
    flushAsync: async () => {
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

function findNode(tree, predicate) {
  if (!tree) return null;
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
  } else if (children && typeof children === 'object') {
    return findNode(children, predicate);
  }
  return null;
}

test('Pharmacist PaymentScreen ABN mode: closing Super disclosure switch preserves all 3 persisted super fields on Save ABN and eliminates false-dirty', async () => {
  const initialSnapshot = {
    payment_preference: 'ABN',
    abn: '51824753556',
    abn_entity_name: 'TEST PHARMACY PTY LTD',
    abn_verified: true,
    super_fund_name: 'AustralianSuper',
    super_usi: 'STA0100AU',
    super_member_number: '123456789',
  };

  const harness = createHarness({
    componentRelativePath: '../roles/pharmacist/profile-tabs/PaymentScreen.tsx',
    roleKey: 'pharmacist',
    initialOnboardingData: initialSnapshot,
    onUpdate: async (_key, fd) => ({
      ...initialSnapshot,
      abn: fd.get('abn'),
      super_fund_name: fd.get('super_fund_name'),
      super_usi: fd.get('super_usi'),
      super_member_number: fd.get('super_member_number'),
    }),
  });

  // 1. Initial render shows loader
  let tree = harness.render();
  const loader = findNode(tree, (n) => n.type === 'BrandLoader');
  assert.ok(loader, 'BrandLoader must be displayed on initial render');
  assert.equal(harness.apiCalls.getDetailCalls.length, 1);
  assert.equal(harness.apiCalls.getDetailCalls[0], 'pharmacist');

  // 2. Flush initial async load
  await harness.flushAsync();

  // 3. Re-render with loaded data
  tree = harness.render();

  const switchNode = findNode(tree, (n) => n.type === 'Switch');
  assert.ok(switchNode, 'Super disclosure Switch must be present');
  assert.equal(switchNode.props.value, true, 'Switch should initialize to true when super fields exist');

  // Baseline guarded value after load
  const initialGuarded = harness.guardSpy.guardedValues.at(-1);
  assert.equal(initialGuarded.showSuperABN, undefined, 'showSuperABN must be excluded from guarded value');
  assert.equal(initialGuarded.data.super_fund_name, 'AustralianSuper');
  assert.equal(initialGuarded.abnInput, '51824753556');

  // 4. User flips Switch to false (hide Super disclosure)
  switchNode.props.onValueChange(false);

  // 5. Re-render: Super disclosure inputs are hidden
  tree = harness.render();
  const switchAfterClose = findNode(tree, (n) => n.type === 'Switch');
  assert.equal(switchAfterClose.props.value, false, 'Switch must reflect false state');

  const superFundAfterClose = findNode(tree, (n) => n.type === 'TextInput' && n.props.label === 'Super Fund Name');
  assert.equal(superFundAfterClose, null, 'Super Fund Name input must be unmounted/hidden when showSuperABN is false');

  // 6. VERIFY FALSE-DIRTY BUG IS FIXED: Guarded value is identical after display toggle alone!
  const toggledGuarded = harness.guardSpy.guardedValues.at(-1);
  assert.deepEqual(toggledGuarded, initialGuarded, 'Guarded value must NOT change when toggling disclosure switch alone');

  // Assert NO update API call has happened yet
  assert.equal(harness.apiCalls.updateFormCalls.length, 0, 'No update API call must occur prior to pressing Save');

  // 7. Find and invoke the real Save ABN button
  const saveBtn = findNode(tree, (n) => n.type === 'Button' && n.props.children === 'Save');
  assert.ok(saveBtn, 'Save button must be present in ABN section');
  assert.equal(saveBtn.props.disabled, false, 'Save button must not be disabled for valid ABN');

  await saveBtn.props.onPress();
  await harness.flushAsync();

  // 8. Verify the posted FormData contract
  assert.equal(harness.apiCalls.updateFormCalls.length, 1, 'updateOnboardingForm must be called once on Save');
  const { key, fd } = harness.apiCalls.updateFormCalls[0];
  assert.equal(key, 'pharmacist', 'Must target pharmacist onboarding roleKey');

  assert.equal(fd.get('tab'), 'payment', 'Must submit tab=payment');
  assert.equal(fd.get('payment_preference'), 'ABN', 'Must submit payment_preference=ABN');
  assert.equal(fd.get('abn'), '51824753556', 'Must submit unchanged ABN value');

  // CRITICAL INVARIANT: All 3 super values MUST be preserved and submitted, NOT cleared or omitted
  assert.equal(fd.get('super_fund_name'), 'AustralianSuper', 'super_fund_name must be preserved on saveABN');
  assert.equal(fd.get('super_usi'), 'STA0100AU', 'super_usi must be preserved on saveABN');
  assert.equal(fd.get('super_member_number'), '123456789', 'super_member_number must be preserved on saveABN');
});

test('OtherStaff PaymentScreen ABN mode: matches exact same contract and eliminates false-dirty', async () => {
  const initialSnapshot = {
    payment_preference: 'ABN',
    abn: '98765432109',
    abn_entity_name: 'STAFF SERVICES PTY LTD',
    abn_verified: true,
    super_fund_name: 'Rest Super',
    super_usi: 'RES0103AU',
    super_member_number: '77889900',
  };

  const harness = createHarness({
    componentRelativePath: '../roles/otherstaff/profile-tabs/PaymentScreen.tsx',
    roleKey: 'otherstaff',
    initialOnboardingData: initialSnapshot,
    onUpdate: async (_key, fd) => ({
      ...initialSnapshot,
      abn: fd.get('abn'),
      super_fund_name: fd.get('super_fund_name'),
      super_usi: fd.get('super_usi'),
      super_member_number: fd.get('super_member_number'),
    }),
  });

  harness.render();
  await harness.flushAsync();
  let tree = harness.render();

  const initialGuarded = harness.guardSpy.guardedValues.at(-1);
  assert.equal(initialGuarded.showSuperABN, undefined, 'showSuperABN must be excluded from otherstaff guard');

  const switchNode = findNode(tree, (n) => n.type === 'Switch');
  assert.equal(switchNode.props.value, true);

  // Toggle disclosure off
  switchNode.props.onValueChange(false);
  tree = harness.render();

  const toggledGuarded = harness.guardSpy.guardedValues.at(-1);
  assert.deepEqual(toggledGuarded, initialGuarded, 'OtherStaff guarded snapshot must remain unchanged after display toggle');
  assert.equal(harness.apiCalls.updateFormCalls.length, 0, 'No API call on toggle alone');

  // Press Save
  const saveBtn = findNode(tree, (n) => n.type === 'Button' && n.props.children === 'Save');
  await saveBtn.props.onPress();
  await harness.flushAsync();

  assert.equal(harness.apiCalls.updateFormCalls.length, 1);
  const { key, fd } = harness.apiCalls.updateFormCalls[0];
  assert.equal(key, 'otherstaff', 'Must target otherstaff onboarding roleKey');
  assert.equal(fd.get('super_fund_name'), 'Rest Super');
  assert.equal(fd.get('super_usi'), 'RES0103AU');
  assert.equal(fd.get('super_member_number'), '77889900');
});

test('PaymentScreen ABN mode: user with null super values does not append super keys on saveABN', async () => {
  const initialSnapshotWithoutSuper = {
    payment_preference: 'ABN',
    abn: '12345678901',
    super_fund_name: null,
    super_usi: null,
    super_member_number: null,
  };

  const harness = createHarness({
    componentRelativePath: '../roles/pharmacist/profile-tabs/PaymentScreen.tsx',
    roleKey: 'pharmacist',
    initialOnboardingData: initialSnapshotWithoutSuper,
  });

  harness.render();
  await harness.flushAsync();
  let tree = harness.render();

  const switchNode = findNode(tree, (n) => n.type === 'Switch');
  assert.equal(switchNode.props.value, false, 'Switch initializes to false when super fields are null');

  const saveBtn = findNode(tree, (n) => n.type === 'Button' && n.props.children === 'Save');
  await saveBtn.props.onPress();
  await harness.flushAsync();

  assert.equal(harness.apiCalls.updateFormCalls.length, 1);
  const { fd } = harness.apiCalls.updateFormCalls[0];
  assert.equal(fd.get('tab'), 'payment');
  assert.equal(fd.get('payment_preference'), 'ABN');
  assert.equal(fd.get('abn'), '12345678901');
  assert.equal(fd.has('super_fund_name'), false, 'Null super_fund_name must not be appended');
  assert.equal(fd.has('super_usi'), false, 'Null super_usi must not be appended');
  assert.equal(fd.has('super_member_number'), false, 'Null super_member_number must not be appended');
});
