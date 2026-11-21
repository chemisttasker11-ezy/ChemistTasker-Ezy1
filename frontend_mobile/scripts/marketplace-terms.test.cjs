const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = p => readFileSync(resolve(__dirname,'..',p),'utf8');
test('marketplace consent requires explicit current-version confirmation and rechecks access',()=>{
 const source=read('features/parity/MarketplaceAccessResolution.tsx');
 assert.match(source,/MARKETPLACE_TERMS_REQUIRED/);
 assert.match(source,/marketplace\.getTerms\(\)/);
 assert.match(source,/!terms\?\.version \|\| !termsHref \|\| !agreed/);
 assert.match(source,/marketplace\.acceptTerms\(terms\.version\)/);
 assert.match(source,/await onUpdated\(\)/);
 assert.match(source,/marketplaceTermsHref\(terms\?\.terms_url\)/);
 assert.match(source,/\[needsTerms, user\?\.id, termsRetry\]/);
 assert.match(source,/MOBILE_UNVERIFIED/);
 assert.match(source,/IDENTITY_UNVERIFIED/);
 assert.match(read('features/parity/marketplace.tsx'),/MarketplaceAccessResolution access=\{access\}/);
});

test('marketplace terms link follows server legal URL and rejects foreign origins', () => {
 const exported = {};
 const helper = read('features/parity/marketplaceTermsUrl.ts');
 vm.runInNewContext(ts.transpileModule(helper, {
   compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
 }).outputText, { exports: exported, URL });
 const href = exported.marketplaceTermsHref;
 assert.equal(href('/terms-of-service'), 'https://www.chemisttasker.com.au/terms-of-service');
 assert.equal(href('/marketplace-terms?v=2'), 'https://www.chemisttasker.com.au/marketplace-terms?v=2');
 assert.equal(href('https://chemisttasker.com.au/terms-of-service'), 'https://chemisttasker.com.au/terms-of-service');
 assert.equal(href('https://malicious.example/terms-of-service'), null);
 assert.equal(href('//malicious.example/terms-of-service'), null);
 assert.equal(href('http://www.chemisttasker.com.au/terms-of-service'), null);
 assert.equal(href('javascript:alert(1)'), null);
 assert.equal(href(''), null);
});
