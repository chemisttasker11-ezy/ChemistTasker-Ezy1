import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Manage this reference request. | ChemistTasker", "description": "Let the team know if you cannot provide a reference.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Manage this reference request." description="Let the team know if you cannot provide a reference."/><PublicEntry page="onboarding/RefereeRejectPage"/></>;}
