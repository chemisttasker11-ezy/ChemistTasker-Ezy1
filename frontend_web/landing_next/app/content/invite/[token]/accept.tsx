'use client';
import {useState} from 'react';
import Link from 'next/link';
import {useSession} from '@/shared/session-provider';
import {loginHref,rememberDestination,logoutSession} from '@/shared/browser-session';
import {contentApi} from '@/lib/browser-api';
export default function AcceptInvite({token}:{token:string}){
 const {user,status,reload}=useSession();
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [done,setDone]=useState(false);
 const returnPath=`/content/invite/${encodeURIComponent(token)}`;
 async function accept(){setBusy(true);setError('');try{await contentApi('invitations/accept/','POST',{token});await reload();setDone(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <main className="ct-card ct-invite"><p className="ct-eyebrow">ChemistTasker publishing</p><h1>{done?'Welcome to the publishing team.':'Your perspective belongs here.'}</h1>{done?<><p>Your responsibilities are ready in the publishing workspace.</p><Link className="ct-button ct-primary" href="/content">Open publishing workspace</Link></>:<><p>Accept using the verified account for the email address that received this invitation. Invitations expire after seven days.</p>{status==='loading'?<p role="status">Checking your account…</p>:status==='unavailable'?<button onClick={()=>void reload()}>Reconnect account</button>:user?<><p>Signed in as <strong>{user.email}</strong>. Your existing account will receive the assigned publishing permissions.</p><div className="ct-actions"><button className="ct-primary" disabled={busy} onClick={()=>void accept()}>{busy?'Accepting…':'Accept invitation'}</button><button disabled={busy} onClick={async()=>{try{await logoutSession();}catch(e){setError((e as Error).message);}}}>Use another account</button></div></>:<div className="ct-actions"><Link className="ct-button ct-primary" href={loginHref(returnPath)} onClick={()=>rememberDestination(returnPath)}>Log in to accept</Link><Link className="ct-button" href="/register" onClick={()=>rememberDestination(returnPath)}>Create an account</Link></div>}<p className="ct-muted">If you create an account, verify your email and return to this invitation.</p></>}{error&&<p role="alert" className="ct-message">{error}</p>}</main>;
}
