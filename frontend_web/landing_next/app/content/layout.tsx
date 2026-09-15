import type {Metadata} from 'next';
import HubHeader from '../(hub)/components/hub-header';
import '../(hub)/hub.css';
import './content.css';
export const metadata:Metadata={title:'Publishing workspace | ChemistTasker',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function ContentLayout({children}:{children:React.ReactNode}){return <><HubHeader/><div className="content-app">{children}</div></>;}
