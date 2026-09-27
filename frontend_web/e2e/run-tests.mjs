import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { preview } from 'vite';

const testRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testRoot, '..');
const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const viteBin = resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const playwrightCli = resolve(testRoot, 'node_modules', '@playwright', 'test', 'cli.js');

const env = {
  ...process.env,
  PLAYWRIGHT_PORT: String(port),
  VITE_API_URL: 'http://127.0.0.1:8000',
  VITE_API_BASE_URL: 'http://127.0.0.1:8000',
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
