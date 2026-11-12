import { expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { createPendingIntentStore, createPendingPitchStore, pitchIntentScope, sendPendingPitch } from './pendingPitch';

// API under test (export from pendingPitch): createPendingIntentStore({ storage, lock,
// environment, userId, operation, newKey }) -> acquire(exactPayload), load(),
// settle(key, resultId), clear(key). Records retain key/exactPayload/createdAt;
// settle durably records resultId, and clear refuses an unsettled or different key.
// The pitch operation is 'talent.pitch.create' and reads the existing v1 pitch scope.
const environment = 'https://example.test/api/v1';
const pitch = 'talent.pitch.create';
const marketplace = 'marketplace.listing.create';

function fixture() {
  const records = new Map<string, string>();
  const queues = new Map<string, Promise<void>>();
  let sequence = 0;
  const newKey = vi.fn(() => `165416cf-c485-4aad-8914-${String(++sequence).padStart(12, '0')}`);
  const storage = {
    getItem: async (name: string) => records.get(name) ?? null,
    setItem: vi.fn(async (name: string, value: string) => { records.set(name, value); }),
    removeItem: async (name: string) => { records.delete(name); },
  };
  const lock = async <T,>(name: string, run: () => Promise<T>) => {
    const previous = queues.get(name) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    queues.set(name, next);
    await previous;
    try { return await run(); } finally {
      release();
      if (queues.get(name) === next) queues.delete(name);
    }
  };
  const open = (operation = marketplace, userId: string | number = 'A', env = environment) =>
    createPendingIntentStore({ storage, lock, environment: env, userId, operation, newKey });
  return { records, storage, lock, newKey, open };
}

it('replays a committed response lost before restart with the persisted key and frozen payload', async () => {
  const { open, records } = fixture();
  const store = open();
  const payload = { title: 'Original', photos: [{ uri: 'durable/original.jpg' }] };
  const intent = await store.acquire(payload);
  const frozen = JSON.parse(JSON.stringify(payload));
  const receipts = new Map<string, { payload: unknown; resultId: number }>();
  let committedEffects = 0;
  const send = vi.fn(async (saved: typeof intent) => {
    expect([...records.values()].some(raw => JSON.parse(raw).key === saved.key)).toBe(true);
    const receipt = receipts.get(saved.key);
    if (receipt) {
      expect(saved.exactPayload).toEqual(receipt.payload);
      return receipt.resultId;
    }
    receipts.set(saved.key, { payload: JSON.parse(JSON.stringify(saved.exactPayload)), resultId: 7 });
    committedEffects++;
    throw new Error('committed, response lost');
  });
  await expect(send(intent)).rejects.toThrow('committed, response lost');
  expect(committedEffects).toBe(1);
  payload.title = 'Edited after sending';
  payload.photos[0].uri = 'durable/later.jpg';
  const restarted = open();
  const restored = await restarted.load();
  expect(restored).toMatchObject({ key: intent.key, exactPayload: frozen, createdAt: intent.createdAt });
  await expect(restarted.clear(intent.key)).rejects.toThrow();
  expect(await restarted.acquire({ title: 'New form values' })).toEqual(restored);
  const resultId = await send(restored!);
  expect(committedEffects).toBe(1);
  expect(send).toHaveBeenCalledTimes(2);
  await restarted.settle(intent.key, resultId);
  expect(await open().load()).toMatchObject({ key: intent.key, exactPayload: frozen, resultId: 7 });
  await open().clear(intent.key);
  expect(await open().load()).toBeNull();
});

it('never loads account A for account B or dispatches a captured pitch after switching accounts', async () => {
  const { open, storage, lock } = fixture();
  // Pitch acquisitions now require a role so the pitch reader can accept them.
  const intent = await open(pitch, 'A').acquire({ headline: 'Account A', role: 'EXPLORER' });
  expect(await open(pitch, 'B').load()).toBeNull();
  const accountB = await open(pitch, 'B').acquire({ headline: 'Account B', role: 'EXPLORER' });
  expect(accountB.key).not.toBe(intent.key);
  const fetchImpl = vi.fn(async () => new Response('{"id":7}', {
    status: 201, headers: { 'content-type': 'application/json' },
  }));
  configureApi({ baseURL: environment, getToken: () => 'account-B-token', fetchImpl });
  const pitchStore = createPendingPitchStore(storage, lock, pitchIntentScope(environment, 'A'));
  await expect(sendPendingPitch(pitchStore, { ...intent, roleAtSubmission: 'EXPLORER' }, () => false))
    .rejects.toThrow('account changed');
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await open(pitch, 'A').load()).toEqual(intent);
  expect(await open(pitch, 'B').load()).toEqual(accountB);
});

