import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { deleteSavedProfessionalContact, listSavedProfessionalContacts, saveProfessionalContact, type SavedProfessionalContact } from '@chemisttasker/shared-core';
import { getSessionGeneration } from '../../utils/authSession';
import type { ShareCode } from './shareCode';
import { parseChemistTaskerShareCode } from './shareCode';

export type SavedContact = ShareCode & { savedAt: string; synced?: boolean };
const key=(accountId:number|string)=>'ct.mobile.qr.saved.v1.'+encodeURIComponent(String(accountId));
const secureKey=(accountId:number|string)=>'ct.mobile.qr.invites.v1.'+String(accountId).replace(/[^A-Za-z0-9._-]/g,'_');

function parseRows(raw:string|null):SavedContact[]{
 if(!raw)return [];
 try{
  const values=JSON.parse(raw);
  if(!Array.isArray(values))return [];
  return values.flatMap((row:any)=>{
   const parsed=typeof row?.url==='string'?parseChemistTaskerShareCode(row.url):null;
   return parsed?[{...parsed,savedAt:typeof row.savedAt==='string'?row.savedAt:'',synced:row.synced===true}]:[];
  }).slice(0,100);
 }catch{return [];}
}
function fromRemote(contact:SavedProfessionalContact):SavedContact|null{
 const url=contact.kind==='WORKER_LISTING'
  ? 'https://chemisttasker.com.au/talent/public-board?reference_code='+encodeURIComponent(contact.reference)
  : 'https://chemisttasker.com.au/organization/'+encodeURIComponent(contact.reference);
 const parsed=parseChemistTaskerShareCode(url);
 if(!parsed||parsed.kind==='pharmacy-invitation')return null;
 return {...parsed,savedAt:contact.saved_at,synced:true};
}
function cloudIdentity(code:ShareCode):Pick<SavedProfessionalContact,'kind'|'reference'>|null{
 if(code.kind==='worker-public-listing')return {kind:'WORKER_LISTING',reference:code.referenceCode};
 if(code.kind==='organization')return {kind:'ORGANIZATION',reference:code.slug};
 return null;
}

/** Public cards sync through an authenticated user-only API; bearer invite tokens never leave OS SecureStore. */
export async function listSavedContacts(accountId:number|string):Promise<SavedContact[]>{
 const [plain,protectedData,cloud]=await Promise.all([
  AsyncStorage.getItem(key(accountId)),
  SecureStore.getItemAsync(secureKey(accountId)),
  listSavedProfessionalContacts().catch(()=>null),
 ]);
 const saved=parseRows(plain);
 const invitations=saved.filter(row=>row.kind==='pharmacy-invitation');
 const publicLocal=saved.filter(row=>row.kind!=='pharmacy-invitation');
 let protectedContacts=parseRows(protectedData).filter(row=>row.kind==='pharmacy-invitation');
 if(invitations.length){
  // Migrate legacy bearer links into encrypted OS storage BEFORE deleting the plaintext copy.
  const migrated=new Map<string,(typeof protectedContacts)[number]>();
  for(const row of [...invitations,...protectedContacts])migrated.set(row.url,row);
  protectedContacts=[...migrated.values()].slice(-5);
  await SecureStore.setItemAsync(secureKey(accountId),JSON.stringify(protectedContacts));
  await AsyncStorage.setItem(key(accountId),JSON.stringify(publicLocal));
 }
 const merged=new Map<string,SavedContact>();
 // When online, the account API is authoritative for previously synced bookmarks,
 // so deleting one on another device does not resurrect its stale local copy.
 for(const row of publicLocal)if(!Array.isArray(cloud)||!row.synced)merged.set(row.url,row);
 if(Array.isArray(cloud)){
  for(const row of cloud){
   const item=fromRemote(row);
   if(item)merged.set(item.url,item);
  }
 }
 return [...protectedContacts,...merged.values()].slice(0,100);
}

export async function saveContact(accountId:number|string,contact:ShareCode):Promise<SavedContact[]>{
 const generation=getSessionGeneration();
 const identity=cloudIdentity(contact);
 // A failed network sync never prevents keeping a local draft.
 let synced=false;
 if(identity){
  try{await saveProfessionalContact(identity);synced=true;}
  catch{synced=false;}
 }
 if(generation!==getSessionGeneration())throw new Error('Session changed during contact sync');
 const existing=await listSavedContacts(accountId);
 const next:SavedContact={...contact,savedAt:new Date().toISOString(),synced};
 if(contact.kind==='pharmacy-invitation'){
  const protectedContacts=[next,...existing.filter(row=>row.kind==='pharmacy-invitation'&&row.url!==contact.url)].slice(0,5);
  await SecureStore.setItemAsync(secureKey(accountId),JSON.stringify(protectedContacts));
 }else{
  const publicContacts=[next,...existing.filter(row=>row.kind!=='pharmacy-invitation'&&row.url!==contact.url)].slice(0,100);
  await AsyncStorage.setItem(key(accountId),JSON.stringify(publicContacts));
 }
 if(generation!==getSessionGeneration())throw new Error('Session changed during contact sync');
 return listSavedContacts(accountId);
}

export async function removeContact(accountId:number|string,url:string):Promise<SavedContact[]>{
 const generation=getSessionGeneration();
 const parsed=parseChemistTaskerShareCode(url);
 if(!parsed)throw new Error('Invalid saved contact.');
 const identity=cloudIdentity(parsed);
 if(identity){
  // Do not falsely report deletion when this contact still exists on another device.
  const remote=await listSavedProfessionalContacts();
  if(generation!==getSessionGeneration())throw new Error('Session changed during contact removal');
  const match=remote.find(row=>row.kind===identity.kind&&row.reference===identity.reference);
  if(match)await deleteSavedProfessionalContact(match.id);
 }
 if(generation!==getSessionGeneration())throw new Error('Session changed during contact removal');
 const next=(await listSavedContacts(accountId)).filter(row=>row.url!==url);
 await Promise.all([
  AsyncStorage.setItem(key(accountId),JSON.stringify(next.filter(row=>row.kind!=='pharmacy-invitation'))),
  SecureStore.setItemAsync(secureKey(accountId),JSON.stringify(next.filter(row=>row.kind==='pharmacy-invitation').slice(0,5))),
 ]);
 return next;
}
