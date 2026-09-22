import {notFound} from 'next/navigation';
import {getPublicHubPosts} from '@/lib/hub-server';
import CommunityFeed,{type PublicPost} from '../community-client';
import type {Page} from '@/lib/hub';
const labels:Record<string,string>={public:'ChemistTasker Hub',pharmacist:'Pharmacist Hub',intern:'Intern Hub',staff:'Other Staff Hub',explorer:'Explorer Hub',owner:'Owner Hub'};
export async function generateMetadata({params}:{params:Promise<{hub:string}>}){const {hub}=await params;return {title:`${labels[hub]||'Community'} | ChemistTasker`,description:`Read public discussions in the ${labels[hub]||'ChemistTasker community'}. Verified eligible members can post, reply and react using their existing account.`,alternates:{canonical:`/hubs/${hub}`}};}
export default async function HubPage({params}:{params:Promise<{hub:string}>}){const {hub}=await params;if(!labels[hub])notFound();const initial=await getPublicHubPosts<Page<PublicPost>>(hub);if(!initial)notFound();return <CommunityFeed hub={hub} label={labels[hub]} initial={initial}/>;}
