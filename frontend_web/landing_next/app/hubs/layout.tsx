export const dynamic = 'force-dynamic';
import PublicHeader from '@/public/header';
import PublicFooter from '@/public/footer';
import '../(public)/public.css';
import '../(hub)/hub.css';
import '../content/content.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader skipTarget="hub-main" />
      <div className="community-app" id="hub-main">{children}</div>
      <PublicFooter />
    </>
  );
}
