/** Verified ChemistTasker store listing identifiers. Shared by Next and Vite. */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6759088580';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.chemisttasker.app';

export function storeForMobileUserAgent(userAgent: string): string | null {
  if (/Android/i.test(userAgent)) return PLAY_STORE_URL;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return APP_STORE_URL;
  return null;
}

/** Never interrupt account management, checkout, payment or signed-in work. */
export function isPublicContentPath(path: string): boolean {
  return /^(?:\/$|\/(?:blog|news|learning|hubs|talent|organization|marketplace|pricing|how-it-works|calculator|contact|privacy-policy|terms-of-service)(?:\/|$)|\/shifts\/(?:public-board|link)(?:\/|$))/.test(path)
    && !/^\/(?:dashboard|content|login|register|checkout|billing|mobile-checkout-return|account-deletion)(?:\/|$)/.test(path);
}
