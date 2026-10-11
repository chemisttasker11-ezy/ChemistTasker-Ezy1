import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = dirname(fileURLToPath(import.meta.url));

export default {
  tests: 'tests/**/*.e2e.ts',
  workers: 1,
  retries: 0,
  assertionTimeout: 15_000,
  trace: 'on',
  targets: [{
    name: 'vite-chromium',
    engine: web({ timezoneId: 'Australia/Brisbane' }),
    app: {
      url: 'http://127.0.0.1:0',
      environment: 'test',
      command: {
        executable: process.env.E2E_NODE_BINARY ?? process.execPath,
        args: [resolve(testRoot, '../node_modules/vite/bin/vite.js'), 'preview',
          '--host', '127.0.0.1', '--port', '{port}', '--strictPort',
          '--outDir', resolve(testRoot, '.e2e/site')],
        cwd: resolve(testRoot, '..'),
        log: '.e2e/logs/app.log',
      },
    },
  }],
} satisfies E2EConfig;
