const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/**
 * Regression Proof: WorkspaceSwitch multi-option rendering & callbacks
 *
 * Scope policy correctness (isInternalPharmacyMembership, getAdminPersonaAssignments)
 * is already covered by shared-core unit tests.
 * This test suite explicitly verifies the UI renderer and options wiring in frontend_mobile:
 *  1. RoleWorkspaceProvider produces all 4 scope options (Platform + 3 pharmacies)
 *     for a PHARMACIST user with multiple memberships.
 *  2. RoleWorkspaceProvider produces all 4 persona options (Pharmacist + 3 admin assignments).
 *  3. SwitchPill renders accessible radio items with correct selected/checked states.
 *  4. Invoking radio callbacks beyond the second option executes the proper 4th pharmacy
 *     and 3rd admin workspace actions without deadlocks or state desync.
 *
 * SwitchPill and SwitchContext are private inside components/shell/WorkspaceSwitch.tsx;
 * they are exposed ONLY via VM-appended exports below, leaving production code untouched.
 */

function getTs() {
  try {
    return require('typescript');
  } catch {
    const candidatePath = path.resolve(__dirname, '../node_modules/typescript');
    return require(candidatePath);
  }
}

const ts = getTs();

function loadWorkspaceSwitch(mocks = {}) {
  const filePath = path.resolve(__dirname, '../components/shell/WorkspaceSwitch.tsx');
  let source = fs.readFileSync(filePath, 'utf8');

  // Append test exports without mutating production code on disk
  source += `
// Test-only exports appended in VM
exports.__testSwitchPill = SwitchPill;
exports.__testSwitchContext = SwitchContext;
`;

  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  });

  const makeIcon = (name) => {
    const Icon = (props) => ({ type: `Icon_${name}`, props });
    Icon.displayName = name;
    return Icon;
  };

  const defaultMocks = {
    react: {
      createContext: (defaultValue) => {
        const ctx = {
          _currentValue: defaultValue,
          Provider: ({ value, children }) => {
            ctx._currentValue = value;
            return { type: 'SwitchContext.Provider', props: { value, children } };
          },
          Consumer: ({ children }) => children(ctx._currentValue),
        };
        return ctx;
      },
      useContext: (ctx) => ctx._currentValue,
      useState: (initial) => {
        let val = initial;
        return [val, (next) => { val = next; }];
      },
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      useRef: (init) => ({ current: init }),
      useEffect: () => {},
      createElement: (type, props, ...children) => {
        const flatChildren = children.flat(Infinity).filter((c) => c !== undefined && c !== null);
        return {
          type,
          props: {
            ...props,
            children: flatChildren.length === 1 ? flatChildren[0] : flatChildren,
          },
        };
      },
      Fragment: Symbol.for('react.fragment'),
    },
    'react-native': {
      StyleSheet: { create: (styles) => styles },
      Text: 'Text',
      View: 'View',
      TouchableOpacity: (props) => ({ type: 'TouchableOpacity', props }),
    },
    'lucide-react-native': {
      Building2: makeIcon('Building2'),
      Check: makeIcon('Check'),
      ChevronDown: makeIcon('ChevronDown'),
      Globe: makeIcon('Globe'),
      ShieldCheck: makeIcon('ShieldCheck'),
      Store: makeIcon('Store'),
      UserRound: makeIcon('UserRound'),
    },
    '@/components/ui': {
      BottomSheet: 'BottomSheet',
      ScalePressable: 'ScalePressable',
    },
    '@/constants/tokens': {
      colors: {
        surfaceBg: '#ffffff',
        textPrimary: '#0f172a',
        textSecondary: '#64748b',
        border: '#e2e8f0',
        accentStrong: '#0284c7',
        tone: { violet: { bg: '#EEF2FF' } },
      },
      font: {
        outfit: { medium: 'Outfit-Medium', semiBold: 'Outfit-SemiBold' },
        inter: { regular: 'Inter-Regular', medium: 'Inter-Medium', semiBold: 'Inter-SemiBold' },
      },
      persona: {
        owner: { softBg: '#EEF2FF', accentFill: '#4F46E5', textAA: '#4F46E5' },
        pharmacist: { softBg: '#E0F2FE', accentFill: '#0EA5E9', textAA: '#0369A1' },
        otherStaff: { softBg: '#DCFCE7', accentFill: '#22C55E', textAA: '#17663A' },
        explorer: { softBg: '#FFEDD5', accentFill: '#F97316', textAA: '#C2410C' },
        organization: { softBg: '#E0F2FE', accentFill: '#0369A1', textAA: '#0369A1' },
        admin: { softBg: '#EEF2FF', accentFill: '#6366F1', textAA: '#4338CA' },
      },
      radius: { pill: 999 },
      space: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20 },
      touch: { min: 48 },
      type: {
        titleLarge: { fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
        bodyLarge: { fontSize: 16, lineHeight: 24 },
        bodySmall: { fontSize: 12, lineHeight: 18 },
      },
    },
    '@/roles/shared/forms/UnsavedChangesRegistryProvider': {
      useGuardedNavigation: () => (fn) => fn(),
    },
    '@/utils/mobilePersona': {
      getAssignmentId: (assignment) => (assignment?.id != null ? Number(assignment.id) : null),
      getAssignmentPharmacyName: (assignment) => assignment?.pharmacy_name ?? `Pharmacy #${assignment?.pharmacy_id}`,
    },
    '@/context/AdminWorkspaceContext': {
      useAdminWorkspace: () => ({
        assignments: [],
        activeAssignment: null,
        activePharmacyName: '',
        selectAssignment: async () => {},
      }),
    },
    '@/roles/shared/dashboard/dashboardScope': {
      usePersonaSwitch: () => ({
        assignments: [],
        canSwitchToOrg: false,
        roleLabel: 'Pharmacist',
        activeAdmin: false,
        activeOrg: false,
        openRoleWorkspace: () => {},
        enterAdminWorkspace: () => {},
        openOrganizationWorkspace: () => {},
      }),
      useScopedDashboard: () => ({
        workspace: 'platform',
        selectedPharmacyId: null,
        pharmacies: [],
        scopeLabel: 'ChemistTasker Platform',
        selectPlatform: () => {},
        selectPharmacy: () => {},
        selectAllOrganizationPharmacies: () => {},
        canSelectPlatform: true,
      }),
    },
  };

  const mergedMocks = { ...defaultMocks, ...mocks };

  const moduleExports = {};
  const moduleObj = { exports: moduleExports };
  const customRequire = (specifier) => {
    if (mergedMocks[specifier]) return mergedMocks[specifier];
    try {
      return require(specifier);
    } catch {
      throw new Error(`Unhandled mock for: ${specifier}`);
    }
  };

  const context = vm.createContext({
    module: moduleObj,
    exports: moduleExports,
    require: customRequire,
    console,
    process,
  });

  vm.runInContext(outputText, context);
  return moduleObj.exports;
}

