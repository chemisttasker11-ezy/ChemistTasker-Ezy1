const marketplaceImagePath = /^\/api\/marketplace\/images\/\d+\/?$/;

/** Keep API-served photos on the browser's origin, not Docker's internal host. */
export function marketplaceImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value, 'http://localhost');
    if (marketplaceImagePath.test(url.pathname)) {
      return `${url.pathname}${url.search}`;
    }
  } catch {
    // Leave unrelated URLs untouched; the browser will handle invalid sources.
  }

  return value;
}
