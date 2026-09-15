import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Your account. Your choice. | ChemistTasker", "description": "Find out how to request account deletion and what happens next.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Your account. Your choice." description="Find out how to request account deletion and what happens next."/><PublicEntry page="AccountDeletionPage"/></>;}
