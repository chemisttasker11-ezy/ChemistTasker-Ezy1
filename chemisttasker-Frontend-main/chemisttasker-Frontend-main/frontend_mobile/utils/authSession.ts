import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureGet, secureRemove, secureSet } from './secureStorage';

type StoredUserSession = {
  access?: string | null;
  refresh?: string | null;
  tokens?: {
    access?: string | null;
    refresh?: string | null;
  };
  user?: unknown;
};

const ACCESS_STORAGE_KEY = 'ACCESS_KEY';
const REFRESH_STORAGE_KEY = 'REFRESH_KEY';
const USER_STORAGE_KEY = 'AUTH_USER';
const LEGACY_SESSION_STORAGE_KEY = 'user';
const TOKEN_REFRESH_PATH = '/users/token/refresh/';

let refreshPromise: Promise<string | null> | null = null;
let inMemorySession: StoredUserSession | null = null;
let legacyMigrationPromise: Promise<StoredUserSession | null> | null = null;

function normalizeToken(value: unknown): string | null {
  return typeof value === 'string' && value && value !== 'cookie-session' ? value : null;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }
  const bufferCtor = (globalThis as any).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(padded, 'base64').toString('utf-8');
  }
  throw new Error('Base64 decoder unavailable');
}

function isJwtExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return true;
    }
    const parsed = JSON.parse(decodeBase64Url(payload));
    const exp = typeof parsed?.exp === 'number' ? parsed.exp : null;
    if (!exp) {
      return false;
    }
    return exp <= Math.floor(Date.now() / 1000) + 30;
  } catch {
    return true;
  }
}

async function readLegacyAsyncSession(): Promise<StoredUserSession | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as StoredUserSession;
  } catch {
    return null;
  }
}

async function readStoredUser(): Promise<unknown | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function persistStoredUser(user: unknown): Promise<void> {
  if (user) {
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    await AsyncStorage.removeItem(USER_STORAGE_KEY).catch(() => null);
  }
}

async function removeLegacyAsyncSession(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_SESSION_STORAGE_KEY).catch(() => null);
}

async function persistSecureTokens(access: string | null, refresh: string | null): Promise<void> {
  if (access) {
    await secureSet(ACCESS_STORAGE_KEY, access);
  } else {
    await secureRemove(ACCESS_STORAGE_KEY).catch(() => null);
  }

  if (refresh) {
    await secureSet(REFRESH_STORAGE_KEY, refresh);
  } else {
    await secureRemove(REFRESH_STORAGE_KEY).catch(() => null);
  }
}

async function migrateLegacySessionIfNeeded(): Promise<StoredUserSession | null> {
  if (legacyMigrationPromise) {
    return legacyMigrationPromise;
  }

  legacyMigrationPromise = (async () => {
    const [storedAccess, storedRefresh] = await Promise.all([
      secureGet(ACCESS_STORAGE_KEY),
      secureGet(REFRESH_STORAGE_KEY),
    ]);
    const existingAccess = normalizeToken(storedAccess);
    const existingRefresh = normalizeToken(storedRefresh);

    if (existingAccess || existingRefresh) {
      const storedUser = await readStoredUser();
      return {
        access: existingAccess,
        refresh: existingRefresh,
        tokens: { access: existingAccess, refresh: existingRefresh },
        user: storedUser,
      };
    }

    const legacySession = await readLegacyAsyncSession();
    const legacyAccess = normalizeToken(legacySession?.access ?? legacySession?.tokens?.access);
    const legacyRefresh = normalizeToken(legacySession?.refresh ?? legacySession?.tokens?.refresh);

    if (!legacyAccess && !legacyRefresh) {
      await removeLegacyAsyncSession();
      return null;
    }

    await persistSecureTokens(legacyAccess, legacyRefresh);
    await persistStoredUser(legacySession?.user ?? null);
    await removeLegacyAsyncSession();

    return {
      access: legacyAccess,
      refresh: legacyRefresh,
      tokens: { access: legacyAccess, refresh: legacyRefresh },
      user: legacySession?.user ?? null,
    };
  })().finally(() => {
    legacyMigrationPromise = null;
  });

  return legacyMigrationPromise;
}

export async function readStoredSession(): Promise<StoredUserSession | null> {
  if (inMemorySession) {
    return inMemorySession;
  }

  const migrated = await migrateLegacySessionIfNeeded();
  if (migrated) {
    inMemorySession = migrated;
    return migrated;
  }

  const [storedAccess, storedRefresh, storedUser] = await Promise.all([
    secureGet(ACCESS_STORAGE_KEY),
    secureGet(REFRESH_STORAGE_KEY),
    readStoredUser(),
  ]);
  const access = normalizeToken(storedAccess);
  const refresh = normalizeToken(storedRefresh);

  if (!access && !refresh) {
    return null;
  }

  inMemorySession = {
    access,
    refresh,
    tokens: { access, refresh },
    user: storedUser,
  };
  return inMemorySession;
}

export async function writeStoredSession(next: StoredUserSession): Promise<void> {
  const current = (await readStoredSession()) || {};
  const access = normalizeToken(next.access ?? next.tokens?.access ?? current.access ?? current.tokens?.access);
  const refresh = normalizeToken(next.refresh ?? next.tokens?.refresh ?? current.refresh ?? current.tokens?.refresh);
  const merged: StoredUserSession = {
    ...current,
    ...next,
    access,
    refresh,
    tokens: { access, refresh },
    user: next.user ?? current.user ?? null,
  };

  inMemorySession = merged;
  await persistSecureTokens(access, refresh);
  await persistStoredUser(merged.user ?? null);
  await removeLegacyAsyncSession();
}

export async function clearStoredSession(): Promise<void> {
  inMemorySession = null;
  await Promise.all([
    secureRemove(ACCESS_STORAGE_KEY).catch(() => null),
    secureRemove(REFRESH_STORAGE_KEY).catch(() => null),
    AsyncStorage.removeItem(USER_STORAGE_KEY).catch(() => null),
    removeLegacyAsyncSession(),
  ]);
}

export async function refreshAccessToken(baseURL: string): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const session = await readStoredSession();
    const refresh = normalizeToken(session?.refresh ?? session?.tokens?.refresh);
    if (!refresh) {
      return null;
    }

    try {
      const response = await fetch(`${baseURL}${TOKEN_REFRESH_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });

      if (response.status === 400 || response.status === 401) {
        await clearStoredSession();
        return null;
      }

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const data = await response.json().catch(() => ({}));
      const nextAccess = normalizeToken(data.access);
      const nextRefresh = normalizeToken(data.refresh) ?? refresh;
      if (!nextAccess) {
        throw new Error('Refresh response missing access token');
      }

      await writeStoredSession({
        access: nextAccess,
        refresh: nextRefresh,
      });

      return nextAccess;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function getValidAccessToken(baseURL: string): Promise<string | null> {
  const session = inMemorySession || (await readStoredSession());
  const access = normalizeToken(session?.access ?? session?.tokens?.access);
  if (access && !isJwtExpired(access)) {
    return access;
  }
  return refreshAccessToken(baseURL);
}

export function primeInMemorySession(session: StoredUserSession | null): void {
  inMemorySession = session;
}
