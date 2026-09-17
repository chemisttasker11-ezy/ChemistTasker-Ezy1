import 'server-only';

import { createChemistTaskerApi, type ApiClientConfig } from '@chemisttasker/shared-core';

export interface ServerApiContext {
  authToken?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Create exactly one API instance for one server request.
 * The caller must pass the token extracted by that request's auth boundary.
 */
export function createServerChemistTaskerApi(context: ServerApiContext = {}) {
  const config: ApiClientConfig = {
    baseUrl: context.baseUrl ?? process.env.PLATFORM_API_URL ?? 'http://127.0.0.1:8000/api',
    getAuthToken: () => context.authToken ?? null,
    ...(context.fetchImpl ? { fetchImpl: context.fetchImpl } : {}),
  };
  return createChemistTaskerApi(config);
}
