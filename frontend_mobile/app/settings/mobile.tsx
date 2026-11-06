import { ResponsiveSegmentedButtons as SegmentedButtons } from '@/components/ui/ResponsiveSegmentedButtons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Chip, Divider, Switch, Text, TextInput } from 'react-native-paper';
import { BrandActivityIndicator as ActivityIndicator } from '@/components/ui/BrandActivityIndicator';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import { useAuth } from '@/context/AuthContext';
import { getNotificationPushPreferences, updateNotificationPushPreferences, type NotificationPushPreferences } from '@chemisttasker/shared-core';
import { colors, radius, space } from '@/constants/tokens';
import { APP_LOCK_CHANGED, getAppLockPreference, setAppLockPreference, validDelay, type AppLockDelay } from '@/utils/appLock';
import { fetchMobileAppConfig, getInstalledAppVersion, decideAppUpdate } from '@/utils/appUpdates';
import {
  authenticateWithDeviceLock, disableBiometricLogin, enableBiometricLogin,
  getBiometricAvailability, getSavedBiometricUser,
} from '@/utils/biometricAuth';

type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unknown';

function MobileSettingsContent({ user }: { user: any }) {
  const router = useRouter();
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
  const [policyLoading, setPolicyLoading] = useState(false);
  const [appLockLoadError, setAppLockLoadError] = useState('');
  const [pushPrefs, setPushPrefs] = useState<NotificationPushPreferences | null>(null);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushError, setPushError] = useState('');
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [message, setMessage] = useState('');
  const userId = user?.id;
  const policyGenRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      policyGenRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [availability, configuredUser, notification, camera] = await Promise.all([
        getBiometricAvailability(),
        getSavedBiometricUser(),
        Notifications.getPermissionsAsync(),
        Camera.getCameraPermissionsAsync(),
      ]);
      if (!aliveRef.current) return;
      setBiometricLabel(availability.label);
      setDeviceAvailable(availability.available);
      setBiometricEnabled(availability.available && userId != null && configuredUser?.id === userId);
      setNotificationStatus(notification.status);
      setCameraStatus(camera.status);
    } catch { if (aliveRef.current) setMessage('Some permissions could not be loaded. Check your device Settings.'); }
    finally { if (aliveRef.current) setLoading(false); }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadAppLockPolicy = useCallback(async (activeUserId: number | string) => {
    const gen = ++policyGenRef.current;
    setPolicyLoading(true);
    setAppLockLoadError('');
    try {
      const value = await getAppLockPreference(activeUserId);
      if (!aliveRef.current || policyGenRef.current !== gen) return;
      if (value.status === 'unreadable') {
        setAppLockLoadError('Security preferences could not be verified on this device.');
        return;
      }
      setAppLockEnabled(value.enabled);
      setAppLockDelay(value.delaySeconds);
    } catch {
      if (!aliveRef.current || policyGenRef.current !== gen) return;
      setAppLockLoadError('Security preferences could not be verified on this device.');
    } finally {
      if (aliveRef.current && policyGenRef.current === gen) {
        setPolicyLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (userId == null) {
      setAppLockEnabled(false);
      setAppLockLoadError('');
      return;
    }
    void loadAppLockPolicy(userId);
  }, [userId, loadAppLockPolicy]);

  useEffect(() => {
    let active = true;
    setPushPrefs(null); setPushLoading(true); setPushError('');
    if (userId == null) return () => { active = false; };
    void getNotificationPushPreferences().then(value => {
      if (!active) return;
      setPushPrefs(value);
      setQuietStart(String(value.quiet_start).slice(0,5));
      setQuietEnd(String(value.quiet_end).slice(0,5));
    }).catch(() => { if (active) setPushError('Could not load push preferences. Retry from this screen.'); })
      .finally(() => { if (active) setPushLoading(false); });
    return () => { active = false; };
  }, [userId]);

  const savePush = async (values: Partial<NotificationPushPreferences>) => {
    if (userId == null || busy || !pushPrefs) return;
    setBusy(true); setPushError('');
    try {
      const next = await updateNotificationPushPreferences(values);
      if (!aliveRef.current) return;
      setPushPrefs(next);
      setQuietStart(String(next.quiet_start).slice(0,5));
      setQuietEnd(String(next.quiet_end).slice(0,5));
    } catch (failure: any) {
      if (!aliveRef.current) return;
      setPushError(failure?.response?.data?.detail || failure?.message || 'Push preference could not be saved.');
    } finally { if (aliveRef.current) setBusy(false); }
  };

  const updateAppLock = async (enabled: boolean, delay: AppLockDelay = appLockDelay) => {
    if (userId == null || busy || Platform.OS === 'web') return;
    const gen = ++policyGenRef.current;
    setBusy(true); setMessage(''); setAppLockLoadError('');
    try {
      const authed = await authenticateWithDeviceLock();
      if (!aliveRef.current || policyGenRef.current !== gen) return;
      if (!authed) {
        setAppLockLoadError('Device passcode or biometric verification was cancelled.');
        setMessage('Your device passcode or biometric verification is required to change app lock.');
        return;
      }
      await setAppLockPreference(userId, { enabled, delaySeconds: delay });
      if (!aliveRef.current || policyGenRef.current !== gen) return;
      DeviceEventEmitter.emit(APP_LOCK_CHANGED, userId);
      setAppLockEnabled(enabled);
      setAppLockDelay(delay);
      setMessage('App lock preference saved. The new setting applies the next time the app opens.');
    } catch {
      if (!aliveRef.current || policyGenRef.current !== gen) return;
      setAppLockLoadError('App lock preference could not be saved. Try again.');
      setMessage('App lock setting could not be saved. Try again.');
    } finally {
      if (aliveRef.current && policyGenRef.current === gen) {
        setBusy(false);
      }
    }
  };

  const configureBiometric = async (enabled: boolean) => {
    if (!user || busy) return;
    const gen = ++policyGenRef.current;
    setBusy(true); setMessage('');
    try {
      if (enabled) {
        const authed = deviceAvailable && (await authenticateWithDeviceLock());
        if (!aliveRef.current || policyGenRef.current !== gen) return;
        if (!authed) {
          setMessage('Device authentication was not completed. No changes were saved.');
          return;
        }
        await enableBiometricLogin({ id: user.id, email: user.email, name: user.first_name || user.email });
      } else {
        const authed = await authenticateWithDeviceLock();
        if (!aliveRef.current || policyGenRef.current !== gen) return;
        if (!authed) {
          setMessage('Device verification is required before changing fast sign-in.');
          return;
        }
        await disableBiometricLogin();
      }
      if (!aliveRef.current || policyGenRef.current !== gen) return;
      await refresh();
      setMessage(enabled ? 'Fast sign-in enabled for this account.' : 'Fast sign-in disabled on this device.');
    } catch {
      if (!aliveRef.current || policyGenRef.current !== gen) return;
      setMessage('Unable to update fast sign-in. Retry or use password sign-in.');
    } finally {
      if (aliveRef.current && policyGenRef.current === gen) {
        setBusy(false);
      }
    }
  };

  const enableNotifications = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await Notifications.requestPermissionsAsync();
      if (!aliveRef.current) return;
      setNotificationStatus(response.status);
      if (response.status !== 'granted') setMessage('You can change notification permission in your device settings.');
      else setMessage('Notifications are allowed on this device. Your existing account alert rules still apply.');
    } catch { if (aliveRef.current) setMessage('Could not request notification permission.'); }
    finally { if (aliveRef.current) setBusy(false); }
  };

  const checkVersion = async () => {
    setBusy(true); setVersionStatus('');
    try {
      const installed = getInstalledAppVersion();
      const remote = await fetchMobileAppConfig();
      if (!remote) throw new Error('Update configuration unavailable');
      const choice = decideAppUpdate(remote, installed);
      if (!aliveRef.current) return;
      if (choice.type === 'none') setVersionStatus('No newer store build is advertised. Expo updates are also checked on app launch and resume.');
      else if (choice.type === 'store-optional' || choice.type === 'store-required') {
        setVersionStatus(choice.type === 'store-required' ? 'A required store update is available.' : 'A newer store build is available.');
      } else setVersionStatus('An over-the-air update may be available when the app resumes.');
    } catch { if (aliveRef.current) setVersionStatus('Could not check for updates. Try again online.'); }
    finally { if (aliveRef.current) setBusy(false); }
  };

  const openSystemSettings = async () => {
    try { await Linking.openSettings(); }
    catch { setMessage('Device settings could not be opened automatically.'); }
  };

  const lockControlsDisabled = busy || loading || policyLoading || Platform.OS === 'web' || !!appLockLoadError;

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
        </View><Switch value={biometricEnabled} disabled={busy || loading || !deviceAvailable} onValueChange={(value) => void configureBiometric(value)} accessibilityLabel="Fast sign-in" /></View>
        <Button mode="outlined" onPress={() => void openSystemSettings()}>Manage device PIN, Face ID or fingerprint</Button>
        <Text style={styles.muted}>Attendance kiosk PINs are separate, pharmacy-specific credentials. They do not unlock your app account.</Text>
        <Button mode="text" onPress={() => router.push('/attendance-pin' as any)}>Manage attendance PIN</Button>
      </Card.Content></Card>
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>Automatic app lock</Text>
        <Text style={styles.muted}>Require device authentication after inactivity. The screen is covered in the app switcher. This does not replace server session expiry or password verification.</Text>
        {appLockLoadError ? <View style={styles.errorRow}>
          <Text accessibilityRole="alert" style={styles.warning}>{appLockLoadError}</Text>
          <Button mode="text" compact onPress={() => { if (userId != null) void loadAppLockPolicy(userId); }}>Retry</Button>
        </View> : null}
        <View style={styles.row}><Text style={styles.copy}>Lock when returning to the app</Text>
          <Switch value={appLockEnabled} disabled={lockControlsDisabled} onValueChange={value => void updateAppLock(value)} accessibilityLabel="Lock when returning to the app" />
        </View>
        {appLockEnabled ? <SegmentedButtons value={String(appLockDelay)} onValueChange={value => {
          const seconds = Number(value);
          if (validDelay(seconds)) void updateAppLock(true, seconds);
        }} buttons={[{ value: '0', label: 'Now', disabled: lockControlsDisabled }, { value: '30', label: '30 seconds', disabled: lockControlsDisabled }, { value: '60', label: '1 minute', disabled: lockControlsDisabled }, { value: '300', label: '5 minutes', disabled: lockControlsDisabled }]} /> : null}
        <Text style={styles.muted}>If authentication fails, use the password option to sign out and sign in again.</Text>
      </Card.Content></Card>
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>Notifications</Text>
        <Text style={styles.muted}>Device permission: {notificationStatus}. iOS and Android manage notification categories, sound and delivery. Pharmacy and shift permissions remain server controlled.</Text>
        {notificationStatus === 'undetermined' ? <Button mode="contained" disabled={busy} onPress={() => void enableNotifications()}>Allow notifications</Button> : null}
        <Button mode="outlined" onPress={() => void openSystemSettings()}>Manage notification permissions</Button>
      </Card.Content></Card>
      <Card mode="outlined" style={styles.card}><Card.Content style={styles.group}>
        <Text variant="titleLarge" style={styles.heading}>Push notification preferences</Text>
        <Text style={styles.muted}>These preferences control Expo push delivery for your account. Messages, shift tasks, work notes and alerts are saved separately on the server. In-app notifications remain available even when push is muted.</Text>
        {pushLoading ? <ActivityIndicator accessibilityLabel="Loading push preferences" /> : null}
        {pushError ? <Text accessibilityRole="alert" style={styles.warning}>{pushError}</Text> : null}
        {pushPrefs ? <>
          {([
            ['push_messages', 'Messages'],
            ['push_tasks', 'Shift and work tasks'],
            ['push_work_notes', 'Work notes'],
            ['push_alerts', 'Urgent and system alerts'],
          ] as const).map(([field,label]) => (
            <View style={styles.row} key={field}>
              <Text style={styles.copy}>{label}</Text>
              <Switch value={pushPrefs[field]} disabled={busy} onValueChange={value => void savePush({ [field]: value })} accessibilityLabel={`Push notifications for ${label}`} />
            </View>
          ))}
          <Divider />
          <View style={styles.row}>
            <Text style={styles.copy}>Quiet hours (non-alert push only)</Text>
            <Switch value={pushPrefs.quiet_hours_enabled} disabled={busy} onValueChange={value => void savePush({ quiet_hours_enabled: value })} accessibilityLabel="Enable quiet hours" />
          </View>
          {pushPrefs.quiet_hours_enabled ? <>
            <Text style={styles.muted}>Quiet hours mute ordinary pushes immediately; they are not queued for later. Alerts remain exempt from quiet hours when enabled above.</Text>
            <View style={styles.row}>
              <TextInput mode="outlined" label="Start HH:mm" style={styles.copy} value={quietStart} onChangeText={setQuietStart} disabled={busy} maxLength={5} />
              <TextInput mode="outlined" label="End HH:mm" style={styles.copy} value={quietEnd} onChangeText={setQuietEnd} disabled={busy} maxLength={5} />
            </View>
            <Text style={styles.muted}>Time zone: {pushPrefs.time_zone}</Text>
            <View style={styles.zones}>
              {['Australia/Brisbane','Australia/Sydney','Australia/Melbourne','Australia/Hobart','Australia/Adelaide','Australia/Perth','Australia/Darwin'].map(zone =>
                <Chip key={zone} selected={pushPrefs.time_zone===zone} disabled={busy} onPress={() => void savePush({time_zone:zone})}>
                  {zone.replace('Australia/','')}
                </Chip>
              )}
            </View>
            <Button mode="contained" disabled={busy || !/^\d{2}:\d{2}$/.test(quietStart) || !/^\d{2}:\d{2}$/.test(quietEnd) || quietStart===quietEnd} onPress={() => void savePush({quiet_start:quietStart,quiet_end:quietEnd})}>
              Save quiet hours
            </Button>
          </> : null}
        </> : null}
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

export default function MobileSettings() {
  const { user } = useAuth();
  const accountKey = user ? `${user.id}:${user.role || 'no-role'}` : 'anonymous';
  return <MobileSettingsContent key={accountKey} user={user} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.pageBg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space['3xl'] },
  heading: { color: colors.textPrimary, fontWeight: '700' },
  muted: { color: colors.textSecondary, lineHeight: 22 },
  card: { borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.surfaceBg },
  group: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  copy: { flex: 1, gap: space.xs },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  warning: { color: colors.status.red.fg },
});
