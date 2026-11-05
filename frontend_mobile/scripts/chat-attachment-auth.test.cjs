const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = (p) => readFileSync(resolve(__dirname, '..', p), 'utf8');

test('chat attachment view uses authenticated binary transport and never opens storage URL', () => {
 const native = read('roles/shared/messages/[id].tsx');
 assert.match(native, /downloadChatAttachment\(Number\(item\.id\)\)/);
 assert.match(native, /item\.attachment_url === \`\/api\/v1\/messages\/\$\{item\.id\}\/attachment\/\`/);
 assert.match(native, /Sharing\.shareAsync\(file\.uri/);
 assert.match(native, /file\.delete\(\)/);
 assert.doesNotMatch(native, /Linking\.openURL\(attachmentUrl\)/);
 assert.doesNotMatch(native, /source=\{\{ uri: attachmentUrl \}\}/);
});

test('shared endpoint and backend require positive message id and current membership', () => {
 const native = read('roles/shared/messages/[id].tsx');
 assert.match(native, /accountRef\.current === accountId/);
 assert.match(native, /parseRoomId\(\) === roomId/);
 assert.match(native, /Number\.isSafeInteger\(item\.id\)/);
 const source = read('../shared-core/src/domains/chat/api.ts');
 assert.match(source, /performApiRequest\(\`\/messages\/\$\{messageId\}\/attachment\/\`/);
 assert.match(source, /Invalid message ID/);
});
