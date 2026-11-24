'use client';

import { createChemistTaskerApi } from '@chemisttasker/shared-core';
import { csrfToken, expireBrowserSession, fetchWithBrowserSession, getSessionGeneration, refreshBrowserSession } from '@/shared/browser-session';

const browserFetch: typeof fetch = async (input, init = {}) => {
  const generation = getSessionGeneration();
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('X-Client-Platform', 'web');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers.has('X-CSRFToken')) {
    headers.set('X-CSRFToken', await csrfToken());
  }
  if (generation !== getSessionGeneration()) throw new Error('Session changed during request.');
  return fetchWithBrowserSession(input, {
    ...init,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
};

/** Cookie-backed browser client. It carries no module-global user token. */
export const chemistTaskerApi = createChemistTaskerApi({
  baseUrl: '/api/platform',
  refreshAuthToken: async () => (await refreshBrowserSession()).access,
  onAuthFailure: expireBrowserSession,
  getSessionGeneration,
  fetchImpl: browserFetch,
});
