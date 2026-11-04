import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('./marketplaceBrowseModel.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
const exported={};vm.runInNewContext(compiled,{exports:exported,String});
const { browseQuery,normalizeBrowseMode,enquiryValidation,categorySlug }=exported;

test('marketplace sends distinct API filters rather than using category text as search',()=>{
  const filters=browseQuery({search:'  uniforms  ',category:'workwear',mode:'SELL'});
  assert.equal(filters.search,'uniforms');
  assert.equal(filters.category,'workwear');
  assert.equal(filters.mode,'SELL');
  assert.equal(Object.keys(browseQuery({search:' ',category:'',mode:''})).length,0);
  assert.equal(normalizeBrowseMode('OTHER'),'');
  assert.equal(normalizeBrowseMode('SWAP'),'SWAP');
});
test('buyer enquiry must be purposeful and stay within API text limit',()=>{
  assert.match(enquiryValidation(''),/five characters/);
  assert.match(enquiryValidation(' hey '),/five characters/);
  assert.equal(enquiryValidation('Could you share the pickup times?'),null);
  assert.match(enquiryValidation('x'.repeat(4001)),/4,000/);
});
test('category filters use backend slugs, not display names',()=>{
  assert.equal(categorySlug({slug:'books-study',name:'Books & study'}),'books-study');
  assert.equal(categorySlug(null),'');
});