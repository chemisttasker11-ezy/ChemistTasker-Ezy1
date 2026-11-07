import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter, Platform, StyleSheet, View } from 'react-native';
import { Button, Portal, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authenticateWithDeviceLock } from '@/utils/biometricAuth';
import {
  APP_LOCK_CHANGED,
  getAppLockPreference,
  needsUnlock,
  registerAppLockActions,
  resetAppLockCoordinator,
  setAppLockCoordinatorState,
  setNativeAppSwitcherProtection,
  type AppLockPreference,
} from '@/utils/appLock';
import { colors, space } from '@/constants/tokens';
import { BrandLoader } from '@/components/ui/BrandLoader';

function ScopedLock({ userId }: { userId: number }) {
  const router = useRouter();
  const { logout } = useAuth();
  const [pref, setPref] = useState<AppLockPreference | null>(null);
  const [locked, setLocked] = useState(true);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const backgroundAt = useRef<number | null>(null);
  const attemptingRef = useRef(false);
  const busyRef = useRef(false);
  const prefRef = useRef<AppLockPreference | null>(null);
  const generationRef = useRef(0);
  const unmountedRef = useRef(false);

  const applyPreference = useCallback((value: AppLockPreference, gen: number) => {
    if (unmountedRef.current || generationRef.current !== gen) return;
    prefRef.current = value;
    setPref(value);
    if (value.status === 'unreadable') {
      setLocked(true);
      setHidden(false);
      const msg = 'Security settings could not be verified on this device.';
      setError(msg);
      setAppLockCoordinatorState({ isLocked: true, hidden: false, status: 'unreadable', activeUserId: userId, error: msg });
      return;
    }
    setError('');
    if (!value.enabled) {
      setLocked(false);
      setHidden(false);
      setAppLockCoordinatorState({ isLocked: false, hidden: false, status: 'unlocked', activeUserId: userId, error: '' });
      void setNativeAppSwitcherProtection(false);
      return;
    }
    setLocked(true);
    setHidden(false);
    setAppLockCoordinatorState({ isLocked: true, hidden: false, status: 'locked', activeUserId: userId, error: '' });
    void setNativeAppSwitcherProtection(true);
  }, [userId]);

  const loadPolicy = useCallback(async () => {
    const gen = ++generationRef.current;
    busyRef.current = true;
    setBusy(true);
    setAppLockCoordinatorState({ isLocked: true, hidden: true, status: 'uncertain', activeUserId: userId, error: '' });
    try {
      const value = await getAppLockPreference(userId);
      applyPreference(value, gen);
    } catch (err: any) {
      applyPreference({
        enabled: false,
        delaySeconds: 60,
        status: 'unreadable',
        error: err?.message || 'Failed to load policy',
      }, gen);
    } finally {
      if (!unmountedRef.current && generationRef.current === gen) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [userId, applyPreference]);

  const unlock = useCallback(async (): Promise<boolean> => {
    if (busyRef.current || attemptingRef.current) return false;
    busyRef.current = true;
    attemptingRef.current = true;
    setBusy(true);
    setError('');
    const gen = generationRef.current;
    try {
      const valid = await authenticateWithDeviceLock();
      if (unmountedRef.current || generationRef.current !== gen) return false;
      if (valid) {
        setLocked(false);
        setAppLockCoordinatorState({ isLocked: false, status: 'unlocked', activeUserId: userId, error: '' });
        return true;
      }
      const msg = 'Device authentication was cancelled. The app remains locked.';
      setError(msg);
      setAppLockCoordinatorState({ isLocked: true, status: 'locked', activeUserId: userId, error: msg });
      return false;
    } catch {
      if (unmountedRef.current || generationRef.current !== gen) return false;
      const msg = 'Device authentication failed. Retry or sign in with your password.';
      setError(msg);
      setAppLockCoordinatorState({ isLocked: true, status: 'locked', activeUserId: userId, error: msg });
      return false;
    } finally {
      attemptingRef.current = false;
      if (!unmountedRef.current && generationRef.current === gen) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [userId]);

  const signInWithPassword = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const gen = generationRef.current;
    try {
      await logout();
      if (unmountedRef.current || generationRef.current !== gen) return;
      void setNativeAppSwitcherProtection(false);
      resetAppLockCoordinator(userId);
      router.replace('/login' as any);
    } catch {
      if (unmountedRef.current || generationRef.current !== gen) return;
      const msg = 'Could not sign out. App remains locked for your privacy. Try again.';
      setError(msg);
      setAppLockCoordinatorState({ isLocked: true, status: 'locked', activeUserId: userId, error: msg });
    } finally {
      if (!unmountedRef.current && generationRef.current === gen) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [logout, router, userId]);

  useEffect(() => {
    unmountedRef.current = false;
    void Promise.resolve().then(() => { if (!unmountedRef.current) return loadPolicy(); });
    return () => {
      unmountedRef.current = true;
      void setNativeAppSwitcherProtection(false);
      resetAppLockCoordinator(userId);
    };
  }, [userId, loadPolicy]);

  useEffect(() => {
    registerAppLockActions({
      unlock,
      signInWithPassword,
      retryPolicy: loadPolicy,
    });
    return () => registerAppLockActions(null);
  }, [unlock, signInWithPassword, loadPolicy]);

  useEffect(() => {
    const prefSubscription = DeviceEventEmitter.addListener(APP_LOCK_CHANGED, (changedId: number) => {
      if (changedId !== userId) return;
      void loadPolicy();
    });
    return () => prefSubscription.remove();
  }, [userId, loadPolicy]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', next => {
      if (attemptingRef.current) return;
      if (next === 'inactive' || next === 'background') {
        if (backgroundAt.current === null) backgroundAt.current = Date.now();
        setHidden(true);
        setAppLockCoordinatorState({ isLocked: true, hidden: true, activeUserId: userId });
      } else if (next === 'active') {
        const previous = backgroundAt.current;
        backgroundAt.current = null;
        const policy = prefRef.current;
        let isNowLocked = locked;
        if (policy?.enabled && policy.status === 'ok') {
          if (needsUnlock(previous, Date.now(), policy.delaySeconds)) {
            isNowLocked = true;
            setLocked(true);
          }
        }
        setHidden(false);
        setAppLockCoordinatorState({
          isLocked: isNowLocked,
          hidden: false,
          status: isNowLocked ? 'locked' : 'unlocked',
          activeUserId: userId,
        });
      }
    });
    return () => sub.remove();
  }, [locked, userId]);

  if (Platform.OS === 'web') return null;

  const isUnreadable = pref?.status === 'unreadable';
  const shouldRenderGate = hidden || pref === null || locked || isUnreadable;

  if (!shouldRenderGate) return null;

  return (
    <Portal>
      <View
        style={styles.overlay}
        accessibilityViewIsModal
        importantForAccessibility="yes"
        accessibilityLabel="ChemistTasker app lock"
      >
        <Text variant="headlineMedium" style={styles.heading}>
          {isUnreadable ? 'Security verification required' : 'ChemistTasker is locked'}
        </Text>
        <Text style={styles.body}>
          {isUnreadable
            ? 'We could not verify your security settings on this device. Retry or sign in with your password to continue.'
            : 'Unlock using your device fingerprint, Face ID or system passcode. Your existing account session and permissions still apply.'}
        </Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {isUnreadable ? (
          <>
            <Button mode="contained" loading={busy} disabled={busy} onPress={() => void loadPolicy()}>
              Retry
            </Button>
            <Button mode="outlined" disabled={busy} onPress={() => void signInWithPassword()}>
              Sign in with password instead
            </Button>
          </>
        ) : hidden ? (
          <BrandLoader size={56} accessibilityLabel="Securing your workspace…" />
        ) : (
          <>
            <Button mode="contained" loading={busy} disabled={busy} onPress={() => void unlock()}>
              Unlock app
            </Button>
            <Button mode="outlined" disabled={busy} onPress={() => void signInWithPassword()}>
              Sign in with password instead
            </Button>
          </>
        )}
      </View>
    </Portal>
  );
}

export default function AppLockGate() {
  const { user } = useAuth();
  useEffect(() => {
    if (Platform.OS === 'web' || user?.id == null) {
      void setNativeAppSwitcherProtection(false);
      resetAppLockCoordinator();
    }
  }, [user?.id]);

  if (Platform.OS === 'web' || user?.id == null) return null;
  return <ScopedLock key={user.id} userId={user.id} />;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 999999,
    elevation: 999999,
    backgroundColor: colors.pageBg,
    justifyContent: 'center',
    padding: space['3xl'],
    gap: space.lg,
  },
  heading: { color: colors.textPrimary, fontWeight: '700' },
  body: { color: colors.textSecondary, lineHeight: 23 },
  error: { color: colors.status.red.fg },
});
