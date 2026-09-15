import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Meet your pharmacy community. | ChemistTasker", "description": "Explore an organisation and the opportunities it brings together.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Meet your pharmacy community." description="Explore an organisation and the opportunities it brings together."/><PublicEntry page="PublicOrganizationPage"/></>;}
