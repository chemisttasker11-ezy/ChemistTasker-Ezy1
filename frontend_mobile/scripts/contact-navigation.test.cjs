const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function getTs() {
  try {
    return require('typescript');
  } catch {
    const candidatePath = path.resolve(__dirname, '../../../pr249-m1-integration-20261105/frontend_mobile/node_modules/typescript');
    return require(candidatePath);
  }
}

const ts = getTs();

function createHookSlot() {
  const stateSlots = [];
  const refSlots = [];
  const effectSlots = [];
  let stateIndex = 0;
  let refIndex = 0;

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
    useEffect: (fn) => {
      effectSlots.push(fn);
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    createElement: (type, props, ...children) => {
      const childArray = children.length === 1 ? children[0] : (children.length > 0 ? children : props?.children);
      return { type, props: { ...props, children: childArray } };
    },
  };

  const resetIndices = () => {
    stateIndex = 0;
    refIndex = 0;
    effectSlots.length = 0;
  };

  const runEffects = () => {
    for (const eff of effectSlots) eff();
  };

  return { react, resetIndices, runEffects };
}

function loadContactModule(mocks = {}) {
  const componentPath = path.resolve(__dirname, '../app/contact.tsx');
  const sourceCode = fs.readFileSync(componentPath, 'utf8');
  const transpiled = ts.transpileModule(sourceCode, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const defaultMocks = {
    'react-native': {
      ScrollView: (props) => props,
      StyleSheet: { create: (s) => s },
      View: (props) => props,
    },
    'react-native-safe-area-context': {
      SafeAreaView: (props) => props,
    },
    'react-native-paper': {
      Button: (props) => props,
      Card: Object.assign((props) => props, { Content: (props) => props }),
      Chip: (props) => props,
      HelperText: (props) => props,
      Text: (props) => props,
      TextInput: (props) => props,
    },
    'expo-constants': { expoConfig: { version: '1.0.0' } },
    '../context/AuthContext': {
      useAuth: () => ({ user: { id: 42, email: 'user@playground.test', username: 'Test User', role: 'PHARMACIST' } }),
    },
    '@chemisttasker/shared-core': {
      contactSupport: async () => ({ success: true }),
    },
    '@/constants/tokens': {
      colors: { pageBg: '#F7FAFF', surfaceBg: '#fff', border: '#ddd', textPrimary: '#000', textSecondary: '#666', textMuted: '#999', status: { red: { fg: 'red' }, green: { fg: 'green' } } },
      radius: { card: 12 },
      space: { xs: 4, sm: 8, md: 12, lg: 16, '3xl': 32 },
      touch: { min: 48 },
    },
    '@/features/support/contactModel': {
      contactTopics: () => ['General', 'Account', 'Shifts'],
      validateContactForm: () => ({}),
    },
    '@/components/RootPageHeader': {
      RootPageHeader: (props) => props,
    },
    '@/roles/shared/forms/useUnsavedChangesGuard': {
      useUnsavedChangesGuard: () => ({
        isDirty: false,
        markClean: () => {},
        confirmDiscard: (fn) => fn(),
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
      throw new Error(`Unhandled mock for specifier: ${specifier}`);
    }
  };

  const context = vm.createContext({
    module: moduleObj,
    exports: moduleExports,
    require: customRequire,
    console,
    process,
  });

  vm.runInContext(transpiled, context);
  return moduleObj.exports;
}

test('ContactScreen renders RootPageHeader with correct title and signedOutFallback and ContactForm', () => {
  const { react } = createHookSlot();
  const { default: ContactScreen } = loadContactModule({ react });
  const rootElement = ContactScreen();
  const [headerElement, formElement] = rootElement.props.children;
  assert.ok(headerElement, 'RootPageHeader element must be in children');
  assert.equal(headerElement.props.title, 'Contact ChemistTasker');
  assert.equal(headerElement.props.signedOutFallback, '/welcome');
  assert.ok(formElement, 'ContactForm element must be in children');
});

test('ContactForm configures SafeAreaView with bottom, left, right edges to avoid double top inset', () => {
  const { react, resetIndices, runEffects } = createHookSlot();
  const { default: ContactScreen } = loadContactModule({ react });
  const rootElement = ContactScreen();
  const formElement = rootElement.props.children[1];

  resetIndices();
  const formTree = formElement.type(formElement.props);
  runEffects();

  assert.deepEqual(Array.from(formTree.props.edges), ['bottom', 'left', 'right']);
});

test('ContactForm wires useUnsavedChangesGuard with saving and title', () => {
  let guardOptions = null;
  const { react, resetIndices, runEffects } = createHookSlot();
  const { default: ContactScreen } = loadContactModule({
    react,
    '@/roles/shared/forms/useUnsavedChangesGuard': {
      useUnsavedChangesGuard: (value, options) => {
        guardOptions = options;
        return { isDirty: false, markClean: () => {} };
      },
    },
  });

  const rootElement = ContactScreen();
  const formElement = rootElement.props.children[1];

  resetIndices();
  formElement.type(formElement.props);
  runEffects();

  assert.ok(guardOptions, 'Guard must be initialized');
  assert.equal(guardOptions.title, 'Discard draft?');
  assert.equal(typeof guardOptions.saving, 'boolean');
});

test('field edit preserves draft and stops clean-baselining; successful submit resets subject/message and marks clean', async () => {
  const markCleanCalls = [];
  let supportPayload = null;
  const { react, resetIndices, runEffects } = createHookSlot();

  const { default: ContactScreen } = loadContactModule({
    react,
    '@chemisttasker/shared-core': {
      contactSupport: async (payload) => {
        supportPayload = payload;
        return { success: true };
      },
    },
    '@/roles/shared/forms/useUnsavedChangesGuard': {
      useUnsavedChangesGuard: () => ({
        isDirty: false,
        markClean: (val) => markCleanCalls.push(val),
      }),
    },
  });

  const user = { id: 42, email: 'user@playground.test', username: 'Test User', role: 'PHARMACIST' };

  // Render 1: initial mount
  resetIndices();
  const root1 = ContactScreen();
  const form1 = root1.props.children[1];
  let formTree = form1.type({ user });
  runEffects();

  // Initially, markClean called with initial form
  assert.equal(markCleanCalls.length, 1);
  assert.equal(markCleanCalls[0].name, 'Test User');
  assert.equal(markCleanCalls[0].email, 'user@playground.test');
  assert.equal(markCleanCalls[0].message, '');

  // Extract inputs and submit button
  const scrollView = formTree.props.children;
  const scrollChildren = scrollView.props.children;
  const card1 = scrollChildren[1];
  const card1Children = card1.props.children.props.children;
  const subjectInput = card1Children[2];
  const messageInput = card1Children[4];

  // Perform field edits
  subjectInput.props.onChangeText('Need Help');
  messageInput.props.onChangeText('My timesheet is missing hours');

  // Render 2: after edit
  resetIndices();
  formTree = form1.type({ user });
  runEffects();

  // Automatic clean-baselining stopped: markCleanCalls length remains 1
  assert.equal(markCleanCalls.length, 1, 'Mark clean must not be called again after edit');

  // Verify draft is preserved in formTree
  const updatedScroll = formTree.props.children.props.children;
  const updatedCard1 = updatedScroll[1].props.children.props.children;
  assert.equal(updatedCard1[2].props.value, 'Need Help');
  assert.equal(updatedCard1[4].props.value, 'My timesheet is missing hours');

  // Perform submit
  const updatedSubmitButton = updatedScroll[4];
  await updatedSubmitButton.props.onPress();
  await new Promise(setImmediate);

  // Verify support payload received
  assert.ok(supportPayload, 'contactSupport must have been called');
  assert.equal(supportPayload.subject, 'Need Help');
  assert.equal(supportPayload.message, 'My timesheet is missing hours');
  assert.equal(supportPayload.name, 'Test User');
  assert.equal(supportPayload.email, 'user@playground.test');

  // Verify markClean was called with resetForm (subject & message cleared, identity preserved)
  assert.equal(markCleanCalls.length, 2, 'markClean must be called on successful submit');
  const lastClean = markCleanCalls[1];
  assert.equal(lastClean.name, 'Test User');
  assert.equal(lastClean.email, 'user@playground.test');
  assert.equal(lastClean.subject, '');
  assert.equal(lastClean.message, '');

  // Render 3: after submit reset
  resetIndices();
  formTree = form1.type({ user });
  runEffects();

  const resetScroll = formTree.props.children.props.children;
  const resetCard1 = resetScroll[1].props.children.props.children;
  assert.equal(resetCard1[2].props.value, '');
  assert.equal(resetCard1[4].props.value, '');
});
