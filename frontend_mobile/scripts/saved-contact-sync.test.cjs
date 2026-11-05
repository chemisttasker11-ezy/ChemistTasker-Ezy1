const test=require('node:test'),assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {resolve}=require('node:path');const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
test('public contacts use server user-scoped CRUD while bearer invites stay in SecureStore',()=>{
 const s=read('features/share/savedContacts.ts');
 assert.match(s,/listSavedProfessionalContacts/);
 assert.match(s,/saveProfessionalContact\(identity\)/);
 assert.match(s,/deleteSavedProfessionalContact\(match\.id\)/);
 assert.match(s,/if\(contact\.kind==='pharmacy-invitation'\)/);
 assert.match(s,/SecureStore\.setItemAsync\(secureKey\(accountId\)/);
 assert.doesNotMatch(s,/saveProfessionalContact\(\{[^}]*token/);
});
test('scanner does not claim successful cross-device sync when backend call fails',()=>{
 const s=read('app/share/scan.tsx');
 assert.match(s,/selected\?\.synced/);
 assert.match(s,/sync is unavailable or pending/);
});
