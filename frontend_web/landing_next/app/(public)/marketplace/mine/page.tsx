import type {Metadata} from 'next';
import {GoodsWorkspace} from '@/features/marketplace/workspace';
export const metadata:Metadata={title:'My marketplace listings | ChemistTasker',robots:{index:false,follow:false}};
export default function Page(){return <GoodsWorkspace view="mine"/>}
