const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const getTs = () => require('typescript');

function getRouteNodes(dir, baseDir = dir) {
  const nodes = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('+')) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(baseDir, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      if (fs.readdirSync(full).some(f => f.startsWith('_layout.'))) nodes.push(rel);
      else nodes.push(...getRouteNodes(full, baseDir));
    } else if (/\.(tsx|ts|jsx|js)$/.test(e.name)) nodes.push(rel.replace(/\.(tsx|ts|jsx|js)$/, ''));
  }
  return nodes.sort();
}

function getTitleKeys(layoutPath) {
  const text = fs.readFileSync(layoutPath, 'utf8');
  const m = text.match(/const titles: Record<string, string> = {([\s\S]*?)};/);
  return [...m[1].matchAll(/(?:'([^']+)'|"([^"]+)"|([a-zA-Z0-9_\-]+))\s*:/g)].map(x => x[1] || x[2] || x[3]).sort();
}

const mockReact = {
  useMemo: fn => fn(), useEffect: () => {},
  Children: { toArray: c => (Array.isArray(c) ? c.flat(Infinity) : c != null ? [c] : []).filter(Boolean) },
  isValidElement: el => Boolean(el && typeof el === 'object' && el.type),
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(x => x !== undefined) } }),
};

const customRequire = id => {
  if (id === 'react') return mockReact;
  if (id === 'expo-router') {
    const Tabs = Object.assign(() => {}, { Screen: 'Tabs.Screen' });
    const Stack = Object.assign(() => {}, { Screen: 'Stack.Screen' });
    return { Tabs, Stack, useRouter: () => ({}), useSegments: () => [] };
  }
  if (id === '@/constants/tokens') return { colors: { pageBg: '#fff' } };
  if (id === './useShellChrome') return { useShellChrome: () => ({ unreadCount: 0, photoUrl: null, openNotifications: () => {} }) };
  if (id === './WorkspaceSwitch') return { AdminWorkspaceSwitchProvider: p => p.children, RoleWorkspaceProvider: p => p.children };
  if (id === './ShellContext') return { ShellContext: { Provider: p => p.children }, isRootRoute: () => false, tabPath: () => '' };
  if (id === 'react-native') return { BackHandler: { addEventListener: () => ({ remove: () => {} }) }, StyleSheet: { create: x => x }, View: 'View' };
  return {};
};

