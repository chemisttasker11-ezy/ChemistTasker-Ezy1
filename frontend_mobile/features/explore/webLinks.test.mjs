import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const src = readFileSync(new URL('./webLinks.ts', import.meta.url), 'utf8');
const exports = {};
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(js, { exports, URL, process: { env: {} }, require: () => ({}) });

test('public link rules reject scripts, files and credential-bearing links', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', '//evil.example/x', 'https://x:y@example.com']) {
    assert.equal(exports.safePublicUrl(value), null);
  }
  assert.equal(exports.safePublicUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(exports.safePublicUrl('mailto:info@example.com'), 'mailto:info@example.com');
  assert.equal(exports.safePublicUrl('mailto:info@example.com', true), null);
});

test('site origin is configured, HTTPS-only and every outbound path is relative', () => {
  assert.equal(exports.publicWebOrigin('https://staging.chemisttasker.com.au/learn'), 'https://staging.chemisttasker.com.au');
  assert.equal(exports.publicWebOrigin('http://wrong.example/'), 'https://chemisttasker.com.au');
  assert.equal(exports.publicWebUrl('/privacy-policy'), 'https://chemisttasker.com.au/privacy-policy');
  for (const path of ['//evil.example', '/../../admin', 'https://evil.example', '/blog/a?redirect=x']) {
    assert.throws(() => exports.publicWebUrl(path));
  }
});
