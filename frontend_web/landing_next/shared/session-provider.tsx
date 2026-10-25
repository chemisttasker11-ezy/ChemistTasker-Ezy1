'use client';
import {createContext,useCallback,useContext,useEffect,useState,useRef} from 'react';
import {claimUserBrowserStorage,watchSession,type SessionUser} from './browser-session';
import {chemistTaskerApi} from '@/lib/chemisttasker-api';
type Session={user:SessionUser|null;status:'loading'|'authenticated'|'anonymous'|'unavailable';reload:()=>Promise<void>};
const Context=createContext<Session>({user:null,status:'loading',reload:async()=>{}});
export function SessionProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<SessionUser|null>(null),[status,setStatus]=useState<Session['status']>('loading');
 const [identityVersion,setIdentityVersion]=useState(0);
 const generation=useRef(0),verifiedId=useRef<number|null>(null);
 // A different verified account (even without a session event) remounts the tree; first load and network blips do not.
 const settle=useCallback((id:number|null)=>{if(verifiedId.current!==null&&verifiedId.current!==id)setIdentityVersion(version=>version+1);verifiedId.current=id;},[]);
 const reload=useCallback(async()=>{const request=++generation.current;try{const current=await chemistTaskerApi.account.getCurrentUser<SessionUser>();if(request!==generation.current)return;settle(current.id);claimUserBrowserStorage(current.id);setUser(current);setStatus('authenticated');}catch(error){if(request!==generation.current)return;if((error as {status?:number}).status===401){settle(null);setUser(null);setStatus('anonymous');}else setStatus('unavailable');}},[settle]);
 useEffect(()=>{void reload();const stop=watchSession(action=>{
  generation.current++;verifiedId.current=null;setIdentityVersion(version=>version+1);setUser(null);
  if(action==='logout'){setStatus('anonymous');}else{setStatus('loading');void reload();}
 });const focus=()=>void reload();window.addEventListener('focus',focus);return()=>{generation.current++;stop();window.removeEventListener('focus',focus);};},[reload]);
 // Remount account-scoped descendants before another identity can reuse their private state.
 return <Context.Provider key={identityVersion} value={{user,status,reload}}>{children}</Context.Provider>;
}
export const useSession=()=>useContext(Context);
