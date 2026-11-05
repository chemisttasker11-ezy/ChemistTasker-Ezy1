import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./NotificationsScreen.tsx', import.meta.url), 'utf8');
test('notification rows and read receipts are account-scoped',()=>{
 assert.match(source,/locallyReadIds\.current\.clear\(\)/);
 assert.match(source,/setNotifications\(\[\]\)/);
 assert.match(source,/\}, \[user\?\.id\]\)/);
 assert.match(source,/if \(user\?\.id != null\) void fetchNotifications\(true, 1\)/);
});
test('new page-one request releases the superseded load-more spinner',()=>{
 assert.match(source,/setNextPage\(null\);\s*moreLoadingRef\.current = false;\s*setLoadingMore\(false\)/);
});
