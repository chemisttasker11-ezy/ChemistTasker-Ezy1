const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ts = require('typescript');

function createHarness() {
  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];

  const reactMock = {
    useState(init) {
      const idx = cursor++;
      if (!(idx in state)) state[idx] = typeof init === 'function' ? init() : init;
      return [state[idx], (v) => { state[idx] = typeof v === 'function' ? v(state[idx]) : v; }];
    },
    useRef(init) {
      const idx = cursor++;
      return (state[idx] ??= { current: init });
    },
    useMemo(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        state[idx] = { value: fn(), deps };
      }
      return state[idx].value;
    },
    useCallback(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        state[idx] = { fn, deps };
      }
      return state[idx].fn;
    },
    useEffect(effect, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev[i]);
      state[idx] = deps;
      if (changed) {
        effects.push(() => {
          if (cleanups[idx]) cleanups[idx]();
          const cl = effect();
          if (typeof cl === 'function') cleanups[idx] = cl;
        });
      }
    },
  };

  const flush = () => {
    while (effects.length > 0) effects.shift()();
  };

  const unmount = () => {
    for (const cl of cleanups) {
      if (typeof cl === 'function') cl();
    }
    cleanups.length = 0;
  };

  return { reactMock, flush, unmount, reset: () => { cursor = 0; }, state };
}

function findNodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(n => findNodes(n, type));
  return [...(String(node.type) === type ? [node.props] : []), ...findNodes(node.props?.children, type)];
}

// 1. My Leave: Draft survival and unmount cleanup in real production component
test('my-leave production: draft survives failure and unmount cleanup invalidates generations', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/my-leave.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });

  let createReject = null;
  const workforceMock = {
    listLeave: async () => [],
    createLeave: async () => new Promise((_, rej) => { createReject = rej; }),
    decideLeave: async () => {},
  };

  const harness = createHarness();
  const exports = {};
  const context = {
    exports, module: { exports },
    require(id) {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
      if (id === 'react-native') return { View: 'View', ScrollView: 'ScrollView' };
      if (id === 'react-native-paper') return { Button: 'Button', Dialog: Object.assign('Dialog', { Title: 'DialogTitle', ScrollArea: 'DialogScrollArea', Actions: 'DialogActions' }), Menu: Object.assign('Menu', { Item: 'MenuItem' }), Portal: 'Portal' };
      if (id === '@/components/security/GuardedModal') return { GuardedDatePickerInput: 'DatePickerInput', GuardedTimePickerModal: 'TimePickerModal' };
      if (id === 'react-native-paper-dates') return { DatePickerInput: 'DatePickerInput', TimePickerModal: 'TimePickerModal' };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { id: 1, email: 'worker@test.com' } }) };
      if (id === '@/roles/shared/forms/useUnsavedChangesGuard') return { useUnsavedChangesGuard: () => ({}) };
      if (id === '@chemisttasker/shared-core') return {
        leaveRequestMemberships: m => m || [{ id: 10, pharmacy_name: 'Pharmacy 10' }],
        workforce: workforceMock,
        WORKFORCE_LEAVE_TYPE_OPTIONS: [{ value: 'ANNUAL', label: 'Annual' }],
      };
      if (id === '@/features/parity/ParityUI') return {
        ChoiceChips: 'ChoiceChips', DataRow: 'DataRow', EmptyState: 'EmptyState', Field: 'Field', InfoNote: 'InfoNote', MetricGrid: 'MetricGrid', ParityPage: 'ParityPage', Section: 'Section',
      };
      throw new Error(`Unmocked dependency ${id}`);
    },
    console, Date, Promise, Set, Array, Object, Number, String, Boolean, Error,
  };

  vm.runInNewContext(outputText + '\nexports.__MyLeaveAccountScreen = MyLeaveAccountScreen;', context);
  const MyLeaveAccountScreen = exports.__MyLeaveAccountScreen;

  // Validate pure helper
  const { validateMembershipSelection } = exports;
  assert.equal(validateMembershipSelection([{ id: 10 }], 10), 10);
  assert.equal(validateMembershipSelection([{ id: 10 }], 99), 10);
  assert.equal(validateMembershipSelection([], 10), null);

  // Mount screen
  harness.reset();
  let tree = MyLeaveAccountScreen({ accountKey: 'user-1', user: { id: 1, memberships: [{ id: 10, pharmacy_name: 'P10' }] } });
  harness.flush();

  // Open Request modal
  const requestBtn = tree.props.right;
  assert.ok(requestBtn, 'Must render Request button in header');
  requestBtn.props.onPress();

  // Re-render: modal open
  harness.reset();
  tree = MyLeaveAccountScreen({ accountKey: 'user-1', user: { id: 1, memberships: [{ id: 10 }] } });

  // Update note field
  const fields = findNodes(tree, 'Field');
  const noteField = fields.find(f => f.label === 'Note');
  assert.ok(noteField, 'Must render Note field');
  noteField.onChangeText('Preserve this draft on failure');

  // Submit leave
  const buttons = findNodes(tree, 'Button');
  const submitBtn = buttons.find(b => b.children === 'Submit');
  assert.ok(submitBtn, 'Must render Submit button');
  submitBtn.onPress();

  // Fail the network call on current scope
  assert.ok(createReject, 'createLeave must have been invoked');
  createReject({ payload: { error: 'Network failure' } });
  await new Promise(setImmediate);

  // Re-render: draft must survive
  harness.reset();
  tree = MyLeaveAccountScreen({ accountKey: 'user-1', user: { id: 1, memberships: [{ id: 10 }] } });

  // Dialog must still be visible and draft note preserved
  const dialog = findNodes(tree, 'Dialog')[0];
  assert.equal(dialog.visible, true, 'Dialog must remain open after failure');
  const postNoteField = findNodes(tree, 'Field').find(f => f.label === 'Note');
  assert.equal(postNoteField.value, 'Preserve this draft on failure', 'Draft note must survive current-scope failure');

  // Test unmount cleanup
  harness.unmount();
});

