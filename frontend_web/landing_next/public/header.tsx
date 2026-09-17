'use client';
import AccountControls from '@/shared/account-controls';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
import {ArrowUpRight,Menu,PackagePlus,X} from 'lucide-react';
const links=[['Marketplace','/marketplace'],['Add item','/marketplace/new'],['Find shifts','/shifts/public-board'],['Find talent','/talent/public-board'],['Community','/hubs'],['News','/news'],['Pricing','/pricing']];
const resources=[['Learning','/learning'],['Blog','/blog'],['Calculator','/calculator'],['Organisations','/pricing/organization'],['Contact','/contact']];
export default function PublicHeader({skipTarget='public-content'}:{skipTarget?:string}) {
 const pathname=usePathname();const [open,setOpen]=useState(false);useEffect(()=>setOpen(false),[pathname]);const current=(url:string)=>pathname===url||pathname.startsWith(url+'/');
 return <header className="site-header"><a className="skip-link" href={'#'+skipTarget}>Skip to content</a><div className="container nav-shell"><Link className="logo" href="/" aria-label="ChemistTasker home"><img src="/assets/calculator-wordmark.png" alt="ChemistTasker"/></Link><nav className="desktop-nav" aria-label="Main navigation">{links.map(([label,url])=><Link key={url} href={url} aria-current={current(url)?'page':undefined}>{label==='Add item'?<><PackagePlus size={14}/> {label}</>:label}</Link>)}<details className="ct-resources"><summary>More</summary><nav aria-label="Resources">{resources.map(([label,url])=><Link key={url} href={url} aria-current={current(url)?'page':undefined} onClick={e=>e.currentTarget.closest('details')?.removeAttribute('open')}>{label}</Link>)}</nav></details></nav><div className="nav-actions"><AccountControls/></div><button className="menu-toggle" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} aria-controls="public-mobile-nav" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div>{open&&<nav id="public-mobile-nav" className="mobile-nav" aria-label="Mobile navigation">{[...links,...resources].map(([label,url])=><Link key={url} href={url} aria-current={current(url)?'page':undefined} onClick={()=>setOpen(false)}>{label}<ArrowUpRight size={16}/></Link>)}<AccountControls/></nav>}</header>;
}
