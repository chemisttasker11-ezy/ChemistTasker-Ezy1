import Link from 'next/link';
export default function NotFound() { return <div className="container hub-empty"><p className="eyebrow">STORY NOT FOUND</p><h1>Let’s find your next read.</h1><p>This article may have moved or is no longer published.</p><Link className="button primary" href="/blog">Explore the journal</Link></div>; }
