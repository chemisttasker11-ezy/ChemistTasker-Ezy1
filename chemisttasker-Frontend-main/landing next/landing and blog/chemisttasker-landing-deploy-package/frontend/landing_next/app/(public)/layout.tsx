import Link from 'next/link';
import PublicHeader from '@/public/header';
import './public.css';
export default function PublicLayout({children}:{children:React.ReactNode}) {
 return <><PublicHeader/><main id="public-content">{children}</main><footer className="container public-footer"><div><Link href="/" className="public-wordmark">ChemistTasker<span> People. Pharmacy. Possibility.</span></Link><p>Made for Australian pharmacies.</p></div><nav aria-label="Footer">{[['Pricing','/pricing'],['Organisations','/pricing/organization'],['Contact us','/contact'],['Privacy','/privacy-policy'],['Terms','/terms-of-service'],['Delete account','/account-deletion']].map(([text,url])=><Link key={url} href={url}>{text}</Link>)}</nav><small>© {new Date().getFullYear()} ChemistTasker</small></footer></>;
}
