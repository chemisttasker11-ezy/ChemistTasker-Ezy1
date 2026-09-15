import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Your organisation. Connected. | ChemistTasker", "description": "Bring your pharmacies, people and everyday operations together.", "alternates": {"canonical": "/pricing/organization"}};
export default function Page(){return <><PublicHero title="Your organisation. Connected." description="Bring your pharmacies, people and everyday operations together."/><PublicEntry page="OrganizationPricingPage"/></>;}
