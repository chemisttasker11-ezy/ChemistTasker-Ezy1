const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('my roster offers pending published roster acknowledgement', () => {
 const s = fs.readFileSync(path.join(__dirname, '../app/my-roster.tsx'), 'utf8');
 assert.ok(s.includes('PublishedRosterNotice'));
 const notice = fs.readFileSync(path.join(__dirname, '../features/parity/PublishedRosterNotice.tsx'), 'utf8');
 assert.ok(notice.includes('rosterV2.getWorkerRoster'));
 assert.ok(notice.includes('can_acknowledge'));
 assert.ok(notice.includes('/attendance/published-roster'));
});
