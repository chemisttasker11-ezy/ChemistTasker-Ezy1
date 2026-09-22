import type {MetadataRoute} from 'next';
import {getPublicSitemap} from '@/lib/hub-server';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const entries=await getPublicSitemap();
 if(!entries)throw new Error('Sitemap unavailable');
 return entries.map(entry=>({url:entry.loc,...(entry.lastmod?{lastModified:entry.lastmod}:{})}));
}
