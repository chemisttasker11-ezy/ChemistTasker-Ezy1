import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Verify your mobile | ChemistTasker', description: 'Confirm your mobile number and identity details to continue your ChemistTasker setup.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="MobileOTPVerify"/>;}
