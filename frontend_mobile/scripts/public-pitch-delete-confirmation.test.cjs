const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function getTs() {
  const probePaths = [
    path.resolve(__dirname, '../node_modules/typescript'),
    path.resolve(__dirname, '../node_modules/typescript'),
    path.resolve(__dirname, '../node_modules/typescript'),
  ];
  for (const p of probePaths) {
    if (fs.existsSync(p)) return require(p);
  }
  return require('typescript');
}
const ts = getTs();

function createPitchHarness(initialUser = { id: 7001, role: 'PHARMACIST' }, initialPost = { id: 700048, referenceCode: 'REF-700048', headline: 'Pharmacist available', authorUserId: 7001 }) {
  let currentUser = initialUser;
  let alertButtons = null;
  let preventRemove = null;
  let currentPost = initialPost ? { ...initialPost } : null;
  const deleteCalls = [];
  const reloadCalls = [];
  const updatePostCalls = [];
  const createPostCalls = [];
  const onboardingUpdateCalls = [];
  let onboardingImplementation = async () => ({ skills: [], verified: true });
  let availabilityImplementation = async () => [];
  const focusCallbacks = [];
  let focusIndex = 0;
  let eligibilityHook;

  let deleteServiceImplementation = async (id) => {
    deleteCalls.push(id);
  };
  let reloadServiceImplementation = async () => {
    reloadCalls.push(Date.now());
  };
  let getMineServiceImplementation = async () => currentPost;
  let updatePostImplementation = async (id, payload) => {
    updatePostCalls.push({ id, payload });
    return payload;
  };
  let createPostImplementation = async (payload) => {
    createPostCalls.push(payload);
    return { id: 700099, ...payload };
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
    focusIndex = 0;
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
    useContext: () => ({ user: currentUser }),
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

  const mocks = {
    react,
    'react-native': {
      Alert: { alert: (_title, _message, buttons) => { alertButtons = buttons; } },
      Platform: { OS: 'ios' },
      ScrollView: (props) => props,
      StyleSheet: { create: (s) => s },
      TouchableOpacity: (props) => props,
      View: (props) => props,
      RefreshControl: (props) => props,
    },
    'react-native-safe-area-context': {
      SafeAreaView: (props) => props,
    },
    'react-native-paper': {
      Button: (props) => ({ type: 'Button', props }),
      Checkbox: (props) => props,
      Chip: (props) => props,
      IconButton: (props) => props,
      Menu: (props) => props,
      Modal: (props) => ({ type: 'Modal', props }),
      Portal: (props) => ({ type: 'Portal', props }),
      SegmentedButtons: (props) => props,
      Text: (props) => props,
      TextInput: (props) => props,
    },
    'expo-router': {
      useIsFocused: () => true,
      useFocusEffect: (callback) => { focusCallbacks[focusIndex++] = callback; },
      useRouter: () => ({ push: () => {}, replace: () => {} }),
    },
    '@/context/AuthContext': {
      useAuth: () => ({ user: currentUser }),
    },
    '@/components/security/GuardedModal': {
      GuardedDatePickerModal: () => null,
      GuardedModal: () => null,
    },
    '@/components/ui/BrandLoader': { BrandLoader: () => null },
    '@/components/ui/ResponsiveSegmentedButtons': { ResponsiveSegmentedButtons: 'ResponsiveSegmentedButtons' },
    '@/components/ui/ConfirmDialog': {
      ConfirmDialog: (props) => ({ type: 'ConfirmDialog', props }),
    },
    '@chemisttasker/shared-core': {
      projectTalentSkills: () => ({ clinicalServices: [], dispenseSoftware: [], expandedScope: [], skills: [] }),
      resolveTalentBookingRole: () => 'PHARMACIST',
      newcomerTypeLabel: () => 'New to pharmacy',
      createExplorerPost: async (payload) => createPostImplementation(payload),
      updateExplorerPost: async (id, payload) => updatePostImplementation(id, payload),
      deleteExplorerPost: async (id) => deleteServiceImplementation(id),
      fetchUserAvailabilityService: async () => availabilityImplementation(),
      getExplorerPostForEditing: async () => getMineServiceImplementation(),
      getOnboarding: async (role) => onboardingImplementation(role),
      getRatingsSummary: async () => ({ average: 0, count: 0 }),
      likeExplorerPost: async () => {},
      unlikeExplorerPost: async () => {},
      updateOnboardingForm: async (role, form) => { onboardingUpdateCalls.push({ role, values: Object.fromEntries(form._entries) }); },
      skills_registry: {},
    },
    '@chemisttasker/shared-core/skills_registry.json': {},
    './constants': { ENGAGEMENT_LABELS: {} },
    '../skills/VerificationBadges': { BadgeGuideButton: () => null },
    './components/AvailabilitySidebar': () => null,
    './components/FiltersSidebar': () => null,
    './components/TalentCardV2': () => null,
    './useTalentFeed': {
      useTalentFeed: () => ({
        posts: currentPost ? [currentPost] : [],
        loading: false,
        error: null,
        reload: async () => reloadServiceImplementation(),
      }),
    },
    './useTalentFilters': {
      useTalentFilters: () => ({
        filtered: [],
        roleOptions: [],
        stateOptions: [],
        roleSkillOptions: {},
        softwareOptions: [],
      }),
    },
    './publicAvailabilityEligibility': {
      usePublicAvailabilityEligibility: (user) => eligibilityHook ? eligibilityHook(user) : ({
        status: 'verified',
        staffPublicAccess: true,
        error: null,
        retry: () => {},
        isTalentStaff: true,
      }),
    },
  };

  mocks['expo-router/react-navigation'] = { usePreventRemove: (enabled, callback) => { preventRemove = enabled ? callback : null; } };
  mocks['./UnsavedChangesDialogProvider'] = { useUnsavedChangesDialog: () => null };
  mocks['./UnsavedChangesRegistryProvider'] = { useUnsavedChangesRegistry: () => null };
  const guardPath = path.resolve(__dirname, '../roles/shared/forms/useUnsavedChangesGuard.ts');
  const guardCompiled = ts.transpileModule(fs.readFileSync(guardPath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const guardModule = { exports: {} };
  vm.runInNewContext(guardCompiled, { module: guardModule, exports: guardModule.exports, require: (name) => mocks[name], JSON, Object, Array, Date, Promise });
  mocks['../forms/useUnsavedChangesGuard'] = guardModule.exports;

  // Compile candidate PitchDialog
  const dialogPath = path.resolve(__dirname, '../roles/shared/talent-board/components/PitchDialog.tsx');
  const dialogSource = fs.readFileSync(dialogPath, 'utf8');
  const dialogCompiled = ts.transpileModule(dialogSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const dialogExports = {};
  const dialogModule = { exports: dialogExports };
  const customRequire = (spec) => mocks[spec] || require(spec);

  class MockFormData {
    constructor() { this._entries = []; }
    append(key, val) { this._entries.push([key, val]); }
  }
  const FormDataClass = MockFormData;

  const dialogContext = vm.createContext({
    __DEV__: true,
    process: { env: { NODE_ENV: 'test' } },
    module: dialogModule,
    exports: dialogExports,
    require: customRequire,
    FormData: FormDataClass,
    console, Date, String, Number, Boolean, Array, Object, Set, Map, RegExp, Promise, Error, TypeError, RangeError, setTimeout, clearTimeout,
  });
  vm.runInContext(dialogCompiled, dialogContext);
  const PitchDialogComponent = dialogContext.module.exports.default || dialogContext.module.exports;
  mocks['./components/PitchDialog'] = { default: PitchDialogComponent, PitchFormState: {} };

  // Compile candidate index.tsx
  const indexPath = path.resolve(__dirname, '../roles/shared/talent-board/index.tsx');
  const indexSource = fs.readFileSync(indexPath, 'utf8');
  const indexCompiled = ts.transpileModule(indexSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;
  const indexExports = {};
  const indexModule = { exports: indexExports };

  const indexContext = vm.createContext({
    __DEV__: true,
    process: { env: { NODE_ENV: 'test' } },
    module: indexModule,
    exports: indexExports,
    require: customRequire,
    FormData: FormDataClass,
    console, Date, String, Number, Boolean, Array, Object, Set, Map, RegExp, Promise, Error, TypeError, RangeError, setTimeout, clearTimeout,
  });
  vm.runInContext(indexCompiled, indexContext);
  const { TalentBoardInner, default: TalentBoardScreen } = indexContext.module.exports;

  const renderInner = () => {
    resetIndices();
    return TalentBoardInner({ openPitchOnMount: true });
  };

  const mountWithPitch = async () => {
    resetIndices();
    TalentBoardInner({ openPitchOnMount: true });
    await runEffects();
    resetIndices();
    TalentBoardInner({ openPitchOnMount: true });
    await runEffects();
    resetIndices();
    return TalentBoardInner({ openPitchOnMount: true });
  };

  const walkTree = (node, predicate) => {
    if (!node) return null;
    if (predicate(node)) return node;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = walkTree(child, predicate);
        if (found) return found;
      }
      return null;
    }
    if (node.props?.children) {
      return walkTree(node.props.children, predicate);
    }
    return null;
  };

  const findPitchDialog = (tree) => {
    return walkTree(tree, (n) => n?.props?.onRequestDelete !== undefined || n?.props?.pitchForm !== undefined);
  };

  const renderPitchDialogDirect = (props) => {
    resetIndices();
    return PitchDialogComponent(props);
  };

  const findConfirmDialog = (tree) => {
    return walkTree(tree, (n) => n.type === 'ConfirmDialog' || n.type === mocks['@/components/ui/ConfirmDialog'].ConfirmDialog || n.props?.confirmTestID === 'pitch-delete-confirm');
  };

  const findDeleteRequestButton = (tree, id) => {
    return walkTree(tree, (n) => n.props?.testID === `pitch-delete-request-${id}`);
  };

  return {
    renderInner,
    mountWithPitch,
    renderPitchDialogDirect,
    brandLoader: mocks['@/components/ui/BrandLoader'].BrandLoader,
    walkTree,
    runEffects,
    focus: () => { for (const callback of focusCallbacks) callback(); },
    useRealEligibility: () => {
      const policyModule = { exports: {} };
      const policySource = fs.readFileSync(path.resolve(__dirname, '../../shared-core/src/talent.ts'), 'utf8');
      vm.runInNewContext(ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
        { exports: policyModule.exports, require: () => ({}) });
      mocks['@chemisttasker/shared-core'].canPublishTalent = policyModule.exports.canPublishTalent;
      const eligibilityModule = { exports: {} };
      const eligibilitySource = fs.readFileSync(path.resolve(__dirname, '../roles/shared/talent-board/publicAvailabilityEligibility.ts'), 'utf8');
      vm.runInNewContext(ts.transpileModule(eligibilitySource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
        { exports: eligibilityModule.exports, require: customRequire });
      eligibilityHook = eligibilityModule.exports.usePublicAvailabilityEligibility;
    },
    unmount,
    findPitchDialog,
    deleteCalls,
    reloadCalls,
    updatePostCalls,
    createPostCalls,
    onboardingUpdateCalls,
    setOnboardingService: (fn) => { onboardingImplementation = fn; },
    changeEditorPost: (newPost) => {
      currentPost = newPost;
      stateSlots[12] = newPost ? newPost.id : null;
      stateSlots[13] = newPost ? (newPost.referenceCode || `REF-${newPost.id}`) : null;
    },
    setCurrentUser: (u) => { currentUser = u; },
    setCurrentPost: (p) => { currentPost = p; },
    setDeleteService: (fn) => { deleteServiceImplementation = fn; },
    setReloadService: (fn) => { reloadServiceImplementation = fn; },
    setGetMineService: (fn) => { getMineServiceImplementation = fn; },
    setUpdatePostService: (fn) => { updatePostImplementation = fn; },
    setCreatePostService: (fn) => { createPostImplementation = fn; },
    setAvailabilityService: (fn) => { availabilityImplementation = fn; },
    getAlertButtons: () => alertButtons,
    getPreventRemove: () => preventRemove,
  };
}

for (const role of ['PHARMACIST', 'OTHER_STAFF']) {
  test(`${role}: private notes are excluded while authored public notes are submitted`, async () => {
    const harness = createPitchHarness({ id: 7001, role }, null);
    harness.setAvailabilityService(async () => [{ date: '2099-01-01', startTime: '09:00', endTime: '17:00', notes: 'private secret' }]);
    let dialog = harness.findPitchDialog(await harness.mountWithPitch());
    assert.equal(dialog.props.pitchForm.availabilitySlots[0].notes, '');
    dialog.props.setPitchForm((prev) => ({ ...prev, availabilitySlots: [...prev.availabilitySlots, { date: '2099-01-02', startTime: '09:00', endTime: '17:00', isAllDay: false, notes: 'Public note' }] }));
    dialog = harness.findPitchDialog(harness.renderInner());
    await dialog.props.onSave();
    const days = harness.createPostCalls[0].availability_days;
    assert.equal(days[0].notes, '');
    assert.equal(days[1].notes, 'Public note');
    assert.equal(JSON.stringify(harness.createPostCalls[0]).includes('private secret'), false);
  });
  test(`${role}: saved availability notes survive loading and submission`, async () => {
    const post = { id: 7, authorUserId: 7001, headline: 'Available', postKind: 'AVAILABILITY', availabilityDays: [{ date: '2099-01-01', startTime: '09:00', endTime: '17:00', notes: 'After school' }] };
    const harness = createPitchHarness({ id: 7001, role }, post);
    let dialog = harness.findPitchDialog(await harness.mountWithPitch());
    assert.equal(dialog.props.pitchForm.availabilitySlots[0].notes, 'After school');
    await dialog.props.onSave();
    assert.equal(harness.updatePostCalls[0].payload.availability_days[0].notes, 'After school');
  });
}

test('failed pitch save keeps draft through Keep editing and discards only on confirmation', async () => {
  const harness = createPitchHarness();
  await harness.mountWithPitch();
  await harness.runEffects();
  let dialog = harness.findPitchDialog(harness.renderInner());
  dialog.props.setPitchForm((prev) => ({ ...prev, headline: 'Unsaved draft' }));
  dialog = harness.findPitchDialog(harness.renderInner());
  harness.setUpdatePostService(async () => { throw new Error('offline'); });
  await dialog.props.onSave();
  dialog = harness.findPitchDialog(harness.renderInner());
  dialog.props.onClose();
  harness.getAlertButtons().find((button) => button.text === 'Keep editing').onPress();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  dialog = harness.findPitchDialog(harness.renderInner());
  assert.equal(dialog.props.open, true);
  assert.equal(dialog.props.pitchForm.headline, 'Unsaved draft');
  dialog.props.onClose();
  harness.getAlertButtons().find((button) => button.text === 'Discard').onPress();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  dialog = harness.findPitchDialog(harness.renderInner());
  assert.equal(dialog.props.open, false);
});

test('dirty pitch blocks navigation and Keep editing retains draft', async () => {
  const harness = createPitchHarness();
  await harness.mountWithPitch();
  await harness.runEffects();
  let dialog = harness.findPitchDialog(harness.renderInner());
  dialog.props.setPitchForm((prev) => ({ ...prev, headline: 'Unsaved navigation draft' }));
  harness.renderInner();
  let repeated = false;
  harness.getPreventRemove()({ repeat: () => { repeated = true; } });
  harness.getAlertButtons().find((button) => button.text === 'Keep editing').onPress();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  dialog = harness.findPitchDialog(harness.renderInner());
  assert.equal(repeated, false);
  assert.equal(dialog.props.pitchForm.headline, 'Unsaved navigation draft');
});

test('unfinished slot blocks submit until explicitly cleared', () => {
  const harness = createPitchHarness();
  let saves = 0;
  const props = { open: true, isExplorer: false, existingPostId: null, pitchForm: { headline: '', body: '', postKind: 'AVAILABILITY', workTypes: [], travelStates: [], availabilitySlots: [] }, setPitchForm: () => {}, pitchError: null, pitchSaving: false, onClose: () => {}, onSave: () => { saves++; } };
  let tree = harness.renderPitchDialogDirect(props);
  harness.walkTree(tree, (n) => Array.isArray(n.props?.buttons) && n.props.buttons.some((b) => b.label === 'Availability')).props.onValueChange('2');
  tree = harness.renderPitchDialogDirect(props);
  assert.ok(harness.walkTree(tree, (n) => n.props?.children === 'Notes added here are public and visible on your pitch.'));
  harness.walkTree(tree, (n) => n.props?.label === 'Notes').props.onChangeText('Unadded note');
  tree = harness.renderPitchDialogDirect(props);
  harness.walkTree(tree, (n) => n.props?.children === 'Post Availability').props.onPress();
  tree = harness.renderPitchDialogDirect(props);
  assert.equal(saves, 0);
  assert.ok(harness.walkTree(tree, (n) => n.props?.children === 'Add this time slot or clear its details before saving.'));
  harness.walkTree(tree, (n) => n.props?.children === 'Clear unfinished time slot').props.onPress();
  tree = harness.renderPitchDialogDirect(props);
  harness.walkTree(tree, (n) => n.props?.children === 'Post Availability').props.onPress();
  assert.equal(saves, 1);
});

test('pending save rejects late form edits synchronously', async () => {
  const harness = createPitchHarness();
  let dialog = harness.findPitchDialog(await harness.mountWithPitch());
  let resolveUpdate;
  harness.setUpdatePostService(() => new Promise((resolve) => { resolveUpdate = resolve; }));
  const saving = dialog.props.onSave();
  for (let i = 0; i < 20 && !resolveUpdate; i++) await Promise.resolve();
  assert.ok(resolveUpdate);
  dialog.props.setPitchForm((prev) => ({ ...prev, headline: 'Late edit' }));
  dialog = harness.findPitchDialog(harness.renderInner());
  assert.notEqual(dialog.props.pitchForm.headline, 'Late edit');
  assert.equal(dialog.props.pitchSaving, true);
  resolveUpdate({});
  await saving;
});

test('retained close callback cannot dismiss a pending save', async () => {
  const harness = createPitchHarness();
  const dialog = harness.findPitchDialog(await harness.mountWithPitch());
  const closeBeforeSave = dialog.props.onClose;
  let resolveUpdate;
  harness.setUpdatePostService(() => new Promise((resolve) => { resolveUpdate = resolve; }));
  const saving = dialog.props.onSave();
  for (let i = 0; i < 20 && !resolveUpdate; i++) await Promise.resolve();
  assert.ok(resolveUpdate);
  closeBeforeSave();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(harness.findPitchDialog(harness.renderInner()).props.open, true);
  resolveUpdate({});
  await saving;
});

test('pending save rejects captured slot text and date picker callbacks', async () => {
  const parent = createPitchHarness();
  const dialog = parent.findPitchDialog(await parent.mountWithPitch());
  const child = createPitchHarness();
  let tree = child.renderPitchDialogDirect(dialog.props);
  child.walkTree(tree, (n) => Array.isArray(n.props?.buttons) && n.props.buttons.some((b) => b.label === 'Availability')).props.onValueChange('2');
  tree = child.renderPitchDialogDirect(dialog.props);
  const onNotes = child.walkTree(tree, (n) => n.props?.label === 'Notes').props.onChangeText;
  const onDate = child.walkTree(tree, (n) => n.props?.mode === 'single' && typeof n.props?.onConfirm === 'function').props.onConfirm;
  let resolveUpdate;
  parent.setUpdatePostService(() => new Promise((resolve) => { resolveUpdate = resolve; }));
  const saving = dialog.props.onSave();
  for (let i = 0; i < 20 && !resolveUpdate; i++) await Promise.resolve();
  assert.ok(resolveUpdate);
  onNotes('Late note');
  onDate({ date: new Date(2099, 0, 2) });
  tree = child.renderPitchDialogDirect(dialog.props);
  assert.equal(child.walkTree(tree, (n) => n.props?.label === 'Notes').props.value, '');
  assert.notEqual(child.walkTree(tree, (n) => n.props?.mode === 'single' && typeof n.props?.onConfirm === 'function').props.date.getFullYear(), 2099);
  resolveUpdate({});
  await saving;
});

test('pitch delete safety: PitchDialog renders button with testID pitch-delete-request-ID and ConfirmDialog with pitch-delete-confirm', () => {
  const harness = createPitchHarness();
  const directTree = harness.renderPitchDialogDirect({
    open: true,
    isExplorer: false,
    existingPostId: 700048,
    existingReferenceCode: 'REF-700048',
    pitchForm: { headline: 'Pharmacist available', availabilitySlots: [] },
    setPitchForm: () => {},
    pitchError: null,
    pitchSaving: false,
    deleteConfirmOpen: true,
    deleteBusy: false,
    capturedPostId: 700048,
    capturedReferenceCode: 'REF-700048',
    capturedHeadline: 'Pharmacist available',
    onRequestDelete: () => {},
    onConfirmDelete: () => {},
    onCancelDelete: () => {},
    onClose: () => {},
    onSave: () => {},
  });

  const reqBtn = harness.walkTree(directTree, (n) => n?.props?.testID === 'pitch-delete-request-700048');
  assert.ok(reqBtn, 'PitchDialog renders button with testID pitch-delete-request-700048');
  assert.equal(reqBtn.props.accessibilityLabel, 'Delete pitch 700048');

  const confirmDialog = harness.walkTree(directTree, (n) => n?.props?.confirmTestID === 'pitch-delete-confirm');
  assert.ok(confirmDialog, 'PitchDialog renders ConfirmDialog with confirmTestID pitch-delete-confirm');
  assert.equal(confirmDialog.props.open, true);
  assert.equal(confirmDialog.props.confirmLabel, 'Delete this pitch');
  assert.match(confirmDialog.props.body, /700048/);
});

test('pitch delete safety: request does 0 delete calls, and Cancel does 0 delete calls', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  assert.ok(pitchDialog, 'PitchDialog mounted with props');
  assert.equal(pitchDialog.props.existingPostId, 700048);
  assert.equal(pitchDialog.props.deleteConfirmOpen, false);

  // User taps Delete Pitch
  pitchDialog.props.onRequestDelete();
  assert.equal(harness.deleteCalls.length, 0, 'Clicking Delete Pitch issues 0 delete calls');

  // Next render: confirm dialog is open with captured details
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, true, 'Confirm dialog is open');
  assert.equal(pitchDialog.props.capturedPostId, 700048, 'Names exact captured post ID');
  assert.equal(pitchDialog.props.capturedHeadline, 'Pharmacist available', 'Names headline');

  // User taps Cancel
  pitchDialog.props.onCancelDelete();
  assert.equal(harness.deleteCalls.length, 0, 'Cancelling deletion issues 0 delete calls');

  // Next render: confirm dialog closed
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, false, 'Confirm dialog closed after Cancel');
});

test('pitch delete safety: explicit confirm deletes exact captured ID once', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, true);

  await pitchDialog.props.onConfirmDelete();

  assert.equal(harness.deleteCalls.length, 1, 'Delete called exactly once');
  assert.equal(harness.deleteCalls[0], 700048, 'Deleted exact captured post ID 700048');
  assert.ok(harness.reloadCalls.length >= 1, 'Authoritative feed reload called');

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, false, 'Confirmation closed after success');
  assert.equal(pitchDialog.props.existingPostId, null, 'Post ID cleared after deletion');
});

