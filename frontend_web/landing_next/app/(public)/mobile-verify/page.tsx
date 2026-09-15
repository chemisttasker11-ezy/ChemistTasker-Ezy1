import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Let\u2019s verify your number. | ChemistTasker", "description": "Keep your account connected and secure.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Let\u2019s verify your number." description="Keep your account connected and secure."/><PublicEntry page="MobileOTPVerify"/></>;}
