'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isPublicContentPath, storeForMobileUserAgent } from '../shared/mobile-store-links';

const DISMISSED = 'chemisttasker_install_banner_dismissed_session';

/** Next-owned component; share only the platform/path rules with Vite, not React modules across package roots. */
export default function AppInstallBanner() {
  const path = usePathname() || '/';
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = window.sessionStorage.getItem(DISMISSED) === '1'; } catch { /* private browsing */ }
    const installed = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    const store = storeForMobileUserAgent(window.navigator.userAgent);
    setStoreUrl(!installed && !dismissed && isPublicContentPath(path) ? store : null);
  }, [path]);

  const continueOnWeb = () => {
    try { window.sessionStorage.setItem(DISMISSED, '1'); } catch { /* private browsing */ }
    setStoreUrl(null);
  };

  if (!storeUrl) return null;
  return (
    <aside className="ct-mobile-app-offer" aria-label="ChemistTasker mobile app" role="region">
      <div className="ct-mobile-app-offer__copy">
        <strong>Prefer the ChemistTasker app?</strong>
        <span>Get faster access to shifts, messages and your pharmacy team, or continue here in your browser.</span>
      </div>
      <div className="ct-mobile-app-offer__actions">
        <a href={storeUrl} className="ct-mobile-app-offer__install" target="_blank" rel="noopener noreferrer" onClick={continueOnWeb}>Get the app</a>
        <button type="button" onClick={continueOnWeb} className="ct-mobile-app-offer__continue">Continue on website</button>
      </div>
    </aside>
  );
}
