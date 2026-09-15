import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const SECURE_KEYS = new Set(['ACCESS_KEY', 'REFRESH_KEY']);

export const isSecureKey = (key: string) => SECURE_KEYS.has(key);

const useSecureStore =
  Platform.OS !== 'web' && typeof SecureStore.deleteItemAsync === 'function';

export const secureGet = (key: string) =>
  useSecureStore ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key);

export const secureSet = (key: string, value: string) =>
  useSecureStore ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value);

export const secureRemove = (key: string) =>
  useSecureStore ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key);

export const secureRemoveMany = async (keys: string[]) => {
  await Promise.all(keys.map((key) => secureRemove(key)));
};
