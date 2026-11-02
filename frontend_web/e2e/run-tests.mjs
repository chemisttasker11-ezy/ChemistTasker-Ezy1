import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { preview } from 'vite';

const testRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = process.env.PLAYWRIGHT_APP_ROOT ? resolve(process.env.PLAYWRIGHT_APP_ROOT) : resolve(testRoot, '..');
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const viteBin = resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const playwrightCli = resolve(testRoot, 'node_modules', '@playwright', 'test', 'cli.js');

if (process.env.CT_CAPTURE_APPROVED_SOURCE_BASELINE === '1') {
  const approvedSource = '25ef200f0c32b2b6fc764a4d05a648b604038794';
  const identity = spawnSync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  const sourceClean = spawnSync('git', ['-C', projectRoot, 'diff', '--quiet', 'HEAD', '--', 'src', '../shared-core/src']);
  if (sourceClean.status !== 0 || identity.status !== 0 || identity.stdout.trim() !== approvedSource
      || projectRoot === resolve(testRoot, '..') || !process.argv.includes('--update-snapshots')) {
    throw new Error('Approved-source capture requires the separate immutable main worktree and explicit snapshot capture');
  }
  console.log(`APPROVED_APPEARANCE_SOURCE=${approvedSource}`);
}

const env = {
  ...process.env,
  PLAYWRIGHT_PORT: String(port),
  PLAYWRIGHT_HERMETIC: '1',
  VITE_API_URL: 'http://127.0.0.1:8000',
  VITE_API_BASE_URL: 'http://127.0.0.1:8000',
  // Exercise the actual cross-origin Next/Vite URL builder, not same-origin fallback.
  VITE_PUBLIC_SITE_URL: process.env.VITE_PUBLIC_SITE_URL || 'http://127.0.0.1:3000',
  EXPECTED_NEXT_ORIGIN: process.env.EXPECTED_NEXT_ORIGIN || process.env.VITE_PUBLIC_SITE_URL || 'http://127.0.0.1:3000',
};

const build = spawnSync(process.execPath, [viteBin, 'build'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const server = await preview({
  root: projectRoot,
  preview: { host: '127.0.0.1', port, strictPort: true },
});

const runner = spawn(process.execPath, [playwrightCli, 'test', '--config=playwright.config.mjs', ...process.argv.slice(2)], {
  cwd: testRoot,
  env,
  stdio: 'inherit',
});

const exitCode = await new Promise((resolveExit) => {
  runner.once('exit', (code) => resolveExit(code ?? 1));
});

await Promise.race([
  server.close(),
  new Promise((resolveClose) => setTimeout(resolveClose, 2_000)),
]);
process.exit(exitCode);
