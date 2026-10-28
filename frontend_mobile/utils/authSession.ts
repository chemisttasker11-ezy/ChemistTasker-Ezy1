import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { secureGet, secureRemove, secureSet } from './secureStorage';
import { getBrowserCsrfToken } from './browserAuth';

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
let sessionGeneration = 0;
let storageWrite: Promise<void> = Promise.resolve();

export function getSessionGeneration(): number {
  return sessionGeneration;
}

export function invalidateSessionGeneration(): number {
  refreshPromise = null;
  return ++sessionGeneration;
}

function normalizeToken(value: unknown): string | null {
  return typeof value === 'string' && value && value !== 'cookie-session' ? value : null;
}

function normalizeRefreshToken(value: unknown): string | null {
  return Platform.OS === 'web' ? null : normalizeToken(value);
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

  const generation = sessionGeneration;
  legacyMigrationPromise = (async () => {
    const [storedAccess, storedRefresh] = await Promise.all([
      secureGet(ACCESS_STORAGE_KEY),
      secureGet(REFRESH_STORAGE_KEY),
    ]);
    const existingAccess = normalizeToken(storedAccess);
    const existingRefresh = normalizeRefreshToken(storedRefresh);
    if (Platform.OS === 'web' && storedRefresh) {
      await secureRemove(REFRESH_STORAGE_KEY).catch(() => null);
    }

    if (existingAccess || existingRefresh) {
      if (Platform.OS === 'web') {
        await removeLegacyAsyncSession();
      }
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
    const legacyRefresh = normalizeRefreshToken(legacySession?.refresh ?? legacySession?.tokens?.refresh);

    if (!legacyAccess && !legacyRefresh) {
      await removeLegacyAsyncSession();
      return null;
    }

    storageWrite = storageWrite.catch(() => undefined).then(async () => {
      if (generation !== sessionGeneration) return;
      await persistSecureTokens(legacyAccess, legacyRefresh);
      await persistStoredUser(legacySession?.user ?? null);
      await removeLegacyAsyncSession();
    });
    await storageWrite;
    if (generation !== sessionGeneration) return null;

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
  const generation = sessionGeneration;
  await storageWrite.catch(() => undefined);
  if (generation !== sessionGeneration) return inMemorySession;
  if (inMemorySession) {
    return inMemorySession;
  }

  const migrated = await migrateLegacySessionIfNeeded();
  if (generation !== sessionGeneration) return inMemorySession;
  if (migrated) {
    inMemorySession = migrated;
    return migrated;
  }

  const [storedAccess, storedRefresh, storedUser] = await Promise.all([
    secureGet(ACCESS_STORAGE_KEY),
    secureGet(REFRESH_STORAGE_KEY),
    readStoredUser(),
  ]);
  if (generation !== sessionGeneration) return inMemorySession;
  const access = normalizeToken(storedAccess);
  const refresh = normalizeRefreshToken(storedRefresh);

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

export async function writeStoredSession(next: StoredUserSession, generation = sessionGeneration): Promise<boolean> {
  const current = (await readStoredSession()) || {};
  if (generation !== sessionGeneration) return false;
  const access = normalizeToken(next.access ?? next.tokens?.access ?? current.access ?? current.tokens?.access);
  const refresh = normalizeRefreshToken(next.refresh ?? next.tokens?.refresh ?? current.refresh ?? current.tokens?.refresh);
  const merged: StoredUserSession = {
    ...current,
    ...next,
    access,
    refresh,
    tokens: { access, refresh },
    user: next.user ?? current.user ?? null,
  };

  inMemorySession = merged;
  storageWrite = storageWrite.catch(() => undefined).then(async () => {
    if (generation !== sessionGeneration) return;
    await persistSecureTokens(access, refresh);
    await persistStoredUser(merged.user ?? null);
    await removeLegacyAsyncSession();
  });
  await storageWrite;
  return generation === sessionGeneration;
}

export async function clearStoredSession(): Promise<void> {
  invalidateSessionGeneration();
  inMemorySession = null;
  storageWrite = storageWrite.catch(() => undefined).then(async () => {
    await Promise.all([
      secureRemove(ACCESS_STORAGE_KEY).catch(() => null),
      secureRemove(REFRESH_STORAGE_KEY).catch(() => null),
      AsyncStorage.removeItem(USER_STORAGE_KEY).catch(() => null),
      removeLegacyAsyncSession(),
    ]);
  });
  await storageWrite;
}

export async function refreshAccessToken(baseURL: string): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const generation = sessionGeneration;
  refreshPromise = (async () => {
    try {
      const session = await readStoredSession();
      if (generation !== sessionGeneration) return null;
      const refresh = normalizeRefreshToken(session?.refresh ?? session?.tokens?.refresh);
      if (Platform.OS !== 'web' && !refresh) {
        return null;
      }
      const isWeb = Platform.OS === 'web';
      const response = await fetch(`${baseURL}${TOKEN_REFRESH_PATH}`, {
        method: 'POST',
        credentials: isWeb ? 'include' : 'omit',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': isWeb ? 'web' : 'mobile',
          ...(isWeb ? { 'X-CSRFToken': await getBrowserCsrfToken(baseURL) } : {}),
        },
        body: JSON.stringify(isWeb ? {} : { refresh }),
      });
      if (generation !== sessionGeneration) return null;

      if (response.status === 400 || response.status === 401) {
        await clearStoredSession();
        return null;
      }

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const data = await response.json().catch(() => ({}));
      if (generation !== sessionGeneration) return null;
      const nextAccess = normalizeToken(data.access);
      const nextRefresh = normalizeRefreshToken(data.refresh) ?? refresh;
      if (!nextAccess) {
        throw new Error('Refresh response missing access token');
      }

      const saved = await writeStoredSession({
        access: nextAccess,
        refresh: nextRefresh,
      }, generation);

      return saved ? nextAccess : null;
    } catch {
      return null;
    } finally {
      if (generation === sessionGeneration) refreshPromise = null;
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
