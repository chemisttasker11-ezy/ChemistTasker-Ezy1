export const dynamic = 'force-dynamic';
import HubHeader from '../(hub)/components/hub-header';
import '../(hub)/hub.css';
import '../content/content.css';
export default function Layout({children}:{children:React.ReactNode}){return <><HubHeader/><div className="community-app" id="hub-main">{children}</div></>;}
