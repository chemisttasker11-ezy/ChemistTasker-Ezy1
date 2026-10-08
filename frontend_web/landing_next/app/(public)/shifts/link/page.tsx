import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Shared shift opportunity | ChemistTasker', description: 'View the shared shift details and take your next step.', alternates: { canonical: '/shifts/link' } };
export default function Page(){return <PublicEntry page="SharedShiftLandingPage"/>;}
