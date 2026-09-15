import { configureApi, configureStorage } from '@chemisttasker/shared-core';
import { getAccessToken, refreshCookieSession } from '../utils/tokenService';

let configured = false;

const normalizeApiBaseUrl = (value: string) => {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

export function initSharedCoreApi() {
  if (configured) return;
  const baseURL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL || '');
  if (!baseURL) {
    throw new Error('VITE_API_URL is not defined');
  }
  configureStorage({
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
    removeItem: (key: string) => localStorage.removeItem(key),
  });
  configureApi({
    baseURL,
    credentials: 'include',
    getToken: async () => {
      const existing = getAccessToken();
      if (existing) return existing;
      const refreshed = await refreshCookieSession();
      return refreshed?.access ?? null;
    },
  });
  configured = true;
}