test('pitch delete safety: same-tick double confirm executes delete at most once', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  // Synchronous double confirm invocation
  const p1 = pitchDialog.props.onConfirmDelete();
  const p2 = pitchDialog.props.onConfirmDelete();
  await Promise.all([p1, p2]);

  assert.equal(harness.deleteCalls.length, 1, 'Double confirmation executed delete at most once due to mutex');
});

test('pitch delete safety: post change while confirmation open refuses substitution', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.capturedPostId, 700048);

  // Retain old confirmation callback
  const oldConfirm = pitchDialog.props.onConfirmDelete;

  // Actual editor post selection change: existing post replaced with 700051
  harness.changeEditorPost({ id: 700051, referenceCode: 'REF-700051', headline: 'New post', authorUserId: 7001 });
  tree = harness.renderInner();
  await harness.runEffects();

  // Invoke retained old confirm callback
  await oldConfirm();
  assert.equal(harness.deleteCalls.length, 0, 'Post change prevented deletion of substituted post');
});

test('pitch delete safety: account switch while confirmation open issues 0 requests', async () => {
  const harness = createPitchHarness({ id: 7001, role: 'PHARMACIST' });
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  // Retain old confirmation callback
  const oldConfirm = pitchDialog.props.onConfirmDelete;

  // Account switch occurs while confirmation was open
  harness.setCurrentUser({ id: 7002, role: 'PHARMACIST' });
  tree = harness.renderInner();
  await harness.runEffects();

  // Invoke retained old confirm callback
  await oldConfirm();
  assert.equal(harness.deleteCalls.length, 0, 'Account switch prevented deletion');
});

