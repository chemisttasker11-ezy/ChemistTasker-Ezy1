import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctionTimestamp } from './correctionTimestamp.ts';

test('ordinary unchanged and edited pharmacy times (positive controls)', () => {
  for (const [zone, original, edited] of [
    ['Australia/Brisbane', '2026-01-12T07:00:00.000Z', '2026-01-12T08:00:00.000Z'],
    ['Australia/Sydney', '2026-01-12T06:00:00.000Z', '2026-01-12T07:00:00.000Z'],
  ]) {
    assert.equal(correctionTimestamp('2026-01-12T17:00', original, zone), original);
    assert.equal(correctionTimestamp('2026-01-12T18:00', original, zone), edited);
  }
});

for (const original of ['2026-04-05T02:30:12.345+11:00', '2026-04-05T02:30:12.345+10:00']) {
  test(`unchanged repeated wall time preserves the exact timestamp ${original}`, () => {
    assert.equal(correctionTimestamp('2026-04-05T02:30', original, 'Australia/Sydney'), original);
  });
}

for (const now of ['2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z']) {
  test(`edited rollback time uses the earlier occurrence regardless of today's offset (${now})`, (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(now) });
    assert.equal(
      correctionTimestamp('2026-04-05T02:45', '2026-04-05T02:30:00+10:00', 'Australia/Sydney'),
      '2026-04-04T15:45:00.000Z',
    );
  });
}
