import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLockDelay = 0 | 30 | 60 | 300;
export type AppLockPreference = { enabled: boolean; delaySeconds: AppLockDelay };
const DEFAULT: AppLockPreference = { enabled: false, delaySeconds: 60 };
const key = (userId: number | string) => 'ct.mobile.app-lock.v1.'+String(userId).replace(/[^A-Za-z0-9_-]/g,'_');

export function validDelay(value: unknown): value is AppLockDelay {
 return value === 0 || value === 30 || value === 60 || value === 300;
}
export function needsUnlock(backgroundedAt: number | null, foregroundedAt: number, delaySeconds: AppLockDelay): boolean {
 if (backgroundedAt === null || !Number.isFinite(backgroundedAt)) return true;
 return foregroundedAt - backgroundedAt >= delaySeconds * 1000;
}
export async function getAppLockPreference(userId: number | string): Promise<AppLockPreference> {
 try {
  const data=await AsyncStorage.getItem(key(userId));
  if(!data)return DEFAULT;
  const parsed=JSON.parse(data);
  return {enabled:parsed.enabled===true,delaySeconds:validDelay(parsed.delaySeconds)?parsed.delaySeconds:60};
 } catch {return DEFAULT;}
}
export async function setAppLockPreference(userId: number | string, value: AppLockPreference): Promise<void> {
 await AsyncStorage.setItem(key(userId),JSON.stringify({
  enabled:value.enabled===true,delaySeconds:validDelay(value.delaySeconds)?value.delaySeconds:60,
 }));
}
