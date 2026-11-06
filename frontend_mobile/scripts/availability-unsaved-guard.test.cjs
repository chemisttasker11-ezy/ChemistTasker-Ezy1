const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function getTs() {
  try {
    return require('typescript');
  } catch {
    const candidatePath = path.resolve(__dirname, '../../pr249-m1-integration-20261105/frontend_mobile/node_modules/typescript');
    return require(candidatePath);
  }
}
const ts = getTs();

function createTestHarness(initialUser = { id: 7001, role: 'PHARMACIST' }, useProductionGuard = false) {
  let currentUser = initialUser;
  let capturedGuard = null;
  let fetchAvailability = async () => [];
  let deleteAvailability = async () => {};
  let updateLocation = async () => ({});
  let preventRemove = null;
  const stateSlots = [];
  const refSlots = [];
  const effectSlots = [];
  const effectCleanups = new Map();
  const effectPrevDeps = new Map();
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;

  const resetIndices = () => {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
  };

  const areDepsEqual = (prevDeps, nextDeps) => {
    if (!prevDeps || !nextDeps) return false;
    if (prevDeps.length !== nextDeps.length) return false;
    for (let i = 0; i < prevDeps.length; i++) {
      if (!Object.is(prevDeps[i], nextDeps[i])) return false;
    }
    return true;
  };

  const react = {
    useState: (initial) => {
      const idx = stateIndex++;
      if (stateSlots.length <= idx) {
        stateSlots.push(typeof initial === 'function' ? initial() : initial);
      }
      const setState = (action) => {
        stateSlots[idx] = typeof action === 'function' ? action(stateSlots[idx]) : action;
      };
      return [stateSlots[idx], setState];
    },
    useRef: (initial) => {
      const idx = refIndex++;
      if (refSlots.length <= idx) {
        refSlots.push({ current: initial });
      }
      return refSlots[idx];
    },
    useEffect: (fn, deps) => {
      const idx = effectIndex++;
      effectSlots[idx] = { fn, deps };
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    createElement: (type, props, ...children) => {
      const flatChildren = children.length === 1 ? children[0] : (children.length > 0 ? children : props?.children);
      return { type, props: { ...props, children: flatChildren } };
    },
  };

  const runEffects = async () => {
    for (let i = 0; i < effectSlots.length; i++) {
      const slot = effectSlots[i];
      if (!slot) continue;
      const prevDeps = effectPrevDeps.get(i);
      const shouldRun = !effectPrevDeps.has(i) || !slot.deps || !areDepsEqual(prevDeps, slot.deps);
      if (shouldRun) {
        if (effectCleanups.has(i)) {
          const prevCleanup = effectCleanups.get(i);
          if (typeof prevCleanup === 'function') {
            try { prevCleanup(); } catch {}
          }
          effectCleanups.delete(i);
        }
        const cleanup = slot.fn();
        if (typeof cleanup === 'function') {
          effectCleanups.set(i, cleanup);
        }
        effectPrevDeps.set(i, slot.deps);
      }
    }
    for (let r = 0; r < 20; r++) {
      await Promise.resolve();
    }
  };

  const modelPath = path.resolve(__dirname, '../roles/shared/availability/availabilityModel.ts');
  const modelSource = fs.readFileSync(modelPath, 'utf8');
  const modelCompiled = ts.transpileModule(modelSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modelExports = {};
  const modelModule = { exports: modelExports };
  const modelContext = vm.createContext({
    __DEV__: true,
    process: { env: { NODE_ENV: 'test', EXPO_PUBLIC_ENABLE_NATIVE_MAP_PREVIEW: 'false' } },
    module: modelModule,
    exports: modelExports,
    require: () => ({}),
    FormData: class { constructor() { this.fields = {}; } append(key, value) { this.fields[key] = value; } },
    console, Date, String, Number, Boolean, Array, Object, Set, Map, RegExp, Promise, Error, TypeError, RangeError, setTimeout, clearTimeout,
  });
  vm.runInContext(modelCompiled, modelContext);
  const availabilityModel = modelContext.module.exports;

  const mockGuardHook = (value, options) => {
    let baseline = capturedGuard?.baseline ?? null;
    const normalize = (v) => JSON.stringify(v);
    const isDirty = baseline !== null && normalize(baseline) !== normalize(value);

    capturedGuard = {
      value,
      options,
      baseline,
      isDirty,
      markClean: (next) => {
        baseline = next !== undefined ? next : value;
        capturedGuard.baseline = baseline;
      },
      discardChanges: async () => {
        if (options.onDiscard) await options.onDiscard();
        return true;
      },
    };
    return {
      isDirty: capturedGuard.isDirty,
      markClean: (next) => capturedGuard.markClean(next),
      discardChanges: capturedGuard.discardChanges,
      confirmDiscard: (action) => action(),
    };
  };

  let guardHook = mockGuardHook;
  if (useProductionGuard) {
    const guardPath = fs.existsSync(path.resolve(__dirname, '../roles/shared/forms/useUnsavedChangesGuard.ts')) ? path.resolve(__dirname, '../roles/shared/forms/useUnsavedChangesGuard.ts') : path.resolve(__dirname, '../../pr249-m1-integration-20261105/frontend_mobile/roles/shared/forms/useUnsavedChangesGuard.ts');
    const compiled = ts.transpileModule(fs.readFileSync(guardPath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const guardModule = { exports: {} };
    const guardMocks = {
      react,
      'react-native': { Alert: { alert() {} }, Platform: { OS: 'ios' } },
      'expo-router': { useIsFocused: () => true },
      'expo-router/react-navigation': { usePreventRemove: (enabled, callback) => { preventRemove = enabled ? callback : null; } },
      './UnsavedChangesDialogProvider': { useUnsavedChangesDialog: () => null },
      './UnsavedChangesRegistryProvider': { useUnsavedChangesRegistry: () => null },
    };
    vm.runInNewContext(compiled, { module: guardModule, exports: guardModule.exports, require: (name) => guardMocks[name], JSON, Object, Array, Date, Promise });
    guardHook = guardModule.exports.useUnsavedChangesGuard;
  }

  const screenPath = path.resolve(__dirname, '../roles/shared/availability/SetAvailabilityScreen.tsx');
  const screenSource = fs.readFileSync(screenPath, 'utf8');
  const screenCompiled = ts.transpileModule(screenSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;

  const mocks = {
    react,
    'react-native': {
      LayoutAnimation: { configureNext: () => {}, Presets: { easeInEaseOut: {} } },
      LogBox: { ignoreLogs: () => {} },
      Platform: { OS: 'ios', select: (options) => options.ios ?? options.default },
      Pressable: (props) => props,
      ScrollView: (props) => props,
      StyleSheet: { create: (s) => s },
      UIManager: {},
      View: (props) => props,
    },
    'react-native-safe-area-context': {
      SafeAreaView: (props) => props,
    },
    'react-native-paper': {
      Button: (props) => props,
      Checkbox: (props) => props,
      Chip: (props) => props,
      HelperText: (props) => props,
      IconButton: (props) => props,
      Menu: Object.assign((props) => props, { Item: (props) => props }),
      Snackbar: (props) => props,
      Surface: (props) => props,
      Text: (props) => props,
      TextInput: (props) => props,
    },
    '@chemisttasker/shared-core': {
      fetchUserAvailabilityService: async () => fetchAvailability(),
      createUserAvailabilityService: async (payload) => payload,
      deleteUserAvailabilityService: async (...args) => deleteAvailability(...args),
      getOnboarding: async () => ({
        street_address: '100 Queen St',
        suburb: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
        coverage_radius_km: 30, latitude: -37.8, longitude: 145.0, google_place_id: 'old-place',
      }),
      updateOnboardingForm: async (...args) => updateLocation(...args),
    },
    '../../../context/AuthContext': {
      useAuth: () => ({ user: currentUser }),
    },
    '@react-google-maps/api': {
      Autocomplete: (props) => props,
      Circle: (props) => props,
      GoogleMap: (props) => props,
      Marker: (props) => props,
      useJsApiLoader: () => ({ isLoaded: true, loadError: null }),
    },
    '../pharmacies/GooglePlacesInput': () => null,
    './AvailabilityRadiusMap': () => null,
    './availabilityModel': availabilityModel,
    '../forms/useUnsavedChangesGuard': {
      useUnsavedChangesGuard: guardHook,
    },
    '@/components/ui': {
      BrandLoader: (props) => ({ type: 'BrandLoader', props }),
      ConfirmDialog: (props) => ({ type: 'ConfirmDialog', props }),
    },
  };

  const screenExports = {};
  const screenModule = { exports: screenExports };
  const customRequire = (spec) => mocks[spec] || require(spec);

  const screenContext = vm.createContext({
    __DEV__: true,
    process: { env: { NODE_ENV: 'test', EXPO_PUBLIC_ENABLE_NATIVE_MAP_PREVIEW: 'false' } },
    module: screenModule,
    exports: screenExports,
    require: customRequire,
    console, Date, String, Number, Boolean, Array, Object, Set, Map, RegExp, Promise, Error, TypeError, RangeError, setTimeout, clearTimeout,
  });
  vm.runInContext(screenCompiled, screenContext);

  const { SetAvailabilityInner } = screenContext.module.exports;

  const render = () => {
    resetIndices();
    return SetAvailabilityInner();
  };

  const find = (node, predicate) => {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const child of node) { const found = find(child, predicate); if (found) return found; }
      return null;
    }
    if (predicate(node)) return node;
    return find(node.props?.children, predicate);
  };

  return {
    render,
    runEffects,
    find,
    setFetchAvailability: (fn) => { fetchAvailability = fn; },
    setDeleteAvailability: (fn) => { deleteAvailability = fn; },
    setUpdateLocation: (fn) => { updateLocation = fn; },
    getGuard: () => capturedGuard,
    stateSlots,
    availabilityModel,
    getPreventRemove: () => preventRemove,
  };
}

test('availability unsaved guard: initial readonly load produces no spurious dirty', async () => {
  const harness = createTestHarness();
  harness.render();
  await harness.runEffects();
  harness.render();

  const guard = harness.getGuard();
  assert.ok(guard, 'Guard must be registered');
  assert.equal(guard.options.saving, false, 'Initial load must not set saving/busy flag');
  assert.equal(guard.options.title, 'Discard changes?');
});

test('availability unsaved guard: draft Keep editing/Discard callback restores clean baseline without network', async () => {
  const harness = createTestHarness();
  harness.render();
  await harness.runEffects();
  harness.render();

  const guard = harness.getGuard();
  assert.ok(guard, 'Guard exists');
  assert.equal(typeof guard.options.onDiscard, 'function', 'onDiscard callback must be registered');

  // Trigger onDiscard
  await guard.options.onDiscard();
  harness.render();

  const postDiscardGuard = harness.getGuard();
  assert.equal(postDiscardGuard.value.slotDraft.selectedDates.length, 0, 'Slot draft dates must be cleared on discard');
});


test('availability reload failure preserves saved notification and clean guard', async () => {
  const harness = createTestHarness();
  harness.setFetchAvailability(async () => [{ id: 7, date: '2027-02-11', startTime: '09:00', endTime: '17:00', notifyNewShifts: true }]);
  harness.render();
  await harness.runEffects();
  let tree = harness.render();
  assert.equal(harness.getGuard().value.slotDraft.notifyNewShifts, true);
  assert.equal(harness.getGuard().isDirty, false);
  harness.setDeleteAvailability(async () => { throw new Error('delete failed'); });
  harness.setFetchAvailability(async () => { throw new Error('reload failed'); });
  harness.find(tree, (n) => n.props?.testID === 'availability-slot-delete-7').props.onPress();
  tree = harness.render();
  await harness.find(tree, (n) => n.props?.confirmTestID === 'availability-delete-confirm').props.onConfirm();
  harness.render();
  await harness.runEffects();
  harness.render();
  assert.equal(harness.getGuard().value.slotDraft.notifyNewShifts, true);
  assert.equal(harness.getGuard().isDirty, false);
});

test('successful availability retry preserves notification edited after failure', async () => {
  const harness = createTestHarness();
  const entries = [{ id: 7, date: '2027-02-11', startTime: '09:00', endTime: '17:00', notifyNewShifts: true }];
  harness.setFetchAvailability(async () => entries);
  harness.render();
  await harness.runEffects();
  let tree = harness.render();
  harness.setDeleteAvailability(async () => { throw new Error('delete failed'); });
  harness.setFetchAvailability(async () => { throw new Error('reload failed'); });
  harness.find(tree, (n) => n.props?.testID === 'availability-slot-delete-7').props.onPress();
  tree = harness.render();
  await harness.find(tree, (n) => n.props?.confirmTestID === 'availability-delete-confirm').props.onConfirm();
  harness.render();
  await harness.runEffects();
  tree = harness.render();
  harness.find(tree, (n) => n.props?.accessibilityLabel === 'Notify me when new public shifts match my availability').props.onPress();
  tree = harness.render();
  harness.setFetchAvailability(async () => entries);
  harness.find(tree, (n) => n.props?.children === 'Retry availability').props.onPress();
  harness.render();
  await harness.runEffects();
  harness.render();
  assert.equal(harness.getGuard().value.slotDraft.notifyNewShifts, false);
  assert.equal(harness.getGuard().baseline.slotDraft.notifyNewShifts, true);
  assert.equal(harness.getGuard().isDirty, true);
});

test('availability location save retains dirty indication for later address selection', async () => {
  const harness = createTestHarness();
  harness.render();
  await harness.runEffects();
  let tree = harness.render();
  harness.find(tree, (n) => n.props?.accessibilityLabel?.startsWith('Location and travel settings:')).props.onPress();
  tree = harness.render();
  const place = (address) => ({ street_address: address, suburb: 'Melbourne', state: 'VIC', postcode: '3000' });
  harness.find(tree, (n) => typeof n.props?.onPlaceSelected === 'function').props.onPlaceSelected(place('First St'));
  tree = harness.render();
  let resolveSave;
  harness.setUpdateLocation(() => new Promise((resolve) => { resolveSave = resolve; }));
  const saving = harness.find(tree, (n) => n.props?.children === 'Save Location').props.onPress();
  tree = harness.render();
  harness.find(tree, (n) => typeof n.props?.onPlaceSelected === 'function').props.onPlaceSelected(place('Second St'));
  harness.render();
  resolveSave({});
  await saving;
  tree = harness.render();
  assert.equal(harness.getGuard().value.location.streetAddress, 'Second St');
  assert.equal(harness.getGuard().baseline.location.streetAddress, 'First St');
  assert.equal(harness.getGuard().isDirty, true);
  assert.ok(harness.find(tree, (n) => typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityLabel.includes('(Unsaved)')));
});

test('production guard blocks navigation when availability loads during location save', async () => {
  const harness = createTestHarness(undefined, true);
  let resolveAvailability;
  harness.setFetchAvailability(() => new Promise((resolve) => { resolveAvailability = resolve; }));
  harness.render();
  await harness.runEffects();
  let tree = harness.render();
  harness.find(tree, (n) => n.props?.accessibilityLabel?.startsWith('Location and travel settings:')).props.onPress();
  tree = harness.render();
  harness.find(tree, (n) => typeof n.props?.onPlaceSelected === 'function').props.onPlaceSelected({ street_address: 'First St' });
  tree = harness.render();
  let resolveSave;
  harness.setUpdateLocation(() => new Promise((resolve) => { resolveSave = resolve; }));
  const saving = harness.find(tree, (n) => n.props?.children === 'Save Location').props.onPress();
  harness.render();
  await harness.runEffects();
  resolveAvailability([{ id: 7, notifyNewShifts: true }]);
  await Promise.resolve();
  await Promise.resolve();
  harness.render();
  await harness.runEffects();
  let repeated = false;
  assert.ok(harness.getPreventRemove());
  harness.getPreventRemove()({ repeat: () => { repeated = true; } });
  assert.equal(repeated, false, 'an unrelated load must not permit leaving during a save');
  resolveSave({});
  await saving;
  harness.render();
  await harness.runEffects();
});

test('repeat start edits preserve end and show validation when the range becomes invalid', async () => {
  const h = createTestHarness();
  h.render(); await h.runEffects();
  let tree = h.render();
  h.find(tree, n => n.props?.children === 'Repeating').props.onPress();
  tree = h.render();
  h.find(tree, n => n.props?.label === 'Start date').props.onChangeText('2027-02-01');
  tree = h.render();
  h.find(tree, n => n.props?.label === 'End Date').props.onChangeText('2027-02-20');
  tree = h.render();
  h.find(tree, n => n.props?.label === 'Start date').props.onChangeText('2027-02-05');
  tree = h.render();
  assert.equal(h.find(tree, n => n.props?.label === 'End Date').props.value, '2027-02-20');
  assert.equal(h.find(tree, n => n.props?.children === 'Repeat end must be on or after the start date'), null);
  h.find(tree, n => n.props?.label === 'Start date').props.onChangeText('2027-02-25');
  tree = h.render();
  assert.equal(h.find(tree, n => n.props?.label === 'End Date').props.value, '2027-02-20');
  assert.ok(h.find(tree, n => n.props?.children === 'Repeat end must be on or after the start date'));
});

test('manual address callback updates screen draft and dirty guard', async () => {
  const h = createTestHarness();
  h.render(); await h.runEffects();
  let tree = h.render();
  h.find(tree, n => n.props?.accessibilityLabel?.startsWith('Location and travel settings:')).props.onPress();
  tree = h.render();
  h.find(tree, n => typeof n.props?.onPlaceSelected === 'function').props.onChangeText('42 New Street');
  h.render();
  assert.equal(h.getGuard().value.location.streetAddress, '42 New Street');
  assert.equal(h.getGuard().isDirty, true);
});

test('actual Places component allows manual entry when no key is configured', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../roles/shared/pharmacies/GooglePlacesInput.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const react = { useState: v => [v, () => {}], useRef: () => ({ current: null }), useEffect: () => {}, createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const input = function Input() {};
  const mocks = {
    react,
    'react-native': { View: 'View', StyleSheet: { create: s => s }, Platform: { OS: 'ios', select: x => x.ios }, LogBox: { ignoreLogs() {} } },
    'react-native-paper': { TextInput: input, HelperText: 'HelperText' },
    'react-native-google-places-autocomplete': {}, '@react-google-maps/api': {},
    './types': { surfaceTokens: {} },
  };
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: name => mocks[name], process: { env: {} }, console: { warn() {} }, __DEV__: false });
  let changed = '';
  const tree = mod.exports.default({ label: 'Address', value: 'Old', onPlaceSelected() {}, onChangeText: v => { changed = v; } });
  const field = tree.props.children.find(n => n?.type === input);
  assert.equal(field.props.editable, true);
  field.props.onChangeText('New street');
  assert.equal(changed, 'New street');
});



test('manual address changes clear saved geocoding and selection saves fresh coordinates', async () => {
  const h = createTestHarness();
  h.render(); await h.runEffects();
  let tree = h.render();
  h.find(tree, n => n.props?.accessibilityLabel?.startsWith('Location and travel settings:')).props.onPress();
  tree = h.render();
  let address = h.find(tree, n => typeof n.props?.onPlaceSelected === 'function');
  address.props.onChangeText('42 New Street');
  tree = h.render();
  assert.equal(h.getGuard().value.location.latitude, null);
  assert.equal(h.getGuard().value.location.longitude, null);
  assert.equal(h.getGuard().value.location.googlePlaceId, '');
  let sent;
  h.setUpdateLocation(async (_role, form) => { sent = form.fields; });
  await h.find(tree, n => n.props?.children === 'Save Location').props.onPress();
  assert.equal(sent.latitude, '');
  assert.equal(sent.longitude, '');
  assert.equal(sent.google_place_id, '');
  tree = h.render();
  address = h.find(tree, n => typeof n.props?.onPlaceSelected === 'function');
  address.props.onPlaceSelected({ street_address: '50 Selected St', latitude: -27.4, longitude: 153.0, place_id: 'new-place' });
  tree = h.render();
  await h.find(tree, n => n.props?.children === 'Save Location').props.onPress();
  assert.equal(sent.latitude, '-27.4');
  assert.equal(sent.longitude, '153');
  assert.equal(sent.google_place_id, 'new-place');
});

test('editing suburb clears existing coordinates', async () => {
  const h = createTestHarness();
  h.render(); await h.runEffects();
  let tree = h.render();
  h.find(tree, n => n.props?.accessibilityLabel?.startsWith('Location and travel settings:')).props.onPress();
  tree = h.render();
  h.find(tree, n => n.props?.label === 'Suburb').props.onChangeText('New suburb');
  h.render();
  assert.equal(h.getGuard().value.location.latitude, null);
  assert.equal(h.getGuard().value.location.googlePlaceId, '');
});

test('Places input syncs an empty value only for manual-edit callers', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../roles/shared/pharmacies/GooglePlacesInput.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const writes = [];
  const react = { useState: v => [v, () => {}], useRef: () => ({ current: { getAddressText: () => 'typed text', setAddressText: v => writes.push(v) } }), useEffect: fn => fn(), createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const mocks = {
    react,
    'react-native': { View: 'View', StyleSheet: { create: s => s }, Platform: { OS: 'ios', select: x => x.ios }, LogBox: { ignoreLogs() {} } },
    'react-native-paper': { TextInput: 'TextInput', HelperText: 'HelperText' },
    'react-native-google-places-autocomplete': { GooglePlacesAutocomplete: 'GooglePlacesAutocomplete' }, '@react-google-maps/api': {}, './types': { surfaceTokens: {} },
  };
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: name => mocks[name], process: { env: { EXPO_PUBLIC_IOS_PLACES: 'test' } }, console, __DEV__: false });
  mod.exports.default({ label: 'Address', value: '', onPlaceSelected() {} });
  assert.deepEqual(writes, []);
  mod.exports.default({ label: 'Address', value: '', onPlaceSelected() {}, onChangeText() {} });
  assert.deepEqual(writes, ['']);
});

