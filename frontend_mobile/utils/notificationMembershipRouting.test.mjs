import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('./notificationNavigation.ts',import.meta.url),'utf8');
const start=source.indexOf('const ADMIN_GUARDS =');
const end=source.indexOf('export const resolveMembershipNotificationRoute',start);
const end2=source.indexOf('\n};',end)+3;
const js=ts.transpileModule(source.slice(start,end2),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},URL,URLSearchParams,parseShiftLink:()=>null,shiftPersonaFromRole:()=>null,shiftRoute:()=>null,isWorkerPersona:()=>false};
runInNewContext(js,context);
const route=context.exports.resolveMembershipNotificationRoute;
test('delegated Admin with manage-staff permission opens scoped pharmacy',()=>{
 assert.equal(route({persona:'admin',adminCan:cap=>cap==='MANAGE_STAFF',userRole:'PHARMACIST',payload:{pharmacy_id:42}}),'/admin/pharmacies/42');
});
test('without delegated staff permission use base worker membership instead',()=>{
 assert.equal(route({persona:'admin',adminCan:()=>false,userRole:'PHARMACIST',payload:{pharmacy_id:42}}),'/pharmacist/memberships');
});
test('owner and organization retain native membership destinations',()=>{
 assert.equal(route({userRole:'OWNER',payload:{pharmacy_id:7}}),'/owner/pharmacies/7');
 assert.equal(route({userRole:'ORG_ADMIN',payload:{pharmacy_id:7}}),'/organization/pharmacies/7');
});
