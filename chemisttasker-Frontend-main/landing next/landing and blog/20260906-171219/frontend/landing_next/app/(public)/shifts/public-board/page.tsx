import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "The right shift. The right fit. | ChemistTasker", "description": "Explore pharmacy opportunities by location, timing and the way you want to work.", "alternates": {"canonical": "/shifts/public-board"}};
export default function Page(){return <><PublicHero title="The right shift. The right fit." description="Explore pharmacy opportunities by location, timing and the way you want to work." board="shifts"/><PublicEntry page="PublicJobBoardPage"/></>;}
