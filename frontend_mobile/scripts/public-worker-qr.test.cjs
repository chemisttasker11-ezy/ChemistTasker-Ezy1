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

test('scan-to-invite handoff requires a public listing, pharmacy selection and explicit approval',()=>{
 const scanner=read('app/share/scan.tsx');
 const handoff=read('features/share/InviteFromWorkerQr.tsx');
 assert.match(scanner,/code.kind === 'worker-public-listing'/);
 assert.match(scanner,/InviteFromWorkerQr/);
 assert.match(handoff,/getPublicTalentFeed\(\{ reference_code: referenceCode, page_size: 2 \}\)/);
 assert.match(handoff,/createMembershipInviteLinkService/);
 assert.match(handoff,/if \(!verified \|\| !pharmacyId/);
 assert.match(handoff,/Alert\.alert\('Generate pharmacy invitation\?'/);
 assert.match(handoff,/worker must submit the form/i);
 assert.doesNotMatch(handoff,/approveMembership\(|createMembership\(|addFavorite\(/);
 assert.doesNotMatch(handoff,/role\.startsWith\('ORG_'\)/);
});
