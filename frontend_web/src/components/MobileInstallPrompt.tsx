import { useEffect, useState } from 'react';
import { isPublicContentPath, storeForMobileUserAgent } from '../../landing_next/shared/mobile-store-links';

const DISMISSED = 'chemisttasker_install_banner_dismissed_session';

/** Accessible, non-blocking store choice for mobile visitors to any public content. */
export default function MobileInstallPrompt({ path }: { path: string }) {
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    let alreadyDismissed = false;
    try { alreadyDismissed = window.sessionStorage.getItem(DISMISSED) === '1'; } catch { /* private mode */ }
    const installed = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    const store = storeForMobileUserAgent(window.navigator.userAgent);
    setStoreUrl(!installed && !alreadyDismissed && isPublicContentPath(path) ? store : null);
  }, [path]);

  const continueOnWeb = () => {
    try { window.sessionStorage.setItem(DISMISSED, '1'); } catch { /* private mode */ }
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
        <a href={storeUrl} className="ct-mobile-app-offer__install" target="_blank" rel="noopener noreferrer" onClick={continueOnWeb}>
          Get the app
        </a>
        <button type="button" onClick={continueOnWeb} className="ct-mobile-app-offer__continue">Continue on website</button>
      </div>
    </aside>
  );
}
