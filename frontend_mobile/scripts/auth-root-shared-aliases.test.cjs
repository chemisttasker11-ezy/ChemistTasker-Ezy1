const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let ts;
try {
  ts = require('typescript');
} catch {
  ts = require(path.resolve(__dirname, '../node_modules/typescript'));
}

const layoutPath = path.resolve(__dirname, '../app/_layout.tsx');
const layoutSource = fs.readFileSync(layoutPath, 'utf8');

function extractAuthGateBundle(overrideCodeModifier) {
  const sf = ts.createSourceFile('app/_layout.tsx', layoutSource, ts.ScriptTarget.Latest, true);
  let authGateNode = null;
  let hasAdminAccessNode = null;

  sf.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (node.name.text === 'AuthGate') authGateNode = node;
      if (node.name.text === 'hasAdminAccess') hasAdminAccessNode = node;
    }
  });

  assert.ok(authGateNode, 'AuthGate function declaration must exist in app/_layout.tsx AST');
  assert.ok(hasAdminAccessNode, 'hasAdminAccess function declaration must exist in app/_layout.tsx AST');

  const printer = ts.createPrinter();
  let rawBundle = [
    printer.printNode(ts.EmitHint.Unspecified, hasAdminAccessNode, sf),
    printer.printNode(ts.EmitHint.Unspecified, authGateNode, sf),
    'exports.AuthGate = AuthGate;',
    'exports.hasAdminAccess = hasAdminAccess;',
  ].join('\n\n');

  if (typeof overrideCodeModifier === 'function') {
    rawBundle = overrideCodeModifier(rawBundle);
  }

  const { outputText } = ts.transpileModule(rawBundle, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });

  return outputText;
}

function runAuthGateInVM(transpiledCode, {
  route = { pathname: '/invoices', segments: ['invoices'], params: {} },
  user = { role: 'PHARMACIST', is_mobile_verified: true, mobile_check_skipped: false },
  ahpra = { summary: { state: 'active', frozen: false }, loading: false, refusal: null, clearRefusal: () => {} },
  hasCapability = () => false,
  selectedPharmacyId = null,
} = {}) {
  const routerCalls = [];
  const routerMock = {
    replace: (target) => routerCalls.push({ action: 'replace', target }),
    push: (target) => routerCalls.push({ action: 'push', target }),
  };

  let registeredEffect = null;
  let effectCleanup = null;

  const context = {
    exports: {},
    module: { exports: {} },
    require: (id) => {
      if (id === 'react/jsx-runtime') {
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
          Fragment: 'Fragment',
        };
      }
      return require(id);
    },
    console,
    Date,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    URLSearchParams,
    Error,
    useRouter: () => routerMock,
    usePathname: () => route.pathname,
    useLocalSearchParams: () => route.params || {},
    useSegments: () => route.segments || [],
    useAuth: () => ({ user, isLoading: false, hasCapability }),
    useWorkspace: () => ({ selectedPharmacyId }),
    useAhpra: () => ahpra,
    useEffect: (fn) => { registeredEffect = fn; },
    View: 'View',
    BrandLoader: 'BrandLoader',
    AhpraStatus: 'AhpraStatus',
    ownerSetupPaths: { dashboard: '/owner/dashboard' },
    getOwnerSetupStatus: async () => ({ nextPath: null, isComplete: true }),
    sanitizeReturnTo: (url) => (url && typeof url === 'string' && url.startsWith('/') ? url : null),
    evaluateRouteDecision: () => ({ type: 'allow' }),
    isPublicShiftRoute: () => false,
    getAssignmentPharmacyId: () => null,
    getRoleHome: (role) => (role === 'OWNER' ? '/owner/home' : role === 'PHARMACIST' ? '/pharmacist/home' : '/otherstaff/home'),
    getSelectedAdminAssignment: async () => null,
    hasOrganizationAccess: () => false,
    readPersonaSelection: async () => null,
    resolveInitialWorkspace: async (u) => (u?.role === 'OWNER' ? '/owner/home' : '/pharmacist/home'),
  };

  vm.runInNewContext(transpiledCode, context);
  const AuthGate = context.exports.AuthGate;
  const tree = AuthGate();

  return {
    tree,
    routerCalls,
    flush: async () => {
      if (registeredEffect) {
        effectCleanup = registeredEffect();
      }
      for (let i = 0; i < 25; i++) await Promise.resolve();
      return {
        routerCalls,
        cleanup: () => {
          if (typeof effectCleanup === 'function') effectCleanup();
        },
      };
    },
  };
}

test('AuthGate AST bundle extracts genuine production functions containing invoices alias', () => {
  const code = extractAuthGateBundle();
  assert.match(code, /function AuthGate\(\)/, 'Must contain genuine AuthGate function');
  assert.match(code, /function hasAdminAccess\(/, 'Must contain genuine hasAdminAccess function');
  assert.match(code, /allowAuthenticatedAccess = new Set\(\[[^\]]*'invoices'[^\]]*\]\)/, 'AuthGate must include invoices in allowAuthenticatedAccess Set');
  assert.match(code, /'notifications'/, 'AuthGate must retain notifications alias');
  assert.match(code, /'app-preferences'/, 'AuthGate must retain app-preferences alias');
});

