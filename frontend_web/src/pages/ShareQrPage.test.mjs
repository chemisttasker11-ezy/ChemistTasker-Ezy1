import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const src=readFileSync(new URL('./ShareQrPage.tsx',import.meta.url),'utf8');
const lookup=src.slice(src.indexOf('function resolveTarget'),src.indexOf('export default'));
const js=ts.transpileModule(lookup.replace('function resolveTarget','export function resolveTarget'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const box={exports:{},URLSearchParams,encodeURIComponent};
vm.runInNewContext(js,box);
const f=box.exports.resolveTarget;
test('QR builder only encodes approved public or membership URLs',()=>{
 for(const q of ['?kind=worker&reference_code=REF-1234','?kind=pharmacy-invite&token=longinvitetoken123','?kind=organization&slug=chemist-group']) assert.ok(f(q,'https://chemisttasker.com.au'));
 for(const q of ['?kind=worker&reference_code=a','?kind=worker&reference_code=REF1234&url=https://evil.com','?kind=pharmacy-invite&token=a','?kind=payroll&token=abcdefghi']) assert.equal(f(q,'https://chemisttasker.com.au'),null);
});
