const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
const {talentHarness,articleHarness,datum,collect,deferred} =
  require('./m4-discovery-behaviour.cjs');
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

test('C W8 native public talent effect unmount invalidates a late fetch without private side effects',async()=>{
  const h=talentHarness(), pending=deferred();
  h.queue.push(pending);
  let tree=await h.render(); // real screen mounts and subscribes effects
  assert.equal(h.calls.length,1);
  assert.equal(collect(tree,'Card').length,0);
  h.ui.unmount();
  pending.resolve({count:1,results:[datum(3)],next:null});
  await settle();
  tree=await h.render();
  assert.equal(collect(tree,'Card').length,0,'unmounted response cannot repopulate the screen');
  assert.equal(h.routes.length,0);
});

test('C W8 native blog feed unmount ignores a late article reply',async()=>{
  const h=articleHarness('news'),pending=deferred();
  h.queue.push(pending);
  let tree=await h.render();
  assert.equal(h.calls.length,1);
  h.ui.unmount();
  pending.resolve({results:[{id:17,kind:'news',title:'Late news',
    slug:'late-news',read_minutes:3,cover_url:null}],next:null});
  await settle();
  tree=await h.render();
  assert.equal(collect(tree,'Card').length,0,'unmounted article response is discarded');
  assert.equal(h.routes.length,0);
});
test('publisher link cannot leak across account transitions',()=>{
 const src=read('components/shell/MoreScreen.tsx');
 assert.match(src,/publisherAccess\?\.id === publisherId/);
 assert.match(src,/if \(active\) setPublisherAccess\(\{ id: publisherId/);
});
