import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "One more step. | ChemistTasker", "description": "Verify your email to continue setting up your account.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="One more step." description="Verify your email to continue setting up your account."/><PublicEntry page="OTPVerify"/></>;}
