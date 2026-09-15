'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
export default function PublicHeader() {
 const [open,setOpen]=useState(false);
 const links=[['Calculator','/calculator'],['Find a shift','/shifts/public-board'],['Find talent','/talent/public-board'],['Pricing','/pricing'],['Journal','/blog'],['News','/news'],['Contact','/contact']];
 return <header className="site-header"><a className="skip-link" href="#public-content">Skip to content</a><div className="container nav-shell"><Link className="logo" href="/" aria-label="ChemistTasker home"><img src="/assets/calculator-wordmark.png" alt="ChemistTasker"/></Link><nav className="desktop-nav" aria-label="Main navigation">{links.map(([label,url])=><Link key={url} href={url}>{label}</Link>)}</nav><div className="nav-actions"><Link className="login" href="/login">Log in</Link><Link className="button primary small" href="/register">Get started <ArrowUpRight size={15}/></Link><button className="menu-toggle" aria-label={open?'Close menu':'Open menu'} aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button></div></div>{open&&<nav className="mobile-nav" aria-label="Mobile navigation">{links.map(([label,url])=><Link key={url} href={url} onClick={()=>setOpen(false)}>{label}<ArrowUpRight size={16}/></Link>)}</nav>}</header>;
}
