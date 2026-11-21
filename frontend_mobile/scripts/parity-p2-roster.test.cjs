const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('pending roster predicate handles acknowledgement states', () => {
 const ts = require('typescript');
 const vm = require('node:vm');
 const source = fs.readFileSync(path.join(__dirname, '../features/parity/PublishedRosterNotice.tsx'), 'utf8');
 const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod = {exports:{}};
 vm.runInNewContext(code, {module:mod, exports:mod.exports, require:()=>({})});
 const pending = mod.exports.hasPendingPublishedRoster;
 assert.equal(pending(null), false);
 assert.equal(pending({shifts:[{period_id:null,can_acknowledge:true}]}), false);
 assert.equal(pending({shifts:[{period_id:1,can_acknowledge:false}]}), false);
 assert.equal(pending({shifts:[{period_id:1,can_acknowledge:true,is_acknowledged:true}]}), false);
 assert.equal(pending({shifts:[{period_id:null}, {period_id:1,can_acknowledge:true,is_acknowledged:false}]}), true);
});
test('my roster offers pending published roster acknowledgement', () => {
 const s = fs.readFileSync(path.join(__dirname, '../app/my-roster.tsx'), 'utf8');
 assert.ok(s.includes('PublishedRosterNotice'));
 const notice = fs.readFileSync(path.join(__dirname, '../features/parity/PublishedRosterNotice.tsx'), 'utf8');
 assert.ok(notice.includes('rosterV2.getWorkerRoster'));
 assert.ok(notice.includes('can_acknowledge'));
 assert.ok(notice.includes('/attendance/published-roster'));
});
