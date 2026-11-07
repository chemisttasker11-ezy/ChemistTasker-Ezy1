import { createExplorerPost } from './api';

/** Persist before dispatch; only explicit reconciliation may release a consumed intent. */
export type PendingPitch = {
  version: 1;
  key: string;
  exactPayload: Record<string, unknown>;
  roleAtSubmission: string;
  createdAt: string;
  resultId?: number;
  acknowledged?: boolean;
  rejected?: boolean;
  terminalCode?: 'IDEMPOTENCY_PAYLOAD_MISMATCH' | 'PITCH_DELETED' | 'IDEMPOTENCY_REPLAY_EXPIRED';
};

export type PitchIntentStorage = {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
};
export type PitchIntentLock = <T>(name: string, run: () => Promise<T>) => Promise<T>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pitchIntentScope(environment: string, userId: string | number): string {
  return `talent.pitch.create:v1:${JSON.stringify([environment, String(userId)])}`;
}

export function createPendingPitchStore(storage: PitchIntentStorage, lock: PitchIntentLock, scope: string,
  newKey = () => globalThis.crypto.randomUUID()) {
  async function read(): Promise<PendingPitch | null> {
    const raw = await storage.getItem(scope);
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw) as PendingPitch;
      if (!value || value.version !== 1 || !uuid.test(value.key) || !value.exactPayload ||
          typeof value.exactPayload !== 'object' || Array.isArray(value.exactPayload) ||
          typeof value.roleAtSubmission !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
          (value.resultId !== undefined && (!Number.isSafeInteger(value.resultId) || value.resultId <= 0)) ||
          (value.acknowledged !== undefined && typeof value.acknowledged !== 'boolean') ||
          (value.rejected !== undefined && typeof value.rejected !== 'boolean') ||
          (value.acknowledged && !value.resultId) ||
          (value.terminalCode !== undefined && !['IDEMPOTENCY_PAYLOAD_MISMATCH', 'PITCH_DELETED', 'IDEMPOTENCY_REPLAY_EXPIRED'].includes(value.terminalCode))) {
        throw new Error();
      }
      return value;
    } catch {
      throw new Error('Recover your pending pitch by reviewing your saved pitches. Browser storage could not be read safely.');
    }
  }
  async function write(intent: PendingPitch): Promise<PendingPitch> {
    const raw = JSON.stringify(intent);
    await storage.setItem(scope, raw);
    if (await storage.getItem(scope) !== raw) throw new Error('Your pending pitch could not be saved safely. Please retry.');
    return JSON.parse(raw) as PendingPitch;
  }
  async function update(key: string, changes: Partial<PendingPitch>) {
    return lock(scope, async () => {
      const intent = await read();
      if (!intent || intent.key !== key) throw new Error('The pending pitch changed. Reopen your pitch to continue.');
      return write({ ...intent, ...changes });
    });
  }
  return {
    scope, read,
    acquire: (exactPayload: Record<string, unknown>, roleAtSubmission: string) => lock(scope, async () =>
      (await read()) ?? write({ version: 1, key: newKey(), exactPayload, roleAtSubmission, createdAt: new Date().toISOString() })),
    acknowledge: (key: string, resultId: number) => update(key, { resultId, acknowledged: true }),
    reject: (key: string) => update(key, { rejected: true }),
    reconcile: (key: string, terminalCode: NonNullable<PendingPitch['terminalCode']>, resultId?: number) =>
      update(key, { terminalCode, resultId }),
    resolve: (key: string) => lock(scope, async () => {
      const intent = await read();
      if (!intent || intent.key !== key || (!intent.acknowledged && !intent.terminalCode && !intent.rejected)) {
        throw new Error('Review the pending pitch before starting another one.');
      }
      await storage.removeItem(scope);
    }),
    recoverCorruptAfterReview: () => lock(scope, async () => {
      // The caller must ask the person to reconcile saved pitches first.
      let corrupt = false;
      try { await read(); } catch { corrupt = true; }
      if (!corrupt) throw new Error('Resolve the saved pending pitch before clearing it.');
      await storage.removeItem(scope);
    }),
  };
}

/** Web Locks cover tabs/processes. Browsers without them fail closed before POST. */
export function createBrowserPendingPitchStore(environment: string, userId: string | number) {
  return createPendingPitchStore({
    getItem: async (name) => window.localStorage.getItem(name),
    setItem: async (name, value) => window.localStorage.setItem(name, value),
    removeItem: async (name) => window.localStorage.removeItem(name),
  }, async (name, run) => {
    if (!navigator.locks) throw new Error('Update your browser to safely save and retry a pitch.');
    return navigator.locks.request(name, run);
  }, pitchIntentScope(environment, userId));
}

export async function sendPendingPitch(store: ReturnType<typeof createPendingPitchStore>, intent: PendingPitch,
  isCurrentAccount: () => boolean, signal?: AbortSignal): Promise<number> {
  const assertAccount = () => {
    if (!isCurrentAccount()) throw new Error('Your account changed. Reopen your pitch to continue.');
  };
  assertAccount();
  if (intent.terminalCode || intent.rejected) throw new Error('Review the original pitch before continuing.');
  if (intent.acknowledged && intent.resultId) return intent.resultId;
  let result;
  try {
    result = await createExplorerPost(intent.exactPayload, intent.key, signal);
  } catch (error: any) {
    if (isCurrentAccount() && error?.status === 400 && error?.payload?.code !== 'IDEMPOTENCY_KEY_REQUIRED') {
      await store.reject(intent.key);
    } else if (isCurrentAccount() && ['IDEMPOTENCY_PAYLOAD_MISMATCH', 'PITCH_DELETED', 'IDEMPOTENCY_REPLAY_EXPIRED'].includes(error?.payload?.code)) {
      await store.reconcile(intent.key, error.payload.code, error.payload.post_id);
    }
    throw error;
  }
  assertAccount();
  await store.acknowledge(intent.key, result.id);
  assertAccount();
  return result.id;
}