test('invalid repeat range blocks submit and accepts a corrected end date', async () => {
  const h = createTestHarness();
  h.render(); await h.runEffects();
  let tree = h.render();
  h.find(tree, n => n.props?.children === 'Repeating').props.onPress();
  tree = h.render();
  h.find(tree, n => n.props?.label === 'Start date').props.onChangeText('2027-02-25');
  tree = h.render();
  h.find(tree, n => n.props?.label === 'End Date').props.onChangeText('2027-02-20');
  tree = h.render();
  h.find(tree, n => n.props?.children === 'Mon').props.onPress();
  tree = h.render();
  await h.find(tree, n => n.props?.children === 'Add Time Slot').props.onPress();
  tree = h.render();
  assert.ok(h.find(tree, n => n.props?.type === 'error' && n.props?.children === 'Repeat end must be on or after the start date'));
  assert.equal(h.getGuard().value.slotDraft.currentEntry.date, '2027-02-25');
  h.find(tree, n => n.props?.label === 'End Date').props.onChangeText('2027-03-20');
  tree = h.render();
  assert.equal(h.find(tree, n => n.props?.type === 'error' && n.props?.children === 'Repeat end must be on or after the start date'), null);
  await h.find(tree, n => n.props?.children === 'Add Time Slot').props.onPress();
  h.render();
  assert.equal(h.getGuard().value.slotDraft.currentEntry.date, '');
});
