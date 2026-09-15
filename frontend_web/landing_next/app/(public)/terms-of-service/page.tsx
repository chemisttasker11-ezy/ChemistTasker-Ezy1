import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "A shared understanding. | ChemistTasker", "description": "The terms that guide your use of ChemistTasker.", "alternates": {"canonical": "/terms-of-service"}};
export default function Page(){return <><PublicHero title="A shared understanding." description="The terms that guide your use of ChemistTasker."/><PublicEntry page="TermsOfServicePage"/></>;}
