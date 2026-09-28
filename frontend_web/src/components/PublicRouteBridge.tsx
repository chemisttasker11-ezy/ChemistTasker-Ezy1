import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {rememberDestination} from '../../landing_next/shared/browser-session';

function encodeBridgePayload(payload:unknown){
 const bytes=encodeURIComponent(JSON.stringify(payload)).replace(/%([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(Number.parseInt(hex,16)));
 return btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export default function PublicRouteBridge({children}:{children:React.ReactNode}){
 const location=useLocation();
 const publicSiteOrigin=(import.meta.env.VITE_PUBLIC_SITE_URL||window.location.origin).replace(/\/$/,'');
 const publicPath=location.pathname==='/'||location.pathname==='/dashboard'||/^\/(login|register|otp-verify|mobile-verify|mobile-checkout-return|password-reset|reset-password|pricing|privacy-policy|terms-of-service|account-deletion|contact|contact-us|hubs|blog|news|content|calculator|marketplace|learning|how-it-works|referee|organization)(\/|$)/.test(location.pathname)||/^\/shifts\/(link|public-board)(\/|$)/.test(location.pathname)||location.pathname==='/talent/public-board';
 const enabled=import.meta.env.VITE_PUBLIC_SITE_ENABLED==='1'&&publicPath;
 useEffect(()=>{if(!enabled)return;let returnTo:string|undefined;if(location.state){sessionStorage.setItem(`ct:route:${location.pathname}`,JSON.stringify(location.state));const from=location.state.from;if(from?.pathname)returnTo=rememberDestination(from.pathname+(from.search||'')+(from.hash||''))||undefined;}const target=new URL(`${location.pathname}${location.search}${location.hash}`,publicSiteOrigin);if(location.state||returnTo)target.searchParams.set('__ct_bridge',encodeBridgePayload({path:location.pathname,state:location.state??null,returnTo:returnTo??null}));window.location.replace(target.toString());},[enabled,location,publicSiteOrigin]);
 useEffect(()=>{if(!location.pathname.startsWith('/dashboard'))return;const onClick=(event:MouseEvent)=>{const target=event.target;if(!(target instanceof Element))return;const logo=target.closest('img[alt="ChemistTasker menu"]');if(!logo)return;event.preventDefault();event.stopPropagation();window.location.assign(`${publicSiteOrigin}/`);};document.addEventListener('click',onClick,true);return()=>document.removeEventListener('click',onClick,true);},[location.pathname,publicSiteOrigin]);
 return enabled?<div role="status" style={{padding:24}}>Opening ChemistTasker…</div>:children;
}
