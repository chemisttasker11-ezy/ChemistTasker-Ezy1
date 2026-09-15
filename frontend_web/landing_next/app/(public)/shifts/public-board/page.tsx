import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Locum pharmacist shifts & pharmacy jobs | ChemistTasker", "description": "Browse locum pharmacist shifts and pharmacy jobs in Australia. Explore opportunities by location, dates and work type, then apply with your ChemistTasker account.", "alternates": {"canonical": "/shifts/public-board"}};
export default function Page(){return <><PublicHero title="Locum pharmacist shifts & pharmacy jobs" description="Browse locum pharmacist shifts and pharmacy jobs in Australia. Explore opportunities by location, dates and work type, then apply with your ChemistTasker account." board="shifts"/><PublicEntry page="PublicJobBoardPage"/></>;}
