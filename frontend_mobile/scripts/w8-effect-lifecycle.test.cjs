const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
test('W8 native public loaders defer initial dispatch until effect subscription and ignore stale generations',()=>{
 for(const file of ["features/explore/ArticleFeed.tsx","features/explore/ArticleDetail.tsx","app/explore/hubs/index.tsx","app/explore/hubs/[hub].tsx","app/explore/hubs/post/[id].tsx","app/explore/organization/[slug].tsx","app/explore/talent-board.tsx"]){
   const src=read(file);
   assert.match(src,/Promise\.resolve\(\)\.then\(\(\) => \{ if \(active\) void load\(\); \}\)/);
   assert.match(src,/active = false/);
 }
});
test('publisher link cannot leak across account transitions',()=>{
 const src=read('components/shell/MoreScreen.tsx');
 assert.match(src,/publisherAccess\?\.id === publisherId/);
 assert.match(src,/if \(active\) setPublisherAccess\(\{ id: publisherId/);
});
