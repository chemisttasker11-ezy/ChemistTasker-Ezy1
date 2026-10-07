import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('bare API root ratchet distinguishes maintained callers from compatibility tests', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-api-audit-'));
  const put = (name, content) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  try {
    put('scripts/audit-api-v1-cutover.mjs', fs.readFileSync(new URL('./audit-api-v1-cutover.mjs', import.meta.url)));
    put('shared-core/tests/transport.cjs', 'const baseURL = "https://example.invalid/api";');
    put('frontend_web/scripts/ws-url.test.mjs', 'normalize("https://example.invalid/api");');
    put('frontend_web/src/utils/wsUrl.ts', '/**\n * accepts "https://example.invalid/api"\n */\nexport const path = "/ws/";');
    put('frontend_web/src-tauri/src/lib.rs', '#[cfg(test)]\nmod tests { reject("https://example.invalid/api"); }');
    const generatedRoute = ['','api','users',''].join('/');
    put('frontend_web/landing_next/.next/types/routes.d.ts', `type GeneratedRoute = '${generatedRoute}';`);
    put('frontend_web/src-tauri/target/debug/generated.rs', `const GENERATED_ROUTE = "${generatedRoute}";`);
    const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/audit-api-v1-cutover.mjs')], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    for (const caller of ['shared-core/src/transport.ts', 'frontend_web/src/api.ts',
      'frontend_mobile/config/api.ts', 'frontend_web/src-tauri/src/lib.rs']) {
      put(caller, 'const API_URL = "https://example.invalid/api";');
      const failure = run();
      assert.equal(failure.status, 1, caller);
      assert.ok(failure.stderr.includes(`${caller}:1: bare legacy HTTP API root`));
      put(caller, 'const API_URL = "https://example.invalid/api/v1";');
      assert.equal(run().status, 0);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
