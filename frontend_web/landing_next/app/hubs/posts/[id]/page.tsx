import {notFound} from 'next/navigation';
import {getPublicHubPost} from '@/lib/hub-server';
import {PostPage,type PublicPost} from '../../community-client';
export async function generateMetadata({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^\d+$/.test(id))return {title:'Conversation unavailable'};const post=await getPublicHubPost<PublicPost>(Number(id));return {title:post?`${post.editorial?.title||'Community conversation'} | ChemistTasker`:'Conversation unavailable'};}
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!/^\d+$/.test(id))notFound();const post=await getPublicHubPost<PublicPost>(Number(id));if(!post)notFound();return <PostPage initial={post}/>;}
