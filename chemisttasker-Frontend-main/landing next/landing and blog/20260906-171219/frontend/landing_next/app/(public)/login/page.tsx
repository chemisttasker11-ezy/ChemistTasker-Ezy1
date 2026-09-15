import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Welcome back. | ChemistTasker", "description": "Your people, your plans and your next opportunity are waiting.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Welcome back." description="Your people, your plans and your next opportunity are waiting."/><PublicEntry page="login"/></>;}
