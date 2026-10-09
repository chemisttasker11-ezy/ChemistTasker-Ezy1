import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Verify your email | ChemistTasker', description: 'Verify your email address to continue setting up your ChemistTasker account.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="OTPVerify"/>;}
