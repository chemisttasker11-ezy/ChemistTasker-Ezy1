import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX='@chemisttasker_marketplace_mobile_draft_v2';
const LEGACY_KEY='@chemisttasker_marketplace_mobile_draft_v1';

function key(scope:string){return `${KEY_PREFIX}:${scope}`;}

export type MarketplaceMobileDraft = {
  seller_context:'PERSONAL'|'PHARMACY'; pharmacy:number|null; category:number|null; category_name:string;
  mode:'SELL'|'FREE'|'SWAP'; title:string; description:string; condition:string; quantity:number; unit:string;
  amount:string; desired_swap:string; suburb:string; state:string; postcode:string; private_pickup_details:string;
  allowed_buyer_roles:string[]; delivery_method:'PICKUP'|'POSTAGE'|'BOTH'; postage_payer:'BUYER'|'SELLER'|'';
  postage_organiser:'BUYER'|'SELLER'|''; known_cost:string; quote_required:boolean; current_circle:'OWNED_CHAIN'|'ORGANISATION'|'PLATFORM'; maximum_circle:'OWNED_CHAIN'|'ORGANISATION'|'PLATFORM'; image_uris:string[];
  created_listing_id:string|null; created_listing_version:number|null; uploaded_image_uris:string[];
};
export const emptyMarketplaceDraft=():MarketplaceMobileDraft=>({
  seller_context:'PERSONAL',pharmacy:null,category:null,category_name:'',mode:'SELL',title:'',description:'',condition:'GOOD',
  quantity:1,unit:'item',amount:'',desired_swap:'',suburb:'',state:'QLD',postcode:'',private_pickup_details:'',
  allowed_buyer_roles:[],delivery_method:'PICKUP',postage_payer:'',postage_organiser:'',known_cost:'',quote_required:false,current_circle:'OWNED_CHAIN',maximum_circle:'PLATFORM',image_uris:[],
  created_listing_id:null,created_listing_version:null,uploaded_image_uris:[]
});
export async function loadMarketplaceDraft(scope:string):Promise<MarketplaceMobileDraft>{
  await AsyncStorage.removeItem(LEGACY_KEY).catch(()=>null);
  const raw=await AsyncStorage.getItem(key(scope));
  if(!raw)return emptyMarketplaceDraft();
  try{return {...emptyMarketplaceDraft(),...JSON.parse(raw)};}catch{return emptyMarketplaceDraft();}
}
export async function saveMarketplaceDraft(scope:string,value:MarketplaceMobileDraft){await AsyncStorage.setItem(key(scope),JSON.stringify(value));}
export async function patchMarketplaceDraft(scope:string,patch:Partial<MarketplaceMobileDraft>){const next={...(await loadMarketplaceDraft(scope)),...patch};await saveMarketplaceDraft(scope,next);return next;}
export async function clearMarketplaceDraft(scope:string){await AsyncStorage.removeItem(key(scope));}
