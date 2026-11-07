// Child processes, not in-process TZ mutation, verify Australia/Brisbane and
// Australia/Sydney under their own module-load environments. Run the REAL file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('./m4CalendarPreview.test.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('.', import.meta.url));
for (const zone of ['Australia/Brisbane', 'Australia/Sydney']) {
  test('R: isolated '+zone+' subprocess runs every calendar preview test', () => {
    const run = spawnSync(process.execPath, [
      '--test', '--test-reporter=tap', target,
    ], {
      cwd, env: { ...process.env, TZ: zone }, encoding: 'utf8',
      timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    });
    const output = ['TZ='+zone, 'command=node --test --test-reporter=tap '+target,
      'exit='+String(run.status), run.stdout ?? '', run.stderr ?? ''].join('\n');
    assert.equal(run.error, undefined, output);
    assert.equal(run.signal, null, output);
    assert.equal(run.status, 0, output);
    assert.ok((run.stdout ?? '').trim().length > 0, 'Child did not execute tests:\n'+output);
    assert.match(run.stdout, /# Subtest: R: calendar day rollover across December and leap dates/,
      'rollover test must execute in this TZ:\n'+output);
    assert.match(run.stdout, /# Subtest: R: DST spring-forward and fall-back preserve next calendar day/,
      'DST test must execute in this TZ:\n'+output);
    assert.match(run.stdout, /# fail 0(?:\r?\n|$)/, 'child must report zero failures:\n'+output);
    assert.match(run.stdout, /# pass [1-9]\d*/, 'child must report executed passing tests:\n'+output);
  });
}
