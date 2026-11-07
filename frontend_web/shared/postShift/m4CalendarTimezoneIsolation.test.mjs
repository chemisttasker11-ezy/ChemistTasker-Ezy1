// Separate Node processes ensure each Australian time zone is established before module load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./m4CalendarPreview.test.mjs', import.meta.url));
for (const zone of ['Australia/Brisbane', 'Australia/Sydney']) {
  test('C: isolated '+zone+' process executes rollover/DST regression tests', () => {
    const run = spawnSync(process.execPath, [
      '--test', '--test-name-pattern=calendar day rollover|DST spring-forward',
      target,
    ], { env: { ...process.env, TZ: zone }, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.error, undefined, String(run.error || ''));
    assert.equal(run.status, 0, zone+' calendar regression failed:\n'+run.stdout+'\n'+run.stderr);
    assert.match(run.stdout, /pass 2/, zone+' must execute both rollover regressions');
  });
}
