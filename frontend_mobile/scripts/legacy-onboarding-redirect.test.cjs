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

test('app/pharmacist/onboarding renders Redirect to /pharmacist/profile-basic-info', () => {
  const sourcePath = path.resolve(__dirname, '../app/pharmacist/onboarding.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  // Verify static source wiring
  assert.match(source, /import\s+React\s+from\s+'react'/);
  assert.match(source, /import\s+\{\s*Redirect\s*\}\s+from\s+'expo-router'/);
  assert.match(source, /<Redirect\s+href="\/pharmacist\/profile-basic-info"\s*\/>/);

  // Transpile and run in VM
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const mocks = {
    react: {
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    },
    'expo-router': {
      Redirect: 'Redirect',
    },
  };

  const exports = {};
  const context = {
    exports,
    module: { exports },
    require: (spec) => mocks[spec] || require(spec),
    console,
  };

  vm.runInNewContext(transpiled, context);
  const Component = exports.default;
  assert.equal(typeof Component, 'function');

  const rendered = Component();
  assert.equal(rendered.type, 'Redirect');
  assert.equal(rendered.props.href, '/pharmacist/profile-basic-info');
});

test('ChooseAccountTypeCard routes Pharmacist to /pharmacist/profile-basic-info with confirmation before API call', async () => {
  const sourcePath = path.resolve(__dirname, '../components/ChooseAccountTypeCard.tsx');
  const source = fs.readFileSync(sourcePath, 'utf8');

  // Static checks
  assert.match(source, /role:\s*'PHARMACIST'.*onboardingPath:\s*'\/pharmacist\/profile-basic-info'/);
  assert.match(source, /role:\s*'OTHER_STAFF'.*onboardingPath:\s*'\/otherstaff\/profile-basic-info'/);
  assert.doesNotMatch(source, /'\/pharmacist\/onboarding'/, 'Obsolete /pharmacist/onboarding path must be removed');

  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const chooseAccountTypeCalls = [];
  let refreshUserCalls = 0;
  const replacedRoutes = [];

  const state = [];
  let cursor = 0;

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
    useMemo(fn) { return fn(); },
    useCallback(fn) { return fn; },
  };

  let renderedConfirmProps = null;
  const renderedRowButtons = [];

  const mocks = {
    react: reactMock,
    'react/jsx-runtime': {
      jsx: (t, p) => {
        if (t === 'ConfirmDialog' || (p && 'open' in p && 'confirmLabel' in p)) {
          renderedConfirmProps = p;
        }
        if (t === mocks['@/components/ui'].ScalePressable && typeof p?.onPress === 'function') {
          renderedRowButtons.push(p);
        }
        return { type: t, props: p };
      },
      jsxs: (t, p) => {
        if (t === 'ConfirmDialog' || (p && 'open' in p && 'confirmLabel' in p)) {
          renderedConfirmProps = p;
        }
        if (t === mocks['@/components/ui'].ScalePressable && typeof p?.onPress === 'function') {
          renderedRowButtons.push(p);
        }
        return { type: t, props: p };
      },
      Fragment: 'Fragment',
    },
    'react-native': {
      View: 'View',
      Text: 'Text',
      StyleSheet: { create: (s) => s },
    },
    'expo-router': {
      useRouter: () => ({
        replace: (route) => replacedRoutes.push(route),
      }),
    },
    'lucide-react-native': {
      ChevronRight: () => null,
    },
    '@/context/AuthContext': {
      useAuth: () => ({
        user: { id: 101, role: 'PHARMACY_MANAGER' },
        refreshUser: async () => { refreshUserCalls++; },
      }),
    },
    '@chemisttasker/shared-core': {
      chooseAccountType: async (role, payload) => {
        chooseAccountTypeCalls.push({ role, payload });
      },
    },
    '@/components/ui': {
      ConfirmDialog: (p) => { renderedConfirmProps = p; return { type: 'ConfirmDialog', props: p }; },
      ScalePressable: (p) => {
        if (typeof p.onPress === 'function') renderedRowButtons.push(p);
        return { type: 'ScalePressable', props: p };
      },
      SectionCard: (p) => ({ type: 'SectionCard', props: p }),
    },
    '@/components/ui/BrandActivityIndicator': {
      BrandActivityIndicator: 'ActivityIndicator',
    },
    '@/components/AuthLayout': {
      AuthNotice: (p) => ({ type: 'AuthNotice', props: p }),
    },
    '@/constants/tokens': {
      colors: { textPrimary: '#000', textSecondary: '#666', border: '#ccc', pressBg: '#eee' },
      font: { outfit: { medium: 'Outfit' }, inter: { semiBold: 'Inter' } },
      radius: { card: 12 },
      space: { sm: 8, md: 12, lg: 16 },
      touch: { min: 44 },
      type: { labelLarge: {} },
    },
  };

  const exports = {};
  const context = {
    exports,
    module: { exports },
    require: (spec) => mocks[spec] || require(spec),
    console,
    Date,
    String,
    Boolean,
    Array,
    Object,
  };

  vm.runInNewContext(transpiled, context);
  const ChooseAccountTypeCard = exports.default;

  // 1. Initial render
  cursor = 0;
  renderedRowButtons.length = 0;
  ChooseAccountTypeCard({ pharmacyId: 555 });

  // Dialog must be initially closed
  assert.ok(renderedConfirmProps);
  assert.equal(renderedConfirmProps.open, false);
  assert.equal(chooseAccountTypeCalls.length, 0, 'No API call before user action');

  // 2. Click the Pharmacist row button
  assert.ok(renderedRowButtons.length >= 1, 'Account type row buttons rendered');
  const pharmacistRow = renderedRowButtons[0]; // First item in ACCOUNT_TYPES is PHARMACIST
  pharmacistRow.onPress();

  // Re-render after state change
  cursor = 0;
  renderedRowButtons.length = 0;
  ChooseAccountTypeCard({ pharmacyId: 555 });

  // Dialog is now open, but still NO API call
  assert.equal(renderedConfirmProps.open, true, 'Confirmation dialog opens after row tap');
  assert.equal(chooseAccountTypeCalls.length, 0, 'No API call before explicit confirmation');
  assert.match(renderedConfirmProps.title, /personal pharmacist profile/i);

  // 3. Confirm in the dialog
  await renderedConfirmProps.onConfirm();
  await new Promise(setImmediate);

  // Verify API call made with correct parameters
  assert.equal(chooseAccountTypeCalls.length, 1, 'API called once after confirmation');
  assert.equal(chooseAccountTypeCalls[0].role, 'PHARMACIST');
  assert.deepEqual(JSON.parse(JSON.stringify(chooseAccountTypeCalls[0].payload)), {
    pharmacy_id: 555,
    staff_role: 'PHARMACIST',
  });

  // Verify user refreshed and routed to /pharmacist/profile-basic-info
  assert.equal(refreshUserCalls, 1, 'User profile refreshed');
  assert.equal(replacedRoutes.length, 1);
  assert.equal(replacedRoutes[0], '/pharmacist/profile-basic-info', 'Replaced route is /pharmacist/profile-basic-info');
});
