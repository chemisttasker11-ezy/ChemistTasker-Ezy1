import { expect, it, vi } from 'vitest';
import { createPendingIntentStore, createPendingPitchStore } from './pendingPitch';

const key = '165416cf-c485-4aad-8914-d7580f831843';
function fixture(operation = 'marketplace.listing.create') {
  const records = new Map<string, string>();
  const storage = {
    getItem: async (name: string) => records.get(name) ?? null,
    setItem: vi.fn(async (name: string, value: string) => { records.set(name, value); }),
    removeItem: async (name: string) => { records.delete(name); },
  };
  const lock = async <T,>(_name: string, run: () => Promise<T>) => run();
  const store = createPendingIntentStore({ storage, lock, environment: 'test', userId: 'A', operation, newKey: () => key });
  return { records, storage, lock, store };
}

it('refuses corrupt pitch data without overwriting its bytes', async () => {
  const { records, store } = fixture('talent.pitch.create');
  records.set(store.scope, '{broken');
  const load = await store.load().catch(e => e);
  const acquire = await store.acquire({ headline: 'Replacement' }).catch(e => e);
  expect(load).toBeInstanceOf(Error);
  expect(load.message).toContain('Recover your pending pitch');
  expect(acquire.message).toContain('Recover your pending pitch');
  expect(records.get(store.scope)).toBe('{broken');
});

it('rejects records the pitch reader rejects', async () => {
  const { records, storage, lock, store } = fixture('talent.pitch.create');
  records.set(store.scope, JSON.stringify({ version: 1, key, exactPayload: {}, roleAtSubmission: 'EXPLORER',
    createdAt: '2026-11-07T12:00:00.000Z', acknowledged: true }));
  await expect(createPendingPitchStore(storage, lock, store.scope).read()).rejects.toThrow('Recover your pending pitch');
  await expect(store.load()).rejects.toThrow('Recover your pending pitch');
});

it('returns a deep copy of the acquired payload', async () => {
  const { store } = fixture();
  const payload = { nested: { title: 'Original' } };
  const intent = await store.acquire(payload);
  expect(intent.exactPayload).not.toBe(payload);
  expect(intent.exactPayload.nested).not.toBe(payload.nested);
  payload.nested.title = 'Changed';
  expect(intent.exactPayload).toEqual({ nested: { title: 'Original' } });
});

it('rejects a write that cannot be read back unchanged', async () => {
  const { store, storage } = fixture();
  storage.setItem.mockImplementationOnce(async () => {});
  await expect(store.acquire({ title: 'Unsaved' })).rejects.toThrow('could not be saved safely');
});

it.each([-1, 0, 1.5, NaN])('rejects invalid result ID %s asynchronously', async id => {
  const { store } = fixture();
  const intent = await store.acquire({ title: 'Original' });
  await expect(store.settle(intent.key, id)).rejects.toThrow('Invalid result ID.');
  expect(await store.load()).toEqual(intent);
});

it('preserves pending pitch error messages', async () => {
  const { storage, lock, store } = fixture('talent.pitch.create');
  const pitch = createPendingPitchStore(storage, lock, store.scope, () => key);
  const intent = await pitch.acquire({}, 'EXPLORER');
  await expect(pitch.reject('wrong')).rejects.toThrow('The pending pitch changed. Reopen it to continue.');
  await expect(pitch.resolve(intent.key)).rejects.toThrow('Review the pending pitch before starting another one.');
});


it('rejects a role-less pitch acquisition without writing storage', async () => {
  const { records, storage, store } = fixture('talent.pitch.create');
  await expect(store.acquire({ headline: 'Missing role' })).rejects.toThrow('pending pitch');
  expect(records.size).toBe(0);
  expect(storage.setItem).not.toHaveBeenCalled();
});


it('rejects an invalid pitch update without changing storage', async () => {
  const { records, storage, lock, store } = fixture('talent.pitch.create');
  const pitch = createPendingPitchStore(storage, lock, store.scope, () => key);
  const intent = await pitch.acquire({}, 'EXPLORER');
  const saved = records.get(store.scope);
  await expect(pitch.acknowledge(intent.key, -1)).rejects.toThrow('pending pitch');
  expect(records.get(store.scope)).toBe(saved);
});


it('persists general pitch acquisitions and settlements the pitch reader accepts', async () => {
  const { storage, lock, store } = fixture('talent.pitch.create');
  const intent = await store.acquire({ headline: 'Pitch', role: 'EXPLORER' });
  const pitch = createPendingPitchStore(storage, lock, store.scope);
  expect(await pitch.read()).toMatchObject({ ...intent, roleAtSubmission: 'EXPLORER' });
  await store.settle(intent.key, 7);
  expect(await pitch.read()).toMatchObject({ ...intent, resultId: 7 });
});
