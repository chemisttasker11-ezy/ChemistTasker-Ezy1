import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPendingIntentStore, getApiConfig } from '@chemisttasker/shared-core';
import { idempotencyKey } from './utils';

const KEY_PREFIX='@chemisttasker_marketplace_mobile_draft_v2';
const LEGACY_KEY='@chemisttasker_marketplace_mobile_draft_v1';

function key(scope:string){return `${KEY_PREFIX}:${scope}`;}

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
  // A 409 mismatch / 410 / missing-listing outcome for that intent key, kept until the user discards it;
  // `reset` = the listing itself is gone or unusable, so discarding starts a new listing from this draft.
  terminal_intent:{key:string;message:string;reset:boolean}|null;
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
  created_listing_id:null,created_listing_version:null,uploaded_image_uris:[],uploaded_image_ids:{},create_request_id:idempotencyKey('marketplace-listing'),settled_intent:null,terminal_intent:null
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
// The shared pending-intent store (task 0): environment + account scope, lock, envelope validation and
// review-first recovery of corrupt records. A corrupt or unreadable record throws, so it blocks the draft.
const intentStore=(scope:string,newKey:()=>string=idempotencyKey)=>createPendingIntentStore({storage:AsyncStorage,
  lock:(name,run)=>serial(name,run),environment:getApiConfig().baseURL,userId:scope,operation:'marketplace.listing.mutation',newKey});
const OPERATIONS=['create','update','audience','upload','submit'];
const validIntent=(p:any)=>OPERATIONS.includes(p?.operation)&&typeof p.draft==='string'&&typeof p.snapshot==='string'&&
  (p.operation==='create'||typeof p.id==='string')&&(p.operation!=='upload'||[p.uri,p.file,p.name].every(x=>typeof x==='string'));
export const UNREADABLE_INTENT='A saved change for this listing could not be read safely. Retry; if this keeps happening, check My listings, then clear the unreadable saved change.';
export async function loadMarketplaceIntent(scope:string):Promise<MarketplacePendingIntent|null>{
  const record=await intentStore(scope).load();
  if(record&&!validIntent(record.exactPayload))throw new Error(UNREADABLE_INTENT);
  return record?{...record.exactPayload,key:record.key} as MarketplacePendingIntent:null;
}
/** The stored intent, unless it belongs to another (cleared) draft or its outcome is already recorded. */
export function pendingMarketplaceIntent(intent:MarketplacePendingIntent|null,draft:MarketplaceMobileDraft):MarketplacePendingIntent|null{
  return intent&&intent.draft===draft.create_request_id&&intent.key!==draft.settled_intent?intent:null;
}
/** Freeze the intent (key + exact request) durably; refuses while another intent is stored. */
export async function saveMarketplaceIntent(scope:string,intent:MarketplacePendingIntent){
  const{key:intentKey,...payload}=intent;
  const saved=await intentStore(scope,()=>intentKey).acquire(payload);
  if(saved.key!==intentKey)throw new Error('Review the pending listing change before starting another one.');
}
/** Release a reconciled intent (outcome recorded in the draft, or its draft cleared). */
export function releaseMarketplaceIntent(scope:string):Promise<void>{
  const store=intentStore(scope);
  return serial(store.scope,()=>AsyncStorage.removeItem(store.scope));
}
/** D104 review-first recovery: clears only a record that cannot be read as a valid intent. */
export async function recoverMarketplaceIntent(scope:string){
  const store=intentStore(scope);
  const record=await store.load().catch(()=>null); // corrupt or unreadable: the shared recovery decides
  if(record&&!validIntent(record.exactPayload))return releaseMarketplaceIntent(scope);
  return store.recoverCorruptAfterReview();
}
export async function saveMarketplaceDraft(scope:string,value:MarketplaceMobileDraft){await AsyncStorage.setItem(key(scope),JSON.stringify(value));}
// Serialize read/modify/write operations by account so concurrent field edits and
// server receipt progress cannot erase one another. A failed write releases its queue.
const writes=new Map<string,Promise<unknown>>();
function serial<T>(name:string,run:()=>Promise<T>):Promise<T>{
 const operation=(writes.get(name)??Promise.resolve()).catch(()=>undefined).then(run);
 writes.set(name,operation);
 void operation.finally(()=>{if(writes.get(name)===operation)writes.delete(name);}).catch(()=>undefined);
 return operation;
}
/**
 * Read after any pending per-account draft mutations, including server upload
 * receipts. Register the read in the same queue so a concurrent patch cannot
 * overtake it and make a retained Photos screen observe an older receipt.
 * Failed writes still release the queue; removing an unknown remote image
 * remains blocked rather than guessing its id.
 */
export function loadSettledMarketplaceDraft(scope:string):Promise<MarketplaceMobileDraft>{
 return serial(scope,()=>loadMarketplaceDraft(scope));
}
export function patchMarketplaceDraft(
 scope:string,patch:Partial<MarketplaceMobileDraft>,isCurrent:()=>boolean=()=>true,
):Promise<MarketplaceMobileDraft>{
 return serial(scope,async()=>{
  const existing=parseDraft(await AsyncStorage.getItem(key(scope)));
  const next={...existing,...patch};
  if(isCurrent())await AsyncStorage.setItem(key(scope),JSON.stringify(next));
  return next;
 });
}
export function clearMarketplaceDraft(scope:string):Promise<void>{
 return serial(scope,()=>{
  // Completion or discard: the intent bound to this draft is reconciled or abandoned with it.
  void Promise.resolve().then(()=>releaseMarketplaceIntent(scope)).catch(()=>undefined);
  return AsyncStorage.removeItem(key(scope));
 });
}
