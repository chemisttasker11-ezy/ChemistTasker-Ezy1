/**
 * REPLAY-t1 (carried from task 0, D104): the pending-intent store behind every keyed replay
 * (Idempotency-Key header; marketplace receipts LISTING_UPDATE / LISTING_AUDIENCE / LISTING_SUBMIT /
 * IMAGE_UPLOAD). A storage READ that fails is not corruption: recovery must keep the record and
 * report a retryable error. General intents use neutral wording; the chosen save-check text is
 * 'Your pending change could not be saved safely. Please retry.' (pitches keep "pending pitch").
 */
import { expect, it } from 'vitest';
import { createPendingIntentStore, createPendingPitchStore, pitchIntentScope } from './pendingPitch';

const key = '165416cf-c485-4aad-8914-d7580f831843';
const NEUTRAL_SAVE_ERROR = 'Your pending change could not be saved safely. Please retry.';

function fixture() {
  const records = new Map<string, string>();
  let failReads = 0;
  let dropWrites = false;
  const storage = {
    getItem: async (name: string) => {
      if (failReads > 0) { failReads -= 1; throw new Error('EIO: storage read failed'); }
      return records.get(name) ?? null;
    },
    setItem: async (name: string, value: string) => { if (!dropWrites) records.set(name, value); },
    removeItem: async (name: string) => { records.delete(name); },
  };
  const lock = async <T,>(_name: string, run: () => Promise<T>) => run();
  return { records, storage, lock, failNextReads: (n: number) => { failReads = n; }, dropWrites: () => { dropWrites = true; } };
}

it('a failed read during recovery keeps a valid general intent and reports a retryable error', async () => {
  const { records, storage, lock, failNextReads } = fixture();
  const store = createPendingIntentStore({ storage, lock, environment: 'test', userId: 'A', operation: 'marketplace.listing.update', newKey: () => key });
  await store.acquire({ title: 'Frozen' });
  const saved = records.get(store.scope);
  failNextReads(1);
  const error = await store.recoverCorruptAfterReview().catch(e => e);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toMatch(/try again|retry/i);
  expect(records.get(store.scope)).toBe(saved);
  expect((await store.load())?.exactPayload).toEqual({ title: 'Frozen' });
});

it('a failed read during recovery keeps a valid pitch record', async () => {
  const { records, storage, lock, failNextReads } = fixture();
  const scope = pitchIntentScope('test', 'A');
  const store = createPendingPitchStore(storage, lock, scope, () => key);
  await store.acquire({ headline: 'Original' }, 'EXPLORER');
  const saved = records.get(scope);
  failNextReads(1);
  const error = await store.recoverCorruptAfterReview().catch(e => e);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toMatch(/try again|retry/i);
  expect(records.get(scope)).toBe(saved);
});

it('corrupt bytes are still recoverable after review (positive control)', async () => {
  const { records, storage, lock } = fixture();
  const store = createPendingIntentStore({ storage, lock, environment: 'test', userId: 'A', operation: 'marketplace.listing.update', newKey: () => key });
  records.set(store.scope, '{broken');
  await store.recoverCorruptAfterReview();
  expect(records.has(store.scope)).toBe(false);
});

it('a general intent that cannot be saved safely uses neutral wording', async () => {
  const { storage, lock, dropWrites } = fixture();
  const store = createPendingIntentStore({ storage, lock, environment: 'test', userId: 'A', operation: 'marketplace.image.upload', newKey: () => key });
  dropWrites();
  const error = await store.acquire({ photo: 'p1' }).catch(e => e);
  expect(error.message).toBe(NEUTRAL_SAVE_ERROR);
});

it('a pitch that cannot be saved safely keeps its pitch wording (positive control)', async () => {
  const { storage, lock, dropWrites } = fixture();
  const store = createPendingPitchStore(storage, lock, pitchIntentScope('test', 'A'), () => key);
  dropWrites();
  await expect(store.acquire({ headline: 'x' }, 'EXPLORER')).rejects.toThrow('Your pending pitch could not be saved safely. Please retry.');
});
