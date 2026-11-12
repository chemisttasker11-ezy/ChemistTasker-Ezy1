import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the proxy without a Next server; NextRequest is only a type here.
const source = readFileSync(new URL('./platform-proxy.ts', import.meta.url), 'utf8')
  .replace("import 'server-only';", '')
  .replace("'./api-root.mjs'", JSON.stringify(new URL('./api-root.mjs', import.meta.url).href));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { platformProxy } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('pitch create preserves the UUID header and exact payload through the Next proxy', async () => {
  const key = '165416cf-c485-4aad-8914-d7580f831843';
  const payload = '{"headline":"Frozen pitch","availability_days":["2026-11-07"]}';
  const request = new Request('http://localhost/api/platform/explorer-posts/', { method: 'POST', body: payload,
    headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', 'Idempotency-Key': key } });
  request.nextUrl = new URL(request.url);
  const originalFetch = globalThis.fetch;
  const originalSite = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost';
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    assert.equal(options.headers.get('Idempotency-Key'), key);
    assert.equal(Buffer.from(options.body).toString(), payload);
    return Response.json({ id: 7 }, { status: 201 });
  };
  try {
    const response = await platformProxy(request, 'explorer-posts/', 'POST', 'http://backend.test/api/v1');
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: 7 });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSite;
  }
});
