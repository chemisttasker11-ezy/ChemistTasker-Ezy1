import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));
const bundledNode = resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe');
const candidates = process.env.E2E_NODE_BINARY
  ? [process.env.E2E_NODE_BINARY]
  : [process.execPath, bundledNode];
const node = candidates.find(candidate => {
  if (!existsSync(candidate)) return false;
  const version = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
  const [major, minor, patch] = (version.stdout?.trim().replace(/^v/, '') ?? '').split('.').map(Number);
  return version.status === 0 && (
    major > 24 || (major === 24 && minor >= 8) ||
    (major === 22 && (minor > 22 || (minor === 22 && patch >= 3)))
  );
});
if (!node) {
  console.error('e2e requires Node 22.22.3+ on Node 22, or Node 24.8+. Set E2E_NODE_BINARY to a supported node executable.');
  process.exit(1);
}

const env = {
  ...process.env,
  E2E_NODE_BINARY: node,
  E2E_TELEMETRY_DISABLED: '1',
  VITE_API_URL: '/api/v1',
  VITE_PUBLIC_SITE_ENABLED: '0',
};
const command = process.argv[2] ?? 'run';
const args = process.argv.slice(3);
const authenticated = command === 'run-authenticated';
const runId = authenticated ? randomUUID() : null;
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return String(port);
}
if (authenticated) {
  env.E2E_AUTH_RUN_ID = runId;
  env.E2E_AUTH_PASSWORD = randomBytes(24).toString('base64url');
  env.E2E_AUTH_DASHBOARD_PORT = await freePort();
  env.E2E_AUTH_BACKEND_PORT = await freePort();
  const sourceRoot = process.env.E2E_SOURCE_ROOT || resolve(testRoot, '../..');
  if (!existsSync(resolve(sourceRoot, 'backend/core/e2e_acceptance_settings.py'))) {
    console.error('Authenticated tests need the source checkout with backend fixtures. Set E2E_SOURCE_ROOT to it.');
    process.exit(1);
  }
  const image = process.env.E2E_BACKEND_IMAGE || 'chemisttasker-e2e-backend:local';
  env.E2E_BACKEND_IMAGE = image;
  if (!process.env.E2E_BACKEND_IMAGE) {
    const built = spawnSync('docker', ['build', '--quiet', '-f', 'backend/Dockerfile.dev', '-t', image, 'backend'], { cwd: sourceRoot, stdio: 'inherit' });
    if (built.status !== 0) process.exit(built.status ?? 1);
  } else if (spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' }).status !== 0) {
    console.error('The explicitly configured E2E_BACKEND_IMAGE is unavailable. Prepare it before running.');
    process.exit(1);
  }
}
const execute = (file, argv, cwd = testRoot) => {
  const result = spawnSync(node, [file, ...argv], { cwd, env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (command === 'run' || command === 'mcp') {
  execute(resolve(testRoot, '../node_modules/vite/bin/vite.js'), [
    'build', '--outDir', resolve(testRoot, '.e2e/site'),
  ], resolve(testRoot, '..'));
}

// Resolve the package's published executable rather than relying on an npm shell shim.
const { readFileSync } = await import('node:fs');
const packageName = command === 'install-browser' ? '@e2e-dev/web' : 'e2e';
const packageRoot = resolve(testRoot, 'node_modules', packageName);
const metadata = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin[command === 'install-browser' ? 'e2e-web' : 'e2e'];
if (authenticated) {
  const result = spawnSync(node, [resolve(packageRoot, bin), 'run', '--config', 'e2e.authenticated.config.ts', ...args], { cwd: testRoot, env, stdio: 'inherit' });
  // Windows process-tree shutdown does not notify a Docker daemon. Remove only our labelled container.
  const name = `chemisttasker-e2e-${runId}`;
  const ownership = spawnSync('docker', ['inspect', '--format', '{{index .Config.Labels "chemisttasker.e2e.run"}}', name], { encoding: 'utf8' });
  if (ownership.status === 0 && ownership.stdout.trim() === runId) {
    const removed = spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
    if (removed.status !== 0) process.exit(1);
  }
  process.exit(result.status ?? 1);
}
execute(resolve(packageRoot, bin), command === 'install-browser' ? ['install', 'chromium', ...args] : [command, ...args]);
