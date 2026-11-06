const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');

test('public content account switches invalidate server-permission snapshots on every active screen',()=>{
 const detail=read('features/explore/ArticleDetail.tsx');
 assert.match(detail,/const accountKey = String\(user\?\.id \?\? 'anonymous'\)/);
 assert.match(detail,/key=\{`\$\{accountKey\}:\$\{slug\}`\}/);
 assert.match(detail,/latestScopeRef\.current\.generation = generation\.current/);
 for(const path of ['app/explore/hubs/index.tsx','app/explore/hubs/[hub].tsx','app/explore/hubs/post/[id].tsx']){
  const src=read(path);
  assert.match(src,/const accountKey = String\(user\?\.id \?\? 'anonymous'\)/);
  if(path.endsWith('post/[id].tsx')) assert.match(src,/key=\{`\$\{accountKey\}:\$\{id\}`\}/);
  else assert.match(src,/\[.*accountKey\]/);
  assert.match(src,/current \+= 1/);
 }
});
