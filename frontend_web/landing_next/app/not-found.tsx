import Link from 'next/link';
import { ArrowRight, Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <main id="public-content" className="container" style={{ paddingTop: 88, paddingBottom: 112, maxWidth: 820 }}>
      <p style={{ fontWeight: 800, color: '#5222B8', marginBottom: 16 }}>Page not found</p>
      <h1 style={{ fontFamily: 'Outfit, sans-serif', color: '#06123A', fontSize: 'clamp(38px, 6vw, 60px)', lineHeight: 1.12, letterSpacing: '-.025em' }}>
        This page isn&apos;t here.
      </h1>
      <p style={{ marginTop: 20, maxWidth: 520, fontSize: 17, lineHeight: 1.65, color: '#445474' }}>
        The link may have changed. Find pharmacy shifts, explore talent or return to ChemistTasker.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
        <Link className="button primary" href="/"><Home size={18} aria-hidden="true" /> Back to home</Link>
        <Link className="button secondary" href="/shifts/public-board"><Search size={18} aria-hidden="true" /> Find shifts <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </main>
  );
}