test('pitch delete safety: Cancel then late invocation of old confirm callback issues 0 requests', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, true);

  // Retain old confirmation callback
  const oldConfirm = pitchDialog.props.onConfirmDelete;

  // User taps Cancel
  pitchDialog.props.onCancelDelete();
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, false);

  // Late invocation of retained old confirm callback
  await oldConfirm();
  assert.equal(harness.deleteCalls.length, 0, 'Late confirm callback after Cancel issues 0 requests');
});

test('pitch delete safety: unmount then late invocation of old confirm callback issues 0 requests and no UI updates', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  const oldConfirm = pitchDialog.props.onConfirmDelete;

  // Component unmounts
  harness.unmount();

  // Late invocation after unmount
  await oldConfirm();
  assert.equal(harness.deleteCalls.length, 0, 'Late confirm callback after unmount issues 0 requests');
});

test('pitch delete safety: failure triggers reload, releases mutex, and does not blindly resubmit', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let callCount = 0;
  harness.setDeleteService(async (id) => {
    callCount++;
    if (callCount === 1) throw new Error('Network failure');
    harness.deleteCalls.push(id);
  });

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  // Attempt 1 fails
  await pitchDialog.props.onConfirmDelete();
  assert.equal(callCount, 1, 'First attempt failed');
  assert.ok(harness.reloadCalls.length >= 1, 'Authoritative reload called on failure');

  // Blind resubmit of consumed token does nothing
  await pitchDialog.props.onConfirmDelete();
  assert.equal(callCount, 1, 'Consumed token prevented blind resubmit');

  // Fresh user request minted
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  await pitchDialog.props.onConfirmDelete();

  assert.equal(callCount, 2, 'Fresh confirmation successfully retries');
  assert.equal(harness.deleteCalls.length, 1);
  assert.equal(harness.deleteCalls[0], 700048);
});

