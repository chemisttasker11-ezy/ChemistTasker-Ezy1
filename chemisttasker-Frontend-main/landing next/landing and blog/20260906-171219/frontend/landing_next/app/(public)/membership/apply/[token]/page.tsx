import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "A place for you to belong. | ChemistTasker", "description": "Apply to join your pharmacy organisation.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="A place for you to belong." description="Apply to join your pharmacy organisation."/><PublicEntry page="MembershipApplyPage"/></>;}
