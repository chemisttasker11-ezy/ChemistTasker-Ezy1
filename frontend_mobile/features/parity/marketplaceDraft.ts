import AsyncStorage from '@react-native-async-storage/async-storage';
import { idempotencyKey } from './utils';

const KEY_PREFIX='@chemisttasker_marketplace_mobile_draft_v2';
const LEGACY_KEY='@chemisttasker_marketplace_mobile_draft_v1';

function key(scope:string){return `${KEY_PREFIX}:${scope}`;}
function intentKey(scope:string){return `${KEY_PREFIX}:${scope}:intent`;}

export type MarketplaceMobileDraft = {
  seller_context:'PERSONAL'|'PHARMACY'; pharmacy:number|null; category:number|null; category_name:string;
  mode:'SELL'|'FREE'|'SWAP'; title:string; description:string; condition:string; quantity:number; unit:string;
  amount:string; desired_swap:string; suburb:string; state:string; postcode:string; private_pickup_details:string;
  allowed_buyer_roles:string[]; delivery_method:'PICKUP'|'POSTAGE'|'BOTH'; postage_payer:'BUYER'|'SELLER'|'';
  postage_organiser:'BUYER'|'SELLER'|''; known_cost:string; quote_required:boolean; current_circle:'OWNED_CHAIN'|'ORGANISATION'|'PLATFORM'; maximum_circle:'OWNED_CHAIN'|'ORGANISATION'|'PLATFORM'; image_uris:string[];
  created_listing_id:string|null; created_listing_version:number|null; uploaded_image_uris:string[]; uploaded_image_ids:Record<string,number>;
  create_request_id:string;
  // Key of the last intent whose outcome was recorded in this draft (written with that outcome).
  settled_intent:string|null;
};
// One mutation at a time: its own key and exact request, frozen before it is sent. `draft` binds it
// to the draft's create_request_id, so it never replays against another listing draft.
export type MarketplacePendingIntent = {
  operation:'create'|'update'|'audience'|'upload'|'submit'; key:string; draft:string; snapshot:string;
  id?:string; body?:any; version?:number; uri?:string; file?:string; name?:string;
};
export const emptyMarketplaceDraft=():MarketplaceMobileDraft=>({
  seller_context:'PERSONAL',pharmacy:null,category:null,category_name:'',mode:'SELL',title:'',description:'',condition:'GOOD',
  quantity:1,unit:'item',amount:'',desired_swap:'',suburb:'',state:'QLD',postcode:'',private_pickup_details:'',
  allowed_buyer_roles:[],delivery_method:'PICKUP',postage_payer:'',postage_organiser:'',known_cost:'',quote_required:false,current_circle:'OWNED_CHAIN',maximum_circle:'PLATFORM',image_uris:[],
  created_listing_id:null,created_listing_version:null,uploaded_image_uris:[],uploaded_image_ids:{},create_request_id:idempotencyKey('marketplace-listing'),settled_intent:null
});
let legacyRemoved=false;
export async function loadMarketplaceDraft(scope:string):Promise<MarketplaceMobileDraft>{
  if(!legacyRemoved){legacyRemoved=true;await AsyncStorage.removeItem(LEGACY_KEY).catch(()=>null);}
  return parseDraft(await AsyncStorage.getItem(key(scope)));
}
function parseDraft(raw:string|null):MarketplaceMobileDraft{
  if(!raw)return emptyMarketplaceDraft();
  try{return {...emptyMarketplaceDraft(),...JSON.parse(raw)};}catch{return emptyMarketplaceDraft();}
}
export const loadMarketplaceIntent=(scope:string)=>AsyncStorage.getItem(intentKey(scope));
/** The stored intent, unless it belongs to another draft or its outcome is already recorded. */
export function pendingMarketplaceIntent(raw:string|null,draft:MarketplaceMobileDraft):MarketplacePendingIntent|null{
  let intent:MarketplacePendingIntent|null=null;
  // An unreadable intent cannot be resent; the server's version checks still refuse a stale repeat.
  try{intent=raw?JSON.parse(raw):null;}catch{intent=null;}
  return intent&&intent.draft===draft.create_request_id&&intent.key!==draft.settled_intent?intent:null;
}
export const saveMarketplaceIntent=(scope:string,intent:MarketplacePendingIntent)=>AsyncStorage.setItem(intentKey(scope),JSON.stringify(intent));
export const clearMarketplaceIntent=(scope:string)=>AsyncStorage.removeItem(intentKey(scope));
export async function saveMarketplaceDraft(scope:string,value:MarketplaceMobileDraft){await AsyncStorage.setItem(key(scope),JSON.stringify(value));}
// Serialize read/modify/write operations by account so concurrent field edits and
// server receipt progress cannot erase one another. A failed write releases its queue.
const writes=new Map<string,Promise<unknown>>();
/**
 * Read after any pending per-account draft mutations, including server upload
 * receipts. Register the read in the same queue so a concurrent patch cannot
 * overtake it and make a retained Photos screen observe an older receipt.
 * Failed writes still release the queue; removing an unknown remote image
 * remains blocked rather than guessing its id.
 */
export function loadSettledMarketplaceDraft(scope:string):Promise<MarketplaceMobileDraft>{
 const previous=writes.get(scope)??Promise.resolve();
 const read=previous.catch(()=>undefined).then(()=>loadMarketplaceDraft(scope));
 writes.set(scope,read);
 void read.finally(()=>{if(writes.get(scope)===read)writes.delete(scope);}).catch(()=>undefined);
 return read;
}
export function patchMarketplaceDraft(
 scope:string,patch:Partial<MarketplaceMobileDraft>,isCurrent:()=>boolean=()=>true,
):Promise<MarketplaceMobileDraft>{
 const previous=writes.get(scope)??Promise.resolve();
 const operation=previous.catch(()=>undefined).then(async()=>{
  const existing=parseDraft(await AsyncStorage.getItem(key(scope)));
  const next={...existing,...patch};
  if(isCurrent())await AsyncStorage.setItem(key(scope),JSON.stringify(next));
  return next;
 });
 writes.set(scope,operation);
 void operation.finally(()=>{if(writes.get(scope)===operation)writes.delete(scope);}).catch(()=>undefined);
 return operation;
}
export function clearMarketplaceDraft(scope:string):Promise<void>{
 const previous=writes.get(scope)??Promise.resolve();
 const operation=previous.catch(()=>undefined).then(()=>{
  // Hygiene only: an intent bound to a cleared draft's create_request_id is never resent.
  void AsyncStorage.removeItem(intentKey(scope)).catch(()=>undefined);
  return AsyncStorage.removeItem(key(scope));
 });
 writes.set(scope,operation);
 void operation.finally(()=>{if(writes.get(scope)===operation)writes.delete(scope);}).catch(()=>undefined);
 return operation;
}
