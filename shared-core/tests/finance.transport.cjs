const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const modulePath = path.resolve(__dirname, '../.finance-test-build/finance.js');
function fresh() { delete require.cache[modulePath]; return require(modulePath); }
const page = (results, next = null) => new Response(JSON.stringify({ results, next, count: results.length }), { headers: { 'Content-Type': 'application/json' } });
const config = { baseURL: 'https://api.example.invalid/api', getToken: async () => 'private-token', credentials: 'include' };

test('requires the application API configuration', async () => {
  const { finance } = fresh();
  await assert.rejects(finance.items(), /not configured/);
});
test('reuses base URL, credentials and fresh token provider', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config);
  let seen;
  global.fetch = async (url, options) => { seen = { url: String(url), options }; return page([]); };
  await finance.items();
  assert.equal(seen.url, 'https://api.example.invalid/api/client-profile/finance/items/');
  assert.equal(seen.options.credentials, 'include');
  assert.equal(seen.options.headers.get('Authorization'), 'Bearer private-token');
});
test('follows same-origin finance pagination', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let calls = 0;
  global.fetch = async () => ++calls === 1 ? page([{ id: 1 }], 'https://api.example.invalid/api/client-profile/finance/items/?page=2') : page([{ id: 2 }]);
  assert.deepEqual(await finance.items(), [{ id: 1 }, { id: 2 }]); assert.equal(calls, 2);
});
test('does not send a token to cross-origin pagination URLs', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let calls = 0;
  global.fetch = async () => { calls++; return page([], 'https://untrusted.invalid/items/'); };
  await assert.rejects(finance.items(), /cannot leave/); assert.equal(calls, 1);
});
test('does not follow pagination outside the finance path', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let calls = 0;
  global.fetch = async () => { calls++; return page([], 'https://api.example.invalid/api/users/'); };
  await assert.rejects(finance.items(), /cannot leave/); assert.equal(calls, 1);
});
test('sends decimal strings without converting them to floats', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let body;
  global.fetch = async (_, options) => { body = JSON.parse(options.body); return new Response('{}', { headers: { 'Content-Type': 'application/json' } }); };
  await finance.saveItem({ unit_price: '12.30', name: 'Test' }); assert.equal(body.unit_price, '12.30');
});
test('preserves actionable uncertainty messages', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config);
  global.fetch = async () => new Response(JSON.stringify({ detail: 'Email acceptance is uncertain. Do not resend.' }), { status: 503 });
  await assert.rejects(finance.send(1, 1), /acceptance is uncertain/);
});
test('downloads receipt bytes through the authenticated API', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let auth;
  global.fetch = async (_, options) => { auth = options.headers.get('Authorization'); return new Response('test receipt'); };
  const result = await finance.receipt(1); assert.equal(await result.text(), 'test receipt'); assert.equal(auth, 'Bearer private-token');
});
test('rejects repeated pagination instead of looping or silently truncating', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let calls = 0;
  global.fetch = async () => { calls++; return page([], 'https://api.example.invalid/api/client-profile/finance/items/?page=2'); };
  await assert.rejects(finance.items(), /pagination repeated/); assert.equal(calls, 2);
});

test('authenticated requests fail closed on HTTP redirects', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let redirect;
  global.fetch = async (_, options) => { redirect = options.redirect; return page([]); };
  await finance.items(); assert.equal(redirect, 'error');
});
test('pagination rejects credentials embedded in a URL', async () => {
  const { finance, configureFinanceApi } = fresh(); configureFinanceApi(config); let calls = 0;
  global.fetch = async () => { calls++; return page([], 'https://name:secret@api.example.invalid/api/client-profile/finance/items/'); };
  await assert.rejects(finance.items(), /cannot leave/); assert.equal(calls, 1);
});