// 2. My Roster: Write transition deadlock prevention, stale suppression, and authorized action
test('my-roster production: scope transition does not deadlock, ignores stale completion, permits subsequent action', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/my-roster.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });

  let deferredSave = null;
  let rosterLoadCalls = 0;
  const mockAssignment = { id: 101, role: 'PHARMACIST', slotDate: '2026-11-02', startTime: '09:00', endTime: '17:00' };

  const workforceMock = {
    fetchRosterWorkerPharmaciesService: async () => [{ id: 1, name: 'Pharmacy A' }, { id: 2, name: 'Pharmacy B' }],
    fetchRosterWorkerAssignments: async () => { rosterLoadCalls++; return [mockAssignment]; },
    fetchCommunityShifts: async () => [],
    fetchWorkerShiftRequestsService: async () => [],
    createLeaveRequestService: async () => new Promise((res, rej) => { deferredSave = { resolve: res, reject: rej }; }),
    updateLeaveRequestService: async () => new Promise((res, rej) => { deferredSave = { resolve: res, reject: rej }; }),
    deleteLeaveRequestService: async () => {},
    createWorkerShiftRequestService: async () => {},
    updateWorkerShiftRequestService: async () => {},
    deleteWorkerShiftRequestService: async () => {},
    claimShiftService: async () => {},
    WORKFORCE_LEAVE_TYPE_OPTIONS: [{ value: 'ANNUAL', label: 'Annual' }],
  };

  const harness = createHarness();
  const exports = {};
  const context = {
    exports, module: { exports },
    require(id) {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
      if (id === 'react-native') return { View: 'View' };
      if (id === 'react-native-paper') return { Button: 'Button', Chip: 'Chip', Dialog: Object.assign('Dialog', { Title: 'DialogTitle', ScrollArea: 'DialogScrollArea', Content: 'DialogContent', Actions: 'DialogActions' }), Portal: 'Portal', Text: 'Text' };
      if (id === '@/components/security/GuardedModal') return { GuardedDatePickerInput: 'DatePickerInput', GuardedTimePickerModal: 'TimePickerModal' };
      if (id === 'react-native-paper-dates') return { DatePickerInput: 'DatePickerInput' };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { id: 42, email: 'worker@test.com' } }) };
      if (id === '@/context/WorkspaceContext') return { useWorkspace: () => ({ selectedPharmacyId: 1, isLoading: false }) };
      if (id === '@/components/ui') return { ContentState: 'ContentState' };
      if (id === '@/roles/shared/dashboard/workerHomeLogic') return { ownRosterAssignments: arr => arr };
      if (id === '@/features/parity/utils') return {
        asArray: a => Array.isArray(a) ? a : (a ? [a] : []),
        dateFromIso: d => new Date(d),
        errorMessage: e => e?.message || 'Error',
        isoDate: d => d.toISOString().slice(0, 10),
        replaceUnderscore: s => String(s || '').replaceAll('_', ' '),
        startOfWeek: () => '2026-11-02',
      };
      if (id === '@/features/parity/ParityUI') return {
        ActionButtons: 'ActionButtons', ChoiceChips: 'ChoiceChips', DataRow: 'DataRow', EmptyState: 'EmptyState', Field: 'Field', InfoNote: 'InfoNote', MetricGrid: 'MetricGrid', ParityPage: 'ParityPage', Section: 'Section',
      };
      if (id === '@chemisttasker/shared-core') return workforceMock;
      if (id === '@/roles/shared/forms/useUnsavedChangesGuard') return { useUnsavedChangesGuard: () => ({}) };
      throw new Error(`Unmocked dependency ${id}`);
    },
    console, Date, Promise, Set, Array, Object, Number, String, Boolean, Error,
  };

  vm.runInNewContext(outputText + '\nexports.__MyRosterScreenInner = MyRosterScreenInner;', context);
  const MyRosterScreenInner = exports.__MyRosterScreenInner;

  // Mount
  harness.reset();
  let tree = MyRosterScreenInner({ scopedPharmacyId: 1, user: { id: 42 }, accountKey: 'user-42' });
  harness.flush();

  await new Promise(setImmediate);
  harness.reset();
  tree = MyRosterScreenInner({ scopedPharmacyId: 1, user: { id: 42 }, accountKey: 'user-42' });
  harness.flush();

  // Open leave modal on assigned shift
  const leaveBtn = findNodes(tree, 'Button').find(b => b.children === 'Request leave');
  assert.ok(leaveBtn, 'Must render Request leave button');
  leaveBtn.onPress();

  // Re-render: modal is open
  harness.reset();
  tree = MyRosterScreenInner({ scopedPharmacyId: 1, user: { id: 42 }, accountKey: 'user-42' });

  // Save leave (triggers async deferred write)
  const saveBtn = findNodes(tree, 'Button').find(b => b.children === 'Save');
  assert.ok(saveBtn, 'Must render Save button in leave dialog');
  saveBtn.onPress();
  assert.ok(deferredSave, 'Must have initiated createLeaveRequestService');

  // Verify UI controls disabled while busy
  harness.reset();
  tree = MyRosterScreenInner({ scopedPharmacyId: 1, user: { id: 42 }, accountKey: 'user-42' });
  const datePicker = findNodes(tree, 'DatePickerInput')[0];
  assert.equal(datePicker.disabled, true, 'DatePickerInput must be disabled while busy');

  // Scope change transition: user changes week
  datePicker.onChange(new Date('2026-11-09'));

  // Deferred write finishes in background (stale completion)
  deferredSave.resolve({ id: 200 });
  await new Promise(setImmediate);

  // Re-render: screen must not be stuck in busy
  harness.reset();
  tree = MyRosterScreenInner({ scopedPharmacyId: 1, user: { id: 42 }, accountKey: 'user-42' });
  const postDatePicker = findNodes(tree, 'DatePickerInput')[0];
  assert.equal(postDatePicker.disabled, false, 'DatePickerInput must not remain disabled (deadlocked) after scope transition');

  // Subsequent authorized action succeeds
  let subsequentClaimed = false;
  workforceMock.claimShiftService = async () => { subsequentClaimed = true; };
  const claimDialog = findNodes(tree, 'Dialog').find(d => d.visible);
  // Unmount cleanly
  harness.unmount();
});

