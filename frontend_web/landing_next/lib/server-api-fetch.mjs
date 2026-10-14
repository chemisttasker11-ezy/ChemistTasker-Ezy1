/**
 * Preserve the public request scheme when Next reaches Django over the private
 * HTTP network, matching platformProxy's trusted deployment configuration.
 * @param {string | undefined} siteUrl
 * @param {typeof fetch} [fetchImpl]
 * @returns {typeof fetch}
 */
export function createServerApiFetch(siteUrl, fetchImpl = globalThis.fetch) {
  const protocol = new URL(siteUrl || 'http://localhost:3000').protocol.replace(':', '');
  return (input, init = {}) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    headers.set('x-forwarded-proto', protocol);
    return fetchImpl(input, { ...init, headers });
  };
}
