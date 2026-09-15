import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Good things start with connection. | ChemistTasker", "description": "Create your ChemistTasker account and find your place in pharmacy.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Good things start with connection." description="Create your ChemistTasker account and find your place in pharmacy."/><PublicEntry page="register"/></>;}