test('RoleWorkspaceProvider: produces 4 scope options (Platform + 3 pharmacies) and 4 persona options (Pharmacist + 3 admin personas)', () => {
  const testPharmacies = [
    { id: 101, name: 'Alpha Pharmacy Bondi', helper: 'Locum' },
    { id: 102, name: 'Beta Pharmacy Manly', helper: 'Casual' },
    { id: 103, name: 'Gamma Pharmacy Surry Hills', helper: 'Part-time' },
  ];

  const testAssignments = [
    { id: 501, pharmacy_id: 201, pharmacy_name: 'Admin Pharmacy One' },
    { id: 502, pharmacy_id: 202, pharmacy_name: 'Admin Pharmacy Two' },
    { id: 503, pharmacy_id: 203, pharmacy_name: 'Admin Pharmacy Three' },
  ];

  let selectedPharmacyId = 103; // 4th option (3rd pharmacy) active
  let currentWorkspace = 'internal';

  const mockScope = {
    workspace: currentWorkspace,
    selectedPharmacyId,
    pharmacies: testPharmacies,
    scopeLabel: 'Gamma Pharmacy Surry Hills',
    selectPlatform: () => {},
    selectPharmacy: () => {},
    selectAllOrganizationPharmacies: () => {},
    canSelectPlatform: true,
  };

  const mockPersona = {
    assignments: testAssignments,
    canSwitchToOrg: false,
    roleLabel: 'Pharmacist',
    activeAdmin: false,
    activeOrg: false,
    openRoleWorkspace: () => {},
    enterAdminWorkspace: () => {},
    openOrganizationWorkspace: () => {},
  };

  const mod = loadWorkspaceSwitch({
    '@/roles/shared/dashboard/dashboardScope': {
      usePersonaSwitch: () => mockPersona,
      useScopedDashboard: () => mockScope,
    },
  });

  const { RoleWorkspaceProvider, __testSwitchContext } = mod;
  assert.ok(RoleWorkspaceProvider, 'RoleWorkspaceProvider must be exported');
  assert.ok(__testSwitchContext, 'SwitchContext must be available in VM');

  // Render provider
  const renderedProvider = RoleWorkspaceProvider({
    personaRole: 'PHARMACIST',
    scopeRole: 'PHARMACIST',
    children: { type: 'MockChild', props: {} },
  });

  assert.equal(renderedProvider.type, __testSwitchContext.Provider);
  const contextValue = renderedProvider.props.value;

  // 1. Verify Scope Group
  assert.ok(contextValue.scope, 'Scope switch group must be present');
  assert.equal(contextValue.scope.sheetTitle, 'Choose pharmacy');
  assert.equal(contextValue.scope.options.length, 4, 'Scope must contain exactly 4 options (Platform + 3 pharmacies)');

  const [optPlatform, optP1, optP2, optP3] = contextValue.scope.options;
  assert.equal(optPlatform.key, 'platform');
  assert.equal(optPlatform.label, 'ChemistTasker Platform');
  assert.equal(optPlatform.selected, false);

  assert.equal(optP1.key, 'pharmacy-101');
  assert.equal(optP1.label, 'Alpha Pharmacy Bondi');
  assert.equal(optP1.selected, false);

  assert.equal(optP2.key, 'pharmacy-102');
  assert.equal(optP2.label, 'Beta Pharmacy Manly');
  assert.equal(optP2.selected, false);

  assert.equal(optP3.key, 'pharmacy-103');
  assert.equal(optP3.label, 'Gamma Pharmacy Surry Hills');
  assert.equal(optP3.selected, true, '4th option (Gamma Pharmacy) must reflect selected: true');

  // 2. Verify Persona Group
  assert.ok(contextValue.persona, 'Persona switch group must be present');
  assert.equal(contextValue.persona.sheetTitle, 'Switch workspace');
  assert.equal(contextValue.persona.options.length, 4, 'Persona must contain exactly 4 options (Pharmacist + 3 admin personas)');

  const [persRole, persA1, persA2, persA3] = contextValue.persona.options;
  assert.equal(persRole.key, 'role');
  assert.equal(persRole.label, 'Pharmacist');
  assert.equal(persRole.selected, true, 'Role option must be selected when not in admin mode');

  assert.equal(persA1.key, 'admin-501');
  assert.equal(persA1.helper, 'Admin Pharmacy One');
  assert.equal(persA1.selected, false);

  assert.equal(persA2.key, 'admin-502');
  assert.equal(persA2.helper, 'Admin Pharmacy Two');
  assert.equal(persA2.selected, false);

  assert.equal(persA3.key, 'admin-503');
  assert.equal(persA3.helper, 'Admin Pharmacy Three');
  assert.equal(persA3.selected, false);
});

