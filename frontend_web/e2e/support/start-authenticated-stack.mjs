import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const source = resolve(process.env.E2E_SOURCE_ROOT);
const sourceWeb = resolve(source, 'frontend_web');
const backend = resolve(source, 'backend');
if (!existsSync(resolve(backend, 'core/e2e_acceptance_settings.py'))) {
  throw new Error('Authenticated tests require the source checkout. Set E2E_SOURCE_ROOT to it.');
}
const nextPort = process.argv[2];
const vitePort = process.env.E2E_AUTH_DASHBOARD_PORT;
const backendPort = process.env.E2E_AUTH_BACKEND_PORT;
const runs = resolve(process.cwd(), '.e2e/authenticated');
mkdirSync(runs, { recursive: true });
const testRoot = mkdtempSync(resolve(runs, 'run-'));
const web = resolve(testRoot, 'frontend_web');
// Preserve the canonical workspace dependency path used by Vite's dev aliases.
symlinkSync(resolve(source, 'shared-core'), resolve(testRoot, 'shared-core'), process.platform === 'win32' ? 'junction' : 'dir');
const excluded = new Set(['node_modules', '.next', '.e2e', '.git', 'e2e', 'src-tauri', 'dist', 'dist-kiosk', 'test-results', 'playwright-report']);
mkdirSync(web, { recursive: true });
const copyable = file => !excluded.has(basename(file)) && !basename(file).startsWith('.env') && !file.endsWith('.tsbuildinfo');
for (const entry of readdirSync(sourceWeb)) {
  const from = resolve(sourceWeb, entry);
  if (copyable(from)) cpSync(from, resolve(web, entry), { recursive: true, filter: copyable });
}
for (const relative of ['node_modules', 'landing_next/node_modules']) {
  symlinkSync(resolve(sourceWeb, relative), resolve(web, relative), process.platform === 'win32' ? 'junction' : 'dir');
}
const nextConfig = resolve(web, 'landing_next/next.config.ts');
writeFileSync(nextConfig, readFileSync(nextConfig, 'utf8').replaceAll("path.resolve(__dirname,'../..')", JSON.stringify(source)));
const viteConfig = resolve(web, 'vite.config.ts');
writeFileSync(viteConfig, readFileSync(viteConfig, 'utf8')
  .replace("base: '/',", `base: '/', cacheDir:${JSON.stringify(resolve(testRoot, 'vite-cache'))},`)
  .replace("allow: [resolve(import.meta.dirname, '..')]", `allow: ${JSON.stringify([source, testRoot])}`));
const containerRoot = `/.e2e/authenticated/${basename(testRoot)}`;
const env = {
  ...process.env, APP_ENV: 'test', DJANGO_ENV_FILE: '', DEBUG: 'True',
  SECRET_KEY: 'disposable-browser-acceptance-only', ADMIN_URL: 'admin/',
  EMAIL_HOST_USER: 'ci@example.test', EMAIL_HOST_PASSWORD: 'test-placeholder',
  DEFAULT_FROM_EMAIL: 'ci@example.test', RECAPTCHA_SECRET_KEY: 'test-placeholder',
  AZURE_OCR_ENDPOINT: 'https://example.test', AZURE_OCR_KEY: 'test-placeholder',
  SCRAPINGBEE_API_KEY: 'test-placeholder', MOBILEMESSAGE_USERNAME: 'test-placeholder',
  MOBILEMESSAGE_PASSWORD: 'test-placeholder', MOBILEMESSAGE_SENDER: 'ChemistTasker',
  DJANGO_SETTINGS_MODULE: 'core.e2e_acceptance_settings', PYTHONPATH: backend,
  E2E_TEST_ROOT: testRoot, E2E_TEST_PASSWORD: process.env.E2E_AUTH_PASSWORD,
  E2E_TEST_ORIGINS: `http://127.0.0.1:${nextPort},http://127.0.0.1:${vitePort}`,
  PLATFORM_API_URL: `http://127.0.0.1:${backendPort}/api/v1`,
  HUB_API_URL: `http://127.0.0.1:${backendPort}/api/v1`,
  DASHBOARD_INTERNAL_URL: `http://127.0.0.1:${vitePort}`,
  DASHBOARD_PUBLIC_URL: `http://127.0.0.1:${vitePort}`,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${nextPort}`,
  VITE_PUBLIC_SITE_URL: `http://127.0.0.1:${nextPort}`,
  VITE_PUBLIC_SITE_ENABLED: '0', VITE_API_URL: '/api/v1',
  VITE_DEV_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
  VITE_DEV_WS_PROXY_TARGET: `ws://127.0.0.1:${backendPort}`,
  VITE_DEV_HMR_PORT: vitePort,
};
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 1_000);
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
function start(file, args, cwd) {
  const child = spawn(file, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { children.delete(child); if (!stopping && code !== 0) stop(code ?? 1); });
  return child;
}
try {
  const dockerEnv = { ...env, E2E_TEST_ROOT: containerRoot, PYTHONPATH: '/app' };
  const environmentKeys = ['APP_ENV', 'DJANGO_ENV_FILE', 'DEBUG', 'SECRET_KEY', 'ADMIN_URL', 'EMAIL_HOST_USER', 'EMAIL_HOST_PASSWORD', 'DEFAULT_FROM_EMAIL', 'RECAPTCHA_SECRET_KEY', 'AZURE_OCR_ENDPOINT', 'AZURE_OCR_KEY', 'SCRAPINGBEE_API_KEY', 'MOBILEMESSAGE_USERNAME', 'MOBILEMESSAGE_PASSWORD', 'MOBILEMESSAGE_SENDER', 'DJANGO_SETTINGS_MODULE', 'PYTHONPATH', 'E2E_TEST_ROOT', 'E2E_TEST_PASSWORD', 'E2E_TEST_ORIGINS'];
  const docker = spawn('docker', ['run', '--rm', '--name', `chemisttasker-e2e-${process.env.E2E_AUTH_RUN_ID}`,
    '--label', `chemisttasker.e2e.run=${process.env.E2E_AUTH_RUN_ID}`,
    '--publish', `127.0.0.1:${backendPort}:8000`,
    // backend/Dockerfile.dev carries dependencies only; the source under test is mounted.
    '--mount', `type=bind,source=${backend},target=/app,readonly`,
    '--mount', `type=bind,source=${testRoot},target=${containerRoot}`,
    '--workdir', '/app', '--entrypoint', 'sh',
    ...environmentKeys.flatMap(key => ['--env', key]),
    process.env.E2E_BACKEND_IMAGE,
    '-c', 'python manage.py migrate --noinput && python testing/seed_e2e_acceptance.py && exec daphne -b 0.0.0.0 -p 8000 core.asgi:application'],
    { cwd: source, env: dockerEnv, stdio: 'inherit', windowsHide: true });
  children.add(docker);
  docker.on('error', error => { console.error(error.message); stop(1); });
  docker.on('exit', code => { children.delete(docker); if (!stopping) stop(code ?? 1); });
  const deadline = Date.now() + 540_000;
  while (!stopping) {
    try { if ((await fetch(`http://127.0.0.1:${backendPort}/health/`)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Disposable Docker backend did not become ready');
    await new Promise(done => setTimeout(done, 250));
  }
  if (stopping) throw new Error('Disposable Docker backend failed');
  start(process.execPath, [resolve(web, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', vitePort, '--strictPort'], web);
  start(process.execPath, [resolve(web, 'landing_next/node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', nextPort], resolve(web, 'landing_next'));
} catch (error) { console.error(error.message); stop(1); }
