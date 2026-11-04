const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const source = readFileSync(resolve(__dirname, '../features/parity/ethicalMarketplace.tsx'), 'utf8');
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