test('SwitchPill JSX: renders radio accessibility items and invokes callbacks beyond second option', () => {
  let selectedPharmacyTarget = null;
  let enteredAdminId = null;

  const testPharmacies = [
    { id: 101, name: 'Alpha Pharmacy Bondi' },
    { id: 102, name: 'Beta Pharmacy Manly' },
    { id: 103, name: 'Gamma Pharmacy Surry Hills' },
  ];

  const testAssignments = [
    { id: 501, pharmacy_id: 201, pharmacy_name: 'Admin Pharmacy One' },
    { id: 502, pharmacy_id: 202, pharmacy_name: 'Admin Pharmacy Two' },
    { id: 503, pharmacy_id: 203, pharmacy_name: 'Admin Pharmacy Three' },
  ];

  const mockScope = {
    workspace: 'internal',
    selectedPharmacyId: 103, // 4th option selected
    pharmacies: testPharmacies,
    scopeLabel: 'Gamma Pharmacy Surry Hills',
    selectPlatform: () => { selectedPharmacyTarget = 'PLATFORM'; },
    selectPharmacy: (p) => { selectedPharmacyTarget = p.id; },
    selectAllOrganizationPharmacies: () => {},
    canSelectPlatform: true,
  };

  const mockPersona = {
    assignments: testAssignments,
    canSwitchToOrg: false,
    roleLabel: 'Pharmacist',
    activeAdmin: false,
    activeOrg: false,
    openRoleWorkspace: () => {},
    enterAdminWorkspace: (id) => { enteredAdminId = id; },
    openOrganizationWorkspace: () => {},
  };

  const mod = loadWorkspaceSwitch({
    '@/roles/shared/dashboard/dashboardScope': {
      usePersonaSwitch: () => mockPersona,
      useScopedDashboard: () => mockScope,
    },
  });

  const { RoleWorkspaceProvider, __testSwitchPill } = mod;

  const provider = RoleWorkspaceProvider({
    personaRole: 'PHARMACIST',
    scopeRole: 'PHARMACIST',
    children: null,
  });
  const contextValue = provider.props.value;

  // Render Scope SwitchPill JSX
  const scopePillTree = __testSwitchPill({ group: contextValue.scope, grow: true });
  // The multi-option pill renders [ScalePressable (pill), BottomSheet]
  assert.ok(Array.isArray(scopePillTree.props.children), 'SwitchPill should return pill trigger and BottomSheet');
  const bottomSheet = scopePillTree.props.children.find((c) => c?.type === 'BottomSheet');
  assert.ok(bottomSheet, 'BottomSheet must be rendered when options > 1');
  assert.equal(bottomSheet.props.title, 'Choose pharmacy');

  // BottomSheet contains options View
  const optionsView = bottomSheet.props.children;
  const radioItems = Array.isArray(optionsView.props.children)
    ? optionsView.props.children
    : [optionsView.props.children];

  assert.equal(radioItems.length, 4, 'Must render 4 radio options for scope');

  // Verify radio props for 3rd and 4th options (beyond second)
  const option3 = radioItems[2]; // index 2: Beta Pharmacy (102)
  assert.equal(option3.props.accessibilityRole, 'radio');
  assert.equal(option3.props.accessibilityState?.selected, false);
  assert.equal(option3.props.accessibilityState?.checked, false);

  const option4 = radioItems[3]; // index 3: Gamma Pharmacy (103)
  assert.equal(option4.props.accessibilityRole, 'radio');
  assert.equal(option4.props.accessibilityState?.selected, true, '4th option must have selected: true');
  assert.equal(option4.props.accessibilityState?.checked, true, '4th option must have checked: true');

  // Invoke 3rd option callback (unselected, triggers onSelect)
  option3.props.onPress();
  assert.equal(selectedPharmacyTarget, 102, 'Pressing 3rd option (Beta Pharmacy) must select pharmacy ID 102');

  // Render Persona SwitchPill JSX
  const personaPillTree = __testSwitchPill({ group: contextValue.persona, grow: false });
  const personaBottomSheet = personaPillTree.props.children.find((c) => c?.type === 'BottomSheet');
  assert.ok(personaBottomSheet, 'BottomSheet must be rendered for persona switch');
  assert.equal(personaBottomSheet.props.title, 'Switch workspace');

  const personaRadioItems = personaBottomSheet.props.children.props.children;
  assert.equal(personaRadioItems.length, 4, 'Must render 4 radio options for persona');

  // Option index 3: 3rd Admin assignment (ID 503, "Admin Pharmacy Three")
  const adminOption3 = personaRadioItems[3];
  assert.equal(adminOption3.props.accessibilityRole, 'radio');
  assert.equal(adminOption3.props.accessibilityState?.selected, false);

  // Invoke 3rd admin option callback
  adminOption3.props.onPress();
  assert.equal(enteredAdminId, 503, 'Pressing 3rd admin option must invoke enterAdminWorkspace with ID 503');
});

