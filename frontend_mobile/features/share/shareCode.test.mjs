import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('./shareCode.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const box={exports:{},URL,Set};
vm.runInNewContext(js,box);
const {parseChemistTaskerShareCode:parse}=box.exports;
test('scanned QR requires exact trusted HTTPS origin and bounded route',()=>{
 const good=[
 'https://chemisttasker.com.au/membership/apply/abcdefghi',
 'https://www.chemisttasker.com.au/talent/public-board?reference_code=ABCDE1',
 'https://chemisttasker.com.au/organization/western-group',
 ];
 for(const url of good)assert.notEqual(parse(url),null);
 for(const url of [
   'http://chemisttasker.com.au/organization/a1234',
   'https://chemisttasker.com.au.evil.example/membership/apply/abcdefghi',
   'https://evil.example/talent/public-board?reference_code=ABCDE1',
   'https://chemisttasker.com.au@evil.example/organization/example',
   'javascript:alert(1)','https://chemisttasker.com.au/api/v1/users/me/',
   'https://chemisttasker.com.au/membership/apply/abcdefghi?redirect=evil',
   'https://chemisttasker.com.au/talent/public-board?reference_code=ABCDE1&email=private',
 ])assert.equal(parse(url),null);
});
test('scanned tokens are not permissions and remain account scoped',()=>{
 const storage=readFileSync(new URL('./savedContacts.ts',import.meta.url),'utf8');
 assert.match(storage,/encodeURIComponent\(String\(accountId\)\)/);
 assert.match(storage,/parseChemistTaskerShareCode\(row\.url\)/);
 const scan=readFileSync(new URL('../../app/share/scan.tsx',import.meta.url),'utf8');
 assert.match(scan,/No action was taken/);
 assert.match(scan,/requestPermission\(\)/);
 assert.match(scan,/user\?\.id == null \|\| !code/);
 assert.match(scan,/saveContact\(user\.id, code\)/);
 assert.doesNotMatch(scan,/approveMembership|createMembership|addFavorite|addFavourite/);
});

test('membership bearer invites use OS protected storage and public drafts stay separate',()=>{
 const source=readFileSync(new URL('./savedContacts.ts',import.meta.url),'utf8');
 assert.match(source,/SecureStore\.setItemAsync\(secureKey\(accountId\)/);
 assert.match(source,/contact\.kind==='pharmacy-invitation'/);
 assert.match(source,/const publicLocal=saved\.filter\(row=>row\.kind!=='pharmacy-invitation'\)/);
});

function savedContactHarness({plainRows=[],protectedRows=[],cloud=[]}={}){
 const plain=new Map([['ct.mobile.qr.saved.v1.7',JSON.stringify(plainRows)]]);
 const protectedStore=new Map([['ct.mobile.qr.invites.v1.7',JSON.stringify(protectedRows)]]);
 const mutations=[];
 let remote=cloud;
 const modules={
  '@react-native-async-storage/async-storage':{
   getItem: async k=>plain.get(k)||null,
   setItem: async (k,v)=>{mutations.push('plain');plain.set(k,v);},
   removeItem: async k=>{mutations.push('remove');plain.delete(k);}
  },
  'expo-secure-store':{
   getItemAsync: async k=>protectedStore.get(k)||null,
   setItemAsync: async (k,v)=>{mutations.push('secure');protectedStore.set(k,v);}
  },
  '@chemisttasker/shared-core':{
   listSavedProfessionalContacts: async()=>remote,
   saveProfessionalContact: async()=>({}),
   deleteSavedProfessionalContact: async()=>({})
  },
  './shareCode':{parseChemistTaskerShareCode:parse}
 };
 const tsSource=readFileSync(new URL('./savedContacts.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(tsSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const env={exports:{},require:name=>{
  if(!(name in modules))throw new Error('Unexpected module '+name);
  return modules[name];
 },Date,Map,JSON,String,Array,Promise,encodeURIComponent};
 vm.runInNewContext(compiled,env);
 return {api:env.exports,plain,protectedStore,mutations,setRemote:value=>{remote=value;}};
}
test('legacy bearer invite migrates to SecureStore before plaintext is purged',async()=>{
 const h=savedContactHarness({plainRows:[
  {url:'https://chemisttasker.com.au/membership/apply/abcdefghijk',savedAt:'2026-11-05T00:00:00Z'},
  {url:'https://chemisttasker.com.au/organization/worker-group',savedAt:'2026-11-05T00:00:00Z'}
 ]});
 const rows=await h.api.listSavedContacts(7);
 assert.equal(rows.some(row=>row.kind==='pharmacy-invitation'),true);
 assert.deepEqual(h.mutations,['secure','plain']);
 assert.doesNotMatch(h.plain.get('ct.mobile.qr.saved.v1.7'),/abcdefghijk/);
 assert.match(h.protectedStore.get('ct.mobile.qr.invites.v1.7'),/abcdefghijk/);
});
test('online list honours cloud deletion while offline keeps last synced bookmark',async()=>{
 const workerUrl='https://chemisttasker.com.au/talent/public-board?reference_code=ABCDE1';
 const h=savedContactHarness({plainRows:[{url:workerUrl,savedAt:'2026-11-05T00:00:00Z',synced:true}]});
 assert.equal((await h.api.listSavedContacts(7)).length,0);
 h.setRemote(null);
 assert.equal((await h.api.listSavedContacts(7)).length,1);
 h.setRemote([{id:9,kind:'WORKER_LISTING',reference:'ABCDE1',saved_at:'2026-11-05T00:00:00Z'}]);
 const restored=await h.api.listSavedContacts(7);
 assert.equal(restored.length,1);
 assert.equal(restored[0].synced,true);
});
