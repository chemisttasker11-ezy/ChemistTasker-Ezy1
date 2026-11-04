import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('./contactModel.ts', import.meta.url),'utf8');
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
const exports={};vm.runInNewContext(compiled,{exports, String});
const {validateContactForm,contactTopics}=exports;
test('support form validates required fields and email before network write',()=>{
 const form={name:'A',email:'member@example.com',phone:'',subject:'Shift or booking',message:'Can you help with this booking?'};
 assert.equal(Object.keys(validateContactForm(form)).length,0);
 assert.equal(validateContactForm({...form,email:'bad'}).email,'Enter a valid email address.');
 assert.equal(validateContactForm({...form,message:'hi'}).message,'Describe the issue in at least ten characters.');
 assert.equal(validateContactForm({...form,subject:'  '}).subject,'Choose a topic or enter a subject.');
});
test('contact topics expose relevant role workflows without exposing another role',()=>{
 assert.equal(contactTopics('OWNER').includes('Billing and subscriptions'),true);
 assert.equal(contactTopics('PHARMACIST').includes('Timesheets or payroll'),true);
 assert.equal(contactTopics('EXPLORER').includes('Talent Board'),true);
 assert.equal(contactTopics('EXPLORER').includes('Organization access'),false);
});
