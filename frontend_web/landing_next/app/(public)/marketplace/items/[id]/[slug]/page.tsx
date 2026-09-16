import type {Metadata} from 'next';
import MarketplaceItem from './marketplace-item';

export const metadata:Metadata={title:'Marketplace listing | ChemistTasker',description:'View an approved public ChemistTasker marketplace listing.',robots:{index:false,follow:true}};

export default async function MarketplaceItemPage({params}:{params:Promise<{id:string;slug:string}>}){
 const {id}=await params;
 return <MarketplaceItem id={id}/>;
}