function loadPersonaShell() {
  const ts = getTs();
  const src = fs.readFileSync(path.resolve(__dirname, '../components/shell/PersonaShell.tsx'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const exp = {};
  vm.runInNewContext(js, { exports: exp, module: { exports: exp }, require: customRequire, React: mockReact });
  return exp.PersonaShell;
}

function findElement(el, predicate) {
  if (!el || typeof el !== 'object') return null;
  if (predicate(el)) return el;
  const ch = el.props?.children;
  if (Array.isArray(ch)) {
    for (const c of ch) { const f = findElement(c, predicate); if (f) return f; }
  } else if (ch) return findElement(ch, predicate);
  return null;
}

test('all 5 roles filesystem route nodes match declared layout titles exactly', () => {
  const roles = ['pharmacist', 'otherstaff', 'owner', 'explorer', 'organization'];
  for (const role of roles) {
    const roleDir = path.resolve(__dirname, '../app', role);
    assert.deepEqual(getRouteNodes(roleDir), getTitleKeys(path.join(roleDir, '_layout.tsx')), `Role ${role} mismatch`);
  }
});

test('transpiled PersonaShell renders complete child routes as reachable Tabs.Screen and 5 visible tabs', () => {
  const PersonaShell = loadPersonaShell();
  const roleTabsMap = {
    pharmacist: [{ name: 'dashboard' }, { name: 'shifts/index' }, { name: 'invoice' }, { name: 'chat' }],
    otherstaff: [{ name: 'dashboard' }, { name: 'shifts/index' }, { name: 'invoice' }, { name: 'chat' }],
    owner: [{ name: 'dashboard' }, { name: 'shifts/index' }, { name: 'post-shift' }, { name: 'chat' }],
    explorer: [{ name: 'dashboard' }, { name: 'shifts' }, { name: 'talent-board' }, { name: 'chat' }],
    organization: [{ name: 'dashboard' }, { name: 'shifts/index' }, { name: 'pharmacies/index' }, { name: 'chat' }],
  };
  for (const role of ['pharmacist', 'otherstaff', 'owner', 'explorer', 'organization']) {
    const roleDir = path.resolve(__dirname, '../app', role);
    const titlesArray = getTitleKeys(path.join(roleDir, '_layout.tsx'));
    const titles = Object.fromEntries(titlesArray.map(k => [k, k]));
    const customChild = role === 'organization' ? mockReact.createElement('Tabs.Screen', { name: 'index' }) : undefined;
    const vnode = PersonaShell({
      tabs: roleTabsMap[role], titles, fallbackTitle: role, more: [], account: [],
      navigate: () => {}, onBack: () => {}, profileRoute: `/${role}/profile`, notificationsRoute: `/${role}/notifications`,
      workspace: { kind: 'role', personaRole: role.toUpperCase() }, children: customChild,
    });
    const tabsEl = findElement(vnode, el => typeof el.type === 'function' && el.type.Screen === 'Tabs.Screen');
    assert.ok(tabsEl, `${role} rendered Tabs navigator`);
    const screens = [tabsEl.props.children].flat(Infinity).filter(x => x && x.type === 'Tabs.Screen');
    const names = screens.map(s => s.props.name);
    assert.deepEqual([...names].sort(), titlesArray, `${role} declares exactly real route nodes`);
    assert.equal(new Set(names).size, names.length, `${role} screen names must be unique without duplicates`);
    for (const route of titlesArray) assert.ok(names.includes(route), `${role} missing screen for ${route}`);
    assert.equal(tabsEl.props.tabBar({}).props.tabs.length, 5, `${role} tab bar must preserve exactly 5 tabs`);

    if (role === 'pharmacist' || role === 'otherstaff') {
      const avail = screens.find(s => s.props.name === 'availability');
      const pub = screens.find(s => s.props.name === 'publish-availability');
      assert.notEqual(avail.props.options?.href, null);
      assert.notEqual(avail.props.options?.hidden, true);
      assert.notEqual(pub.props.options?.href, null);
      assert.notEqual(pub.props.options?.hidden, true);
      const roster = screens.find(s => s.props.name === 'roster');
      assert.notEqual(roster.props.options?.href, null, 'custom bar hides switched-out roster without route-hidden flags');
    }
  }
});

test('admin role retains stack navigator without Tabs', () => {
  const PersonaShell = loadPersonaShell();
  const vnode = PersonaShell({
    tabs: [{ name: 'dashboard', label: 'Home' }], titles: { index: 'Admin Dashboard' }, fallbackTitle: 'Admin',
    more: [], account: [], navigate: () => {}, onBack: () => {}, profileRoute: '/admin', notificationsRoute: '/admin/notifications',
    workspace: { kind: 'admin', personaRole: 'ADMIN' }, stack: true,
  });
  assert.ok(findElement(vnode, el => typeof el.type === 'function' && el.type.Screen === 'Stack.Screen'), 'Admin must use Stack');
  assert.equal(findElement(vnode, el => typeof el.type === 'function' && el.type.Screen === 'Tabs.Screen'), null, 'Admin must not render Tabs');
});

test('SDK58 useVisibleTabsWithRedirect permits secondary screens without hidden flag', () => {
  const hookPath = path.resolve(__dirname, '../node_modules/expo-router/build/standard-navigation/useVisibleTabsWithRedirect.js');
  const code = fs.readFileSync(fs.existsSync(hookPath) ? hookPath : require.resolve('expo-router/build/standard-navigation/useVisibleTabsWithRedirect.js'), 'utf8');
  const runHook = (focusedName, options, isDeclared = true) => {
    let replaced = null;
    const exp = {};
    const req = id => {
      if (id === 'react') return { useMemo: fn => fn(), useEffect: fn => fn() };
      if (id === '../Route') return { useRouteNode: () => ({ initialRouteName: 'dashboard' }) };
      if (id === '../constants') return { NOT_FOUND_ROUTE_NAME: '+not-found' };
      if (id === '../global-state/useRouterActions') return { useRouterActions: () => ({ replace: h => { replaced = h; } }) };
      if (id === '../layouts/GuardContext') return { useGuardRedirect: () => undefined };
      if (id === '../link/preview/PreviewRouteContext') return { useIsPreview: () => false };
      if (id === '../react-navigation/native') return { useIsFocused: () => true };
      if (id === '../routeNode') return { getValidInitialRouteName: () => 'dashboard' };
      if (id === '../utils/orderRoutesByRouteNames') return { orderRoutesByRouteNames: r => r };
      if (id === './useBuildHref') return { useBuildHref: () => (r => '/' + r.name) };
      return {};
    };
    vm.runInNewContext(code, { exports: exp, module: { exports: exp }, require: req, __DEV__: false, console });
    exp.useVisibleTabsWithRedirect({
      routes: [{ key: 'dash_k', name: 'dashboard' }, { key: 'focus_k', name: focusedName }],
      routeNames: ['dashboard', focusedName],
      focusedRouteKey: 'focus_k',
      descriptors: {
        dash_k: { routeSource: 'layout', options: {} },
        focus_k: isDeclared ? { routeSource: 'layout', options } : { options },
      },
    });
    return replaced;
  };
  const PersonaShell = loadPersonaShell();
  const vnode = PersonaShell({
    tabs: [{ name: 'dashboard' }, { name: 'shifts/index' }, { name: 'invoice' }, { name: 'chat' }],
    titles: { dashboard: 'dashboard', availability: 'availability', 'publish-availability': 'publish-availability' },
    fallbackTitle: 'pharmacist', more: [], account: [], navigate: () => {}, onBack: () => {},
    profileRoute: '/pharmacist/profile', notificationsRoute: '/pharmacist/notifications',
    workspace: { kind: 'role', personaRole: 'PHARMACIST' },
  });
  const tabsEl = findElement(vnode, el => typeof el.type === 'function' && el.type.Screen === 'Tabs.Screen');
  const screens = [tabsEl.props.children].flat(Infinity).filter(x => x && x.type === 'Tabs.Screen');
  const availOpts = screens.find(s => s.props.name === 'availability')?.props.options;
  const pubOpts = screens.find(s => s.props.name === 'publish-availability')?.props.options;
  assert.equal(runHook('availability', availOpts), null, 'availability can focus without replace');
  assert.equal(runHook('publish-availability', pubOpts), null, 'publish can focus without replace');
  assert.equal(runHook('availability', { hidden: true }), '/dashboard', 'hidden:true redirects Home');
  assert.equal(runHook('undeclared', {}, false), '/dashboard', 'undeclared route redirects Home');
});
