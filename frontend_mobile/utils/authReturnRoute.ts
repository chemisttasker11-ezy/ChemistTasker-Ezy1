const ALLOWED_EXACT_PATHS = new Set(['/admin-invitations', '/explore']);

const SAFE_QUERY_PARAMS = new Set([
  'referral_code',
  'referral_event_id',
  'referral_shift_id',
  'source',
  'category',
  'role',
  'token',
]);

/**
 * Conservative internal return route helper.
 * Allows only known existing entrypoints:
 * - /membership/apply/[token]
 * - /admin-invitations
 * - /explore and /explore/*
 * Rejects external, protocol-relative, backslash, traversal, and encoded escape routes.
 */
export function sanitizeReturnTo(raw: unknown): string | null {
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate !== 'string' || /[\x00-\x1f\x7f]/.test(candidate)) return null;

  // Strip fragment junk
  const clean = candidate.split('#')[0].trim();
  if (!clean.startsWith('/') || clean.startsWith('//')) return null;

  // Reject control characters (ASCII 0-31, 127)
  if (/[\x00-\x1f\x7f]/.test(clean)) return null;

  // Reject backslashes, schemes, and double-slashes anywhere
  if (/[\\:]|\/\//.test(clean)) return null;

  // Reject malformed percent-encoding (% not followed by two hex digits)
  if (/%(?![0-9a-fA-F]{2})/.test(clean)) return null;

  // Reject double-encoded escapes (%252e, %252f, %255c, %2500, etc.)
  if (/%25(?:2e|2f|5c|00)/i.test(clean)) return null;

  // Reject directory traversal and encoded escape variants (%2e, %2f, %5c, %00)
  if (/(\.\.|\%2e|\%2f|\%5c|\%00)/i.test(clean)) return null;

  const [pathPart, queryPart] = clean.split('?');

  const isAllowedPath =
    ALLOWED_EXACT_PATHS.has(pathPart) ||
    /^\/membership\/apply\/[a-zA-Z0-9_-]+$/.test(pathPart) ||
    /^\/explore(?:\/[a-zA-Z0-9_%-]+)+$/.test(pathPart);

  if (!isAllowedPath) return null;

  if (!queryPart) {
    return pathPart;
  }

  // Preserve only safe, relevant query/referral context
  try {
    const params = new URLSearchParams(queryPart);
    const safeParams = new URLSearchParams();
    for (const [key, val] of params.entries()) {
      if (SAFE_QUERY_PARAMS.has(key) && /^[a-zA-Z0-9_.-]+$/.test(val)) {
        safeParams.set(key, val);
      }
    }
    const safeQuery = safeParams.toString();
    return safeQuery ? `${pathPart}?${safeQuery}` : pathPart;
  } catch {
    return pathPart;
  }
}
