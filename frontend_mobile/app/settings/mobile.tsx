import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActivityIndicator, Button, Card, Divider, SegmentedButtons, Switch, Text } from 'react-native-paper';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import { useAuth } from '@/context/AuthContext';
import { colors, radius, space } from '@/constants/tokens';
import { getAppLockPreference, setAppLockPreference, validDelay, type AppLockDelay } from '@/utils/appLock';
import { fetchMobileAppConfig, getInstalledAppVersion, decideAppUpdate } from '@/utils/appUpdates';
import {
  authenticateWithDeviceLock, disableBiometricLogin, enableBiometricLogin,
  getBiometricAvailability, getSavedBiometricUser,
} from '@/utils/biometricAuth';

type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unknown';

export default function MobileSettings() {
  const router = useRouter();
  const { user } = useAuth();
  const [biometricLabel, setBiometricLabel] = useState('device authentication');
  const [deviceAvailable, setDeviceAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<PermissionStatus>('unknown');
  const [cameraStatus, setCameraStatus] = useState<PermissionStatus>('unknown');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [versionStatus, setVersionStatus] = useState('');
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [appLockDelay, setAppLockDelay] = useState<AppLockDelay>(60);
  const [message, setMessage] = useState('');
  const userId = user?.id;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [availability, configuredUser, notification, camera] = await Promise.all([
        getBiometricAvailability(),
        getSavedBiometricUser(),
        Notifications.getPermissionsAsync(),
        Camera.getCameraPermissionsAsync(),
      ]);
      setBiometricLabel(availability.label);
      setDeviceAvailable(availability.available);
      // A remembered account must never be displayed as enabled for another account.
      setBiometricEnabled(availability.available && userId != null && configuredUser?.id === userId);
      setNotificationStatus(notification.status);
      setCameraStatus(camera.status);
    } catch { setMessage('Some permissions could not be loaded. Check your device Settings.'); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    if (userId == null) return () => { active = false; };
    void getAppLockPreference(userId).then(value => {
      if (active) { setAppLockEnabled(value.enabled); setAppLockDelay(value.delaySeconds); }
    });
    return () => { active = false; };
  }, [userId]);

  const updateAppLock = async (enabled: boolean, delay: AppLockDelay = appLockDelay) => {
    if (userId == null || busy || Platform.OS === 'web') return;
    setBusy(true); setMessage('');
    try {
      if (!await authenticateWithDeviceLock()) {
        setMessage('Your device passcode or biometric verification is required to change app lock.');
        return;
      }
      await setAppLockPreference(userId, { enabled, delaySeconds: delay });
      setAppLockEnabled(enabled);
      setAppLockDelay(delay);
      setMessage('App lock preference saved. The new setting applies the next time the app opens.');
    } catch { setMessage('App lock setting could not be saved. Try again.'); }
    finally { setBusy(false); }
  };

  const configureBiometric = async (enabled: boolean) => {
    if (!user || busy) return;
    setBusy(true); setMessage('');
    try {
      if (enabled) {
        if (!deviceAvailable || !await authenticateWithDeviceLock()) {
          setMessage('Device authentication was not completed. No changes were saved.');
          return;
        }
        await enableBiometricLogin({ id: user.id, email: user.email, name: user.first_name || user.email });
      } else {
        if (!await authenticateWithDeviceLock()) {
          setMessage('Device verification is required before changing fast sign-in.');
          return;
        }
        await disableBiometricLogin();
      }
      await refresh();
      setMessage(enabled ? 'Fast sign-in enabled for this account.' : 'Fast sign-in disabled on this device.');
    } catch { setMessage('Unable to update fast sign-in. Retry or use password sign-in.'); }
    finally { setBusy(false); }
  };

  const enableNotifications = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await Notifications.requestPermissionsAsync();
      setNotificationStatus(response.status);
      if (response.status !== 'granted') setMessage('You can change notification permission in your device settings.');
      else setMessage('Notifications are allowed on this device. Your existing account alert rules still apply.');
    } catch { setMessage('Could not request notification permission.'); }
    finally { setBusy(false); }
  };

  const checkVersion = async () => {
    setBusy(true); setVersionStatus('');
    try {
      const installed = getInstalledAppVersion();
      const remote = await fetchMobileAppConfig();
      const choice = decideAppUpdate(remote, installed);
      if (choice.type === 'none') setVersionStatus('No newer store build is advertised. Expo updates are also checked on app launch and resume.');
      else if (choice.type === 'store-optional' || choice.type === 'store-required') {
        setVersionStatus(choice.type === 'store-required' ? 'A required store update is available.' : 'A newer store build is available.');
      } else setVersionStatus('An over-the-air update may be available when the app resumes.');
    } catch { setVersionStatus('Could not check for updates. Try again online.'); }
    finally { setBusy(false); }
  };

  const openSystemSettings = async () => {
    try { await Linking.openSettings(); }
    catch { setMessage('Device settings could not be opened automatically.'); }
  };

  return <SafeAreaView style={styles.page} edges={['top','left','right','bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Button icon="arrow-left" mode="text" onPress={() => router.back()}>Back</Button>
      <Text variant="headlineMedium" style={styles.heading}>Mobile settings</Text>
      <Text style={styles.muted}>Your device controls camera, location and notifications. ChemistTasker only requests permissions when the corresponding feature needs them.</Text>
      {loading ? <ActivityIndicator accessibilityLabel="Loading mobile security settings" /> : null}
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>Sign-in security</Text>
        <Text style={styles.muted}>Use {biometricLabel} for faster login with an existing valid session. Your password and all account verification rules remain required when the session expires.</Text>
        <View style={styles.row}><View style={styles.copy}>
          <Text variant="titleMedium">Fast sign-in</Text>
          <Text style={styles.muted}>{deviceAvailable ? 'Device biometrics or system passcode fallback' : 'Set up biometrics in device Settings to enable'}</Text>
        </View><Switch value={biometricEnabled} disabled={busy || loading || !deviceAvailable} onValueChange={(value) => void configureBiometric(value)} /></View>
        <Button mode="outlined" onPress={() => void openSystemSettings()}>Manage device PIN, Face ID or fingerprint</Button>
        <Text style={styles.muted}>Attendance kiosk PINs are separate, pharmacy-specific credentials. They do not unlock your app account.</Text>
        <Button mode="text" onPress={() => router.push('/attendance-pin' as any)}>Manage attendance PIN</Button>
      </Card.Content></Card>
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>Automatic app lock</Text>
        <Text style={styles.muted}>Require device authentication after inactivity. The screen is covered in the app switcher. This does not replace server session expiry or password verification.</Text>
        <View style={styles.row}><Text style={styles.copy}>Lock when returning to the app</Text>
          <Switch value={appLockEnabled} disabled={busy || loading || Platform.OS === 'web'} onValueChange={value => void updateAppLock(value)} />
        </View>
        {appLockEnabled ? <SegmentedButtons value={String(appLockDelay)} onValueChange={value => {
          const seconds = Number(value);
          if (validDelay(seconds)) void updateAppLock(true, seconds);
        }} buttons={[{ value: '0', label: 'Now' }, { value: '30', label: '30s' }, { value: '60', label: '1m' }, { value: '300', label: '5m' }]} /> : null}
        <Text style={styles.muted}>If authentication fails, use the password option to sign out and sign in again.</Text>
      </Card.Content></Card>
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>Notifications</Text>
        <Text style={styles.muted}>Device permission: {notificationStatus}. iOS and Android manage notification categories, sound and delivery. Pharmacy and shift permissions remain server controlled.</Text>
        {notificationStatus === 'undetermined' ? <Button mode="contained" disabled={busy} onPress={() => void enableNotifications()}>Allow notifications</Button> : null}
        <Button mode="outlined" onPress={() => void openSystemSettings()}>Manage notification permissions</Button>
      </Card.Content></Card>
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>Camera, location and kiosk</Text>
        <Text style={styles.muted}>Camera permission: {cameraStatus}. Camera access is requested at the attendance or QR scanning screen, never from this settings page.</Text>
        <Text style={styles.muted}>Location access is optional. QR kiosk attendance uses the scanned token and server-side eligibility, not continuous GPS tracking.</Text>
        <Button mode="outlined" onPress={() => void openSystemSettings()}>Review camera and location permissions</Button>
        <Button mode="text" onPress={() => router.push('/attendance/clock' as any)}>Open attendance QR scanner</Button>
      </Card.Content></Card>
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>App version</Text>
        <Text style={styles.muted}>Installed: {getInstalledAppVersion() || 'Unknown'}</Text>
        <Button mode="outlined" disabled={busy} loading={busy} onPress={() => void checkVersion()}>Check for app updates</Button>
        {versionStatus ? <Text accessibilityRole="alert" style={styles.muted}>{versionStatus}</Text> : null}
      </Card.Content></Card>
      {message ? <Text accessibilityRole="alert" style={styles.muted}>{message}</Text> : null}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  heading: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  card: { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceBg },
  group: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  copy: { flex: 1, gap: space.xs },
});
