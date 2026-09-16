import type {Metadata} from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {ArrowRight, BookOpen, Building2, Recycle, ShieldCheck, Shirt, Store} from 'lucide-react';
import MarketplaceCatalogue from './marketplace-catalogue';

export const metadata:Metadata={
 title:'Pharmacy marketplace | ChemistTasker',
 description:'Browse approved books, workwear, pharmacy fixtures and other non-medicine goods from Australia\'s pharmacy community.',
 alternates:{canonical:'/marketplace'},
};

const categories=[
 {name:'Books & study',description:'Reference books, textbooks and permitted study resources.',icon:BookOpen,slug:'books-study'},
 {name:'Workwear',description:'Uniforms, white coats, suitable footwear and work bags.',icon:Shirt,slug:'workwear'},
 {name:'Pharmacy fixtures',description:'Shelving, counters, baskets, storage and display fittings.',icon:Store,slug:'pharmacy-fixtures'},
 {name:'Office & tools',description:'Furniture, stationery, calculators and approved non-clinical tools.',icon:Building2,slug:'office-tools'},
];

export default async function MarketplacePage({searchParams}:{searchParams:Promise<{category?:string|string[]}>}){
 const requestedCategory=(await searchParams).category;
 const initialCategory=typeof requestedCategory==='string'&&categories.some(item=>item.slug===requestedCategory)?requestedCategory:'';
 return <div className="marketplace-page">
  <section className="marketplace-hero">
   <div className="container marketplace-hero-grid">
    <div className="marketplace-hero-copy">
     <p className="marketplace-eyebrow">CHEMISTTASKER MARKETPLACE</p>
     <h1>Useful gear. Passed on.</h1>
     <p>Buy, swap or pass on approved work items across Australia&apos;s pharmacy community.</p>
     <div className="marketplace-actions">
      <a className="button primary" href="#browse">Browse listings <ArrowRight size={17}/></a>
      <Link className="marketplace-text-link" href="/marketplace/new">List an item <ArrowRight size={17}/></Link>
     </div>
    </div>
    <div className="marketplace-hero-media">
     <Image src="/assets/marketplace/marketplace-hero.png" alt="White pharmacy coat, reference book, calculator, work bag and stationery arranged on a pharmacy workroom table" fill priority sizes="(max-width: 800px) 100vw, 52vw"/>
     <div className="marketplace-hero-note"><Recycle size={19}/><span><strong>Sell. Swap. Free.</strong> Give useful items another working life.</span></div>
    </div>
   </div>
  </section>

  <section className="container marketplace-category-section" aria-labelledby="marketplace-categories-title">
   <div className="marketplace-section-heading">
    <h2 id="marketplace-categories-title">Made for pharmacy work.</h2>
    <p>Every category is reviewed. Medicines and restricted clinical goods never appear in the public catalogue.</p>
   </div>
   <div className="marketplace-category-grid">
    {categories.map(({name,description,icon:Icon,slug})=><Link href={`/marketplace?category=${slug}#browse`} className="marketplace-category" key={slug}>
     <Icon size={23}/><span><strong>{name}</strong><small>{description}</small></span><ArrowRight size={17}/>
    </Link>)}
   </div>
  </section>

  <MarketplaceCatalogue initialCategory={initialCategory}/>

  <section id="trading" className="container marketplace-trust" aria-labelledby="marketplace-trust-title">
   <div className="marketplace-trust-photo">
    <Image src="/assets/marketplace/pharmacy-workwear-reference.jpg" alt="Pharmacist wearing purple pharmacy workwear" fill sizes="(max-width: 760px) 100vw, 38vw"/>
   </div>
   <div className="marketplace-trust-copy">
    <ShieldCheck size={28}/>
    <h2 id="marketplace-trust-title">Public to browse. Verified to trade.</h2>
    <p>Listings show an approved role and broad location only. Contact, offers and claims require an eligible ChemistTasker account.</p>
    <div className="marketplace-trade-modes" aria-label="Available ways to trade">
     <span><strong>Sell</strong> Agree on a price</span>
     <span><strong>Swap</strong> Propose an exchange</span>
     <span><strong>Free</strong> Pass it forward</span>
    </div>
   </div>
  </section>

  <section className="container marketplace-ethical" aria-labelledby="ethical-title">
   <div>
    <p className="marketplace-eyebrow">PRIVATE ETHICAL EXCHANGE</p>
    <h2 id="ethical-title">Medicine exchange stays private.</h2>
    <p>No medicine names, images, prices or stock appear here. Eligible pharmacies enter through a separate permission-gated service.</p>
   </div>
   <div className="marketplace-actions"><Link className="marketplace-text-link" href="/marketplace/medicines">How access works</Link><Link className="button secondary" href="/marketplace/ethical/access">Check private access <ArrowRight size={17}/></Link></div>
  </section>
 </div>;
}
