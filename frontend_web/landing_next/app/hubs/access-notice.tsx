'use client';
import Link from 'next/link';
import {useSession} from '@/shared/session-provider';
import {loginHref} from '@/shared/browser-session';

export default function AccessNotice({hub,path}:{hub:string;path:string}) {
 const {user,status,reload}=useSession();
 if(status==='loading')return <p role="status">Checking your posting access…</p>;
 if(status==='unavailable')return <p>We couldn’t check your account. <button onClick={()=>void reload()}>Reconnect</button></p>;
 if(!user)return <p><Link href={loginHref(path)}>Sign in</Link> with your existing ChemistTasker account to post and interact in your eligible hubs.</p>;
 const audience:Record<string,string>={public:'verified ChemistTasker members',pharmacist:'pharmacists',intern:'interns',staff:'Other Staff, including pharmacy assistants and dispensary technicians',explorer:'Explorers',owner:'pharmacy owners'};
 return <p>You’re signed in. Posting and interaction here are for {audience[hub]||'eligible members'} with a verified account. You can read and share these discussions, or <Link href="/hubs">explore your communities</Link>.</p>;
}