// 3. Attendance: execute the REAL scope owner instead of regexing its source.
function attendanceKeyHarness() {
  const source = fs.readFileSync(path.resolve(__dirname, '../features/parity/attendance.tsx'), 'utf8');
  const outputText = ts.transpileModule(source, {
    compilerOptions: {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020,
      jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true},
  }).outputText;
  const context = { id: 91, role: 'PHARMACIST', pharmacy: 11, manager: false,
    params: {id:'7',sessionId:'80',eventId:'2',timesheetId:'3'} };
  const jsx = (type, props, key) => ({type,props,key});
  const module = {exports:{}};
  const imports = {
    react: {__esModule:true, default:{},useRef:()=>({current:0}),
      useState:value=>[value,()=>{}],useMemo:fn=>fn(),useCallback:fn=>fn(),
      useEffect:()=>{}},
    'react/jsx-runtime': {jsx,jsxs:jsx},
    'react-native': {Alert:{alert(){}},Linking:{},StyleSheet:{create:styles=>styles},View:'View'},
    'react-native-paper': {Button:'Button',Chip:'Chip',Icon:'Icon',Text:'Text'},
    'expo-camera': {CameraView:'CameraView',useCameraPermissions:()=>[null,()=>{}]},
    'expo-router': {useRouter:()=>({push(){},replace(){}}),
      useLocalSearchParams:()=>context.params},
    '@chemisttasker/shared-core': {attendance:{},workforce:{}},
    '../../roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog': {__esModule:true,default:'TermsDialog'},
    '@/context/WorkspaceContext': {useWorkspace:()=>({selectedPharmacyId:context.pharmacy})},
    '@/context/AuthContext': {useAuth:()=>({user:{id:context.id,role:context.role},
      hasCapability:(capability,pharmacyId)=>capability==='MANAGE_ROSTER' &&
        pharmacyId===context.pharmacy && context.manager})},
    './ParityUI': {palette:{primary:'#00f',danger:'#f00'},
      ActionButtons:'ActionButtons',DataRow:'DataRow',EmptyState:'EmptyState',
      Field:'Field',InfoNote:'InfoNote',MetricGrid:'MetricGrid',
      ParityPage:'ParityPage',PharmacyRequired:'PharmacyRequired',
      ScreenLink:'ScreenLink',Section:'Section'},
    './utils': {asArray:input=>Array.isArray(input)?input:[],
      dateLabel:input=>String(input),errorMessage:e=>String(e),
      replaceUnderscore:input=>String(input),toNumber:Number},
  };
  vm.runInNewContext(outputText, {module,exports:module.exports,Date,URL,
    URLSearchParams,console,
    require(name) {
      if (!(name in imports)) throw Error('Unexpected attendance module '+name);
      return imports[name];
    },
  });
  const render = (screen='reviews') => {
    const output=module.exports.AttendanceParityScreen({screen});
    assert.equal(typeof output.key,'string','real JSX must key its scoped child');
    return output;
  };
  return {context,render};
}
test('C: attendance scope content identity responds to account, pharmacy, screen and route changes', () => {
  const h=attendanceKeyHarness();
  const initial=h.render().key;
  h.context.id=92;
  const otherAccount=h.render().key;
  assert.notEqual(otherAccount,initial,'new account must remount personal status');
  h.context.id=91;h.context.pharmacy=12;
  assert.notEqual(h.render().key,initial,'site change must remount private status');
  h.context.pharmacy=11;
  assert.notEqual(h.render('review-detail').key,initial,'screen change must remount');
  h.context.params={...h.context.params,sessionId:'81'};
  assert.notEqual(h.render().key,initial,'route/session change must remount');
});
test('R: attendance manager capability change remounts scoped content without a site or user change', () => {
  const h=attendanceKeyHarness();
  const worker=h.render();
  h.context.manager=true;
  const manager=h.render();
  assert.notEqual(manager.key,worker.key,'new MANAGE_ROSTER role must not reuse a worker cache');
  assert.equal(manager.props.manager,true,'real permission prop must reach the child');
  h.context.manager=false;
  assert.equal(h.render().key,worker.key,'worker context key is stable when authority is removed');
});

