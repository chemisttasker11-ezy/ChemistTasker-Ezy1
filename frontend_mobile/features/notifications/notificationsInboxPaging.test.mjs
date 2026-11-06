import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./NotificationsScreen.tsx', import.meta.url), 'utf8');
test('native notifications load more than the server 20-row page',()=>{
 assert.match(source,/await getNotifications\(page\)/);
 assert.match(source,/onEndReached=\{loadOlder\}/);
 assert.match(source,/response\.next \? page \+ 1 : null/);
 assert.match(source,/const loadOlder =/);
});
test('failed fetch never clears a working list or displays false empty history',()=>{
 assert.match(source,/setLoadError\(failure\?\.message/);
 assert.match(source,/ListEmptyComponent=\{loadError \? (?:null|undefined)/);
 assert.doesNotMatch(source,/catch[\s\S]*?setNotifications\(\[\]\)/);
});
test('read mutation never hides unread notifications before server acknowledgement',()=>{
 assert.match(source,/await markNotificationsAsRead\(unreadIds\)/);
 assert.match(source,/await markNotificationsAsRead\(\[id\]\)/);
 assert.match(source,/locallyReadIds\.current\.add\(id\)/);
 assert.match(source,/Read status could not be saved/);
});
test('list generation prevents earlier refresh from replacing newer results',()=>{
 assert.match(source,/const request = first \? \+\+generation\.current : generation\.current/);
 assert.match(source,/if \(request !== generation\.current\) return/);
});