it('isolates two operations belonging to the same environment and account', async () => {
  const { open } = fixture();
  // Pitch acquisitions now require a role so the pitch reader can accept them.
  const pitchIntent = await open(pitch).acquire({ headline: 'Pitch', role: 'EXPLORER' });
  expect(await open(marketplace).load()).toBeNull();
  const listingIntent = await open(marketplace).acquire({ title: 'Listing' });
  expect(listingIntent.key).not.toBe(pitchIntent.key);
  expect(await open(pitch).load()).toEqual(pitchIntent);
  expect(await open(marketplace).load()).toEqual(listingIntent);
  await open(marketplace).settle(listingIntent.key, 8);
  await open(marketplace).clear(listingIntent.key);
  expect(await open(pitch).load()).toEqual(pitchIntent);
});

it('isolates environments even when the account and operation match', async () => {
  const { open } = fixture();
  const intent = await open().acquire({ title: 'Production' });
  const staging = open(marketplace, 'A', 'https://staging.test/api/v1');
  expect(await staging.load()).toBeNull();
  const other = await staging.acquire({ title: 'Staging' });
  expect(other.key).not.toBe(intent.key);
  expect(await open().load()).toEqual(intent);
});

it('allows only one persisted winner for concurrent acquisitions across store instances', async () => {
  const { open, newKey, storage } = fixture();
  const contenders = [{ title: 'First' }, { title: 'Second' }];
  const [one, two] = await Promise.all(contenders.map(payload => open().acquire(payload)));
  expect(one).toEqual(two);
  expect(contenders).toContainEqual(one.exactPayload);
  expect(newKey).toHaveBeenCalledTimes(1);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(await open().load()).toEqual(one);
});

it('recovers corrupt general-intent JSON as empty and allows a fresh acquisition', async () => {
  const { open, records, storage } = fixture();
  const original = await open().acquire({ title: 'Before corruption' });
  const scope = storage.setItem.mock.calls[0][0];
  records.set(scope, '{broken');
  await expect(open().load()).resolves.toBeNull();
  await expect(open().load()).resolves.toBeNull();
  const fresh = await open().acquire({ title: 'After recovery' });
  expect(fresh.key).not.toBe(original.key);
  expect(await open().load()).toEqual(fresh);
});

it('loads the exact legacy v1 pitch format through both general and existing pitch paths', async () => {
  const { records, storage, lock, open } = fixture();
  const legacy = {
    version: 1,
    key: '165416cf-c485-4aad-8914-d7580f831843',
    exactPayload: { headline: 'Saved before upgrade', availability_days: ['2026-11-07'] },
    roleAtSubmission: 'OTHER_STAFF',
    createdAt: '2026-11-07T12:00:00.000Z',
  };
  const scope = pitchIntentScope(environment, 1);
  const raw = JSON.stringify(legacy);
  records.set(scope, raw);
  const general = open(pitch, 1);
  const existing = createPendingPitchStore(storage, lock, scope);
  expect(await existing.read()).toEqual(legacy);
  expect(await general.load()).toEqual(legacy);
  expect(await open(pitch, '1').load()).toEqual(legacy);
  expect(await general.acquire({ headline: 'Changed since upgrade' })).toEqual(legacy);
  expect(records.get(scope)).toBe(raw);
  await existing.acknowledge(legacy.key, 7);
  expect(await general.load()).toMatchObject({ ...legacy, acknowledged: true, resultId: 7 });
  await existing.resolve(legacy.key);
  expect(await general.load()).toBeNull();
});

it('refuses settlement or clearing with a different key and retains the frozen intent', async () => {
  const { open } = fixture();
  const store = open();
  const intent = await store.acquire({ title: 'Original' });
  const otherKey = '165416cf-c485-4aad-8914-d7580f831843';
  await expect(store.settle(otherKey, 7)).rejects.toThrow();
  await expect(store.clear(otherKey)).rejects.toThrow();
  expect(await open().load()).toEqual(intent);
  await store.settle(intent.key, 7);
  await expect(store.clear(otherKey)).rejects.toThrow();
  expect(await open().load()).toMatchObject({ key: intent.key, exactPayload: intent.exactPayload, resultId: 7 });
});
