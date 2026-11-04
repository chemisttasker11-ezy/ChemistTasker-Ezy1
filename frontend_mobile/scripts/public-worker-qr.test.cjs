const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
test('worker QR only uses entries verified on public talent board, not private onboarding',()=>{
 const source=read('app/share/worker.tsx');
 assert.match(source,/getPublicTalentFeed/);
 assert.match(source,/Number\(row\.author_user_id\) === userId/);
 assert.match(source,/reference_code/);
 assert.match(source,/publicWebOrigin\(\)/);
 assert.doesNotMatch(source,/getOnboarding|getPayment|government_id|ahpra_number/);
});
test('worker profile roles can choose to share published public QR cards',()=>{
 for(const role of ['pharmacist','otherstaff','explorer'])assert.match(read('roles/'+role+'/profile.tsx'),/Show my public worker QR/);
});
