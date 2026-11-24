import {browserCsrfToken,browserLogoutQueue,browserRefreshSession,browserSessionIsSignedOut,isSessionRejection,LOGOUT_QUEUED_MESSAGE,markBrowserSessionSignedOut} from '@chemisttasker/shared-core';

// Shared by the public Next.js site and the Vite dashboard. No tokens in storage.
export type SessionUser={id:number;email:string;first_name?:string;last_name?:string;role:string;admin_assignments?:{id?:number|null;pharmacy_id?:number|null;admin_level?:string|null}[];content_capabilities?:{administrator:boolean;areas:Record<string,string>}};
export const SESSION_EVENT='ct:session-changed';
const EVENT_KEY='ct:session-event';
let sessionGeneration=0;
let claimedUser:string|undefined;
if(typeof window!=='undefined'&&typeof window.addEventListener==='function')window.addEventListener('storage',(event:StorageEvent)=>{if(event.key===EVENT_KEY&&event.newValue)sessionGeneration++;});
export const getSessionGeneration=()=>sessionGeneration;
// Kept on sign-out: auth mode, theme/layout prefs, kiosk activation, return path, and browser-only data scoped by user id
// (each user reads only their own key). Server-backed caches and unscoped legacy copies are wiped.
const DEVICE_KEY=/^(ct_auth_storage|ct-theme-mode|toolpad-mode|mui-.*|ct-dashboard-sidebar-collapsed|ct:session-event|ct:pending-logout|ct:signed-out|ct:cookie-session-version|ct:return-to|ct:last-login-redirect|ctk_kiosk_.*|ct:shift-skill-preset:.*|active_shift_slot_seen_v2:.*|ct:(?:hub|comment)-draft:\d+:.+|saved_shift_ids:\d+|talent\.pitch\.create:v1:.+)$/;
const OWNER_KEY='ct:storage-owner';
const clearStore=(store:Storage)=>{for(const key of Object.keys(store))if(!DEVICE_KEY.test(key))store.removeItem(key);};
/** Removes every other key (route state, shift markers, page caches) from both storages of this tab. */
export function clearUserBrowserStorage() {
 try{clearStore(localStorage);clearStore(sessionStorage);}catch{}
}
/** Call before rendering a signed-in user: a storage owned by another account, or by no proven account, is wiped. */
export function claimUserBrowserStorage(userId:unknown) {
 if(userId==null)return;
 const id=String(userId);
 if(claimedUser!==undefined&&claimedUser!==id)sessionGeneration++;
 claimedUser=id;
 try{for(const store of [localStorage,sessionStorage]){if(store.getItem(OWNER_KEY)!==id)clearStore(store);store.setItem(OWNER_KEY,id);}}catch{}
}
export function announceSession(action:'login'|'logout') {
 sessionGeneration++;
 if(action==='logout'){claimedUser=undefined;clearUserBrowserStorage();}
 window.dispatchEvent(new CustomEvent(SESSION_EVENT,{detail:action}));
 try{localStorage.setItem(EVENT_KEY,JSON.stringify({action,at:Date.now()}));}catch{}
}
export function watchSession(listener:(action:string,remote:boolean)=>void) {
 const local=(event:Event)=>listener((event as CustomEvent).detail,false);
 // Another tab signed out: drop this tab's sessionStorage too (localStorage was cleared there).
 const remote=(event:StorageEvent)=>{if(event.key===EVENT_KEY&&event.newValue){try{const {action}=JSON.parse(event.newValue);if(action==='logout')clearUserBrowserStorage();listener(action,true);}catch{}}};
 window.addEventListener(SESSION_EVENT,local);window.addEventListener('storage',remote);
 return ()=>{window.removeEventListener(SESSION_EVENT,local);window.removeEventListener('storage',remote);};
}
export function safeNext(value:unknown):string|null {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x1f]/.test(value))return null;
 try{const u=new URL(value,'https://chemisttasker.invalid');if(u.origin!=='https://chemisttasker.invalid')return null;
 const path=decodeURIComponent(u.pathname);
 if(/[\\\x00-\x1f]/.test(path)||path.startsWith('//')||/\/(?:logout|sign-out|login|sign-in|register|otp-verify|verify-otp|mobile-verify|reset-password|forgot-password)(?:\/|$)/i.test(path))return null;
 if(!/^\/(dashboard|onboarding|setup|kiosk|hubs|blog|news|content|calculator|shifts|talent|marketplace|learning|how-it-works|membership|referee|organization)(\/|$)/.test(u.pathname))return null;
 return u.pathname+u.search+u.hash;}catch{return null;}
}
export function rememberDestination(value:unknown){const path=safeNext(value);try{if(path)sessionStorage.setItem('ct:return-to',path);}catch{}return path;}
export function returnDestination(){
 const next=safeNext(new URLSearchParams(window.location.search).get('next'));
 if(next)return next;
 try{return safeNext(sessionStorage.getItem('ct:return-to'));}catch{return null;}
}
function clearReturnDestination(){try{sessionStorage.removeItem('ct:return-to');}catch{}}
export function finishDestination(path:string,navigate:(path:string)=>void=path=>window.location.assign(path)){clearReturnDestination();navigate(path);}
export function loginHref(path:string){const next=safeNext(path);return next?`/login?next=${encodeURIComponent(next)}`:'/login';}
export function expireBrowserSession(refreshError?:unknown) {
 if(typeof window==='undefined'||browserSessionIsSignedOut()||(refreshError!==undefined&&!isSessionRejection(refreshError)))return;
 if(claimedUser===undefined&&!localStorage.getItem(OWNER_KEY))return;
 const path=rememberDestination(window.location.pathname+window.location.search);
 if(!path)clearReturnDestination();
 markBrowserSessionSignedOut();
 announceSession('logout');
 const login=new URL(loginHref(path||''),window.location.origin);
 login.searchParams.set('sessionEnded','1');
 window.location.replace(login.pathname+login.search);
}
export const fetchWithBrowserSession:typeof fetch=(input,init)=>fetch(input,browserSessionIsSignedOut()?{...init,credentials:'omit'}:init);
export function bearerBelongsToDifferentUser(bearerUserId:unknown,cookieUserId:unknown){return bearerUserId!=null&&cookieUserId!=null&&String(bearerUserId)!==String(cookieUserId);}

