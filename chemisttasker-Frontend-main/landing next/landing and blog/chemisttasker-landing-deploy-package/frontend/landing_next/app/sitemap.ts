import { MetadataRoute } from 'next';
import { getArticles } from '../lib/hub-server';
import { articlePath, site } from '../lib/hub';
export const dynamic = 'force-dynamic';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = ['', '/blog', '/news'].map(path => ({ url: `${site}${path}` }));
  let page = 1;
  while (true) {
    const data = await getArticles(undefined, { page: String(page) });
    if (!data) throw new Error('Publishing service unavailable');
    entries.push(...data.results.map(article => ({ url: `${site}${articlePath(article)}`, lastModified: article.updated_at })));
    if (!data.next) break;
    page++;
  }
  return entries;
}
