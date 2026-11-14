const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const source = readFileSync(resolve(__dirname, '../features/parity/ethicalMarketplace.tsx'), 'utf8');
test('import upload rechecks the session before opening review or updating state', () => {
 const part=source.slice(source.indexOf('function ImportStock('),source.indexOf('function ',source.indexOf('function ImportStock(')+10));
 assert.match(part,/await api\.uploadImport\(form\);if\(generation!==getSessionGeneration\(\)\)return;router\.push/);
 assert.match(part,/catch\(e\)\{if\(generation===getSessionGeneration\(\)\)setError/);
 assert.match(part,/if\(generation===getSessionGeneration\(\)\)setBusy\(false\)/);
});
test('transfer upload suppresses stale session state updates', () => {
 const part=source.slice(source.indexOf('function TransferDocuments('),source.indexOf('function ',source.indexOf('function TransferDocuments(')+10));
 assert.match(part,/catch\(e\)\{if\(generation===getSessionGeneration\(\)\)setLocalError/);
 assert.match(part,/if\(generation===getSessionGeneration\(\)\)setBusy\(false\)/);
});
test('ethical workspace invalidates and clears private data when pharmacy scope changes', () => {
 assert.match(source,/requestRef\.current\+=1/);
 assert.match(source,/setLots\(\[\]\);setListings\(\[\]\);setTransfers\(\[\]\);setTransfer\(null\)/);
 assert.match(source,/request!==requestRef\.current/);
 assert.match(source,/request===requestRef\.current/);
});
test('ethical inventory and transfers require a pharmacy context admitted by backend access', () => {
 assert.match(source,/screen!=='pharmacy'&&!admitted\.admitted/);
 assert.match(source,/if\(!admitted\|\|/);
 assert.match(source,/loading&&\(!access\|\|!context\)/);
 assert.match(source,/!loading&&!error&&\(!access\|\|!context\)/);
});


test('ethical inventory subtree is keyed to current account and pharmacy before any effect executes', () => {
 assert.match(source,/function EthicalMarketplaceScreen\(\{screen\}/);
 assert.match(source,/EthicalMarketplaceContent key=\{/);
 assert.match(source,/selectedPharmacyId\?\?'none'/);
 assert.match(source,/user\?\.id\?\?'signed-out'/);
});
