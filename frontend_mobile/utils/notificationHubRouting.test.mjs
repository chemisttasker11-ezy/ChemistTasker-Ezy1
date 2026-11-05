import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Extract pure hub routing policy with its existing parser and role helpers.
// Dependencies are local pure functions; strip external imports before running.
const source = readFileSync(new URL('./notificationNavigation.ts', import.meta.url), 'utf8');
const start=source.indexOf('const ADMIN_GUARDS =');
const end=source.indexOf('export const resolveMembershipNotificationRoute',start);
assert.ok(start>0 && end>start);
let code=source.slice(start,end);
// Only the hub routing section is relevant to this test; runtime stubs for
// shift-only exports allow loading the pure route module unchanged.
const js=ts.transpileModule(code, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},URL,URLSearchParams,parseShiftLink:()=>null,shiftPersonaFromRole:(r)=>({OWNER:'owner',PHARMACIST:'pharmacist',OTHER_STAFF:'otherstaff',ORG_ADMIN:'organization'}[r]||null),shiftRoute:()=>null,isWorkerPersona:()=>false};
runInNewContext(js,context);
const route=context.exports.resolveHubNotificationRoute;
test('organization notifications open organization Hub',()=>{
 assert.equal(route({payload:{scope:'organization',post_id:7},userRole:'ORG_ADMIN'}),'/organization/hub?scope=organization&post=7');
});
test('delegated admin stays in /admin only with communications rights',()=>{
 const data={payload:{scope:'pharmacy',pharmacy_id:8},userRole:'PHARMACIST',persona:'admin'};
 assert.equal(route({...data,adminCan:(cap)=>cap==='MANAGE_COMMUNICATIONS'}),'/admin/hub?scope=pharmacy&pharmacy_id=8');
 assert.equal(route({...data,adminCan:()=>false}),'/pharmacist/hub?scope=pharmacy&pharmacy_id=8');
});
test('non-hub notifications never invent a Hub destination',()=>{
 assert.equal(route({payload:{foo:1},userRole:'OWNER'}),null);
});
