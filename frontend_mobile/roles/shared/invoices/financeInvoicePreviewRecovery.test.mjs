import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./FinanceInvoiceEditor.tsx', import.meta.url), 'utf8');
test('invoice preview failure is explicit with retry instead of silently blank totals',()=>{
 assert.match(source,/setPreviewError\(failure\?\.message/);
 assert.match(source,/Invoice preview could not be calculated/);
 assert.match(source,/Retry calculation/);
 assert.match(source,/previewError \? 'Unavailable'/);
});
test('latest edit wins over any prior preview promise and loading state is cleared',()=>{
 assert.match(source,/let active = true;\s*setPreview\(null\)/);
 assert.match(source,/if \(!active\) return;\s*setPreview\(result\)/);
 assert.match(source,/if \(active\) setPreviewBusy\(false\)/);
 assert.match(source,/return \(\) => \{ active = false; clearTimeout\(timer\); \}/);
});
