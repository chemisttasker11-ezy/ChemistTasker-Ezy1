import type {Metadata} from 'next';
import GoodsListingsV2 from '@/features/marketplace/goods-listings-v2';
export const metadata:Metadata={title:'My marketplace listings | ChemistTasker',robots:{index:false,follow:false}};
export default function Page(){return <GoodsListingsV2/>}