test('Authenticated roles (OWNER, PHARMACIST, OTHER_STAFF) on root invoices, notifications, and app-preferences allow access without redirect', async () => {
  const code = extractAuthGateBundle();
  const roles = ['OWNER', 'PHARMACIST', 'OTHER_STAFF'];
  const routes = [
    { pathname: '/invoices', segments: ['invoices'] },
    { pathname: '/notifications', segments: ['notifications'] },
    { pathname: '/app-preferences', segments: ['app-preferences'] },
  ];

  for (const role of roles) {
    for (const route of routes) {
      const runner = runAuthGateInVM(code, {
        route,
        user: { role, is_mobile_verified: true, mobile_check_skipped: false },
      });
      const { routerCalls } = await runner.flush();
      assert.deepEqual(
        routerCalls,
        [],
        `Role ${role} on ${route.pathname} must NOT be redirected (must stay on screen)`
      );
    }
  }
});

test('Negative proof: removing invoices from allowAuthenticatedAccess causes AuthGate to redirect authenticated users to role home', async () => {
  // Synthesize AST bundle where 'invoices' is omitted from allowAuthenticatedAccess Set
  const codeWithoutInvoices = extractAuthGateBundle((src) =>
    src.replace(/'invoices',\s*/, '')
  );

  assert.doesNotMatch(
    codeWithoutInvoices,
    /'invoices'/,
    'Negative proof bundle must have invoices removed'
  );

  // 1. OWNER on /invoices without alias redirects to dashboard/home
  const ownerRunner = runAuthGateInVM(codeWithoutInvoices, {
    route: { pathname: '/invoices', segments: ['invoices'] },
    user: { role: 'OWNER', is_mobile_verified: true, mobile_check_skipped: false },
  });
  const ownerResult = await ownerRunner.flush();
  assert.equal(ownerResult.routerCalls.length, 1, 'OWNER must be redirected when invoices alias is missing');
  assert.equal(ownerResult.routerCalls[0].target, '/owner/dashboard');

  // 2. PHARMACIST on /invoices without alias redirects to /pharmacist/home
  const pharmRunner = runAuthGateInVM(codeWithoutInvoices, {
    route: { pathname: '/invoices', segments: ['invoices'] },
    user: { role: 'PHARMACIST', is_mobile_verified: true, mobile_check_skipped: false },
  });
  const pharmResult = await pharmRunner.flush();
  assert.equal(pharmResult.routerCalls.length, 1, 'PHARMACIST must be redirected when invoices alias is missing');
  assert.equal(pharmResult.routerCalls[0].target, '/pharmacist/home');

  // 3. OTHER_STAFF on /invoices without alias redirects to /otherstaff/home
  const staffRunner = runAuthGateInVM(codeWithoutInvoices, {
    route: { pathname: '/invoices', segments: ['invoices'] },
    user: { role: 'OTHER_STAFF', is_mobile_verified: true, mobile_check_skipped: false },
  });
  const staffResult = await staffRunner.flush();
  assert.equal(staffResult.routerCalls.length, 1, 'OTHER_STAFF must be redirected when invoices alias is missing');
  assert.equal(staffResult.routerCalls[0].target, '/otherstaff/home');
});

test('Guest navigating to /invoices redirects to login with returnTo=/invoices', async () => {
  const code = extractAuthGateBundle();
  const runner = runAuthGateInVM(code, {
    route: { pathname: '/invoices', segments: ['invoices'] },
    user: null,
  });
  const { routerCalls } = await runner.flush();
  assert.equal(routerCalls.length, 1, 'Guest must be redirected');
  assert.equal(routerCalls[0].action, 'replace');
  assert.equal(routerCalls[0].target.pathname, '/login');
  assert.equal(routerCalls[0].target.params.returnTo, '/invoices');
});

test('Mobile-unverified PHARMACIST navigating to /invoices redirects to /mobile-verify', async () => {
  const code = extractAuthGateBundle();
  const runner = runAuthGateInVM(code, {
    route: { pathname: '/invoices', segments: ['invoices'] },
    user: { role: 'PHARMACIST', is_mobile_verified: false, mobile_check_skipped: false },
  });
  const { routerCalls } = await runner.flush();
  assert.equal(routerCalls.length, 1, 'Unverified user must be redirected');
  assert.deepEqual(routerCalls[0], {
    action: 'replace',
    target: '/mobile-verify',
  });
});

test('Frozen AHPRA registration redirects PHARMACIST to /pharmacist/profile-basic-info', async () => {
  const code = extractAuthGateBundle();
  const runner = runAuthGateInVM(code, {
    route: { pathname: '/invoices', segments: ['invoices'] },
    user: { role: 'PHARMACIST', is_mobile_verified: true, mobile_check_skipped: false },
    ahpra: {
      summary: { state: 'active', frozen: true },
      loading: false,
      refusal: null,
      clearRefusal: () => {},
    },
  });
  const { routerCalls } = await runner.flush();
  assert.equal(routerCalls.length, 1, 'Frozen AHPRA must trigger redirection');
  assert.deepEqual(routerCalls[0], {
    action: 'replace',
    target: '/pharmacist/profile-basic-info',
  });
});

test('User without MANAGE_ROSTER capability navigating to manager route redirects to role home (caps preserved)', async () => {
  const code = extractAuthGateBundle();
  const runner = runAuthGateInVM(code, {
    route: { pathname: '/manager/roster', segments: ['manager', 'roster'] },
    user: { role: 'PHARMACIST', is_mobile_verified: true, mobile_check_skipped: false },
    hasCapability: () => false,
  });
  const { routerCalls } = await runner.flush();
  assert.equal(routerCalls.length, 1, 'Unauthorized user must be redirected away from manager route');
  assert.deepEqual(routerCalls[0], {
    action: 'replace',
    target: '/pharmacist/home',
  });
});
