import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
if (!process.env.E2E_AUTH_PASSWORD || !process.env.E2E_AUTH_DASHBOARD_PORT || !process.env.E2E_AUTH_BACKEND_PORT) {
  throw new Error('Use npm run test:e2e:authenticated so the isolated stack and credentials are configured.');
}
export default {
  tests: 'authenticated/**/*.e2e.ts', workers: 1, retries: 0,
  timeout: 120_000, assertionTimeout: 30_000, trace: 'on',
  output: '.e2e/authenticated-report',
  credentials: {
    owner: { username: 'owner@browser-acceptance.example.test', password: () => process.env.E2E_AUTH_PASSWORD! },
    worker: { username: 'worker@browser-acceptance.example.test', password: () => process.env.E2E_AUTH_PASSWORD! },
  },
  targets: [{
    name: 'authenticated-web', engine: web({ timezoneId: 'Australia/Brisbane' }),
    app: {
      url: 'http://127.0.0.1:0', environment: 'test',
      command: {
        executable: process.env.E2E_NODE_BINARY ?? process.execPath,
        args: [resolve(root, 'support/start-authenticated-stack.mjs'), '{port}'],
        cwd: root, startupTimeout: 600_000, shutdownTimeout: 15_000,
        env: {
          E2E_SOURCE_ROOT: process.env.E2E_SOURCE_ROOT ?? resolve(root, '../..'),
          E2E_BACKEND_IMAGE: process.env.E2E_BACKEND_IMAGE ?? 'chemisttasker-e2e-backend:local',
          E2E_AUTH_RUN_ID: process.env.E2E_AUTH_RUN_ID!,
          E2E_AUTH_PASSWORD: process.env.E2E_AUTH_PASSWORD,
          E2E_AUTH_DASHBOARD_PORT: process.env.E2E_AUTH_DASHBOARD_PORT,
          E2E_AUTH_BACKEND_PORT: process.env.E2E_AUTH_BACKEND_PORT,
        },
        log: '.e2e/logs/authenticated-stack.log',
      },
    },
  }],
} satisfies E2EConfig;
