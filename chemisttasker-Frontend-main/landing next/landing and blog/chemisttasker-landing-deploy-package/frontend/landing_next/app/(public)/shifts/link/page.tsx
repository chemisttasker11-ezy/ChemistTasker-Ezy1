import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "An opportunity worth exploring. | ChemistTasker", "description": "View the shared shift details and take your next step.", "alternates": {"canonical": "/shifts/link"}};
export default function Page(){return <><PublicHero title="An opportunity worth exploring." description="View the shared shift details and take your next step."/><PublicEntry page="SharedShiftLandingPage"/></>;}
