import PublicHeader from '@/public/header';
import PublicFooter from '@/public/footer';
import './public.css';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="public-content">{children}</main>
      <PublicFooter />
    </>
  );
}
