import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { bearerBelongsToDifferentUser, safeNext, refreshBrowserSession, logoutSession } from '../landing_next/shared/browser-session.ts';
import { canAccessRoute } from '../src/components/routeAccess.ts';
import { safeHubAttachmentUrl } from '../landing_next/lib/safe-hub-attachment.ts';
import { resolveDashboardPath } from '../src/utils/dashboardPath.ts';

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
