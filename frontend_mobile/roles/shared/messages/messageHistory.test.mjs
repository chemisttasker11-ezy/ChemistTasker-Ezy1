import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const src=readFileSync(new URL('./messageHistory.ts', import.meta.url),'utf8');
const result=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}});
const out={};vm.runInNewContext(result.outputText,{exports:out,Map,Date,String,Number,URL,decodeURIComponent});
const {mergeOlderMessages,shouldAutoFollowMessage,isNextPageForRoom}=out;
test('pagination preserves live edits and avoids duplicate overlapping pages',()=>{
 const older=[{id:1,created_at:'2026-11-01T00:00:00Z',body:'early'},{id:2,created_at:'2026-11-02T00:00:00Z',body:'stale'}];
 const current=[{id:2,created_at:'2026-11-02T00:00:00Z',body:'edited'},{id:3,created_at:'2026-11-03T00:00:00Z',body:'live'}];
 const merged=mergeOlderMessages(current,older);
 assert.deepEqual(Array.from(merged,x=>x.id),[1,2,3]);
 assert.equal(merged[1].body,'edited');
});
test('reader only follows new messages when near bottom or sent by self',()=>{
 assert.equal(shouldAutoFollowMessage(false,false),false);
 assert.equal(shouldAutoFollowMessage(true,false),true);
 assert.equal(shouldAutoFollowMessage(false,true),true);
});
test('pagination URLs must correspond to current conversation',()=>{
 assert.equal(isNextPageForRoom('/api/v1/rooms/5/messages/?page=2',5),true);
 assert.equal(isNextPageForRoom('https://example.com/api/v1/rooms/5/messages/?page=2',5),true);
 assert.equal(isNextPageForRoom('/api/v1/rooms/6/messages/?page=2',5),false);
 assert.equal(isNextPageForRoom('/api/v1/rooms/5/messages-anything/?page=2',5),false);
 assert.equal(isNextPageForRoom(null,5),false);
});
