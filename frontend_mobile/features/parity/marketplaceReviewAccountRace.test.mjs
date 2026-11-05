import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('./marketplace.tsx',import.meta.url),'utf8');
const source=text.slice(text.indexOf('function ReviewStep('),text.indexOf('function MyListingDetail('));
test('previous account submission callbacks cannot unlock a newer attempt',()=>{
 assert.match(source,/const attempt=\+\+submissionGeneration\.current/);
 assert.match(source,/const current=\(\)=>scopeRef\.current===targetScope&&submissionGeneration\.current===attempt/);
 assert.match(source,/finally\{if\(current\(\)\)\{submittingRef\.current=false;setBusy\(false\);\}\}/);
});
test('account switch stops subsequent listing writes and old draft removal',()=>{
 assert.match(source,/useEffect\(\(\)=>\{submissionGeneration\.current\+=1;submittingRef\.current=false;setBusy\(false\)/);
 assert.match(source,/if\(!current\(\)\)return;\s*if\(submitForReview\)/);
 assert.match(source,/if\(current\(\)\)\{await clearMarketplaceDraft\(targetScope\);if\(current\(\)\)router\.replace/);
});