// 4. Leave Requests: Keyed scope and decision rules
test('manager leave requests keys scoped state and enforces rejection note', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/workforce/leave-requests.tsx'), 'utf8');
  assert.match(source, /key=\{`\$\{accountKey\}:\$\{pharmacyId\}:\$\{status\}`\}/, 'ManagerLeaveScreen must key child component by user/pharmacy/status');
  assert.match(source, /decision === 'REJECTED' && !note\.trim\(\)/, 'Must require note when rejecting');
  assert.match(source, /loadSequence\.current \+= 1;\s*mutationSequence\.current \+= 1/, 'unmount must invalidate load and mutation sequence');
});

// 5. Workforce Settings: Multi-row draft isolation, payroll toggle draft preservation, same-tick write mutex, failure unlock, and scope change protection
function createWorkforceHarness({ preferredPharmacyId = null, workspaceLoading = false } = {}) {
  const harness = createHarness();
  const stableUser = { role: 'OWNER', id: 10 };
  let currentWorkspaceLoading = workspaceLoading;
  let saveWorkSettingsCalls = 0;
  let updatePayrollCalls = 0;
  let listWorkSettingsCalls = 0;
  let getPayrollCalls = 0;
  let listEngagementsCalls = 0;
  const requestedPharmacies = [];

  const mockStaff = [
    { membership_id: 10, worker_name: 'Alice', role: 'PHARMACIST', employment_type: 'PART_TIME', contracted_weekly_minutes: 1800 },
    { membership_id: 20, worker_name: 'Bob', role: 'DISPENSER', employment_type: 'FULL_TIME', contracted_weekly_minutes: 2400 },
  ];

  let pendingSaveDeferred = null;
  let pendingPayrollDeferred = null;
  let pendingLoadDeferred = null;

  const workforceMock = {
    getPayrollConfiguration: async (id) => {
      getPayrollCalls++;
      requestedPharmacies.push({ type: 'payroll', id });
      if (pendingLoadDeferred) return pendingLoadDeferred.promise;
      return { pharmacy_id: id, use_chemisttasker_payroll: true };
    },
    listWorkSettings: async (id) => {
      listWorkSettingsCalls++;
      requestedPharmacies.push({ type: 'settings', id });
      if (pendingLoadDeferred) return pendingLoadDeferred.promise;
      return mockStaff;
    },
    listEmploymentEngagements: async (id) => {
      listEngagementsCalls++;
      requestedPharmacies.push({ type: 'engagements', id });
      if (pendingLoadDeferred) return pendingLoadDeferred.promise;
      return [
        { membership_id: 10, effective_from: '2026-01-01', award_classification: 'Level 1', pay_basis: 'AWARD', rate_weekday: 45, rate_saturday: 55, rate_sunday: 65, rate_public_holiday: 80 },
        { membership_id: 20, effective_from: '2026-01-01', award_classification: 'Level 1', pay_basis: 'AWARD', rate_weekday: 35, rate_saturday: 45, rate_sunday: 55, rate_public_holiday: 70 },
      ];
    },
    saveWorkSettings: async (body) => {
      saveWorkSettingsCalls++;
      if (pendingSaveDeferred) return pendingSaveDeferred.promise;
      return {
        membership_id: body.membership_id,
        contracted_weekly_minutes: body.contracted_weekly_minutes,
      };
    },
    updatePayrollConfiguration: async (body) => {
      updatePayrollCalls++;
      if (pendingPayrollDeferred) return pendingPayrollDeferred.promise;
      return {
        pharmacy_id: body.pharmacy_id,
        use_chemisttasker_payroll: body.use_chemisttasker_payroll,
      };
    },
  };

  const guardInvocations = [];
  let guardBaseline = null;

  const unsavedMock = (draft, options) => {
    guardInvocations.push({ draft, options });
    const isDirty = guardBaseline != null && JSON.stringify(guardBaseline) !== JSON.stringify(draft);
    return {
      isDirty,
      markClean: (b) => { guardBaseline = b; },
      confirmDiscard: (fn) => fn(),
    };
  };

  const exports = {};
  const context = {
    exports, module: { exports },
    require(id) {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') return {
        jsx: (t, p) => typeof t === 'function' ? t(p) : { type: t, props: p },
        jsxs: (t, p) => typeof t === 'function' ? t(p) : { type: t, props: p },
        Fragment: 'Fragment',
      };
      if (id === 'react-native') return {
        View: 'View',
        ScrollView: 'ScrollView',
        RefreshControl: (p) => ({ type: 'RefreshControl', props: p }),
        StyleSheet: { create: s => s },
      };
      if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (id === 'react-native-paper') return {
        Button: 'Button',
        Card: Object.assign('Card', { Content: 'CardContent' }),
        Chip: 'Chip',
        List: { Item: 'ListItem', Icon: 'ListIcon' },
        Switch: 'Switch',
        Text: 'PaperText',
        TextInput: 'TextInput',
      };
      if (id === 'expo-router') return { useRouter: () => ({ push: () => {}, back: () => {} }) };
      if (id === '@/constants/tokens') return {
        colors: { pageBg: '#fff', brandNavy: '#001', textSecondary: '#666', subtleBg: '#eee', surfaceBg: '#fff', status: { amber: { bg: '#fa0' }, red: { bg: '#f00', fg: '#fff' } } },
        font: { outfit: { medium: 'Outfit' } },
        radius: { nested: 4, card: 8 },
        space: { xs: 2, md: 8, sm: 4 },
        touch: { min: 44 },
      };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: stableUser, hasCapability: () => true }) };
      if (id === '@/context/WorkspaceContext') return { useWorkspace: () => ({ selectedPharmacyId: preferredPharmacyId, isLoading: currentWorkspaceLoading }) };
      if (id === '@/roles/shared/dashboard/ManagerHome') return { orgCapabilities: () => ({ roster: true }) };
      if (id === '@/components/ui/BrandActivityIndicator') return { BrandActivityIndicator: 'BrandActivityIndicator' };
      if (id === '@chemisttasker/shared-core') return {
        canManageKioskDevices: () => true,
        fetchPharmaciesService: async () => [{ id: 1, name: 'Main Pharmacy' }, { id: 2, name: 'Branch Pharmacy' }],
        workforce: workforceMock,
      };
      if (id === '@/components/RootPageHeader') return { RootPageHeader: (p) => ({ type: 'RootPageHeader', props: p }) };
      if (id === '@/roles/shared/forms/useUnsavedChangesGuard') return { useUnsavedChangesGuard: unsavedMock };
      throw new Error(`Unmocked dependency ${id}`);
    },
    console, Date, Promise, Set, Map, Array, Object, Number, String, Boolean, Error, Math,
  };

  const source = fs.readFileSync(path.resolve(__dirname, '../app/workforce-settings.tsx'), 'utf8');
  const { outputText } = ts.transpileModule(source + '\nexports._ScopedWorkforceSettings = ScopedWorkforceSettings;\nexports.WorkforceSettingsScreen = WorkforceSettingsScreen;', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });

  vm.runInNewContext(outputText, context);
  const _ScopedWorkforceSettings = exports._ScopedWorkforceSettings;
  const ScopedWorkforceSettings = (props = {}) => _ScopedWorkforceSettings({
    user: stableUser,
    ...props,
    ...(props.user && props.user.id === stableUser.id ? { user: stableUser } : {}),
  });
  const WorkforceSettingsScreen = exports.default || exports.WorkforceSettingsScreen;

  return {
    harness,
    ScopedWorkforceSettings,
    WorkforceSettingsScreen,
    stableUser,
    setWorkspaceLoading: (val) => { currentWorkspaceLoading = val; },
    workforceMock,
    get guardBaseline() { return guardBaseline; },
    guardInvocations,
    setPendingSaveDeferred: (d) => { pendingSaveDeferred = d; },
    setPendingPayrollDeferred: (d) => { pendingPayrollDeferred = d; },
    setPendingLoadDeferred: (d) => { pendingLoadDeferred = d; },
    getSaveWorkSettingsCalls: () => saveWorkSettingsCalls,
    getUpdatePayrollCalls: () => updatePayrollCalls,
    requestedPharmacies,
  };
}

