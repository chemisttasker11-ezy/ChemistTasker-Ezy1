import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Reference request | ChemistTasker', description: 'Manage this professional reference request.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="onboarding/RefereeRejectPage"/>;}
