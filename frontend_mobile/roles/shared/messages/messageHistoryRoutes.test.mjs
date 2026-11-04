import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
test('chat history has native older-page loading without unconditional message-count bottom jump', () => {
 const screen=read('./[id].tsx');
 assert.match(screen,/fetchRoomMessagesByUrl\(nextHistoryUrl!/);
 assert.match(screen,/mergeOlderMessages\(current,/);
 assert.match(screen,/maintainVisibleContentPosition=/);
 assert.match(screen,/readerNearBottomRef\.current/);
 assert.match(screen,/unseenMessages > 0/);
 assert.match(screen,/isNextPageForRoom\(page\.next, roomId\)/);
 assert.doesNotMatch(screen,/whenever messages or room change, jump to bottom/);
});
test('mobile chat exposes canonical pharmacy conversations through shared-core',()=>{
 const page=read('../chat/ChatPage.tsx');
 const sidebar=read('../chat/ChatSidebar.tsx');
 assert.match(page,/fetchMyMemberships\(\{\}\)/);
 assert.match(page,/getOrCreatePharmacyGroup\(pharmacyId\)/);
 assert.match(page,/pharmacyChatsFromMemberships/);
 assert.match(sidebar,/Pharmacy teams/);
 assert.match(sidebar,/onOpenPharmacyTeam/);
});
