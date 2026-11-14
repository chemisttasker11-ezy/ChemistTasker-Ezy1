const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');

test('worker roster shows server-published shifts and acknowledges each period through shared-core', () => {
  const screen = read('app/attendance/published-roster.tsx');
  const entry = read('features/parity/attendance.tsx');
  assert.match(screen, /rosterV2\.getWorkerRoster\(\{\}\)/);
  assert.match(screen, /rosterV2\.acknowledge\(\{ period_id: periodId/);
  // D144: the acknowledged filter moved to the shared predicate (truth table in parity-p2-roster.test.cjs).
  assert.match(screen, /isPendingPublishedRoster\(shift\)/);
  assert.match(read('features/parity/PublishedRosterNotice.tsx'), /!shift\.is_acknowledged/);
  assert.match(screen, /showAction && period != null/);
  assert.match(entry, /\/attendance\/published-roster/);
});
