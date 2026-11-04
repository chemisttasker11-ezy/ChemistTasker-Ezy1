import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('./appLock.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const scope={exports:{},require:()=>({default:{}})};
runInNewContext(js,scope);
const {validDelay,needsUnlock}=scope.exports;
test('only approved grace periods are accepted',()=>{
 assert.equal(validDelay(0),true);assert.equal(validDelay(30),true);assert.equal(validDelay(60),true);assert.equal(validDelay(300),true);
 assert.equal(validDelay(-1),false);assert.equal(validDelay('60'),false);assert.equal(validDelay(99999),false);
});
test('expired inactivity and fresh launch require device authentication',()=>{
 assert.equal(needsUnlock(null,60000,60),true);
 assert.equal(needsUnlock(1000,60999,60),false);
 assert.equal(needsUnlock(1000,61000,60),true);
 assert.equal(needsUnlock(1000,1001,0),true);
});
test('lock gate never implements separate PIN credential or skips server session',()=>{
 const src=readFileSync(new URL('../components/security/AppLockGate.tsx',import.meta.url),'utf8');
 assert.match(src,/authenticateWithDeviceLock/);
 assert.match(src,/await logout\(\)/);
 assert.match(src,/needsUnlock/);
 assert.doesNotMatch(src,/setItemAsync\([^)]*pin|password === pin/);
});
