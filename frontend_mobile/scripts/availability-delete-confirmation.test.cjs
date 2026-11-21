const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function getTs() {
  try {
    return require('typescript');
  } catch {
    const candidatePath = path.resolve(__dirname, '../node_modules/typescript');
    return require(candidatePath);
  }
}
const ts = getTs();

function createTestHarness(initialUser = { id: 7001, role: 'PHARMACIST' }, initialEntries = null) {
  let currentUser = initialUser;
  const deleteCalls = [];
  const fetchCalls = [];

  const defaultEntries = initialEntries ? [...initialEntries] : [
    {
      id: 702380,
      date: '2027-02-11',
      startTime: '06:17',
      endTime: '07:47',
      isAllDay: false,
      isRecurring: false,
    },
    {
      id: 701786,
      date: '2027-02-12',
      startTime: '09:00',
      endTime: '17:00',
      isAllDay: false,
      isRecurring: true,
      recurringDays: [1, 3],
      recurringEndDate: '2027-03-31',
    },
    {
      id: 701787,
      date: '2027-02-13',
      startTime: '08:00',
      endTime: '16:00',
      isAllDay: false,
      isRecurring: false,
    },
  ];

  let currentEntriesList = defaultEntries.map((e) => ({ ...e }));

  let deleteServiceImplementation = async (id) => {
    deleteCalls.push(id);
  };

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

  const unmount = () => {
    for (const [, cleanup] of effectCleanups.entries()) {
      if (typeof cleanup === 'function') {
        try { cleanup(); } catch {}
      }
    }
    effectCleanups.clear();
    effectPrevDeps.clear();
  };

  // Compile availabilityModel in VM with full environment
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
    console, Date, String, Number, Boolean, Array, Object, Set, Map, RegExp, Promise, Error, TypeError, RangeError, setTimeout, clearTimeout,
  });
  vm.runInContext(modelCompiled, modelContext);
  const availabilityModel = modelContext.module.exports;

  // Compile SetAvailabilityScreen in VM with faithful mocks
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
      fetchUserAvailabilityService: async () => {
        fetchCalls.push(Date.now());
        return currentEntriesList;
      },
      createUserAvailabilityService: async (payload) => payload,
      deleteUserAvailabilityService: async (id) => {
        return deleteServiceImplementation(id);
      },
      getOnboarding: async () => ({
        street_address: '123 Fake St',
        suburb: 'Melbourne',
        state: 'VIC',
        postcode: '3000',
      }),
      updateOnboardingForm: async () => ({}),
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
      useUnsavedChangesGuard: (value, options) => ({
        isDirty: false,
        markClean: () => {},
        discardChanges: async () => true,
        confirmDiscard: (action) => action(),
      }),
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

  const { SetAvailabilityInner, default: SetAvailabilityScreen, formatSlotEnAuDate } = screenContext.module.exports;

  const renderInner = () => {
    resetIndices();
    return SetAvailabilityInner();
  };

  const renderScreen = () => {
    return SetAvailabilityScreen();
  };

  const findConfirmDialog = (tree) => {
    let found = null;
    const walk = (node) => {
      if (!node || found) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (
        node.type === 'ConfirmDialog' ||
        node.type === mocks['@/components/ui'].ConfirmDialog ||
        node.props?.title === 'Delete availability slot?'
      ) {
        found = node;
        return;
      }
      if (node.props?.children) {
        walk(node.props.children);
      }
    };
    walk(tree);
    return found;
  };

  const findDeleteButtons = (tree) => {
    const buttons = [];
    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      const isDelete =
        (typeof node.props?.testID === 'string' && node.props.testID.startsWith('availability-slot-delete-')) ||
        (typeof node.props?.accessibilityLabel === 'string' &&
          (node.props.accessibilityLabel.startsWith('Delete slot') ||
           node.props.accessibilityLabel.startsWith('Delete repeating slot')));
      if (isDelete) {
        buttons.push(node);
      }
      if (node.props?.children) {
        walk(node.props.children);
      }
    };
    walk(tree);
    return buttons;
  };

  const getRenderedSlotIds = (tree) => {
    return findDeleteButtons(tree)
      .map((b) => {
        const match = (b.props?.testID || '').match(/availability-slot-delete-(\d+)/);
        return match ? Number(match[1]) : null;
      })
      .filter((id) => id !== null);
  };

  // Helper to mount and load initial rows through production fetch effect
  const mountWithLoadedRows = async () => {
    renderInner();
    await runEffects();
    return renderInner();
  };

  const getEntries = () => {
    const found = stateSlots.find((s) => Array.isArray(s) && s.some((item) => item && typeof item.id === 'number'));
    return found || stateSlots[1];
  };

  const setEntries = (entries) => {
    const idx = stateSlots.findIndex((s) => Array.isArray(s) && s.some((item) => item && typeof item.id === 'number'));
    if (idx !== -1) {
      stateSlots[idx] = entries;
    } else {
      stateSlots[1] = entries;
    }
  };

  return {
    renderInner,
    renderScreen,
    runEffects,
    unmount,
    mountWithLoadedRows,
    findConfirmDialog,
    findDeleteButtons,
    getRenderedSlotIds,
    deleteCalls,
    fetchCalls,
    formatSlotEnAuDate,
    setCurrentUser: (u) => { currentUser = u; },
    setDeleteService: (fn) => { deleteServiceImplementation = fn; },
    getEntries,
    setEntries,
    getController: () => stateSlots[0],
    stateSlots,
    defaultEntries,
  };
}

