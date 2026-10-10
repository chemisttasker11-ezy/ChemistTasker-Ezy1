import Link from 'next/link';
import { publicRoutes } from './routes';

const footerGroups = [
  {
    title: 'Explore',
    links: [
      ['Find shifts', publicRoutes.publicShifts],
      ['Find talent', publicRoutes.publicTalent],
      ['Marketplace', publicRoutes.marketplace],
      ['Community', publicRoutes.hubs],
    ],
  },
  {
    title: 'Learn',
    links: [
      ['Learning', publicRoutes.learning],
      ['Blog', publicRoutes.blog],
      ['News', publicRoutes.news],
      ['Calculator', publicRoutes.calculator],
    ],
  },
  {
    title: 'Company',
    links: [
      ['Pricing', publicRoutes.pricing],
      ['Organisation plans', publicRoutes.organizationPricing],
      ['Contact', publicRoutes.contact],
      ['Privacy', publicRoutes.privacy],
      ['Terms', publicRoutes.terms],
    ],
  },
] as const;

export default function PublicFooter() {
  return (
    <footer className="public-footer-shell">
      <div className="container public-footer">
        <div className="public-footer-brand">
          <Link href="/" className="public-wordmark" aria-label="ChemistTasker home">
            ChemistTasker
            <span>People. Pharmacy. Possibility.</span>
          </Link>
          <p>Made for Australian pharmacy work and pharmacy teams.</p>
        </div>
        <div className="public-footer-groups">
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <strong>{group.title}</strong>
              {group.links.map(([text, url]) => <Link key={url} href={url}>{text}</Link>)}
            </nav>
          ))}
        </div>
        <div className="public-footer-bottom">
          <small>© {new Date().getFullYear()} ChemistTasker Pty Ltd</small>
          <div>
            <Link href="/account-deletion">Delete account</Link>
            <span aria-hidden="true">·</span>
            <Link href={publicRoutes.privacy}>Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link href={publicRoutes.terms}>Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
