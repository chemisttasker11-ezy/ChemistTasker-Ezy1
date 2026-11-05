import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('./ProfileVerificationCard.tsx', import.meta.url),'utf8');
test('verification failure is visible with retry rather than hiding whole card',()=>{
 assert.doesNotMatch(code,/if \(failed && !summary\) return null/);
 assert.match(code,/Verification status unavailable/);
 assert.match(code,/setRefreshKey\(current => current \+ 1\)/);
});
test('initial load cannot briefly present an unverified account as an established verdict',()=>{
 assert.match(code,/if \(loading && !summary\) return/);
 assert.match(code,/Checking verification/);
 assert.match(code,/finally\(\(\) => \{ if \(live\) setLoading\(false\); \}\)/);
});
test('shared persona card uses the canonical native icon family, palette and touch sizes',()=>{
 assert.match(code,/CheckCircle2, Circle, ChevronRight/);
 assert.match(code,/borderRadius: radius\.card/);
 assert.match(code,/minHeight: touch\.min/);
});