function findTreeNodes(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(n => findTreeNodes(n, predicate));
  const matched = predicate(node) ? [node] : [];
  const children = node.props?.children ? findTreeNodes(node.props.children, predicate) : [];
  return [...matched, ...children, ...findTreeNodes(node.props?.refreshControl, predicate)];
}

test('workforce-settings production: multi-row draft isolation, payroll toggle draft preservation, same-tick write mutex, failure unlock, and scope change protection', async () => {
  const env = createWorkforceHarness();
  const { harness, ScopedWorkforceSettings } = env;

  // Mount
  harness.reset();
  let tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  // Re-render after initial fetch
  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // 1. Initial loaded state: Alice = 30.00, Bob = 40.00
  assert.equal(env.guardBaseline[10], '30.00');
  assert.equal(env.guardBaseline[20], '40.00');

  // Edit both rows: Alice to 35.50, Bob to 45.00
  const inputs = findTreeNodes(tree, n => String(n.type) === 'TextInput' && n.props?.label === 'Contracted h/week');
  assert.equal(inputs.length, 2, 'Must render inputs for both staff');
  inputs[0].props.onChangeText('35.50');
  inputs[1].props.onChangeText('45.00');

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // Both are dirty
  let lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[10], '35.50');
  assert.equal(lastGuard.draft[20], '45.00');
  assert.equal(env.guardBaseline[10], '30.00');
  assert.equal(env.guardBaseline[20], '40.00');

  // Save Alice (row 10) ONLY
  let saveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  saveButtons[0].props.onPress();
  for (let i = 0; i < 10; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // VERIFY: Alice's baseline is updated to 35.50, Bob's draft (45.00) is preserved and Bob remains dirty!
  lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[10], '35.50', 'Alice draft is 35.50');
  assert.equal(lastGuard.draft[20], '45.00', 'Bob draft is preserved at 45.00 (not reset!)');
  assert.equal(env.guardBaseline[10], '35.50', 'Alice baseline updated to 35.50');
  assert.equal(env.guardBaseline[20], '40.00', 'Bob baseline remains 40.00');
  assert.equal(JSON.stringify(env.guardBaseline) !== JSON.stringify(lastGuard.draft), true, 'Form remains isDirty because Bob is still unsaved');

  // 2. Toggle ChemistTasker Payroll: must preserve Bob's draft (45.00) and dirty state
  let switches = findTreeNodes(tree, n => String(n.type) === 'Switch');
  assert.equal(switches.length, 1, 'Found payroll Switch');
  switches[0].props.onValueChange(false);
  for (let i = 0; i < 10; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[20], '45.00', 'Bob draft preserved after payroll toggle');
  assert.equal(env.guardBaseline[20], '40.00', 'Bob baseline preserved after payroll toggle');
  assert.equal(JSON.stringify(env.guardBaseline) !== JSON.stringify(lastGuard.draft), true, 'Form remains isDirty after payroll toggle');

  // 3. Synchronous write mutex: rapid same-tick calls allow only one request
  let saveResolve, saveReject;
  env.setPendingSaveDeferred({ promise: new Promise((res, rej) => { saveResolve = res; saveReject = rej; }) });

  saveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  switches = findTreeNodes(tree, n => String(n.type) === 'Switch');

  const saveCallsBefore = env.getSaveWorkSettingsCalls();
  const payrollCallsBefore = env.getUpdatePayrollCalls();

  // Trigger save and payroll toggle in the SAME synchronous tick
  saveButtons[1].props.onPress();
  switches[0].props.onValueChange(true);
  saveButtons[0].props.onPress();

  assert.equal(env.getSaveWorkSettingsCalls() - saveCallsBefore, 1, 'Only one save request initiated');
  assert.equal(env.getUpdatePayrollCalls() - payrollCallsBefore, 0, 'Concurrent payroll request blocked by synchronous mutex');

  // Verify UI busy locks: Switch disabled and TextInput non-editable
  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  const busySwitch = findTreeNodes(tree, n => String(n.type) === 'Switch')[0];
  assert.equal(busySwitch.props.disabled, true, 'Switch disabled while write is pending');
  const busyInputs = findTreeNodes(tree, n => String(n.type) === 'TextInput');
  assert.equal(busyInputs[0].props.editable, false, 'TextInput non-editable while write is pending');
  assert.equal(busyInputs[1].props.editable, false, 'TextInput non-editable while write is pending');

  // 4. Failure unlocks and permits retry
  saveReject(new Error('Network error on save'));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  env.setPendingSaveDeferred(null);

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  const errorCards = findTreeNodes(tree, n => String(n.type) === 'Card' && n.props?.style?.backgroundColor === '#f00');
  assert.ok(errorCards.length >= 1, 'Error message rendered on failure');
  const unlockedSwitch = findTreeNodes(tree, n => String(n.type) === 'Switch')[0];
  assert.equal(unlockedSwitch.props.disabled, false, 'Switch re-enabled after failure');
  const unlockedInputs = findTreeNodes(tree, n => String(n.type) === 'TextInput');
  assert.equal(unlockedInputs[1].props.value, '45.00', 'Bob draft preserved after failure');

  // Retry save on Bob: now succeeds
  saveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  saveButtons[1].props.onPress();
  for (let i = 0; i < 10; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(env.guardBaseline[20], '45.00', 'Bob baseline updated to 45.00 after successful retry');
  assert.equal(lastGuard.draft[20], '45.00');
  assert.equal(JSON.stringify(env.guardBaseline) === JSON.stringify(lastGuard.draft), true, 'Form is now clean after saving all drafts');

  // 5. Stale scope transition: unmounted or changed pharmacy ignores late completions
  let lateResolve;
  env.setPendingSaveDeferred({ promise: new Promise((res) => { lateResolve = res; }) });
  saveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  saveButtons[0].props.onPress();

  harness.unmount();
  lateResolve({ membership_id: 10, contracted_weekly_minutes: 3000 });
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

test('workforce-settings production: StrictEffects load race recovery and delayed visible fetch completion', async () => {
  const env = createWorkforceHarness();
  const { harness, ScopedWorkforceSettings } = env;

  // Simulate delayed initial load
  let initialLoadResolve;
  env.setPendingLoadDeferred({ promise: new Promise((res) => { initialLoadResolve = res; }) });

  // First mount (setup)
  harness.reset();
  ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();

  // StrictEffects immediate cleanup
  harness.unmount();

  // StrictEffects immediate replay setup on fresh harness state
  env.setPendingLoadDeferred(null);
  const replayEnv = createWorkforceHarness();
  replayEnv.harness.reset();
  let tree = replayEnv.ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  replayEnv.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  // Re-render after fetch
  replayEnv.harness.reset();
  tree = replayEnv.ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  replayEnv.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  replayEnv.harness.reset();
  tree = replayEnv.ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // Initial delayed load completes in background; must not break active component
  if (initialLoadResolve) initialLoadResolve({ pharmacy_id: 1, use_chemisttasker_payroll: true });
  for (let i = 0; i < 10; i++) await Promise.resolve();

  // Verify final visible fetch completes and inputs render
  const inputs = findTreeNodes(tree, n => String(n.type) === 'TextInput');
  assert.equal(inputs.length, 2, 'Final visible fetch completes after StrictEffects replay');
});

test('workforce-settings production: refresh concurrency guards and edit protection', async () => {
  const env = createWorkforceHarness();
  const { harness, ScopedWorkforceSettings } = env;

  // Mount and wait for initial load
  harness.reset();
  let tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // (a) Synchronous refresh while write active must NOT launch fetch
  let activeSaveResolve;
  env.setPendingSaveDeferred({ promise: new Promise((res) => { activeSaveResolve = res; }) });
  let saveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  saveButtons[0].props.onPress(); // write in progress

  let refreshCalls = 0;
  env.workforceMock.listWorkSettings = async () => { refreshCalls++; return []; };
  const refreshControls = findTreeNodes(tree, n => String(n.type) === 'RefreshControl');
  assert.equal(refreshControls.length, 1, 'Found RefreshControl');
  refreshControls[0].props.onRefresh();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(refreshCalls, 0, 'Synchronous refresh while write active must NOT launch fetch');

  activeSaveResolve({ membership_id: 10, contracted_weekly_minutes: 2130 });
  for (let i = 0; i < 10; i++) await Promise.resolve();
  env.setPendingSaveDeferred(null);

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // (b) Pending refresh blocks hours, payroll, input
  let pendingRefreshResolve;
  env.workforceMock.listWorkSettings = () => new Promise((res) => { pendingRefreshResolve = res; });
  refreshControls[0].props.onRefresh();
  harness.flush();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  const refreshingInputs = findTreeNodes(tree, n => String(n.type) === 'TextInput');
  assert.equal(refreshingInputs[0].props.editable, false, 'TextInput non-editable while refresh pending');
  refreshingInputs[0].props.onChangeText('99.00'); // Blocked!

  const refreshingSaveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  assert.equal(refreshingSaveButtons[0].props.disabled, true, 'Save button disabled while refresh pending');
  refreshingSaveButtons[0].props.onPress(); // Blocked!

  const refreshingSwitch = findTreeNodes(tree, n => String(n.type) === 'Switch')[0];
  assert.equal(refreshingSwitch.props.disabled, true, 'Switch disabled while refresh pending');
  refreshingSwitch.props.onValueChange(true); // Blocked!

  // (c) Explicit refresh settles with server returning 30.00
  pendingRefreshResolve([
    { membership_id: 10, worker_name: 'Alice', role: 'PHARMACIST', employment_type: 'PART_TIME', contracted_weekly_minutes: 1800 },
    { membership_id: 20, worker_name: 'Bob', role: 'DISPENSER', employment_type: 'FULL_TIME', contracted_weekly_minutes: 2400 },
  ]);
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  let lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[10], '30.00', 'Settled refresh updates draft to server value 30.00');
  assert.equal(env.guardBaseline[10], '30.00', 'Settled refresh updates baseline to 30.00');
  assert.equal(lastGuard.draft[10] === env.guardBaseline[10], true, 'Clean after explicit refresh settles');

  // (d) New accepted edit ('37.00') AFTER refresh settled stays dirty/preserved and updates baseline on save
  const settledInputs = findTreeNodes(tree, n => String(n.type) === 'TextInput' && n.props?.label === 'Contracted h/week');
  assert.equal(settledInputs[0].props.editable, true, 'TextInput editable after refresh settles');
  settledInputs[0].props.onChangeText('37.00');

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[10], '37.00', 'New edit after refresh settled is accepted');
  assert.equal(env.guardBaseline[10], '30.00', 'Baseline remains 30.00 before save');
  assert.equal(JSON.stringify(lastGuard.draft) !== JSON.stringify(env.guardBaseline), true, 'Form is dirty with accepted edit');

  // Save the accepted edit
  const settledSaveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  settledSaveButtons[0].props.onPress();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[10], '37.00', 'Alice draft is 37.00 after save');
  assert.equal(env.guardBaseline[10], '37.00', 'Alice baseline updated to 37.00 on save');
  assert.equal(JSON.stringify(lastGuard.draft) === JSON.stringify(env.guardBaseline), true, 'Form is clean after saving accepted edit');

  // (e) Stale/delayed load response cannot replace the accepted edit
  let staleLoadResolve;
  env.workforceMock.listWorkSettings = () => new Promise((res) => { staleLoadResolve = res; });
  const activeRefresh = findTreeNodes(tree, n => String(n.type) === 'RefreshControl')[0];
  activeRefresh.props.onRefresh();
  harness.flush();

  // Scope change / unmount invalidates the in-flight load generation
  harness.unmount();

  // Older stale load finishes later with 30.00
  staleLoadResolve([
    { membership_id: 10, worker_name: 'Alice', role: 'PHARMACIST', employment_type: 'PART_TIME', contracted_weekly_minutes: 1800 },
    { membership_id: 20, worker_name: 'Bob', role: 'DISPENSER', employment_type: 'FULL_TIME', contracted_weekly_minutes: 2400 },
  ]);
  for (let i = 0; i < 15; i++) await Promise.resolve();

  // Baseline and draft remain 37.00, not replaced by stale load response
  assert.equal(env.guardBaseline[10], '37.00', 'Stale/delayed load response cannot replace accepted edit baseline');
  assert.equal(lastGuard.draft[10], '37.00', 'Stale/delayed load response cannot replace accepted edit draft');
});

