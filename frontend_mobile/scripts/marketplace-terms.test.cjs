const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = p => readFileSync(resolve(__dirname,'..',p),'utf8');
test('marketplace consent requires explicit current-version confirmation and rechecks access',()=>{
 const source=read('features/parity/MarketplaceAccessResolution.tsx');
 assert.match(source,/MARKETPLACE_TERMS_REQUIRED/);
 assert.match(source,/marketplace\.getTerms\(\)/);
 assert.match(source,/!terms \|\| !agreed/);
 assert.match(source,/marketplace\.acceptTerms\(terms\.version\)/);
 assert.match(source,/await onUpdated\(\)/);
 assert.match(source,/\/terms-of-service/);
 assert.match(source,/MOBILE_UNVERIFIED/);
 assert.match(source,/IDENTITY_UNVERIFIED/);
 assert.match(read('features/parity/marketplace.tsx'),/MarketplaceAccessResolution access=\{access\}/);
});
