import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
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

export const mobilePendingIntentStore = (environment: string, userId: string | number, operation: string) => {
  const store = createPendingIntentStore({ storage: AsyncStorage, lock, environment, userId, operation, newKey: idempotencyKey });
  return {
    ...store,
    saveRecovery: (key: string, resultId: number, pendingEdit: Record<string, unknown> | null) => lock(store.scope, async () => {
      const intent = await store.load();
      if (!intent || intent.key !== key) throw new Error('The pending intent changed.');
      const raw = JSON.stringify({ ...intent, resultId, recovery: true, pendingEdit });
      await AsyncStorage.setItem(store.scope, raw);
      if (await AsyncStorage.getItem(store.scope) !== raw) throw new Error('Your pending change could not be saved safely. Please retry.');
    }),
    reject: (key: string) => lock(store.scope, async () => {
      const intent = await store.load();
      if (!intent || intent.key !== key || intent.resultId) throw new Error('The pending intent changed.');
      await AsyncStorage.setItem(store.scope, JSON.stringify({ ...intent, rejected: true }));
    }),
    clear: async (key: string) => {
      const intent = await store.load() as (Awaited<ReturnType<typeof store.load>> & { rejected?: boolean });
      if (!intent?.rejected) return store.clear(key);
      return lock(store.scope, async () => {
        const current = await store.load() as (Awaited<ReturnType<typeof store.load>> & { rejected?: boolean });
        if (!current || current.key !== key || !current.rejected) throw new Error('The pending intent changed.');
        await AsyncStorage.removeItem(store.scope);
      });
    },
  };
};

export const isTerminalIntentError = (error: any) => {
  const status = error?.status ?? error?.response?.status;
  const code = (error?.payload ?? error?.response?.data ?? error?.data)?.code;
  return status === 403 || status === 404 || status === 409 || status === 410 || (status === 400 && code !== 'IDEMPOTENCY_KEY_REQUIRED');
};

export function confirmCorruptIntentReview(kind: string, onConfirm: () => void) {
  Alert.alert(`Review your ${kind}`, `Review your ${kind} first, then confirm to clear the unreadable saved request.`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: onConfirm },
  ]);
}
