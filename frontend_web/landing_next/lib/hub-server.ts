import 'server-only';
import { cache } from 'react';
import { ApiError } from '@chemisttasker/shared-core';
import type { Article, Kind, Page } from './hub';
import { createServerChemistTaskerApi } from './server-chemisttasker-api';

export const backend = (process.env.HUB_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
export class HubUnavailable extends Error {}
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