async function decode<T>(response:Response):Promise<T>{
 if(response.status===204)return undefined as T;
 const data=await response.json().catch(()=>({detail:'Unexpected service response.'}));
 if(!response.ok)throw Object.assign(new Error(typeof data.detail==='string'?data.detail:Object.entries(data).map(([key,v])=>`${key}: ${Array.isArray(v)?v.join(' '):JSON.stringify(v)}`).join(' ')||'Request failed.'),{status:response.status});
 return data;
}
export const csrfToken=(root='/api/v1')=>browserCsrfToken({baseUrl:root});
let signingOut:Promise<void>|undefined;
type BrowserRefresh={access:string;refresh?:string};
let pending:Promise<BrowserRefresh>|undefined;
export function refreshBrowserSession(root='/api/v1') {
 if(pending)return pending;
 const generation=getSessionGeneration();
 pending=browserRefreshSession({baseUrl:root}).then(result=>{
  if(generation!==getSessionGeneration())throw new Error('Session changed during request.');
  return result;
 }).finally(()=>{pending=undefined;});
 return pending;
}
export async function browserRequest<T>(url:string,method='GET',body?:unknown,retry=true):Promise<T>{
 const headers:Record<string,string>={'X-Client-Platform':'web'};const multipart=body instanceof FormData;
 if(!['GET','HEAD'].includes(method))headers['X-CSRFToken']=await csrfToken();
 if(!multipart)headers['Content-Type']='application/json';
 const response=await fetchWithBrowserSession(url,{method,headers,credentials:'include',cache:'no-store',body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
 if(response.status===401&&retry&&!url.includes('/login/')&&!url.includes('/token/refresh/')){
  try{await refreshBrowserSession();}catch(error){if((error as {status?:number}).status!==401)throw error;return decode<T>(response);}
  return browserRequest<T>(url,method,body,false);
 }
 return decode<T>(response);
}
export function logoutSession(root='/api/v1'):Promise<void> {
 if(signingOut)return signingOut;
 const revocation=browserLogoutQueue.signOut(root);
 clearReturnDestination();
 announceSession('logout');
 signingOut=revocation.catch(()=>false).then(revoked=>{if(!revoked)window.alert(LOGOUT_QUEUED_MESSAGE);}).finally(()=>{signingOut=undefined;});
 return signingOut;
}
