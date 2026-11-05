import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./chatAttachmentUrl.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, URL });
const safe = exports.safeChatAttachmentUrl;
const api = 'https://api.chemisttasker.example/api/v1';

test('chat media permits only first-party media and the known signed Azure host', () => {
  assert.equal(safe('/media/chat/1/photo.png', api), 'https://api.chemisttasker.example/media/chat/1/photo.png');
  assert.equal(safe('media/chat/1/file.pdf', api), 'https://api.chemisttasker.example/media/chat/1/file.pdf');
  assert.equal(safe('https://mystorage.blob.core.windows.net/chat/a.pdf?sig=signed', api),
    'https://mystorage.blob.core.windows.net/chat/a.pdf?sig=signed');
  assert.equal(safe('https://assets.example.org/chat/file.pdf', api, 'https://assets.example.org'), 'https://assets.example.org/chat/file.pdf');
});
test('chat media rejects script schemes, hostile hosts, credentials and non-media API routes', () => {
  for (const candidate of [
    '//evil.example/steal', 'javascript:alert(1)', 'data:text/html,payload',
    'https://x:y@api.chemisttasker.example/media/private.pdf',
    'https://evil.example/file.pdf', 'https://api.chemisttasker.example/admin/',
    '/api/v1/users/', 'https://evilmystorage.blob.core.windows.net.evil.example/file.pdf',
    'http://assets.example.org/file.pdf', '/media\\evil.pdf',
  ]) assert.equal(safe(candidate, api, 'https://assets.example.org'), null, candidate);
});
