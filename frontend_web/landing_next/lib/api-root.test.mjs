import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_API_ROOT, backendOrigin, canonicalApiRoot } from './api-root.mjs';
import { createServer } from 'node:http';
import { createServerApiFetch } from './server-api-fetch.mjs';

test('every configured form resolves to the canonical /api/v1 root', () => {
  for (const value of [
    'http://web:8000',
    'http://web:8000/',
    'http://web:8000/api',
    'http://web:8000/api/',
    'http://web:8000/api/v1',
    'http://web:8000/api/v1/',
    '  http://web:8000/api  ',
  ]) {
    assert.equal(canonicalApiRoot(value), 'http://web:8000/api/v1', value);
  }
});

test('unset configuration uses the local canonical default', () => {
  assert.equal(canonicalApiRoot(undefined), DEFAULT_API_ROOT);
  assert.equal(canonicalApiRoot(''), DEFAULT_API_ROOT);
});

test('WebSocket and media rewrites target the backend origin, never an API root', () => {
  assert.equal(backendOrigin('http://web:8000/api/v1'), 'http://web:8000');
  assert.equal(backendOrigin('http://web:8000/api'), 'http://web:8000');
  assert.equal(backendOrigin('https://backend.example/api/v1/'), 'https://backend.example');
});

test('HTTPS SSR Hub reads reach an internal HTTP backend without following its SSL redirect', async () => {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, protocol: request.headers['x-forwarded-proto'] });
    if (request.headers['x-forwarded-proto'] !== 'https') {
      response.writeHead(301, { location: `https://${request.headers.host}${request.url}` }).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify([{ key: 'public' }]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/v1/public-hub/community/`;
    // Reproduce the failure with the redirect-rejecting policy used by shared-core.
    await assert.rejects(fetch(url, { redirect: 'error' }));
    const transport = createServerApiFetch('https://staging.example.test');
    assert.deepEqual(await (await transport(url, { redirect: 'error' })).json(), [{ key: 'public' }]);
    assert.deepEqual(requests, [
      { path: '/api/v1/public-hub/community/', protocol: undefined },
      { path: '/api/v1/public-hub/community/', protocol: 'https' },
    ]);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('SSR forwarding keeps local HTTP, request headers, bodies and redirect rejection intact', async () => {
  for (const [siteUrl, expected] of [[undefined, 'http'], ['http://localhost:3000', 'http'], ['https://staging.example.test', 'https']]) {
    let captured;
    const transport = createServerApiFetch(siteUrl, async (input, init) => {
      captured = { input, init };
      return Response.json({ ok: true });
    });
    const request = new Request('http://web:8000/api/v1/test/', { headers: { accept: 'application/json' } });
    await transport(request, {
      method: 'POST', body: '{}', redirect: 'error', cache: 'no-store',
      headers: { authorization: 'Bearer fixture-token', 'x-forwarded-proto': 'untrusted' },
    });
    assert.equal(captured.input, request);
    assert.equal(captured.init.headers.get('x-forwarded-proto'), expected);
    assert.equal(captured.init.headers.get('authorization'), 'Bearer fixture-token');
    assert.equal(captured.init.headers.get('accept'), 'application/json');
    assert.equal(captured.init.body, '{}');
    assert.equal(captured.init.redirect, 'error');
    assert.equal(captured.init.cache, 'no-store');
  }
});
