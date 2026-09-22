import assert from 'node:assert/strict';
import {test} from 'node:test';
import {safeNext,refreshBrowserSession,logoutSession} from '../landing_next/shared/browser-session.ts';
import {canAccessRoute} from '../src/components/routeAccess.ts';

test('return links preserve permitted destinations and reject external or login loops',()=>{
 for(const path of ['/content','/content/invite/example','/hubs/posts/12?reply=4#comments','/dashboard/pharmacist/overview'])assert.equal(safeNext(path),path);
 for(const path of ['https://example.com','//example.com','/\\example.com','/login?next=/login','javascript:alert(1)','/hubs/../../login',null])assert.equal(safeNext(path),null);
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

test('frontend role gate does not treat a pharmacy admin as an owner',()=>{
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requiredRole:'OWNER',isAdminUser:true}),false);
 assert.equal(canAccessRoute({userRole:'OWNER',requiredRole:'OWNER',isAdminUser:false}),true);
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requireAdmin:true,isAdminUser:true}),true);
 assert.equal(canAccessRoute({userRole:'PHARMACIST',requiredRole:'ORG_ADMIN',hasOrgRole:true}),true);
});
