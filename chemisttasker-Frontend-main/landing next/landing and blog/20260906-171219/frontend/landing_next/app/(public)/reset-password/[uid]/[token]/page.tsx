import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "A fresh start. | ChemistTasker", "description": "Choose a new password for your account.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="A fresh start." description="Choose a new password for your account."/><PublicEntry page="ResetPasswordPage"/></>;}