test('pitch delete safety: auth user object refresh while delete pending keeps mutex/disabled and no 2nd delete/update', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let resolveDelete;
  const deletePromise = new Promise((resolve) => {
    resolveDelete = resolve;
  });
  harness.setDeleteService(async (id) => {
    harness.deleteCalls.push(id);
    await deletePromise;
  });

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  // In-flight delete begins
  const confirmPromise = pitchDialog.props.onConfirmDelete();

  // Auth refresh gives a new user object reference with same ID & role while delete is in-flight
  harness.setCurrentUser({ id: 7001, role: 'PHARMACIST' });
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  // Verify form is locked and delete is busy
  assert.equal(pitchDialog.props.deleteBusy, true, 'deleteBusy remains true across auth refresh');

  // Attempting second delete while first is in-flight must be ignored
  await pitchDialog.props.onConfirmDelete();
  assert.equal(harness.deleteCalls.length, 1, 'No duplicate delete call allowed');

  // Attempting save while delete is in-flight must be ignored
  await pitchDialog.props.onSave();
  assert.equal(harness.updatePostCalls.length, 0, 'No update call allowed while delete in-flight');

  // Resolve the in-flight delete
  resolveDelete();
  await confirmPromise;

  assert.equal(harness.deleteCalls.length, 1, 'Initial delete finishes exactly once');
});

