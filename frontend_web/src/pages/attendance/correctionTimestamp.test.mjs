import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
// Node's test runner cannot import extensionless shared-core dist through the web wrapper.
const shared = new URL('../../../../shared-core/src/utils/correctionTimestamp.ts', import.meta.url);
const source = readFileSync(existsSync(shared) ? shared : new URL('./correctionTimestamp.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
});
const exports = {};
vm.runInNewContext(outputText, { exports, require, Date, Intl, Set, Object });
const { correctionTimestamp } = exports;

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
