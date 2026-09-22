import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY='@chemisttasker_marketplace_mobile_draft_v1';

export type MarketplaceMobileDraft = {
  seller_context:'PERSONAL'|'PHARMACY'; pharmacy:number|null; category:number|null; category_name:string;
  mode:'SELL'|'FREE'|'SWAP'; title:string; description:string; condition:string; quantity:number; unit:string;
  amount:string; desired_swap:string; suburb:string; state:string; postcode:string; private_pickup_details:string;
  allowed_buyer_roles:string[]; delivery_method:'PICKUP'|'POSTAGE'|'BOTH'; postage_payer:'BUYER'|'SELLER'|'';
  postage_organiser:'BUYER'|'SELLER'|''; known_cost:string; quote_required:boolean; image_uris:string[];
};
export const emptyMarketplaceDraft=():MarketplaceMobileDraft=>({
  seller_context:'PERSONAL',pharmacy:null,category:null,category_name:'',mode:'SELL',title:'',description:'',condition:'GOOD',
  quantity:1,unit:'item',amount:'',desired_swap:'',suburb:'',state:'QLD',postcode:'',private_pickup_details:'',
  allowed_buyer_roles:[],delivery_method:'PICKUP',postage_payer:'',postage_organiser:'',known_cost:'',quote_required:false,image_uris:[]
});
export async function loadMarketplaceDraft():Promise<MarketplaceMobileDraft>{const raw=await AsyncStorage.getItem(KEY);if(!raw)return emptyMarketplaceDraft();try{return {...emptyMarketplaceDraft(),...JSON.parse(raw)};}catch{return emptyMarketplaceDraft();}}
export async function saveMarketplaceDraft(value:MarketplaceMobileDraft){await AsyncStorage.setItem(KEY,JSON.stringify(value));}
export async function patchMarketplaceDraft(patch:Partial<MarketplaceMobileDraft>){const next={...(await loadMarketplaceDraft()),...patch};await saveMarketplaceDraft(next);return next;}
export async function clearMarketplaceDraft(){await AsyncStorage.removeItem(KEY);}
