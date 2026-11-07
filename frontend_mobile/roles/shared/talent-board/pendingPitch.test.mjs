import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const sharedSource = readFileSync(new URL('../../../../shared-core/src/domains/talent/pendingPitch.ts', import.meta.url), 'utf8');
const mobileSource = readFileSync(new URL('./pendingPitch.ts', import.meta.url), 'utf8');
let post;
const shared = {};
runInNewContext(ts.transpileModule(sharedSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: shared, require: () => ({ createExplorerPost: (...args) => post(...args) }), Date, JSON, Number, Error });
const data = new Map();
const storage = { getItem: async k => data.get(k) ?? null, setItem: async (k,v) => { data.set(k,v); }, removeItem: async k => { data.delete(k); } };
const mobile = {};
runInNewContext(ts.transpileModule(mobileSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: mobile, require: id => id === '@chemisttasker/shared-core' ? shared : id.includes('async-storage') ? { __esModule: true, default: storage } : { idempotencyKey: () => '12345678-1234-4123-8123-123456789abc' }, Promise, Error });

test('timeout retry and restart preserve key and payload, isolated by account', async () => {
  const store = mobile.mobilePendingPitchStore('env', 1);
  const intent = await store.acquire({ headline: 'original' }, 'EXPLORER');
  const calls = [];
  post = async (payload, key) => { calls.push([JSON.stringify(payload), key]); if (calls.length === 1) throw Error('timeout'); return { id: 7 }; };
  await assert.rejects(mobile.submitPendingPitch(store, intent, () => true));
  const restored = await mobile.mobilePendingPitchStore('env', 1).read();
  assert.equal(await mobile.mobilePendingPitchStore('env', 2).read(), null);
  await mobile.submitPendingPitch(store, restored, () => true);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal((await store.read()).acknowledged, true);
});

test('terminal POST errors reconcile with clear copy; unrelated 400 does not reject', async () => {
  for (const [status, code, text] of [[409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', /different/i], [410, 'PITCH_DELETED', /deleted/i], [410, 'IDEMPOTENCY_REPLAY_EXPIRED', /expired/i]]) {
    data.clear();
    const store = mobile.mobilePendingPitchStore('env', 1);
    const intent = await store.acquire({ headline: 'x' }, 'EXPLORER');
    post = async () => { throw { status, payload: { code } }; };
    await assert.rejects(mobile.submitPendingPitch(store, intent, () => true), e => text.test(e.message));
    assert.equal((await store.read()).terminalCode, code);
  }
  data.clear();
  const store = mobile.mobilePendingPitchStore('env', 1);
  const intent = await store.acquire({ headline: 'x' }, 'EXPLORER');
  post = async () => { throw { status: 400, payload: { headline: ['Invalid'] } }; };
  await assert.rejects(mobile.submitPendingPitch(store, intent, () => true));
  assert.equal((await store.read()).rejected, true);
});