test('pitch delete safety: feed reload failure after committed delete is not reported as delete failure', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  // Feed reload throws network error
  harness.setReloadService(async () => {
    throw new Error('Feed network failure');
  });

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  // Confirm delete succeeds on server even though feed reload throws
  await pitchDialog.props.onConfirmDelete();

  assert.equal(harness.deleteCalls.length, 1, 'Delete service called successfully');
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, false, 'Confirmation closed on success');
  assert.equal(pitchDialog.props.existingPostId, null, 'Editor reset after success despite feed error');
  assert.equal(pitchDialog.props.pitchError, null, 'No pitchError shown when delete committed');
});

test('pitch delete safety: timeout after server delete reconciles via getExplorerPostForEditing and clears stale Delete button', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  // Delete service throws timeout error
  harness.setDeleteService(async (id) => {
    harness.deleteCalls.push(id);
    throw new Error('Gateway Timeout 504');
  });

  // Authoritative getExplorerPostForEditing reports post is gone (mine === null)
  harness.setGetMineService(async () => null);

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  await pitchDialog.props.onConfirmDelete();

  assert.equal(harness.deleteCalls.length, 1);
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.existingPostId, null, 'Stale post ID cleared when mine returns null');
  assert.equal(pitchDialog.props.deleteConfirmOpen, false, 'Confirm dialog closed');
});