test('availability delete safety: request-before-confirm = 0', async () => {
  const harness = createTestHarness();
  const tree = await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(tree);
  assert.ok(buttons.length >= 2, 'Rendered availability slot list has delete buttons');

  const btn702380 = buttons.find((b) => b.props.testID === 'availability-slot-delete-702380' || b.props.accessibilityLabel.includes('2027-02-11'));
  assert.ok(btn702380, 'Found delete button for slot 702380');
  assert.equal(btn702380.props.testID, 'availability-slot-delete-702380');
  assert.match(btn702380.props.accessibilityLabel, /^Delete slot 2027-02-11/);

  // Click Delete button on slot 702380
  btn702380.props.onPress();

  // Re-render and check ConfirmDialog
  const updatedTree = harness.renderInner();
  const dialog = harness.findConfirmDialog(updatedTree);
  assert.ok(dialog, 'ConfirmDialog is rendered');
  assert.equal(dialog.props.open, true, 'ConfirmDialog is open after clicking Delete');
  assert.equal(dialog.props.confirmLabel, 'Delete this slot');
  assert.equal(dialog.props.confirmTestID, 'availability-delete-confirm');
  assert.equal(dialog.props.busyLabel, 'Deleting…');

  // Verify naming exact en-AU date, start/end/all-day
  assert.match(dialog.props.body, /11 Feb 2027/, 'ConfirmDialog body names exact en-AU date');
  assert.match(dialog.props.body, /06:17/, 'ConfirmDialog body names start time');
  assert.match(dialog.props.body, /07:47/, 'ConfirmDialog body names end time');

  // Verify request-before-confirm = 0
  assert.equal(harness.deleteCalls.length, 0, 'No delete API request issued before explicit confirmation');
});

test('availability delete safety: Cancel = 0 and preserves state', async () => {
  const harness = createTestHarness();
  const tree = await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(tree);
  const btn702380 = buttons.find((b) => b.props.testID === 'availability-slot-delete-702380' || b.props.accessibilityLabel.includes('2027-02-11'));
  assert.ok(btn702380);

  // Open confirmation
  btn702380.props.onPress();

  let dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);

  // Click Cancel
  dialog.props.onClose();

  // Re-render
  const afterCancelTree = harness.renderInner();
  dialog = harness.findConfirmDialog(afterCancelTree);
  assert.equal(dialog.props.open, false, 'ConfirmDialog closes on Cancel');

  // Assert Cancel = 0 delete requests
  assert.equal(harness.deleteCalls.length, 0, 'No delete API request issued when cancelled');

  // Assert all slots are preserved
  const entries = harness.getEntries();
  assert.equal(entries.length, 3, 'All availability slots remain in state');
  assert.ok(entries.some((e) => e.id === 702380), 'Target slot 702380 is preserved');
  assert.ok(entries.some((e) => e.id === 701786), 'Existing slot 701786 is preserved');
});

