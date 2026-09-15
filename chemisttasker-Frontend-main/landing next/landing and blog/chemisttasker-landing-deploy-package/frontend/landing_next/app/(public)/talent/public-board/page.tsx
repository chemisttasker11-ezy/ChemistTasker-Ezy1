import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Good people. Great possibilities. | ChemistTasker", "description": "Discover pharmacy professionals, explore their skills and find your next connection.", "alternates": {"canonical": "/talent/public-board"}};
export default function Page(){return <><PublicHero title="Good people. Great possibilities." description="Discover pharmacy professionals, explore their skills and find your next connection." board="talent"/><PublicEntry page="PublicTalentBoardPage"/></>;}
