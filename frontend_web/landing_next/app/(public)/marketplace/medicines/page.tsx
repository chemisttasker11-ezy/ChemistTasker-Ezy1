import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowRight, Building2, ClipboardCheck, LockKeyhole, ShieldCheck} from 'lucide-react';

export const metadata:Metadata={title:'Private ethical exchange | ChemistTasker',description:'Learn how eligible Australian pharmacies access ChemistTasker\'s permission-gated ethical stock exchange.',alternates:{canonical:'/marketplace/medicines'}};

export default function MedicinesEntryPage(){return <div className="marketplace-page ethical-entry">
 <section className="ethical-entry-hero"><div className="container"><p className="marketplace-eyebrow">PRIVATE ETHICAL EXCHANGE</p><LockKeyhole size={34}/><h1>Protected stock. Accountable exchange.</h1><p>Medicine inventory is available only to admitted pharmacies and authorised people acting within a verified pharmacy context.</p><div className="marketplace-actions"><Link className="button primary" href="/marketplace/ethical/access">Check secure access <ArrowRight size={17}/></Link><Link className="marketplace-text-link" href="/marketplace">Browse public goods</Link></div></div></section>
 <section className="container ethical-entry-body" aria-labelledby="ethical-process-title"><div><h2 id="ethical-process-title">A separate path for ethical stock.</h2><p>The public marketplace never previews medicine names, stock levels, prices, photos or participating pharmacies.</p></div><div className="ethical-entry-steps"><article><Building2/><h3>Verified pharmacy context</h3><p>Access is tied to an approved pharmacy and the person&apos;s current authority there.</p></article><article><ClipboardCheck/><h3>Premises admission</h3><p>Required evidence and application status are reviewed before inventory access.</p></article><article><ShieldCheck/><h3>Scoped permissions</h3><p>Every listing, enquiry, reservation and transfer is checked for that action.</p></article></div></section>
 </div>}
