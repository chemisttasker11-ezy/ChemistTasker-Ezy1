import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Your privacy matters. | ChemistTasker", "description": "How ChemistTasker handles and protects your information.", "alternates": {"canonical": "/privacy-policy"}};
export default function Page(){return <><PublicHero title="Your privacy matters." description="How ChemistTasker handles and protects your information."/><PublicEntry page="PrivacyPolicyPage"/></>;}