test('pitch delete safety: retained Cancel while delete is in-flight cannot close confirmation state', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let resolveDelete;
  const deletePromise = new Promise((resolve) => {
    resolveDelete = resolve;
  });
  harness.setDeleteService(async (id) => {
    harness.deleteCalls.push(id);
    await deletePromise;
  });

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  const retainedCancel = pitchDialog.props.onCancelDelete;

  // Confirm initiated
  const confirmPromise = pitchDialog.props.onConfirmDelete();

  // Immediate Cancel / backdrop click while in-flight
  retainedCancel();

  // Must not close dialog while in flight
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, true, 'Confirm state not dismissed while in-flight');

  resolveDelete();
  await confirmPromise;
});

test('pitch delete safety: handlePitchSave is blocked synchronously while delete confirmation is pending', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let pitchDialog = harness.findPitchDialog(tree);
  pitchDialog.props.onRequestDelete();

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, true);

  // User attempts Save while confirmation is open
  await pitchDialog.props.onSave();
  assert.equal(harness.updatePostCalls.length, 0, 'Save blocked while delete confirmation is open');
});

test('pitch save safety: synchronous save mutex blocks rapid double save from creating or updating twice', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let resolveUpdate;
  const pendingUpdate = new Promise((resolve) => {
    resolveUpdate = resolve;
  });
  harness.setUpdatePostService(async (id, payload) => {
    harness.updatePostCalls.push({ id, payload });
    await pendingUpdate;
    return payload;
  });

  let pitchDialog = harness.findPitchDialog(tree);
  assert.ok(pitchDialog);
  assert.equal(pitchDialog.props.existingPostId, 700048);

  // Synchronous double tap on Save with valid form
  const p1 = pitchDialog.props.onSave();
  const p2 = pitchDialog.props.onSave();

  resolveUpdate();
  await Promise.all([p1, p2]);

  assert.equal(harness.updatePostCalls.length, 1, 'Double save executed update exactly once due to saveInFlightRef');
});

test('pitch save safety: Save in flight blocks RequestDelete and retainedConfirmDelete, resulting in 0 DELETE calls', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let resolveUpdate;
  const pendingUpdate = new Promise((resolve) => {
    resolveUpdate = resolve;
  });
  harness.setUpdatePostService(async (id, payload) => {
    harness.updatePostCalls.push({ id, payload });
    await pendingUpdate;
    return payload;
  });

  let pitchDialog = harness.findPitchDialog(tree);
  const retainedConfirm = pitchDialog.props.onConfirmDelete;

  // Initiate Save (saveInFlightRef is now true)
  const savePromise = pitchDialog.props.onSave();

  // Same tick / while in-flight: attempt RequestDelete
  pitchDialog.props.onRequestDelete();
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.deleteConfirmOpen, false, 'onRequestDelete blocked while save in flight');

  // Attempt retained confirm delete while save in flight
  await retainedConfirm();
  assert.equal(harness.deleteCalls.length, 0, 'onConfirmDelete blocked while save in flight');

  resolveUpdate();
  await savePromise;

  assert.equal(harness.deleteCalls.length, 0, 'Zero delete calls issued while save was in flight');
  assert.equal(harness.updatePostCalls.length, 1, 'Save finished cleanly');
});

test('pitch save safety: failed save releases saveInFlightRef allowing deliberate retry', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let callCount = 0;
  harness.setUpdatePostService(async (id, payload) => {
    callCount++;
    if (callCount === 1) throw new Error('Save network failure 500');
    harness.updatePostCalls.push({ id, payload });
    return payload;
  });

  let pitchDialog = harness.findPitchDialog(tree);

  // Attempt 1 fails with network error
  await pitchDialog.props.onSave();
  assert.equal(callCount, 1, 'First save failed');

  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.pitchSaving, false, 'pitchSaving released after error');
  assert.equal(pitchDialog.props.pitchError, 'Failed to save pitch.', 'Existing generic network error remains visible');

  // Deliberate retry succeeds because saveInFlightRef was released in finally
  await pitchDialog.props.onSave();
  assert.equal(callCount, 2, 'Second save succeeded');
  assert.equal(harness.updatePostCalls.length, 1, 'Update post call recorded on deliberate retry');
});

