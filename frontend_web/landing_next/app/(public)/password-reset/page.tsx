import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Reset your password | ChemistTasker', description: 'Request a secure password reset link for your ChemistTasker account.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="PasswordResetRequestPage"/>;}
