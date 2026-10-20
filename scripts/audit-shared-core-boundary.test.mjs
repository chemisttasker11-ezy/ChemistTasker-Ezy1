import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Exercise the real CLI in a shallow checkout without a history base.
// This is a security-gate test: do not let --strict silently return success.
const audit = path.resolve(import.meta.dirname, 'audit-shared-core-boundary.mjs');
function run(args, env) {
  return spawnSync(process.execPath, [audit, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 15000,
  });
}
test('an unknown flag is rejected instead of ignored', () => {
  const result = run(['--not-a-real-option']);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Unknown shared-core boundary audit option/);
});
test('--strict requires an actual comparison base', () => {
  const result = run(['--strict'], { SHARED_CORE_AUDIT_BASE: 'definitely-not-a-git-commit' });
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /could not inspect|SKIPPED/);
});
test('the normal audit rejects an invalid explicitly selected base', () => {
  const result = run([], { SHARED_CORE_AUDIT_BASE: 'definitely-not-a-git-commit' });
  assert.notEqual(result.status, 0, result.stdout);
});
