'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { platform } from '../../../lib/hub';
import { api } from './hub-client';

export default function HubHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('session/').then(() => { if (active) setSignedIn(true); }).catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, [pathname]);
  async function signOut() {
    setBusy(true); setError('');
    try { await api('session/', 'DELETE'); window.location.reload(); }
    catch { setError('Could not sign out. Please try again.'); setBusy(false); }
  }
  const links = [['Calculator', '/calculator'],['The platform', '/#features'], ['The blog', '/blog'], ['News & community', '/news']];
  return <header className="site-header"><div className="container nav-shell"><Link href="/" className="logo" aria-label="ChemistTasker home"><img src="/assets/calculator-wordmark.png" alt="ChemistTasker — Pharmacy Workforce Platform"/></Link>
    <nav className="desktop-nav" aria-label="Main navigation">{links.map(([label, url]) => <Link href={url} key={url} aria-current={pathname.startsWith(url) ? 'page' : undefined}>{label}</Link>)}</nav>
    <div className="nav-actions">{signedIn ? <button className="hub-text-button" onClick={signOut} disabled={busy}>Sign out</button> : <Link className="login" href="/community/sign-in">Log in</Link>}<a className="button primary small" href={`${platform}/register`}>Get started <ArrowUpRight size={16}/></a></div>
    <button className="menu-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="hub-mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'}>{open ? <X/> : <Menu/>}</button>
    </div>{error && <p className="hub-error" role="alert">{error}</p>}{open && <nav className="mobile-nav" id="hub-mobile-nav" aria-label="Mobile navigation">{[...links, ...(!signedIn ? [['Log in', '/community/sign-in']] : []), ['Get started', `${platform}/register`]].map(([label, url]) => <a key={url} href={url} onClick={() => setOpen(false)}>{label}<ArrowUpRight size={16}/></a>)}{signedIn && <button className="hub-text-button" onClick={signOut} disabled={busy}>Sign out</button>}</nav>}
  </header>;
}
