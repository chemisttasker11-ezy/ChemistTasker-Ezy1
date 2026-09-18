import type { Metadata } from 'next';
import PublicEntry from '@/public/entry';
import PublicHero from '@/public/hero';
export const metadata: Metadata = {"title": "Let's talk pharmacy. | ChemistTasker", "description": "Have a question, an idea or something you need a hand with? We're here to help.", "alternates": {"canonical": "/contact"}};
export default function Page(){return <><PublicHero title="Let's talk pharmacy." description="Have a question, an idea or something you need a hand with? We're here to help."/><PublicEntry page="Contact"/></>;}
