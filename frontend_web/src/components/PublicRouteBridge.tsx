import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {rememberDestination} from '../../landing_next/shared/browser-session';

export default function PublicRouteBridge({children}:{children:React.ReactNode}){
 const location=useLocation();
 const publicPath=location.pathname==='/'||location.pathname==='/dashboard'||/^\/(login|register|otp-verify|mobile-verify|mobile-checkout-return|password-reset|reset-password|pricing|privacy-policy|terms-of-service|account-deletion|contact|contact-us|hubs|blog|news|content|calculator|marketplace|learning|how-it-works|membership|referee|organization)(\/|$)/.test(location.pathname)||/^\/shifts\/(link|public-board)(\/|$)/.test(location.pathname)||location.pathname==='/talent/public-board';
 const enabled=import.meta.env.VITE_PUBLIC_SITE_ENABLED==='1'&&publicPath;
 useEffect(()=>{if(!enabled)return;if(location.state){sessionStorage.setItem(`ct:route:${location.pathname}`,JSON.stringify(location.state));const from=location.state.from;if(from?.pathname)rememberDestination(from.pathname+(from.search||'')+(from.hash||''));}window.location.replace(location.pathname+location.search+location.hash);},[enabled,location]);
 useEffect(()=>{if(!location.pathname.startsWith('/dashboard'))return;const onClick=(event:MouseEvent)=>{const target=event.target;if(!(target instanceof Element))return;const logo=target.closest('img[alt="ChemistTasker menu"]');if(!logo)return;event.preventDefault();event.stopPropagation();window.location.assign('/');};document.addEventListener('click',onClick,true);return()=>document.removeEventListener('click',onClick,true);},[location.pathname]);
 return enabled?<div role="status" style={{padding:24}}>Opening ChemistTasker…</div>:children;
}
