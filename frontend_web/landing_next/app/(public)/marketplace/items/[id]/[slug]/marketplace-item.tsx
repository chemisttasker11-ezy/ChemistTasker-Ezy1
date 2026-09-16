'use client';

import Link from 'next/link';
import {ArrowLeft, ArrowRight, MapPin, PackageOpen, RefreshCw, ShieldCheck, Truck} from 'lucide-react';
import {useEffect,useState} from 'react';
import {useSession} from '@/shared/session-provider';
import {loginHref} from '@/shared/browser-session';
import {marketApi,type GoodsAccess} from '@/features/marketplace/api';

type ListingImage={url?:string;derivative_url?:string;alt?:string};
type Listing={id:string|number;title:string;description?:string;summary?:string;category?:string|{name?:string};condition?:string;mode?:string;item_amount?:number|string|null;currency?:string;seller_role_label?:string;coarse_location?:string;permitted_buyer_labels?:string[];delivery_options?:string[];postage_payer?:string;postage_organiser?:string;image_url?:string;images?:ListingImage[]};

function textCategory(listing:Listing){return typeof listing.category==='string'?listing.category:listing.category?.name||'Approved goods';}
function price(listing:Listing){if(listing.mode==='FREE')return 'Free';if(listing.mode==='SWAP')return 'Swap';const amount=Number(listing.item_amount);return Number.isFinite(amount)?new Intl.NumberFormat('en-AU',{style:'currency',currency:listing.currency||'AUD',maximumFractionDigits:amount%1?2:0}).format(amount):'See listing terms';}

export default function MarketplaceItem({id}:{id:string}){
 const session=useSession();
 const [listing,setListing]=useState<Listing>();
 const [state,setState]=useState<'loading'|'ready'|'missing'|'error'>('loading');
 const [retry,setRetry]=useState(0);
 const [access,setAccess]=useState<GoodsAccess>();const [contactOpen,setContactOpen]=useState(false);const [contactError,setContactError]=useState('');const [contactDone,setContactDone]=useState(false);
 useEffect(()=>{const controller=new AbortController();setState('loading');void fetch(`/api/platform/marketplace/listings/${encodeURIComponent(id)}/`,{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}}).then(async response=>{if(response.status===404){setState('missing');return;}if(!response.ok)throw new Error('Unavailable');setListing(await response.json() as Listing);setState('ready');}).catch(error=>{if((error as Error).name!=='AbortError')setState('error');});return()=>controller.abort();},[id,retry]);
 useEffect(()=>{if(session.status==='authenticated')void marketApi<GoodsAccess>('me/access/').then(setAccess).catch(()=>{});},[session.status]);
 if(state==='loading')return <main className="container marketplace-item-page"><div className="marketplace-item-loading" role="status">Loading approved listing</div></main>;
 if(state==='missing')return <main className="container marketplace-item-page"><div className="marketplace-state"><PackageOpen size={32}/><h1>This listing is no longer public.</h1><p>It may have been withdrawn, completed or removed during review.</p><Link className="button primary" href="/marketplace">Browse marketplace</Link></div></main>;
 if(state==='error'||!listing)return <main className="container marketplace-item-page"><div className="marketplace-state marketplace-error" role="alert"><RefreshCw size={31}/><h1>The listing can&apos;t load right now.</h1><p>This is a service problem. Please retry or return to the public catalogue.</p><div className="marketplace-actions"><button className="button secondary" onClick={()=>setRetry(value=>value+1)}>Try again</button><Link className="marketplace-text-link" href="/marketplace">Back to marketplace</Link></div></div></main>;
 const images=[...(listing.image_url?[{url:listing.image_url,alt:listing.title}]:[]),...(listing.images||[])].filter(image=>image.derivative_url||image.url);
 return <main className="container marketplace-item-page">
  <Link className="marketplace-back-link" href="/marketplace"><ArrowLeft size={17}/> Back to marketplace</Link>
  <div className="marketplace-item-grid">
   <div className="marketplace-item-gallery">{images.length?<>{images.slice(0,4).map((image,index)=><figure className={index===0?'marketplace-item-primary':''} key={(image.derivative_url||image.url)+String(index)}><img src={image.derivative_url||image.url} alt={image.alt||listing.title}/></figure>)}</>:<div className="marketplace-item-placeholder"><PackageOpen size={38}/> Image awaiting approval</div>}</div>
   <aside className="marketplace-item-summary">
    <span className="marketplace-item-category">{textCategory(listing)}</span>
    <h1>{listing.title}</h1>
    <strong className="marketplace-item-price">{price(listing)}</strong>
    <p>{listing.description||listing.summary||'Full listing details are available to browse here. Contact remains permission-gated.'}</p>
    <dl><div><dt>Condition</dt><dd>{listing.condition||'See description'}</dd></div><div><dt>Listed by</dt><dd>{listing.seller_role_label||'Verified member'}</dd></div>{listing.coarse_location&&<div><dt>Area</dt><dd><MapPin size={15}/>{listing.coarse_location}</dd></div>}</dl>
    {session.status==='anonymous'?<Link className="button primary marketplace-item-action" href={loginHref(`/marketplace/items/${id}/listing`)}>Sign in to contact seller <ArrowRight size={17}/></Link>:<button className="button primary marketplace-item-action" type="button" onClick={()=>setContactOpen(true)}>Check eligibility and enquire <ArrowRight size={17}/></button>}
    {contactOpen&&!contactDone&&<form className="marketplace-contact-form" onSubmit={async event=>{event.preventDefault();setContactError('');const form=new FormData(event.currentTarget);try{await marketApi(`listings/${id}/enquiries/`,'POST',{client_request_id:crypto.randomUUID(),buying_pharmacy:form.get('buying_pharmacy')?Number(form.get('buying_pharmacy')):null,message:String(form.get('message')),terms:{intent:'ENQUIRY'}});setContactDone(true);}catch(error){setContactError((error as Error).message)}}}><label><span>Message</span><textarea name="message" required maxLength={4000}/></label>{access?.eligible_pharmacies.length?<label><span>Buying context, if this is a pharmacy asset</span><select name="buying_pharmacy"><option value="">Personal</option>{access.eligible_pharmacies.map(pharmacy=><option value={pharmacy.id} key={pharmacy.id}>{pharmacy.label}</option>)}</select></label>:null}{contactError&&<p role="alert">{contactError}</p>}<button className="button secondary" type="submit">Send gated enquiry</button></form>}
    {contactDone&&<p className="marketplace-contact-success" role="status">Enquiry sent. The conversation is now in My marketplace.</p>}
    <p className="marketplace-item-assurance"><ShieldCheck size={17}/> Trading actions require current identity, mobile and role checks.</p>
   </aside>
  </div>
  <section className="marketplace-item-details" aria-labelledby="listing-details-title"><h2 id="listing-details-title">Listing details</h2><div>{listing.delivery_options?.length?<article><Truck/><h3>Delivery</h3><p>{listing.delivery_options.join(', ')}</p>{(listing.postage_payer||listing.postage_organiser)&&<small>Postage payer: {listing.postage_payer||'See agreement'}. Organiser: {listing.postage_organiser||'See agreement'}.</small>}</article>:<article><Truck/><h3>Delivery</h3><p>Pickup or postage terms appear when supplied by the seller.</p></article>}<article><ShieldCheck/><h3>Who can trade</h3><p>{listing.permitted_buyer_labels?.length?listing.permitted_buyer_labels.join(', '):'Eligibility is checked before contact.'}</p></article></div></section>
 </main>;
}
