import type {Metadata} from 'next';
import {GoodsComposer} from '@/features/marketplace/workspace';
export const metadata:Metadata={title:'Create a marketplace listing | ChemistTasker',robots:{index:false,follow:false}};
export default function Page(){return <GoodsComposer/>}
