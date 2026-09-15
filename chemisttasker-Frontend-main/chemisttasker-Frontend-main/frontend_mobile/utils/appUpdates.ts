import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_BASE_URL } from '@/constants/api';

type MobileAppConfigResponse = {
  latest_version?: string;
  minimum_supported_version?: string;
  android_store_url?: string;
  ios_store_url?: string;
};

const IOS_APP_STORE_ID = (process.env.EXPO_PUBLIC_IOS_APP_STORE_ID || '').trim();

function parseVersionParts(value?: string | null): number[] {
  return String(value || '')
    .split('.')
    .map((part) => {
      const match = part.match(/\d+/);
      return match ? Number(match[0]) : 0;
    });
}

export function compareVersions(left?: string | null, right?: string | null): number {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  const maxLength = Math.max(a.length, b.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = a[index] ?? 0;
    const rightValue = b[index] ?? 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

export function getInstalledAppVersion(): string {
  const nativeVersion = (Constants as { nativeAppVersion?: string | null })?.nativeAppVersion;
  if (typeof nativeVersion === 'string' && nativeVersion.trim()) {
    return nativeVersion.trim();
  }

  const expoVersion = Constants?.expoConfig?.version;
  return typeof expoVersion === 'string' ? expoVersion : '';
}

export function getStoreUrl(config: MobileAppConfigResponse): string {
  if (Platform.OS === 'android') {
    const configuredUrl = (config.android_store_url || '').trim();
    if (configuredUrl) return configuredUrl;

    const packageName = Constants?.expoConfig?.android?.package || 'com.chemisttasker.app';
    return `https://play.google.com/store/apps/details?id=${packageName}`;
  }

  const configuredUrl = (config.ios_store_url || '').trim();
  if (configuredUrl) return configuredUrl;
  if (IOS_APP_STORE_ID) return `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`;
  return '';
}

export async function fetchMobileAppConfig(): Promise<MobileAppConfigResponse | null> {
  if (!API_BASE_URL) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/users/mobile/app-config/`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }

    return (await response.json()) as MobileAppConfigResponse;
  } catch (error) {
    console.warn('Failed to fetch mobile app config', error);
    return null;
  }
}

export type AppUpdateDecision =
  | { type: 'none' }
  | { type: 'store-required'; storeUrl: string }
  | { type: 'store-optional'; storeUrl: string }
  | { type: 'ota' };

export function decideAppUpdate(config: MobileAppConfigResponse | null, installedVersion: string): AppUpdateDecision {
  if (!config || !installedVersion) {
    return { type: 'none' };
  }

  const minimumSupportedVersion = (config.minimum_supported_version || '').trim();
  const latestVersion = (config.latest_version || '').trim();
  const storeUrl = getStoreUrl(config);

  if (minimumSupportedVersion && compareVersions(installedVersion, minimumSupportedVersion) < 0 && storeUrl) {
    return { type: 'store-required', storeUrl };
  }

  if (latestVersion && compareVersions(installedVersion, latestVersion) < 0 && storeUrl) {
    return { type: 'store-optional', storeUrl };
  }

  return { type: 'none' };
}
