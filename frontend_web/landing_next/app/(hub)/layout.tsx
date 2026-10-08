import PublicHeader from '@/public/header';
import PublicFooter from '@/public/footer';
import './hub.css';

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hub">
      <PublicHeader skipTarget="hub-main" />
      <main id="hub-main">
        {process.env.NODE_ENV !== 'production' && process.env.HUB_PREVIEW_MODE === '1' && (
          <div className="hub-preview-banner">
            Local preview · Sample articles and test accounts · Nothing is published to the live platform
          </div>
        )}
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
