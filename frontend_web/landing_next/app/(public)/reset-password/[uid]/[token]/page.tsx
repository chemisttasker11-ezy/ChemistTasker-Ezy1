import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Set a new password | ChemistTasker', description: 'Choose a new password for your ChemistTasker account.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="ResetPasswordPage"/>;}