test('availability delete safety: explicit confirm deletes captured ID once', async () => {
  const harness = createTestHarness();
  const tree = await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(tree);
  const btn702380 = buttons.find((b) => b.props.testID === 'availability-slot-delete-702380' || b.props.accessibilityLabel.includes('2027-02-11'));
  btn702380.props.onPress();

  const dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);

  // Trigger explicit confirm
  await dialog.props.onConfirm();

  // Verify deleteService called once with exactly captured ID 702380
  assert.equal(harness.deleteCalls.length, 1, 'Delete API called exactly once');
  assert.equal(harness.deleteCalls[0], 702380, 'Delete API called for captured ID 702380, NOT existing 701786');

  // Re-render and verify state
  const postDeleteTree = harness.renderInner();
  const postDialog = harness.findConfirmDialog(postDeleteTree);
  assert.equal(postDialog.props.open, false, 'ConfirmDialog is closed after deletion');

  const entries = harness.getEntries();
  assert.equal(entries.some((e) => e.id === 702380), false, 'Slot 702380 removed from state');
  assert.equal(entries.some((e) => e.id === 701786), true, 'Existing slot 701786 remains untouched');
  assert.equal(entries.some((e) => e.id === 701787), true, 'Existing slot 701787 remains untouched');
});

test('availability delete safety: rerender/reordered rows cannot substitute ID', async () => {
  const harness = createTestHarness();
  const tree = await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(tree);
  const btn702380 = buttons.find((b) => b.props.testID === 'availability-slot-delete-702380' || b.props.accessibilityLabel.includes('2027-02-11'));
  // Capture 702380
  btn702380.props.onPress();

  // Re-order rows before confirm (move existing 701786 to index 0)
  const currentEntries = harness.getEntries();
  harness.setEntries([currentEntries[1], currentEntries[0], currentEntries[2]]);

  const dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);

  // Confirm delete
  await dialog.props.onConfirm();

  // Must delete captured ID 702380, NEVER 701786 at new index 0
  assert.equal(harness.deleteCalls.length, 1);
  assert.equal(harness.deleteCalls[0], 702380, 'Captured ID 702380 was deleted despite reordering');
  assert.notEqual(harness.deleteCalls[0], 701786, 'Row at index 0 (701786) was NOT deleted');

  // If captured target is entirely removed from current rows, confirm must abort with 0 delete calls
  const harness2 = createTestHarness();
  await harness2.mountWithLoadedRows();
  const btn2 = harness2.findDeleteButtons(harness2.renderInner())[0];
  btn2.props.onPress(); // captured 702380

  // Target removed from rows externally
  harness2.setEntries(harness2.getEntries().filter((e) => e.id !== 702380));

  const dialog2 = harness2.findConfirmDialog(harness2.renderInner());
  await dialog2.props.onConfirm();
  assert.equal(harness2.deleteCalls.length, 0, 'No delete executed when captured target is absent from rows');
});

test('availability delete safety: account change while confirmation open = 0 with controller generation mismatch proof', async () => {
  // Start with User 1: PHARMACIST (id: 7001)
  const harness1 = createTestHarness({ id: 7001, role: 'PHARMACIST' });
  await harness1.mountWithLoadedRows();

  // Open confirmation for slot 702380 under User 1
  const buttons1 = harness1.findDeleteButtons(harness1.renderInner());
  buttons1[0].props.onPress();

  const dialog1 = harness1.findConfirmDialog(harness1.renderInner());
  assert.equal(dialog1.props.open, true);

  // Capture generation and stale confirmation callback
  const capturedGeneration = harness1.getController().currentGeneration;
  const staleConfirm = dialog1.props.onConfirm;
  assert.equal(typeof staleConfirm, 'function');

  // Switch account: simulate keyed component unmount/invalidation
  harness1.unmount(); // Unmount old instance: triggers controller.invalidate() effect cleanup

  // Controller generation mismatch proof: generation has incremented upon unmount
  const currentGeneration = harness1.getController().currentGeneration;
  assert.notEqual(capturedGeneration, currentGeneration, 'Controller generation must differ after unmount/invalidation');
  assert.equal(currentGeneration, capturedGeneration + 1, 'Controller generation incremented by 1');

  // Mount new instance under canonical OTHER_STAFF
  const harness2 = createTestHarness({ id: 8002, role: 'OTHER_STAFF' });
  await harness2.mountWithLoadedRows();

  const dialog2 = harness2.findConfirmDialog(harness2.renderInner());
  assert.equal(dialog2.props.open, false, 'New account instance has no open confirmation');

  // Invoke the captured stale confirmation callback from previous account
  await staleConfirm();

  // Must issue 0 delete calls under either instance
  assert.equal(harness1.deleteCalls.length, 0, 'Stale confirmation from old account issues 0 delete calls');
  assert.equal(harness1.getEntries().length, 3, 'Original rows preserved');
});

