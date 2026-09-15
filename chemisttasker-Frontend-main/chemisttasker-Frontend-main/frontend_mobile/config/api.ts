import { configureApi, configureStorage } from '@chemisttasker/shared-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSecureKey, secureGet, secureRemove, secureRemoveMany, secureSet } from '../utils/secureStorage';
import { getValidAccessToken } from '../utils/authSession';

const normalizeApiBaseUrl = (value?: string) => {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

// Configure shared-core to use mobile storage and API endpoint
configureStorage({
  getItem: (key: string) => (isSecureKey(key) ? secureGet(key) : AsyncStorage.getItem(key)),
  setItem: (key: string, value: string) => (isSecureKey(key) ? secureSet(key, value) : AsyncStorage.setItem(key, value)),
  removeItem: (key: string) => (isSecureKey(key) ? secureRemove(key) : AsyncStorage.removeItem(key)),
});
const baseURL = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);
if (!baseURL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Please set it to your backend base URL (e.g., https://yourdomain.com/api).'
  );
}
configureApi({
  baseURL,
  credentials: 'same-origin',
  getToken: async () => {
    return await getValidAccessToken(baseURL);
  },
});