test('pitch save safety: auth refresh same account while Save pending preserves draft and target ID without resetting form', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  let resolveUpdate;
  const pendingUpdate = new Promise((resolve) => {
    resolveUpdate = resolve;
  });
  harness.setUpdatePostService(async (id, payload) => {
    harness.updatePostCalls.push({ id, payload });
    await pendingUpdate;
    return payload;
  });

  let pitchDialog = harness.findPitchDialog(tree);
  // Modify draft headline
  pitchDialog.props.setPitchForm((prev) => ({ ...prev, headline: 'Updated custom headline' }));
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);

  // In-flight save begins
  const savePromise = pitchDialog.props.onSave();

  // Auth refresh provides a new user object reference with same ID & role while save is in-flight
  harness.setCurrentUser({ id: 7001, role: 'PHARMACIST' });
  tree = harness.renderInner();
  await harness.runEffects();

  pitchDialog = harness.findPitchDialog(tree);
  // With saveInFlightRef guard in loadPitchDefaults, the form was not reset
  assert.equal(pitchDialog.props.pitchForm.headline, 'Updated custom headline', 'Draft headline preserved across auth refresh');
  assert.equal(pitchDialog.props.existingPostId, 700048, 'Target ID preserved across auth refresh');

  resolveUpdate();
  await savePromise;

  assert.equal(harness.updatePostCalls.length, 1, 'Save finished successfully');
});

test('pitch save safety: feed reload failure after committed save is not reported as save failure', async () => {
  const harness = createPitchHarness();
  let tree = await harness.mountWithPitch();

  // Feed reload throws network error
  harness.setReloadService(async () => {
    throw new Error('Feed reload network failure');
  });

  let pitchDialog = harness.findPitchDialog(tree);

  // Save completes on server even though feed reload throws
  await pitchDialog.props.onSave();

  assert.equal(harness.updatePostCalls.length, 1, 'Update service called successfully');
  tree = harness.renderInner();
  pitchDialog = harness.findPitchDialog(tree);
  assert.equal(pitchDialog.props.pitchError, null, 'No pitchError reported when save committed despite feed error');
});

for (const [role, onboardingRole, patchRole] of [
  ['PHARMACIST', 'pharmacist', 'pharmacist'],
  ['OTHER_STAFF', 'other_staff', 'otherstaff'],
  ['EXPLORER', 'explorer', 'explorer'],
]) {
  test(`pitch defaults: ${role} preserves onboarding location in FormData`, async () => {
    const harness = createPitchHarness({ id: 7001, role }, null);
    const location = { street_address: '12 Main St', suburb: 'Brisbane', state: 'QLD', postcode: '4000',
      open_to_travel: true, travel_states: ['QLD', 'NSW'], coverage_radius_km: 0,
      latitude: 0, longitude: 0, google_place_id: 'place-1' };
    harness.setOnboardingService(async (requestedRole) => {
      assert.equal(requestedRole, onboardingRole);
      return location;
    });
    const tree = await harness.mountWithPitch();
    const dialog = harness.findPitchDialog(tree);
    assert.equal(dialog.props.defaultsStatus, 'ready');
    await dialog.props.onSave();
    assert.equal(harness.onboardingUpdateCalls.length, 1);
    assert.equal(harness.onboardingUpdateCalls[0].role, patchRole);
    assert.deepEqual(harness.onboardingUpdateCalls[0].values, {
      ...location, open_to_travel: 'true', travel_states: '["QLD","NSW"]',
      coverage_radius_km: '0', latitude: '0', longitude: '0',
    });
    assert.equal(harness.createPostCalls.length, 1);
  });
}

test('pitch defaults: failed load blocks writes and retry restores saving', async () => {
  const harness = createPitchHarness({ id: 7001, role: 'PHARMACIST' }, null);
  harness.setOnboardingService(async () => { throw new Error('Offline'); });
  let tree = await harness.mountWithPitch();
  let dialog = harness.findPitchDialog(tree);
  assert.equal(dialog.props.defaultsStatus, 'error');
  await dialog.props.onSave();
  assert.equal(harness.onboardingUpdateCalls.length, 0);
  assert.equal(harness.createPostCalls.length, 0);
  harness.setOnboardingService(async () => ({ suburb: 'Brisbane' }));
  await dialog.props.onRetryDefaults();
  tree = harness.renderInner();
  dialog = harness.findPitchDialog(tree);
  assert.equal(dialog.props.defaultsStatus, 'ready');
  await dialog.props.onSave();
  assert.equal(harness.onboardingUpdateCalls[0].values.suburb, 'Brisbane');
  assert.equal(harness.createPostCalls.length, 1);
});

test('pitch defaults: existing post location overrides onboarding without losing other fields', async () => {
  const harness = createPitchHarness({ id: 7001, role: 'PHARMACIST' }, {
    id: 700048, locationSuburb: 'Ipswich', locationState: 'QLD', locationPostcode: '4305',
    openToTravel: false, coverageRadiusKm: 0,
  });
  harness.setOnboardingService(async () => ({ street_address: '12 Main St', suburb: 'Brisbane',
    state: 'QLD', postcode: '4000', open_to_travel: true, travel_states: ['QLD'],
    coverage_radius_km: 30, latitude: 0, longitude: 0, google_place_id: 'place-1' }));
  const dialog = harness.findPitchDialog(await harness.mountWithPitch());
  await dialog.props.onSave();
  const values = harness.onboardingUpdateCalls[0].values;
  assert.equal(values.street_address, '12 Main St');
  assert.equal(values.suburb, 'Ipswich');
  assert.equal(values.postcode, '4305');
  assert.equal(values.open_to_travel, 'false');
  assert.equal(values.coverage_radius_km, '0');
  assert.equal(values.latitude, '0');
  assert.equal(values.google_place_id, 'place-1');
});

