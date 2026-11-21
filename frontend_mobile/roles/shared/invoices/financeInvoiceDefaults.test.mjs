import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('./financeInvoiceDefaults.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {} };
runInNewContext(compiled, context);
const merge = context.exports.mergeFinanceInvoiceDefaults;
const defaults = {issuer_name:'Provider',issuer_abn:'123',issuer_address:'Street',gst_registered:true,bank_account_name:'Bank',bsb:'123456',account_number:'100',super_fund_name:'Fund',super_usi:'USI',super_member_number:'22',super_rate:'12.0'};
const draft = {issuer_name:'',issuer_abn:'',issuer_address:'',gst_registered:false,bank_account_name:'',bsb:'',account_number:'',super_fund_name:'',super_usi:'',super_member_number:'',super_rate:'',source_assignment_ids:[]};
test('new pristine invoice inherits legitimate account settings',()=>{
 const x = merge(draft,defaults,new Set(),false);
 assert.equal(x.gst_registered,true);assert.equal(x.super_rate,'12.0');assert.equal(x.issuer_name,'Provider');
});
test('a user explicitly choosing no GST or typing rates is never overwritten',()=>{
 const x=merge({...draft,super_rate:'7.25'},defaults,new Set(['gst_registered','super_rate']),false);
 assert.equal(x.gst_registered,false);assert.equal(x.super_rate,'7.25');
});
test('clearing a field is an explicit edit even while defaults load',()=>{
 const x=merge({...draft,issuer_name:''},defaults,new Set(['issuer_name']),false);
 assert.equal(x.issuer_name,'');assert.equal(x.issuer_abn,'123');
});
test('duplicate invoice or accepted assignment prefill must retain its tax snapshot',()=>{
 assert.equal(merge({...draft,issuer_name:'Old',gst_registered:false},defaults,new Set(),true).gst_registered,false);
 assert.equal(merge({...draft,source_assignment_ids:[81]},defaults,new Set(),false).issuer_name,'');
});
test('screen calls the pure default merger and tracks edits',()=>{
 const editor=readFileSync(new URL('./FinanceInvoiceEditor.tsx',import.meta.url),'utf8');
 assert.match(editor,/editedDefaults\.current\.add\(key\)/);
 assert.match(editor,/mergeFinanceInvoiceDefaults\(current, defaults, editedDefaults\.current, Boolean\(previous\)\)/);
 assert.match(editor,/if \(active\) setError/);
});
