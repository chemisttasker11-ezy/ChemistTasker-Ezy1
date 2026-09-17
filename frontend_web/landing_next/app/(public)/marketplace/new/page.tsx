import type {Metadata} from 'next';
import AddItemWizard from '@/features/marketplace/add-item-wizard';
export const metadata:Metadata={title:'Add an item | ChemistTasker Marketplace',robots:{index:false,follow:false}};
export default function Page(){return <AddItemWizard/>}
