import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
export const metadata: Metadata = { title: 'Reference questionnaire | ChemistTasker', description: 'Complete a requested professional reference securely.', robots: { index: false, follow: false } };
export default function Page(){return <PublicEntry page="onboarding/RefereeQuestionnairePage"/>;}
