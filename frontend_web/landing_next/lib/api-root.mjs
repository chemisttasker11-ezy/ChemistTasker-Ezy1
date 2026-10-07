// Canonical Django API root for every Next server path (BFF proxy, SSR client, Hub, rewrites).
// Same rule as Vite (src/config/api.ts) and Expo (utils/apiUrl.ts): a host, `/api` or
// `/api/v1` configuration all resolve to exactly `/api/v1`, so a deployment still set to
// the pre-F06 `/api` root keeps working instead of 404ing every proxied call.

export const DEFAULT_API_ROOT = 'http://127.0.0.1:8000/api/v1';

/** @param {string | null | undefined} value @returns {string} */
export function canonicalApiRoot(value) {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_API_ROOT;
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

/** Backend origin for routes outside API versioning (WebSocket, media). @param {string} apiRoot @returns {string} */
export function backendOrigin(apiRoot) {
  return canonicalApiRoot(apiRoot).replace(/\/api\/v1$/, '');
}
