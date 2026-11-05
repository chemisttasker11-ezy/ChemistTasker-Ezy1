import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code=readFileSync(new URL('./marketplace.tsx',import.meta.url),'utf8');
const step=code.slice(code.indexOf('function ReviewStep('),code.indexOf('function MyListingDetail('));
test('marketplace draft and submit buttons share one synchronous submit mutex',()=>{
 assert.match(step,/const submittingRef=useRef\(false\)/);
 assert.match(step,/if\(submittingRef\.current\)return;submittingRef\.current=true/);
 assert.match(step,/finally\{submittingRef\.current=false/);
});
test('completion cannot clear a new signed-in account\'s draft',()=>{
 assert.match(step,/const targetScope=scope/);
 assert.match(step,/if\(scopeRef\.current===targetScope\)\{await clearMarketplaceDraft\(targetScope\)/);
 assert.match(step,/if\(scopeRef\.current===targetScope\)setLocalError/);
});
test('server owns the same idempotent draft / review pipeline',()=>{
 assert.match(step,/client_request_id:draft\.create_request_id/);
 assert.match(step,/api\.actOnListing\(listingId,'submit',Number\(expectedVersion\)\)/);
 assert.match(step,/api\.updateListing\(listingId,\{\.\.\.body,expected_version:expectedVersion\}\)/);
});
