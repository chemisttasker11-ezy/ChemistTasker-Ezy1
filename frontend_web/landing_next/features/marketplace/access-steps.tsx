'use client';

import Link from 'next/link';
import {FormEvent,useEffect,useState} from 'react';
import {marketplaceApi,type Blocker} from './api';

type Terms={version:string;accepted:boolean;accepted_at:string|null;terms_url:string};

function onboardingHref(role:string|null,identity:boolean){
 const routes:Record<string,string>={
  OWNER:'/dashboard/owner/onboarding',PHARMACIST:'/dashboard/pharmacist/onboarding',
  INTERN:'/dashboard/otherstaff/onboarding',TECHNICIAN:'/dashboard/otherstaff/onboarding',
  ASSISTANT:'/dashboard/otherstaff/onboarding',STUDENT:'/dashboard/otherstaff/onboarding',
  EXPLORER:'/dashboard/explorer/onboarding',JUNIOR:'/dashboard/explorer/onboarding',
  CAREER_SWITCHER:'/dashboard/explorer/onboarding',
 };
 const path=routes[role||'']||'/dashboard';
 if(identity&&path==='/dashboard/owner/onboarding')return `${path}?marketplace_identity=1`;
 return identity&&path!=='/dashboard'?`${path}?step=identity`:path;
}

export default function MarketplaceAccessSteps({blockers,role,onAccepted}:{blockers:Blocker[];role:string|null;onAccepted:()=>Promise<void>}){
 const needsTerms=blockers.some(row=>row.code==='MARKETPLACE_TERMS_REQUIRED');
 const [terms,setTerms]=useState<Terms>();
 const [agreed,setAgreed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!needsTerms)return;
  let active=true;
  marketplaceApi.getTerms().then(value=>{if(active)setTerms(value)}).catch(reason=>{if(active)setError((reason as Error).message)});
  return()=>{active=false};
 },[needsTerms]);
 async function accept(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!agreed||!terms)return;
  setBusy(true);setError('');
  try{await marketplaceApi.acceptTerms(terms.version);setAgreed(false);await onAccepted();}
  catch(reason){setError((reason as Error).message)}
  finally{setBusy(false)}
 }
 return <>
  <ul>{blockers.map(row=><li key={row.code}><span>{row.message||row.detail}</span>{['IDENTITY_UNVERIFIED','ONBOARDING_INCOMPLETE'].includes(row.code)&&<Link className="workspace-inline-link" href={onboardingHref(role,row.code==='IDENTITY_UNVERIFIED')}>Complete onboarding</Link>}</li>)}</ul>
  {needsTerms&&terms&&<form className="marketplace-terms-form" onSubmit={event=>void accept(event)}>
   <p>Review the <Link href={terms.terms_url} target="_blank" rel="noopener noreferrer">Terms of Service</Link> before accepting marketplace terms version {terms.version}.</p>
   <label><input type="checkbox" checked={agreed} onChange={event=>setAgreed(event.target.checked)}/> I have read and agree to the current terms for marketplace participation.</label>
   <button className="button primary" type="submit" disabled={!agreed||busy}>{busy?'Saving…':'Accept marketplace terms'}</button>
  </form>}
  {error&&<p className="workspace-alert" role="alert">{error}</p>}
 </>;
}
