import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Create your account | ChemistTasker', description: 'Create a ChemistTasker account and choose the starting role that best matches how you use pharmacy work today.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="register"/>;}
