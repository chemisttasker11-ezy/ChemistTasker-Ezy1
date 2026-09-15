import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Back to your workspace. | ChemistTasker", "description": "Continue in the ChemistTasker mobile app.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Back to your workspace." description="Continue in the ChemistTasker mobile app."/><PublicEntry page="MobileCheckoutReturnPage"/></>;}
