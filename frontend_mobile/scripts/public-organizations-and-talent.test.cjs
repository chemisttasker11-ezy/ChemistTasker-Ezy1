const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = path => readFileSync(resolve(__dirname, '..', path), 'utf8');
test('public organization reads the established source without exposing account-only fields', () => {
  const src = read('app/explore/organization/[slug].tsx');
  assert.match(src, /getPublicOrganization\(slug\)/);
  assert.match(src, /safePublicUrl\(organization\?\.cover_image_url/);
  assert.match(src, /params: \{ organization: String\(organization\.id\) \}/);
  assert.doesNotMatch(src, /email|bank_details|phone_number/);
});
const {talentHarness,datum,collect} = require('./m4-discovery-behaviour.cjs');

test('C native public talent browsing consumes all public pages, preserves QR scope and gates contact',async()=>{
  const app=talentHarness('REF-22');
  app.queue.push({count:2,next:'/api/v1/explorer-posts/public-feed/?page=2',results:[datum(11)]});
  app.queue.push({count:2,next:null,results:[datum(22,{role_title:'Pharmacist',phone_number:'Personal phone 0412345678',date_of_birth:'Private date of birth 1990-01-01'})]});
  const tree=await app.render();
  assert.deepEqual(app.calls.map(x=>x.page),[1,2],
    'the public list fetches every page using the real shared-core loader');
  assert.deepEqual(collect(tree,'Card').map(x=>x.key??'Card').length,1);
  const titles=collect(tree,'Text').map(x=>String(x.children)).join(' ');
  assert.match(titles,/Pharmacist/);
  assert.doesNotMatch(titles,/Personal phone|Private date of birth/);
  const signIn=collect(tree,'Button').find(x=>x.children==='Sign in to contact talent');
  assert.ok(signIn,'anonymous users are offered only a login handoff');
  signIn.onPress();
  assert.equal(app.routes.length,1);
  assert.equal(app.routes[0].pathname,'/login');
  assert.equal(app.routes[0].params.returnTo,'/explore/talent-board?reference_code=REF-22');
  assert.equal(app.calls.some(call=>call.method && call.method!=='GET'),false);
  app.ui.unmount();
});
