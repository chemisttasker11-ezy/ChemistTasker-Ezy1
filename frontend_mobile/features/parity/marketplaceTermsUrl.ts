/** Resolve the terms URL supplied with the backend's current marketplace version. */
const legalOrigin = 'https://www.chemisttasker.com.au';

export function marketplaceTermsHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.startsWith('//') || candidate.includes('\\')) return null;
  try {
    const url = new URL(candidate, legalOrigin);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!['chemisttasker.com.au', 'www.chemisttasker.com.au'].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
