import EthicalWorkspaceV2 from '@/features/marketplace/ethical-workspace-v2';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Overview | Ethical marketplace | ChemistTasker'};
export default function Page(){return <EthicalWorkspaceV2 view="home"/>}
