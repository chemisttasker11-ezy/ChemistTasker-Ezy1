#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.env.CT_SHARED_CORE_SKIP_PREPARE === '1') {
  console.log('Shared-core local prepare skipped by CT_SHARED_CORE_SKIP_PREPARE=1.');
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, '..');
const sharedCore = path.join(root, 'shared-core');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args) {
  const result = spawnSync(npm, args, {
    cwd: sharedCore,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('Preparing @chemisttasker/shared-core from repository source...');
run(['ci', '--ignore-scripts']);
run(['run', 'build']);