test('availability delete safety: repeated confirm calls result in at most one captured-ID write', async () => {
  const harness = createTestHarness();
  await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(harness.renderInner());
  const btn702380 = buttons.find((b) => b.props.testID === 'availability-slot-delete-702380' || b.props.accessibilityLabel.includes('2027-02-11'));
  btn702380.props.onPress();

  const dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);

  // Fire confirm repeatedly (concurrent double-tap)
  const p1 = dialog.props.onConfirm();
  const p2 = dialog.props.onConfirm();
  await Promise.all([p1, p2]);

  // Attempt another confirm with the stale dialog callback after completion
  await dialog.props.onConfirm();

  // Exactly one captured-ID write must have occurred
  assert.equal(harness.deleteCalls.length, 1, 'At most one delete API call is executed');
  assert.equal(harness.deleteCalls[0], 702380, 'Delete API called only for captured ID 702380');

  // Other rows remain intact
  const entries = harness.getEntries();
  assert.equal(entries.some((e) => e.id === 701786), true, 'Existing slot 701786 remains untouched');
  assert.equal(entries.some((e) => e.id === 701787), true, 'Existing slot 701787 remains untouched');
});

test('availability delete safety: failure triggers reload + closed dialog + released mutex and preserves other rows', async () => {
  const harness = createTestHarness();
  await harness.mountWithLoadedRows();

  const initialFetchCount = harness.fetchCalls.length;

  // Configure delete service to reject
  harness.setDeleteService(async () => {
    throw new Error('Network request failed');
  });

  const buttons = harness.findDeleteButtons(harness.renderInner());
  const btn702380 = buttons.find((b) => b.props.testID === 'availability-slot-delete-702380');
  assert.ok(btn702380);

  // Open confirmation
  btn702380.props.onPress();

  const dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);

  // Confirm delete (which rejects in service)
  await dialog.props.onConfirm();

  // Re-render and run effects (which should trigger fetch due to availabilityReloadKey increment)
  const postFailTree = harness.renderInner();
  const postFailDialog = harness.findConfirmDialog(postFailTree);
  assert.equal(postFailDialog.props.open, false, 'Dialog is closed after failure');

  await harness.runEffects();
  assert.ok(harness.fetchCalls.length > initialFetchCount, 'Authoritative reload was triggered on error');

  // Mutex is released: user can open confirmation again
  const postFailButtons = harness.findDeleteButtons(harness.renderInner());
  const btnRetry = postFailButtons.find((b) => b.props.testID === 'availability-slot-delete-702380');
  assert.ok(btnRetry);
  btnRetry.props.onPress();

  const retryDialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(retryDialog.props.open, true, 'Can open confirmation dialog again because mutex was released in finally');

  // Other rows remain preserved
  const entries = harness.getEntries();
  assert.ok(entries.some((e) => e.id === 701786), 'Existing slot 701786 remains untouched');
  assert.ok(entries.some((e) => e.id === 701787), 'Existing slot 701787 remains untouched');
});

test('availability delete safety: in-flight delete then unmount/account switch has no stale UI success/error', async () => {
  const harness = createTestHarness();
  await harness.mountWithLoadedRows();

  let resolveDelete;
  harness.setDeleteService(() => new Promise((resolve) => {
    resolveDelete = resolve;
  }));

  const buttons = harness.findDeleteButtons(harness.renderInner());
  buttons[0].props.onPress();

  const dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);

  // Start in-flight delete
  const inFlightPromise = dialog.props.onConfirm();

  // Switch account / unmount while in flight
  harness.unmount();

  // Controller generation has incremented
  const currentGen = harness.getController().currentGeneration;
  assert.ok(currentGen > 0, 'Generation incremented on unmount');

  // Complete delete service
  resolveDelete();
  await inFlightPromise;

  // Stale account state remains intact
  const entries = harness.getEntries();
  assert.equal(entries.length, 3, 'Rows were not mutated for stale account');
});

test('availability delete safety: row Delete buttons are disabled while confirmation is open', async () => {
  const harness = createTestHarness();
  const tree = await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(tree);
  assert.ok(buttons.length >= 3);
  for (const btn of buttons) {
    assert.equal(Boolean(btn.props.disabled), false, 'Row buttons enabled before opening dialog');
  }

  // Open confirmation on first row
  buttons[0].props.onPress();

  // Re-render
  const treeWithDialog = harness.renderInner();
  const buttonsWithDialog = harness.findDeleteButtons(treeWithDialog);
  assert.ok(buttonsWithDialog.length >= 3);
  for (const btn of buttonsWithDialog) {
    assert.equal(btn.props.disabled, true, 'All row delete buttons are disabled while confirmation is open');
  }

  // Cancel dialog
  const dialog = harness.findConfirmDialog(treeWithDialog);
  dialog.props.onClose();

  // Re-render after cancel
  const treeAfterCancel = harness.renderInner();
  const buttonsAfterCancel = harness.findDeleteButtons(treeAfterCancel);
  for (const btn of buttonsAfterCancel) {
    assert.equal(Boolean(btn.props.disabled), false, 'Row delete buttons re-enabled after closing dialog');
  }
});

