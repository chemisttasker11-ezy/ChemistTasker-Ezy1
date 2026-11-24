import { createLogoutQueue, isSessionRejection } from './logoutQueue';

const SIGNED_OUT = 'ct:signed-out';
const SESSION_VERSION = 'ct:cookie-session-version';
const QUEUE_KEY = 'ct:pending-logout';
const LOCK_NAME = 'chemisttasker-refresh';
let localSignOutOnly = false;
let lockDatabase: Promise<IDBDatabase | null> | undefined;

export function browserSessionIsSignedOut(): boolean {
  try { return localSignOutOnly || (typeof localStorage !== 'undefined' && localStorage.getItem(SIGNED_OUT) === '1'); }
  catch { return localSignOutOnly; }
}

export function markBrowserSessionSignedOut(): void {
  try { localStorage.setItem(SIGNED_OUT, '1'); }
  catch { localSignOutOnly = true; }
}

function openLockDatabase(): Promise<IDBDatabase | null> {
  lockDatabase ??= new Promise(resolve => {
    try {
      const request = indexedDB.open('ct:auth-lock', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('lock');
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return lockDatabase;
}

export async function withBrowserSessionLock<T>(work: (exclusive: boolean) => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks) return locks.request(LOCK_NAME, () => work(true));
  const db = await openLockDatabase();
  if (!db) return work(false);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction('lock', 'readwrite');
    const store = transaction.objectStore('lock');
    let started = false;
    let finished = false;
    transaction.onabort = () => {
      if (!started) void work(false).then(resolve, reject);
      else reject(transaction.error ?? new Error('Browser session lock was lost.'));
    };
    // A readwrite transaction excludes other tabs. Keep it open until the cookie request settles.
    const keepAlive = () => {
      store.get(0).onsuccess = () => {
        if (!started) {
          started = true;
          void work(true).then(resolve, reject).finally(() => { finished = true; });
        }
        if (!finished) keepAlive();
      };
    };
    keepAlive();
  });
}

type CookieLogout = { baseUrl: string; version: string | null; queuedAt?: number };
// Backend SIMPLE_JWT['REFRESH_TOKEN_LIFETIME']: the longest a browser session lives after its last refresh.
const MAX_BROWSER_SESSION_MS = 90 * 24 * 60 * 60 * 1000;

export function createBrowserLogoutQueue(send: (baseUrl: string) => Promise<unknown>) {
  const entries = createLogoutQueue<CookieLogout>({
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: key => localStorage.removeItem(key),
  }, QUEUE_KEY, async ({ baseUrl, version, queuedAt }) => {
    if (Date.now() - (queuedAt ?? 0) > MAX_BROWSER_SESSION_MS) return;
    const current = localStorage.getItem(SESSION_VERSION);
    // After a login with an unknown outcome the cookie may be the old or the new one: revoke whichever it is.
    if (current === version || current?.startsWith('pending:')) await send(baseUrl);
  });
  const currentVersion = () => localStorage.getItem(SESSION_VERSION);

  return {
    signOut: async (baseUrl: string) => {
      markBrowserSessionSignedOut();
      const version = currentVersion();
      return withBrowserSessionLock(async exclusive => {
        // A changed version means a later login: this sign-out has nothing left to revoke.
        if (currentVersion() !== version) return true;
        return entries.enqueue({ baseUrl, version, queuedAt: Date.now() }, exclusive);
      });
    },
    retry: () => withBrowserSessionLock(async exclusive => {
      if (exclusive && browserSessionIsSignedOut()) await entries.retry();
    }),
    login: <Prepared, T>(prepare: () => Promise<Prepared>, request: (prepared: Prepared) => Promise<T>) => {
      if (typeof localStorage === 'undefined') return prepare().then(request);
      return withBrowserSessionLock(exclusive => entries.beforeBrowserLogin(async () => {
        const prepared = await prepare();
        const previous = currentVersion();
        const version = `${Date.now()}:${Math.random()}`;
        // The browser can apply Set-Cookie even if the sign-in response never reaches this code.
        localStorage.setItem(SESSION_VERSION, `pending:${version}`);
        try {
          const result = await request(prepared);
          localStorage.setItem(SESSION_VERSION, version);
          localStorage.removeItem(SIGNED_OUT);
          localSignOutOnly = false;
          return result;
        } catch (error) {
          if (isSessionRejection(error)) {
            if (previous === null) localStorage.removeItem(SESSION_VERSION);
            else localStorage.setItem(SESSION_VERSION, previous);
          }
          throw error;
        }
      }, exclusive));
    },
  };
}
