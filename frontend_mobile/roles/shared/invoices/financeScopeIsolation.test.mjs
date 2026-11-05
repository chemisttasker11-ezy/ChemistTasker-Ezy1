import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code=readFileSync(new URL('./FinanceWorkspace.tsx',import.meta.url),'utf8');
test('finance account/mode switching invalidates old requests',()=>{
 assert.match(code,/const ownerScope = `\$\{user\?\.id \?\? 'signed-out'\}:/);
 assert.match(code,/const current = \(\) => request === loadGen\.current && scopeRef\.current === scope/);
 assert.match(code,/if \(current\(\)\) setReceivedInvoices\(nextReceived\)/);
 assert.match(code,/if \(!current\(\)\) return;\s*setCustomers\(c\)/);
});
test('switch clears financial data and active review/modal before new authorization loads',()=>{
 assert.match(code,/setInvoices\(\[\]\); setReceivedInvoices\(\[\]\); setCustomers\(\[\]\)/);
 assert.match(code,/setSelected\(null\); setHistoryDocument\(null\); setForm\(null\); setEditor\(null\)/);
 assert.match(code,/return \(\) => \{ loadGen\.current \+= 1; \}/);
});
test('failed scope-aware load never masquerades as an empty finance page',()=>{
 assert.match(code,/if \(current\(\)\) setError\(failure\?\.message/);
 assert.match(code,/Could not refresh this workspace/);
});
