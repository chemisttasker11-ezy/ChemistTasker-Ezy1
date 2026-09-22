// Shared by the public Next.js site and the Vite dashboard. No tokens in storage.
export type SessionUser={id:number;email:string;first_name?:string;last_name?:string;role:string;content_capabilities?:{administrator:boolean;areas:Record<string,string>}};
export const SESSION_EVENT='ct:session-changed';
const EVENT_KEY='ct:session-event';
export function announceSession(action:'login'|'logout') {
 window.dispatchEvent(new CustomEvent(SESSION_EVENT,{detail:action}));
 localStorage.setItem(EVENT_KEY,JSON.stringify({action,at:Date.now()}));
}
export function watchSession(listener:(action:string)=>void) {
 const local=(event:Event)=>listener((event as CustomEvent).detail);
 const remote=(event:StorageEvent)=>{if(event.key===EVENT_KEY&&event.newValue){try{listener(JSON.parse(event.newValue).action);}catch{}}};
 window.addEventListener(SESSION_EVENT,local);window.addEventListener('storage',remote);
 return ()=>{window.removeEventListener(SESSION_EVENT,local);window.removeEventListener('storage',remote);};
}
export function safeNext(value:unknown):string|null {
 if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||/[\\\x00-\x1f]/.test(value))return null;
 try{const u=new URL(value,'https://chemisttasker.invalid');if(u.origin!=='https://chemisttasker.invalid')return null;
 if(!/^\/(dashboard|onboarding|setup|kiosk|hubs|blog|news|content|calculator|shifts|talent|marketplace|learning|how-it-works|membership|referee|organization)(\/|$)/.test(u.pathname))return null;
 return u.pathname+u.search+u.hash;}catch{return null;}
}
export function rememberDestination(value:unknown){const path=safeNext(value);if(path)sessionStorage.setItem('ct:return-to',path);return path;}
export function returnDestination(){return safeNext(new URLSearchParams(window.location.search).get('next'))||safeNext(sessionStorage.getItem('ct:return-to'));}
export function finishDestination(path:string){sessionStorage.removeItem('ct:return-to');window.location.assign(path);}
export function loginHref(path:string){return `/login?next=${encodeURIComponent(safeNext(path)||'/dashboard')}`;}

async function decode<T>(response:Response):Promise<T>{
 if(response.status===204)return undefined as T;
 const data=await response.json().catch(()=>({detail:'Unexpected service response.'}));
 if(!response.ok)throw Object.assign(new Error(typeof data.detail==='string'?data.detail:Object.entries(data).map(([key,v])=>`${key}: ${Array.isArray(v)?v.join(' '):JSON.stringify(v)}`).join(' ')||'Request failed.'),{status:response.status});
 return data;
}
export async function csrfToken(root='/api') {const result=await decode<{csrfToken:string}>(await fetch(`${root}/users/csrf/`,{credentials:'include',cache:'no-store',headers:{'X-Client-Platform':'web'}}));return result.csrfToken;}
let signingOut:Promise<void>|undefined;
type BrowserRefresh={access:string;refresh?:string};
let pending:Promise<BrowserRefresh>|undefined;
export function refreshBrowserSession(root='/api') {
 if(signingOut)return Promise.reject(Object.assign(new Error('You have signed out.'),{status:401}));
 if(pending)return pending;
 const renew=async()=>decode<BrowserRefresh>(await fetch(`${root}/users/token/refresh/`,{method:'POST',credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','X-CSRFToken':await csrfToken(root),'X-Client-Platform':'web'},body:'{}'}));
 // Read cookies only once the lock is acquired, so rotation in another tab is visible.
 pending=(async()=>navigator.locks?await navigator.locks.request('chemisttasker-refresh',renew):await refreshWithLease(renew))().finally(()=>{pending=undefined;});return pending;
}
// Compatibility path for browsers without Web Locks. Store coordination metadata only.
async function refreshWithLease<T>(renew:()=>Promise<T>):Promise<T>{
 if(typeof localStorage==='undefined')return renew();
 const key='ct:refresh-lease',owner=crypto.randomUUID(),deadline=Date.now()+35000;
 while(Date.now()<deadline){
  const raw=localStorage.getItem(key);let lease:{owner?:string;until?:number}={};try{lease=JSON.parse(raw||'{}');}catch{}
  if(!lease.until||lease.until<Date.now()){
   localStorage.setItem(key,JSON.stringify({owner,until:Date.now()+30000}));
   await new Promise(resolve=>setTimeout(resolve,50));
   if(JSON.parse(localStorage.getItem(key)||'{}').owner===owner){try{return await renew();}finally{if(JSON.parse(localStorage.getItem(key)||'{}').owner===owner)localStorage.removeItem(key);}}
  }
  await new Promise(resolve=>setTimeout(resolve,150));
 }
 throw new Error('Your session is busy in another tab. Please retry.');
}
export async function browserRequest<T>(url:string,method='GET',body?:unknown,retry=true):Promise<T>{
 const headers:Record<string,string>={'X-Client-Platform':'web'};const multipart=body instanceof FormData;
 if(!['GET','HEAD'].includes(method))headers['X-CSRFToken']=await csrfToken();
 if(!multipart)headers['Content-Type']='application/json';
 const response=await fetch(url,{method,headers,credentials:'include',cache:'no-store',body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
 if(response.status===401&&retry&&!url.includes('/login/')&&!url.includes('/token/refresh/')){
  try{await refreshBrowserSession();}catch(error){if((error as {status?:number}).status!==401)throw error;return decode<T>(response);}
  return browserRequest<T>(url,method,body,false);
 }
 return decode<T>(response);
}
export function logoutSession(root='/api'):Promise<void> {
 if(signingOut)return signingOut;
 const clear=async()=>{await decode(await fetch(`${root}/users/logout/`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRFToken':await csrfToken(root),'X-Client-Platform':'web'},body:'{}'}));announceSession('logout');};
 signingOut=(async()=>{if(pending)await pending.catch(()=>{});if(navigator.locks)await navigator.locks.request('chemisttasker-refresh',clear);else await refreshWithLease(clear);})().finally(()=>{signingOut=undefined;});
 return signingOut;
}
