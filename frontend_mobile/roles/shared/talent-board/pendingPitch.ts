import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPendingPitchStore, createPendingIntentStore, pitchIntentScope, sendPendingPitch, type PendingPitch, type PitchIntentLock } from '@chemisttasker/shared-core';
import { idempotencyKey } from '@/features/parity/utils';

const locks = new Map<string, Promise<void>>();
const lock: PitchIntentLock = async (name, run) => {
  const previous = locks.get(name) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  locks.set(name, next);
  await previous;
  try { return await run(); } finally {
    release();
    if (locks.get(name) === next) locks.delete(name);
  }
};

export const mobilePendingPitchStore = (environment: string, userId: string | number) =>
  createPendingPitchStore(AsyncStorage, lock, pitchIntentScope(environment, userId), () => idempotencyKey() as `${string}-${string}-${string}-${string}-${string}`);

export async function submitPendingPitch(store: ReturnType<typeof mobilePendingPitchStore>, intent: PendingPitch, isCurrent: () => boolean, signal?: AbortSignal) {
  try {
    return await sendPendingPitch(store, intent, isCurrent, signal);
  } catch (error: any) {
    if (!isCurrent()) throw error;
    const detail = error?.payload ?? error?.response?.data ?? error?.data;
    const status = error?.status ?? error?.response?.status;
    const code = detail?.code;
    if ((status === 409 || status === 410) && ['IDEMPOTENCY_PAYLOAD_MISMATCH', 'PITCH_DELETED', 'IDEMPOTENCY_REPLAY_EXPIRED'].includes(code)) {
      const message = code === 'PITCH_DELETED' ? 'This pitch was deleted.' : code === 'IDEMPOTENCY_REPLAY_EXPIRED' ? 'This pitch retry has expired. Review your saved pitches before starting again.' : 'This save key was used for a different pitch. Review your saved pitches before starting again.';
      throw new Error(message);
    }
    throw error;
  }
}

export const mobilePendingIntentStore = (environment: string, userId: string | number, operation: string) =>
  createPendingIntentStore({ storage: AsyncStorage, lock, environment, userId, operation, newKey: idempotencyKey });
