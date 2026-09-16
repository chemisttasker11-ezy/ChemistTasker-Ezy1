import type {Metadata} from 'next';
import Link from 'next/link';
import PublicHeader from '@/public/header';
import '@/app/(public)/public.css';
import '@/app/(public)/marketplace/marketplace.css';
import '@/features/marketplace/workspace.css';
export const metadata:Metadata={robots:{index:false,follow:false,nocache:true}};
export default function Layout({children}:{children:React.ReactNode}){return <><PublicHeader/><main id="public-content">{children}</main><footer className="container public-footer"><div><Link href="/" className="public-wordmark">ChemistTasker<span> People. Pharmacy. Possibility.</span></Link><p>Made for Australian pharmacies.</p></div><nav aria-label="Footer"><Link href="/marketplace">Public marketplace</Link><Link href="/privacy-policy">Privacy</Link><Link href="/terms-of-service">Terms</Link></nav><small>© {new Date().getFullYear()} ChemistTasker</small></footer></>}