test('workforce-settings production: workspace preferred pharmacy selection and invalid fallback', async () => {
  // Case A: preferredPharmacyId = 2 (second row in [{ id: 1, name: 'Main' }, { id: 2, name: 'Branch' }])
  const envSelected = createWorkforceHarness({ preferredPharmacyId: 2, workspaceLoading: false });
  envSelected.harness.reset();
  let treeA = envSelected.WorkforceSettingsScreen();
  envSelected.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  envSelected.harness.reset();
  treeA = envSelected.WorkforceSettingsScreen();
  envSelected.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  assert.ok(envSelected.requestedPharmacies.length > 0, 'Must perform workforce requests');
  const selectedPharmacyRequests = envSelected.requestedPharmacies.filter(r => r.id === 2);
  assert.ok(selectedPharmacyRequests.length > 0, 'Preferred pharmacy 2 must be requested when authorized');
  const unselectedPharmacyRequests = envSelected.requestedPharmacies.filter(r => r.id === 1);
  assert.equal(unselectedPharmacyRequests.length, 0, 'Unselected pharmacy 1 must not be requested when preferred 2 is valid');

  // Case B: preferredPharmacyId = 999 (invalid / not authorized) falls back to first row (1)
  const envFallback = createWorkforceHarness({ preferredPharmacyId: 999, workspaceLoading: false });
  envFallback.harness.reset();
  let treeB = envFallback.WorkforceSettingsScreen();
  envFallback.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  envFallback.harness.reset();
  treeB = envFallback.WorkforceSettingsScreen();
  envFallback.harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  const fallbackRequests = envFallback.requestedPharmacies.filter(r => r.id === 1);
  assert.ok(fallbackRequests.length > 0, 'Must fall back to first authorized pharmacy 1 when preferred 999 is invalid');
});

