import 'server-only';
import { cache } from 'react';
import { ApiError } from '@chemisttasker/shared-core';
import type { Article, Kind, Page } from './hub';
import { createServerChemistTaskerApi } from './server-chemisttasker-api';

export const backend = (process.env.HUB_API_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');
export class HubUnavailable extends Error {}

async function publicCall<T>(operation: (api: ReturnType<typeof createServerChemistTaskerApi>) => Promise<T>): Promise<T | null> {
  try {
    return await operation(createServerChemistTaskerApi({ baseUrl: backend }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    if (error instanceof HubUnavailable) throw error;
    throw new HubUnavailable('The publishing service is temporarily unavailable.');
  }
}

export const getArticle = cache(async (slug: string) => {
  const value = await publicCall(api => api.publicContent.getArticle(slug));
  return value as Article | null;
});

export async function getArticles(kind?: Kind, filters: Record<string, string> = {}) {
  return createServerChemistTaskerApi({ baseUrl: backend }).publicContent.listArticles({ ...filters, kind }) as Promise<Page<Article>>;
}

export const getPublicHubs = () => publicCall(api => api.publicContent.listHubs());
export const getPublicHubPosts = <T>(hub: string) => publicCall(api => api.publicContent.listCommunityPosts(hub) as Promise<T>);
export const getPublicHubPost = <T>(id: number) => publicCall(api => api.publicContent.getPost(id) as Promise<T>);
export const getPublicSitemap = () => publicCall(api => api.publicContent.getSitemap<Array<{ loc: string; lastmod?: string }>>());