test('availability delete safety: recurring slot 701786 dialog body includes repeat wording', async () => {
  const harness = createTestHarness();
  const tree = await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(tree);
  const btnRecurring = buttons.find((b) => b.props.testID === 'availability-slot-delete-701786');
  assert.ok(btnRecurring, 'Found recurring slot 701786');
  assert.match(btnRecurring.props.accessibilityLabel, /^Delete repeating slot/, 'Recurring slot has repeating in accessibilityLabel');

  // Open confirmation
  btnRecurring.props.onPress();

  const dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);
  assert.match(dialog.props.body, /Repeats on Mon, Wed/, 'Dialog body names recurring days');
  assert.match(dialog.props.body, /until Wed, 31 Mar 2027/, 'Dialog body names recurring end date');
});

test('availability delete safety: two identical date/time rows have distinct testIDs and captured IDs', async () => {
  const identicalRows = [
    {
      id: 9001,
      date: '2027-05-01',
      startTime: '09:00',
      endTime: '17:00',
      isAllDay: false,
      isRecurring: false,
    },
    {
      id: 9002,
      date: '2027-05-01',
      startTime: '09:00',
      endTime: '17:00',
      isAllDay: false,
      isRecurring: false,
    },
  ];

  const harness = createTestHarness({ id: 7001, role: 'PHARMACIST' }, identicalRows);
  const tree = await harness.mountWithLoadedRows();

  const buttons = harness.findDeleteButtons(tree);
  assert.equal(buttons.length, 2);

  const btn1 = buttons.find((b) => b.props.testID === 'availability-slot-delete-9001');
  const btn2 = buttons.find((b) => b.props.testID === 'availability-slot-delete-9002');
  assert.ok(btn1, 'Row 9001 has unique testID');
  assert.ok(btn2, 'Row 9002 has unique testID');
  assert.notEqual(btn1.props.testID, btn2.props.testID, 'Buttons have distinct testIDs');

  // Delete row 9001
  btn1.props.onPress();
  const dialog = harness.findConfirmDialog(harness.renderInner());
  await dialog.props.onConfirm();

  // Exactly row 9001 deleted
  assert.equal(harness.deleteCalls.length, 1);
  assert.equal(harness.deleteCalls[0], 9001);

  // Row 9002 preserved
  const entries = harness.getEntries();
  assert.equal(entries.some((e) => e.id === 9001), false, 'Slot 9001 removed');
  assert.equal(entries.some((e) => e.id === 9002), true, 'Slot 9002 preserved');
});

test('availability delete safety: repeated confirm after rejection causes no duplicate request, but newly opened confirmation can retry', async () => {
  const harness = createTestHarness();
  await harness.mountWithLoadedRows();

  let callCount = 0;
  harness.setDeleteService(async (id) => {
    callCount++;
    if (callCount === 1) {
      throw new Error('Server 500 error');
    }
    harness.deleteCalls.push(id);
  });

  const buttons = harness.findDeleteButtons(harness.renderInner());
  const btn702380 = buttons.find((b) => b.props.testID === 'availability-slot-delete-702380');
  btn702380.props.onPress();

  const dialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);

  // First confirm attempt: rejects in service
  await dialog.props.onConfirm();
  assert.equal(callCount, 1, 'First attempt invoked service once');

  // Repeated confirm on the OLD dialog token must be ignored
  await dialog.props.onConfirm();
  assert.equal(callCount, 1, 'Repeated confirm with consumed token issues no duplicate request');

  // Now user clicks Delete on row again to open a fresh confirmation
  const postFailTree = harness.renderInner();
  const retryBtn = harness.findDeleteButtons(postFailTree).find((b) => b.props.testID === 'availability-slot-delete-702380');
  retryBtn.props.onPress();

  const retryDialog = harness.findConfirmDialog(harness.renderInner());
  assert.equal(retryDialog.props.open, true);

  // Confirming the new dialog can retry successfully
  await retryDialog.props.onConfirm();
  assert.equal(callCount, 2, 'New confirmation successfully retries');
  assert.equal(harness.deleteCalls.length, 1);
  assert.equal(harness.deleteCalls[0], 702380, 'Captured slot 702380 deleted on retry');
});
