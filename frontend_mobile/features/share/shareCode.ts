/** Only ChemistTasker-owned public identity/invitation paths may become saved QR contacts.
 * A QR is an untrusted input, NEVER a grant of staff, fav or admin membership.
 */
export type ShareCode =
  | { kind: 'pharmacy-invitation'; url: string; token: string }
  | { kind: 'worker-public-listing'; url: string; referenceCode: string }
  | { kind: 'organization'; url: string; slug: string };

const TRUSTED_HOSTS = new Set(['chemisttasker.com.au', 'www.chemisttasker.com.au']);
const TOKEN = /^[A-Za-z0-9_-]{8,200}$/;
const REF = /^[A-Za-z0-9_-]{4,100}$/;

export function parseChemistTaskerShareCode(raw: string): ShareCode | null {
  if (raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || !TRUSTED_HOSTS.has(url.hostname.toLowerCase()) || url.port || url.username || url.password || url.hash) return null;
  const path = url.pathname.replace(/\/$/, '');
  const q = url.searchParams;
  const token = /^\/membership\/apply\/([A-Za-z0-9_-]+)$/.exec(path)?.[1];
  if (token && TOKEN.test(token) && !url.search) return { kind: 'pharmacy-invitation', token, url: 'https://chemisttasker.com.au/membership/apply/' + token };
  const code = q.get('reference_code');
  if (path === '/talent/public-board' && code && REF.test(code) && [...q.keys()].length === 1) {
    return { kind: 'worker-public-listing', referenceCode: code, url: 'https://chemisttasker.com.au/talent/public-board?reference_code=' + encodeURIComponent(code) };
  }
  const slug = /^\/organization\/([A-Za-z0-9_-]+)$/.exec(path)?.[1];
  if (slug && REF.test(slug) && !url.search) return { kind: 'organization', slug, url: 'https://chemisttasker.com.au/organization/' + slug };
  return null;
}

export function safeShareCodeLabel(code: ShareCode): string {
  if (code.kind === 'pharmacy-invitation') return 'Pharmacy membership invitation';
  if (code.kind === 'worker-public-listing') return 'Public worker listing';
  return 'Public organisation profile';
}
