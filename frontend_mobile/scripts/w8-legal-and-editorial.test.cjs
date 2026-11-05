const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const read=path=>readFileSync(resolve(__dirname,'..',path),'utf8');

test('every legal entry uses configured in-app website browser rather than stale hardcoded links',()=>{
 for(const path of ['app/welcome.tsx','app/register.tsx','roles/owner/profile.tsx','roles/organization/profile.tsx','roles/pharmacist/profile.tsx','roles/otherstaff/profile.tsx','roles/explorer/profile.tsx']){
   const src=read(path);
   assert.match(src,/openWebPage/);
   assert.match(src,/\/terms-of-service/);
   assert.match(src,/\/privacy-policy/);
   assert.doesNotMatch(src,/Linking\.openURL\(\x60\$\{webBaseUrl\}\/(terms-of-service|privacy-policy)/);
 }
});

test('publishing is advertised only after server-provided editorial responsibility',()=>{
 const src=read('components/shell/MoreScreen.tsx');
 assert.match(src,/contentManagement\.getMe\(\)/);
 assert.match(src,/Object\.keys\(response\.areas \|\| \{\}\)\.length/);
 assert.match(src,/canPublish \? <SectionCard title="Publishing"/);
 assert.match(src,/openWebPage\('\/content'\)/);
});
