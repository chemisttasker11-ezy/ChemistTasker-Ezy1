import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "A little clarity. A better plan. | ChemistTasker", "description": "Explore the pricing options for your pharmacy and choose the right fit.", "alternates": {"canonical": "/pricing"}};
export default function Page(){return <><PublicHero title="A little clarity. A better plan." description="Explore the pricing options for your pharmacy and choose the right fit."/><PublicEntry page="PricingPage"/></>;}
