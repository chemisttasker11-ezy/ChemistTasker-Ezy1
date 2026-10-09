import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Welcome back. | ChemistTasker', description: 'Sign in to continue to your ChemistTasker workspace or return to the task that brought you here.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="login"/>;}
