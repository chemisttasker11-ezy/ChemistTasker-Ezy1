'use client';
import {usePathname} from 'next/navigation';
import {useState} from 'react';
import {useSession} from './session-provider';
import {loginHref,logoutSession,returnDestination} from './browser-session';
export default function AccountControls(){
 const pathname=usePathname();
 const {user,status,reload}=useSession();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 if(status==='loading')return <span role="status" className="ct-account-status">Checking your session…</span>;
 if(status==='unavailable')return <button className="hub-text-button" onClick={()=>void reload()}>Reconnect account</button>;
 if(!user)return <>{pathname!=='/login'&&<a className="login" href={loginHref(returnDestination()||window.location.pathname+window.location.search)}>Log in</a>}<a className="button primary small" href="/register">Create account</a></>;
 return <div className="ct-account-controls"><a className="button primary small" href="/dashboard">My dashboard</a><details className="ct-account-menu"><summary>{user.first_name||'My account'}</summary><nav aria-label="Account"><span>{user.email}</span><a href="/marketplace/mine">My marketplace</a><a href="/hubs">Community</a>{!!Object.keys(user.content_capabilities?.areas||{}).length&&<a href="/content">Publishing</a>}<button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await logoutSession();}catch{setError('Unable to log out. Check your connection and retry.');}finally{setBusy(false);}}}>{busy?'Logging out…':'Log out'}</button>{error&&<p role="alert">{error}</p>}</nav></details></div>;
}