for (const status of ['loading', 'error']) {
  test(`pitch dialog: ${status} shows recovery controls without editor actions`, () => {
    const harness = createPitchHarness();
    const retry = () => {};
    const close = () => {};
    const tree = harness.renderPitchDialogDirect({
      open: true, isExplorer: false, existingPostId: 700048,
      pitchForm: { headline: '', availabilitySlots: [] }, setPitchForm: () => {},
      pitchError: 'Offline', pitchSaving: false, defaultsStatus: status,
      onRetryDefaults: retry, onClose: close, onSave: () => {}, onRequestDelete: () => {},
    });
    const find = (predicate) => harness.walkTree(tree, predicate);
    assert.equal(Boolean(find((n) => n.type === harness.brandLoader)), status === 'loading');
    assert.equal(Boolean(find((n) => n.props?.onPress === retry)), status === 'error');
    assert.ok(find((n) => n.props?.onPress === close && n.props?.children === 'Cancel'));
    assert.equal(find((n) => n.props?.testID === 'pitch-delete-request-700048'), null);
    assert.equal(find((n) => n.props?.children === 'Update Availability' || n.props?.children === 'Post Availability' || n.props?.children === 'Next'), null);
    if (status === 'error') assert.ok(find((n) => n.props?.children === 'Offline'));
  });
}

test('pitch defaults: closing during load ignores the late result', async () => {
  const harness = createPitchHarness({ id: 7001, role: 'PHARMACIST' }, null);
  let resolveOnboarding;
  harness.setOnboardingService(() => new Promise((resolve) => { resolveOnboarding = resolve; }));
  let dialog = harness.findPitchDialog(await harness.mountWithPitch());
  assert.equal(dialog.props.defaultsStatus, 'loading');
  const initialSuburb = dialog.props.pitchForm.suburb;
  dialog.props.onClose();
  resolveOnboarding({ suburb: 'Late result' });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  dialog = harness.findPitchDialog(harness.renderInner());
  assert.equal(dialog.props.open, false);
  assert.equal(dialog.props.pitchForm.suburb, initialSuburb);
  await dialog.props.onSave();
  assert.equal(harness.onboardingUpdateCalls.length, 0);
  assert.equal(harness.createPostCalls.length, 0);
});

for (const role of ['PHARMACIST', 'OTHER_STAFF']) {
  for (const trigger of ['focus', 'pull refresh']) {
    test(`verification return ${trigger} reloads eligibility for ${role} without changing identity`, async () => {
      const h = createPitchHarness({ id: 7001, role, is_mobile_verified: true, is_active: true });
      h.useRealEligibility();
      let verified = false;
      let checks = 0;
      h.setOnboardingService(async () => { checks++; return { verified, ahpra_verified: verified, ahpra_expiry_date: '2099-12-31' }; });
      h.renderInner(); await h.runEffects();
      let tree = h.renderInner();
      const warning = () => h.walkTree(tree, n => n.props?.children === 'Public Talent profile verification required');
      assert.ok(warning());
      const beforeFocus = checks;
      verified = true;
      if (trigger === 'focus') h.focus();
      else await h.walkTree(tree, n => n.props?.refreshControl).props.refreshControl.props.onRefresh();
      await h.runEffects();
      tree = h.renderInner(); await h.runEffects(); tree = h.renderInner();
      assert.ok(checks > beforeFocus, `${trigger} must reload the same eligibility manager`);
      assert.equal(warning(), null);
      assert.equal(h.findPitchDialog(tree).props.open, true, 'newly verified worker can publish');
      verified = false;
      await h.walkTree(tree, n => n.props?.refreshControl).props.refreshControl.props.onRefresh();
      await h.runEffects(); tree = h.renderInner();
      assert.ok(warning(), 'explicit refresh rechecks eligibility');
      verified = true;
      await h.walkTree(tree, n => n.props?.refreshControl).props.refreshControl.props.onRefresh();
      await h.runEffects(); tree = h.renderInner();
      assert.equal(warning(), null, 'explicit refresh also recovers publishing access');
    });
  }
}

for (const selection of ['calendar', 'drag', 'typed start']) {
  test(`pitch ${selection} preserves the chosen repeat end; first selection defaults it`, () => {
    const h = createPitchHarness();
    const props = { open: true, isExplorer: false, existingPostId: null, pitchForm: { headline: '', body: '', postKind: 'AVAILABILITY', workTypes: [], travelStates: [], availabilitySlots: [] }, setPitchForm: () => {}, pitchError: null, pitchSaving: false, onClose: () => {}, onSave: () => {} };
    let tree = h.renderPitchDialogDirect(props);
    h.walkTree(tree, n => n.props?.buttons?.some(b => b.label === 'Availability')).props.onValueChange('2');
    tree = h.renderPitchDialogDirect(props);
    h.walkTree(tree, n => n.props?.buttons?.some(b => b.value === 'recurring')).props.onValueChange('recurring');
    tree = h.renderPitchDialogDirect(props);
    const grid = () => h.walkTree(tree, n => typeof n.props?.onResponderMove === 'function');
    grid().props.onLayout({ nativeEvent: { layout: { width: 350 } } });
    tree = h.renderPitchDialogDirect(props);
    h.walkTree(tree, n => n.props?.label === 'Start Date').props.onChangeText('2026-11-10');
    tree = h.renderPitchDialogDirect(props);
    assert.equal(h.walkTree(tree, n => n.props?.label === 'End Date').props.value, '2026-11-10');
    h.walkTree(tree, n => typeof n.props?.onConfirm === 'function').props.onConfirm({ date: new Date(2026, 11, 31) });
    tree = h.renderPitchDialogDirect(props);
    assert.equal(h.walkTree(tree, n => n.props?.label === 'End Date').props.value, '2026-12-31', 'own picker sets the end');
    if (selection === 'calendar') grid().props.onResponderGrant({ nativeEvent: { locationX: 125, locationY: 75 } });
    else if (selection === 'drag') grid().props.onResponderMove({ nativeEvent: { locationX: 175, locationY: 75 } });
    else h.walkTree(tree, n => n.props?.label === 'Start Date').props.onChangeText('2026-11-15');
    tree = h.renderPitchDialogDirect(props);
    assert.equal(h.walkTree(tree, n => n.props?.label === 'End Date').props.value, '2026-12-31');
  });
}
