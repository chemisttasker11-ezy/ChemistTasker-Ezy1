import 'server-only';
import { cache } from 'react';
import type { Article, Kind, Page } from './hub';

export const backend = (process.env.HUB_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
export class HubUnavailable extends Error {}
export async function publicFetch<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${backend}/public-hub/${path}`, { headers: { 'X-Forwarded-Proto': new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').protocol.replace(':','') }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new HubUnavailable('The publishing service is temporarily unavailable.');
    return await response.json();
  } catch (error) {
    if (error instanceof HubUnavailable) throw error;
    throw new HubUnavailable('The publishing service is temporarily unavailable.');
  }
}
export const getArticle = cache((slug: string) => publicFetch<Article>(`articles/${encodeURIComponent(slug)}/`));
export async function getArticles(kind?: Kind, filters: Record<string, string> = {}) {
  const params = new URLSearchParams(filters);
  if (kind) params.set('kind', kind);
  return publicFetch<Page<Article>>(`articles/?${params}`);
}
