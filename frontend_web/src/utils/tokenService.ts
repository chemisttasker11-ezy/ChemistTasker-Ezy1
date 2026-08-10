// src/utils/tokenService.ts
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';

export const AUTH_TOKENS_CLEARED_EVENT = 'auth:tokens-cleared';
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<{ access: string; refresh: string } | null> | null = null;
let authStorage: Storage = localStorage;

const ACCESS_KEY = 'ct_access';
const REFRESH_KEY = 'ct_refresh';
const STORAGE_MODE_KEY = 'ct_auth_storage';

function resolveAuthStorage(): Storage {
  return localStorage.getItem(STORAGE_MODE_KEY) === 'session' ? sessionStorage : localStorage;
}

const decodeJwtPayload = (token: string): { exp?: number } | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export function isTokenExpired(token: string, leewaySeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  const expiresAtMs = payload.exp * 1000;
  return Date.now() + leewaySeconds * 1000 >= expiresAtMs;
}

export async function restoreTokensFromStorage(): Promise<void> {
  authStorage = resolveAuthStorage();
  const access = authStorage.getItem(ACCESS_KEY);
  const refresh = authStorage.getItem(REFRESH_KEY);
  accessToken = access || null;
  refreshToken = refresh || null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setTokens(access: string, refresh: string, rememberMe?: boolean) {
  if (typeof rememberMe === 'boolean') {
    authStorage = rememberMe ? localStorage : sessionStorage;
    localStorage.setItem(STORAGE_MODE_KEY, rememberMe ? 'local' : 'session');
  } else {
    authStorage = resolveAuthStorage();
  }
  accessToken = access;
  refreshToken = refresh;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  authStorage.setItem(ACCESS_KEY, access);
  authStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(STORAGE_MODE_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new Event(AUTH_TOKENS_CLEARED_EVENT));
}

// Kept name for backwards compatibility but logic explicitly sends refresh token
export async function refreshCookieSession(force = false): Promise<{ access: string; refresh: string } | null> {
  if (!force && accessToken && !isTokenExpired(accessToken)) {
    return { access: accessToken, refresh: refreshToken ?? '' };
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      if (!refreshToken) {
        clearTokens();
        return null;
      }

      const response = await axios.post(
        `${API_BASE_URL}/users/token/refresh/`,
        { refresh: refreshToken },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const data = response?.data ?? {};
      if (!data.access) {
        clearTokens();
        return null;
      }
      const nextRefresh = data.refresh ?? refreshToken ?? '';
      setTokens(data.access, nextRefresh);
      return { access: data.access, refresh: nextRefresh };
    } catch {
      clearTokens();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function fetchWsTicket(): Promise<string | null> {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const response = await axios.post(
      `${API_BASE_URL}/users/ws-ticket/`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.data?.ticket || null;
  } catch (error) {
    console.error('Failed to fetch WS ticket:', error);
    return null;
  }
}
