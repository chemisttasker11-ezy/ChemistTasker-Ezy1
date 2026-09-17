'use client';
import {createContext,useCallback,useContext,useEffect,useState,useRef} from 'react';
import {watchSession,type SessionUser} from './browser-session';
import {chemistTaskerApi} from '@/lib/chemisttasker-api';
type Session={user:SessionUser|null;status:'loading'|'authenticated'|'anonymous'|'unavailable';reload:()=>Promise<void>};
const Context=createContext<Session>({user:null,status:'loading',reload:async()=>{}});
export function SessionProvider({children}:{children:React.ReactNode}){
 const [user,setUser]=useState<SessionUser|null>(null),[status,setStatus]=useState<Session['status']>('loading');
 const generation=useRef(0);
 const reload=useCallback(async()=>{const request=++generation.current;try{const current=await chemistTaskerApi.account.getCurrentUser<SessionUser>();if(request!==generation.current)return;setUser(current);setStatus('authenticated');}catch(error){if(request!==generation.current)return;if((error as {status?:number}).status===401){setUser(null);setStatus('anonymous');}else setStatus('unavailable');}},[]);
 useEffect(()=>{void reload();const stop=watchSession(action=>{if(action==='logout'){generation.current++;setUser(null);setStatus('anonymous');}else void reload();});const focus=()=>void reload();window.addEventListener('focus',focus);return()=>{stop();window.removeEventListener('focus',focus);};},[reload]);
 return <Context.Provider value={{user,status,reload}}>{children}</Context.Provider>;
}
export const useSession=()=>useContext(Context);
