import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Return to the ChemistTasker app', description: 'Continue in the ChemistTasker mobile app after checkout.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="MobileCheckoutReturnPage"/>;}