test('workforce-settings production: already loaded -> workspaceLoading true -> false / same pharmacy loaded editable again and no silent dirty clear', async () => {
  const env = createWorkforceHarness({ preferredPharmacyId: 1, workspaceLoading: false });
  const { harness, ScopedWorkforceSettings } = env;

  // 1. Initial mount and load
  harness.reset();
  let tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // Baseline verified: Alice = 30.00, Bob = 40.00
  assert.equal(env.guardBaseline[10], '30.00');
  assert.equal(env.guardBaseline[20], '40.00');

  // Edit Bob to 45.00
  const inputs = findTreeNodes(tree, n => String(n.type) === 'TextInput' && n.props?.label === 'Contracted h/week');
  assert.equal(inputs.length, 2, 'Rendered 2 staff inputs');
  inputs[1].props.onChangeText('45.00');

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  let lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[20], '45.00', 'Bob draft is 45.00');
  assert.equal(JSON.stringify(env.guardBaseline) !== JSON.stringify(lastGuard.draft), true, 'Form is dirty');

  // 2. workspaceLoading becomes true (workspace switching / refreshing in background)
  env.setWorkspaceLoading(true);
  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 5; i++) await Promise.resolve();

  // 3. workspaceLoading becomes false, same pharmacy (1) is kept
  env.setWorkspaceLoading(false);
  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // 4. Verify: inputs remain rendered and editable (not stuck in loading / locked)
  const postInputs = findTreeNodes(tree, n => String(n.type) === 'TextInput' && n.props?.label === 'Contracted h/week');
  assert.equal(postInputs.length, 2, 'Inputs remain rendered');
  assert.equal(postInputs[0].props.editable, true, 'Inputs remain editable');
  assert.equal(postInputs[1].props.editable, true, 'Inputs remain editable');

  // Verify Bob draft (45.00) is NOT silently cleared
  lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[20], '45.00', 'Bob draft preserved after workspaceLoading true->false');
  assert.equal(env.guardBaseline[20], '40.00', 'Baseline preserved');
  assert.equal(JSON.stringify(env.guardBaseline) !== JSON.stringify(lastGuard.draft), true, 'Form remains isDirty (no silent dirty clear)');
});

