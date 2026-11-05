/** Restrict server-supplied attachment URLs to the same media origins as web chat.
 *  A message payload is not permission to open an arbitrary URL on the user's phone.
 *  Server-side room/attachment authorization remains independently required.
 */
export function safeChatAttachmentUrl(
  raw: string | null | undefined,
  apiBaseUrl: string,
  configuredOrigins = '',
): string | null {
  if (!raw || !apiBaseUrl || /[\\\u0000-\u001f\u007f]/.test(raw) || raw.startsWith('//')) return null;
  try {
    const apiOrigin = new URL(apiBaseUrl).origin;
    const url = new URL(raw, `${apiOrigin}/`);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    const localMedia = url.origin === apiOrigin && /^\/(?:api\/v1\/)?media\//.test(url.pathname);
    const azureMedia = url.protocol === 'https:' && /^[a-z0-9]{3,24}\.blob\.core\.windows\.net$/i.test(url.hostname);
    const extraMedia = configuredOrigins.split(',').some(value => {
      try {
        const allowed = new URL(value.trim());
        return allowed.protocol === 'https:' && allowed.origin === url.origin && !allowed.username && !allowed.password;
      } catch {
        return false;
      }
    });
    return localMedia || azureMedia || extraMedia ? url.href : null;
  } catch {
    return null;
  }
}
