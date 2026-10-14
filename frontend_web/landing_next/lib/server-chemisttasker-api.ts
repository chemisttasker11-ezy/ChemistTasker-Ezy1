import 'server-only';

import { createChemistTaskerApi, type ApiClientConfig } from '@chemisttasker/shared-core';
import { canonicalApiRoot } from './api-root.mjs';
import { createServerApiFetch } from './server-api-fetch.mjs';

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
    baseUrl: context.baseUrl ?? canonicalApiRoot(process.env.PLATFORM_API_URL),
    getAuthToken: () => context.authToken ?? null,
    fetchImpl: createServerApiFetch(process.env.NEXT_PUBLIC_SITE_URL, context.fetchImpl),
  };
  return createChemistTaskerApi(config);
}
