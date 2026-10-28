import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { bearerBelongsToDifferentUser, safeNext, refreshBrowserSession, logoutSession } from '../landing_next/shared/browser-session.ts';
import { canAccessRoute } from '../src/components/routeAccess.ts';
import { safeHubAttachmentUrl } from '../landing_next/lib/safe-hub-attachment.ts';
import { resolveDashboardPath } from '../src/utils/dashboardPath.ts';

function sessionProviderHarness() {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = fs.readFileSync(new URL('../landing_next/shared/session-provider.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const slots = [], effects = [], listeners = new Map();
  let index = 0, mounted = false, sessionListener, current = Promise.resolve({ id: 1, role: 'PHARMACIST' });
  const react = {
    createContext: () => ({ Provider: 'Provider' }), useContext: () => {},
    useCallback: fn => fn,
    useState: initial => { const i = index++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef: initial => { const i = index++; return slots[i] ||= { current: initial }; },
    useEffect: fn => { if (!mounted) effects.push(fn); },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, window: {
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
  }, require: id => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
    if (id.includes('browser-session')) return { claimUserBrowserStorage: () => {}, watchSession: fn => { sessionListener = fn; return () => {}; } };
    if (id.includes('chemisttasker-api')) return { chemistTaskerApi: { account: { getCurrentUser: () => current } } };
    throw new Error(id);
  } });
  const render = () => { index = 0; const tree = module.exports.SessionProvider({ children: 'private workspace' }); if (!mounted) { mounted = true; effects.forEach(fn => fn()); } return tree; };
  return { render, reply: value => { current = Promise.resolve(value); }, fail: () => { current = Promise.reject(new Error('Offline')); }, event: (action, remote = true) => sessionListener(action, remote), focus: () => listeners.get('focus')() };
}

test('Next session changes invalidate same-tab state and ignore superseded identity requests', async () => {
  const app = sessionProviderHarness();
  app.render(); await new Promise(setImmediate);
  const alice = app.render();
  let finishBob;
  app.reply(new Promise(resolve => { finishBob = resolve; }));
  app.event('login', false);
  const waitingForBob = app.render();
  assert.equal(waitingForBob.props.value.user, null, 'local login clears the previous identity immediately');
  assert.notEqual(waitingForBob.key, alice.key);
  let finishCarol;
  app.reply(new Promise(resolve => { finishCarol = resolve; }));
  app.event('login');
  assert.notEqual(app.render().key, waitingForBob.key, 'each login discards any pending workspace state');
  finishCarol({ id: 3, role: 'OWNER' }); await new Promise(setImmediate);
  const carol = app.render();
  finishBob({ id: 2, role: 'OWNER' }); await new Promise(setImmediate);
  assert.equal(app.render().props.value.user.id, 3);
  assert.equal(app.render().key, carol.key, 'late responses cannot replace the legitimate current workspace');
});

test('Next session provider discards private workspace state across remote account changes and failures', async () => {
  const app = sessionProviderHarness();
  const loading = app.render(); await new Promise(setImmediate);
  const alice = app.render();
  assert.equal(alice.props.value.user.id, 1);
  assert.equal(alice.key, loading.key, 'first identity check does not remount the page');
  app.focus(); await new Promise(setImmediate);
  assert.equal(app.render().key, alice.key, 'same-account refresh preserves legitimate work');
  app.reply({ id: 2, role: 'OWNER' }); app.event('login');
  assert.notEqual(app.render().key, alice.key, 'unverified identity must unmount private state immediately');
  await new Promise(setImmediate);
  const bob = app.render();
  assert.equal(bob.props.value.user.id, 2);
  assert.notEqual(bob.key, alice.key);
  app.fail(); app.event('login'); await new Promise(setImmediate);
  const unavailable = app.render();
  assert.equal(unavailable.props.value.user, null);
  assert.notEqual(unavailable.key, bob.key);
  app.event('logout');
  assert.equal(app.render().props.value.status, 'anonymous');
  app.reply({ id: 3, role: 'PHARMACIST' }); app.event('login'); await new Promise(setImmediate);
  const restored = app.render();
  assert.equal(restored.props.value.user.id, 3);
  app.fail(); app.focus(); await new Promise(setImmediate);
  const blip = app.render();
  assert.equal(blip.props.value.status, 'unavailable');
  assert.equal(blip.key, restored.key, 'a network blip keeps the same account\'s unsaved work');
  app.reply({ id: 4, role: 'OWNER' }); app.focus(); await new Promise(setImmediate);
  assert.notEqual(app.render().key, restored.key, 'a different verified account remounts even without a session event');
});

test('verification and membership return links use the routed dashboard for the current account', () => {
  const otp = fs.readFileSync(new URL('../src/pages/MobileOTPVerify.tsx', import.meta.url), 'utf8');
  const membership = fs.readFileSync(new URL('../src/pages/MembershipApplyPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(otp, /location\.assign\('\/dashboard'\)/);
  assert.match(otp, /resolveDashboardPath\(/);
  assert.doesNotMatch(membership, /user\?'\/dashboard'/);
  assert.match(membership, /resolveDashboardPath\(user\.role\)/);
  const pricing = fs.readFileSync(new URL('../src/pages/PricingPage.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(pricing, /navigate\('\/dashboard'\)/);
  for (const role of ['OWNER', 'PHARMACIST', 'OTHER_STAFF', 'EXPLORER', 'ORG_ADMIN', 'PHARMACY_MANAGER']) {
    assert.notEqual(resolveDashboardPath(role), '/dashboard');
  }
  assert.match(membership, /:'\/login'/, 'anonymous visitors keep their legitimate login destination');
});

test('account connection errors reuse the styled recovery state and keep legitimate sessions mounted', () => {
  const auth = fs.readFileSync(new URL('../src/contexts/AuthContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(auth, /<button/);
  assert.match(auth, /<DashboardContentState[\s\S]*?kind="error"[\s\S]*?actionLabel="Reconnect"/);
  assert.match(auth, /<Button[\s\S]*?minHeight: ?44[\s\S]*?>Retry logout<\/Button>/);
  assert.match(auth, /<AhpraProvider[^>]*>[{]children[}]<\/AhpraProvider>/);
});

for (const root of ['../landing_next/migrated/pages/', '../src/pages/']) test(`role-ineligible public shifts disable both whole-shift and slot application controls (${root})`, () => {
  const read = path => fs.readFileSync(new URL(root + path, import.meta.url), 'utf8');
  const board = read('PublicJobBoardPage.tsx');
  assert.match(board, /canApply: raw\.can_apply \?\? raw\.canApply/);
  const list = read('dashboard/sidebar/ShiftsBoard/components/ShiftList.tsx');
  for (const name of ['shiftActionsDisabled', 'slotActionsDisabled']) {
    const expression = list.match(new RegExp(`const ${name} = (.*);`))[1];
    const disabled = vm.runInNewContext(`shift => ${expression}`, { actionsDisabled: false, disableActionGuards: true, interactionLocked: false, slotLevelLocked: false });
    assert.equal(disabled({ canApply: false }), true);
    assert.equal(disabled({ canApply: true }), false);
    assert.equal(disabled({}), false, 'anonymous visitors can still start sign-in');
  }
});

test('reported phone targets retain at least 44px and desktop shell targets stay 46px', () => {
  const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const map = read('../landing_next/migrated/pages/dashboard/sidebar/ShiftsBoard/components/ShiftList.tsx');
  assert.match(map, /aria-label={`Show map[\s\S]*?sx={{[^}]*minWidth: 44[^}]*minHeight: 44/);
  const report = read('../shared/ReportButton.tsx');
  assert.match(report, /minHeight: 44, minWidth: 44/);
  const css = read('../landing_next/app/globals.css');
  for (const rule of css.matchAll(/\.hero-personas>a\s*\{([^}]+)\}/g)) {
    for (const height of rule[1].matchAll(/min-height:\s*(\d+)px/g)) assert.ok(Number(height[1]) >= 44);
  }
  const shell = read('../src/layouts/DashboardTopShell.tsx');
  assert.match(shell, /width: { xs: 44, md: 46 }/);
  assert.match(shell, /height: { xs: 44, md: 46 }/);
});

test('return links preserve permitted destinations and reject external or login loops',()=>{
 for(const path of ['/content','/content/invite/example','/hubs/posts/12?reply=4#comments','/dashboard/pharmacist/overview'])assert.equal(safeNext(path),path);
 for(const path of ['https://example.com','//example.com','/\\example.com','/login?next=/login','javascript:alert(1)','/hubs/../../login','/dashboard/owner/logout?workspace=internal&pharmacy_id=2','/dashboard/admin/1/logout/','/dashboard/pharmacist/%6cogout',null])assert.equal(safeNext(path),null);
});

test('cookie authority only reconciles a known cross-user bearer identity',()=>{
 assert.equal(bearerBelongsToDifferentUser(11,12),true);
 assert.equal(bearerBelongsToDifferentUser(12,12),false);
 assert.equal(bearerBelongsToDifferentUser(null,12),false);
 assert.equal(bearerBelongsToDifferentUser(12,null),false);
});
test('concurrent consumers share one cookie refresh and failures release the pending request',async()=>{
 const original=globalThis.fetch;let rotations=0;
 globalThis.fetch=async url=>{await new Promise(resolve=>setTimeout(resolve,5));if(String(url).endsWith('/csrf/'))return Response.json({csrfToken:'test-csrf'});rotations++;return Response.json({access:'test-access',refresh:'test-refresh'});};
 try{const [a,b]=await Promise.all([refreshBrowserSession(),refreshBrowserSession()]);assert.equal(rotations,1);assert.equal(a.access,b.access);
 globalThis.fetch=async()=>{throw new TypeError('Network unavailable');};await assert.rejects(refreshBrowserSession(),/Network unavailable/);
 globalThis.fetch=async url=>Response.json(String(url).endsWith('/csrf/')?{csrfToken:'new-csrf'}:{access:'new-access',refresh:'new-refresh'});
 assert.equal((await refreshBrowserSession()).access,'new-access');
 }finally{globalThis.fetch=original;}
});

test('logout waits for refresh, sends once, and only then announces logout',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalStorage=globalThis.localStorage;
 const store=new Map();globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 globalThis.window=new EventTarget();const order=[];window.addEventListener('ct:session-changed',()=>order.push('announced'));
 globalThis.fetch=async url=>{if(String(url).endsWith('/csrf/'))return Response.json({csrfToken:'csrf'});if(String(url).includes('/refresh/')){await new Promise(r=>setTimeout(r,10));order.push('refresh');return Response.json({access:'access',refresh:'refresh'});}order.push('logout');return new Response(null,{status:204});};
 try{const refreshing=refreshBrowserSession();const first=logoutSession(),second=logoutSession();assert.equal(first,second);await assert.rejects(refreshBrowserSession(),e=>e.status===401);await refreshing;await first;assert.deepEqual(order,['refresh','logout','announced']);}
 finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.localStorage=originalStorage;}
});

test('failed logout does not announce success and can be retried',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=globalThis.window,originalStorage=globalThis.localStorage;
 globalThis.window=new EventTarget();globalThis.localStorage=undefined;let announcements=0;window.addEventListener('ct:session-changed',()=>announcements++);
 globalThis.fetch=async url=>String(url).endsWith('/csrf/')?Response.json({csrfToken:'csrf'}):Response.json({detail:'Try again'},{status:503});
 try{await assert.rejects(logoutSession(),/Try again/);assert.equal(announcements,0);globalThis.localStorage={setItem(){}};globalThis.fetch=async url=>String(url).endsWith('/csrf/')?Response.json({csrfToken:'csrf'}):new Response(null,{status:204});
 // Web Locks is absent in Node; provide the minimal lease storage used by this browser fallback.
 const store=new Map();globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 await logoutSession();assert.equal(announcements,1);}
 finally{globalThis.fetch=originalFetch;globalThis.window=originalWindow;globalThis.localStorage=originalStorage;}
});

test('pharmacy admins inherit the owner-side workspace while capabilities remain separately enforceable',()=>{
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requiredRole:'OWNER',isAdminUser:true}),true);
 assert.equal(canAccessRoute({userRole:'OWNER',requiredRole:'OWNER',isAdminUser:false}),true);
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requireAdmin:true,isAdminUser:true}),true);
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requiredRole:'ORG_ADMIN',hasOrgRole:true}),true);
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requiredRole:'OWNER',isAdminUser:true,requiresCapability:true,hasRequiredCapability:false}),false);
});


test('public hub attachment URLs stay on the protected same-site endpoint',()=>{
 assert.equal(safeHubAttachmentUrl('/api/hub/attachments/42/',42),'/api/hub/attachments/42/');
 assert.equal(safeHubAttachmentUrl('/api/v1/public-hub/attachments/42/',42),'/api/hub/attachments/42/');
 for(const value of ['javascript:alert(1)','https://evil.example/file.pdf','//evil.example/file.pdf','/api/hub/attachments/43/','/media/private.pdf','data:text/html,x']){
  assert.equal(safeHubAttachmentUrl(value,42),undefined);
 }
});


test('capability-gated manager routes reject authenticated users without the capability',()=>{
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requiresCapability:true,hasRequiredCapability:false}),false);
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requiresCapability:true,hasRequiredCapability:true}),true);
 assert.equal(canAccessRoute({userRole:'OWNER',requiresCapability:true,hasRequiredCapability:true}),true);
});

const require = createRequire(import.meta.url);
const ts = require('typescript');

function evaluateInvoiceCode(code, context = {}) {
  return vm.runInNewContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
}

for (const [editor, file, handler] of [
  ['web', '../src/pages/finance/InvoiceComposer.tsx', 'submit'],
  ['mobile', '../../frontend_mobile/roles/shared/invoices/FinanceInvoiceEditor.tsx', 'save'],
]) {
  for (const [scenario, customerId, assignments, expectedSaves] of [
    ['accepted shift without a saved customer', 0, [9], 1],
    ['external invoice without a customer', 0, [], 0],
    ['legitimate external customer', 7, [], 1],
  ]) test(`${editor} invoice save: ${scenario}`, async () => {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    const start = source.indexOf(`  const ${handler} = async`);
    const code = source.slice(start, source.indexOf('  const field =', start));
    const saved = [], errors = [];
    const value = { customer_id: customerId, source_assignment_ids: assignments,
      issuer_name: 'Legitimate worker', lines: [{ description: 'Accepted work' }] };
    await evaluateInvoiceCode(`${code}\n${handler}({preventDefault() {}});`, {
      value, submitting: { current: false }, running: { current: false }, initial: undefined,
      setAttempted() {}, setBusy() {}, setBusinessOpen() {}, setError: error => errors.push(error),
      showError: error => errors.push(error), errorMessage: String,
      finance: { saveInvoice: async draft => saved.push(draft) }, onSaved: async () => {}, onClose() {},
    });
    assert.equal(saved.length, expectedSaves, errors.join('; '));
    if (expectedSaves) assert.equal(saved[0], value);
    else assert.ok(errors.some(Boolean), 'Missing external customer must still be rejected');
  });
}

test('legacy invoice recipients follow the active dashboard, including worker admin accounts', () => {
  const policy = fs.readFileSync(new URL('../src/utils/invoiceIssuer.ts', import.meta.url), 'utf8');
  const detail = fs.readFileSync(new URL('../src/pages/dashboard/sidebar/InvoiceDetailPage.tsx', import.meta.url), 'utf8');
  const decision = detail.match(/const is(?:Owner|Recipient) = (.+);/)[1];
  for (const [role, pathname, expected] of [
    ['ORG_ADMIN', '/dashboard/organization/invoice/42', true],
    ['PHARMACIST', '/dashboard/admin/101/invoice/42', true],
    ['OWNER', '/dashboard/owner/invoice/42', true],
    ['PHARMACIST', '/dashboard/pharmacist/invoice/42', false],
    ['OTHER_STAFF', '/dashboard/otherstaff/invoice/42', false],
  ]) {
    const exports = {};
    const recipient = evaluateInvoiceCode(`${policy}\n${decision}`, { exports, user: { role }, location: { pathname } });
    assert.equal(recipient, expected, `${role} in ${pathname}`);
  }
});

test('legacy mobile invoice suggests the shared SG rate and preserves an agreed onboarding rate', () => {
  const source = fs.readFileSync(new URL('../../frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx', import.meta.url), 'utf8');
  const shared = fs.readFileSync(new URL('../../shared-core/src/domains/shifts/postingDraft.ts', import.meta.url), 'utf8');
  const rate = shared.match(/export const SUPER_GUARANTEE_PERCENT = (\d+);/)[1];
  const initial = source.match(/const \[superRateSnapshot, setSuperRateSnapshot\] = useState<number>\((.+)\);/)[1];
  const override = source.match(/if \(onboarding\?\.super_rate_snapshot\)[\s\S]*?setSuperRateSnapshot\(Number\(onboarding.super_rate_snapshot\)\);/)[0];
  for (const [onboarding, expected] of [[{}, 12], [{ super_rate_snapshot: '11.50' }, 11.5]]) {
    let actual = evaluateInvoiceCode(initial, { SUPER_GUARANTEE_PERCENT: Number(rate) });
    evaluateInvoiceCode(override, { onboarding, setSuperRateSnapshot: value => { actual = value; } });
    assert.equal(actual, expected);
  }
});

test('cached chat activation refreshes missed messages before marking them read', async () => {
  const source = fs.readFileSync(new URL('../src/pages/dashboard/sidebar/chat/ChatPage.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const start = source.indexOf('  useEffect(() => {\n    if (!activeRoomId) return;');
  const end = source.indexOf('  }, [activeRoomId]);', start) + '  }, [activeRoomId]);'.length;
  const output = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [];
  let state = { 11: { messages: [{ id: 20, body: 'Seen', created_at: '2026-10-26T00:00:00Z' }], nextUrl: null, hasMore: false } };
  const context = vm.createContext({ activeRoomId: 11, messagesMap: state,
    useEffect: fn => fn(), setTypingState: () => {}, setIsLoadingMessages: () => {},
    setMessagesMap: update => { state = update(state); calls.push('render'); },
    fetchRoomMessagesService: async () => { calls.push('fetch'); return { messages: [{ id: 21, body: 'Missed', created_at: '2026-10-26T00:01:00Z' }, ...state[11].messages], next: '/page2' }; },
    fetchRoom: async () => ({ id: 11 }),
    markRoomAsReadService: async () => { calls.push('read'); return null; },
    setRooms: () => {}, refreshUnreadCount: () => {}, console,
  });
  vm.runInContext(output, context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls, ['fetch', 'render', 'read']);
  assert.deepEqual(Array.from(state[11].messages, msg => msg.body), ['Seen', 'Missed']);
  assert.equal(state[11].nextUrl, '/page2');
  assert.equal(state[11].hasMore, true, 'missed messages beyond the latest page must remain reachable');
});

test('publishing workspace remounts private state on logout and account switch', () => {
  let session = { user: { id: 4 }, status: 'authenticated' };
  const code = fs.readFileSync(new URL('../landing_next/app/content/workspace.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require: id => {
    if (id.includes('session-provider')) return { useSession: () => session };
    if (id === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
    if (id === 'react') return { useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect: () => {}, useCallback: value => value };
    if (id.includes('rich-content')) return { emptyDocument: {} };
    return {};
  }});
  vm.runInContext(output, context);
  const signedIn = module.exports.default();
  session = { user: null, status: 'anonymous' };
  const signedOut = module.exports.default();
  assert.notEqual(signedIn.key, signedOut.key, 'logout must unmount the private workspace and its pending requests');
  session = { user: { id: 5 }, status: 'authenticated' };
  const switched = module.exports.default();
  assert.notEqual(switched.key, signedIn.key, 'another user must receive a fresh workspace');
  assert.equal(module.exports.default().key, switched.key, 'the same signed-in user keeps their draft');
});

function loadTokenService({ localStorage, sessionStorage, window, refreshBrowserSession, watchSession }) {
  const code = fs.readFileSync(new URL('../landing_next/migrated/utils/tokenService.ts', import.meta.url), 'utf8');
  const transpiled = (ts.transpileModule || ts.default?.transpileModule)(code, {
    compilerOptions: {
      module: (ts.ModuleKind || ts.default?.ModuleKind).CommonJS,
      target: (ts.ScriptTarget || ts.default?.ScriptTarget).ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  const customRequire = (id) => {
    if (id.includes('browser-session')) return { refreshBrowserSession, watchSession: watchSession || (() => {}) };
    if (id.includes('api')) return { API_BASE_URL: 'https://example.test' };
    if (id.includes('shared-core')) return { browserWebSocketTicket: async () => 'ws-ticket' };
    return require(id);
  };

  const context = vm.createContext({
    module,
    exports: module.exports,
    require: customRequire,
    localStorage,
    sessionStorage,
    window,
    Event: globalThis.Event || class Event { constructor(type) { this.type = type; } },
    atob: globalThis.atob,
    Date: globalThis.Date,
    console: globalThis.console,
  });

  vm.runInContext(transpiled, context);
  return module.exports;
}

test('tokenService restoreTokensFromStorage cleans legacy tokens and retains local access in memory', async () => {
  const localMap = new Map([
    ['ct_access', 'legacy-local-access'],
    ['ct_refresh', 'legacy-local-refresh'],
    ['ct_auth_storage', 'local'],
  ]);
  const sessionMap = new Map([
    ['ct_access', 'legacy-session-access'],
    ['ct_refresh', 'legacy-session-refresh'],
  ]);
  const localStorage = {
    getItem: (k) => localMap.get(k) ?? null,
    setItem: (k, v) => localMap.set(k, String(v)),
    removeItem: (k) => localMap.delete(k),
  };
  const sessionStorage = {
    getItem: (k) => sessionMap.get(k) ?? null,
    setItem: (k, v) => sessionMap.set(k, String(v)),
    removeItem: (k) => sessionMap.delete(k),
  };
  const window = new EventTarget();
  const tokenService = loadTokenService({ localStorage, sessionStorage, window });

  await tokenService.restoreTokensFromStorage();
  assert.equal(tokenService.getAccessToken(), 'legacy-local-access');
  assert.equal(tokenService.getRefreshToken(), null);

  assert.equal(localMap.has('ct_access'), false);
  assert.equal(localMap.has('ct_refresh'), false);
  assert.equal(sessionMap.has('ct_access'), false);
  assert.equal(sessionMap.has('ct_refresh'), false);
  assert.equal(localMap.get('ct_auth_storage'), 'local');
});

test('tokenService restoreTokensFromStorage uses sessionStorage when configured and purges storage refresh', async () => {
  const localMap = new Map([
    ['ct_access', 'legacy-local-access'],
    ['ct_refresh', 'legacy-local-refresh'],
    ['ct_auth_storage', 'session'],
  ]);
  const sessionMap = new Map([
    ['ct_access', 'session-access-token'],
    ['ct_refresh', 'session-refresh-token'],
  ]);
  const localStorage = {
    getItem: (k) => localMap.get(k) ?? null,
    setItem: (k, v) => localMap.set(k, String(v)),
    removeItem: (k) => localMap.delete(k),
  };
  const sessionStorage = {
    getItem: (k) => sessionMap.get(k) ?? null,
    setItem: (k, v) => sessionMap.set(k, String(v)),
    removeItem: (k) => sessionMap.delete(k),
  };
  const window = new EventTarget();
  const tokenService = loadTokenService({ localStorage, sessionStorage, window });

  await tokenService.restoreTokensFromStorage();
  assert.equal(tokenService.getAccessToken(), 'session-access-token');
  assert.equal(tokenService.getRefreshToken(), null);

  assert.equal(localMap.has('ct_access'), false);
  assert.equal(localMap.has('ct_refresh'), false);
  assert.equal(sessionMap.has('ct_access'), false);
  assert.equal(sessionMap.has('ct_refresh'), false);
});

test('tokenService performs cookie-only refresh and clears in-memory tokens on logout', async () => {
  const localMap = new Map();
  const sessionMap = new Map();
  const localStorage = {
    getItem: (k) => localMap.get(k) ?? null,
    setItem: (k, v) => localMap.set(k, String(v)),
    removeItem: (k) => localMap.delete(k),
  };
  const sessionStorage = {
    getItem: (k) => sessionMap.get(k) ?? null,
    setItem: (k, v) => sessionMap.set(k, String(v)),
    removeItem: (k) => sessionMap.delete(k),
  };
  const window = new EventTarget();
  let watchCallback = null;
  const tokenService = loadTokenService({
    localStorage,
    sessionStorage,
    window,
    watchSession: (cb) => { watchCallback = cb; },
    refreshBrowserSession: async () => ({ access: 'cookie-access-token' }),
  });

  const refreshed = await tokenService.refreshCookieSession(true);
  assert.equal(refreshed?.access, 'cookie-access-token');
  assert.equal(tokenService.getAccessToken(), 'cookie-access-token');
  assert.equal(tokenService.getRefreshToken(), '');

  assert.equal(typeof watchCallback, 'function');
  watchCallback('logout');
  assert.equal(tokenService.getAccessToken(), null);
  assert.equal(tokenService.getRefreshToken(), null);
});

test('resolveDashboardPath maps roles to valid dashboard routes with optional subpath', () => {
  // Negative controls: non-standard roles or roles with underscores must not produce broken paths like /dashboard/orgstaff/shifts/123
  assert.equal(resolveDashboardPath('ORG_STAFF', 'shifts/123'), '/dashboard/organization/shifts/123');
  assert.equal(resolveDashboardPath('ORG_ADMIN', 'shifts/123'), '/dashboard/organization/shifts/123');
  assert.equal(resolveDashboardPath('ORG_OWNER', 'shifts/123'), '/dashboard/organization/shifts/123');
  assert.equal(resolveDashboardPath('CHIEF_ADMIN', 'shifts/123'), '/dashboard/organization/shifts/123');
  assert.equal(resolveDashboardPath('REGION_ADMIN', 'shifts/123'), '/dashboard/organization/shifts/123');
  assert.equal(resolveDashboardPath('ORGANIZATION', 'shifts/123'), '/dashboard/organization/shifts/123');
  assert.equal(resolveDashboardPath('PHARMACY_MANAGER', 'shifts/123'), '/dashboard/admin-invitations');

  // Positive controls: standard roles resolve to their respective dashboard paths
  assert.equal(resolveDashboardPath('OWNER', 'shifts/123'), '/dashboard/owner/shifts/123');
  assert.equal(resolveDashboardPath('PHARMACIST', 'shifts/123'), '/dashboard/pharmacist/shifts/123');
  assert.equal(resolveDashboardPath('OTHER_STAFF', 'shifts/123'), '/dashboard/otherstaff/shifts/123');
  assert.equal(resolveDashboardPath('EXPLORER', 'shifts/123'), '/dashboard/explorer/shifts/123');

  // Default overview path
  assert.equal(resolveDashboardPath('PHARMACIST'), '/dashboard/pharmacist/overview');
  assert.equal(resolveDashboardPath('ORG_STAFF'), '/dashboard/organization/overview');
  assert.equal(resolveDashboardPath(null), '/dashboard');
});