test('WorkspacePills: renders screen title header when no switches available and pills when switches present', () => {
  const mod = loadWorkspaceSwitch();
  const { WorkspacePills, __testSwitchContext } = mod;

  // 1. Single-workspace / no switches state: renders plain Text header
  __testSwitchContext._currentValue = { persona: null, scope: null };
  const emptyHeader = WorkspacePills({ title: 'My Schedule' });
  assert.equal(emptyHeader.type, 'Text');
  assert.equal(emptyHeader.props.accessibilityRole, 'header');
  assert.equal(emptyHeader.props.children, 'My Schedule');

  // 2. Multi-workspace state: renders View pills container
  __testSwitchContext._currentValue = {
    persona: { sheetTitle: 'Switch workspace', label: 'Pharmacist', options: [{ key: 'role', label: 'Pharmacist', selected: true }] },
    scope: { sheetTitle: 'Choose pharmacy', label: 'ChemistTasker Platform', options: [{ key: 'platform', label: 'ChemistTasker Platform', selected: true }] },
  };
  const pillsContainer = WorkspacePills({ title: 'Pharmacist' });
  assert.equal(pillsContainer.type, 'View');
  assert.ok(Array.isArray(pillsContainer.props.children));
  assert.equal(pillsContainer.props.children.length, 2, 'Must render persona pill and scope pill');
});
