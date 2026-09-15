import Link from 'next/link';
import { ArrowUpRight, Heart } from 'lucide-react';
import { platform } from '../../lib/hub';
import HubHeader from './components/hub-header';
import './hub.css';

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <div className="hub"><HubHeader/>
    <main id="hub-main">{process.env.NODE_ENV !== 'production' && process.env.HUB_PREVIEW_MODE === '1' && <div className="hub-preview-banner">Local preview · Sample articles and test accounts · Nothing is published to the live platform</div>}{children}</main>
    <footer className="container hub-footer"><div><Link href="/" className="logo" aria-label="ChemistTasker home"><img src="/assets/calculator-wordmark.png" alt="ChemistTasker"/></Link><p>The people behind every pharmacy.<br/>The conversations bringing us together.</p></div>
      <nav aria-label="Community footer"><Link href="/blog">The blog</Link><Link href="/news">News</Link><Link href="/hubs">Explore communities <ArrowUpRight size={14}/></Link><a href="/privacy-policy">Privacy policy</a><a href="/terms-of-service">Terms of service</a></nav>
      <div className="hub-footer-bottom"><span>© {new Date().getFullYear()} ChemistTasker</span><span><Heart size={14}/> Made for Australian pharmacy.</span></div>
    </footer></div>;
}
