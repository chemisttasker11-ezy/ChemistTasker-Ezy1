import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const APP_LOCK_CHANGED = 'ct-app-lock-preference-changed';
export type AppLockDelay = 0 | 30 | 60 | 300;
export type AppLockPreferenceStatus = 'ok' | 'missing' | 'unreadable';

export type AppLockPreference = {
  enabled: boolean;
  delaySeconds: AppLockDelay;
  status: AppLockPreferenceStatus;
  error?: string;
};

export const key = (userId: number | string) =>
  'ct.mobile.app-lock.v1.' + String(userId).replace(/[^A-Za-z0-9_-]/g, '_');

export function validDelay(value: unknown): value is AppLockDelay {
  return value === 0 || value === 30 || value === 60 || value === 300;
}

export function needsUnlock(
  backgroundedAt: number | null,
  foregroundedAt: number,
  delaySeconds: AppLockDelay
): boolean {
  if (backgroundedAt === null || !Number.isFinite(backgroundedAt)) return true;
  return foregroundedAt - backgroundedAt >= delaySeconds * 1000;
}

export async function getAppLockPreference(userId: number | string): Promise<AppLockPreference> {
  try {
    const data = await AsyncStorage.getItem(key(userId));
    if (data === null || data === undefined) {
      return { enabled: false, delaySeconds: 60, status: 'missing' };
    }
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { enabled: false, delaySeconds: 60, status: 'unreadable', error: 'Invalid preference shape' };
    }
    if (typeof parsed.enabled !== 'boolean' || !validDelay(parsed.delaySeconds)) {
      return { enabled: false, delaySeconds: 60, status: 'unreadable', error: 'Invalid preference values' };
    }
    return {
      enabled: parsed.enabled,
      delaySeconds: parsed.delaySeconds,
      status: 'ok',
    };
  } catch (err: any) {
    return {
      enabled: false,
      delaySeconds: 60,
      status: 'unreadable',
      error: err?.message || 'Storage read failure',
    };
  }
}

export async function setAppLockPreference(
  userId: number | string,
  value: { enabled: boolean; delaySeconds: AppLockDelay }
): Promise<void> {
  await AsyncStorage.setItem(
    key(userId),
    JSON.stringify({
      enabled: value.enabled === true,
      delaySeconds: validDelay(value.delaySeconds) ? value.delaySeconds : 60,
    })
  );
}

// ---------------------------------------------------------------------------
// Central Coordinator & Session Actions
// ---------------------------------------------------------------------------
export type AppLockCoordinatorStatus = 'idle' | 'uncertain' | 'locked' | 'unlocked' | 'unreadable';

export type AppLockCoordinatorState = {
  isLocked: boolean;
  hidden: boolean;
  status: AppLockCoordinatorStatus;
  activeUserId: number | string | null;
  error?: string;
};

export type AppLockActions = {
  unlock: () => Promise<boolean>;
  signInWithPassword: () => Promise<void>;
  retryPolicy: () => Promise<void>;
};

let coordinatorState: AppLockCoordinatorState = {
  isLocked: false,
  hidden: false,
  status: 'idle',
  activeUserId: null,
  error: '',
};

let activeSessionActions: AppLockActions | null = null;
const coordinatorListeners = new Set<() => void>();

export function registerAppLockActions(actions: AppLockActions | null): void {
  activeSessionActions = actions;
}

export function getAppLockActions(): AppLockActions | null {
  return activeSessionActions;
}

export function getAppLockState(): AppLockCoordinatorState {
  return coordinatorState;
}

export function setAppLockCoordinatorState(next: Partial<AppLockCoordinatorState>): void {
  coordinatorState = { ...coordinatorState, ...next };
  coordinatorListeners.forEach(listener => {
    try { listener(); } catch { /* ignore */ }
  });
}

export function subscribeToAppLock(listener: () => void): () => void {
  coordinatorListeners.add(listener);
  return () => { coordinatorListeners.delete(listener); };
}

export function useAppLockState(): AppLockCoordinatorState {
  return useSyncExternalStore(subscribeToAppLock, getAppLockState, getAppLockState);
}

export function resetAppLockCoordinator(expectedUserId?: number | string | null): void {
  if (expectedUserId != null && coordinatorState.activeUserId !== expectedUserId) {
    return;
  }
  coordinatorState = {
    isLocked: false,
    hidden: false,
    status: 'idle',
    activeUserId: null,
    error: '',
  };
  coordinatorListeners.forEach(listener => {
    try { listener(); } catch { /* ignore */ }
  });
}

// ---------------------------------------------------------------------------
// Serialized OS App-Switcher Protection (expo-screen-capture)
// ---------------------------------------------------------------------------
const SCREEN_CAPTURE_KEY = 'ct-app-lock';
let nativeProtectionActive = false;
let protectionGeneration = 0;
let protectionQueue: Promise<boolean> = Promise.resolve(false);

export function isNativeProtectionActive(): boolean {
  return nativeProtectionActive;
}

async function invokeNativeProtection(enabled: boolean): Promise<boolean> {
  if (Platform.OS === 'web') {
    nativeProtectionActive = false;
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ScreenCapture = require('expo-screen-capture');
    if (!ScreenCapture) {
      nativeProtectionActive = false;
      return false;
    }
    if (enabled) {
      if (Platform.OS === 'ios' && typeof ScreenCapture.enableAppSwitcherProtectionAsync === 'function') {
        await ScreenCapture.enableAppSwitcherProtectionAsync();
        nativeProtectionActive = true;
        return true;
      }
      if (Platform.OS === 'android' && typeof ScreenCapture.preventScreenCaptureAsync === 'function') {
        await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY);
        nativeProtectionActive = true;
        return true;
      }
    } else {
      if (Platform.OS === 'ios' && typeof ScreenCapture.disableAppSwitcherProtectionAsync === 'function') {
        await ScreenCapture.disableAppSwitcherProtectionAsync();
        nativeProtectionActive = false;
        return true;
      }
      if (Platform.OS === 'android' && typeof ScreenCapture.allowScreenCaptureAsync === 'function') {
        await ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY);
        nativeProtectionActive = false;
        return true;
      }
    }
  } catch {
    nativeProtectionActive = false;
  }
  return false;
}

export async function setNativeAppSwitcherProtection(enabled: boolean): Promise<boolean> {
  const gen = ++protectionGeneration;
  protectionQueue = protectionQueue.then(async () => {
    if (gen !== protectionGeneration) {
      return nativeProtectionActive;
    }
    return invokeNativeProtection(enabled);
  });
  return protectionQueue;
}
