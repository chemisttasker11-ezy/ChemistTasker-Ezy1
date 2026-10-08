import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Pharmacy organisation | ChemistTasker', description: 'Explore a public pharmacy organisation profile and its ChemistTasker opportunities.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="PublicOrganizationPage"/>;}