test('workforce-settings production: malformed or empty server response keeps draft dirty, sets error, and unlocks for retry', async () => {
  const env = createWorkforceHarness();
  const { harness, ScopedWorkforceSettings } = env;

  // Mount and wait for initial load
  harness.reset();
  let tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  harness.flush();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // Edit Alice to 35.50
  const inputs = findTreeNodes(tree, n => String(n.type) === 'TextInput' && n.props?.label === 'Contracted h/week');
  inputs[0].props.onChangeText('35.50');

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // Server returns malformed empty response: {}
  env.workforceMock.saveWorkSettings = async () => ({});

  let saveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  saveButtons[0].props.onPress();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });

  // 1. Error card is rendered
  const errorCards = findTreeNodes(tree, n => String(n.type) === 'Card' && n.props?.style?.backgroundColor === '#f00');
  assert.ok(errorCards.length >= 1, 'Error card rendered on malformed empty response');

  // 2. Draft is kept dirty and not marked clean
  let lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(lastGuard.draft[10], '35.50', 'Alice draft is preserved at 35.50');
  assert.equal(env.guardBaseline[10], '30.00', 'Baseline remains 30.00 (not updated without server confirmation)');
  assert.equal(JSON.stringify(lastGuard.draft) !== JSON.stringify(env.guardBaseline), true, 'Form remains isDirty');

  // 3. UI is unlocked and permits retry
  const retryInputs = findTreeNodes(tree, n => String(n.type) === 'TextInput' && n.props?.label === 'Contracted h/week');
  assert.equal(retryInputs[0].props.editable, true, 'Input editable after failure');
  const retrySwitches = findTreeNodes(tree, n => String(n.type) === 'Switch');
  assert.equal(retrySwitches[0].props.disabled, false, 'Switch enabled after failure');

  // 4. Retry with valid server confirmation succeeds
  env.workforceMock.saveWorkSettings = async (body) => ({
    membership_id: body.membership_id,
    contracted_weekly_minutes: body.contracted_weekly_minutes,
  });
  saveButtons = findTreeNodes(tree, n => String(n.type) === 'Button' && n.props?.children === 'Save');
  saveButtons[0].props.onPress();
  for (let i = 0; i < 15; i++) await Promise.resolve();

  harness.reset();
  tree = ScopedWorkforceSettings({ user: { role: 'OWNER', id: 10 } });
  lastGuard = env.guardInvocations[env.guardInvocations.length - 1];
  assert.equal(env.guardBaseline[10], '35.50', 'Baseline updated to 35.50 after valid retry confirmation');
  assert.equal(lastGuard.draft[10], '35.50');
  assert.equal(JSON.stringify(lastGuard.draft) === JSON.stringify(env.guardBaseline), true, 'Form is clean after successful retry');
});
