import 'server-only';
import { cache } from 'react';
import { ApiError } from '@chemisttasker/shared-core';
import type { Article, Kind, Page } from './hub';
import { createServerChemistTaskerApi } from './server-chemisttasker-api';

export const backend = (process.env.HUB_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
export class HubUnavailable extends Error {}
export async function publicFetch<T>(path: string): Promise<T | null> {
  try {
    const api = createServerChemistTaskerApi({ baseUrl: backend });
    return await api.client.request<T>(`/public-hub/${path}`, { auth: false, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    if (error instanceof HubUnavailable) throw error;
    throw new HubUnavailable('The publishing service is temporarily unavailable.');
  }
}
export const getArticle = cache(async (slug: string) => {
  try {
    return await createServerChemistTaskerApi({ baseUrl: backend }).publicContent.getArticle(slug) as Article;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw new HubUnavailable('The publishing service is temporarily unavailable.');
  }
});
export async function getArticles(kind?: Kind, filters: Record<string, string> = {}) {
  return createServerChemistTaskerApi({ baseUrl: backend }).publicContent.listArticles({ ...filters, kind }) as Promise<Page<Article>>;
}
