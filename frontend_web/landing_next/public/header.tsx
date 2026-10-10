'use client';
import AccountControls from '@/shared/account-controls';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronDown, Menu, PackagePlus, X } from 'lucide-react';
import { publicRoutes } from './routes';

const primaryLinks = [
  ['The platform', '/#features'],
  ["Who it's for", '/#workspaces'],
  ['How it works', '/#how-it-works'],
  ['Pricing', publicRoutes.pricing],
] as const;

const resourceLinks = [
  ['Find shifts', publicRoutes.publicShifts],
  ['Find talent', publicRoutes.publicTalent],
  ['Marketplace', publicRoutes.marketplace],
  ['Add marketplace item', publicRoutes.marketplaceNew],
  ['Community', publicRoutes.hubs],
  ['Learning', publicRoutes.learning],
  ['Blog', publicRoutes.blog],
  ['News', publicRoutes.news],
  ['Calculator', publicRoutes.calculator],
  ['Organisation plans', publicRoutes.organizationPricing],
  ['Contact', publicRoutes.contact],
] as const;

export default function PublicHeader({ skipTarget = 'public-content' }: { skipTarget?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isFocusedExternalTask =
    pathname.startsWith('/referee/') ||
    pathname.startsWith('/onboarding/referee-reject/');

  useEffect(() => setOpen(false), [pathname]);

  const current = (url: string) => {
    if (url.includes('#')) return false;
    return pathname === url || pathname.startsWith(url + '/');
  };

  return (
    <header className="site-header public-site-header">
      <a className="skip-link" href={'#' + skipTarget}>Skip to content</a>
      <div className="container nav-shell public-nav-shell">
        <Link className="logo" href={publicRoutes.home} aria-label="ChemistTasker home">
          <img src="/assets/calculator-wordmark.png" alt="ChemistTasker" />
        </Link>

        {!isFocusedExternalTask && (
          <nav className="desktop-nav public-primary-nav" aria-label="Main navigation">
            {primaryLinks.map(([label, url]) => (
              <Link key={url} href={url} aria-current={current(url) ? 'page' : undefined}>
                {label}
              </Link>
            ))}
            <details className="ct-resources public-resources">
              <summary>
                Resources <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <nav aria-label="Public resources">
                {resourceLinks.map(([label, url]) => (
                  <Link
                    key={url}
                    href={url}
                    aria-current={current(url) ? 'page' : undefined}
                    onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
                  >
                    {label === 'Add marketplace item' && <PackagePlus size={14} aria-hidden="true" />}
                    {label}
                  </Link>
                ))}
              </nav>
            </details>
          </nav>
        )}

        <div className="nav-actions public-account-actions">
          {isFocusedExternalTask ? (
            <Link className="button secondary small" href={publicRoutes.contact}>Need help?</Link>
          ) : (
            <AccountControls />
          )}
        </div>
        {!isFocusedExternalTask && <button
          className="menu-toggle"
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="public-mobile-nav"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>}
      </div>

      {!isFocusedExternalTask && open && (
        <nav id="public-mobile-nav" className="mobile-nav public-mobile-nav" aria-label="Mobile navigation">
          <div className="public-mobile-group">
            <span>Explore ChemistTasker</span>
            {primaryLinks.map(([label, url]) => (
              <Link key={url} href={url} aria-current={current(url) ? 'page' : undefined} onClick={() => setOpen(false)}>
                {label}<ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <div className="public-mobile-group">
            <span>Work, people & resources</span>
            {resourceLinks.map(([label, url]) => (
              <Link key={url} href={url} aria-current={current(url) ? 'page' : undefined} onClick={() => setOpen(false)}>
                {label}<ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
          <div className="public-mobile-account"><AccountControls /></div>
        </nav>
      )}
    </header>
  );
}
