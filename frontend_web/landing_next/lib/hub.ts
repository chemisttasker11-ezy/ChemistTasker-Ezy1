export type Kind = 'blog' | 'news';
export type Reactions = { counts: Record<string, number>; mine: string | null };
export type Article = {
  id: number; title: string; slug: string; kind: Kind; topic: string; excerpt: string;
  body_document?: import('../components/rich-content').RichNode; body: string; cover_url: string; cover_alt: string; source_name: string; source_url: string;
  author_name: string; published_at: string; updated_at: string; featured: boolean;
  comments_open: boolean; seo_title: string; seo_description: string; comment_count: number;
  read_minutes: number; reactions: Reactions;
};
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type HubComment = { id: number; parent: number | null; body: string; author_name: string;
  created_at: string; deleted: boolean; can_delete: boolean; reply_count: number; reactions: Reactions };
export const topics: Record<string, string> = {
  practice: 'Pharmacy practice', career: 'Careers & learning', tga: 'TGA updates',
  industry: 'Industry news', community: 'Community',
};
export const platform = (process.env.NEXT_PUBLIC_PLATFORM_URL || 'https://chemisttasker.com.au').replace(/\/$/, '');
export const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chemisttasker.com.au').replace(/\/$/, '');
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date(value));
}
export function articlePath(article: Pick<Article, 'kind' | 'slug'>) { return `/${article.kind}/${article.slug}`; }
export function safeWebUrl(value?: string | null) {
  if (!value) return undefined;
  if (value.startsWith('/')) return value;
  const assetIdx = value.indexOf('/assets/');
  if (assetIdx !== -1) {
    return value.slice(assetIdx);
  }
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

