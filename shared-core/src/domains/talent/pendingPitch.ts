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

export type PendingIntent = {
  version: 1;
  key: string;
  exactPayload: Record<string, unknown>;
  createdAt: string;
  resultId?: number;
};

function intentStore<T extends PendingIntent>(storage: PitchIntentStorage, lock: PitchIntentLock, scope: string,
  valid: (value: T) => boolean, corrupt: () => T | null, newKey: () => string, kind = 'intent') {
  function isValid(value: T): boolean {
    return !!value && value.version === 1 && uuid.test(value.key) && !!value.exactPayload &&
      typeof value.exactPayload === 'object' && !Array.isArray(value.exactPayload) &&
      Number.isFinite(Date.parse(value.createdAt)) &&
      (value.resultId === undefined || (Number.isSafeInteger(value.resultId) && value.resultId > 0)) && valid(value);
  }
  async function read(): Promise<T | null> {
    const raw = await storage.getItem(scope);
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw) as T;
      if (!isValid(value)) throw new Error();
      return value;
    } catch { return corrupt(); }
  }
  async function write(intent: T): Promise<T> {
    const raw = JSON.stringify(intent);
    if (kind === 'pitch' && !isValid(JSON.parse(raw) as T)) return corrupt() as never;
    await storage.setItem(scope, raw);
    if (await storage.getItem(scope) !== raw) throw new Error(`Your pending ${kind === 'pitch' ? 'pitch' : 'change'} could not be saved safely. Please retry.`);
    return JSON.parse(raw) as T;
  }
  async function update(key: string, changes: Partial<T>) {
    return lock(scope, async () => {
      const intent = await read();
      if (!intent || intent.key !== key) throw new Error(`The pending ${kind} changed. Reopen ${kind === 'pitch' ? 'your pitch' : 'it'} to continue.`);
      return write({ ...intent, ...changes });
    });
  }
  return {
    read, update,
    acquire: (exactPayload: Record<string, unknown>, extra: Partial<T> = {}) => lock(scope, async () =>
      (await read()) ?? write({ version: 1, key: newKey(), exactPayload, createdAt: new Date().toISOString(), ...extra } as T)),
    remove: (key: string, allowed: (intent: T) => boolean) => lock(scope, async () => {
      const intent = await read();
      if (!intent || intent.key !== key || !allowed(intent)) throw new Error(`Review the pending ${kind} before starting another one.`);
      await storage.removeItem(scope);
    }),
    recoverCorruptAfterReview: () => lock(scope, async () => {
      // The caller must reconcile saved results first.
      let corrupt = false;
      const raw = await storage.getItem(scope).catch(() => { throw new Error('Storage could not be read. Please retry.'); });
      if (raw !== null) {
        try { const value = JSON.parse(raw) as T; corrupt = !isValid(value); } catch { corrupt = true; }
      }
      if (!corrupt) throw new Error(`Resolve the saved pending ${kind} before clearing it.`);
      await storage.removeItem(scope);
    }),
  };
}

const validPitch = (value: PendingPitch) => typeof value.roleAtSubmission === 'string' &&
  (value.acknowledged === undefined || typeof value.acknowledged === 'boolean') &&
  (value.rejected === undefined || typeof value.rejected === 'boolean') &&
  (!value.acknowledged || !!value.resultId) &&
  (value.terminalCode === undefined || ['IDEMPOTENCY_PAYLOAD_MISMATCH', 'PITCH_DELETED', 'IDEMPOTENCY_REPLAY_EXPIRED'].includes(value.terminalCode));
const corruptPitch = (): never => { throw new Error('Recover your pending pitch by reviewing your saved pitches. Browser storage could not be read safely.'); };
const corruptIntent = (): never => { throw new Error('Recover your pending intent by reviewing your saved results. Storage could not be read safely.'); };

export function createPendingIntentStore({ storage, lock, environment, userId, operation, newKey = () => globalThis.crypto.randomUUID() }: {
  storage: PitchIntentStorage; lock: PitchIntentLock; environment: string; userId: string | number;
  operation: string; newKey?: () => string;
}) {
  const scope = `${operation}:v1:${JSON.stringify([environment, String(userId)])}`;
  const isPitch = operation === 'talent.pitch.create';
  const store = intentStore<PendingIntent>(storage, lock, scope,
    value => !isPitch || validPitch(value as PendingPitch), isPitch ? corruptPitch : corruptIntent, newKey, isPitch ? 'pitch' : 'intent');
  return {
    scope, load: store.read, recoverCorruptAfterReview: store.recoverCorruptAfterReview,
    acquire: (payload: Record<string, unknown>, roleAtSubmission?: string) => store.acquire(payload, isPitch ? { roleAtSubmission } as Partial<PendingPitch> : {}),
    settle: async (key: string, resultId: number) => {
      if (!Number.isSafeInteger(resultId) || resultId <= 0) throw new Error('Invalid result ID.');
      return store.update(key, { resultId });
    },
    clear: (key: string) => store.remove(key, intent => intent.resultId !== undefined),
  };
}

export function createPendingPitchStore(storage: PitchIntentStorage, lock: PitchIntentLock, scope: string,
  newKey = () => globalThis.crypto.randomUUID()) {
  const store = intentStore<PendingPitch>(storage, lock, scope, validPitch, corruptPitch, newKey, 'pitch');
  return {
    scope, read: store.read,
    acquire: (exactPayload: Record<string, unknown>, roleAtSubmission: string) => store.acquire(exactPayload, { roleAtSubmission }),
    acknowledge: (key: string, resultId: number) => store.update(key, { resultId, acknowledged: true }),
    reject: (key: string) => store.update(key, { rejected: true }),
    reconcile: (key: string, terminalCode: NonNullable<PendingPitch['terminalCode']>, resultId?: number) =>
      store.update(key, { terminalCode, resultId }),
    resolve: (key: string) => store.remove(key, intent => !!(intent.acknowledged || intent.terminalCode || intent.rejected)),
    recoverCorruptAfterReview: store.recoverCorruptAfterReview,
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
      await store.reconcile(intent.key, error.payload.code, error.payload.post_id ?? undefined);
    }
    throw error;
  }
  assertAccount();
  await store.acknowledge(intent.key, result.id);
  assertAccount();
  return result.id;
}
