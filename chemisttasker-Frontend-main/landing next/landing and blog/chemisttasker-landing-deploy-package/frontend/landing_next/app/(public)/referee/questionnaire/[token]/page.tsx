import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Your perspective matters. | ChemistTasker", "description": "Help us understand a pharmacy professional's experience.", "robots": {"index": false, "follow": false}};
export default function Page(){return <><PublicHero title="Your perspective matters." description="Help us understand a pharmacy professional's experience."/><PublicEntry page="onboarding/RefereeQuestionnairePage"/></>;}
