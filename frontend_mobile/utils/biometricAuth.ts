import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY = 'BIOMETRIC_LOGIN_ENABLED';
const BIOMETRIC_USER_KEY = 'BIOMETRIC_LOGIN_USER';

export type BiometricUser = {
  id?: number | null;
  email?: string | null;
  name?: string | null;
};

export type BiometricAvailability = {
  available: boolean;
  label: string;
};

type LocalAuthenticationModule = {
  hasHardwareAsync?: () => Promise<boolean>;
  isEnrolledAsync?: () => Promise<boolean>;
  getEnrolledLevelAsync?: () => Promise<number>;
  supportedAuthenticationTypesAsync?: () => Promise<number[]>;
  authenticateAsync?: (options: {
    promptMessage: string;
    cancelLabel?: string;
    fallbackLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean }>;
};

function getLocalAuthentication(): LocalAuthenticationModule | null {
  try {
    return requireOptionalNativeModule<LocalAuthenticationModule>('ExpoLocalAuthentication');
  } catch {
    return null;
  }
}

function labelForTypes(types: number[]): string {
  if (types.includes(2)) {
    return Platform.OS === 'ios' ? 'Face ID' : 'face unlock';
  }
  if (types.includes(1)) {
    return Platform.OS === 'ios' ? 'Touch ID' : 'fingerprint';
  }
  if (types.includes(3)) {
    return 'biometrics';
  }
  return 'biometrics';
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    if (Platform.OS === 'web') return { available: false, label: 'device authentication' };
    const localAuthentication = getLocalAuthentication();
    if (
      !localAuthentication?.hasHardwareAsync ||
      !localAuthentication.isEnrolledAsync ||
      !localAuthentication.supportedAuthenticationTypesAsync
    ) {
      return { available: false, label: 'biometrics' };
    }

    const [hasHardware, isEnrolled, types, level] = await Promise.all([
      localAuthentication.hasHardwareAsync(),
      localAuthentication.isEnrolledAsync(),
      localAuthentication.supportedAuthenticationTypesAsync(),
      localAuthentication.getEnrolledLevelAsync?.() ?? Promise.resolve(0),
    ]);

    return {
      available: (hasHardware && isEnrolled) || level > 0,
      label: hasHardware && isEnrolled ? labelForTypes(types) : 'device PIN or passcode',
    };
  } catch {
    return { available: false, label: 'biometrics' };
  }
}

export async function authenticateWithBiometrics(label = 'biometrics'): Promise<boolean> {
  const localAuthentication = getLocalAuthentication();
  if (!localAuthentication?.authenticateAsync) {
    return false;
  }

  const result = await localAuthentication.authenticateAsync({
    promptMessage: `Sign in with ${label}`,
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use device passcode',
    disableDeviceFallback: false,
  });
  return result.success;
}

/** Device-owner authentication allows biometrics or the OS screen lock. It does not
 * create a second API login or store a low-entropy application PIN. */
export async function authenticateWithDeviceLock(): Promise<boolean> {
  const localAuthentication = getLocalAuthentication();
  if (!localAuthentication?.authenticateAsync) return false;
  const result = await localAuthentication.authenticateAsync({
    promptMessage: 'Unlock ChemistTasker',
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use device PIN or passcode',
    disableDeviceFallback: false,
  });
  return result.success;
}

export async function enableBiometricLogin(user: BiometricUser): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Device authentication is unavailable on the web.');
  await SecureStore.setItemAsync(BIOMETRIC_USER_KEY, JSON.stringify(user));
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
  await AsyncStorage.multiRemove([BIOMETRIC_ENABLED_KEY, BIOMETRIC_USER_KEY]);
}

export async function disableBiometricLogin(): Promise<void> {
  await AsyncStorage.multiRemove([BIOMETRIC_ENABLED_KEY, BIOMETRIC_USER_KEY]);
  if (Platform.OS !== 'web') await Promise.all([SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY), SecureStore.deleteItemAsync(BIOMETRIC_USER_KEY)]);
}

export async function getSavedBiometricUser(): Promise<BiometricUser | null> {
  try {
    if (Platform.OS === 'web') return null;
    const [enabled, rawUser] = await Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY),
      SecureStore.getItemAsync(BIOMETRIC_USER_KEY),
    ]);
    let value = rawUser;
    if (enabled !== 'true' || !value) {
      const [legacyEnabled, legacyUser] = await Promise.all([AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY), AsyncStorage.getItem(BIOMETRIC_USER_KEY)]);
      if (legacyEnabled !== 'true' || !legacyUser) return null;
      const legacy = JSON.parse(legacyUser) as BiometricUser;
      if (typeof legacy?.email !== 'string' && typeof legacy?.id !== 'number') return null;
      await enableBiometricLogin(legacy);
      value = legacyUser;
    }
    const parsed = JSON.parse(value) as BiometricUser;
    return typeof parsed?.email === 'string' || typeof parsed?.id === 'number' ? parsed : null;
  } catch {
    return null;
  }
}
