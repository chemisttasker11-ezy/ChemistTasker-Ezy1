/**
 * Build a WebSocket URL for a backend socket path.
 *
 * `apiBase` may be absolute (production: `https://api.example.com/api`) or
 * relative (local dev: `/api`, served through the Vite proxy). A relative base
 * is resolved against the page origin, so `new URL(path, '/api')` never throws.
 * http maps to ws and https to wss.
 */
export const buildWsUrl = (
  path: string,
  apiBase: string | null | undefined,
  origin: string,
  ticket?: string | null,
): string => {
  const base = new URL(apiBase || '/', origin);
  const url = new URL(path, base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (ticket) {
    url.searchParams.set('ticket', ticket);
  }
  return url.toString();
};
