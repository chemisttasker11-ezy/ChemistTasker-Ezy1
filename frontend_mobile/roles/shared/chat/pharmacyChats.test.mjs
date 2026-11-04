import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=readFileSync(new URL('./pharmacyChats.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
const exports={};vm.runInNewContext(compiled,{exports,Map,Number,Array,String});
test('team chat uses only active unique pharmacy memberships',()=>{
 const out=exports.pharmacyChatsFromMemberships([
  {pharmacyId:3,pharmacyName:'Zed',isActive:true,status:'ACCEPTED'},
  {pharmacyId:3,pharmacyName:'Zed',isActive:true,status:'ACCEPTED'},
  {pharmacyId:1,pharmacyName:'Alpha',isActive:true,status:'ACTIVE'},
  {pharmacyId:8,pharmacyName:'Inactive',isActive:false,status:'ACTIVE'},
  {pharmacyId:9,pharmacyName:'Pending',isActive:true,status:'PENDING'},
  {pharmacyId:10,pharmacyName:''},{pharmacyId:'bad',pharmacyName:'Invalid'}
 ]);
 assert.deepEqual(Array.from(out,x=>x.id),[1,3]);
});
