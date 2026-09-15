import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Let\u2019s get you back in. | ChemistTasker", "description": "Request a secure link to reset your password.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Let\u2019s get you back in." description="Request a secure link to reset your password."/><PublicEntry page="PasswordResetRequestPage"/></>;}
